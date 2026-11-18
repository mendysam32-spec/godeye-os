// Setting 4, instructions: "Fourth setting: instructions. You tell it once how you work.
// Your language, your style, what you never want to see again. It remembers, in every conversation."
// The CLAUDE.md editor fills line by line, folds into a pinned note, and the note is copied into every conversation.
import {interpolate, useCurrentFrame} from 'remotion';
import {CLAMP, cues, EASE_IN_OUT, fall, flash, path, pop, rise, typed} from '../anim';
import {C, cardStyle, Check, ClickRing, DISPLAY, Icon, IconTile, type IconName, MONO, type Sfx, Stamp} from '../kit';

const c = cues('r4');

const T = {
  start: c('Fourth'),
  instructions: c('instructions'),
  you: c('You'),
  tell: c('tell'),
  once: c('once'),
  work: c('work'),
  your: c('Your'),
  language: c('language'),
  your2: c('your', 2),
  style: c('style'),
  what: c('what'),
  you3: c('you', 3),
  never: c('never'),
  see: c('see'),
  remembers: c('remembers'),
  every: c('every'),
  conversation: c('conversation'),
};

// Editor: 900 x 640 card, 30 px margin all around. Six 91 px lines under the tab bar.
const ED = {x: 30, y: 30, w: 900, h: 640, tab: 60, gutter: 76, top: 70, row: 91};
const rowY = (n: number) => ED.top + (n - 1) * ED.row;
const HEAD_SIZE = 38;
const LINE_SIZE = 36;
const ADVANCE = 0.6; // IBM Plex Mono advance width: the caret position is computed to the pixel
const ICON = {x: 92, size: 54};
const HEAD_X = 92;
const TEXT_X = 160; // the longest line (32 chars at 36 px) ends at x 851

type Line = {readonly n: number; readonly text: string; readonly icon: IconName | null; readonly reach: number; readonly at: number; readonly end: number};

// `reach`: the caret reaches the line; `at` to `end`: the text is typed
const LINES: Line[] = [
  {n: 1, text: '# How I work', icon: null, reach: T.start, at: T.instructions - 3, end: T.instructions + 12},
  {n: 2, text: '', icon: null, reach: T.instructions + 14, at: T.instructions + 14, end: T.instructions + 15},
  {n: 3, text: 'Plan everything up front.', icon: 'workflow', reach: T.you - 2, at: T.tell, end: T.work + 2},
  {n: 4, text: 'Answer in English.', icon: 'globe', reach: T.your - 3, at: T.language - 2, end: T.your2 + 2},
  {n: 5, text: 'Write plainly and directly.', icon: 'message', reach: T.your2 + 4, at: T.style - 2, end: T.what + 6},
  {n: 6, text: 'Never use em dashes.', icon: 'x', reach: T.you3, at: T.never - 3, end: T.see - 1},
];
const NEVER = LINES[5];

const STAMP_OUT = T.your - 6; // the stamp clears the space before the next line
const HIT = T.see - 1; // shake of the forbidden line
const SAVED = T.remembers + 10;

// Active line band: it moves down when the caret changes line
const BAND: [number, number, number][] = [[T.start, 0, rowY(1)]];
LINES.slice(1).forEach((l, i) => {
  BAND.push([l.reach, 0, rowY(LINES[i].n)], [l.reach + 5, 0, rowY(l.n)]);
});

// Pinned note. Rotation and float included, it stays between x 33 and x 379, and between y 94 and y 606.
const NOTE = {x: 44, y: 104, w: 324, h: 492, rot: -2.5};
const PIVOT = {x: NOTE.x + NOTE.w / 2, y: NOTE.y + NOTE.h / 2};

// Fan around the note's pivot: the cards come out from behind it and spread.
// Final positions: top y 81 to 265, middle y 286 to 414, bottom y 435 to 619, right edge at x 914 at most.
const CONV = {w: 472, h: 128, r: 472, slot: 186};
const FAN = [
  {a: -22, rot: -7},
  {a: 0, rot: 0},
  {a: 22, rot: 7},
];
const CONV_AT = [T.every - 3, T.every + 2, T.conversation - 1];
const SEND_AT = CONV_AT.map((a) => a + 3);
const LAND = SEND_AT.map((a) => a + 9);
const SEND_FROM = {x: NOTE.x + NOTE.w - 8, y: PIVOT.y};

