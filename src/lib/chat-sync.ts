/**
 * Client-side chat sync: decide what is worth sending, and merge what comes
 * back.
 *
 * Three rules shape everything here:
 *
 *  1. R2 is not enabled on this account, so a base64 image has nowhere to live
 *     server-side. Binary parts are stripped before push and replaced with the
 *     same marker text the model would have seen. A device that never held the
 *     file says so plainly instead of showing an empty attachment chip.
 *
 *  2. D1 statements are billed per invocation, so a flush coalesces every dirty
 *     thread into one batch request instead of firing one per keystroke during
 *     streaming.
 *
 *  3. Streaming rewrites the last message many times a second. Those writes are
 *     deliberately not queued; only the settled message gets pushed, which is
 *     why `markThreadDirty` is called from `addMessage`/`updateLastMessage`
 *     with `settled` set only at the end of a run.
 */

import type { ProviderId } from "./providers";
import type { ChatMessage, ChatSession } from "./store";

/** Ceiling on a single serialised message. D1 caps bound values well below 1MB. */
export const MAX_SYNCED_MESSAGE_CHARS = 400_000;
/** Total payload we will attempt to push in one flush. */
export const MAX_SYNCED_PAYLOAD_CHARS = 1_500_000;

/* -------------------------------------------------------------------------- */
/* stripping                                                                   */
/* -------------------------------------------------------------------------- */

type AnyPart = { type: string; text?: string; mime?: string; data?: string; name?: string; detail?: string };

/**
 * Replace binary payloads with a marker. Text parts are kept but truncated:
 * a pasted 5MB file is useful, 400KB of it is not, and the marker tells the
 * reader what was cut.
 */
export function stripForSync(msg: ChatMessage): ChatMessage {
  const parts = msg.parts;
  if (!parts?.length) {
    return msg.content.length > MAX_SYNCED_MESSAGE_CHARS
      ? { ...msg, content: msg.content.slice(0, MAX_SYNCED_MESSAGE_CHARS) }
      : msg;
  }
  let textBudget = MAX_SYNCED_MESSAGE_CHARS;
  const out: AnyPart[] = [];
  for (const p of parts as AnyPart[]) {
    if (p.type === "text") {
      const text = p.text ?? "";
      if (text.length > textBudget) {
        out.push({ type: "text", text: text.slice(0, textBudget) + "\n\n[truncated — attachment too large to sync]" });
        textBudget = 0;
      } else {
        out.push(p);
        textBudget -= text.length;
      }
      continue;
    }
    // image / document
    const kind = p.type === "image" ? "image" : "document";
    const label = p.name || p.mime || kind;
    const kb = p.data ? Math.round((p.data.length * 3) / 4 / 1024) : 0;
    out.push({
      type: "text",
      text: `[${kind} attached: ${label}${kb ? ` (${kb}KB)` : ""} — not synced to other devices]`,
    });
  }
  return {
    ...msg,
    parts: out as ChatMessage["parts"],
    // `content` is what a device without `parts` renders, so it must not
    // reference the image as if it were there
    content: msg.content.includes("[image attached")
      ? out.map((p) => p.text ?? "").join("\n\n")
      : msg.content,
  };
}

