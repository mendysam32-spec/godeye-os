// Setting 2: "Second setting: connectors. In a few clicks, Claude connects to your tools. Your email, your calendar,
// Notion. I connected it to Eleven Labs. It wrote its text, sent it, and got back this voice. All by itself."
// Star diagram around Claude, then a single cable to ElevenLabs: the text goes out, the voice comes back.
import {interpolate, useCurrentFrame} from 'remotion';
import {CLAMP, cues, EASE_IN_OUT, EASE_OUT, fall, flash, path, pop, rise} from '../anim';
import {SECTIONS} from '../data';
import {BODY, C, cardStyle, ClaudeMark, ClickRing, Cursor, DISPLAY, envAt, Icon, type IconName, IconTile, MONO, type Sfx, Stamp, Toggle, VoiceWave} from '../kit';

const c = cues('r2');

const T = {
  second: c('Second'),
  connectors: c('connectors'),
  few: c('few'),
  clicks: c('clicks'),
  claude: c('Claude'),
  connects: c('connects'),
  tools: c('tools'),
  email: c('email'),
  calendar: c('calendar'),
  notion: c('Notion'),
  me: c('I'),
  eleven: c('Eleven'),
  labs: c('Labs'),
  wrote: c('wrote'),
  sent: c('sent'),
  got: c('got'),
  voice: c('voice'),
  all: c('All'),
};

const BTN_IN = T.connectors + 8; // the "+ Connect" button comes out while Claude moves up
const CLICK_1 = T.few + 1;
const CLICK_2 = T.clicks + 1;
const OUT = T.me - 2; // the tiles fade out, Claude moves to the left
const CARD_IN = T.me + 6; // the ElevenLabs card comes in from the bottom
const SEND = T.sent - 2; // the sheet leaves
const LAND = SEND + 16; // it reaches ElevenLabs
const BACK = T.got - 2; // the voice travels back to Claude
const HOME = BACK + 16; // it arrives near Claude
const GROW = T.voice - 2; // the wave card grows in the center
const FADE = T.voice - 3; // Claude, the cable and ElevenLabs fade out

// Layout, in pixels inside the 960 x 700 window
const HUB = {x: 480, xAside: 145, y: 125, yStart: 350, size: 170, big: 230}; // center and side of the Claude tile
const BTN = {x: 480, y: 410, w: 380, h: 96}; // low enough to balance the tile, while the tools are not there yet
const TIP = {x: 604, y: 436}; // cursor tip: under the button text, so it does not hide it
const PLUG = 70; // diameter of the plug seated on the tile
const TILE = {w: 280, h: 210, y: 450};
const ELEVEN = {x: 60, y: 470, w: 840, h: 190};
const SHEET = {w: 196, h: 224};
const WAVE = {w0: 396, h0: 146, w1: 840, h1: 430, cx: 480, cy: 310}; // high enough: with the stamp, the block stays centered

type Pt = {x: number; y: number};

