// Recap, driven by reel.json (CONFIG.recap): the list of elements, what the reel buries (optional), then the peak.
// Three beats in place. This is the emotional peak of the reel: everything builds up just before peak.word,
// and Reel.tsx holds the scene 16 more frames to leave time to read the pill.
// Full example with 5 lines: assets/example-this-voice/scenes/Recap.tsx.
import {interpolate, interpolateColors, random, useCurrentFrame} from 'remotion';
import {CLAMP, cueEnd, cues, EASE_IN, EASE_IN_OUT, EASE_OUT, fall, flash, phase, pop, rise} from '../anim';
import {CONFIG} from '../data';
import {C, cardStyle, Check, DISPLAY, Icon, Mascot, MONO, type Sfx} from '../kit';

const c = cues('recap');
const end = cueEnd('recap');

const LINES = CONFIG.recap.lines.map((l) => ({...l, at: c(l.word, l.n)}));
const N = LINES.length;
const LAST = LINES[N - 1];
const STRIKE_CFG = CONFIG.recap.strike; // without a strike, the bubble cues are not used
const PEAK = c(CONFIG.recap.peak.word, CONFIG.recap.peak.n);

const WAVE = LAST.at + 9; // flash of light that runs down the whole list
const STRIKE_WORD = STRIKE_CFG ? c(STRIKE_CFG.word) : 0;
const BUBBLE_IN = STRIKE_WORD - 3;
const STRIKE = STRIKE_WORD + 4; // the red line starts once the word is read
const STRUCK = STRIKE + 7; // the line is done: the bubble takes the hit
const BUBBLE_OUT = STRIKE_CFG ? end(STRIKE_CFG.word) + 3 : 0;
const TEAM = PEAK - 14; // first mascot
const BURST = PEAK - 1; // the pill opens, everything bursts

// The list fades and moves up: early if there is a bubble, just before the peak otherwise, never before the end of the last line
const LIST_END = end(LAST.word, LAST.n) + 3;
const LIST_TARGET = STRIKE_CFG ? STRIKE_WORD - 36 : TEAM - 12;
const LIST_LIMIT = STRIKE_CFG ? BUBBLE_IN - 4 : TEAM - 2;
const LIST_OUT = Math.min(LIST_LIMIT, Math.max(LIST_END, LIST_TARGET));

// N lines in 568 px (y 66 to 634). With 5 lines: height 104, gap 12, as in the original, and E = 1.
const GAP = Math.round(60 / N);
const H = Math.round((568 - (N - 1) * GAP) / N);
const E = Math.min(1.25, H / 104);
const STACKED = H >= 120; // tall lines (3 or 4): the tag goes under the text, which can grow
const LIST = {
  x: 30,
  w: 900,
  top: 66,
  h: H,
  gap: GAP,
  pad: Math.round(26 * E),
  inner: Math.round(24 * E),
  badge: Math.round(68 * E),
  badgeFont: Math.round(44 * E),
  radius: Math.round(20 * E),
  check: Math.round(52 * E),
  tag: Math.max(28, Math.round(28 * E)),
};

// Shared text size: a long line shrinks the whole list rather than overflowing onto its tag
const TEXT_EM = 0.57; // Space Grotesk 700, mixed case, average character width
const MONO_EM = 0.6; // IBM Plex Mono
const fitText = (l: (typeof LINES)[number]) => {
  const tag = STACKED ? 0 : l.tag.length * LIST.tag * MONO_EM + LIST.inner;
  return (LIST.w - 2 * LIST.pad - LIST.badge - LIST.check - 2 * LIST.inner - tag) / (l.text.length * TEXT_EM);
};
const FONT = Math.max(30, Math.floor(Math.min(56 * E, ...LINES.map(fitText))));

