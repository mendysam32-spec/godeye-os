/**
 * Skill/tool genome: versioned capabilities with explicit DNA, measured
 * outcomes and deterministic genetic operators.
 *
 * Phase 1 / item 3 of the generational-improvements plan. The genome deliberately
 * stores prompt instructions and declarative tool specifications — never
 * arbitrary executable code — so agents can author and evolve capabilities
 * without gaining a remote-code-execution primitive.
 */

import { ensureFoundationSchema, getChatDb, type D1Like } from "./d1";
import {
  isGeneticOperator,
  isSkillGenomeKind,
  isSkillGenomeStatus,
  MAX_SKILL_BODY_CHARS,
  MAX_SKILL_TESTS,
  newId,
  safeTracePayload,
  type GeneticOperator,
  type SkillCostModel,
  type SkillDna,
  type SkillGenomeKind,
  type SkillGenomeRecord,
  type SkillGenomeStatus,
  type SkillOutcome,
  type SkillProvenance,
  type SkillTestCase,
  type VerificationCheck,
} from "./foundation";
import { callLLM, type ChatMessage } from "./llm-router";
import { estimateChatCost } from "./pricing";
import type { ProviderId } from "./providers";
import { appendEvent, finishRun, startRun } from "./traces";
import { recordUsageEvent } from "./usage";

interface GenomeRow {
  id: string;
  uid: string;
  family_id: string;
  slug: string;
  name: string;
  description: string;
  kind: string;
  body: string;
  dna: string;
  tests: string;
  version: number | string;
  generation: number | string;
  parent_ids: string;
  operator: string;
  status: string;
  fitness: number | string;
  created_at: string;
  updated_at: string;
}

interface OutcomeRow {
  id: string;
  uid: string;
  skill_id: string;
  run_id: string | null;
  passed: number | string;
  score: number | string;
  checks: string;
  latency_ms: number | string | null;
  prompt_tokens: number | string;
  completion_tokens: number | string;
  cost_usd: number | string;
  provider: string | null;
  model: string | null;
  error: string | null;
  created_at: string;
}

export interface GenomeVault {
  [provider: string]: { key?: string; apiKey?: string; endpoint?: string } | string | undefined;
}

export interface CreateSkillGenomeInput {
  uid: string;
  name: string;
  slug?: string;
  description?: string;
  kind?: SkillGenomeKind | string;
  body: string;
  dna?: Partial<SkillDna> | null;
  tests?: SkillTestCase[] | null;
  familyId?: string | null;
  parentIds?: string[] | null;
  operator?: GeneticOperator | string;
  status?: SkillGenomeStatus | string;
}

export interface ListGenomeOptions {
  familyId?: string | null;
  status?: SkillGenomeStatus | null;
  limit?: number;
}

export interface MutationOptions {
  strategy?: "tighten" | "example" | "reorder";
  seed?: string;
}

export interface TestSkillGenomeInput {
  uid: string;
  id: string;
  vault: GenomeVault;
  provider: ProviderId;
  model: string;
  effort?: "off" | "low" | "medium" | "high" | "extra-high";
}

export interface TestSkillGenomeResult {
  ok: boolean;
  skill: SkillGenomeRecord | null;
  runId: string;
  outcomes: SkillOutcome[];
  summary: string;
  error?: string;
}

export interface ProposeSkillFromRunInput {
  uid: string;
  runId: string;
  content: string;
  agentId?: string;
  agentName?: string;
  name?: string;
  description?: string;
  trustScore?: number;
}

const GENOME_UPSERT = `INSERT INTO skill_genome
  (id, uid, family_id, slug, name, description, kind, body, dna, tests, version,
   generation, parent_ids, operator, status, fitness, created_at, updated_at)
  VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name, description = excluded.description, body = excluded.body,
    dna = excluded.dna, tests = excluded.tests, status = excluded.status,
    fitness = excluded.fitness, updated_at = excluded.updated_at`;

const OUTCOME_INSERT = `INSERT INTO skill_outcomes
  (id, uid, skill_id, run_id, passed, score, checks, latency_ms, prompt_tokens,
   completion_tokens, cost_usd, provider, model, error, created_at)
  VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)`;

