// Stakes: "And yet, my Claude is the same as yours. The difference? You ask it questions.
// I give it work. And for that, you only need five settings." Full canvas, no window.
// Serves as the model for the other scenes: everything is timed on the words with cues().
import {interpolate, useCurrentFrame} from 'remotion';
import {CLAMP, cues, EASE_IN_OUT, EASE_OUT, fall, phase, pop, rise, secLen} from '../anim';
import {SECTIONS} from '../data';
import {C, Check, DISPLAY, envAt, Icon, Mascot, MONO, segRect, type Sfx, Stamp} from '../kit';

const c = cues('stakes');
const LEN = secLen('stakes');

const T = {
  mine: c('Claude'),
  same: c('same'),
  yours: c('yours'),
  diff: c('difference'),
  you: c('You'),
  ask: c('ask'),
  questions: c('questions'),
  me: c('I'),
  give: c('give'),
  work: c('work'),
  forThat: c('And', 2),
  five: c('five'),
  settings: c('settings'),
};
const OUT = T.forThat - 2; // the cards fade out
const FLY = LEN - 18; // the boxes fly to the progress bar

const TASKS = ['Script', 'Voice', 'Editing'];
const CARD = {y: 470, w: 460, h: 660};

const Tag: React.FC<{readonly children: React.ReactNode; readonly x: number; readonly color: string; readonly k: number}> = ({children, x, color, k}) => (
  <div style={{position: 'absolute', left: x, top: CARD.y + 30, width: CARD.w, textAlign: 'center', fontFamily: MONO, fontWeight: 600, fontSize: 30, letterSpacing: '0.18em', color, opacity: k, whiteSpace: 'nowrap'}}>{children}</div>
);

const Bubble: React.FC<{readonly x: number; readonly y: number; readonly k: number; readonly flip?: boolean}> = ({x, y, k, flip}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width: 124,
      height: 104,
      borderRadius: 28,
      borderBottomLeftRadius: flip ? 28 : 6,
      borderBottomRightRadius: flip ? 6 : 28,
      background: '#fff',
      color: C.bg,
      display: 'grid',
      placeItems: 'center',
      fontFamily: DISPLAY,
      fontWeight: 700,
      fontSize: 68,
      scale: k,
      opacity: Math.min(1, k * 2),
      boxShadow: '0 14px 30px rgba(0,0,0,0.4)',
    }}
  >
    ?
  </div>
);