// Cable: Bezier curve read at constant speed, so the glowing dot, the sheet and the card stay stuck to the line
const cable = (p0: Pt, p1: Pt, p2: Pt, p3: Pt) => {
  const n = 80;
  const pts = new Array(n + 1).fill(0).map((_, i): Pt => {
    const t = i / n;
    const u = 1 - t;
    const mix = (a: number, b: number, d: number, e: number) => u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * d + t * t * t * e;
    return {x: mix(p0.x, p1.x, p2.x, p3.x), y: mix(p0.y, p1.y, p2.y, p3.y)};
  });
  const len = [0];
  for (let i = 1; i <= n; i++) {
    len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return {
    d: `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`,
    // point at fraction `f` of the cable length
    at: (f: number): Pt => {
      const want = Math.max(0, Math.min(1, f)) * len[n];
      const i = Math.max(1, len.findIndex((l) => l >= want));
      const r = (want - len[i - 1]) / Math.max(0.001, len[i] - len[i - 1]);
      return {x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * r, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * r};
    },
  };
};
type Cable = ReturnType<typeof cable>;

type Tool = {name: string; icon: IconName; x: number; at: number; line: Cable};
const tool = (name: string, icon: IconName, x: number, at: number): Tool => ({
  name,
  icon,
  x,
  at,
  line: cable({x: HUB.x, y: HUB.y}, {x: HUB.x, y: 300}, {x: x + TILE.w / 2, y: 270}, {x: x + TILE.w / 2, y: TILE.y}),
});
const TOOLS = [tool('Email', 'mail', 30, T.email), tool('Calendar', 'calendar', 340, T.calendar), tool('Notion', 'file', 650, T.notion)];

// The cable to ElevenLabs: it leaves Claude on the right and dives to the card, long enough for the trip to be seen
const LINE = cable({x: HUB.xAside, y: HUB.y}, {x: 540, y: HUB.y}, {x: 690, y: 230}, {x: 690, y: ELEVEN.y});
const SHEET_F = 0.35; // the sheet fills up at this point of the cable, near Claude
const WAVE_F = 0.5; // the wave card stops here on the way back

const SHEET_LINES = [1, 0.84, 0.94, 0.7, 0.9, 0.56];

// Small damped bounce starting at frame `at`: 0 at rest, about 0.6 at the peak
const wobble = (frame: number, at: number) => {
  const t = frame - at;
  return t <= 0 ? 0 : Math.exp(-t / 6) * Math.sin(t / 1.7);
};

const pressAt = (frame: number, at: number) => interpolate(frame, [at - 2, at, at + 5], [0, 1, 0], CLAMP);

// Position of the Claude tile: centered for the opening, at the top of the diagram, then on the left for the duo with ElevenLabs
const hubAt = (frame: number) => {
  const up = interpolate(frame, [T.connectors - 3, T.connectors + 9], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  const aside = interpolate(frame, [OUT, OUT + 14], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  return {x: HUB.x + (HUB.xAside - HUB.x) * aside, y: HUB.yStart + (HUB.y - HUB.yStart) * up, size: HUB.big + (HUB.size - HUB.big) * up};
};

const Hub: React.FC = () => {
  const frame = useCurrentFrame();
  const k = pop(frame, T.second + 4, 30, 12, 180);
  const h = hubAt(frame);
  const glow = Math.max(flash(frame, T.connectors, 36), flash(frame, T.connects, 36));
  return (
    <div
      style={{
        position: 'absolute',
        left: h.x - h.size / 2,
        top: h.y - h.size / 2,
        width: h.size,
        height: h.size,
        borderRadius: h.size * 0.28,
        background: 'linear-gradient(150deg, #D9653A 0%, #A8431F 100%)',
        display: 'grid',
        placeItems: 'center',
        opacity: Math.min(1, k * 2) * fall(frame, FADE, 9),
        scale: (0.6 + 0.4 * k) * (1 + 0.16 * wobble(frame, T.connects - 1)),
        boxShadow: `0 16px 40px rgba(0,0,0,0.45), 0 0 ${54 + 76 * glow}px rgba(255,122,69,${0.38 + 0.42 * glow})`,
      }}
    >
      <ClaudeMark size={h.size * 0.68} color="#fff" rotate={frame * 0.4 + interpolate(frame, [T.wrote, SEND], [0, 140], {...CLAMP, easing: EASE_IN_OUT})} />
    </div>
  );
};

// The "+ Connect" button: two clicks, then it folds into a plug and flies to plug into Claude
const Plug: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < BTN_IN) {
    return null;
  }
  const k = pop(frame, BTN_IN, 30, 12, 190);
  const fly = interpolate(frame, [T.claude - 3, T.connects - 1], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  const hub = hubAt(frame);
  const seatX = hub.x + hub.size / 2 - 8;
  const seatY = hub.y + hub.size / 2 - 8;
  const x = BTN.x + (seatX - BTN.x) * fly;
  const y = BTN.y + (seatY - BTN.y) * fly;
  const w = BTN.w + (PLUG - BTN.w) * fly;
  const h = BTN.h + (PLUG - BTN.h) * fly;
  const press = Math.max(pressAt(frame, CLICK_1), pressAt(frame, CLICK_2));
  const lit = flash(frame, T.connects, 36);
  return (
    <div
      style={{
        position: 'absolute',
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        borderRadius: 99,
        overflow: 'hidden',
        background: C.mint,
        opacity: Math.min(1, k * 2) * fall(frame, FADE, 9),
        scale: (0.7 + 0.3 * k) * (1 - press * 0.07) * (1 + 0.2 * wobble(frame, T.connects - 1)),
        boxShadow: `0 0 ${24 + 64 * lit}px rgba(95,227,193,${0.35 + 0.6 * lit})`,
      }}
    >
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'grid', placeItems: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: 42, color: C.bg, whiteSpace: 'nowrap', opacity: Math.max(0, 1 - fly * 3)}}>+ Connect</div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'grid', placeItems: 'center', opacity: Math.max(0, fly * 3 - 2)}}>
        <Icon name="plug" size={42} color={C.bg} stroke={2.6} />
      </div>
    </div>
  );
};