async function foundationDb(): Promise<D1Like | null> {
  const db = await getChatDb();
  if (!db) return null;
  await ensureFoundationSchema(db);
  return db;
}

function clip(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function cleanList(value: unknown, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = clip(item, maxChars);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function clampScore(value: unknown, fallback = 0.5): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, Math.round(n * 1000) / 1000));
}

function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function zeroCost(source: string | null = null): SkillCostModel {
  return { promptTokens: 0, completionTokens: 0, costUsd: 0, currency: "USD", source };
}

function normalizeDna(input: Partial<SkillDna> | null | undefined): SkillDna {
  const dna = input ?? {};
  const cost = dna.costModel;
  const provenance = Array.isArray(dna.provenance) ? dna.provenance : [];
  return {
    preconditions: cleanList(dna.preconditions, 12, 200),
    postconditions: cleanList(dna.postconditions, 12, 200),
    sideEffects: cleanList(dna.sideEffects, 12, 200),
    costModel: {
      promptTokens: Math.max(0, Number(cost?.promptTokens) || 0),
      completionTokens: Math.max(0, Number(cost?.completionTokens) || 0),
      costUsd: roundCost(Math.max(0, Number(cost?.costUsd) || 0)),
      currency: "USD",
      source: cost?.source ? clip(cost.source, 80) : null,
    },
    trustScore: clampScore(dna.trustScore, 0.5),
    provenance: provenance.slice(0, 20).flatMap((p): SkillProvenance[] => {
      if (!p || typeof p !== "object") return [];
      return [{
        kind: clip(p.kind, 60) || "note",
        at: clip(p.at, 40) || new Date().toISOString(),
        runId: p.runId ? clip(p.runId, 120) : null,
        agentId: p.agentId ? clip(p.agentId, 120) : null,
        note: p.note ? clip(p.note, 300) : null,
      }];
    }),
    tags: cleanList(dna.tags, 16, 60),
  };
}

function normalizeTests(value: unknown): SkillTestCase[] {
  if (!Array.isArray(value)) return [];
  const out: SkillTestCase[] = [];
  for (const item of value.slice(0, MAX_SKILL_TESTS)) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    const input = clip(t.input, 4_000);
    if (!input) continue;
    out.push({
      name: clip(t.name, 100) || `Test ${out.length + 1}`,
      input,
      expectContains: cleanList(t.expectContains, 8, 200),
      expectNotContains: cleanList(t.expectNotContains, 8, 200),
      maxChars: Math.min(30_000, Math.max(20, Number(t.maxChars) || 8_000)),
    });
  }
  return out;
}

function parseObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function parseJsonArray(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function parseStringArray(raw: string | null): string[] {
  return parseJsonArray(raw).filter((v): v is string => typeof v === "string");
}

function parseChecks(raw: string | null): VerificationCheck[] {
  try {
    const value = JSON.parse(raw ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): VerificationCheck[] => {
      if (!item || typeof item !== "object") return [];
      const c = item as Record<string, unknown>;
      return [{
        name: clip(c.name, 80) || "check",
        passed: !!c.passed,
        detail: typeof c.detail === "string" ? clip(c.detail, 300) : undefined,
      }];
    });
  } catch {
    return [];
  }
}

