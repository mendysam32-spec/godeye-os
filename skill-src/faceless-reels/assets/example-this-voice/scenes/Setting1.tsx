// Setting 1: "First setting: the app on your computer. On the website, Claude answers you. On your computer, it acts.
// It opens your folders, it creates your files, it runs your programs. It built this video directly on my Mac."
// One single set that transforms: the install card, the tame website chat, then the app that takes over.
import {Img, interpolate, interpolateColors, staticFile, useCurrentFrame} from 'remotion';
import {CLAMP, cues, EASE_IN_OUT, EASE_OUT, fall, flash, path, pop, rise, typed} from '../anim';
import {BODY, C, cardStyle, Check, ClaudeMark, ClickRing, Cursor, DISPLAY, Icon, type IconName, IconTile, MONO, type Sfx, Stamp} from '../kit';

const c = cues('r1');

const T = {
  first: c('First'),
  app: c('app'),
  computer: c('computer'),
  onSite: c('on', 2),
  website: c('website'),
  claude: c('Claude'),
  answers: c('answers'),
  onComputer: c('computer', 2),
  acts: c('acts'),
  opens: c('opens'),
  folders: c('folders'),
  creates: c('creates'),
  files: c('files'),
  runs: c('runs'),
  programs: c('programs'),
  video: c('video'),
  mac: c('Mac'),
};

const CLICK = T.computer - 2; // the click lands on "computer"
const BAR_END = CLICK + 14; // bar full: the button closes into a check
const CARD_OUT = T.onSite - 2; // the card makes room for the chat
const TYPE_AT = T.answers - 4; // Claude starts typing its answer
const SLIDE = T.onComputer - 2; // everything slides, on the frame where the window title changes (Reel.tsx)
const EXPAND = T.runs - 6; // the terminal takes the full width so the commands fit on one line
const TERM_OUT = T.video - 4; // the terminal fades out just before the word
const RENDER = T.video; // the render arrives on "video", terminal already gone

// Layout, in pixels inside the 960 x 700 window
const CARD = {x: 170, y: 72, w: 620, h: 556};
const BTN = {cx: 480, cy: 512, w: 380, h: 98, bar: 30};
const TIP = {x: 590, y: 538}; // cursor tip: under the word "Install", so it does not hide it
const PANEL = {y: 110, h: 560};
const TREE = {x: 30, w: 340, row: 74, pad: 14};
const TERM = {x: 390, w: 540, xFull: 30, wFull: 900, head: 66};
const CMD_ROW = {y: 126, gap: 132, h: 84};
const THUMB = {x: 28, y: 26, w: 286, h: 508}; // 9:16, inside the panel
const COL = {x: 354, w: 512, lift: 56}; // render column, inside the panel

// Claude's answer: two fixed lines, so no word jumps to the next line while typing
const LINE_1 = 'Here are a few tips for';
const LINE_2 = 'editing your video…';
const REPLY = `${LINE_1} ${LINE_2}`;
const REPLY_CPS = 60; // the sentence ends a few frames before the push: a calm pause

const CMD_CPS = 220;
const CMDS = [
  {text: 'ffmpeg -i take_1.mp3 voice.wav', at: T.runs - 3},
  {text: 'python3 scripts/build_reel.py', at: T.programs - 3},
  {text: 'npx remotion render Reel-Claude', at: T.programs + 6},
].map((cmd) => ({...cmd, end: cmd.at + Math.ceil((cmd.text.length / CMD_CPS) * 30) + 1}));

const FILE_AT = {script: T.creates - 2, voice: T.creates + 7, reel: T.files + 3};

type Row = {name: string; depth: number; at: number; folder: boolean; opens?: number; hot?: number};
// The real project tree: voice.wav and Reel.tsx live under remotion/, script.md at the root
const ROWS: Row[] = [
  {name: 'video - 000', depth: 0, at: SLIDE, folder: true, opens: T.opens - 2, hot: T.opens - 1},
  {name: 'hook/', depth: 1, at: T.opens + 3, folder: true},
  {name: 'voice/', depth: 1, at: T.folders - 3, folder: true},
  {name: 'remotion/', depth: 1, at: T.folders + 4, folder: true, opens: FILE_AT.voice - 3},
  {name: 'voice.wav', depth: 2, at: FILE_AT.voice, folder: false, hot: FILE_AT.voice + 1},
  {name: 'Reel.tsx', depth: 2, at: FILE_AT.reel, folder: false, hot: FILE_AT.reel + 1},
  {name: 'script.md', depth: 1, at: FILE_AT.script, folder: false, hot: FILE_AT.script + 1},
];