// Drawing of a cable (0 to 1) and its glowing dot: it leads the line, then loops from `live` on
const Wire: React.FC<{readonly line: Cable; readonly t: number; readonly live: number; readonly dot?: boolean}> = ({line, t, live, dot = true}) => {
  const frame = useCurrentFrame();
  if (t <= 0) {
    return null;
  }
  const loop = frame >= live ? ((frame - live) / 30) % 1 : null;
  const head = line.at(loop ?? t);
  const a = loop === null ? 1 : Math.sin(loop * Math.PI);
  const trace = {d: line.d, fill: 'none', strokeLinecap: 'round' as const, pathLength: 1, strokeDasharray: '1 1', strokeDashoffset: 1 - t};
  return (
    <g>
      <path {...trace} stroke="rgba(95,227,193,0.22)" strokeWidth={13} />
      <path {...trace} stroke={C.mint} strokeWidth={4.5} />
      {dot ? (
        <>
          <circle cx={head.x} cy={head.y} r={17} fill={C.mint} opacity={0.32 * a} />
          <circle cx={head.x} cy={head.y} r={8} fill="#fff" opacity={a} />
        </>
      ) : null}
    </g>
  );
};

// A dashed slot on "tools", replaced by the real tile on its word: cable, then switch
const ToolTile: React.FC<{readonly t: Tool; readonly i: number}> = ({t, i}) => {
  const frame = useCurrentFrame();
  const slot = pop(frame, T.tools - 5 + i * 4, 30, 12, 200);
  const k = pop(frame, t.at - 2, 30, 12, 200);
  const on = interpolate(frame, [t.at + 9, t.at + 15], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  const lit = on > 0.5;
  const glow = flash(frame, t.at + 12, 36);
  return (
    <>
      <div style={{position: 'absolute', left: t.x, top: TILE.y, width: TILE.w, height: TILE.h, boxSizing: 'border-box', borderRadius: 22, border: '3px dashed rgba(255,255,255,0.3)', opacity: Math.min(1, slot * 2) * (1 - Math.min(1, k * 1.5)), scale: 0.85 + 0.15 * slot}} />
      <div
        style={{
          position: 'absolute',
          left: t.x,
          top: TILE.y,
          width: TILE.w,
          height: TILE.h,
          boxSizing: 'border-box',
          ...cardStyle,
          border: `2.5px solid ${lit ? C.mint : C.line}`,
          boxShadow: lit ? `0 0 ${24 + 50 * glow}px rgba(95,227,193,${0.2 + 0.4 * glow})` : cardStyle.boxShadow,
          opacity: Math.min(1, k * 2),
          scale: 0.8 + 0.2 * k,
        }}
      >
        <IconTile name={t.icon} size={84} bg={lit ? C.mint : 'rgba(255,255,255,0.14)'} color={lit ? C.bg : '#fff'} style={{position: 'absolute', left: 24, top: 22}} />
        <div style={{position: 'absolute', right: 24, top: 36}}>
          <Toggle on={on} w={100} />
        </div>
        <div style={{position: 'absolute', left: 24, top: 120, fontFamily: DISPLAY, fontWeight: 700, fontSize: 46, lineHeight: 1.2, color: '#fff', whiteSpace: 'nowrap'}}>{t.name}</div>
      </div>
    </>
  );
};

// The star: three cables and three tiles, which fade out and move up on "I"
const Star: React.FC = () => {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [OUT, OUT + 14], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  if (out >= 1) {
    return null;
  }
  return (
    <div style={{position: 'absolute', inset: 0, opacity: 1 - Math.min(1, out * 1.5), translate: `0px ${out * -110}px`}}>
      <svg width={960} height={700} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
        {TOOLS.map((t) => (
          <Wire key={t.name} line={t.line} t={interpolate(frame, [t.at - 2, t.at + 10], [0, 1], {...CLAMP, easing: EASE_IN_OUT})} live={t.at + 11} />
        ))}
      </svg>
      {TOOLS.map((t, i) => (
        <ToolTile key={t.name} t={t} i={i} />
      ))}
    </div>
  );
};

// The cable to ElevenLabs: its glowing dot loops until the sheet takes over
const ElevenWire: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <svg width={960} height={700} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: fall(frame, FADE, 9)}}>
      <Wire line={LINE} t={interpolate(frame, [T.labs - 2, T.labs + 10], [0, 1], {...CLAMP, easing: EASE_IN_OUT})} live={T.labs + 11} dot={frame < T.wrote - 2} />
    </svg>
  );
};

