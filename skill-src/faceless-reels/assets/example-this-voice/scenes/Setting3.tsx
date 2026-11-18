// Setting 3, skills: "Third setting: skills. A skill is your method, written down once and for all.
// Claude learns it, and applies it every single time. I put my editing style in it: my colors, my captions, my sound."
// One single object carries the idea: the SKILL.md page opens, fills up, flies into Claude and comes out as three identical videos.
import {Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {CLAMP, cues, EASE_IN, EASE_IN_OUT, EASE_OUT, fall, flash, pop, rise, typed} from '../anim';
import {SECTIONS} from '../data';
import {C, cardStyle, Check, ClaudeMark, CORAL, DISPLAY, Icon, MONO, type Sfx, VoiceWave} from '../kit';

const c = cues('r3');

const T = {
  setting: c('setting'),
  skills: c('skills'),
  skill: c('skill'),
  method: c('method'),
  written: c('written'),
  all: c('all'),
  claude: c('Claude'),
  learns: c('learns'),
  applies: c('applies'),
  every: c('every'),
  time: c('time'),
  me: c('I'),
  my: c('my'),
  editing: c('editing'),
  style: c('style'),
  my2: c('my', 2),
  colors: c('colors'),
  my3: c('my', 3),
  captions: c('captions'),
  my4: c('my', 4),
  sound: c('sound'),
};

// The SKILL.md sheet
const PAPER = '#F6F2E8'; // off-white: the only large light area of the reel
const INK = C.bg;
const INK_SOFT = '#46535F';
const SHEET = {cx: 480, cy: 350, w: 780, h: 620, pad: 44};
const MINI = {w: 120, h: 156}; // the small page waiting at the start of the scene
const BACK = {y: 424, scale: 0.7}; // the sheet backs off and moves down to let the Claude tile arrive
const STEPS = ['Transcribe the voice', 'Animate word by word', 'Mix to −14 LUFS'];
const STEP_DUR = 11; // typing duration of one step
const SWEEP_DUR = 13; // highlighter pass over one line
const stepAt = (i: number) => T.method - 1 + i * STEP_DUR;
const sweepAt = (i: number) => Math.round(T.written + 1 + (i * (T.all - T.written)) / STEPS.length);

// Claude absorbs the sheet
const ABSORB = T.learns + 12;
const TILE = {y: 78, size: 96, x0: 480, x1: 286}; // the tile starts centered and moves aside to let the pill out
const BADGE = {y: 78, h: 72, x0: 295, x1: 352};

// The three videos: 261 x 464 (9:16), label below (ends at y 657), 52 px margins left and right
const VIDEOS = [T.applies - 2, T.every - 2, T.time - 2];
const VID = {x: 52, y: 142, w: 261, h: 464, gap: 36};
const vidX = (i: number) => VID.x + i * (VID.w + VID.gap);
const ALL_DONE = T.time + 6; // all three are checked: shared pulse
const OUT = T.me + 1; // thumbnails and tile leave

// My editing style: title then three stacked blocks (y 112 to 668)
const BLOCK = {x: 40, w: 880, h: 176, y: [112, 302, 492]};
const TITLE_WORDS = [{t: 'My', at: T.my - 2}]; // before the pill
const TITLE_AFTER = [{t: 'style', at: T.style - 2}]; // after the pill
const COLORS = ['#0A1118', '#5FE3C1', '#F5C451', '#7B4FE0', '#D44FB3'];
const dotAt = (i: number) => T.colors - 3 + i * 3;
const SAMPLE = ['EVERY', 'WORD', 'ON', 'BEAT'];
const HOP = 7; // the pill moves to the next word every 7 frames
const HOP_AT = T.captions - 1;

// One step: numbered pill and empty line first, then the text is typed, then the highlighter passes
const StepRow: React.FC<{readonly i: number}> = ({i}) => {
  const frame = useCurrentFrame();
  const text = STEPS[i];
  const at = stepAt(i);
  const k = pop(frame, T.skill - 2 + i * 3, 30, 12, 210);
  const shown = typed(text, frame, at, (text.length * 30) / STEP_DUR);
  const writing = frame >= at && shown.length < text.length;
  const sweep = interpolate(frame, [sweepAt(i), sweepAt(i) + SWEEP_DUR], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  const bump = flash(frame, sweepAt(i) + 3, 12);
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 26, height: 92, opacity: Math.min(1, k * 2), translate: `${(1 - k) * 36}px 0px`}}>
      <div style={{width: 64, height: 64, borderRadius: 99, flex: 'none', display: 'grid', placeItems: 'center', background: INK, color: sweep > 0.5 ? C.mint : '#fff', fontFamily: DISPLAY, fontWeight: 700, fontSize: 38, scale: 1 + 0.12 * bump}}>{i + 1}</div>
      <div style={{position: 'relative', flex: 'none', fontFamily: DISPLAY, fontWeight: 600, fontSize: 42, lineHeight: '64px', color: INK, whiteSpace: 'nowrap'}}>
        <div style={{position: 'absolute', left: 0, right: 0, top: 22, height: 20, borderRadius: 10, background: 'rgba(10,17,24,0.09)', opacity: 1 - rise(frame, at, 4)}} />
        <div style={{position: 'absolute', left: -12, top: 2, height: 60, width: `calc(${sweep * 100}% + ${sweep * 24}px)`, borderRadius: 10, background: C.mint}} />
        <span style={{position: 'relative', borderRight: `4px solid ${writing ? INK : 'transparent'}`}}>{shown}</span>
        <span style={{position: 'relative', opacity: 0}}>{text.slice(shown.length)}</span>
      </div>
    </div>
  );
};

