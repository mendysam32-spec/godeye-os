// Reel animation helpers. All frames are local to the section (see cues()).
import {Easing, interpolate, spring} from 'remotion';
import {SECTIONS, type SectionId, WORDS} from './data';

export const CLAMP = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
export const EASE_IN = Easing.bezier(0.55, 0, 1, 0.45);

const clean = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, '');

// Word cues of a section: c('site') = local frame of the word; c('setting', 2) = 2nd occurrence in the section.
// A missing word throws at render time, so an animation is never timed on a wrong cue.
export const cues = (sec: SectionId) => {
  const s = SECTIONS[sec];
  const list = WORDS.filter((w) => w.f >= s.from && w.f < s.to);
  const fn = (word: string, n = 1): number => {
    const key = clean(word);
    const hits = list.filter((w) => clean(w.t) === key);
    if (hits.length < n) {
      throw new Error(`Cue not found in ${sec}: "${word}" (occurrence ${n})`);
    }
    return hits[n - 1].f - s.from;
  };
  return fn;
};

// End of a word (local frame), to hold a state until the word is over
export const cueEnd = (sec: SectionId) => {
  const s = SECTIONS[sec];
  const list = WORDS.filter((w) => w.f >= s.from && w.f < s.to);
  return (word: string, n = 1): number => {
    const key = clean(word);
    const hits = list.filter((w) => clean(w.t) === key);
    if (hits.length < n) {
      throw new Error(`Cue not found in ${sec}: "${word}" (occurrence ${n})`);
    }
    return hits[n - 1].g - s.from;
  };
};

export const secLen = (sec: SectionId) => SECTIONS[sec].to - SECTIONS[sec].from;

// Spring entrance: 0 to 1 (slight overshoot) from frame `at`
export const pop = (frame: number, at: number, fps = 30, damping = 13, stiffness = 180) => spring({frame: frame - at, fps, config: {damping, stiffness, mass: 0.75}});

// Soft fade in: 0 to 1 over `dur` frames
export const rise = (frame: number, at: number, dur = 12) => interpolate(frame, [at, at + dur], [0, 1], {...CLAMP, easing: EASE_OUT});

// Fade out: 1 to 0 over `dur` frames
export const fall = (frame: number, at: number, dur = 8) => interpolate(frame, [at, at + dur], [1, 0], {...CLAMP, easing: EASE_IN});

// Visibility of a phase [a, b) with fade in and fade out
export const phase = (frame: number, a: number, b: number, inDur = 10, outDur = 8) => Math.min(rise(frame, a, inDur), fall(frame, b - outDur, outDur));

// Highlight glow that fades
export const flash = (frame: number, at: number, dur = 40) => interpolate(frame, [at - 2, at + 3, at + dur], [0, 1, 0], CLAMP);

// Movement by steps: [[frame, x, y], ...], smoothed between steps (cursor, traveling cards)
export const path = (frame: number, keys: [number, number, number][]) => {
  const at = keys.map((k) => k[0]);
  const opt = {...CLAMP, easing: EASE_IN_OUT};
  if (keys.length === 1) {
    return {x: keys[0][1], y: keys[0][2]};
  }
  // interpolate segment by segment so the easing restarts at each step
  let i = 0;
  while (i < keys.length - 2 && frame >= at[i + 1]) {
    i++;
  }
  const [f0, x0, y0] = keys[i];
  const [f1, x1, y1] = keys[i + 1];
  return {x: interpolate(frame, [f0, f1], [x0, x1], opt), y: interpolate(frame, [f0, f1], [y0, y1], opt)};
};

// Characters typed at `cps` characters per second, from frame `at`
export const typed = (text: string, frame: number, at: number, cps = 42) => text.slice(0, Math.max(0, Math.floor(((frame - at) / 30) * cps)));