// ElevenLabs two-bar icon: the bars move while the service makes the voice
const ElevenMark: React.FC<{readonly color: string; readonly busy: boolean}> = ({color, busy}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 20}}>
      {[0, 1].map((i) => (
        <div key={`bar-${i}`} style={{width: 15, height: 60 * (busy ? 0.5 + 0.5 * Math.abs(Math.sin(frame / 2.4 + i * 1.3)) : 1), borderRadius: 99, background: color}} />
      ))}
    </div>
  );
};

// Large ElevenLabs card: the two halves of the name light up on "Eleven" then "Labs"
const ElevenCard: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < CARD_IN) {
    return null;
  }
  const k = pop(frame, CARD_IN, 30, 15, 150);
  const on = interpolate(frame, [T.labs + 9, T.labs + 15], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  const lit = on > 0.5;
  const eleven = rise(frame, T.eleven - 2, 6);
  const labs = rise(frame, T.labs - 2, 6);
  const glow = Math.max(flash(frame, T.labs + 12, 40), flash(frame, LAND, 30));
  return (
    <div
      style={{
        position: 'absolute',
        left: ELEVEN.x,
        top: ELEVEN.y,
        width: ELEVEN.w,
        height: ELEVEN.h,
        boxSizing: 'border-box',
        ...cardStyle,
        borderRadius: 30,
        border: `2.5px solid ${lit ? C.mint : C.line}`,
        boxShadow: lit ? `0 0 ${36 + 70 * glow}px rgba(95,227,193,${0.28 + 0.42 * glow})` : cardStyle.boxShadow,
        opacity: Math.min(1, k * 2) * fall(frame, FADE, 9),
        translate: `0px ${(1 - k) * 300}px`,
      }}
    >
      <div style={{position: 'absolute', left: 32, top: 34, width: 118, height: 118, borderRadius: 32, background: lit ? C.mint : 'rgba(255,255,255,0.14)', display: 'grid', placeItems: 'center'}}>
        <ElevenMark color={lit ? C.bg : '#fff'} busy={frame >= LAND && frame < BACK} />
      </div>
      <div style={{position: 'absolute', left: 176, top: 30, fontFamily: DISPLAY, fontWeight: 700, fontSize: 62, lineHeight: 1.15, letterSpacing: '-0.02em', color: '#fff', whiteSpace: 'nowrap'}}>
        <span style={{opacity: 0.32 + 0.68 * eleven}}>Eleven</span>
        <span style={{opacity: 0.32 + 0.68 * labs}}>Labs</span>
      </div>
      <div style={{position: 'absolute', left: 176, top: 108, fontFamily: BODY, fontWeight: 500, fontSize: 32, lineHeight: 1.2, color: C.muted, whiteSpace: 'nowrap'}}>Voice clone</div>
      <div style={{position: 'absolute', right: 34, top: 58}}>
        <Toggle on={on} w={130} />
      </div>
    </div>
  );
};