// The bubble fits its word; for "Chatbot": 560 wide and size 92. The line follows the width, without leaving the window.
const BUBBLE_FONT = STRIKE_CFG ? Math.max(40, Math.min(92, Math.floor(594 / (STRIKE_CFG.text.length * 0.58)))) : 92;
const BUBBLE_W = STRIKE_CFG ? Math.min(780, Math.max(420, Math.round(186 + STRIKE_CFG.text.length * BUBBLE_FONT * 0.58))) : 560;
const BUBBLE = {x: 480, y: 340, w: BUBBLE_W, h: 190, font: BUBBLE_FONT};
const BUBBLE_S = BUBBLE.w / 560;
const STRIKE_PATH = `M ${480 - 332 * BUBBLE_S} 468 Q ${480 - 10 * BUBBLE_S} 376 ${480 + 334 * BUBBLE_S} 212`;

// The row: taller in the center, like a team photo. x 84 to 876. Each line number shows on a jersey when there are 5 lines.
const FEET = 630;
const MATES = [
  {x: 144, h: 198, seed: 2, late: 6, jump: 7},
  {x: 312, h: 210, seed: 4, late: 3, jump: 3},
  {x: 480, h: 226, seed: 1, late: 0, jump: 0},
  {x: 648, h: 210, seed: 6, late: 4, jump: 4},
  {x: 816, h: 198, seed: 9, late: 7, jump: 6},
];
const JERSEYS = N === MATES.length;
const HOP = {from: BURST - 1, len: 15, high: 58};

// Pill: estimated width (Space Grotesk 700 in capitals, about 0.66 em); past 900 px the size shrinks, margins included.
const BEFORE = CONFIG.recap.peak.before.toUpperCase();
const ACCENT = CONFIG.recap.peak.accent.toUpperCase();
const PILL_EM = 0.66;
const PILL_MEASURE = (BEFORE.length + ACCENT.length) * PILL_EM + 1 + (BEFORE ? 30 / 112 : 0); // in em, for a size of 112
const PILL_FONT = Math.max(28, Math.min(112, Math.floor(900 / PILL_MEASURE)));
const PILL_E = PILL_FONT / 112;
const PILL_CY = 206;
const PILL = {h: Math.max(112, Math.round(156 * PILL_E)), font: PILL_FONT, pad: Math.round(56 * PILL_E), gap: Math.round(30 * PILL_E), accent: ACCENT.length * PILL_EM * PILL_FONT};
const PILL_IN = BEFORE ? PEAK - 10 : BURST - 1; // without "before", nothing to show before the opening

const SPARK_COLORS = [C.mint, C.gold, '#FFFFFF', C.violet];
const SPARKS = new Array(40).fill(0).map((_, i) => ({
  a: random(`team-a${i}`) * Math.PI * 2,
  d: 0.45 + random(`team-d${i}`) * 0.55,
  r: 5 + random(`team-r${i}`) * 7,
  late: random(`team-l${i}`) * 4,
  color: SPARK_COLORS[i % SPARK_COLORS.length],
}));

