// Recap: "It acts. It connects. It learns. It remembers. It multiplies. It's not a chatbot anymore. It's your team."
// Three beats in place: the list of five verbs, the crossed-out chatbot, then the team. This is the emotional peak of the reel:
// everything builds from the second "It's", and Reel.tsx holds the scene 16 frames longer to leave time to read "your team".
import {interpolate, interpolateColors, random, useCurrentFrame} from 'remotion';
import {CLAMP, cueEnd, cues, EASE_IN, EASE_IN_OUT, EASE_OUT, fall, flash, phase, pop, rise} from '../anim';
import {C, cardStyle, Check, DISPLAY, Icon, Mascot, MONO, type Sfx} from '../kit';

const c = cues('recap');
const end = cueEnd('recap');

const T = {
  acts: c('acts'),
  connects: c('connects'),
  learns: c('learns'),
  remembers: c('remembers'),
  multiplies: c('multiplies'),
  notA: c("It's"), // first "It's": "It's not a chatbot anymore"
  chatbot: c('chatbot'),
  itsTeam: c("It's", 2), // second "It's": "It's your team"
  your: c('your'),
  team: c('team'),
};
const WAVE = T.multiplies + 9; // flash of light that runs down the whole list
const LIST_OUT = T.notA - 2; // the list fades and slides up
const BUBBLE_IN = T.chatbot - 3;
const STRIKE = T.chatbot + 4; // the red line starts once the word is said
const STRUCK = STRIKE + 7; // the line is done: the bubble takes the hit
const BUBBLE_OUT = end('chatbot') + 3;
const TEAM = T.itsTeam - 1; // first mascot
const BURST = T.team - 1; // the pill opens, everything bursts

const LIST = {x: 30, w: 900, top: 66, h: 104, gap: 12}; // 5 rows: y 66 to 634
const LINES = [
  {verb: 'acts', tag: 'The app', at: T.acts},
  {verb: 'connects', tag: 'Connectors', at: T.connects},
  {verb: 'learns', tag: 'Skills', at: T.learns},
  {verb: 'remembers', tag: 'Instructions', at: T.remembers},
  {verb: 'multiplies', tag: 'Agents', at: T.multiplies},
];

const BUBBLE = {x: 480, y: 340, w: 560, h: 190}; // x 200 to 760

// The row: taller in the middle, like a team photo. x 84 to 876. Each list row's number ends up on a jersey.
const FEET = 630;
const MATES = [
  {x: 144, h: 198, seed: 2, late: 6, jump: 7},
  {x: 312, h: 210, seed: 4, late: 3, jump: 3},
  {x: 480, h: 226, seed: 1, late: 0, jump: 0},
  {x: 648, h: 210, seed: 6, late: 4, jump: 4},
  {x: 816, h: 198, seed: 9, late: 7, jump: 6},
];
const HOP = {from: BURST - 1, len: 15, high: 58};

const PILL = {y: 128, h: 156, font: 112, pad: 56, gap: 30, hide: 300}; // hide: width of "TEAM" plus the gap before it (estimated, check on a still)
const PILL_CY = PILL.y + PILL.h / 2;

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
  const next = i < LINES.length - 1 ? LINES[i + 1].at : T.notA;
  const hot = phase(frame, l.at - 2, next - 2, 3, 10);
  const wave = flash(frame, WAVE + i * 3, 10);
  const lit = Math.max(hot, wave);
  const out = fall(frame, LIST_OUT + i, 9);
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
        gap: 24,
        padding: '0 26px',
        border: `2px solid rgba(95,227,193,${0.12 + 0.6 * lit})`,
        boxShadow: `0 0 ${34 * lit}px rgba(95,227,193,${0.3 * lit}), 0 16px 40px rgba(0,0,0,0.35)`,
        opacity: Math.min(1, k * 2.5) * out,
        translate: `${(1 - k) * -150}px ${(1 - out) * -60}px`,
      }}
    >
      <div style={{width: 68, height: 68, flex: 'none', borderRadius: 20, background: C.mint, color: C.bg, display: 'grid', placeItems: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: 44, scale: 0.7 + 0.3 * pop(frame, l.at, 30, 10, 260), boxShadow: `0 0 ${26 * hot}px rgba(95,227,193,0.55)`}}>{i + 1}</div>
      <span style={{flex: 1, fontFamily: DISPLAY, fontWeight: 700, fontSize: 56, letterSpacing: '-0.015em', color: interpolateColors(hot, [0, 1], ['#FFFFFF', C.mint]), whiteSpace: 'nowrap'}}>
        <span style={{color: 'rgba(255,255,255,0.58)'}}>{'It '}</span>
        {l.verb}
      </span>
      <span style={{fontFamily: MONO, fontWeight: 500, fontSize: 28, color: C.muted, whiteSpace: 'nowrap'}}>{l.tag}</span>
      <Check k={pop(frame, l.at + 5, 30, 11, 230)} size={52} />
    </div>
  );
};