// script.md sheet: placed on the cable near Claude, it fills up, then rolls to ElevenLabs
const Sheet: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < T.wrote - 2 || frame >= LAND) {
    return null;
  }
  const k = pop(frame, T.wrote - 2, 30, 12, 200);
  const go = interpolate(frame, [SEND, LAND], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  const p = LINE.at(SHEET_F + (1 - SHEET_F) * go);
  return (
    <div
      style={{
        position: 'absolute',
        left: p.x - SHEET.w / 2,
        top: p.y - SHEET.h / 2,
        width: SHEET.w,
        height: SHEET.h,
        borderRadius: 16,
        background: C.text,
        boxShadow: '0 16px 36px rgba(0,0,0,0.5)',
        opacity: Math.min(1, k * 2) * fall(frame, LAND - 3, 3),
        scale: (0.6 + 0.4 * k) * (1 - 0.56 * go),
        rotate: `${Math.sin(go * Math.PI) * -8}deg`,
      }}
    >
      <div style={{position: 'absolute', left: 0, right: 0, top: 16, textAlign: 'center', fontFamily: MONO, fontWeight: 600, fontSize: 28, lineHeight: 1.2, color: C.bg, whiteSpace: 'nowrap'}}>script.md</div>
      <div style={{position: 'absolute', left: 22, right: 22, top: 56, height: 2, background: 'rgba(10,17,24,0.2)'}} />
      {SHEET_LINES.map((w, i) => {
        const at = T.wrote + i * 4;
        return <div key={`line-${i}`} style={{position: 'absolute', left: 22, top: 74 + i * 23, width: interpolate(frame, [at, at + 5], [0, (SHEET.w - 44) * w], {...CLAMP, easing: EASE_OUT}), height: 11, borderRadius: 99, background: 'rgba(10,17,24,0.58)'}} />;
      })}
    </div>
  );
};

// Wave card: the real waveform of this voice travels up the cable, then fills the scene on "voice"
const WaveCard: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < BACK) {
    return null;
  }
  const abs = frame + SECTIONS.r2.from;
  const k = pop(frame, BACK, 30, 14, 200);
  const g = pop(frame, GROW, 30, 15, 170);
  const p = LINE.at(interpolate(frame, [BACK, HOME], [1, WAVE_F], {...CLAMP, easing: EASE_IN_OUT}));
  const mix = (a: number, b: number) => a + (b - a) * g;
  const w = mix(WAVE.w0, WAVE.w1);
  const h = mix(WAVE.h0, WAVE.h1);
  const waveW = mix(352, 760);
  const voice = envAt(abs) * Math.min(1, g);
  return (
    <div
      style={{
        position: 'absolute',
        left: mix(p.x, WAVE.cx) - w / 2,
        top: mix(p.y, WAVE.cy) - h / 2,
        width: w,
        height: h,
        boxSizing: 'border-box',
        ...cardStyle,
        borderRadius: mix(22, 34),
        border: `2.5px solid ${C.mint}`,
        overflow: 'hidden',
        opacity: Math.min(1, k * 2),
        scale: 0.5 + 0.5 * k,
        boxShadow: `0 16px 40px rgba(0,0,0,0.45), 0 0 ${30 + 80 * voice}px rgba(95,227,193,${0.25 + 0.45 * voice})`,
      }}
    >
      <div style={{position: 'absolute', left: 0, right: 0, top: mix(16, 46), textAlign: 'center', fontFamily: MONO, fontWeight: 600, fontSize: mix(28, 40), lineHeight: 1.2, letterSpacing: '0.04em', color: C.mint, whiteSpace: 'nowrap'}}>MY CLONED VOICE</div>
      <div style={{position: 'absolute', left: (w - 5 - waveW) / 2, top: mix(60, 124)}}>
        <VoiceWave abs={abs} w={waveW} h={mix(66, 240)} bars={36} />
      </div>
    </div>
  );
};

