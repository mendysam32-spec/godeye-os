// Call to action: "Save this video, you're going to need it. Subscribe to get the guide, then click the link in bio, and type the keyword SETTINGS."
// Gestures, not just words: the cursor saves the reel, subscribes, clicks the link in bio, then the keyword types itself and an arrow links it to the guide.
// Nothing leaves: the blocks stay until the window fades out. This is the end screen, readable on a paused frame.
import {Img, interpolate, interpolateColors, staticFile, useCurrentFrame} from 'remotion';
import {CLAMP, cues, EASE_IN_OUT, EASE_OUT, fall, flash, path, phase, pop, rise, secLen, typed} from '../anim';
import {C, Check, ClickRing, Cursor, DISPLAY, Icon, type IconName, MONO, type Sfx} from '../kit';

const G = {card: 'Guide', link: 'LINK IN BIO', items: ['Desktop app', 'Connectors', 'Skills', 'Instructions', 'Agents']};
const N = G.items.length;
const KEYWORD = 'SETTINGS';
const c = cues('cta');

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const ENTRY = 12; // Reel.tsx brings the scene in at this frame
const LIMIT = secLen('cta') - 2; // the arrow lands before the section ends, so the end screen stays readable

const T = {
  save: c('Save'),
  video: c('video'),
  need: c('need'),
  subscribe: c('Subscribe'),
  click: c('click'),
  bio: c('bio'),
  keyword: c('keyword'),
};

// First gesture: save the reel
const CLICK_SAVE = T.video; // click on the bookmark
const POST_OUT = T.subscribe - 10; // the thumbnail and icons make room
const THUMB = {x: 232, y: 70, w: 315, h: 560}; // the thumbnail + icons pair is centered: x 232 to 726
const ICONS = {cx: 674, top: 109, size: 104, gap: 22}; // 4 icons: y 109 to 591
const tileY = (i: number) => ICONS.top + i * (ICONS.size + ICONS.gap) + ICONS.size / 2;
const ACTIONS: {name: IconName; at: number}[] = [
  {name: 'heart', at: T.save + 2},
  {name: 'message', at: T.save + 5},
  {name: 'send', at: T.save + 8},
];
const MARK_AT = T.save + 11;
const SAVE_TIP = {x: ICONS.cx + 10, y: tileY(3) + 16}; // cursor tip, placed beside the content so nothing is hidden

// Second gesture: subscribe
const CARD_AT = T.subscribe;
const BUTTON_AT = T.subscribe + 2;
const ROW_AT = (i: number) => CARD_AT + 3 + i * 2; // the rows land with the card
const CLICK = Math.max(T.subscribe + 8, ENTRY + 12); // 8 frames after the word, and never before the button is readable

// Third gesture: the link in bio lands on "click", the cursor clicks it on "bio"
const LINK_AT = T.click;
const LINK_CLICK = T.bio;
const CHECK_0 = CARD_AT + 8;
const CHECK_STEP = clamp(Math.round((LINK_AT - 12 - CHECK_0) / N), 3, 6);
const CHECK_AT = (i: number) => CHECK_0 + i * CHECK_STEP;

// Fourth gesture: the keyword types itself, the arrow links it to the guide
const LABEL_AT = T.keyword;
const FIELD_AT = T.keyword + 3;
const TYPE_AT = FIELD_AT + 3;
const ARROW_DUR = 12;
const TYPE_DUR = Math.max(8, Math.min(28, Math.ceil(KEYWORD.length * 2.5), LIMIT - ARROW_DUR - 1 - TYPE_AT)); // typing ends near the spoken word
const TYPE_END = TYPE_AT + TYPE_DUR;
const TYPE_CPS = (KEYWORD.length / TYPE_DUR) * 30;
const LETTER_AT = (i: number) => TYPE_AT + Math.ceil(((i + 1) * TYPE_DUR) / KEYWORD.length);
const ARROW_AT = TYPE_END + 1;
const IMPACT = ARROW_AT + ARROW_DUR; // the arrow lands, the card reacts

// Font size that fits on one line, never under 24 px
const fontFor = (chars: number, width: number, em: number, max: number) => clamp(Math.floor(width / (chars * em)), 24, max);