const fanAt = (i: number, k: number) => {
  const a = (FAN[i].a * k * Math.PI) / 180;
  const r = interpolate(k, [0, 1], [200, CONV.r]);
  return {x: PIVOT.x + Math.cos(a) * r, y: PIVOT.y + Math.sin(a) * r, rot: FAN[i].rot * k};
};

// Center of a card's round slot, once the fan is open
const slotAt = (i: number) => {
  const f = fanAt(i, 1);
  const r = (f.rot * Math.PI) / 180;
  return {x: f.x - Math.cos(r) * CONV.slot, y: f.y - Math.sin(r) * CONV.slot};
};

const shownOf = (l: Line, frame: number) => typed(l.text, frame, l.at, (l.text.length * 30) / (l.end - l.at));

const lineAt = (frame: number) => {
  let cur = LINES[0];
  LINES.forEach((l) => {
    if (frame >= l.reach) {
      cur = l;
    }
  });
  return cur;
};

const shakeAt = (frame: number, amp: number) => {
  const t = frame - HIT;
  return t < 0 || t > 11 ? 0 : Math.sin(t * 2.2) * amp * (1 - t / 12);
};

// One editor line: number, icon, typed text. Line 6 also carries its red band and its shake.
const LineRow: React.FC<{readonly l: Line}> = ({l}) => {
  const frame = useCurrentFrame();
  const num = pop(frame, l.reach - 1, 30, 12, 220);
  const tile = pop(frame, l.at - 3, 30, 11, 230);
  const shown = shownOf(l, frame);
  const isHead = l.n === 1;
  const never = l.n === NEVER.n;
  const current = lineAt(frame).n === l.n;
  const hit = flash(frame, HIT, 18);
  return (
    <div style={{position: 'absolute', left: 0, top: rowY(l.n), width: ED.w, height: ED.row, translate: `${never ? shakeAt(frame, 11) : 0}px 0px`}}>
      {never ? <div style={{position: 'absolute', left: ED.gutter, right: -24, top: 6, bottom: 6, background: `rgba(255,107,107,${0.14 + 0.24 * hit})`, borderLeft: `5px solid ${C.red}`, opacity: rise(frame, l.at, 5)}} /> : null}
      <div style={{position: 'absolute', left: 0, top: 0, width: 58, height: ED.row, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontFamily: MONO, fontWeight: 500, fontSize: 30, color: current ? '#fff' : 'rgba(255,255,255,0.38)', opacity: Math.min(1, num * 2), translate: `${(1 - num) * -14}px 0px`}}>{l.n}</div>
      {l.icon ? <IconTile name={l.icon} size={ICON.size} color={never ? C.bg : C.mint} bg={never ? C.red : 'rgba(95,227,193,0.16)'} style={{position: 'absolute', left: ICON.x, top: (ED.row - ICON.size) / 2, scale: tile * (1 + 0.16 * hit), opacity: Math.min(1, tile * 2)}} /> : null}
      <div style={{position: 'absolute', left: isHead ? HEAD_X : TEXT_X, top: 0, height: ED.row, display: 'flex', alignItems: 'center', fontFamily: MONO, fontWeight: isHead ? 600 : 500, fontSize: isHead ? HEAD_SIZE : LINE_SIZE, color: C.text, whiteSpace: 'pre'}}>
        {isHead ? <span style={{color: C.mint}}>{shown.slice(0, 1)}</span> : null}
        {never ? <span style={{color: C.red, fontWeight: 600}}>{shown.slice(0, 5)}</span> : null}
        {isHead ? shown.slice(1) : never ? shown.slice(5) : shown}
      </div>
    </div>
  );
};