// Small damped bounce starting at frame `at`: 0 at rest, about 0.6 at the peak
const wobble = (frame: number, at: number) => {
  const t = frame - at;
  return t <= 0 ? 0 : Math.exp(-t / 6) * Math.sin(t / 1.7);
};

const expandAt = (frame: number) => interpolate(frame, [EXPAND, EXPAND + 12], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
const pressAt = (frame: number) => interpolate(frame, [CLICK - 2, CLICK, CLICK + 6], [0, 1, 0], CLAMP);

// "Install" button: it squashes into a bar, fills up, then closes into a checked pill
const InstallButton: React.FC<{readonly k: number}> = ({k}) => {
  const frame = useCurrentFrame();
  const squash = interpolate(frame, [CLICK + 1, CLICK + 6], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  const fill = interpolate(frame, [CLICK + 3, BAR_END], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  const done = pop(frame, BAR_END, 30, 12, 220);
  const w = BTN.w + (BTN.h - BTN.w) * done;
  const h = BTN.h + (BTN.bar - BTN.h) * squash + (BTN.h - BTN.bar) * done;
  const solid = Math.max(1 - squash, Math.min(1, done * 3));
  const glow = flash(frame, BAR_END + 2, 26);
  return (
    <div
      style={{
        position: 'absolute',
        left: BTN.cx - CARD.x - w / 2,
        top: BTN.cy - CARD.y - h / 2,
        width: w,
        height: h,
        borderRadius: 99,
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.14)',
        opacity: Math.min(1, k * 2),
        scale: (0.7 + 0.3 * k) * (1 - pressAt(frame) * 0.06),
        boxShadow: `0 0 ${24 + 60 * glow}px rgba(95,227,193,${0.25 + 0.5 * glow})`,
      }}
    >
      <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: `${fill * 100}%`, background: C.mint}} />
      <div style={{position: 'absolute', inset: 0, background: C.mint, opacity: solid}} />
      <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, opacity: Math.max(0, 1 - squash * 2.5), fontFamily: DISPLAY, fontWeight: 700, fontSize: 44, color: C.bg, whiteSpace: 'nowrap'}}>
        <Icon name="download" size={42} color={C.bg} stroke={2.8} />
        Install
      </div>
      <div style={{position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', scale: Math.max(0, done), opacity: Math.min(1, done * 2)}}>
        <Icon name="check" size={60} color={C.bg} stroke={3.6} />
      </div>
    </div>
  );
};

// Install card, from "First" to "On the website"
const InstallCard: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame >= CARD_OUT + 8) {
    return null;
  }
  const k = pop(frame, T.first + 2, 30, 14, 170);
  const out = fall(frame, CARD_OUT, 8);
  const icon = pop(frame, T.first + 6, 30, 10, 190);
  const text = rise(frame, T.first + 9, 10);
  const btn = pop(frame, T.first + 13, 30, 12, 200);
  const glow = flash(frame, T.app, 36);
  return (
    <div style={{position: 'absolute', left: CARD.x, top: CARD.y, width: CARD.w, height: CARD.h, boxSizing: 'border-box', ...cardStyle, borderRadius: 34, opacity: Math.min(1, k * 1.6) * out, scale: (0.9 + 0.1 * k) * (0.92 + 0.08 * out), translate: `0px ${(1 - k) * 34}px`}}>
      <div
        style={{
          position: 'absolute',
          left: CARD.w / 2 - 90,
          top: 48,
          width: 180,
          height: 180,
          borderRadius: 48,
          background: 'linear-gradient(150deg, #D9653A 0%, #A8431F 100%)',
          display: 'grid',
          placeItems: 'center',
          opacity: Math.min(1, icon * 2),
          scale: (0.5 + 0.5 * icon) * (1 + 0.16 * wobble(frame, T.app - 2)),
          boxShadow: `0 16px 36px rgba(0,0,0,0.45), 0 0 ${44 + 70 * glow}px rgba(255,122,69,${0.3 + 0.45 * glow})`,
        }}
      >
        <ClaudeMark size={124} color="#fff" rotate={frame * 0.4} />
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 246, textAlign: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: 56, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#fff', whiteSpace: 'nowrap', opacity: text, translate: `0px ${(1 - text) * 16}px`}}>Claude for Mac</div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 316, textAlign: 'center', fontFamily: BODY, fontWeight: 500, fontSize: 32, lineHeight: 1.2, color: C.muted, whiteSpace: 'nowrap', opacity: text, translate: `0px ${(1 - text) * 16}px`}}>Desktop app</div>
      <InstallButton k={btn} />
    </div>
  );
};