// Card: total height 600 at most, tilt included it stays within y 41 to 659
const CARD = {cx: 226, cy: 350, w: 340, tilt: -3, band: 132, pad: 16, sub: 76, gap: 10, bottom: 18, max: 600};
const ROW_GAP = N >= 6 ? 6 : 8;
const ROWS_SPACE = CARD.max - CARD.band - CARD.pad - CARD.sub - CARD.gap - CARD.bottom;
const ROW_H = Math.floor(Math.min(76, (ROWS_SPACE - (N - 1) * ROW_GAP) / N));
const CARD_H = CARD.band + CARD.pad + CARD.sub + CARD.gap + N * ROW_H + (N - 1) * ROW_GAP + CARD.bottom;
const CHECK_S = clamp(Math.round(ROW_H * 0.6), 26, 42);
const ROW_TEXT = CARD.w - 2 * CARD.pad - 2 * 14 - CHECK_S - 10;
const ROW_FONT = Math.max(28, Math.min(Math.round(ROW_H * 0.66), fontFor(Math.max(...G.items.map((t) => t.length)), ROW_TEXT, 0.68, 38)));
const TITLE_FONT = fontFor(G.card.length, (CARD.w - 40) * 0.95, 0.62, 76);
const SUB_FONT = fontFor(KEYWORD.length, (CARD.w - 2 * CARD.pad - 28) * 0.95, 0.62, 46);

// Right column: x 480 to 930, y 94 to 606
const COL = {x: 480, w: 450};
const BUTTON = {y: 94, h: 124};
const LINK = {y: 270, h: 112, icon: 42};
const LABEL_Y = 434;
const FIELD = {y: 482, h: 124, icon: 46, cy: 544};
const LINK_FONT = fontFor(G.link.length, COL.w - 2 * 20 - 8 - LINK.icon - 12, 0.6, 40);
const FIELD_FONT = fontFor(KEYWORD.length, (COL.w - 2 * 26 - 7 - FIELD.icon - 14 - 9) * 0.95, 0.62, 46);

// Cursor tips, right of the label so nothing is hidden
const CLICK_TIP = {x: 872, y: 176};
const LINK_TIP = {x: 884, y: 346};
const ORIGIN = {x: CLICK_TIP.x - COL.x, y: CLICK_TIP.y - BUTTON.y}; // the mint spreads from the click point

// Arrow: from the edge of the field to the side of the card
const F = {x0: 478, y0: FIELD.cy, c1x: 440, c1y: FIELD.cy + 2, c2x: 434, c2y: 482, x1: 410, y1: 432, tip: 32};
const F_ANGLE = Math.atan2(F.y1 - F.c2y, F.x1 - F.c2x);
const barb = (side: number, len: number) => `${F.x1 - len * Math.cos(F_ANGLE + side * 0.6)} ${F.y1 - len * Math.sin(F_ANGLE + side * 0.6)}`;

const hump = (frame: number, at: number, dur: number) => (frame < at || frame > at + dur ? 0 : Math.sin(((frame - at) / dur) * Math.PI));
const clicAt = (frame: number, at: number) => interpolate(frame, [at - 2, at, at + 5], [0, 1, 0], CLAMP);

// Bookmark: the white outline, and its mint copy revealed from bottom to top
const MARK_PATH = 'M6.5 3h11A1.5 1.5 0 0 1 19 4.5V21l-7-4.4L5 21V4.5A1.5 1.5 0 0 1 6.5 3Z';
const Bookmark: React.FC<{readonly size: number; readonly fill: number}> = ({size, fill}) => (
  <div style={{position: 'relative', width: size, height: size}}>
    <svg width={size} height={size} viewBox="0 0 24 24" style={{position: 'absolute', left: 0, top: 0}}>
      <path d={MARK_PATH} fill="none" stroke="#fff" strokeWidth={2.2} strokeLinejoin="round" />
    </svg>
    <svg width={size} height={size} viewBox="0 0 24 24" style={{position: 'absolute', left: 0, top: 0, clipPath: `inset(${(1 - fill) * 100}% 0px 0px 0px)`}}>
      <path d={MARK_PATH} fill={C.mint} stroke={C.mint} strokeWidth={2.2} strokeLinejoin="round" />
    </svg>
  </div>
);