const Line: React.FC<{readonly l: (typeof LINES)[number]; readonly i: number}> = ({l, i}) => {
  const frame = useCurrentFrame();
  const k = pop(frame, l.at - 2, 30, 12, 260);
  const next = i < N - 1 ? LINES[i + 1].at : LIST_OUT + 2;
  const hot = phase(frame, l.at - 2, next - 2, 3, 10);
  const wave = flash(frame, WAVE + i * 3, 10);
  const lit = Math.max(hot, wave);
  const out = fall(frame, LIST_OUT + i, 9);
  // first word dimmed, the rest in the verb style
  const cut = l.text.indexOf(' ');
  const lead = cut > 0 ? l.text.slice(0, cut + 1) : '';
  const verb = cut > 0 ? l.text.slice(cut + 1) : l.text;
  return (
    <div
      style={{
        ...cardStyle,
        position: 'absolute',
        left: LIST.x,
        top: LIST.top + i * (LIST.h + LIST.gap),
        width: LIST.w,
        height: LIST.h,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: LIST.inner,
        padding: `0 ${LIST.pad}px`,
        border: `2px solid rgba(95,227,193,${0.12 + 0.6 * lit})`,
        boxShadow: `0 0 ${34 * lit}px rgba(95,227,193,${0.3 * lit}), 0 16px 40px rgba(0,0,0,0.35)`,
        opacity: Math.min(1, k * 2.5) * out,
        translate: `${(1 - k) * -150}px ${(1 - out) * -60}px`,
      }}
    >
      <div style={{width: LIST.badge, height: LIST.badge, flex: 'none', borderRadius: LIST.radius, background: C.mint, color: C.bg, display: 'grid', placeItems: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: LIST.badgeFont, scale: 0.7 + 0.3 * pop(frame, l.at, 30, 10, 260), boxShadow: `0 0 ${26 * hot}px rgba(95,227,193,0.55)`}}>{i + 1}</div>
      <div style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: STACKED ? 'column' : 'row', alignItems: STACKED ? 'flex-start' : 'center', gap: STACKED ? 2 : LIST.inner}}>
        <span style={{flex: STACKED ? 'none' : 1, fontFamily: DISPLAY, fontWeight: 700, fontSize: FONT, lineHeight: STACKED ? 1.12 : undefined, letterSpacing: '-0.015em', color: interpolateColors(hot, [0, 1], ['#FFFFFF', C.mint]), whiteSpace: 'nowrap'}}>
          {lead ? <span style={{color: 'rgba(255,255,255,0.58)'}}>{lead}</span> : null}
          {verb}
        </span>
        <span style={{fontFamily: MONO, fontWeight: 500, fontSize: LIST.tag, lineHeight: STACKED ? 1.1 : undefined, color: C.muted, whiteSpace: 'nowrap'}}>{l.tag}</span>
      </div>
      <Check k={pop(frame, l.at + 5, 30, 11, 230)} size={LIST.check} />
    </div>
  );
};

// The chat bubble and the red line drawn over it
const Strike: React.FC = () => {
  const frame = useCurrentFrame();
  if (!STRIKE_CFG || frame < BUBBLE_IN || frame > BUBBLE_OUT + 9) {
    return null;
  }
  const k = pop(frame, BUBBLE_IN, 30, 11, 220);
  const draw = interpolate(frame, [STRIKE, STRUCK], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  const struck = rise(frame, STRUCK - 1, 5);
  const t = frame - STRUCK;
  const shake = t >= 0 && t < 10 ? Math.sin(t * 2) * 9 * (1 - t / 10) : 0;
  const gone = interpolate(frame, [BUBBLE_OUT, BUBBLE_OUT + 8], [0, 1], {...CLAMP, easing: EASE_IN});
  return (
    <div style={{position: 'absolute', inset: 0, transformOrigin: `${BUBBLE.x}px ${BUBBLE.y}px`, scale: (0.6 + 0.4 * k) * (1 - 0.3 * gone), rotate: `${-2 * struck}deg`, opacity: Math.min(1, k * 2) * (1 - gone)}}>
      <div
        style={{
          position: 'absolute',
          left: BUBBLE.x - BUBBLE.w / 2,
          top: BUBBLE.y - BUBBLE.h / 2,
          width: BUBBLE.w,
          height: BUBBLE.h,
          borderRadius: 52,
          borderBottomLeftRadius: 12,
          background: interpolateColors(struck, [0, 1], ['#FFFFFF', '#B9C3CF']),
          color: C.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
          translate: `${shake}px 0px`,
        }}
      >
        <Icon name={/bot/i.test(STRIKE_CFG.text) ? 'bot' : 'message'} size={88} color={C.bg} stroke={2.2} />
        <span style={{fontFamily: DISPLAY, fontWeight: 700, fontSize: BUBBLE.font, letterSpacing: '-0.02em', whiteSpace: 'nowrap'}}>{STRIKE_CFG.text}</span>
      </div>
      <svg width={960} height={700} viewBox="0 0 960 700" style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', filter: 'drop-shadow(0 0 14px rgba(255,107,107,0.75))'}}>
        <path d={STRIKE_PATH} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} fill="none" stroke={C.red} strokeWidth={22} strokeLinecap="round" opacity={draw > 0 ? 1 : 0} />
      </svg>
    </div>
  );
};

