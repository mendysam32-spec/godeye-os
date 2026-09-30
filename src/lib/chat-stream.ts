// Client half of the chat transport. One reader for all three chat surfaces so
// event semantics (delta / stage / toolCalls / done / error) stay identical.
export interface ChatStreamHandlers {
  onDelta?: (text: string) => void;
  onStage?: (stage: string, label: string) => void;
  onNotice?: (message: string) => void;
  onToolCalls?: (calls: ToolCallWire[]) => void;
  onDone?: (info: { content?: string; usage?: { total_tokens?: number }; latencyMs?: number }) => void;
  onError?: (message: string) => void;
  onAborted?: () => void;
}

export interface ToolCallWire {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** One frame emitted by `POST /api/chat`. */
interface StreamEvent {
  type?: "stage" | "notice" | "toolCalls" | "done" | "aborted" | "error";
  stage?: string;
  label?: string;
  message?: string;
  delta?: string;
  content?: string;
  toolCalls?: ToolCallWire[];
  usage?: { total_tokens?: number };
  latencyMs?: number;
  error?: string;
}

export interface ChatStreamResult {
  /** text assembled from every delta, for callers that need the final value */
  text: string;
  toolCalls?: ToolCallWire[];
  usage?: { total_tokens?: number };
  latencyMs?: number;
  error?: string;
  aborted?: boolean;
}

/** Read a `/api/chat` response. Handles both the SSE stream and the legacy
 *  plain-JSON reply (non-tool, non-stream path). Throws only on transport
 *  failure; provider errors arrive as `result.error`. */
export async function readChatStream(res: Response, h: ChatStreamHandlers = {}): Promise<ChatStreamResult> {
  const contentType = res.headers.get("content-type") || "";
  const out: ChatStreamResult = { text: "" };

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message: string = body?.error || `Chat failed (${res.status})`;
    out.error = message;
    h.onError?.(message);
    return out;
  }

  if (contentType.includes("application/json")) {
    const j = await res.json().catch(() => null);
    if (j?.toolCalls?.length) {
      out.toolCalls = j.toolCalls;
      h.onToolCalls?.(j.toolCalls);
    }
    if (typeof j?.content === "string" && j.content) {
      out.text = j.content;
      h.onDelta?.(j.content);
    }
    out.usage = j?.usage;
    out.latencyMs = j?.latencyMs;
    h.onDone?.({ content: out.text, usage: out.usage, latencyMs: out.latencyMs });
    return out;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    out.error = "Empty response body";
    h.onError?.(out.error);
    return out;
  }

  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const raw of frame.split("\n")) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          let data: StreamEvent;
          try {
            data = JSON.parse(line.slice(5).trim()) as StreamEvent;
          } catch {
            continue;
          }
          if (!data) continue;
          if (typeof data.delta === "string" && data.delta) {
            out.text += data.delta;
            h.onDelta?.(data.delta);
          } else if (data.type === "stage") {
            h.onStage?.(data.stage || "", data.label || "");
          } else if (data.type === "notice") {
            h.onNotice?.(data.message || "");
          } else if (data.type === "toolCalls" && data.toolCalls?.length) {
            out.toolCalls = data.toolCalls;
            h.onToolCalls?.(data.toolCalls);
          } else if (data.type === "done") {
            out.usage = data.usage;
            out.latencyMs = data.latencyMs;
            if (!out.text && typeof data.content === "string") {
              out.text = data.content;
              h.onDelta?.(data.content);
            }
            h.onDone?.({ content: out.text, usage: data.usage, latencyMs: data.latencyMs });
          } else if (data.type === "aborted") {
            out.aborted = true;
            h.onAborted?.();
          } else if (data.type === "error") {
            const message: string = data.error || "Chat failed";
            out.error = message;
            h.onError?.(message);
          }
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return out;
}
