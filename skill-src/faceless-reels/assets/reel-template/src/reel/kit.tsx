// Reel building blocks (1080 x 1920): continuous canvas, the template style (night blue, mint, word by word captions),
// orange mascot whose mouth follows the voice. Do not edit for a single reel: a new need is coded in the scene.
// Instagram safe zones: nothing important above y 200, below y 1560, or right of x 960 below y 1130.
import {AbsoluteFill, Img, interpolate, random, staticFile, useCurrentFrame} from 'remotion';
import {Icon, type IconName} from '../components/Icon';
import {CLAMP, EASE_OUT, pop, rise} from './anim';
import {ELEMENTS, ENV, PAGES} from './data';
import {BODY, C, DISPLAY, MONO} from './theme';

export {BODY, C, DISPLAY, MONO};
export {Icon, type IconName};

export const SW = 1080;
export const SH = 1920;
export const CORAL = '#FF7A45';

// Canvas grid
export const WIN = {x: 60, y: 372, w: 960, h: 758, bar: 58}; // window content: 960 x 700
export const CONTENT = {w: WIN.w, h: WIN.h - WIN.bar};
export const CAPTION_Y = 1262;
export const FLOOR_Y = 1490;
export const BOTTOM = {x: 540, feet: 1552, h: 196}; // presenter mascot

const DUST = new Array(46).fill(0).map((_, i) => ({
  x: random(`dx${i}`) * SW,
  y: random(`dy${i}`) * SH,
  r: 1.2 + random(`dr${i}`) * 2.4,
  v: 0.2 + random(`dv${i}`) * 0.5,
  a: 0.1 + random(`da${i}`) * 0.3,
  mint: random(`dm${i}`) > 0.5,
}));

// Perspective floor under the mascot
const Floor: React.FC = () => {
  const rays = new Array(21).fill(0).map((_, i) => i - 10);
  const rows = new Array(7).fill(0).map((_, i) => FLOOR_Y + (i + 1) * (i + 1) * 9.5);
  return (
    <svg width={SW} height={SH} style={{position: 'absolute', left: 0, top: 0}}>
      <defs>
        <linearGradient id="floor" x1="0" y1={FLOOR_Y} x2="0" y2={SH} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5FE3C1" stopOpacity="0.2" />
          <stop offset="0.5" stopColor="#5FE3C1" stopOpacity="0.07" />
          <stop offset="1" stopColor="#5FE3C1" stopOpacity="0" />
        </linearGradient>
      </defs>
      {rays.map((k) => (
        <line key={`ray-${k}`} x1={540 + k * 46} y1={FLOOR_Y} x2={540 + k * 300} y2={SH} stroke="url(#floor)" strokeWidth={1.4} />
      ))}
      {rows.map((y) => (
        <line key={`row-${y}`} x1={0} y1={y} x2={SW} y2={y} stroke="url(#floor)" strokeWidth={1.4} />
      ))}
    </svg>
  );
};