export const Stakes: React.FC = () => {
  const frame = useCurrentFrame();
  const abs = frame + SECTIONS.stakes.from;
  const voice = envAt(abs);

  const cards = fall(frame, OUT, 10);
  const left = pop(frame, T.yours - 8, 30, 14, 170);
  const right = rise(frame, c('my') - 6, 10);
  // the big mascot from the dive joins its card
  const m = interpolate(frame, [0, 26], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  const eqK = pop(frame, T.same - 2, 30, 11, 190);
  const neq = interpolate(frame, [T.diff, T.diff + 8], [0, 1], {...CLAMP, easing: EASE_OUT});
  const leftHot = phase(frame, T.you - 2, T.me - 2, 6, 8);
  const rightHot = rise(frame, T.me - 2, 8);

  const slotsIn = T.five - 4;
  const fly = interpolate(frame, [FLY, LEN - 2], [0, 1], {...CLAMP, easing: EASE_IN_OUT});

  const title = (a: number, b: number) => phase(frame, a, b, 8, 7);

  return (
    <>
      {/* big titles at the top: one idea per phase, never the whole sentence (that is in the captions) */}
      <div style={{position: 'absolute', left: 60, right: 60, top: 250, textAlign: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: 118, lineHeight: 1.02, letterSpacing: '-0.025em', color: '#fff'}}>
        <div style={{position: 'absolute', left: 0, right: 0, top: 0, opacity: title(T.mine - 2, T.diff - 6), scale: 0.94 + 0.06 * rise(frame, T.mine - 2, 10)}}>
          Same Claude
        </div>
        <div style={{position: 'absolute', left: 0, right: 0, top: 0, fontSize: 108, opacity: title(T.diff - 4, OUT + 6), scale: 0.94 + 0.06 * rise(frame, T.diff - 4, 10)}}>
          The <span style={{color: C.mint}}>difference</span>
        </div>
        <div style={{position: 'absolute', left: 0, right: 0, top: 0, opacity: rise(frame, T.forThat + 2, 8) * fall(frame, FLY, 8), scale: 0.94 + 0.06 * rise(frame, T.forThat + 2, 10)}}>
          You only need
        </div>
      </div>

      {/* the two cards */}
      <div style={{opacity: cards}}>
        <div style={{position: 'absolute', left: 60, top: CARD.y, width: CARD.w, height: CARD.h, borderRadius: 34, background: 'rgba(23,36,52,0.9)', border: `2.5px solid ${leftHot > 0.3 ? 'rgba(255,255,255,0.4)' : C.line}`, opacity: Math.min(1, left * 1.6), scale: 0.9 + 0.1 * left}} />
        <div style={{position: 'absolute', left: 560, top: CARD.y, width: CARD.w, height: CARD.h, borderRadius: 34, background: 'rgba(23,36,52,0.9)', border: `2.5px solid ${rightHot > 0.3 ? C.mint : C.line}`, boxShadow: rightHot > 0.3 ? '0 0 70px rgba(95,227,193,0.3)' : 'none', opacity: right}} />
        <Tag x={60} color={C.muted} k={Math.min(1, left * 1.5)}>
          YOUR CLAUDE
        </Tag>
        <Tag x={560} color={C.mint} k={right}>
          MY CLAUDE
        </Tag>
        <Mascot x={290} feet={1060} h={350} seed={2} mood={frame > T.me ? 'sleep' : 'idle'} dim={frame > T.me} opacity={Math.min(1, left * 1.6)} look={[0.3, 0]} />
        <Bubble x={92} y={CARD.y + 110} k={pop(frame, T.you, 30, 11, 200)} />
        <Bubble x={356} y={CARD.y + 170} k={pop(frame, T.ask, 30, 11, 200)} flip />
        <Bubble x={108} y={CARD.y + 310} k={pop(frame, T.questions, 30, 11, 200)} />
        {/* the work list on the right card */}
        <div style={{position: 'absolute', left: 610, top: CARD.y + 96, width: 360, display: 'flex', flexDirection: 'column', gap: 14, opacity: rightHot}}>
          {TASKS.map((t, i) => {
            const at = [T.me + 8, T.give, T.work][i];
            const k = pop(frame, at, 30, 12, 200);
            return (
              <div key={t} style={{display: 'flex', alignItems: 'center', gap: 18, height: 74, padding: '0 22px', borderRadius: 20, background: 'rgba(95,227,193,0.1)', border: '2px solid rgba(95,227,193,0.4)', opacity: Math.min(1, k * 2), translate: `${(1 - k) * 60}px 0px`}}>
                <Check k={pop(frame, at + 4, 30, 11, 220)} size={44} />
                <span style={{fontFamily: DISPLAY, fontWeight: 700, fontSize: 40, color: '#fff'}}>{t}</span>
              </div>
            );
          })}
        </div>
        {/* = sign that gets struck into != */}
        <div style={{position: 'absolute', left: 540 - 62, top: 790 - 62, width: 124, height: 124, borderRadius: 99, background: neq > 0.5 ? C.mint : '#fff', display: 'grid', placeItems: 'center', scale: eqK * (1 + 0.16 * Math.sin(Math.min(1, neq) * Math.PI)), opacity: Math.min(1, eqK * 2), boxShadow: '0 16px 40px rgba(0,0,0,0.5)'}}>
          <svg width={74} height={74} viewBox="0 0 74 74">
            <line x1={10} y1={27} x2={64} y2={27} stroke={C.bg} strokeWidth={10} strokeLinecap="round" />
            <line x1={10} y1={47} x2={64} y2={47} stroke={C.bg} strokeWidth={10} strokeLinecap="round" />
            <line x1={52} y1={6} x2={52 - 30 * neq} y2={6 + 62 * neq} stroke={C.bg} strokeWidth={10} strokeLinecap="round" opacity={neq > 0.02 ? 1 : 0} />
          </svg>
        </div>
        <Stamp k={pop(frame, T.work - 1, 30, 11, 240)} rotate={-5} size={58} style={{left: 590, top: 1000}}>
          Work
        </Stamp>
      </div>

      {/* big mascot from the dive, which becomes "my Claude" */}
      {frame < OUT + 12 ? (
        <Mascot
          x={interpolate(m, [0, 1], [540, 790])}
          feet={interpolate(m, [0, 1], [1240, 1060])}
          h={interpolate(m, [0, 1], [760, 350])}
          seed={1}
          voice={voice}
          mood={frame > T.work ? 'happy' : 'idle'}
          look={[frame > T.me - 4 ? 0 : -0.3, 0]}
          opacity={cards}
        />
      ) : null}

      {/* five empty boxes: the open loop, which then tucks into the progress bar */}
      {[0, 1, 2, 3, 4].map((i) => {
        const k = pop(frame, slotsIn + i * 3, 30, 11, 210);
        const seg = segRect(i);
        const from = {x: 60 + i * 196, y: 640, w: 176, h: 236};
        const x = interpolate(fly, [0, 1], [from.x, seg.x]);
        const y = interpolate(fly, [0, 1], [from.y, seg.y]);
        const w = interpolate(fly, [0, 1], [from.w, seg.w]);
        const h = interpolate(fly, [0, 1], [from.h, seg.h]);
        return (
          <div
            key={`box-${i}`}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: w,
              height: h,
              borderRadius: interpolate(fly, [0, 1], [30, 99]),
              border: `${interpolate(fly, [0, 0.7], [4, 0], CLAMP)}px dashed rgba(255,255,255,0.75)`,
              background: `rgba(255,255,255,${0.05 + 0.11 * fly})`,
              display: 'grid',
              placeItems: 'center',
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontSize: 112,
              color: '#fff',
              scale: fly > 0 ? 1 : k,
              opacity: frame < slotsIn + i * 3 ? 0 : Math.min(1, k * 2),
            }}
          >
            <span style={{opacity: 1 - Math.min(1, fly * 3)}}>{i + 1}</span>
          </div>
        );
      })}
      <div style={{position: 'absolute', left: 0, right: 0, top: 930, textAlign: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: 96, letterSpacing: '-0.02em', color: C.mint, opacity: rise(frame, T.settings, 8) * fall(frame, FLY, 8)}}>
        {'5\u00a0settings'}
      </div>
      <div style={{opacity: 0}}>
        <Icon name="check" />
      </div>
    </>
  );
};

export const stakesSfx: Sfx[] = [
  {name: 'pop', at: T.yours - 10, vol: 0.2},
  {name: 'pop-high', at: T.same - 3, vol: 0.26},
  {name: 'whoosh-short', at: T.diff - 2, vol: 0.2},
  {name: 'pop', at: T.you - 1, vol: 0.2},
  {name: 'pop', at: T.ask - 1, vol: 0.2},
  {name: 'pop', at: T.questions - 1, vol: 0.2},
  {name: 'tick', at: T.me + 8, vol: 0.2},
  {name: 'tick', at: T.give, vol: 0.2},
  {name: 'ding', at: T.work + 2, vol: 0.12},
  {name: 'stamp', at: T.work - 1, vol: 0.26},
  {name: 'whoosh-short', at: OUT, vol: 0.18},
  ...[0, 1, 2, 3, 4].map((i) => ({name: 'tick', at: slotsAt(i), vol: 0.22})),
  {name: 'whoosh', at: FLY - 2, vol: 0.2},
];

function slotsAt(i: number) {
  return T.five - 4 + i * 3;
}