const Tile: React.FC<{readonly i: number; readonly k: number; readonly dx: number; readonly hot?: number; readonly scale?: number; readonly children: React.ReactNode}> = ({i, k, dx, hot = 0, scale = 1, children}) => (
  <div
    style={{
      position: 'absolute',
      left: ICONS.cx - ICONS.size / 2,
      top: tileY(i) - ICONS.size / 2,
      width: ICONS.size,
      height: ICONS.size,
      boxSizing: 'border-box',
      borderRadius: 99,
      background: 'rgba(23,36,52,0.96)',
      border: `2px solid ${hot > 0.5 ? C.mint : C.line}`,
      boxShadow: `0 0 ${36 * hot}px rgba(95,227,193,${0.45 * hot}), 0 12px 28px rgba(0,0,0,0.35)`,
      display: 'grid',
      placeItems: 'center',
      scale: k * scale,
      opacity: Math.min(1, k * 2),
      translate: `${dx}px 0px`,
    }}
  >
    {children}
  </div>
);

// First gesture: the reel, its icons, and the save
const Post: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame > POST_OUT + 8) {
    return null;
  }
  const k = pop(frame, T.save, 30, 14, 190);
  const out = fall(frame, POST_OUT, 8);
  const drift = (1 - out) * 44;
  const press = clicAt(frame, CLICK_SAVE);
  const fill = interpolate(frame, [CLICK_SAVE, CLICK_SAVE + 8], [0, 1], {...CLAMP, easing: EASE_OUT});
  const saved = rise(frame, CLICK_SAVE, 6);
  const toast = pop(frame, CLICK_SAVE + 4, 30, 12, 220);
  const thump = hump(frame, T.need - 1, 12);
  const mark = pop(frame, MARK_AT, 30, 12, 220);
  return (
    <div style={{opacity: out}}>
      <div
        style={{
          position: 'absolute',
          left: THUMB.x,
          top: THUMB.y,
          width: THUMB.w,
          height: THUMB.h,
          borderRadius: 30,
          overflow: 'hidden',
          background: C.bg,
          boxShadow: `0 0 0 ${2 + saved}px rgba(${saved > 0.5 ? '95,227,193,0.85' : '255,255,255,0.14'}), 0 24px 60px rgba(0,0,0,0.5), 0 0 ${50 + 30 * saved}px rgba(95,227,193,${0.14 + 0.14 * saved})`,
          opacity: Math.min(1, k * 2),
          scale: (0.9 + 0.1 * k) * (1 + 0.012 * thump),
          translate: `${-drift}px 0px`,
        }}
      >
        <Img src={staticFile('reel/clone.jpg')} style={{position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', objectFit: 'cover', scale: 1.03 + frame * 0.0007}} />
        <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 190, background: 'linear-gradient(180deg, rgba(4,8,14,0.78), transparent)'}} />
        <div style={{position: 'absolute', left: 10, right: 10, top: 34, textAlign: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: 30, lineHeight: 1.16, letterSpacing: '-0.01em', color: '#fff', textShadow: '0 3px 10px rgba(6,10,16,0.8)', whiteSpace: 'nowrap'}}>
          This voice
          <br />
          is not me.
        </div>
        <div style={{position: 'absolute', left: 20, right: 20, bottom: 18, height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.28)'}}>
          <div style={{width: `${interpolate(frame, [T.save, POST_OUT + 8], [14, 38], CLAMP)}%`, height: '100%', borderRadius: 99, background: C.mint}} />
        </div>
      </div>
      {ACTIONS.map((a, i) => (
        <Tile key={a.name} i={i} k={pop(frame, a.at, 30, 12, 220)} dx={drift}>
          <Icon name={a.name} size={58} color="#fff" stroke={2.2} />
        </Tile>
      ))}
      <Tile i={3} k={mark} dx={drift} hot={saved} scale={1 - 0.12 * press + 0.14 * hump(frame, CLICK_SAVE + 1, 12) + 0.1 * thump}>
        <Bookmark size={62} fill={fill} />
      </Tile>
      {/* message attached to the bookmark, over the thumbnail */}
      <div
        style={{
          position: 'absolute',
          left: ICONS.cx - ICONS.size / 2 - 22 - 300,
          top: tileY(3) - 38,
          width: 300,
          height: 76,
          boxSizing: 'border-box',
          borderRadius: 22,
          background: '#0E1822',
          border: `3px solid ${C.mint}`,
          boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          transformOrigin: '100% 50%',
          opacity: Math.min(1, toast * 2),
          scale: (0.8 + 0.2 * toast) * (1 + 0.04 * thump),
          translate: `${(1 - toast) * 40 - drift}px 0px`,
        }}
      >
        <Check k={pop(frame, CLICK_SAVE + 7, 30, 11, 230)} size={44} />
        <span style={{fontFamily: DISPLAY, fontWeight: 700, fontSize: 38, letterSpacing: '-0.01em', color: '#fff', whiteSpace: 'nowrap'}}>Saved</span>
        <div style={{position: 'absolute', right: -13, top: '50%', marginTop: -10, width: 20, height: 20, boxSizing: 'border-box', background: '#0E1822', borderTop: `3px solid ${C.mint}`, borderRight: `3px solid ${C.mint}`, rotate: '45deg'}} />
      </div>
    </div>
  );
};