// Place label, top left: same shape on the website and on the computer, only the color lights up
const Place: React.FC<{readonly icon: IconName; readonly color: string; readonly glow?: number; readonly style?: React.CSSProperties; readonly children: React.ReactNode}> = ({icon, color, glow = 0, style, children}) => (
  <div
    style={{
      position: 'absolute',
      left: 30,
      top: 28,
      height: 58,
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '0 22px',
      borderRadius: 99,
      border: `2.5px solid ${color}`,
      boxShadow: `0 0 ${10 + 40 * glow}px rgba(95,227,193,${0.6 * glow})`,
      fontFamily: MONO,
      fontWeight: 600,
      fontSize: 30,
      letterSpacing: '0.12em',
      color,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    <Icon name={icon} size={32} color={color} stroke={2.4} />
    {children}
  </div>
);

const Caret: React.FC<{readonly on: boolean; readonly w: number; readonly h: number; readonly color: string}> = ({on, w, h, color}) => (
  <span style={{display: 'inline-block', width: w, height: h, marginLeft: 6, verticalAlign: -6, borderRadius: 2, background: color, opacity: on ? 1 : 0}} />
);

// The website chat: deliberately tame, one question, one answer, nothing else
const Chat: React.FC<{readonly x: number}> = ({x}) => {
  const frame = useCurrentFrame();
  if (frame < T.onSite || x <= -960) {
    return null;
  }
  const place = pop(frame, T.website - 3, 30, 14, 200);
  const field = rise(frame, T.website - 3, 10);
  const user = pop(frame, T.website - 2, 30, 12, 190);
  const who = pop(frame, T.claude - 2, 30, 13, 200);
  const shown = typed(REPLY, frame, TYPE_AT, REPLY_CPS);
  const first = shown.slice(0, LINE_1.length);
  const second = shown.slice(LINE_1.length + 1);
  const onSecond = shown.length > LINE_1.length;
  const typing = shown.length < REPLY.length;
  const blink = typing || Math.floor(frame / 6) % 2 === 0;
  const thinking = frame >= T.claude + 1 && frame < TYPE_AT;
  return (
    <div style={{position: 'absolute', inset: 0, translate: `${x}px 0px`}}>
      <Place icon="globe" color="rgba(255,255,255,0.72)" style={{opacity: Math.min(1, place * 2), translate: `${(1 - place) * -30}px 0px`}}>
        ON THE WEBSITE
      </Place>
      <div
        style={{
          position: 'absolute',
          right: 30,
          top: 112,
          height: 92,
          display: 'flex',
          alignItems: 'center',
          padding: '0 36px',
          borderRadius: 30,
          borderBottomRightRadius: 8,
          background: '#2A3B4F',
          fontFamily: BODY,
          fontWeight: 600,
          fontSize: 42,
          color: '#fff',
          whiteSpace: 'nowrap',
          transformOrigin: '100% 100%',
          scale: 0.7 + 0.3 * user,
          opacity: Math.min(1, user * 2),
        }}
      >
        Edit my video
      </div>
      <div style={{position: 'absolute', left: 30, top: 248, height: 58, display: 'flex', alignItems: 'center', gap: 14, fontFamily: DISPLAY, fontWeight: 700, fontSize: 36, color: '#fff', whiteSpace: 'nowrap', opacity: Math.min(1, who * 2), translate: `${(1 - who) * -24}px 0px`}}>
        <ClaudeMark size={58} rotate={interpolate(frame, [T.claude, SLIDE], [0, 150], {...CLAMP, easing: EASE_OUT})} />
        Claude
      </div>
      {thinking ? (
        <div style={{position: 'absolute', left: 34, top: 344, display: 'flex', gap: 12}}>
          {[0, 1, 2].map((i) => (
            <span key={`dot-${i}`} style={{width: 16, height: 16, borderRadius: 99, background: '#fff', opacity: 0.35 + 0.65 * Math.max(0, Math.sin((frame - T.claude) / 2 - i * 0.9))}} />
          ))}
        </div>
      ) : null}
      {frame >= TYPE_AT ? (
        <div style={{position: 'absolute', left: 30, top: 322, fontFamily: BODY, fontWeight: 500, fontSize: 42, lineHeight: '56px', color: C.text, whiteSpace: 'nowrap'}}>
          <div style={{height: 56}}>
            {first}
            {onSecond ? null : <Caret on={blink} w={4} h={40} color="#fff" />}
          </div>
          <div style={{height: 56}}>
            {second}
            {onSecond ? <Caret on={blink} w={4} h={40} color="#fff" /> : null}
          </div>
        </div>
      ) : null}
      <div style={{position: 'absolute', left: 30, top: 584, width: 900, height: 86, boxSizing: 'border-box', ...cardStyle, borderRadius: 28, display: 'flex', alignItems: 'center', padding: '0 14px 0 30px', fontFamily: BODY, fontWeight: 500, fontSize: 32, color: C.muted, whiteSpace: 'nowrap', opacity: field}}>
        Reply to Claude…
        <div style={{marginLeft: 'auto', width: 58, height: 58, borderRadius: 99, background: 'rgba(255,255,255,0.1)', display: 'grid', placeItems: 'center'}}>
          <Icon name="send" size={28} color="#fff" stroke={2.3} />
        </div>
      </div>
    </div>
  );
};

const Chevron: React.FC<{readonly turn: number}> = ({turn}) => (
  <svg viewBox="0 0 24 24" width={24} height={24} style={{display: 'block', rotate: `${turn * 90}deg`}}>
    <path d="m9 5 7 7-7 7" fill="none" stroke={C.muted} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Folder: React.FC = () => (
  <svg viewBox="0 0 24 24" width={34} height={34} style={{display: 'block', flex: 'none'}}>
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" fill={C.violet} stroke={C.violet} strokeWidth={1.6} strokeLinejoin="round" />
  </svg>
);

const Plus: React.FC<{readonly k: number}> = ({k}) => (
  <div style={{width: 34, height: 34, borderRadius: 99, background: C.mint, display: 'grid', placeItems: 'center', flex: 'none', scale: Math.max(0, k), boxShadow: '0 0 18px rgba(95,227,193,0.6)'}}>
    <svg viewBox="0 0 24 24" width={24} height={24} style={{display: 'block'}}>
      <path d="M12 5v14M5 12h14" fill="none" stroke={C.bg} strokeWidth={3.8} strokeLinecap="round" />
    </svg>
  </div>
);

// File tree: each new row pushes the ones below it down, like in a real file explorer
const TreePanel: React.FC = () => {
  const frame = useCurrentFrame();
  const e = expandAt(frame);
  if (e >= 1) {
    return null;
  }
  const grow = ROWS.map((r) => interpolate(frame, [r.at, r.at + 8], [0, 1], {...CLAMP, easing: EASE_OUT}));
  return (
    <div style={{position: 'absolute', left: TREE.x, top: PANEL.y, width: TREE.w, height: PANEL.h, boxSizing: 'border-box', ...cardStyle, overflow: 'hidden', opacity: 1 - e, translate: `${-380 * e}px 0px`}}>
      {ROWS.map((r, i) => {
        const y = TREE.pad + grow.slice(0, i).reduce((a, b) => a + b, 0) * TREE.row;
        const k = pop(frame, r.at, 30, 13, 210);
        const hot = r.hot === undefined ? 0 : flash(frame, r.hot, 28);
        return (
          <div key={r.name} style={{position: 'absolute', left: 8, right: 8, top: y, height: TREE.row}}>
            <div style={{position: 'absolute', left: 0, right: 0, top: 7, bottom: 7, borderRadius: 16, background: C.mint, opacity: 0.22 * hot}} />
            <div style={{position: 'absolute', left: 8 + r.depth * 28, top: 0, bottom: 0, display: 'flex', alignItems: 'center', opacity: Math.min(1, k * 2), translate: `${(1 - k) * -26}px 0px`}}>
              <div style={{width: 24, marginRight: 6, flex: 'none'}}>{r.folder ? <Chevron turn={r.opens === undefined ? 0 : pop(frame, r.opens, 30, 14, 200)} /> : null}</div>
              {r.folder ? <Folder /> : <Plus k={pop(frame, r.at + 2, 30, 10, 230)} />}
              <span style={{marginLeft: 10, fontFamily: MONO, fontWeight: r.depth === 0 ? 600 : 500, fontSize: 32, color: r.folder ? '#fff' : C.mint, whiteSpace: 'nowrap'}}>{r.name}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Terminal content: the waiting prompt, then the three real commands typed at full speed
const TermBody: React.FC<{readonly k: number}> = ({k}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{position: 'absolute', inset: 0, opacity: k, translate: `0px ${(1 - k) * -44}px`}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: TERM.head, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px', borderBottom: `2px solid ${C.line}`, fontFamily: MONO, fontWeight: 500, fontSize: 28, color: C.muted, whiteSpace: 'nowrap'}}>
        <Icon name="terminal" size={30} color={C.mint} stroke={2.6} />
        Terminal
        <span style={{marginLeft: 'auto'}}>video - 000</span>
      </div>
      {CMDS.map((cmd, i) => {
        const show = i === 0 ? 1 : rise(frame, cmd.at - 1, 3);
        const text = typed(cmd.text, frame, cmd.at, CMD_CPS);
        const done = frame >= cmd.end;
        const blink = frame >= cmd.at || Math.floor(frame / 8) % 2 === 0;
        return (
          <div
            key={cmd.text}
            style={{
              position: 'absolute',
              left: 20,
              right: 20,
              top: CMD_ROW.y + i * CMD_ROW.gap,
              height: CMD_ROW.h,
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '0 16px',
              borderRadius: 16,
              overflow: 'hidden',
              background: done ? 'rgba(95,227,193,0.1)' : 'rgba(255,255,255,0.04)',
              fontFamily: MONO,
              fontWeight: 500,
              fontSize: 36,
              color: '#fff',
              whiteSpace: 'nowrap',
              opacity: show,
            }}
          >
            <span style={{color: C.mint}}>$</span>
            <span>
              {text}
              {done ? null : <Caret on={blink} w={20} h={38} color={C.mint} />}
            </span>
            <Check k={pop(frame, cmd.end, 30, 11, 240)} size={52} style={{marginLeft: 'auto'}} />
          </div>
        );
      })}
    </div>
  );
};

// Render card: the thumbnail is revealed from top to bottom, in step with the bar
const RenderBody: React.FC = () => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [T.video, T.mac], [0, 1], CLAMP);
  const p = t + 0.035 * Math.sin(t * Math.PI * 4); // a render never moves perfectly straight: 0 to 1, never going back
  const finished = frame >= T.mac;
  const thumb = pop(frame, RENDER, 30, 13, 180);
  const name = pop(frame, RENDER + 3, 30, 14, 190);
  const num = pop(frame, RENDER + 6, 30, 14, 190);
  const bar = pop(frame, RENDER + 8, 30, 14, 190);
  // column centered during the render; it rises at the last moment to make room for the stamp
  const lift = interpolate(frame, [T.mac - 9, T.mac], [COL.lift, 0], {...CLAMP, easing: EASE_IN_OUT});
  const lit = flash(frame, T.mac, 30);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: THUMB.x,
          top: THUMB.y,
          width: THUMB.w,
          height: THUMB.h,
          boxSizing: 'border-box',
          borderRadius: 26,
          overflow: 'hidden',
          background: C.bg,
          border: `3px solid ${finished ? C.mint : 'rgba(255,255,255,0.18)'}`,
          opacity: Math.min(1, thumb * 2),
          scale: 0.82 + 0.18 * thumb,
          translate: `${(1 - thumb) * -36}px 0px`,
          boxShadow: `0 14px 34px rgba(0,0,0,0.45), 0 0 ${60 * lit}px rgba(95,227,193,${0.6 * lit})`,
        }}
      >
        <Img src={staticFile('reel/clone.jpg')} style={{position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', objectFit: 'cover'}} />
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: `${(1 - p) * 100}%`, background: 'rgba(10,17,24,0.8)'}} />
        <div style={{position: 'absolute', left: 0, right: 0, top: `${p * 100}%`, height: 4, marginTop: -2, background: C.mint, boxShadow: `0 0 18px ${C.mint}`, opacity: finished ? 0 : 1}} />
      </div>
      <div style={{position: 'absolute', inset: 0, translate: `0px ${lift}px`}}>
        <div style={{position: 'absolute', left: COL.x, top: 90, height: 84, display: 'flex', alignItems: 'center', gap: 20, opacity: Math.min(1, name * 2), translate: `${(1 - name) * 40}px 0px`}}>
          <IconTile name="video" size={84} />
          <div>
            <div style={{fontFamily: MONO, fontWeight: 600, fontSize: 36, lineHeight: 1.2, color: '#fff', whiteSpace: 'nowrap'}}>Reel-Claude.mp4</div>
            <div style={{fontFamily: MONO, fontWeight: 500, fontSize: 28, lineHeight: 1.25, color: C.muted, whiteSpace: 'nowrap'}}>1080 x 1920 · 30 fps</div>
          </div>
        </div>
        <div style={{position: 'absolute', left: COL.x, top: 188, fontFamily: DISPLAY, fontWeight: 700, fontSize: 120, lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: finished ? C.mint : '#fff', whiteSpace: 'nowrap', opacity: Math.min(1, num * 2), translate: `${(1 - num) * 40}px 0px`}}>
          {`${Math.round(p * 100)}%`}
        </div>
        <Check k={pop(frame, T.mac - 1, 30, 11, 230)} size={92} style={{position: 'absolute', left: COL.x + COL.w - 92, top: 202}} />
        <div style={{position: 'absolute', left: COL.x, top: 322, width: COL.w, height: 32, borderRadius: 99, background: 'rgba(255,255,255,0.12)', opacity: Math.min(1, bar * 2), translate: `${(1 - bar) * 40}px 0px`}}>
          <div style={{width: `${p * 100}%`, height: '100%', borderRadius: 99, background: C.mint, boxShadow: '0 0 24px rgba(95,227,193,0.65)'}} />
        </div>
      </div>
    </>
  );
};

const TermPanel: React.FC = () => {
  const frame = useCurrentFrame();
  const e = expandAt(frame);
  const r = interpolate(frame, [TERM_OUT, TERM_OUT + 8], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  const finished = frame >= T.mac;
  // the stamp drops: the card absorbs the hit
  const impact = interpolate(frame, [T.mac + 1, T.mac + 3, T.mac + 10], [0, 1, 0], CLAMP);
  return (
    <div
      style={{
        position: 'absolute',
        left: TERM.x + (TERM.xFull - TERM.x) * e,
        top: PANEL.y,
        width: TERM.w + (TERM.wFull - TERM.w) * e,
        height: PANEL.h,
        boxSizing: 'border-box',
        borderRadius: 22,
        overflow: 'hidden',
        background: interpolateColors(r, [0, 1], ['#060B11', '#172434']),
        border: `2px solid ${finished ? C.mint : C.line}`,
        boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
        scale: 1 - 0.012 * impact,
      }}
    >
      {r < 1 ? <TermBody k={1 - r} /> : null}
      {frame >= RENDER ? <RenderBody /> : null}
    </div>
  );
};

// Activity pill: it proves Claude acts, from "acts" until the end of the render
const Working: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < T.acts - 2 || frame >= T.mac) {
    return null;
  }
  const k = pop(frame, T.acts - 2, 30, 12, 210);
  const out = fall(frame, T.mac - 8, 8);
  const beat = 0.5 + 0.5 * Math.sin(frame / 3.2);
  const ring = Math.max(0, (frame - T.acts) % 22) / 22;
  return (
    <div
      style={{
        position: 'absolute',
        right: 30,
        top: 28,
        height: 58,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 26px 0 22px',
        borderRadius: 99,
        background: 'rgba(95,227,193,0.12)',
        border: '2px solid rgba(95,227,193,0.5)',
        fontFamily: BODY,
        fontWeight: 600,
        fontSize: 32,
        color: '#fff',
        whiteSpace: 'nowrap',
        transformOrigin: '100% 50%',
        scale: 0.7 + 0.3 * k,
        opacity: Math.min(1, k * 2) * out,
      }}
    >
      <span style={{position: 'relative', width: 20, height: 20, flex: 'none'}}>
        <span style={{position: 'absolute', inset: 0, borderRadius: 99, border: `2px solid ${C.mint}`, scale: 1 + ring * 1.5, opacity: 0.8 * (1 - ring)}} />
        <span style={{position: 'absolute', inset: 0, borderRadius: 99, background: C.mint, scale: 0.82 + 0.26 * beat, boxShadow: `0 0 ${8 + 14 * beat}px ${C.mint}`}} />
      </span>
      Claude is working…
    </div>
  );
};

// The app: label, file tree on the left, terminal on the right. It arrives by pushing the chat out of the window.
const AppView: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < SLIDE) {
    return null;
  }
  const a = interpolate(frame, [SLIDE, SLIDE + 14], [960, 0], {...CLAMP, easing: EASE_IN_OUT});
  const b = interpolate(frame, [SLIDE + 3, SLIDE + 17], [960, 0], {...CLAMP, easing: EASE_IN_OUT});
  const ignite = flash(frame, T.acts, 28);
  return (
    <>
      <div style={{position: 'absolute', inset: 0, translate: `${a}px 0px`}}>
        <Place icon="laptop" color={C.mint} glow={Math.max(0.35, flash(frame, T.onComputer + 6, 30))}>
          ON YOUR COMPUTER
        </Place>
        <TreePanel />
      </div>
      <div style={{position: 'absolute', inset: 0, translate: `${b}px 0px`}}>
        <TermPanel />
      </div>
      <Working />
      {ignite > 0 ? <div style={{position: 'absolute', inset: 0, background: `rgba(95,227,193,${0.14 * ignite})`, boxShadow: `inset 0 0 150px 24px rgba(95,227,193,${0.6 * ignite})`}} /> : null}
      {frame >= T.mac - 1 ? (
        <Stamp k={pop(frame, T.mac - 1, 30, 11, 240)} size={58} rotate={-6} style={{left: 597, top: 572, translate: '-50% -50%'}}>
          Made on my Mac
        </Stamp>
      ) : null}
    </>
  );
};