// The sheet, from the start to its absorption: one single piece that opens, backs off, then flies to Claude
const Sheet: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame > ABSORB) {
    return null;
  }
  const mini = pop(frame, T.setting - 4, 30, 12, 190);
  const open = pop(frame, T.skills - 3, 30, 14, 150);
  const windUp = interpolate(frame, [T.skills - 9, T.skills - 3, T.skills + 2], [1, 0.88, 1], CLAMP); // small wind-up before the jump
  const back = interpolate(frame, [T.claude - 6, T.claude + 3], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  const fly = interpolate(frame, [T.learns - 1, ABSORB], [0, 1], {...CLAMP, easing: EASE_IN});

  const w = interpolate(open, [0, 1], [MINI.w, SHEET.w]);
  const h = interpolate(open, [0, 1], [MINI.h, SHEET.h]);
  const fold = interpolate(open, [0, 1], [24, 46], CLAMP);
  const float = Math.sin(frame / 14) * 4 * (1 - back);
  const y = interpolate(back, [0, 1], [SHEET.cy, BACK.y]) + (TILE.y - BACK.y) * fly + float;
  const scale = (0.5 + 0.5 * mini) * windUp * (1 - (1 - BACK.scale) * back) * (1 - 0.93 * fly);

  const fileIcon = interpolate(open, [0, 0.3], [1, 0], CLAMP);
  const inner = interpolate(open, [0.6, 0.98], [0, 1], CLAMP);
  const label = Math.min(mini * 2, 1) * (1 - rise(frame, T.skills - 5, 5));
  const head = rise(frame, T.skills, 8);
  const title = pop(frame, T.skills + 3, 30, 14, 190);
  const saved = pop(frame, T.all - 2, 30, 11, 220);

  return (
    <>
      <div style={{position: 'absolute', left: SHEET.cx - w / 2, top: y - h / 2, width: w, height: h, scale, rotate: `${-5 * fly}deg`, opacity: Math.min(1, mini * 2), filter: 'drop-shadow(0 20px 34px rgba(0,0,0,0.5))'}}>
        <div style={{position: 'absolute', inset: 0, borderRadius: 20, background: PAPER, clipPath: `polygon(0 0, calc(100% - ${fold}px) 0, 100% ${fold}px, 100% 100%, 0 100%)`}} />
        <div style={{position: 'absolute', right: 0, top: 0, width: fold, height: fold, background: '#DBD4C3', borderBottomLeftRadius: 8, clipPath: 'polygon(0 0, 100% 100%, 0 100%)'}} />
        <div style={{position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: fileIcon}}>
          <Icon name="file" size={66} color={INK} stroke={2} />
        </div>

        <div style={{position: 'absolute', left: (w - SHEET.w) / 2, top: (h - SHEET.h) / 2, width: SHEET.w, height: SHEET.h, scale: w / SHEET.w, opacity: inner}}>
          <div style={{position: 'absolute', left: SHEET.pad, top: 24, height: 48, display: 'flex', alignItems: 'center', gap: 14, opacity: head, translate: `${(1 - head) * 24}px 0px`}}>
            <Icon name="file" size={36} color={INK_SOFT} stroke={2.2} />
            <span style={{fontFamily: MONO, fontWeight: 600, fontSize: 30, color: INK_SOFT, whiteSpace: 'nowrap'}}>SKILL.md</span>
          </div>
          <div style={{position: 'absolute', left: SHEET.pad, right: SHEET.pad, top: 84, height: 2, background: 'rgba(10,17,24,0.13)', transformOrigin: '0 0', scale: `${head} 1`}} />
          <div style={{position: 'absolute', left: SHEET.pad, top: 98, height: 68, display: 'flex', alignItems: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: 52, letterSpacing: '-0.02em', color: INK, whiteSpace: 'nowrap', opacity: Math.min(1, title * 2), translate: `0px ${(1 - title) * 20}px`}}>
            Video editing
          </div>
          <div style={{position: 'absolute', left: SHEET.pad, top: 180, display: 'flex', flexDirection: 'column', gap: 8}}>
            {STEPS.map((s, i) => (
              <StepRow key={s} i={i} />
            ))}
          </div>
          <div style={{position: 'absolute', right: SHEET.pad, top: 496, height: 68, display: 'flex', alignItems: 'center', gap: 14, padding: '0 28px 0 12px', borderRadius: 99, background: INK, opacity: Math.min(1, saved * 2), scale: 0.7 + 0.3 * saved, transformOrigin: '100% 50%'}}>
            <Check k={pop(frame, T.all + 1, 30, 10, 240)} size={46} />
            <span style={{fontFamily: DISPLAY, fontWeight: 700, fontSize: 34, color: '#fff', whiteSpace: 'nowrap'}}>Saved</span>
          </div>
        </div>
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: SHEET.cy + MINI.h / 2 + 18, textAlign: 'center', fontFamily: MONO, fontWeight: 600, fontSize: 34, color: '#fff', opacity: label, translate: `0px ${(1 - Math.min(1, mini)) * 16}px`}}>SKILL.md</div>
    </>
  );
};