// Text caret: solid while typing, blinking at rest
const Caret: React.FC = () => {
  const frame = useCurrentFrame();
  const l = lineAt(frame);
  const size = l.n === 1 ? HEAD_SIZE : LINE_SIZE;
  const x = (l.icon ? TEXT_X : HEAD_X) + shownOf(l, frame).length * size * ADVANCE;
  const writing = frame >= l.at && frame < l.end;
  const never = l.n === NEVER.n;
  return <div style={{position: 'absolute', left: x + 2 + (never ? shakeAt(frame, 11) : 0), top: rowY(l.n) + (ED.row - 46) / 2, width: 4, height: 46, borderRadius: 2, background: never ? C.red : C.mint, opacity: writing || Math.floor(frame / 9) % 2 === 0 ? 1 : 0.1}} />;
};

// The full-screen editor
const Editor: React.FC = () => {
  const frame = useCurrentFrame();
  const tab = pop(frame, T.instructions - 3, 30, 13, 200);
  const band = path(frame, BAND);
  return (
    <>
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: ED.tab, background: 'rgba(255,255,255,0.035)', borderBottom: `1.5px solid ${C.line}`, overflow: 'hidden'}}>
        <div style={{position: 'absolute', left: 0, top: 0, height: ED.tab, display: 'flex', alignItems: 'center', gap: 12, padding: '0 26px 0 22px', background: 'rgba(255,255,255,0.07)', borderTop: `3px solid ${C.mint}`, boxSizing: 'border-box', opacity: Math.min(1, tab * 2), translate: `0px ${(1 - tab) * ED.tab}px`}}>
          <Icon name="file" size={28} color={C.mint} stroke={2.2} />
          <span style={{fontFamily: MONO, fontWeight: 600, fontSize: 28, color: '#fff', whiteSpace: 'nowrap'}}>CLAUDE.md</span>
        </div>
      </div>
      <div style={{position: 'absolute', left: ED.gutter, top: ED.tab, bottom: 0, width: 1.5, background: C.line}} />
      <div style={{position: 'absolute', left: ED.gutter, right: 0, top: band.y + 6, height: ED.row - 12, background: 'rgba(255,255,255,0.045)'}} />
      {LINES.map((l) => (
        <LineRow key={`line-${l.n}`} l={l} />
      ))}
      <Caret />
      <div style={{opacity: fall(frame, STAMP_OUT, 6)}}>
        <Stamp k={pop(frame, T.once, 30, 11, 240)} size={36} rotate={-5} style={{left: 450, top: 163}}>
          Just once
        </Stamp>
      </div>
    </>
  );
};

// Pin: it drops onto the note and sticks in it
const Pin: React.FC<{readonly k: number}> = ({k}) => (
  <svg width={60} height={60} viewBox="0 0 60 60" style={{position: 'absolute', left: NOTE.w / 2 - 30, top: -26, overflow: 'visible', scale: 1.6 - 0.6 * Math.min(1, k), opacity: Math.min(1, k * 2.5), filter: 'drop-shadow(0 6px 8px rgba(0,0,0,0.55))'}}>
    <circle cx={30} cy={30} r={20} fill={C.mint} />
    <circle cx={24} cy={24} r={6} fill="#fff" opacity={0.75} />
  </svg>
);

