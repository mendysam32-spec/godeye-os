// Setting 5: "And the fifth one is where it gets crazy: parallel agents. Claude multiplies.
// One agent writes a scene, another builds the next one, a third checks everything. At the same time."
// Everything transforms in place: the 5 shrinks into Claude, Claude splits, each copy joins its work line.
import {interpolate, useCurrentFrame} from 'remotion';
import {CLAMP, cues, EASE_IN, EASE_IN_OUT, EASE_OUT, fall, flash, pop, rise, typed} from '../anim';
import {BODY, C, cardStyle, Check, ClaudeMark, DISPLAY, Icon, type IconName, Mascot, MONO, type Sfx, Stamp} from '../kit';

const c = cues('r5');

const T = {
  fifth: c('fifth'),
  where: c('where'),
  gets: c('gets'),
  crazy: c('crazy'),
  parallel: c('parallel'),
  agents: c('agents'),
  claude: c('Claude'),
  multiplies: c('multiplies'),
  writes: c('writes'),
  builds: c('builds'),
  checks: c('checks'),
  at: c('At'),
  time: c('time'),
};
const HIT = T.crazy; // the stamp hits the window
const FIVE_OUT = T.parallel - 7; // the 5 and the stamp shrink to the mascot's ground point
const SPLIT = T.multiplies - 1; // Claude splits
const RANK = T.multiplies + 17; // the three mascots rush to their lines and land there on "One"
const DONE = T.time - 1; // everything reaches 100% on the same frame

const STAGE = {x: 480, feet: 446, h: 300, trio: 236, dx: 286, glowY: 300};
const MINI = {x: 100, h: 150};
const ROW = {x: 30, w: 900, h: 200, gap: 20, top: 30}; // 3 lines: y 30 to 670
const BAR = {x: 140, y: 142, w: 650, h: 22};
const MARK = {x: 842, y: 98}; // the pulsing dot, then the check
const rowTop = (i: number) => ROW.top + i * (ROW.h + ROW.gap);
const rowFeet = (i: number) => rowTop(i) + ROW.h / 2 + MINI.h / 2;

type Row = {
  agent: string;
  task: string;
  file: string;
  icon: IconName;
  at: number;
  seed: number;
  curve: [number, number][]; // [share of time, share of work]: each at its own pace, with its jolts
};

const ROWS: Row[] = [
  {agent: 'Agent 1', task: 'writes a scene', file: 'Setting1.tsx', icon: 'code', at: T.writes, seed: 5, curve: [[0, 0], [0.1, 0.12], [0.22, 0.18], [0.38, 0.4], [0.52, 0.47], [0.7, 0.72], [0.84, 0.82], [1, 1]]},
  {agent: 'Agent 2', task: 'builds the next one', file: 'Setting3.tsx', icon: 'code', at: T.builds, seed: 8, curve: [[0, 0], [0.16, 0.26], [0.3, 0.31], [0.52, 0.58], [0.68, 0.64], [0.86, 0.9], [1, 1]]},
  {agent: 'Agent 3', task: 'checks everything', file: 'review', icon: 'search', at: T.checks, seed: 11, curve: [[0, 0], [0.3, 0.36], [0.42, 0.4], [0.72, 0.82], [1, 1]]},
];

const work = (frame: number, r: Row) =>
  interpolate(
    frame,
    r.curve.map(([t]) => r.at + (DONE - r.at) * t),
    r.curve.map(([, v]) => v),
    {...CLAMP, easing: EASE_IN_OUT},
  );

// Bell 0 to 1 to 0 over `dur` frames from `at`: small hops, heartbeats of the 5
const hump = (frame: number, at: number, dur: number) => (frame < at || frame > at + dur ? 0 : Math.sin(((frame - at) / dur) * Math.PI));

// Mint shockwave
const Ring: React.FC<{readonly x: number; readonly y: number; readonly at: number; readonly size: number}> = ({x, y, at, size}) => {
  const frame = useCurrentFrame();
  if (frame < at || frame > at + 18) {
    return null;
  }
  const t = interpolate(frame, [at, at + 18], [0, 1], {...CLAMP, easing: EASE_OUT});
  return <div style={{position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, boxSizing: 'border-box', borderRadius: 999, border: `6px solid ${C.mint}`, opacity: 1 - t, scale: 0.3 + 0.7 * t}} />;
};

