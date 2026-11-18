// Shared scene for the 6 tasks: three boxes that flip over on the spoken word (the reflex to avoid, what works, my pick),
// then a proof specific to each tool under the boxes, and a stamp on the punchline.
import {Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {CLAMP, cues, EASE_OUT, fall, flash, pop, rise} from '../anim';
import type {SectionId} from '../data';
import {BODY, C, cardStyle, Check, ClaudeMark, CORAL, DISPLAY, Icon, type IconName, MONO, type Sfx, Stamp} from '../kit';

export type Slot = {readonly word: string; readonly n?: number; readonly name: string; readonly icon?: IconName; readonly logo?: 'claude' | 'elevenlabs'; readonly verdict?: string; readonly vword?: string};
export type Task = {readonly sec: SectionId; readonly slots: readonly [Slot, Slot, Slot]; readonly punch: string; readonly stamp: string; readonly stampSize?: number; readonly stampTop?: number; readonly proof: React.FC<{readonly at: number}>; readonly relaunch?: {readonly word: string; readonly text: string}};

const TITLES = ['REFLEX', 'IT WORKS', 'MY PICK'];
const W = 280;
const GAP = 30;
const X0 = 30;
const TOP = 76;
const H = 262;
const BAND = {x: 30, y: 376, w: 900, h: 300};

export const Band: React.FC<{readonly k: number; readonly children: React.ReactNode}> = ({k, children}) => (
  <div style={{...cardStyle, position: 'absolute', left: BAND.x, top: BAND.y, width: BAND.w, height: BAND.h, opacity: Math.min(1, k * 2), translate: `0px ${(1 - k) * 40}px`, overflow: 'hidden'}}>{children}</div>
);

const Logo: React.FC<{readonly c: Slot; readonly size: number; readonly color: string}> = ({c, size, color}) => {
  if (c.logo === 'claude') {
    return <ClaudeMark size={size} color={CORAL} />;
  }
  if (c.logo === 'elevenlabs') {
    return (
      <div style={{display: 'flex', gap: size * 0.2}}>
        <div style={{width: size * 0.2, height: size, background: '#fff', borderRadius: 4}} />
        <div style={{width: size * 0.2, height: size, background: '#fff', borderRadius: 4}} />
      </div>
    );
  }
  return <Icon name={c.icon ?? 'star'} size={size} color={color} />;
};

const Card: React.FC<{readonly i: number; readonly c: Slot; readonly at: number; readonly frame: number; readonly strike: number; readonly dimmed: number; readonly vat: number}> = ({i, c, at, frame, strike, dimmed, vat}) => {
  const top = i === 2;
  const k = pop(frame, at - 3, 30, 12, 210);
  const on = frame >= at - 3;
  const x = X0 + i * (W + GAP);
  const edge = top ? C.mint : C.line;
  return (
    <>
      <div style={{position: 'absolute', left: x, top: 24, width: W, textAlign: 'center', fontFamily: MONO, fontWeight: 700, fontSize: 28, letterSpacing: '0.06em', color: top ? C.mint : 'rgba(255,255,255,0.7)'}}>{TITLES[i]}</div>
      <div style={{position: 'absolute', left: x, top: TOP, width: W, height: H, borderRadius: 26, border: `3px dashed rgba(255,255,255,0.28)`, display: 'grid', placeItems: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: 96, color: 'rgba(255,255,255,0.28)', opacity: on ? 1 - k : 1}}>?</div>
      {on ? (
        <div style={{...cardStyle, position: 'absolute', left: x, top: TOP, width: W, height: H, borderRadius: 26, border: `3px solid ${edge}`, scale: k, opacity: Math.min(1, k * 2) * (1 - 0.35 * dimmed), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 14px', boxShadow: top ? `0 0 ${40 + 40 * flash(frame, at, 30)}px rgba(95,227,193,0.4)` : cardStyle.boxShadow}}>
          <Logo c={c} size={top ? 92 : 80} color={top ? C.mint : '#fff'} />
          <div style={{fontFamily: DISPLAY, fontWeight: 700, fontSize: 34, lineHeight: 1.1, color: '#fff', textAlign: 'center'}}>{c.name}</div>
          {c.verdict ? <div style={{fontFamily: BODY, fontWeight: 600, fontSize: 28, color: i === 0 ? C.red : C.gold, opacity: rise(frame, vat - 2, 8)}}>{c.verdict}</div> : null}
          {i === 0 ? (
            <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0}}>
              <line x1={22} y1={H - 22} x2={22 + (W - 44) * strike} y2={H - 22 - (H - 44) * strike} stroke={C.red} strokeWidth={9} strokeLinecap="round" opacity={strike > 0 ? 1 : 0} />
            </svg>
          ) : null}
          {top ? <Check k={pop(frame, at + 4, 30, 11, 220)} size={50} style={{position: 'absolute', right: -14, top: -14}} /> : null}
        </div>
      ) : null}
    </>
  );
};

export const Trio: React.FC<{readonly t: Task}> = ({t}) => {
  const frame = useCurrentFrame();
  const c = cues(t.sec);
  const ats = t.slots.map((x) => c(x.word, x.n));
  const vats = t.slots.map((x, i) => (x.vword ? c(x.vword) : ats[i]));
  const strike = interpolate(frame, [vats[0], vats[0] + 8], [0, 1], {...CLAMP, easing: EASE_OUT});
  const proofAt = ats[2] + 8;
  const punch = c(t.punch);
  const relaunchAt = t.relaunch ? c(t.relaunch.word) : 0;
  return (
    <>
      {t.slots.map((x, i) => (
        <Card key={`slot-${t.sec}-${i}`} i={i} c={x} at={ats[i]} frame={frame} strike={strike} dimmed={i < 2 ? rise(frame, ats[2], 10) : 0} vat={vats[i]} />
      ))}
      {t.relaunch ? (
        <div style={{position: 'absolute', left: 0, right: 0, top: 450, textAlign: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: 86, letterSpacing: '-0.02em', color: C.mint, scale: 0.9 + 0.1 * pop(frame, relaunchAt - 2, 30, 12, 200), opacity: rise(frame, relaunchAt - 2, 6) * fall(frame, ats[0] - 8, 6)}}>{t.relaunch.text}</div>
      ) : null}
      <t.proof at={proofAt} />
      <Stamp k={pop(frame, punch - 4, 30, 10, 240)} size={t.stampSize ?? 60} style={{position: 'absolute', right: 44, top: 596}}>
        {t.stamp}
      </Stamp>
    </>
  );
};

export const trioSfx = (t: Task): Sfx[] => {
  const c = cues(t.sec);
  const ats = t.slots.map((x) => c(x.word, x.n));
  return [
    {name: 'pop', at: ats[0] - 4, vol: 0.2},
    {name: 'stamp', at: (t.slots[0].vword ? c(t.slots[0].vword) : ats[0]) + 1, vol: 0.14},
    {name: 'pop', at: ats[1] - 4, vol: 0.2},
    {name: 'pop-high', at: ats[2] - 4, vol: 0.24},
    {name: 'ding', at: ats[2] + 4, vol: 0.14},
    {name: 'stamp', at: c(t.punch) - 3, vol: 0.2},
  ];
};

export const Thumb: React.FC<{readonly src: string; readonly tag: string; readonly k: number; readonly x: number}> = ({src, tag, k, x}) => (
  <div style={{position: 'absolute', left: x, top: 22, width: 300, height: 256, borderRadius: 18, overflow: 'hidden', border: `2px solid ${C.line}`, scale: k, opacity: Math.min(1, k * 2)}}>
    <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 58%'}} />
    <div style={{position: 'absolute', left: 12, bottom: 12, padding: '4px 14px', borderRadius: 10, background: 'rgba(6,10,16,0.82)', fontFamily: MONO, fontWeight: 700, fontSize: 28, color: C.mint}}>{tag}</div>
  </div>
);