// The chat bubble and the red line drawn over it
const Chatbot: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < BUBBLE_IN || frame > BUBBLE_OUT + 9) {
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
        <Icon name="bot" size={88} color={C.bg} stroke={2.2} />
        <span style={{fontFamily: DISPLAY, fontWeight: 700, fontSize: 92, letterSpacing: '-0.02em', whiteSpace: 'nowrap'}}>Chatbot</span>
      </div>
      <svg width={960} height={700} viewBox="0 0 960 700" style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', filter: 'drop-shadow(0 0 14px rgba(255,107,107,0.75))'}}>
        <path d="M 148 468 Q 470 376 814 212" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} fill="none" stroke={C.red} strokeWidth={22} strokeLinecap="round" opacity={draw > 0 ? 1 : 0} />
      </svg>
    </div>
  );
};

// The light rises with the team, then everything lights up at once on "team"
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

// Sparks flying out of the pill. Fixed by random('seed'): same render every time.
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
  // repeated hops spreading from the center: squashed on the ground, stretched going up
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
        <div style={{position: 'absolute', left: m.x - 23, top: feet - m.h * 0.17 - 23, width: 46, height: 46, borderRadius: 99, background: C.mint, color: C.bg, display: 'grid', placeItems: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: 30, boxShadow: '0 3px 8px rgba(0,0,0,0.35)'}}>{i + 1}</div>
      </div>
    </>
  );
};

// "YOUR" first, centered; on "team" the pill opens and slams. A clip, not an animated width:
// the final pill keeps its real size whatever the text measures, and the word stays hidden while it is closed.
const TeamPill: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < T.your - 2) {
    return null;
  }
  const k = pop(frame, T.your - 2, 30, 10, 240);
  const wide = pop(frame, BURST - 1, 30, 12, 220);
  const hide = Math.max(0, 1 - wide) * PILL.hide;
  const slam = 1 + 0.1 * flash(frame, BURST + 1, 12);
  return (
    <>
      <div style={{position: 'absolute', left: 20, top: PILL_CY - 160, width: 920, height: 320, background: 'radial-gradient(50% 50% at 50% 50%, rgba(95,227,193,0.42), transparent 100%)', opacity: Math.min(1, k) * (0.45 + 0.55 * Math.min(1, wide)), scale: 0.6 + 0.4 * Math.min(1, wide)}} />
      <div style={{position: 'absolute', left: 0, right: 0, top: PILL.y, height: PILL.h, display: 'flex', justifyContent: 'center'}}>
        <div style={{scale: (0.4 + 0.6 * k) * slam, opacity: Math.min(1, k * 3), translate: `${hide / 2}px 0px`, clipPath: `inset(0px ${hide}px 0px 0px round ${PILL.h / 2}px)`}}>
          <div style={{height: PILL.h, display: 'flex', alignItems: 'center', gap: PILL.gap, padding: `0 ${PILL.pad}px`, borderRadius: PILL.h / 2, background: C.mint, color: C.bg, fontFamily: DISPLAY, fontWeight: 700, fontSize: PILL.font, lineHeight: 1, letterSpacing: '0.01em', whiteSpace: 'nowrap', boxShadow: 'inset 0 4px 0 rgba(255,255,255,0.4), inset 0 -6px 0 rgba(10,17,24,0.12)'}}>
            <span>YOUR</span>
            <span style={{opacity: Math.min(1, wide * 3)}}>TEAM</span>
          </div>
        </div>
      </div>
    </>
  );
};

export const Recap: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      {frame < LIST_OUT + 14 ? LINES.map((l, i) => <Line key={l.verb} l={l} i={i} />) : null}
      <Chatbot />
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
  {name: 'pop-high', at: BUBBLE_IN - 2, vol: 0.22},
  {name: 'whoosh-short', at: STRIKE - 3, vol: 0.2},
  {name: 'stamp', at: STRUCK - 2, vol: 0.16},
  ...MATES.map((m) => ({name: 'pop', at: TEAM + m.late - 2, vol: 0.14})),
  {name: 'pop-high', at: T.your - 4, vol: 0.2},
  {name: 'chime', at: BURST - 3, vol: 0.3},
  {name: 'stamp', at: BURST - 2, vol: 0.22},
  {name: 'sparkles', at: BURST - 2, vol: 0.28},
];
