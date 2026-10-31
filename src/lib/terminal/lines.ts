/**
 * LineBuffer — turns streamed chunks (desktop IPC or the NDJSON cloud stream)
 * into display lines with sane handling of `\r\n`, lone `\r` (progress-bar
 * overwrites rewrite the current line) and backspaces. ANSI tokens are derived
 * at render time by the view, so the buffer stays pure text.
 */

export interface TerminalLine {
  id: number;
  kind: "out" | "err" | "sys" | "echo" | "ai";
  text: string;
  /** suggestion chips (AI answers) keyed to printable commands */
  chips?: { command: string; label: string }[];
}

const MAX_LINES = 1500;

export class LineBuffer {
  lines: TerminalLine[] = [];
  /** partial line carried between chunks; `\r` restarts it */
  private pending = "";
  private pendingKind: TerminalLine["kind"] = "out";
  /** true once a nonzero-carriage line is being built */
  private pendingActive = false;
  private nextId = 1;

  constructor(private base: TerminalLine["kind"] = "out") {}

  append(chunk: string, kind = this.base): void {
    for (const segment of chunk.split("\n")) {
      const carriage = segment.split("\r");
      for (let p = 0; p < carriage.length; p++) {
        const text = carriage[p];
        if (p > 0) {
          // CR restarts the visual line (progress bars overwrite themselves)
          this.pending = "";
          this.pendingActive = true;
        }
        if (!text) continue;
        if (text.includes("\b")) {
          for (const ch of text) {
            if (ch === "\b") this.pending = this.pending.slice(0, -1);
            else this.pending += ch;
          }
        } else {
          this.pending += text;
        }
        this.pendingKind = kind;
        if (p > 0 && text) this.pendingActive = true;
      }
      // A \n terminated (or opened) this line
      this.commitLine();
    }
  }

  private commitLine(): void {
    this.lines.push({ id: this.nextId++, kind: this.pendingKind, text: this.pending });
    this.pending = "";
    this.pendingActive = false;
    this.pendingKind = this.base;
    if (this.lines.length > MAX_LINES) {
      this.lines = this.lines.slice(this.lines.length - MAX_LINES);
    }
  }

  /** Echo an immediate line (prompt echo, system notices) — commits instantly. */
  push(text: string, kind: TerminalLine["kind"], chips?: { command: string; label: string }[]): void {
    this.flush();
    this.lines.push({ id: this.nextId++, kind, text, chips: chips?.length ? chips : undefined });
    if (this.lines.length > MAX_LINES) {
      this.lines = this.lines.slice(this.lines.length - MAX_LINES);
    }
  }

  /** Commit any partially streamed line (end of an AI answer, end of run). */
  flush(): void {
    if (this.pendingActive || this.pending !== "") this.commitLine();
  }

  snapshot(): TerminalLine[] {
    if (this.pendingActive || this.pending) {
      return [...this.lines, { id: 0, kind: this.pendingKind, text: this.pending }];
    }
    return [...this.lines];
  }

  clear(): void {
    this.lines = [];
    this.pending = "";
    this.pendingActive = false;
  }
}

/** Plain-text view of the buffer for AI transcripts, oldest → newest. */
export function textOf(lines: TerminalLine[]): string[] {
  return lines.filter((l) => l.kind !== "echo").map((l) => l.text);
}