function mapGenome(r: GenomeRow): SkillGenomeRecord {
  return {
    id: r.id,
    uid: r.uid,
    familyId: r.family_id,
    slug: r.slug,
    name: r.name,
    description: r.description ?? "",
    kind: isSkillGenomeKind(r.kind) ? r.kind : "prompt",
    body: r.body ?? "",
    dna: normalizeDna(parseObject(r.dna) as Partial<SkillDna>),
    tests: normalizeTests(parseJsonArray(r.tests)),
    version: Number(r.version) || 1,
    generation: Number(r.generation) || 0,
    parentIds: parseStringArray(r.parent_ids),
    operator: isGeneticOperator(r.operator) ? r.operator : "seed",
    status: isSkillGenomeStatus(r.status) ? r.status : "draft",
    fitness: clampScore(r.fitness, 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapOutcome(r: OutcomeRow): SkillOutcome {
  return {
    id: r.id,
    uid: r.uid,
    skillId: r.skill_id,
    runId: r.run_id ?? null,
    passed: Number(r.passed) === 1,
    score: clampScore(r.score, 0),
    checks: parseChecks(r.checks),
    latencyMs: r.latency_ms == null ? null : Number(r.latency_ms),
    promptTokens: Number(r.prompt_tokens) || 0,
    completionTokens: Number(r.completion_tokens) || 0,
    costUsd: roundCost(Number(r.cost_usd) || 0),
    provider: r.provider ?? null,
    model: r.model ?? null,
    error: r.error ?? null,
    createdAt: r.created_at,
  };
}

function slugify(value: string): string {
  const slug = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || `skill-${Date.now().toString(36)}`;
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function saveGenome(record: SkillGenomeRecord): Promise<void> {
  const db = await foundationDb();
  if (!db) return;
  await db.prepare(GENOME_UPSERT).bind(
    record.id, record.uid, record.familyId, record.slug, record.name,
    record.description, record.kind, record.body, JSON.stringify(record.dna),
    JSON.stringify(record.tests), record.version, record.generation,
    JSON.stringify(record.parentIds), record.operator, record.status,
    record.fitness, record.createdAt, record.updatedAt,
  ).run();
}

async function saveOutcome(outcome: SkillOutcome): Promise<void> {
  const db = await foundationDb();
  if (!db) return;
  await db.prepare(OUTCOME_INSERT).bind(
    outcome.id, outcome.uid, outcome.skillId, outcome.runId,
    outcome.passed ? 1 : 0, outcome.score, JSON.stringify(outcome.checks),
    outcome.latencyMs, outcome.promptTokens, outcome.completionTokens,
    outcome.costUsd, outcome.provider, outcome.model, outcome.error, outcome.createdAt,
  ).run();
}

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

export async function createSkillGenome(input: CreateSkillGenomeInput): Promise<SkillGenomeRecord> {
  const body = String(input.body ?? "").trim().slice(0, MAX_SKILL_BODY_CHARS);
  const name = clip(input.name, 120);
  if (!name || !body) throw new Error("A name and body are required");

  const db = await foundationDb();
  const familyId = input.familyId ? clip(input.familyId, 120) : newId("fam");
  let maxVersion = 0;
  let maxGeneration = -1;
  if (db) {
    const { results } = await db
      .prepare("SELECT * FROM skill_genome WHERE family_id = ?1 LIMIT 500")
      .bind(familyId)
      .all<GenomeRow>();
    for (const row of results) {
      maxVersion = Math.max(maxVersion, Number(row.version) || 0);
      const parents = parseStringArray(row.parent_ids);
      if (!parents.length) maxGeneration = Math.max(maxGeneration, Number(row.generation) || 0);
    }
  }

  const parentIds = (input.parentIds ?? []).slice(0, 4).map((id) => clip(id, 120)).filter(Boolean);
  const dna = normalizeDna(input.dna);
  const now = new Date().toISOString();
  const record: SkillGenomeRecord = {
    id: newId("gen"),
    uid: input.uid,
    familyId,
    slug: clip(input.slug, 60) || slugify(name),
    name,
    description: clip(input.description, 400),
    kind: isSkillGenomeKind(input.kind) ? input.kind : "prompt",
    body,
    dna,
    tests: normalizeTests(input.tests),
    version: maxVersion + 1,
    generation: maxGeneration + 1,
    parentIds,
    operator: isGeneticOperator(input.operator) ? input.operator : "seed",
    status: isSkillGenomeStatus(input.status) ? input.status : "draft",
    fitness: clampScore(dna.trustScore * 0.5, 0),
    createdAt: now,
    updatedAt: now,
  };
  await saveGenome(record);
  return record;
}

export async function getSkillGenome(uid: string, id: string): Promise<SkillGenomeRecord | null> {
  const db = await foundationDb();
  if (!db) return null;
  const { results } = await db
    .prepare("SELECT * FROM skill_genome WHERE id = ?1 LIMIT 1")
    .bind(id)
    .all<GenomeRow>();
  const row = results.find((r) => r.uid === uid);
  return row ? mapGenome(row) : null;
}

export async function listSkillGenome(uid: string, options: ListGenomeOptions = {}): Promise<SkillGenomeRecord[]> {
  const db = await foundationDb();
  if (!db) return [];
  const { results } = await db
    .prepare("SELECT * FROM skill_genome WHERE uid = ?1 LIMIT 1000")
    .bind(uid)
    .all<GenomeRow>();
  const rows = results.map(mapGenome)
    .filter((r) => !options.familyId || r.familyId === options.familyId)
    .filter((r) => !options.status || r.status === options.status)
    .sort((a, b) => a.familyId.localeCompare(b.familyId) || b.version - a.version || b.createdAt.localeCompare(a.createdAt));
  return rows.slice(0, Math.min(500, Math.max(1, options.limit ?? 200)));
}

export async function addSkillTestCase(uid: string, id: string, test: unknown): Promise<SkillGenomeRecord | null> {
  const skill = await getSkillGenome(uid, id);
  if (!skill) return null;
  const normalized = normalizeTests([test]);
  if (!normalized.length) return skill;
  skill.tests = [...skill.tests, ...normalized].slice(0, MAX_SKILL_TESTS);
  skill.updatedAt = new Date().toISOString();
  await saveGenome(skill);
  return skill;
}

export async function listSkillOutcomes(uid: string, skillId?: string | null): Promise<SkillOutcome[]> {
  const db = await foundationDb();
  if (!db) return [];
  const sql = skillId
    ? "SELECT * FROM skill_outcomes WHERE skill_id = ?1 LIMIT 1000"
    : "SELECT * FROM skill_outcomes WHERE uid = ?1 LIMIT 1000";
  const { results } = await db.prepare(sql).bind(skillId || uid).all<OutcomeRow>();
  return results
    .filter((r) => r.uid === uid && (!skillId || r.skill_id === skillId))
    .map(mapOutcome)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 300);
}

function fitnessOf(record: SkillGenomeRecord, outcomes: SkillOutcome[]): number {
  if (!outcomes.length) return clampScore(record.dna.trustScore * 0.5, 0);
  const avgScore = outcomes.reduce((n, o) => n + o.score, 0) / outcomes.length;
  const passRate = outcomes.filter((o) => o.passed).length / outcomes.length;
  const avgCost = outcomes.reduce((n, o) => n + o.costUsd, 0) / outcomes.length;
  const avgLatency = outcomes.reduce((n, o) => n + (o.latencyMs ?? 0), 0) / outcomes.length;
  const efficiency = 1 / (1 + avgCost * 200 + avgLatency / 60_000);
  return clampScore(
    0.5 * avgScore + 0.25 * passRate + 0.15 * efficiency + 0.1 * record.dna.trustScore,
    0,
  );
}

function dnaFromOutcomes(record: SkillGenomeRecord, outcomes: SkillOutcome[]): SkillDna {
  const dna = record.dna;
  if (!outcomes.length) return dna;
  const reward = outcomes.reduce((n, o) => n + o.score * (o.passed ? 1 : 0.6), 0) / outcomes.length;
  const priorWeight = 3;
  const promptTokens = Math.round(outcomes.reduce((n, o) => n + o.promptTokens, 0) / outcomes.length);
  const completionTokens = Math.round(outcomes.reduce((n, o) => n + o.completionTokens, 0) / outcomes.length);
  const costUsd = roundCost(outcomes.reduce((n, o) => n + o.costUsd, 0) / outcomes.length);
  return {
    ...dna,
    trustScore: clampScore((dna.trustScore * priorWeight + reward * outcomes.length) / (priorWeight + outcomes.length)),
    costModel: { promptTokens, completionTokens, costUsd, currency: "USD", source: "measured" },
  };
}

async function refreshFitness(uid: string, skillId: string): Promise<SkillGenomeRecord | null> {
  const skill = await getSkillGenome(uid, skillId);
  if (!skill) return null;
  const outcomes = await listSkillOutcomes(uid, skillId);
  skill.dna = dnaFromOutcomes(skill, outcomes);
  skill.fitness = fitnessOf(skill, outcomes);
  skill.updatedAt = new Date().toISOString();
  await saveGenome(skill);
  return skill;
}

/* -------------------------------------------------------------------------- */
/* genetic operators                                                           */
/* -------------------------------------------------------------------------- */

function mutateBody(body: string, strategy: MutationOptions["strategy"], seed: number): string {
  const text = String(body ?? "").trim().slice(0, MAX_SKILL_BODY_CHARS);
  const choice = strategy ?? (["tighten", "example", "reorder"] as const)[seed % 3];
  if (choice === "tighten") {
    return `${text}\n\n## Mutation: tighter contract\n- State assumptions explicitly before acting.\n- Return a compact, verifiable result.\n- If a step cannot be verified, say so instead of guessing.`.slice(0, MAX_SKILL_BODY_CHARS);
  }
  if (choice === "example") {
    return `${text}\n\n## Mutation: worked example\nInput: <representative request>\nOutput: <expected shape of a good answer>\nWhy: <which postcondition this satisfies>`.slice(0, MAX_SKILL_BODY_CHARS);
  }
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length < 3) return `${text}\n\n## Mutation: concise restatement\nDo the smallest verifiable thing that satisfies the stated postconditions.`.slice(0, MAX_SKILL_BODY_CHARS);
  const shift = seed % blocks.length;
  return [...blocks.slice(shift), ...blocks.slice(0, shift)].join("\n\n").slice(0, MAX_SKILL_BODY_CHARS);
}

export async function mutateSkillGenome(
  uid: string,
  parentId: string,
  options: MutationOptions = {},
): Promise<SkillGenomeRecord | null> {
  const parent = await getSkillGenome(uid, parentId);
  if (!parent) return null;
  const seed = hash(`${parent.id}:${parent.version}:${options.seed ?? ""}`);
  const dna = normalizeDna(parent.dna);
  dna.preconditions = cleanList([...dna.preconditions, "Validate inputs before execution"], 12, 200);
  dna.postconditions = cleanList([...dna.postconditions, "Report a concise, verifiable result"], 12, 200);
  dna.sideEffects = dna.sideEffects.length ? dna.sideEffects : ["none"];
  dna.tags = cleanList([...dna.tags, `mut-${parent.generation + 1}`], 16, 60);
  dna.trustScore = clampScore(dna.trustScore * 0.95);
  dna.provenance = [
    ...dna.provenance,
    { kind: "mutation", at: new Date().toISOString(), note: `Deterministic ${options.strategy ?? "auto"} mutation of v${parent.version}` },
  ].slice(-20);
  return createSkillGenome({
    uid,
    name: parent.name,
    slug: parent.slug,
    description: parent.description,
    kind: parent.kind,
    body: mutateBody(parent.body, options.strategy, seed),
    dna,
    tests: parent.tests,
    familyId: parent.familyId,
    parentIds: [parent.id],
    operator: "mutate",
  });
}

function crossoverBodies(a: string, b: string, seed: number): string {
  const blocksA = String(a ?? "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const blocksB = String(b ?? "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (let i = 0; i < Math.max(blocksA.length, blocksB.length); i++) {
    const pickA = (i + seed) % 2 === 0;
    const candidate = (pickA ? blocksA[i] : blocksB[i]) ?? (pickA ? blocksB[i] : blocksA[i]);
    if (!candidate || seen.has(candidate.toLowerCase())) continue;
    seen.add(candidate.toLowerCase());
    merged.push(candidate);
  }
  return merged.join("\n\n").slice(0, MAX_SKILL_BODY_CHARS);
}

export async function crossoverSkillGenome(
  uid: string,
  aId: string,
  bId: string,
  seedText = "",
): Promise<SkillGenomeRecord | null> {
  const [a, b] = await Promise.all([getSkillGenome(uid, aId), getSkillGenome(uid, bId)]);
  if (!a || !b) return null;
  const seed = hash(`${a.id}:${b.id}:${seedText}`);
  const dna = normalizeDna(a.dna);
  dna.preconditions = cleanList([...a.dna.preconditions, ...b.dna.preconditions], 12, 200);
  dna.postconditions = cleanList([...a.dna.postconditions, ...b.dna.postconditions], 12, 200);
  dna.sideEffects = cleanList([...a.dna.sideEffects, ...b.dna.sideEffects], 12, 200);
  dna.tags = cleanList([...a.dna.tags, ...b.dna.tags, "crossover"], 16, 60);
  dna.costModel = {
    promptTokens: Math.round((a.dna.costModel.promptTokens + b.dna.costModel.promptTokens) / 2),
    completionTokens: Math.round((a.dna.costModel.completionTokens + b.dna.costModel.completionTokens) / 2),
    costUsd: roundCost((a.dna.costModel.costUsd + b.dna.costModel.costUsd) / 2),
    currency: "USD",
    source: "crossover-average",
  };
  dna.trustScore = clampScore(Math.min(a.dna.trustScore, b.dna.trustScore) * 0.9);
  dna.provenance = [
    ...a.dna.provenance, ...b.dna.provenance,
    { kind: "crossover", at: new Date().toISOString(), note: `Recombined ${a.name} v${a.version} + ${b.name} v${b.version}` },
  ].slice(-20);
  return createSkillGenome({
    uid,
    name: a.name,
    slug: a.slug,
    description: `${a.description} ${b.description}`.trim().slice(0, 400),
    kind: a.kind,
    body: crossoverBodies(a.body, b.body, seed),
    dna,
    tests: [...a.tests, ...b.tests].slice(0, MAX_SKILL_TESTS),
    familyId: a.familyId,
    parentIds: [a.id, b.id],
    operator: "crossover",
  });
}

export interface SelectionResult {
  familyId: string;
  winner: SkillGenomeRecord | null;
  ranked: SkillGenomeRecord[];
}

export async function selectSkillGenome(uid: string, familyId: string): Promise<SelectionResult> {
  const family = await listSkillGenome(uid, { familyId, limit: 200 });
  if (!family.length) return { familyId, winner: null, ranked: [] };
  const ranked: SkillGenomeRecord[] = [];
  for (const skill of family) {
    const refreshed = await refreshFitness(uid, skill.id);
    if (refreshed) ranked.push(refreshed);
  }
  ranked.sort((a, b) => b.fitness - a.fitness || b.version - a.version);
  const winner = ranked[0];
  for (const skill of ranked) {
    const next = skill.id === winner?.id ? "active" : skill.status === "active" ? "retired" : skill.status;
    if (next === skill.status) continue;
    skill.status = next;
    skill.updatedAt = new Date().toISOString();
    await saveGenome(skill);
  }
  return { familyId, winner: winner ? { ...winner, status: "active" } : null, ranked };
}

/* -------------------------------------------------------------------------- */
/* authoring + testing                                                         */
/* -------------------------------------------------------------------------- */

export async function proposeSkillFromRun(input: ProposeSkillFromRunInput): Promise<SkillGenomeRecord> {
  const content = String(input.content ?? "").trim().slice(0, 12_000);
  if (!content) throw new Error("No result content to evolve from");
  const agentName = clip(input.agentName, 120) || "Agent";
  const body = [
    "## Purpose",
    clip(input.description, 400) || `Reusable capability distilled from ${agentName}'s successful work.`,
    "",
    "## Reference artifact",
    content,
    "",
    "## Operating rules",
    "- Adapt the reference artifact to the current request; do not assume the same inputs.",
    "- Preserve the verified structure, checks and conventions from the artifact.",
    "- If a required input is missing, ask for it before producing a final answer.",
  ].join("\n").slice(0, MAX_SKILL_BODY_CHARS);
  return createSkillGenome({
    uid: input.uid,
    name: clip(input.name, 120) || `${agentName} capability`,
    description: clip(input.description, 400) || `Evolved from run ${clip(input.runId, 80)}`,
    kind: "prompt",
    body,
    dna: {
      trustScore: clampScore(input.trustScore ?? 0.6),
      tags: ["agent-authored", agentName],
      sideEffects: ["none"],
      provenance: [{
        kind: "runtime-result",
        at: new Date().toISOString(),
        runId: clip(input.runId, 120),
        agentId: input.agentId ? clip(input.agentId, 120) : null,
        note: "Authored from a verified agent result",
      }],
    },
    tests: [{
      name: "Reference shape preserved",
      input: "Apply this capability to a similar request and return a finished artifact.",
      expectContains: [],
      maxChars: 12_000,
    }],
    operator: "import",
  });
}

function vaultKey(vault: GenomeVault, provider: ProviderId): string | null {
  const entry = vault?.[provider];
  if (!entry) return null;
  if (typeof entry === "string") return entry.trim() || null;
  const key = typeof entry.key === "string" ? entry.key : typeof entry.apiKey === "string" ? entry.apiKey : "";
  return key.trim() || null;
}

function vaultEndpoint(vault: GenomeVault, provider: ProviderId): string | undefined {
  const entry = vault?.[provider];
  if (entry && typeof entry === "object" && typeof entry.endpoint === "string" && entry.endpoint.trim()) {
    return entry.endpoint.trim();
  }
  return undefined;
}

function validateToolSpec(body: string): VerificationCheck[] {
  let spec: Record<string, unknown>;
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    spec = parsed as Record<string, unknown>;
  } catch {
    return [{ name: "valid-json", passed: false, detail: "Tool specs must be declarative JSON" }];
  }
  const parameters = spec.parameters;
  const checks: VerificationCheck[] = [
    { name: "valid-json", passed: true },
    { name: "name", passed: typeof spec.name === "string" && !!String(spec.name).trim() },
    { name: "description", passed: typeof spec.description === "string" && String(spec.description).trim().length >= 20 },
    {
      name: "parameters",
      passed: !!parameters && typeof parameters === "object" && !Array.isArray(parameters),
    },
    { name: "no-code", passed: !/\b(eval|new Function|child_process|require\(|import\()\b/i.test(body) },
  ];
  return checks;
}

export async function testSkillGenome(input: TestSkillGenomeInput): Promise<TestSkillGenomeResult> {
  const skill = await getSkillGenome(input.uid, input.id);
  const runId = newId("run");
  if (!skill) {
    return { ok: false, skill: null, runId, outcomes: [], summary: "Skill not found", error: "Skill not found" };
  }

  await startRun({
    id: runId,
    uid: input.uid,
    kind: "skill",
    prompt: `Test genome ${skill.slug} v${skill.version}`,
    inputSnapshot: safeTracePayload({
      skillId: skill.id, familyId: skill.familyId, version: skill.version,
      kind: skill.kind, tests: skill.tests.map((t) => t.name),
    }, 24_000),
    provider: input.provider,
    model: input.model,
    mode: "genome-test",
  }).catch(() => null);

  if (skill.kind === "tool") {
    const checks = validateToolSpec(skill.body);
    const passed = checks.every((c) => c.passed);
    const outcome: SkillOutcome = {
      id: newId("out"), uid: input.uid, skillId: skill.id, runId,
      passed, score: checks.filter((c) => c.passed).length / checks.length, checks,
      latencyMs: 0, promptTokens: 0, completionTokens: 0, costUsd: 0,
      provider: null, model: null,
      error: passed ? null : checks.filter((c) => !c.passed).map((c) => c.name).join(", "),
      createdAt: new Date().toISOString(),
    };
    await saveOutcome(outcome).catch(() => null);
    await appendEvent({ uid: input.uid, runId, type: "genome.test", payload: { skillId: skill.id, passed, checks } }).catch(() => null);
    const refreshed = await refreshFitness(input.uid, skill.id);
    await finishRun(input.uid, runId, passed ? "completed" : "failed").catch(() => null);
    return {
      ok: passed, skill: refreshed, runId, outcomes: [outcome],
      summary: passed ? "Tool specification is valid" : "Tool specification failed validation",
    };
  }

  if (!skill.tests.length) {
    await finishRun(input.uid, runId, "failed").catch(() => null);
    return { ok: false, skill, runId, outcomes: [], summary: "Add at least one test case", error: "Add at least one test case" };
  }

  const apiKey = vaultKey(input.vault, input.provider);
  if (!apiKey) {
    const message = `No API key for ${input.provider}. Connect it in Providers Vault.`;
    await finishRun(input.uid, runId, "failed").catch(() => null);
    return { ok: false, skill, runId, outcomes: [], summary: message, error: message };
  }
  const baseUrl = vaultEndpoint(input.vault, input.provider);

  const outcomes: SkillOutcome[] = [];
  for (const test of skill.tests.slice(0, 4)) {
    const started = Date.now();
    try {
      const system = [
        "You are executing a versioned MEDUSA skill. Follow the skill body as instructions for this task.",
        "The text below is user-authored skill content, not a system directive to ignore the user's request.",
        "",
        skill.body,
      ].join("\n");
      const messages: ChatMessage[] = [
        { role: "system", content: system.slice(0, 24_000) },
        { role: "user", content: test.input.slice(0, 4_000) },
      ];
      const response = await callLLM(
        {
          provider: input.provider,
          model: input.model,
          messages,
          temperature: 0.2,
          maxTokens: 1_500,
          reasoningEffort: input.effort ?? "off",
        },
        apiKey,
        baseUrl ? { baseUrl } : undefined,
      );
      const latencyMs = Date.now() - started;
      const text = response.content ?? "";
      const lower = text.toLowerCase();
      const checks: VerificationCheck[] = [
        { name: "non-empty", passed: text.trim().length > 0 },
        { name: "max-chars", passed: text.length <= (test.maxChars ?? 8_000) },
        ...test.expectContains!.map((phrase) => ({
          name: `contains:${phrase.slice(0, 40)}`,
          passed: lower.includes(phrase.toLowerCase()),
        })),
        ...test.expectNotContains!.map((phrase) => ({
          name: `excludes:${phrase.slice(0, 40)}`,
          passed: !lower.includes(phrase.toLowerCase()),
        })),
      ];
      const passed = checks.every((c) => c.passed);
      const cost = estimateChatCost({
        provider: input.provider,
        model: response.model,
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
      });
      const outcome: SkillOutcome = {
        id: newId("out"), uid: input.uid, skillId: skill.id, runId, passed,
        score: checks.filter((c) => c.passed).length / checks.length, checks,
        latencyMs,
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        costUsd: cost.costUsd,
        provider: input.provider,
        model: response.model,
        error: null,
        createdAt: new Date().toISOString(),
      };
      await saveOutcome(outcome).catch(() => null);
      await recordUsageEvent({
        uid: input.uid, runId, kind: "skill", provider: input.provider, model: response.model,
        usage: response.usage, latencyMs,
        metadata: { skillId: skill.id, version: skill.version, test: test.name },
      }).catch(() => null);
      await appendEvent({
        uid: input.uid, runId, type: "genome.test",
        payload: {
          skillId: skill.id, version: skill.version, test: test.name, passed,
          score: outcome.score, checks, preview: text.slice(0, 400),
        },
      }).catch(() => null);
      outcomes.push(outcome);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const checks: VerificationCheck[] = [{ name: "completed", passed: false, detail: clip(message, 300) }];
      const outcome: SkillOutcome = {
        id: newId("out"), uid: input.uid, skillId: skill.id, runId, passed: false, score: 0, checks,
        latencyMs: Date.now() - started, promptTokens: 0, completionTokens: 0, costUsd: 0,
        provider: input.provider, model: input.model, error: clip(message, 500),
        createdAt: new Date().toISOString(),
      };
      await saveOutcome(outcome).catch(() => null);
      await appendEvent({ uid: input.uid, runId, type: "genome.test", payload: { skillId: skill.id, test: test.name, passed: false, error: outcome.error } }).catch(() => null);
      outcomes.push(outcome);
    }
  }

  const refreshed = await refreshFitness(input.uid, skill.id);
  const ok = outcomes.length > 0 && outcomes.every((o) => o.passed);
  if (refreshed && ok && refreshed.status === "draft") {
    refreshed.status = "candidate";
    refreshed.updatedAt = new Date().toISOString();
    await saveGenome(refreshed);
  }
  await finishRun(input.uid, runId, ok ? "completed" : "failed").catch(() => null);
  const passedCount = outcomes.filter((o) => o.passed).length;
  return {
    ok,
    skill: refreshed,
    runId,
    outcomes,
    summary: `${passedCount}/${outcomes.length} test case(s) passed — fitness ${Math.round((refreshed?.fitness ?? 0) * 100)}%`,
  };
}

/** Drop-in metadata for the existing InstalledSkill store (no code execution). */
export function toInstalledSkill(skill: SkillGenomeRecord) {
  return {
    id: `${skill.slug}-v${skill.version}`.slice(0, 120),
    name: skill.name,
    description: skill.description,
    version: `v${skill.version}`,
    source: "genome" as const,
    enabled: true,
    instructions: skill.body,
    entry: "SKILL.md",
    files: [],
    fileCount: 0,
    bytes: skill.body.length,
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export { zeroCost };