// Burst when the sheet enters Claude: coral ring and sparks
const Burst: React.FC<{readonly x: number}> = ({x}) => {
  const frame = useCurrentFrame();
  if (frame < ABSORB || frame > ABSORB + 18) {
    return null;
  }
  const t = interpolate(frame, [ABSORB, ABSORB + 18], [0, 1], {...CLAMP, easing: EASE_OUT});
  return (
    <>
      <div style={{position: 'absolute', left: x - 90, top: TILE.y - 90, width: 180, height: 180, borderRadius: '50%', border: `5px solid ${CORAL}`, boxSizing: 'border-box', opacity: 1 - t, scale: 0.5 + 0.5 * t}} />
      {new Array(10).fill(0).map((_, i) => {
        const a = (i / 10) * Math.PI * 2 + 0.3;
        const r = 52 + 58 * t;
        return <div key={`spark-${i}`} style={{position: 'absolute', left: x + Math.cos(a) * r - 5, top: TILE.y + Math.sin(a) * r - 5, width: 10, height: 10, borderRadius: 99, background: i % 2 === 0 ? CORAL : C.mint, opacity: 1 - t, scale: 1 - 0.5 * t}} />;
      })}
    </>
  );
};

// The Claude tile and the "Skill loaded" pill, which comes out from behind it
const Loaded: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < T.claude - 2 || frame > OUT + 10) {
    return null;
  }
  const k = pop(frame, T.claude - 2, 30, 11, 210);
  const split = pop(frame, ABSORB + 1, 30, 14, 190);
  const thump = interpolate(frame, [ABSORB - 1, ABSORB + 3, ABSORB + 15], [0, 1, 0], CLAMP);
  const out = interpolate(frame, [OUT, OUT + 10], [0, 1], {...CLAMP, easing: EASE_IN});
  const x = interpolate(split, [0, 1], [TILE.x0, TILE.x1]);
  const badgeX = interpolate(split, [0, 1], [BADGE.x0, BADGE.x1]);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: 1 - out, translate: `0px ${-40 * out}px`}}>
      <div style={{position: 'absolute', left: badgeX, top: BADGE.y - BADGE.h / 2, height: BADGE.h, display: 'flex', alignItems: 'center', gap: 14, padding: '0 30px 0 13px', boxSizing: 'border-box', borderRadius: 99, background: 'rgba(95,227,193,0.14)', border: `2.5px solid ${C.mint}`, boxShadow: '0 0 30px rgba(95,227,193,0.28)', opacity: Math.min(1, split * 2.5)}}>
        <Check k={pop(frame, ABSORB + 6, 30, 10, 240)} size={46} />
        <span style={{fontFamily: DISPLAY, fontWeight: 700, fontSize: 38, color: '#fff', whiteSpace: 'nowrap'}}>Skill loaded</span>
      </div>
      <Burst x={x} />
      <div style={{position: 'absolute', left: x - TILE.size / 2, top: TILE.y - TILE.size / 2, width: TILE.size, height: TILE.size, boxSizing: 'border-box', borderRadius: 28, background: '#2A1A14', border: `2.5px solid rgba(255,122,69,${0.55 + 0.45 * thump})`, display: 'grid', placeItems: 'center', scale: k * (1 + 0.22 * thump), opacity: Math.min(1, k * 2), boxShadow: `0 0 ${34 + 60 * thump}px rgba(255,122,69,${0.35 + 0.4 * thump})`}}>
        <ClaudeMark size={62} rotate={frame * 0.7 + 90 * rise(frame, ABSORB, 16)} />
      </div>
    </div>
  );
};