export function chatFitsSync(msg: ChatMessage): boolean {
  try {
    return JSON.stringify(stripForSync(msg)).length <= MAX_SYNCED_MESSAGE_CHARS;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* wire shapes                                                                 */
/* -------------------------------------------------------------------------- */

export interface SyncThread {
  id: string;
  title: string;
  mode?: ChatMessage["mode"];
  provider?: ProviderId;
  model?: string;
  projectId?: string | null;
  folderId?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface SyncMessage extends SyncThreadMeta {
  id: string;
  threadId: string;
  seq: number;
  role: ChatMessage["role"];
  content: string;
  parts?: unknown;
  attachments?: unknown;
  media?: unknown;
  timestamp: string;
}

interface SyncThreadMeta {
  provider?: ProviderId;
  model?: string;
  mode?: ChatMessage["mode"];
}

/** Reduce a local session to the row shape the server stores. */
export function threadToRow(c: ChatSession): SyncThread {
  return {
    id: c.id,
    title: c.title,
    mode: c.mode,
    provider: c.provider,
    model: c.model,
    projectId: c.projectId ?? null,
    folderId: c.folderId ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    deletedAt: null,
  };
}

export function messagesToRows(chat: ChatSession): SyncMessage[] {
  return chat.messages.map((m, i) => {
    const s = stripForSync(m);
    return {
      id: s.id,
      threadId: chat.id,
      seq: i,
      role: s.role,
      content: s.content,
      parts: s.parts ?? null,
      attachments: s.attachments ?? null,
      media: s.media ?? null,
      provider: s.provider ?? undefined,
      model: s.model ?? undefined,
      mode: s.mode ?? undefined,
      timestamp: s.timestamp,
    };
  });
}

export function rowToMessage(r: SyncMessage): ChatMessage {
  return {
    id: r.id,
    role: r.role,
    content: r.content,
    timestamp: r.timestamp,
    provider: r.provider ?? undefined,
    model: r.model ?? undefined,
    mode: (r.mode as ChatMessage["mode"]) ?? undefined,
    parts: (r.parts as ChatMessage["parts"]) ?? undefined,
    attachments: (r.attachments as ChatMessage["attachments"]) ?? undefined,
    media: (r.media as ChatMessage["media"]) ?? undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* merge                                                                       */
/* -------------------------------------------------------------------------- */

export interface MergeResult {
  chats: ChatSession[];
  /** ids of threads whose server copy was newer and won */
  overwritten: string[];
  /** ids deleted on the server; the caller must drop these locally */
  deleted: string[];
  /** ids of threads we pushed and that the server has now confirmed */
  confirmed: string[];
}

function newer(a: string, b: string): boolean {
  return new Date(a).getTime() >= new Date(b).getTime();
}

/**
 * Last-write-wins per thread, keyed on `updatedAt`.
 *
 * A thread is replaced wholesale rather than message-merged. Per-message LWW
 * looks more precise but is wrong for this data: streaming rewrites the tail
 * message repeatedly, so two devices editing the same conversation produce
 * interleaved garbage that no timestamp ordering can repair. Thread-level LWW
 * keeps a conversation internally consistent, and `seq` means messages always
 * replay in the order they were sent.
 *
 * Incognito threads never sync in either direction.
 */
export function mergeThreads(
  local: ChatSession[],
  remote: SyncThread[],
  remoteMessages: Map<string, SyncMessage[]>,
  confirmedIds: string[],
): MergeResult {
  const byId = new Map<string, ChatSession>();
  for (const c of local) {
    if (!c.incognito) byId.set(c.id, c);
  }

  const overwritten: string[] = [];
  const confirmed: string[] = [];
  const deleted: string[] = [];

  for (const row of remote) {
    const msgs = remoteMessages.get(row.id) ?? [];
    const remoteUpdated = row.deletedAt ?? row.updatedAt;

    if (row.deletedAt) {
      // A tombstone is an instruction to remove, not an entry to merge. The id
      // is reported separately because `chats` is a merge of local + remote, so
      // the caller cannot infer the deletion from its absence.
      if (byId.has(row.id)) overwritten.push(row.id);
      byId.delete(row.id);
      deleted.push(row.id);
      continue;
    }

    const mine = byId.get(row.id);
    if (!mine) {
      byId.set(row.id, {
        id: row.id,
        title: row.title,
        mode: (row.mode as ChatSession["mode"]) ?? "chat",
        provider: row.provider ?? "openai",
        model: row.model ?? "",
        projectId: row.projectId ?? undefined,
        folderId: row.folderId ?? undefined,
        messages: [...msgs].sort((a, b) => a.seq - b.seq).map(rowToMessage),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
      continue;
    }

    if (newer(remoteUpdated, mine.updatedAt)) {
      byId.set(row.id, {
        ...mine,
        title: row.title,
        mode: (row.mode as ChatSession["mode"]) ?? mine.mode,
        provider: row.provider ?? mine.provider,
        model: row.model ?? mine.model,
        projectId: row.projectId ?? mine.projectId,
        folderId: row.folderId ?? mine.folderId,
        messages: [...msgs].sort((a, b) => a.seq - b.seq).map(rowToMessage),
        updatedAt: row.updatedAt,
      });
      overwritten.push(row.id);
    } else if (confirmedIds.includes(row.id)) {
      // server already holds our copy; mark clean without touching content
      confirmed.push(row.id);
    } else {
      confirmed.push(row.id);
    }
  }

  return { chats: [...byId.values()], overwritten, deleted, confirmed };
}

/** Tombstone a thread for push. Deletes propagate via `deleted_at`. */
export function deletedThreadRow(id: string, at: string): SyncThread {
  return {
    id,
    title: "",
    createdAt: at,
    updatedAt: at,
    deletedAt: at,
  };
}
