/**
 * Minimal ANSI renderer for the MEDUSA terminal.
 *
 * Supports SGR (colors, bold/dim/italic/underline/invert) — by far the most
 * common family — and strips every other escape sequence (cursor moves, OSC,
 * etc.) so output can never smuggle layout into the app shell.
 */

export interface AnsiRun {
  text: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  invert?: boolean;
}

/** The 16-color palette the terminal renders with (dark-enough for both light
 *  and dark app themes; the terminal surface is dark in every theme). */
const PAL: Record<number, string> = {
  0: "#5b6272",
  1: "#ef5a68",
  2: "#4ade80",
  3: "#fbbf24",
  4: "#60a5fa",
  5: "#c084fc",
  6: "#22d3ee",
  7: "#e5e7eb",
};
const PAL_BRIGHT: Record<number, string> = {
  0: "#8b93a7",
  1: "#ff6b77",
  2: "#6cf79a",
  3: "#ffd76e",
  4: "#7cc3ff",
  5: "#d9a5ff",
  6: "#5eeaf5",
  7: "#ffffff",
};
const BG: Record<number, string> = {
  0: "#1a1d26",
  1: "#7f1d1d",
  2: "#14532d",
  3: "#78350f",
  4: "#1e3a8a",
  5: "#5b21b6",
  6: "#155e75",
  7: "#374151",
};

const isFiniteDigit = (s: string) => /^\d+$/.test(s);

export function tokenizeAnsi(input: string): AnsiRun[] {
  const runs: AnsiRun[] = [];
  let cur: AnsiRun = { text: "" };
  const flush = () => {
    if (cur.text) runs.push(cur);
    cur = { ...cur, text: "" };
  };

  let i = 0;
  const n = input.length;
  while (i < n) {
    const ch = input[i];
    if (ch !== "\u001b") {
      cur.text += ch;
      i++;
      continue;
    }
    const next = input[i + 1];
    if (next === "[") {
      // CSI … final-byte
      let j = i + 2;
      let params = "";
      while (j < n) {
        const c = input.charCodeAt(j);
        if (c >= 0x40 && c <= 0x7e) break;
        params += input[j];
        j++;
      }
      const final = input[j];
      if (final === "m") {
        flush();
        applySgr(params, cur);
      }
      i = j < n ? j + 1 : n;
      continue;
    }
    if (next === "]") {
      // OSC … BEL or ST
      let j = i + 2;
      while (j < n && !(input[j] === "\u0007" || (input[j] === "\u001b" && input[j + 1] === "\\"))) j++;
      i = j >= n ? n : input[j] === "\u0007" ? j + 1 : j + 2;
      continue;
    }
    // ESC single-char sequences
    i += 2;
  }
  flush();
  return runs;
}

function applySgr(params: string, run: AnsiRun): void {
  const codes = params.trim().length === 0 ? [0] : params.split(";").filter(isFiniteDigit).map(Number);
  for (const c of codes.length === 0 ? [0] : codes) {
    if (c === 0) {
      run.fg = undefined;
      run.bg = undefined;
      run.bold = false;
      run.dim = false;
      run.italic = false;
      run.underline = false;
      run.invert = false;
    } else if (c === 1) run.bold = true;
    else if (c === 2) run.dim = true;
    else if (c === 3) run.italic = true;
    else if (c === 4) run.underline = true;
    else if (c === 7) run.invert = true;
    else if (c === 22) {
      run.bold = false;
      run.dim = false;
    } else if (c === 23) run.italic = false;
    else if (c === 24) run.underline = false;
    else if (c === 27) run.invert = false;
    else if (c >= 30 && c <= 37) run.fg = PAL[c - 30];
    else if (c >= 90 && c <= 97) run.fg = PAL_BRIGHT[c - 90];
    else if (c === 39) run.fg = undefined;
    else if (c >= 40 && c <= 47) run.bg = BG[c - 40];
    else if (c >= 100 && c <= 107) run.bg = BG[c - 100];
    else if (c === 49) run.bg = undefined;
    // 38;5;n / 38;2;r;g;b and 256/bg indexes: rendered as accent-less default
    else if (c === 38 || c === 48) break;
  }
}

/** Lose every escape — used for plain-text contexts (history search, AI transcript). */
export function stripAnsi(input: string): string {
  return input
    // csi sequences
    .replace(/\u001b\[[0-?]*[ -\/]*[@-~]/g, "")
    // osc sequences
    .replace(/\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)?/g, "")
    .replace(/\u001b[@-Z\\-_]/g, "");
}