// The light rises with the team, then everything lights up at once on the peak word
const TeamLight: React.FC = () => {
  const frame = useCurrentFrame();
  const k = rise(frame, TEAM, 14);
  const hit = flash(frame, BURST, 22);
  return (
    <>
      <div style={{position: 'absolute', left: -120, right: -120, top: 150, height: 600, background: 'radial-gradient(50% 50% at 50% 50%, rgba(95,227,193,0.3), transparent 100%)', opacity: k}} />
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, background: `radial-gradient(70% 62% at 50% ${(PILL_CY / 700) * 100}%, rgba(191,251,234,0.42), transparent 100%)`, opacity: hit}} />
    </>
  );
};

const Shockwave: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < BURST || frame > BURST + 18) {
    return null;
  }
  const t = interpolate(frame, [BURST, BURST + 18], [0, 1], {...CLAMP, easing: EASE_OUT});
  return <div style={{position: 'absolute', left: 480 - 560, top: PILL_CY - 200, width: 1120, height: 400, boxSizing: 'border-box', borderRadius: '50%', border: `7px solid ${C.mint}`, opacity: 1 - t, scale: 0.5 + 0.7 * t}} />;
};

// Sparks flying from the pill. Fixed by random('seed'): same render every time.
const Sparks: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < BURST) {
    return null;
  }
  return (
    <>
      {SPARKS.map((s, i) => {
        const t = (frame - BURST - s.late) / 22;
        if (t <= 0 || t >= 1) {
          return null;
        }
        const e = EASE_OUT(t);
        const x = 480 + Math.cos(s.a) * s.d * 560 * e;
        const y = PILL_CY + Math.sin(s.a) * s.d * 380 * e + t * t * 140;
        return <div key={`spark-${i}`} style={{position: 'absolute', left: x - s.r, top: y - s.r, width: s.r * 2, height: s.r * 2, borderRadius: i % 2 === 0 ? 99 : 3, rotate: `${s.a * 60 + frame * 14}deg`, background: s.color, opacity: 1 - t * t}} />;
      })}
    </>
  );
};

const Mate: React.FC<{readonly m: (typeof MATES)[number]; readonly i: number}> = ({m, i}) => {
  const frame = useCurrentFrame();
  const at = TEAM + m.late;
  if (frame < at) {
    return null;
  }
  const k = pop(frame, at, 30, 10, 200);
  // repeated hops starting from the center: squashed on the ground, stretched going up
  const t = frame - (HOP.from + m.jump);
  const u = t >= 0 ? (t % HOP.len) / HOP.len : 0;
  const air = t >= 0 ? Math.sin(Math.PI * u) : 0;
  const near = Math.max(0, 1 - Math.min(u, 1 - u) / 0.14);
  const sy = t >= -2 ? 1 + 0.09 * Math.sin(2 * Math.PI * u) ** 2 - 0.1 * near : 1;
  const feet = FEET + (1 - k) * 280 - air * HOP.high;
  const w = (m.h * 528) / 866;
  return (
    <>
      {/* the shadow stays on the ground during the hop */}
      <div style={{position: 'absolute', left: m.x - w * 0.42, top: FEET - 12, width: w * 0.84, height: 24, borderRadius: '50%', background: 'radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,0.6), transparent 100%)', opacity: Math.min(1, k) * (1 - 0.6 * air), scale: 1 - 0.35 * air}} />
      <div style={{position: 'absolute', inset: 0, transformOrigin: `${m.x}px ${feet}px`, transform: `scale(${1 / sy}, ${sy})`}}>
        <Mascot x={m.x} feet={feet} h={m.h} seed={m.seed} mood="happy" look={[(2 - i) * 0.2, -0.5]} tilt={Math.sin(2 * Math.PI * u) * 5} shadow={false} />
        {JERSEYS ? <div style={{position: 'absolute', left: m.x - 23, top: feet - m.h * 0.17 - 23, width: 46, height: 46, borderRadius: 99, background: C.mint, color: C.bg, display: 'grid', placeItems: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: 30, boxShadow: '0 3px 8px rgba(0,0,0,0.35)'}}>{i + 1}</div> : null}
      </div>
    </>
  );
};

