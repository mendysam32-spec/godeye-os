/**
 * Composer key handling, shared by all three chat surfaces.
 *
 * Enter-to-send is a desktop affordance. Phones have no Shift key, so binding
 * Enter to send on touch devices makes a multi-line prompt impossible to write
 * and there is no way to discover the workaround. On a coarse pointer Enter
 * inserts a newline and the Send button does the sending.
 *
 * The check is deliberately media-query based rather than user-agent based:
 * a touchscreen laptop or an iPad with a keyboard should keep desktop
 * behaviour, and `hover: hover` is the honest signal for "has a real pointer".
 */

let cached: boolean | null = null;

/** True when the primary input is a finger rather than a mouse/trackpad. */
export function isCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  if (cached === null) {
    cached = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  }
  return cached;
}

/**
 * Should this keydown produce a send?
 * Enter sends on desktop; Shift+Enter never sends; on touch, neither sends.
 */
export function shouldSendOnEnter(e: {
  key: string;
  shiftKey: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
}): boolean {
  if (e.key !== "Enter") return false;
  if (e.shiftKey) return false;
  return !isCoarsePointer();
}

/** Placeholder suffix matching the current device. */
export function enterHint(): string {
  return isCoarsePointer() ? "" : " · Shift+Enter for newline";
}

/** Footer hint line, kept short on phones. */
export function footerHint(prefix = ""): string {
  const p = prefix ? `${prefix} · ` : "";
  return isCoarsePointer() ? p.replace(/ ·$/, "") : `${p}Enter to send · Shift+Enter newline`;
}

/** Test seam: drop the media-query memo. */
export function __resetPointerCache(): void {
  cached = null;
}