// The big 5 and its stamp. Everything collapses together toward the point the mascot will spring from.
const FiveStamp: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame > FIVE_OUT + 9) {
    return null;
  }
  const k = pop(frame, T.fifth - 3, 30, 9, 170);
  const stamp = pop(frame, HIT - 4, 30, 11, 240);
  const gone = interpolate(frame, [FIVE_OUT, FIVE_OUT + 8], [0, 1], {...CLAMP, easing: EASE_IN});
  const t = frame - HIT;
  const shake = t >= 0 && t < 15 ? Math.sin(t * 1.8) * 16 * (1 - t / 15) : 0;
  const beat = 1 + 0.05 * hump(frame, T.where - 1, 9) + 0.05 * hump(frame, T.gets - 1, 9) + 0.07 * hump(frame, HIT, 10);
  const breathe = 1 + Math.sin(frame / 10) * 0.012;
  const glow = 0.8 + 0.2 * Math.sin(frame / 7);
  return (
    <div style={{position: 'absolute', inset: 0, transformOrigin: `${STAGE.x}px ${STAGE.feet}px`, scale: 1 - gone, opacity: 1 - gone * gone}}>
      <div style={{position: 'absolute', left: 100, top: -30, width: 760, height: 760, borderRadius: 999, background: 'radial-gradient(50% 50% at 50% 50%, rgba(95,227,193,0.34), transparent 100%)', opacity: Math.min(1, k * 1.5) * glow, scale: 0.7 + 0.3 * k}} />
      <Ring x={480} y={350} at={HIT} size={820} />
      <div
        style={{
          position: 'absolute',
          left: 160,
          top: 30,
          width: 640,
          height: 640,
          display: 'grid',
          placeItems: 'center',
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: 640,
          lineHeight: 1,
          color: C.mint,
          textShadow: '0 12px 0 rgba(6,10,16,0.35), 0 0 70px rgba(95,227,193,0.6), 0 0 170px rgba(95,227,193,0.35)',
          opacity: Math.min(1, k * 2.5),
          scale: k * breathe * beat,
          translate: `${shake}px 0px`,
          rotate: `${shake * 0.16}deg`,
        }}
      >
        5
      </div>
      <Stamp k={stamp} rotate={-6} size={66} style={{left: 480, top: 530, translate: '-50% -50%'}}>
        It gets crazy
      </Stamp>
    </div>
  );
};

// Glow that charges behind Claude just before the split
const Charge: React.FC = () => {
  const frame = useCurrentFrame();
  const k = rise(frame, T.parallel - 2, 14) * fall(frame, RANK, 12);
  if (k <= 0) {
    return null;
  }
  const grow = interpolate(frame, [T.claude, SPLIT], [0, 1], {...CLAMP, easing: EASE_IN});
  const hit = flash(frame, SPLIT + 1, 18);
  return <div style={{position: 'absolute', left: STAGE.x - 330, top: STAGE.glowY - 330, width: 660, height: 660, borderRadius: 999, background: 'radial-gradient(50% 50% at 50% 50%, rgba(95,227,193,0.38), transparent 100%)', opacity: k * (0.5 + 0.5 * Math.max(grow, hit)), scale: 0.8 + 0.3 * grow + 0.35 * hit}} />;
};

const ClaudeTag: React.FC = () => {
  const frame = useCurrentFrame();
  const k = pop(frame, T.claude - 2, 30, 12, 220);
  const out = fall(frame, T.multiplies - 5, 6);
  return (
    <div style={{position: 'absolute', left: 0, right: 0, top: STAGE.feet + 30, display: 'flex', justifyContent: 'center', opacity: Math.min(1, k * 2) * out, translate: `0px ${(1 - k) * 24}px`}}>
      <div style={{...cardStyle, display: 'flex', alignItems: 'center', gap: 14, height: 76, padding: '0 32px', boxSizing: 'border-box', borderRadius: 99}}>
        <ClaudeMark size={44} />
        <span style={{fontFamily: DISPLAY, fontWeight: 700, fontSize: 42, color: '#fff', whiteSpace: 'nowrap'}}>Claude</span>
      </div>
    </div>
  );
};