export const Setting2: React.FC = () => {
  const frame = useCurrentFrame();
  const cursor = path(frame, [
    [T.connectors + 10, 1010, 640],
    [T.few - 3, TIP.x, TIP.y],
    [CLICK_2 + 6, TIP.x, TIP.y],
    [T.connects, 1010, 640],
  ]);
  const seat = {x: HUB.x + HUB.size / 2 - 8, y: HUB.y + HUB.size / 2 - 8};
  return (
    <>
      <Star />
      <ElevenWire />
      <Hub />
      <Plug />
      <ElevenCard />
      <Sheet />
      <WaveCard />
      {frame >= T.all - 1 ? (
        <Stamp k={pop(frame, T.all - 1, 30, 11, 240)} size={64} rotate={-6} style={{left: 680, top: 530, translate: '-50% -50%'}}>
          By itself
        </Stamp>
      ) : null}
      <ClickRing x={TIP.x} y={TIP.y} at={CLICK_1} color="#fff" />
      <ClickRing x={TIP.x} y={TIP.y} at={CLICK_2} color="#fff" />
      <ClickRing x={seat.x} y={seat.y} at={T.connects - 1} />
      {frame < T.connects + 1 ? <Cursor x={cursor.x} y={cursor.y} press={Math.max(pressAt(frame, CLICK_1), pressAt(frame, CLICK_2))} /> : null}
    </>
  );
};

export const r2Sfx: Sfx[] = [
  {name: 'pop-high', at: T.connectors - 4, vol: 0.2},
  {name: 'pop', at: BTN_IN - 3, vol: 0.18},
  {name: 'click', at: CLICK_1 - 2, vol: 0.26},
  {name: 'click', at: CLICK_2 - 2, vol: 0.26},
  {name: 'whoosh-short', at: T.claude - 5, vol: 0.12},
  {name: 'pop-high', at: T.connects - 3, vol: 0.24},
  ...TOOLS.map((_, i) => ({name: 'tick', at: T.tools - 7 + i * 4, vol: 0.12})),
  ...TOOLS.map((t) => ({name: 'pop', at: t.at - 4, vol: 0.2})),
  ...TOOLS.map((t) => ({name: 'tick', at: t.at + 8, vol: 0.2})),
  {name: 'whoosh-short', at: OUT - 2, vol: 0.2},
  {name: 'pop', at: CARD_IN - 2, vol: 0.2},
  {name: 'tick', at: T.labs + 7, vol: 0.22},
  {name: 'chime', at: T.labs + 8, vol: 0.14},
  {name: 'pop', at: T.wrote - 4, vol: 0.18},
  {name: 'key', at: T.wrote + 2, vol: 0.08},
  {name: 'key', at: T.wrote + 10, vol: 0.08},
  {name: 'key', at: T.wrote + 18, vol: 0.08},
  {name: 'whoosh-short', at: SEND - 2, vol: 0.2},
  {name: 'tick', at: LAND - 2, vol: 0.18},
  {name: 'whoosh-short', at: BACK - 2, vol: 0.2},
  {name: 'sparkles', at: GROW - 3, vol: 0.16},
  {name: 'stamp', at: T.all - 3, vol: 0.3},
];
