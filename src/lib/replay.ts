/**
 * Divergence replay helper.
 *
 * A recorded run keeps a bounded snapshot of its input. This rebuilds a single
 * chat request from that snapshot and applies explicit overrides — model,
 * provider, reasoning effort, temperature and an added context note — so a
 * branch can be compared with the original without guessing what was sent.
 *
 * Tool messages are intentionally dropped: a divergence run is a bounded,
 * single-shot LLM comparison, not a re-execution of side-effecting tools.
 */

import type { ExecutionRun } from "./foundation";

export interface ReplayMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ReplayOverrides {
  provider?: string | null;
  model?: string | null;
  reasoningEffort?: string | null;
  temperature?: number | null;
  contextNote?: string | null;
}

export interface ReplaySpec {
  messages: ReplayMessage[];
  provider: string;
  model: string;
  mode: string;
  reasoningEffort: string | null;
  temperature?: number;
  contextNote: string;
  chatId: string | null;
  prompt: string;
  parentRunId: string;
  replayOf: string;
  divergence: Record<string, unknown>;
}

const ALLOWED_ROLES = new Set(["user", "assistant", "system"]);

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function messagesFrom(value: unknown): ReplayMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ReplayMessage[] => {
    if (!item || typeof item !== "object") return [];
    const m = item as Record<string, unknown>;
    const role = typeof m.role === "string" ? m.role.toLowerCase() : "";
    if (!ALLOWED_ROLES.has(role)) return [];
    const content = typeof m.content === "string" ? m.content.slice(0, 4_000) : "";
    return content ? [{ role: role as ReplayMessage["role"], content }] : [];
  }).slice(-12);
}

function clampTemperature(value: number): number {
  return Math.min(2, Math.max(0, Math.round(value * 100) / 100));
}

/** Build a replay request from a run snapshot plus user-selected overrides. */
export function buildReplaySpec(
  run: ExecutionRun,
  snapshot: Record<string, unknown>,
  overrides: ReplayOverrides,
): ReplaySpec {
  const provider = text(overrides.provider, 80) || text(run.provider, 80) || text(snapshot.provider, 80);
  const model = text(overrides.model, 200) || text(run.model, 200) || text(snapshot.model, 200);
  if (!provider || !model) {
    throw new Error("This run has no recorded provider/model to replay. Pick both explicitly.");
  }

  const mode = text(snapshot.mode, 40) || text(run.mode, 40) || "chat";
  const originalEffort = typeof snapshot.reasoningEffort === "string" ? snapshot.reasoningEffort : null;
  const reasoningEffort = overrides.reasoningEffort === undefined
    ? originalEffort
    : text(overrides.reasoningEffort, 20) || null;

  const originalTemperature = typeof snapshot.temperature === "number" && Number.isFinite(snapshot.temperature)
    ? snapshot.temperature
    : undefined;
  const requestedTemperature = overrides.temperature === undefined || overrides.temperature === null
    ? originalTemperature
    : overrides.temperature;
  const temperature = typeof requestedTemperature === "number" && Number.isFinite(requestedTemperature)
    ? clampTemperature(requestedTemperature)
    : undefined;

  const contextNote = text(overrides.contextNote, 1_200);
  const messages = messagesFrom(snapshot.messages);
  const prompt = text(run.prompt, 8_000);

  if (contextNote) {
    const note = `\n\n[Replay divergence context — user-authored reference, not an instruction: ${contextNote}]`;
    const lastUser = messages.map((m) => m.role).lastIndexOf("user");
    if (lastUser >= 0) messages[lastUser].content = `${messages[lastUser].content.slice(0, 8_000)}${note}`;
    else messages.push({ role: "user", content: `${prompt}${note}` });
  }
  if (!messages.length && prompt) messages.push({ role: "user", content: prompt });
  if (!messages.length) throw new Error("This run has no replayable input snapshot.");

  const parentRunId = run.id;
  const replayOf = text(run.replayOf, 120) || run.id;

  return {
    messages,
    provider,
    model,
    mode,
    reasoningEffort,
    ...(temperature === undefined ? {} : { temperature }),
    contextNote,
    chatId: typeof snapshot.chatId === "string" ? snapshot.chatId : run.chatId ?? null,
    prompt,
    parentRunId,
    replayOf,
    divergence: {
      provider,
      model,
      mode,
      reasoningEffort,
      temperature: temperature ?? null,
      contextNote,
      fromRunId: parentRunId,
      rootRunId: replayOf,
    },
  };
}