// The face of the note: the file in short, its four rules as icons and bars at their real length
const NoteFace: React.FC = () => {
  const frame = useCurrentFrame();
  const k = pop(frame, SAVED, 30, 11, 220);
  return (
    <>
      <div style={{position: 'absolute', left: 0, right: 0, top: 40, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12}}>
        <Icon name="file" size={32} color={C.mint} stroke={2.2} />
        <span style={{fontFamily: MONO, fontWeight: 600, fontSize: 30, color: '#fff', whiteSpace: 'nowrap'}}>CLAUDE.md</span>
      </div>
      <div style={{position: 'absolute', left: 28, right: 28, top: 92, height: 2, background: C.line}} />
      {LINES.filter((l) => l.icon !== null).map((l, i) => {
        const never = l.n === NEVER.n;
        const grow = rise(frame, T.remembers + 5 + i * 2, 8);
        return (
          <div key={`rule-${l.n}`} style={{position: 'absolute', left: 28, top: 110 + i * 64, height: 48, display: 'flex', alignItems: 'center', gap: 14}}>
            {l.icon ? <IconTile name={l.icon} size={46} color={never ? C.bg : C.mint} bg={never ? C.red : 'rgba(95,227,193,0.16)'} /> : null}
            <div style={{width: (l.text.length / 32) * 190 * grow, height: 14, borderRadius: 7, background: never ? C.red : 'rgba(255,255,255,0.3)'}} />
          </div>
        );
      })}
      <div style={{position: 'absolute', left: 0, right: 0, top: 386, display: 'flex', justifyContent: 'center'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 12, height: 72, padding: '0 30px 0 13px', boxSizing: 'border-box', borderRadius: 99, background: 'rgba(95,227,193,0.14)', border: `2.5px solid ${C.mint}`, opacity: Math.min(1, k * 2), scale: 0.7 + 0.3 * k}}>
          <Check k={pop(frame, SAVED + 3, 30, 10, 240)} size={46} />
          <span style={{fontFamily: DISPLAY, fontWeight: 700, fontSize: 38, color: '#fff', whiteSpace: 'nowrap'}}>Saved</span>
        </div>
      </div>
    </>
  );
};