// Single background for the whole video: it never changes, it is what makes it feel like one shot
export const Backdrop: React.FC<{readonly intensity?: number}> = ({intensity = 1}) => {
  const frame = useCurrentFrame();
  const gx = 30 + 6 * Math.sin(frame / 90);
  const hx = 72 + 6 * Math.cos(frame / 100);
  return (
    <AbsoluteFill style={{backgroundColor: C.bg}}>
      <AbsoluteFill style={{background: `radial-gradient(70% 34% at ${gx}% 24%, rgba(95,227,193,${0.14 * intensity}), transparent 72%)`}} />
      <AbsoluteFill style={{background: `radial-gradient(75% 36% at ${hx}% 78%, rgba(123,79,224,${0.22 * intensity}), transparent 74%)`}} />
      <AbsoluteFill
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.07) 1.3px, transparent 1.6px)',
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(80% 60% at 50% 45%, black, transparent 92%)',
        }}
      />
      <Floor />
      <div style={{position: 'absolute', left: 0, right: 0, top: FLOOR_Y - 90, height: 180, background: 'radial-gradient(50% 50% at 50% 50%, rgba(95,227,193,0.13), transparent 100%)'}} />
      {DUST.map((p, i) => {
        const y = (((p.y - frame * p.v * 1.4) % SH) + SH) % SH;
        return (
          <div
            key={`dust-${i}`}
            style={{position: 'absolute', left: p.x + Math.sin((frame + i * 37) / 70) * 12, top: y, width: p.r * 2, height: p.r * 2, borderRadius: 99, background: p.mint ? C.mint : '#FFFFFF', opacity: p.a}}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// Voice level (0 to 1) at an absolute frame of the reel
export const envAt = (absFrame: number) => (ENV[Math.max(0, Math.min(ENV.length - 1, Math.round(absFrame)))] ?? 0) / 100;

const MW = 528;
const MH = 866;

// Mascot: 3D render (public/reel/mascot.png) + vector face on the black visor. `voice` = voice level 0 to 1.
export const Mascot: React.FC<{
  readonly x: number; // horizontal center
  readonly feet: number; // bottom of the mascot
  readonly h: number; // height
  readonly voice?: number;
  readonly mood?: 'idle' | 'happy' | 'wow' | 'sleep';
  readonly look?: [number, number]; // gaze, -1 to 1
  readonly tilt?: number;
  readonly seed?: number;
  readonly shadow?: boolean;
  readonly opacity?: number;
  readonly scale?: number;
  readonly dim?: boolean; // dimmed version ("your Claude" at rest)
}> = ({x, feet, h, voice = 0, mood = 'idle', look = [0, 0], tilt = 0, seed = 0, shadow = true, opacity = 1, scale = 1, dim = false}) => {
  const frame = useCurrentFrame();
  const w = (h * MW) / MH;
  const t = frame + seed * 41;
  const bob = Math.sin(t / 13) * h * 0.012;
  const rot = Math.sin(t / 29) * 1.8 + tilt;
  const squash = 1 + voice * 0.035;
  const b = t % 113;
  const blink = mood === 'sleep' ? 0.08 : b < 2 ? 0.5 : b < 4 ? 0.1 : b < 6 ? 0.55 : 1;
  const lx = look[0] * 26;
  const ly = look[1] * 16;
  const eyeY = 322 + ly;
  const mouthRy = 5 + voice * 40;
  const mouthRx = 42 + voice * 8;
  const glow = 0.55 + 0.45 * Math.sin(t / 9);
  return (
    <div style={{position: 'absolute', left: x - w / 2, top: feet - h, width: w, height: h, opacity, scale, transformOrigin: '50% 100%'}}>
      {shadow ? (
        <div style={{position: 'absolute', left: '8%', right: '8%', bottom: -h * 0.035, height: h * 0.07, borderRadius: '50%', background: 'radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,0.6), transparent 100%)'}} />
      ) : null}
      <div style={{position: 'absolute', inset: 0, transform: `translateY(${bob}px) rotate(${rot}deg) scaleY(${squash})`, transformOrigin: '50% 100%', filter: dim ? 'grayscale(0.85) brightness(0.62)' : undefined}}>
        <Img src={staticFile('reel/mascot.png')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
        <svg viewBox={`0 0 ${MW} ${MH}`} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible'}}>
          <circle cx={264} cy={30} r={52} fill={C.mint} opacity={0.16 + 0.14 * glow} />
          <circle cx={264} cy={30} r={29} fill={C.mint} />
          <g style={{filter: `drop-shadow(0 0 12px ${C.mint})`}}>
            {mood === 'happy' ? (
              <>
                <path d={`M ${172 + lx - 42} ${eyeY + 20} Q ${172 + lx} ${eyeY - 44} ${172 + lx + 42} ${eyeY + 20}`} fill="none" stroke={C.mint} strokeWidth={26} strokeLinecap="round" />
                <path d={`M ${356 + lx - 42} ${eyeY + 20} Q ${356 + lx} ${eyeY - 44} ${356 + lx + 42} ${eyeY + 20}`} fill="none" stroke={C.mint} strokeWidth={26} strokeLinecap="round" />
              </>
            ) : (
              <>
                <rect x={172 + lx - 33} y={eyeY - (mood === 'wow' ? 58 : 46) * blink} width={66} height={(mood === 'wow' ? 116 : 92) * blink} rx={33 * Math.min(1, blink * 1.2)} fill={C.mint} />
                <rect x={356 + lx - 33} y={eyeY - (mood === 'wow' ? 58 : 46) * blink} width={66} height={(mood === 'wow' ? 116 : 92) * blink} rx={33 * Math.min(1, blink * 1.2)} fill={C.mint} />
              </>
            )}
            {voice > 0.04 ? (
              <ellipse cx={264 + lx * 0.6} cy={436 + ly * 0.6} rx={mouthRx} ry={mouthRy} fill={C.mint} />
            ) : mood === 'wow' ? (
              <ellipse cx={264 + lx * 0.6} cy={440 + ly * 0.6} rx={30} ry={34} fill={C.mint} />
            ) : (
              <path d={`M ${264 + lx * 0.6 - 50} ${428 + ly * 0.6} Q ${264 + lx * 0.6} ${(mood === 'happy' ? 482 : 462) + ly * 0.6} ${264 + lx * 0.6 + 50} ${428 + ly * 0.6}`} fill="none" stroke={C.mint} strokeWidth={17} strokeLinecap="round" />
            )}
          </g>
        </svg>
      </div>
    </div>
  );
};

// Claude signature mark (rayed star), line drawing
export const ClaudeMark: React.FC<{readonly size?: number; readonly color?: string; readonly rotate?: number; readonly style?: React.CSSProperties}> = ({size = 40, color = CORAL, rotate = 0, style}) => (
  <svg viewBox="-24 -24 48 48" width={size} height={size} style={{flex: 'none', rotate: `${rotate}deg`, ...style}}>
    {new Array(12).fill(0).map((_, i) => {
      const a = (i * Math.PI) / 6;
      const r = i % 2 === 0 ? 21 : 17;
      return <line key={`ray-${i}`} x1={Math.cos(a) * 5} y1={Math.sin(a) * 5} x2={Math.cos(a) * r} y2={Math.sin(a) * r} stroke={color} strokeWidth={4.4} strokeLinecap="round" />;
    })}
  </svg>
);

// App window: the same window stays on screen from the first element to the final call, only its content changes
export const AppWindow: React.FC<{readonly title: string; readonly icon?: 'claude' | IconName; readonly k?: number; readonly children?: React.ReactNode}> = ({title, icon = 'claude', k = 1, children}) => (
  <div
    style={{
      position: 'absolute',
      left: WIN.x,
      top: WIN.y,
      width: WIN.w,
      height: WIN.h,
      borderRadius: 30,
      overflow: 'hidden',
      background: '#0E1822',
      boxShadow: '0 0 0 2px rgba(255,255,255,0.13), 0 40px 90px rgba(0,0,0,0.55), 0 0 70px rgba(95,227,193,0.08)',
      opacity: Math.min(1, k * 1.5),
      scale: 0.94 + 0.06 * k,
    }}
  >
    <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: WIN.bar, display: 'flex', alignItems: 'center', padding: '0 24px', background: '#16212D', borderBottom: `1.5px solid ${C.line}`}}>
      <span style={{width: 16, height: 16, borderRadius: 99, background: '#FF6159', marginRight: 10}} />
      <span style={{width: 16, height: 16, borderRadius: 99, background: '#FFBD2E', marginRight: 10}} />
      <span style={{width: 16, height: 16, borderRadius: 99, background: '#28C940'}} />
      <div style={{position: 'absolute', left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12}}>
        {icon === 'claude' ? <ClaudeMark size={28} /> : <Icon name={icon} size={26} color={C.muted} stroke={2.2} />}
        <span style={{fontFamily: MONO, fontSize: 24, fontWeight: 500, letterSpacing: '0.03em', color: 'rgba(255,255,255,0.72)', whiteSpace: 'nowrap'}}>{title}</span>
      </div>
    </div>
    <div style={{position: 'absolute', left: 0, top: WIN.bar, width: CONTENT.w, height: CONTENT.h, overflow: 'hidden'}}>{children}</div>
  </div>
);

// Element header: numbered badge, small monospaced line, title with the key word on a pill
export const Header: React.FC<{readonly n: number | IconName; readonly kicker: string; readonly before: string; readonly word: string; readonly at?: number; readonly titleAt?: number; readonly size?: number}> = ({n, kicker, before, word, at = 0, titleAt, size = 68}) => {
  const frame = useCurrentFrame();
  const a = pop(frame, at, 30, 12, 200);
  const b = pop(frame, at + 3, 30, 14, 170);
  const c = pop(frame, titleAt ?? at + 7, 30, 14, 170);
  return (
    <div style={{position: 'absolute', left: 60, top: 226, height: 118, display: 'flex', alignItems: 'center', gap: 26}}>
      <div style={{width: 104, height: 104, borderRadius: 28, background: C.mint, color: C.bg, display: 'grid', placeItems: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: 66, scale: 0.5 + 0.5 * a, opacity: Math.min(1, a * 2), boxShadow: '0 0 44px rgba(95,227,193,0.35)'}}>
        {typeof n === 'number' ? n : <Icon name={n} size={58} color={C.bg} stroke={2.6} />}
      </div>
      <div>
        <div style={{fontFamily: MONO, fontWeight: 600, fontSize: 26, letterSpacing: '0.22em', color: C.mint, whiteSpace: 'nowrap', opacity: Math.min(1, b * 1.5), translate: `${(1 - b) * 40}px 0px`}}>{kicker}</div>
        <div style={{display: 'flex', alignItems: 'center', gap: 16, marginTop: 6, fontFamily: DISPLAY, fontWeight: 700, fontSize: size, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#fff', whiteSpace: 'nowrap', opacity: Math.min(1, c * 1.5), translate: `${(1 - c) * 60}px 0px`}}>
          {before ? <span>{before}</span> : null}
          <span style={{background: C.mint, color: C.bg, borderRadius: 14, padding: '0 16px 4px'}}>{word}</span>
        </div>
      </div>
    </div>
  );
};

// Segmented progress bar: one segment per element. `fill` = fill of each segment, 0 to 1.
export const PROGRESS = {x: 60, y: 188, w: 960, h: 9, gap: 12};
export const segRect = (i: number) => {
  const w = (PROGRESS.w - (ELEMENTS.length - 1) * PROGRESS.gap) / ELEMENTS.length;
  return {x: PROGRESS.x + i * (w + PROGRESS.gap), y: PROGRESS.y, w, h: PROGRESS.h};
};
export const ProgressBar: React.FC<{readonly fill: number[]; readonly opacity?: number}> = ({fill, opacity = 1}) => (
  <div style={{opacity}}>
    {fill.map((v, i) => {
      const r = segRect(i);
      return (
        <div key={`segment-${i}`} style={{position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: 99, background: 'rgba(255,255,255,0.16)', overflow: 'hidden'}}>
          <div style={{width: `${v * 100}%`, height: '100%', borderRadius: 99, background: v >= 1 ? '#fff' : C.mint, boxShadow: `0 0 16px ${C.mint}`}} />
        </div>
      );
    })}
  </div>
);

// A brand written with a digit and lowercase letters (n8n) keeps its spelling in capitalized text
export const caseStyle = (t: string): React.CSSProperties => (/\d/.test(t) && /[a-z]/.test(t) ? {textTransform: 'none'} : {});

// Word by word captions (absolute frames): capitals, current word on a mint pill, upcoming words dimmed
export const Captions: React.FC<{readonly hideIn?: [number, number][]; readonly y?: number}> = ({hideIn = [], y = CAPTION_Y}) => {
  const frame = useCurrentFrame();
  if (hideIn.some(([a, b]) => frame >= a && frame < b)) {
    return null;
  }
  const page = PAGES.find((p) => frame >= p.start && frame < p.end);
  if (!page) {
    return null;
  }
  const k = interpolate(frame, [page.start, page.start + 5], [0, 1], {...CLAMP, easing: EASE_OUT});
  let active = -1;
  page.words.forEach((w, i) => {
    if (frame >= w.at - 1) {
      active = i;
    }
  });
  return (
    <div style={{position: 'absolute', left: 60, right: 60, top: y - 80, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '6px 14px',
          maxWidth: 840,
          scale: 0.9 + 0.1 * k,
          opacity: k,
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: 68,
          lineHeight: 1.12,
          textTransform: 'uppercase',
          letterSpacing: '-0.01em',
          color: '#fff',
        }}
      >
        {page.words.map((w, i) => {
          const on = i === active;
          return (
            <span
              key={`word-${page.start}-${i}`}
              style={{
                padding: '2px 12px 6px',
                borderRadius: 16,
                background: on ? C.mint : 'transparent',
                color: on ? C.bg : '#FFFFFF',
                textShadow: on ? 'none' : '0 4px 0 rgba(6,10,16,0.6), 0 0 26px rgba(6,10,16,0.7)',
                opacity: i <= active ? 1 : 0.62,
                scale: on ? 1.04 : 1,
                whiteSpace: 'nowrap',
                ...caseStyle(w.t),
              }}
            >
              {w.t}
            </span>
          );
        })}
      </div>
    </div>
  );
};

// Tilted stamp, for numbers and punchlines
export const Stamp: React.FC<{readonly children: React.ReactNode; readonly k: number; readonly color?: string; readonly size?: number; readonly rotate?: number; readonly style?: React.CSSProperties}> = ({children, k, color = C.mint, size = 62, rotate = -6, style}) => (
  <div
    style={{
      position: 'absolute',
      padding: '12px 32px 14px',
      border: `7px solid ${color}`,
      borderRadius: 18,
      color,
      fontFamily: DISPLAY,
      fontWeight: 700,
      fontSize: size,
      letterSpacing: '0.03em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
      rotate: `${rotate}deg`,
      scale: 1.9 - 0.9 * Math.min(1, k),
      opacity: Math.min(1, k * 2.5),
      boxShadow: `0 0 44px ${color}66`,
      background: 'rgba(10,17,24,0.86)',
      ...style,
    }}
  >
    {children}
  </div>
);

// Checked badge
export const Check: React.FC<{readonly k: number; readonly size?: number; readonly color?: string; readonly style?: React.CSSProperties}> = ({k, size = 48, color = C.mint, style}) => (
  <div style={{width: size, height: size, borderRadius: 99, background: color, display: 'grid', placeItems: 'center', flex: 'none', scale: Math.max(0, k), opacity: Math.min(1, k * 2), ...style}}>
    <Icon name="check" size={size * 0.62} color={C.bg} stroke={3.4} />
  </div>
);

// Toggle switch
export const Toggle: React.FC<{readonly on: number; readonly w?: number}> = ({on, w = 92}) => {
  const h = w * 0.56;
  return (
    <div style={{width: w, height: h, borderRadius: 99, background: on > 0.5 ? C.mint : 'rgba(255,255,255,0.14)', position: 'relative', flex: 'none', boxShadow: on > 0.5 ? '0 0 24px rgba(95,227,193,0.45)' : 'none'}}>
      <div style={{position: 'absolute', top: h * 0.1, left: h * 0.1 + on * (w - h), width: h * 0.8, height: h * 0.8, borderRadius: 99, background: '#fff', boxShadow: '0 3px 8px rgba(0,0,0,0.35)'}} />
    </div>
  );
};

// Mouse cursor; `press` 0 to 1 during the click
export const Cursor: React.FC<{readonly x: number; readonly y: number; readonly press?: number; readonly size?: number; readonly opacity?: number}> = ({x, y, press = 0, size = 54, opacity = 1}) => (
  <svg viewBox="0 0 16 22" width={size} height={size * 1.375} style={{position: 'absolute', left: x, top: y, opacity, scale: 1 - press * 0.16, transformOrigin: '0 0', filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.5))'}}>
    <path d="M1 1 L1 17.5 L5.4 13.6 L8.3 20.4 L11.3 19.1 L8.4 12.4 L14.2 12.4 Z" fill="#fff" stroke="#0A1118" strokeWidth={1.4} strokeLinejoin="round" />
  </svg>
);

// Click ripple at frame `at`
export const ClickRing: React.FC<{readonly x: number; readonly y: number; readonly at: number; readonly color?: string}> = ({x, y, at, color = C.mint}) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [at, at + 14], [0, 1], {...CLAMP, easing: EASE_OUT});
  if (frame < at || frame > at + 14) {
    return null;
  }
  return <div style={{position: 'absolute', left: x - 60, top: y - 60, width: 120, height: 120, borderRadius: 99, border: `5px solid ${color}`, opacity: 1 - t, scale: 0.2 + 0.8 * t}} />;
};

// Real sound wave: this reel's voice, read from the envelope, around an absolute frame
export const VoiceWave: React.FC<{readonly abs: number; readonly w: number; readonly h: number; readonly bars?: number; readonly color?: string; readonly k?: number; readonly style?: React.CSSProperties}> = ({abs, w, h, bars = 36, color = C.mint, k = 1, style}) => {
  const gap = Math.max(3, Math.round((w / bars) * 0.34));
  const bw = (w - gap * (bars - 1)) / bars;
  return (
    <div style={{position: 'relative', width: w, height: h, display: 'flex', alignItems: 'center', gap, ...style}}>
      {new Array(bars).fill(0).map((_, i) => {
        const v = envAt(abs - (bars - 1 - i) * 1.4);
        const shape = 0.35 + 0.65 * Math.abs(Math.sin(i * 1.7));
        return <div key={`bar-${i}`} style={{width: bw, height: Math.max(bw, h * v * shape * k), borderRadius: 99, background: color, flex: 'none'}} />;
      })}
    </div>
  );
};

// Standard card block for window content
export const cardStyle: React.CSSProperties = {background: 'rgba(23,36,52,0.96)', border: `2px solid ${C.line}`, borderRadius: 22, boxShadow: '0 16px 40px rgba(0,0,0,0.35)'};

// Icon tile for interface rows
export const IconTile: React.FC<{readonly name: IconName; readonly size?: number; readonly color?: string; readonly bg?: string; readonly style?: React.CSSProperties}> = ({name, size = 64, color = C.bg, bg = C.mint, style}) => (
  <div style={{width: size, height: size, borderRadius: size * 0.28, background: bg, display: 'grid', placeItems: 'center', flex: 'none', ...style}}>
    <Icon name={name} size={size * 0.56} color={color} stroke={2.3} />
  </div>
);

// Scene wrapper inside the window: `start` = local frame where it appears, `dur` = where it is gone.
// Two neighboring scenes overlap by a few frames: the window never empties, it is a single shot.
export const SceneFade: React.FC<{readonly start?: number; readonly dur: number; readonly children: React.ReactNode}> = ({start = 0, dur, children}) => {
  const frame = useCurrentFrame();
  const a = rise(frame, start, 8);
  const b = interpolate(frame, [dur - 6, dur], [1, 0], CLAMP);
  return <AbsoluteFill style={{opacity: Math.min(a, b), translate: `0px ${(1 - a) * 26}px`}}>{children}</AbsoluteFill>;
};

export type Sfx = {name: string; at: number; vol: number};