// A 9:16 mini video: same image, same caption, same layout all three times
const MiniVideo: React.FC<{readonly i: number}> = ({i}) => {
  const frame = useCurrentFrame();
  const at = VIDEOS[i];
  if (frame < at || frame > OUT + 16) {
    return null;
  }
  const k = pop(frame, at, 30, 14, 170);
  const ok = pop(frame, at + 6, 30, 10, 250);
  const bar = interpolate(frame, [at, at + 22], [0, 0.72], {...CLAMP, easing: EASE_OUT});
  const pulse = flash(frame, ALL_DONE, 16);
  const out = interpolate(frame, [OUT + i * 2, OUT + i * 2 + 10], [0, 1], {...CLAMP, easing: EASE_IN});
  return (
    <div style={{position: 'absolute', left: vidX(i), top: VID.y, width: VID.w, opacity: Math.min(1, k * 2) * (1 - out), translate: `0px ${(1 - k) * 110 + out * 130}px`, scale: 0.94 + 0.06 * k}}>
      <div style={{position: 'relative', width: VID.w, height: VID.h, boxSizing: 'border-box', borderRadius: 24, overflow: 'hidden', border: `2.5px solid ${ok > 0.5 ? C.mint : C.line}`, background: C.bg, boxShadow: `0 14px 34px rgba(0,0,0,0.45), 0 0 ${18 + 44 * pulse}px rgba(95,227,193,${0.1 + 0.45 * pulse})`}}>
        <Img src={staticFile('reel/clone.jpg')} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} />
        <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,17,24,0) 38%, rgba(10,17,24,0.6) 64%, rgba(10,17,24,0.82) 100%)'}} />
        <div style={{position: 'absolute', left: VID.w / 2 - 38, top: 80, width: 76, height: 76, boxSizing: 'border-box', borderRadius: 99, display: 'grid', placeItems: 'center', background: 'rgba(10,17,24,0.62)', border: '2px solid rgba(255,255,255,0.32)'}}>
          <Icon name="play" size={34} color="#fff" fill="#fff" stroke={2} style={{marginLeft: 4}} />
        </div>
        <div style={{position: 'absolute', left: 0, right: 0, top: 322, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, fontFamily: DISPLAY, fontWeight: 700, fontSize: 30, letterSpacing: '-0.01em', color: '#fff', textShadow: '0 3px 0 rgba(6,10,16,0.6)', whiteSpace: 'nowrap'}}>
          <span>EVERY</span>
          <span style={{padding: '0 8px 3px', borderRadius: 9, background: C.mint, color: C.bg, textShadow: 'none'}}>WORD</span>
        </div>
        <div style={{position: 'absolute', left: 18, right: 18, bottom: 18, height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.22)', overflow: 'hidden'}}>
          <div style={{width: `${bar * 100}%`, height: '100%', borderRadius: 99, background: C.mint}} />
        </div>
        <Check k={ok} size={52} style={{position: 'absolute', right: 12, top: 12}} />
      </div>
      <div style={{marginTop: 8, textAlign: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: 34, color: '#fff', whiteSpace: 'nowrap'}}>Video {i + 1}</div>
    </div>
  );
};

// "Equals" sign between two videos: same result every time
const Same: React.FC<{readonly i: number}> = ({i}) => {
  const frame = useCurrentFrame();
  const k = pop(frame, VIDEOS[i + 1] + 7, 30, 10, 260);
  const out = fall(frame, OUT, 6);
  const x = vidX(i) + VID.w + VID.gap / 2 - 12;
  const y = VID.y + VID.h / 2;
  const bar: React.CSSProperties = {position: 'absolute', left: x, width: 24, height: 6, borderRadius: 3, background: C.mint, boxShadow: '0 0 12px rgba(95,227,193,0.6)'};
  return (
    <div style={{position: 'absolute', inset: 0, opacity: Math.min(1, k * 2) * out}}>
      <div style={{...bar, top: y - 9, scale: `${k} 1`}} />
      <div style={{...bar, top: y + 3, scale: `${k} 1`}} />
    </div>
  );
};

