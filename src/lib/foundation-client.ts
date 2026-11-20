/**
 * Browser-side helpers for the foundation slice. They are best-effort: a
 * missing D1 binding or offline device must never break a chat turn.
 */

import {
  MAX_MEMORY_CHARS,
  MAX_MEMORY_ITEMS,
  sanitizeMemoryText,
  type MemoryContext,
  type MemoryKind,
  type MemoryRecord,
  type RunStatus,
} from "./foundation";
import { cosineSimilarity, embedText } from "./vector";

const MEMORY_CACHE_KEY = "medusa:memory-cache";

export interface MemoryDraft {
  content: string;
  kind?: MemoryKind;
  projectId?: string | null;
  sourceChatId?: string | null;
  sourceMessageId?: string | null;
  pinned?: boolean;
}

function readCache(): MemoryRecord[] {
  try {
    const raw = localStorage.getItem(MEMORY_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as MemoryRecord[] : [];
  } catch {
    return [];
  }
}

function writeCache(memories: MemoryRecord[]): void {
  try {
    localStorage.setItem(MEMORY_CACHE_KEY, JSON.stringify(memories.slice(0, 200)));
  } catch {
    /* storage disabled — server memory still works */
  }
}

/** Local cache keeps recall working when the API is unreachable. */
export function getCachedMemories(query: string): MemoryContext[] {
  const q = query.toLowerCase().trim();
  const terms = q.match(/[a-z0-9_-]{3,}/g) ?? [];
  const queryVector = q ? embedText(q) : null;
  return readCache()
    .map((m) => {
      const hay = m.content.toLowerCase();
      let score = (m.score ?? 0) + (m.pinned ? 5 : 0);
      if (q && hay.includes(q)) score += 6;
      for (const term of terms) if (hay.includes(term)) score += 2;
      // Same local semantic signal as the server ranker, for offline parity.
      if (queryVector) score += Math.max(0, cosineSimilarity(queryVector, embedText(m.content))) * 5;
      return { id: m.id, kind: m.kind, content: m.content, score: Math.round(score * 100) / 100 };
    })
    .filter((m) => !q || (m.score ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, MAX_MEMORY_ITEMS);
}

export async function saveMemories(drafts: MemoryDraft[]): Promise<void> {
  if (!drafts.length) return;
  try {
    const res = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memories: drafts }),
    });
    if (!res.ok) return;
    const j = await res.json() as { memories?: MemoryRecord[] };
    if (j.memories?.length) {
      const byId = new Map(readCache().map((m) => [m.id, m]));
      for (const m of j.memories) byId.set(m.id, m);
      writeCache([...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    }
  } catch {
    /* best effort */
  }
}

export async function recordRunEvent(runId: string, type: string, payload: Record<string, unknown> = {}): Promise<void> {
  if (!runId) return;
  try {
    await fetch("/api/traces/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, type, payload }),
    });
  } catch {
    /* best effort */
  }
}

export async function finishRun(runId: string, status: RunStatus, error?: string | null): Promise<void> {
  if (!runId) return;
  try {
    await fetch(`/api/traces/${encodeURIComponent(runId)}/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, error: error ?? null }),
    });
  } catch {
    /* best effort */
  }
}

const SIGNALS: { kind: MemoryKind; re: RegExp }[] = [
  { kind: "preference", re: /\b(?:i prefer|i like|i want|please use|always use|never use|keep using|don't use)\b[^.!?\n]{3,180}/gi },
  { kind: "fact", re: /\b(?:my name is|i am|i'm|my role is|my timezone is|i work (?:at|on|with))\b[^.!?\n]{3,180}/gi },
  { kind: "decision", re: /\b(?:we decided|decision:|we'll use|we will use|let's use|chose|chosen)\b[^.!?\n]{3,180}/gi },
  { kind: "project", re: /\b(?:this project uses|the repo uses|stack:|architecture:|tech stack)\b[^.!?\n]{3,180}/gi },
  { kind: "procedure", re: /\b(?:the workflow is|process:|the steps are|do it by)\b[^.!?\n]{3,180}/gi },
];

/** Extract only explicitly signalled memories — never train on whole replies. */
export function extractMemoryCandidates(userText: string, sourceChatId?: string): MemoryDraft[] {
  const source = String(userText ?? "");
  const seen = new Set<string>();
  const out: MemoryDraft[] = [];
  for (const { kind, re } of SIGNALS) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null && out.length < 3) {
      const content = sanitizeMemoryText(
        match[0].replace(/^remember that\s+/i, "").replace(/^(?:please|kindly)\s+/i, ""),
        MAX_MEMORY_CHARS,
      );
      const key = content.toLowerCase().replace(/[^a-z0-9]+/g, " ");
      if (content.length < 8 || seen.has(key)) continue;
      seen.add(key);
      out.push({ content, kind, sourceChatId: sourceChatId ?? null });
    }
  }
  return out;
}