// A conversation card: empty slot, the copy lands in it, check
const ConvCard: React.FC<{readonly i: number}> = ({i}) => {
  const frame = useCurrentFrame();
  const at = CONV_AT[i];
  if (frame < at) {
    return null;
  }
  const k = pop(frame, at, 30, 15, 170);
  const f = fanAt(i, k);
  const landed = frame >= LAND[i];
  const hot = rise(frame, LAND[i], 6);
  return (
    <div style={{...cardStyle, position: 'absolute', left: f.x - CONV.w / 2, top: f.y - CONV.h / 2, width: CONV.w, height: CONV.h, boxSizing: 'border-box', rotate: `${f.rot}deg`, opacity: Math.min(1, k * 2.5), display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', borderColor: landed ? C.mint : C.line, boxShadow: `0 16px 40px rgba(0,0,0,0.35), 0 0 ${34 * hot}px rgba(95,227,193,${0.34 * hot})`}}>
      <div style={{position: 'relative', width: 60, height: 60, flex: 'none'}}>
        <div style={{position: 'absolute', inset: 0, boxSizing: 'border-box', borderRadius: 99, border: '3px dashed rgba(255,255,255,0.36)', opacity: 1 - hot}} />
        {landed ? (
          <div style={{position: 'absolute', inset: 0, borderRadius: 99, background: C.mint, display: 'grid', placeItems: 'center', scale: pop(frame, LAND[i], 30, 10, 260)}}>
            <Icon name="file" size={32} color={C.bg} stroke={2.3} />
          </div>
        ) : null}
      </div>
      <span style={{flex: 1, fontFamily: DISPLAY, fontWeight: 700, fontSize: 36, color: '#fff', whiteSpace: 'nowrap'}}>Conversation {i + 1}</span>
      <Check k={pop(frame, LAND[i] + 1, 30, 10, 240)} size={50} />
    </div>
  );
};

// The copy: a small dot that leaves the note and reaches the card's slot
const Copy: React.FC<{readonly i: number}> = ({i}) => {
  const frame = useCurrentFrame();
  const from = SEND_AT[i];
  const to = LAND[i];
  if (frame < from || frame >= to) {
    return null;
  }
  const slot = slotAt(i);
  const p = path(frame, [
    [from, SEND_FROM.x, SEND_FROM.y],
    [to, slot.x, slot.y],
  ]);
  return (
    <div style={{position: 'absolute', left: p.x - 30, top: p.y - 30, width: 60, height: 60, borderRadius: 99, background: C.mint, display: 'grid', placeItems: 'center', scale: 0.5 + 0.5 * rise(frame, from, 4), boxShadow: '0 0 26px rgba(95,227,193,0.75)'}}>
      <Icon name="file" size={32} color={C.bg} stroke={2.3} />
    </div>
  );
};

export const Setting4: React.FC = () => {
  const frame = useCurrentFrame();
  const m = interpolate(frame, [T.remembers - 5, T.remembers + 11], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  const lerp = (a: number, b: number) => a + (b - a) * m;
  const w = lerp(ED.w, NOTE.w);
  const pulse = Math.max(...SEND_AT.map((s) => flash(frame, s, 10)));
  const halo = Math.max(flash(frame, SAVED, 26), pulse);
  return (
    <>
      {FAN.map((f, i) => (
        <ConvCard key={`conv-${f.a}`} i={i} />
      ))}
      <div style={{position: 'absolute', left: lerp(ED.x, NOTE.x), top: lerp(ED.y, NOTE.y), width: w, height: lerp(ED.h, NOTE.h), rotate: `${NOTE.rot * m}deg`, scale: 1 + 0.02 * pulse, translate: `${shakeAt(frame, 3)}px ${Math.sin(frame / 15) * 3 * m}px`}}>
        <div style={{...cardStyle, position: 'absolute', inset: 0, overflow: 'hidden', boxShadow: `0 16px 40px rgba(0,0,0,0.35), 0 0 ${(30 + 70 * halo) * m}px rgba(95,227,193,${(0.3 + 0.45 * halo) * m})`}}>
          {m < 0.6 ? (
            <div style={{position: 'absolute', left: 0, top: 0, width: ED.w, height: ED.h, transformOrigin: '0 0', scale: w / ED.w, opacity: interpolate(m, [0, 0.5], [1, 0], CLAMP)}}>
              <Editor />
            </div>
          ) : null}
          {m > 0.5 ? (
            <div style={{position: 'absolute', left: 0, top: 0, width: NOTE.w, height: NOTE.h, transformOrigin: '0 0', scale: w / NOTE.w, opacity: interpolate(m, [0.6, 1], [0, 1], CLAMP)}}>
              <NoteFace />
            </div>
          ) : null}
          <div style={{position: 'absolute', inset: 0, borderRadius: 20, border: `2.5px solid ${C.mint}`, opacity: m}} />
        </div>
        {frame >= SAVED - 4 ? <Pin k={pop(frame, SAVED - 4, 30, 11, 240)} /> : null}
      </div>
      {FAN.map((f, i) => (
        <Copy key={`copy-${f.a}`} i={i} />
      ))}
      {FAN.map((f, i) => {
        const slot = slotAt(i);
        return <ClickRing key={`ring-${f.a}`} x={slot.x} y={slot.y} at={LAND[i]} />;
      })}
    </>
  );
};

export const r4Sfx: Sfx[] = [
  {name: 'pop', at: T.instructions - 6, vol: 0.18},
  {name: 'key', at: T.instructions - 3, vol: 0.08},
  {name: 'key', at: T.instructions + 5, vol: 0.08},
  {name: 'pop', at: T.tell - 6, vol: 0.16},
  ...[0, 10, 20, 30].map((d) => ({name: 'key', at: T.tell + d, vol: 0.08})),
  {name: 'stamp', at: T.once + 2, vol: 0.24},
  {name: 'pop', at: LINES[3].at - 5, vol: 0.18},
  {name: 'key', at: LINES[3].at, vol: 0.08},
  {name: 'key', at: LINES[3].at + 8, vol: 0.08},
  {name: 'pop', at: LINES[4].at - 5, vol: 0.18},
  {name: 'key', at: LINES[4].at, vol: 0.08},
  {name: 'key', at: LINES[4].at + 10, vol: 0.08},
  {name: 'pop-high', at: NEVER.at - 5, vol: 0.2},
  {name: 'key', at: NEVER.at, vol: 0.08},
  {name: 'stamp', at: HIT - 1, vol: 0.22},
  {name: 'whoosh-short', at: T.remembers - 7, vol: 0.2},
  {name: 'tick', at: SAVED - 5, vol: 0.16},
  {name: 'ding', at: SAVED - 2, vol: 0.2},
  ...CONV_AT.map((a) => ({name: 'pop', at: a - 3, vol: 0.2})),
  ...LAND.map((a) => ({name: 'tick', at: a - 2, vol: 0.22})),
  {name: 'chime', at: LAND[2] - 1, vol: 0.18},
];