// Inner title: each word lands on its syllable, "editing" reuses the header pill
const Title: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < T.my - 2) {
    return null;
  }
  const pill = pop(frame, T.editing - 2, 30, 11, 230);
  return (
    <div style={{position: 'absolute', left: BLOCK.x, top: 26, height: 74, display: 'flex', alignItems: 'center', gap: 14, fontFamily: DISPLAY, fontWeight: 700, fontSize: 56, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#fff', whiteSpace: 'nowrap'}}>
      {TITLE_WORDS.map((w) => {
        const k = pop(frame, w.at, 30, 12, 220);
        return (
          <span key={w.t} style={{opacity: Math.min(1, k * 2), translate: `0px ${(1 - k) * 24}px`}}>
            {w.t}
          </span>
        );
      })}
      <span style={{background: C.mint, color: C.bg, borderRadius: 14, padding: '0 14px 4px', opacity: Math.min(1, pill * 2), scale: 0.72 + 0.28 * pill}}>editing</span>
      {TITLE_AFTER.map((w) => {
        const k = pop(frame, w.at, 30, 12, 220);
        return (
          <span key={w.t} style={{opacity: Math.min(1, k * 2), translate: `0px ${(1 - k) * 24}px`}}>
            {w.t}
          </span>
        );
      })}
    </div>
  );
};

// Three dashed slots from "my editing style" on: they then fill up on each word
const SLOT_LABELS = ['COLORS', 'CAPTIONS', 'SOUND'];
const Slots: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < T.my - 2) {
    return null;
  }
  return (
    <>
      {BLOCK.y.map((y, i) => {
        const k = pop(frame, T.my - 2 + i * 4, 30, 14, 200);
        return (
          <div
            key={`slot-${y}`}
            style={{
              position: 'absolute',
              left: BLOCK.x,
              top: y,
              width: BLOCK.w,
              height: BLOCK.h,
              boxSizing: 'border-box',
              borderRadius: 22,
              border: '3px dashed rgba(255,255,255,0.24)',
              display: 'grid',
              placeItems: 'center',
              fontFamily: MONO,
              fontWeight: 600,
              fontSize: 30,
              letterSpacing: '0.14em',
              color: 'rgba(255,255,255,0.38)',
              opacity: Math.min(1, k * 2),
              translate: `0px ${(1 - k) * 30}px`,
            }}
          >
            {SLOT_LABELS[i]}
          </div>
        );
      })}
    </>
  );
};

const Block: React.FC<{readonly y: number; readonly at: number; readonly label: string; readonly children: React.ReactNode}> = ({y, at, label, children}) => {
  const frame = useCurrentFrame();
  if (frame < at) {
    return null;
  }
  const k = pop(frame, at, 30, 13, 190);
  return (
    <div style={{...cardStyle, position: 'absolute', left: BLOCK.x, top: y, width: BLOCK.w, height: BLOCK.h, boxSizing: 'border-box', opacity: Math.min(1, k * 2), translate: `0px ${(1 - k) * 46}px`}}>
      <div style={{position: 'absolute', left: 24, top: 10, fontFamily: MONO, fontWeight: 600, fontSize: 28, letterSpacing: '0.14em', color: C.mint, whiteSpace: 'nowrap', lineHeight: '36px'}}>{label}</div>
      {children}
    </div>
  );
};

// The five real brand colors. The night blue gets a light outline to stand out from the card.
const Colors: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Block y={BLOCK.y[0]} at={T.my2 - 2} label="COLORS">
      <div style={{position: 'absolute', left: 18, right: 18, top: 50, display: 'flex'}}>
        {COLORS.map((col, i) => {
          const k = pop(frame, dotAt(i), 30, 10, 240);
          return (
            <div key={col} style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6}}>
              <div style={{width: 60, height: 60, borderRadius: 99, background: col, scale: k, boxShadow: `0 0 0 3px rgba(255,255,255,0.28), 0 0 26px ${col}66`}} />
              <div style={{fontFamily: MONO, fontWeight: 500, fontSize: 30, lineHeight: '38px', color: '#fff', whiteSpace: 'nowrap', opacity: Math.min(1, k * 2)}}>{col}</div>
            </div>
          );
        })}
      </div>
    </Block>
  );
};