// The card: banner, keyword, rows checked in cascade. It barely moves once placed.
const Card: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < CARD_AT) {
    return null;
  }
  const k = pop(frame, CARD_AT, 30, 13, 170);
  const shock = hump(frame, IMPACT, 14);
  const burst = flash(frame, IMPACT, 30);
  const afterglow = rise(frame, IMPACT, 8) * (0.4 + 0.1 * Math.sin(frame / 7));
  const glow = Math.min(1, burst + afterglow);
  const sheen = interpolate(frame, [IMPACT - 1, IMPACT + 15], [-190, CARD.w + 60], {...CLAMP, easing: EASE_OUT});
  return (
    <div
      style={{
        position: 'absolute',
        left: CARD.cx - CARD.w / 2,
        top: CARD.cy - CARD_H / 2,
        width: CARD.w,
        height: CARD_H,
        boxSizing: 'border-box',
        borderRadius: 26,
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #1C2C3F, #15222F)',
        boxShadow: `0 0 0 2px rgba(95,227,193,${0.2 + 0.6 * glow}), 0 26px 60px rgba(0,0,0,0.55), 0 0 ${24 + 66 * glow}px rgba(95,227,193,${0.1 + 0.5 * glow})`,
        opacity: Math.min(1, k * 2),
        scale: (0.9 + 0.1 * k) * (1 + 0.025 * shock),
        rotate: `${CARD.tilt - (1 - k) * 5 + 0.8 * shock + Math.sin(frame / 38) * 0.3}deg`,
        translate: `${-(1 - k) * 70 - 4 * shock}px ${(1 - k) * 30 + Math.sin(frame / 26) * 2}px`,
      }}
    >
      <div style={{height: CARD.band, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${C.mint}, #3FCFA8)`}}>
        <span style={{fontFamily: DISPLAY, fontWeight: 700, fontSize: TITLE_FONT, letterSpacing: '-0.01em', textTransform: 'uppercase', color: C.bg, whiteSpace: 'nowrap'}}>{G.card}</span>
      </div>
      <div style={{position: 'absolute', left: CARD.pad, right: CARD.pad, top: CARD.band + CARD.pad}}>
        <div
          style={{
            height: CARD.sub,
            boxSizing: 'border-box',
            borderRadius: 16,
            background: 'rgba(95,227,193,0.13)',
            border: '2px solid rgba(95,227,193,0.42)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: SUB_FONT,
            letterSpacing: '-0.01em',
            color: C.mint,
            whiteSpace: 'nowrap',
          }}
        >
          {KEYWORD}
        </div>
        <div style={{marginTop: CARD.gap, display: 'flex', flexDirection: 'column', gap: ROW_GAP}}>
          {G.items.map((item, i) => {
            const enter = rise(frame, ROW_AT(i), 9);
            const on = rise(frame, CHECK_AT(i) - 1, 5);
            const tick = pop(frame, CHECK_AT(i) - 1, 30, 10, 240);
            const wave = hump(frame, IMPACT + 2 + i * 2, 10);
            return (
              <div
                key={`row-${i}`}
                style={{
                  height: ROW_H,
                  boxSizing: 'border-box',
                  padding: '0 14px',
                  borderRadius: 14,
                  background: `rgba(95,227,193,${0.05 + 0.07 * on + 0.14 * wave})`,
                  border: `1.5px solid ${on > 0.5 ? 'rgba(95,227,193,0.32)' : C.line}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  opacity: enter,
                  translate: `${(enter - 1) * 18}px 0px`,
                  scale: 1 + 0.03 * hump(frame, CHECK_AT(i) - 1, 10) + 0.025 * wave,
                }}
              >
                <span style={{flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: MONO, fontWeight: 500, fontSize: ROW_FONT, textTransform: 'uppercase', color: C.text, whiteSpace: 'nowrap', opacity: 0.74 + 0.26 * on}}>{item}</span>
                <div style={{position: 'relative', width: CHECK_S, height: CHECK_S, flex: 'none', boxSizing: 'border-box', borderRadius: 99, border: '2.5px solid rgba(255,255,255,0.26)'}}>
                  <Check k={tick} size={CHECK_S} style={{position: 'absolute', left: -2.5, top: -2.5}} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {frame >= IMPACT - 1 && frame <= IMPACT + 15 ? (
        <div style={{position: 'absolute', left: sheen, top: -40, width: 130, height: CARD_H + 80, rotate: '16deg', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.24), transparent)'}} />
      ) : null}
    </div>
  );
};

// The button: on click, the mint spreads from the cursor tip and reveals "Subscribed"
const Button: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < BUTTON_AT) {
    return null;
  }
  const k = pop(frame, BUTTON_AT, 30, 12, 200);
  const press = clicAt(frame, CLICK);
  const radius = interpolate(frame, [CLICK, CLICK + 11], [0, 430], {...CLAMP, easing: EASE_OUT});
  const done = rise(frame, CLICK, 8);
  const checkK = pop(frame, CLICK + 3, 30, 11, 230);
  const burst = flash(frame, CLICK, 26);
  const breath = 0.5 + 0.5 * Math.sin(frame / 8);
  const layer: React.CSSProperties = {position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18};
  return (
    <div
      style={{
        position: 'absolute',
        left: COL.x,
        top: BUTTON.y,
        width: COL.w,
        height: BUTTON.h,
        borderRadius: BUTTON.h / 2,
        overflow: 'hidden',
        fontFamily: DISPLAY,
        fontWeight: 700,
        fontSize: 54,
        letterSpacing: '-0.005em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        boxShadow: `0 0 ${20 + 14 * breath + 46 * burst}px rgba(95,227,193,${0.3 + 0.08 * breath + 0.4 * burst}), 0 16px 36px rgba(0,0,0,0.4)`,
        opacity: Math.min(1, k * 2),
        scale: (0.8 + 0.2 * k) * (1 - 0.05 * press + 0.04 * hump(frame, CLICK + 2, 12)),
        translate: `${(1 - k) * 46}px 0px`,
      }}
    >
      <div style={{...texte, background: '#0E1822', boxShadow: `inset 0 0 0 4px ${C.mint}`, color: C.mint}}>Subscribe</div>
      {done > 0 ? (
        <div style={{...texte, background: `linear-gradient(135deg, ${C.mint}, #49D8B2)`, color: C.bg, clipPath: `circle(${radius}px at ${ORIGIN.x}px ${ORIGIN.y}px)`}}>
          <div style={{width: 58, height: 58, borderRadius: 99, background: C.bg, display: 'grid', placeItems: 'center', flex: 'none', scale: Math.max(0, checkK)}}>
            <Icon name="check" size={38} color={C.mint} stroke={3.6} />
          </div>
          <span>Subscribed</span>
        </div>
      ) : null}
    </div>
  );
};

// The link: outlined pill, the chain links rotate as they land
const Link: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < LINK_AT) {
    return null;
  }
  const k = pop(frame, LINK_AT, 30, 12, 200);
  const press = clicAt(frame, LINK_CLICK);
  const done = rise(frame, LINK_CLICK, 6);
  return (
    <div
      style={{
        position: 'absolute',
        left: COL.x,
        top: LINK.y,
        width: COL.w,
        height: LINK.h,
        boxSizing: 'border-box',
        borderRadius: LINK.h / 2,
        border: `4px solid ${interpolateColors(done, [0, 1], ['rgba(255,255,255,0.92)', C.mint])}`,
        background: 'rgba(23,36,52,0.96)',
        boxShadow: `0 14px 32px rgba(0,0,0,0.38), 0 0 ${34 * flash(frame, LINK_AT, 24) + 40 * flash(frame, LINK_CLICK, 26)}px rgba(95,227,193,0.4)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        opacity: Math.min(1, k * 2),
        scale: (0.8 + 0.2 * k) * (1 - 0.05 * press + 0.04 * hump(frame, LINK_CLICK + 2, 12)),
        translate: `${(1 - k) * 46}px 0px`,
      }}
    >
      <Icon name="link" size={LINK.icon} color={C.mint} stroke={2.6} style={{rotate: `${(1 - k) * -70}deg`}} />
      <span style={{fontFamily: MONO, fontWeight: 600, fontSize: LINK_FONT, color: '#fff', whiteSpace: 'nowrap'}}>{G.link}</span>
    </div>
  );
};

// The search field: the keyword types letter by letter, the text caret blinks until the end
const Field: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < LABEL_AT) {
    return null;
  }
  const label = pop(frame, LABEL_AT, 30, 14, 190);
  const k = pop(frame, FIELD_AT, 30, 12, 200);
  const finished = rise(frame, TYPE_END, 6);
  const burst = flash(frame, TYPE_END, 22);
  const typing = frame >= TYPE_AT && frame < TYPE_END;
  const caret = typing || Math.floor(frame / 9) % 2 === 0;
  return (
    <>
      <div style={{position: 'absolute', left: COL.x + 8, top: LABEL_Y, fontFamily: MONO, fontWeight: 600, fontSize: 30, lineHeight: '38px', letterSpacing: '0.2em', color: C.mint, whiteSpace: 'nowrap', opacity: Math.min(1, label * 1.6), translate: `${(1 - label) * 34}px 0px`}}>KEYWORD</div>
      <div
        style={{
          position: 'absolute',
          left: COL.x,
          top: FIELD.y,
          width: COL.w,
          height: FIELD.h,
          boxSizing: 'border-box',
          padding: '0 26px',
          borderRadius: 30,
          border: `3.5px solid ${interpolateColors(finished, [0, 1], ['#FFFFFF', C.mint])}`,
          background: '#0A1118',
          boxShadow: `0 16px 36px rgba(0,0,0,0.42), 0 0 ${18 + 16 * finished + 44 * burst}px rgba(95,227,193,${0.1 + 0.16 * finished + 0.4 * burst})`,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          opacity: Math.min(1, k * 2),
          scale: 0.84 + 0.16 * k,
          translate: `${(1 - k) * 46}px 0px`,
        }}
      >
        <Icon name="search" size={FIELD.icon} color={C.mint} stroke={2.6} />
        <div style={{display: 'flex', alignItems: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: FIELD_FONT, letterSpacing: '-0.01em', color: '#fff', whiteSpace: 'nowrap'}}>
          <span>{typed(KEYWORD, frame, TYPE_AT, TYPE_CPS)}</span>
          <div style={{width: 5, height: FIELD_FONT * 1.04, marginLeft: 4, borderRadius: 3, background: C.mint, flex: 'none', opacity: caret ? 1 : 0}} />
        </div>
      </div>
    </>
  );
};

// The white arrow: the line draws from the field, the head pops out when it arrives
const Arrow: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < ARROW_AT) {
    return null;
  }
  const dash = interpolate(frame, [ARROW_AT, IMPACT], [1, 0], {...CLAMP, easing: EASE_IN_OUT});
  const tip = F.tip * pop(frame, IMPACT - 3, 30, 11, 240);
  return (
    <svg width={960} height={700} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', filter: 'drop-shadow(0 0 10px rgba(95,227,193,0.75))'}}>
      <g fill="none" stroke="#fff" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round">
        <path d={`M ${F.x0} ${F.y0} C ${F.c1x} ${F.c1y}, ${F.c2x} ${F.c2y}, ${F.x1} ${F.y1}`} pathLength={1} strokeDasharray="1 1" strokeDashoffset={dash} />
        {tip > 0 ? <path d={`M ${barb(1, tip)} L ${F.x1} ${F.y1} L ${barb(-1, tip)}`} /> : null}
      </g>
    </svg>
  );
};

// One cursor for all three clicks: it stays on screen between gestures
const Pointer: React.FC = () => {
  const frame = useCurrentFrame();
  const shown = Math.min(rise(frame, T.save + 6, 4), fall(frame, LINK_CLICK + 18, 8));
  if (shown <= 0) {
    return null;
  }
  const at = path(frame, [
    [T.save + 6, 930, 770],
    [CLICK_SAVE - 4, SAVE_TIP.x, SAVE_TIP.y],
    [T.subscribe - 6, SAVE_TIP.x, SAVE_TIP.y],
    [CLICK - 4, CLICK_TIP.x, CLICK_TIP.y],
    [CLICK + 10, CLICK_TIP.x, CLICK_TIP.y],
    [LINK_CLICK - 4, LINK_TIP.x, LINK_TIP.y],
    [LINK_CLICK + 8, LINK_TIP.x, LINK_TIP.y],
    [LINK_CLICK + 24, 905, 640],
  ]);
  const hover = Math.sin(frame / 7) * 3 * phase(frame, CLICK_SAVE + 6, T.subscribe - 6, 8, 8);
  const press = Math.max(clicAt(frame, CLICK_SAVE), clicAt(frame, CLICK), clicAt(frame, LINK_CLICK));
  return <Cursor x={at.x - 4} y={at.y - 4 + hover} press={press} size={60} opacity={shown} />;
};

export const Cta: React.FC = () => (
  <div style={{position: 'absolute', left: 0, top: 0, width: 960, height: 700}}>
    <Post />
    <Card />
    <Button />
    <Link />
    <Field />
    <Arrow />
    <ClickRing x={ICONS.cx} y={tileY(3)} at={CLICK_SAVE} />
    <ClickRing x={CLICK_TIP.x} y={CLICK_TIP.y} at={CLICK} color="#fff" />
    <ClickRing x={LINK_TIP.x} y={LINK_TIP.y} at={LINK_CLICK} color="#fff" />
    <Pointer />
  </div>
);

export const ctaSfx: Sfx[] = [
  {name: 'pop', at: MARK_AT - 2, vol: 0.16},
  {name: 'click', at: CLICK_SAVE - 2, vol: 0.3},
  {name: 'pop-high', at: CLICK_SAVE + 2, vol: 0.22},
  {name: 'tick', at: T.need - 2, vol: 0.14},
  {name: 'whoosh-short', at: POST_OUT - 2, vol: 0.16},
  {name: 'pop', at: CARD_AT - 3, vol: 0.22},
  {name: 'pop-high', at: BUTTON_AT - 2, vol: 0.14},
  ...G.items.map((_, i) => ({name: 'tick', at: CHECK_AT(i) - 2, vol: 0.12 + i * 0.015})),
  {name: 'ding', at: CLICK - 3, vol: 0.2},
  {name: 'click', at: CLICK - 2, vol: 0.3},
  {name: 'pop-high', at: LINK_AT - 3, vol: 0.22},
  {name: 'click', at: LINK_CLICK - 2, vol: 0.3},
  {name: 'tick', at: LABEL_AT - 2, vol: 0.14},
  {name: 'pop', at: FIELD_AT - 3, vol: 0.2},
  ...new Array(Math.ceil(KEYWORD.length / 2)).fill(0).map((_, i) => ({name: 'key', at: LETTER_AT(i * 2) - 2, vol: 0.08})),
  {name: 'whoosh-short', at: ARROW_AT - 2, vol: 0.16},
  {name: 'pop-high', at: IMPACT - 2, vol: 0.18},
  {name: 'chime', at: IMPACT - 3, vol: 0.26},
];