// `before` first, centered; on peak.word the pill opens and slams. The reel.json text is not measured:
// the accent band goes from 0 to its natural width (generous cap, 1.4 x the estimate), so the closed pill
// stays symmetric and the open pill keeps its real size. As tall as the pill so accented letters are not cut.
const TeamPill: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < PILL_IN) {
    return null;
  }
  const k = pop(frame, PILL_IN, 30, 10, 240);
  const wide = BEFORE ? pop(frame, BURST - 1, 30, 12, 220) : k;
  const slam = 1 + 0.1 * flash(frame, BURST + 1, 12);
  return (
    <>
      <div style={{position: 'absolute', left: 20, top: PILL_CY - 160, width: 920, height: 320, background: 'radial-gradient(50% 50% at 50% 50%, rgba(95,227,193,0.42), transparent 100%)', opacity: Math.min(1, k) * (0.45 + 0.55 * Math.min(1, wide)), scale: 0.6 + 0.4 * Math.min(1, wide)}} />
      <div style={{position: 'absolute', left: 0, right: 0, top: PILL_CY - PILL.h / 2, height: PILL.h, display: 'flex', justifyContent: 'center'}}>
        <div style={{scale: (0.4 + 0.6 * k) * slam, opacity: Math.min(1, k * 3), height: PILL.h, display: 'flex', alignItems: 'center', padding: `0 ${PILL.pad}px`, borderRadius: PILL.h / 2, background: C.mint, color: C.bg, fontFamily: DISPLAY, fontWeight: 700, fontSize: PILL.font, lineHeight: 1, letterSpacing: '0.01em', whiteSpace: 'nowrap', boxShadow: 'inset 0 4px 0 rgba(255,255,255,0.4), inset 0 -6px 0 rgba(10,17,24,0.12)'}}>
          {BEFORE ? <span>{BEFORE}</span> : null}
          <span style={{alignSelf: 'stretch', display: 'flex', alignItems: 'center', marginLeft: BEFORE ? PILL.gap * Math.min(1, wide) : 0, maxWidth: PILL.accent * 1.4 * wide, overflow: 'hidden', opacity: Math.min(1, wide * 3)}}>{ACCENT}</span>
        </div>
      </div>
    </>
  );
};

export const Recap: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      {frame < LIST_OUT + N + 9 ? LINES.map((l, i) => <Line key={`line-${i}`} l={l} i={i} />) : null}
      <Strike />
      {frame >= TEAM ? (
        <>
          <TeamLight />
          <Shockwave />
          <Sparks />
          {MATES.map((m, i) => (
            <Mate key={`mate-${m.seed}`} m={m} i={i} />
          ))}
          <TeamPill />
        </>
      ) : null}
    </>
  );
};

export const recapSfx: Sfx[] = [
  ...LINES.map((l) => ({name: 'pop', at: l.at - 2, vol: 0.22})),
  ...LINES.map((l) => ({name: 'tick', at: l.at + 4, vol: 0.16})),
  {name: 'ding', at: WAVE - 3, vol: 0.14},
  {name: 'whoosh-short', at: LIST_OUT - 3, vol: 0.16},
  ...(STRIKE_CFG
    ? [
        {name: 'pop-high', at: BUBBLE_IN - 2, vol: 0.22},
        {name: 'whoosh-short', at: STRIKE - 3, vol: 0.2},
        {name: 'stamp', at: STRUCK - 2, vol: 0.16},
      ]
    : []),
  ...MATES.map((m) => ({name: 'pop', at: TEAM + m.late - 2, vol: 0.14})),
  ...(BEFORE ? [{name: 'pop-high', at: PILL_IN - 2, vol: 0.2}] : []),
  {name: 'chime', at: BURST - 3, vol: 0.1},
  {name: 'stamp', at: BURST - 2, vol: 0.08},
  {name: 'sparkles', at: BURST - 2, vol: 0.1},
];