// A work line: it unfolds from its mascot, then everything starts on the word
const AgentRow: React.FC<{readonly r: Row; readonly i: number}> = ({r, i}) => {
  const frame = useCurrentFrame();
  const open = rise(frame, RANK + 5 + i * 3, 13);
  if (open <= 0) {
    return null;
  }
  const on = pop(frame, r.at - 2, 30, 13, 210);
  const live = rise(frame, r.at - 2, 6);
  const p = work(frame, r);
  const done = pop(frame, DONE - 1, 30, 11, 230);
  const glow = flash(frame, DONE, 15);
  const pulse = ((frame + i * 8) % 22) / 22;
  const caret = frame < DONE && Math.floor(frame / 7) % 2 === 0;
  return (
    <div
      style={{
        ...cardStyle,
        position: 'absolute',
        left: ROW.x,
        top: rowTop(i),
        width: ROW.w,
        height: ROW.h,
        boxSizing: 'border-box',
        border: `2px solid rgba(95,227,193,${0.1 + 0.36 * live + 0.4 * glow})`,
        boxShadow: `inset 0 0 70px rgba(95,227,193,${0.22 * glow}), 0 16px 40px rgba(0,0,0,0.35)`,
        clipPath: open < 1 ? `inset(-30px ${(1 - open) * 100}% -30px -30px round 22px)` : undefined,
      }}
    >
      <div style={{position: 'absolute', left: BAR.x, top: 26, display: 'flex', alignItems: 'baseline', gap: 18, whiteSpace: 'nowrap'}}>
        <span style={{fontFamily: DISPLAY, fontWeight: 700, fontSize: 46, letterSpacing: '-0.015em', color: '#fff'}}>{r.agent}</span>
        <span style={{fontFamily: BODY, fontWeight: 500, fontSize: 38, color: 'rgba(255,255,255,0.86)', opacity: Math.min(1, on * 2), translate: `${(1 - on) * 26}px 0px`}}>{r.task}</span>
      </div>
      <div style={{position: 'absolute', left: BAR.x, top: 88, width: BAR.w, height: 44, display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap', opacity: live}}>
        <Icon name={r.icon} size={30} color={C.mint} stroke={2.4} />
        <span style={{fontFamily: MONO, fontWeight: 500, fontSize: 30, color: C.mint}}>{typed(r.file, frame, r.at - 2, 70)}</span>
        <span style={{width: 14, height: 30, background: C.mint, opacity: caret ? 0.9 : 0}} />
        <span style={{marginLeft: 'auto', fontFamily: MONO, fontWeight: 600, fontSize: 36, color: done > 0.5 ? C.mint : '#fff'}}>{`${Math.round(p * 100)}%`}</span>
      </div>
      <div style={{position: 'absolute', left: BAR.x, top: BAR.y, width: BAR.w, height: BAR.h, borderRadius: 99, background: 'rgba(255,255,255,0.12)'}}>
        <div style={{position: 'relative', width: p * BAR.w, height: '100%', borderRadius: 99, overflow: 'hidden', background: C.mint, boxShadow: `0 0 ${16 + 26 * glow}px rgba(95,227,193,${0.55 + 0.45 * glow})`}}>
          <div style={{position: 'absolute', top: 0, bottom: 0, left: ((frame * 13 + i * 90) % (BAR.w + 220)) - 150, width: 150, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)', opacity: 1 - Math.min(1, done)}} />
        </div>
      </div>
      {/* dot that pulses while the agent works, then a check */}
      <div style={{position: 'absolute', left: MARK.x - 11, top: MARK.y - 11, width: 22, height: 22, opacity: 1 - Math.min(1, done * 2)}}>
        <div style={{position: 'absolute', inset: 0, borderRadius: 99, boxSizing: 'border-box', border: `3px solid ${C.mint}`, opacity: live * (1 - pulse), scale: 1 + 1.5 * pulse}} />
        <div style={{position: 'absolute', inset: 0, borderRadius: 99, background: live > 0.5 ? C.mint : 'rgba(255,255,255,0.22)', boxShadow: live > 0.5 ? `0 0 14px ${C.mint}` : 'none'}} />
      </div>
      <Check k={done} size={64} style={{position: 'absolute', left: MARK.x - 32, top: MARK.y - 32}} />
    </div>
  );
};

// The three agents are one idea: the original mascot (i = 1) and its two copies, which come out of it
const Agent: React.FC<{readonly r: Row; readonly i: number}> = ({r, i}) => {
  const frame = useCurrentFrame();
  const side = i - 1;
  const original = side === 0;
  if (frame < (original ? T.parallel - 2 : SPLIT)) {
    return null;
  }
  const enter = pop(frame, T.parallel - 2, 30, 11, 190);
  const burst = pop(frame, SPLIT, 30, 12, 190);
  const rank = pop(frame, RANK + i * 2, 30, 15, 150);
  // the copies leap in an arc, the original mascot squashes then relaxes
  const leap = original ? 0 : Math.sin(Math.min(1, burst) * Math.PI) * 74;
  const antic = original ? interpolate(frame, [T.claude, SPLIT - 1, SPLIT + 3], [0, 1, 0], {...CLAMP, easing: EASE_IN_OUT}) : 0;
  const x = interpolate(rank, [0, 1], [STAGE.x + side * STAGE.dx * burst, MINI.x]);
  const ground = interpolate(rank, [0, 1], [STAGE.feet - leap, rowFeet(i)]);
  const h = interpolate(rank, [0, 1], [interpolate(burst, [0, 1], [original ? STAGE.h : 70, STAGE.trio]), MINI.h]);
  const bounce = 26 * hump(frame, T.agents - 1, 13) + 34 * hump(frame, T.claude - 2, 14) + 30 * hump(frame, DONE, 13);
  const feet = ground - bounce;
  const busy = Math.min(rise(frame, r.at - 2, 8), fall(frame, DONE - 6, 6));
  const wander = original ? Math.sin((frame - T.parallel) / 11) * 0.6 : side * 0.7;
  const mood = frame >= DONE ? 'happy' : frame >= SPLIT - 6 && frame < RANK + 4 ? 'wow' : 'idle';
  return (
    <div style={{position: 'absolute', inset: 0, transformOrigin: `${x}px ${feet}px`, transform: `scale(${1 + 0.1 * antic}, ${1 - 0.12 * antic})`}}>
      <Mascot
        x={x}
        feet={feet}
        h={h}
        seed={r.seed}
        mood={mood}
        look={[interpolate(rank, [0, 1], [wander, 0.85]), 0.15 * Math.min(1, rank)]}
        tilt={Math.sin(frame / 3 + i * 2) * 4 * busy}
        scale={original ? enter : 1}
        opacity={original ? Math.min(1, enter * 2) : Math.min(1, burst * 3)}
      />
    </div>
  );
};

export const Setting5: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <FiveStamp />
      <Charge />
      <Ring x={STAGE.x} y={STAGE.glowY} at={SPLIT + 1} size={820} />
      <ClaudeTag />
      {ROWS.map((r, i) => (
        <AgentRow key={r.file} r={r} i={i} />
      ))}
      {/* the original mascot last: the copies come out from behind it */}
      {[0, 2, 1].map((i) => (
        <Agent key={ROWS[i].file} r={ROWS[i]} i={i} />
      ))}
      {frame >= T.at - 2 ? (
        <Stamp k={pop(frame, T.at - 2, 30, 11, 240)} rotate={-5} size={58} style={{left: 492, top: 350, translate: '-50% -50%'}}>
          At the same time
        </Stamp>
      ) : null}
    </>
  );
};

export const r5Sfx: Sfx[] = [
  {name: 'pop-high', at: T.fifth - 2, vol: 0.26},
  {name: 'tick', at: T.where - 2, vol: 0.12},
  {name: 'tick', at: T.gets - 2, vol: 0.14},
  {name: 'stamp', at: HIT - 3, vol: 0.3},
  {name: 'whoosh-short', at: FIVE_OUT - 3, vol: 0.16},
  {name: 'pop', at: T.parallel - 4, vol: 0.22},
  {name: 'tick', at: T.claude - 4, vol: 0.16},
  {name: 'sparkles', at: SPLIT - 2, vol: 0.2},
  {name: 'pop-high', at: SPLIT - 2, vol: 0.26},
  {name: 'pop', at: SPLIT + 1, vol: 0.18},
  {name: 'whoosh-short', at: RANK - 4, vol: 0.18},
  ...ROWS.map((r) => ({name: 'pop', at: r.at - 4, vol: 0.2})),
  ...ROWS.map((r) => ({name: 'key', at: r.at - 1, vol: 0.08})),
  ...ROWS.map((r) => ({name: 'key', at: r.at + 3, vol: 0.08})),
  ...ROWS.map((r) => ({name: 'key', at: r.at + 7, vol: 0.08})),
  {name: 'ding', at: DONE - 5, vol: 0.22},
  {name: 'stamp', at: T.at - 3, vol: 0.28},
];