export const Setting1: React.FC = () => {
  const frame = useCurrentFrame();
  const slide = interpolate(frame, [SLIDE, SLIDE + 14], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  const cursor = path(frame, [
    [T.app - 6, 1010, 780],
    [CLICK - 4, TIP.x, TIP.y],
    [CLICK + 10, TIP.x, TIP.y],
    [CLICK + 28, 1010, 780],
  ]);
  return (
    <>
      <InstallCard />
      <Chat x={-960 * slide} />
      <AppView />
      <ClickRing x={TIP.x} y={TIP.y} at={CLICK} color="#fff" />
      {frame < CLICK + 29 ? <Cursor x={cursor.x} y={cursor.y} press={pressAt(frame)} /> : null}
    </>
  );
};

export const r1Sfx: Sfx[] = [
  {name: 'pop-high', at: T.appli - 4, vol: 0.16},
  {name: 'click', at: CLICK - 2, vol: 0.28},
  {name: 'ding', at: BAR_END - 2, vol: 0.16},
  {name: 'pop', at: T.site - 4, vol: 0.2},
  {name: 'key', at: TYPE_AT, vol: 0.08},
  {name: 'key', at: TYPE_AT + 8, vol: 0.08},
  {name: 'key', at: TYPE_AT + 16, vol: 0.08},
  {name: 'whoosh-short', at: SLIDE - 2, vol: 0.22},
  {name: 'sparkles', at: T.acts - 4, vol: 0.18},
  {name: 'tick', at: T.opens - 4, vol: 0.2},
  ...ROWS.filter((r) => r.folder && r.depth === 1).map((r) => ({name: 'pop', at: r.at - 2, vol: 0.14})),
  ...ROWS.filter((r) => !r.folder).map((r) => ({name: 'pop-high', at: r.at - 2, vol: 0.2})),
  {name: 'whoosh-short', at: EXPAND - 2, vol: 0.12},
  ...CMDS.map((cmd) => ({name: 'key', at: cmd.at - 1, vol: 0.08})),
  ...CMDS.map((cmd) => ({name: 'key', at: cmd.at + 4, vol: 0.08})),
  ...CMDS.map((cmd) => ({name: 'tick', at: cmd.end - 2, vol: 0.2})),
  {name: 'whoosh-short', at: TERM_OUT - 1, vol: 0.18},
  {name: 'ding', at: T.mac - 3, vol: 0.16},
  {name: 'stamp', at: T.mac - 3, vol: 0.3},
];