// Caption sample: capitals, the current word on a mint pill (same look as the reel's real captions)
const Subtitles: React.FC = () => {
  const frame = useCurrentFrame();
  const text = rise(frame, T.captions - 3, 7);
  const t = frame - HOP_AT;
  const active = t < 0 ? -1 : Math.floor(t / HOP) % SAMPLE.length;
  const hop = pop(t < 0 ? 0 : t % HOP, 0, 30, 9, 340);
  return (
    <Block y={BLOCK.y[1]} at={T.my3 - 2} label="CAPTIONS">
      <div style={{position: 'absolute', left: 10, top: 56, height: 100, display: 'flex', alignItems: 'center', gap: 8, fontFamily: DISPLAY, fontWeight: 700, fontSize: 54, letterSpacing: '-0.01em', color: '#fff', whiteSpace: 'nowrap', opacity: text, translate: `${(1 - text) * 24}px 0px`}}>
        {SAMPLE.map((w, i) => {
          const on = i === active;
          return (
            <span key={w} style={{padding: '2px 14px 6px', borderRadius: 16, background: on ? C.mint : 'transparent', color: on ? C.bg : '#fff', scale: on ? 0.84 + 0.16 * hop : 1, translate: `0px ${on ? (1 - hop) * 10 : 0}px`}}>
              {w}
            </span>
          );
        })}
      </div>
    </Block>
  );
};

// The sound: the reel's real voice as a waveform, and its real level
const Sound: React.FC = () => {
  const frame = useCurrentFrame();
  const wave = rise(frame, T.my4 + 1, 8);
  const lufs = pop(frame, T.sound - 2, 30, 11, 230);
  return (
    <Block y={BLOCK.y[2]} at={T.my4 - 2} label="SOUND">
      <VoiceWave abs={frame + SECTIONS.r3.from} w={520} h={96} bars={36} k={wave} style={{position: 'absolute', left: 24, top: 58}} />
      <div style={{position: 'absolute', right: 30, top: 58, height: 96, display: 'flex', alignItems: 'center', fontFamily: MONO, fontWeight: 600, fontSize: 52, color: '#fff', whiteSpace: 'nowrap', opacity: Math.min(1, lufs * 2), scale: 0.8 + 0.2 * lufs, transformOrigin: '100% 50%'}}>−14 LUFS</div>
    </Block>
  );
};

export const Setting3: React.FC = () => (
  <>
    <Sheet />
    <Loaded />
    {VIDEOS.map((at, i) => (
      <MiniVideo key={`video-${at}`} i={i} />
    ))}
    <Same i={0} />
    <Same i={1} />
    <Title />
    <Slots />
    <Colors />
    <Subtitles />
    <Sound />
  </>
);

export const r3Sfx: Sfx[] = [
  {name: 'whoosh-short', at: T.skills - 5, vol: 0.22},
  {name: 'pop', at: T.skill - 5, vol: 0.14},
  ...[0, 1, 2].map((i) => ({name: 'key', at: stepAt(i), vol: 0.08})),
  {name: 'ding', at: T.all - 4, vol: 0.2},
  {name: 'pop-high', at: T.claude - 5, vol: 0.22},
  {name: 'whoosh-short', at: T.learns - 3, vol: 0.22},
  {name: 'sparkles', at: ABSORB - 3, vol: 0.2},
  {name: 'ding', at: ABSORB + 2, vol: 0.2},
  ...VIDEOS.map((at) => ({name: 'pop', at: at - 3, vol: 0.2})),
  ...VIDEOS.map((at) => ({name: 'tick', at: at + 3, vol: 0.18})),
  {name: 'chime', at: ALL_DONE - 3, vol: 0.14},
  {name: 'whoosh-short', at: OUT - 2, vol: 0.18},
  {name: 'pop', at: T.my - 5, vol: 0.14},
  {name: 'pop-high', at: T.editing - 4, vol: 0.2},
  {name: 'pop', at: T.my2 - 4, vol: 0.16},
  ...COLORS.map((col, i) => ({name: 'tick', at: dotAt(i) - 2, vol: 0.12})),
  {name: 'pop', at: T.my3 - 4, vol: 0.18},
  {name: 'pop', at: T.my4 - 4, vol: 0.18},
  {name: 'ding', at: T.sound - 3, vol: 0.16},
];
