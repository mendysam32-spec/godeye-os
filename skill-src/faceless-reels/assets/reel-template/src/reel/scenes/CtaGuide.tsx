// Call to action: "Subscribe to get the guide, then click the link in bio, and type the keyword..."
// A card on the left, three stacked blocks on the right, each one landing on its word. The cursor subscribes, then clicks the link in bio. Finally an arrow links the keyword to the card.
// Nothing leaves: the blocks stay until the window fades, this is the final screen, readable when paused.
import {interpolate, interpolateColors, useCurrentFrame} from 'remotion';
import {CLAMP, cues, EASE_IN_OUT, EASE_OUT, fall, flash, path, pop, rise, secLen, typed} from '../anim';
import {CONFIG} from '../data';
import {labels} from '../labels';
import {C, Check, ClickRing, Cursor, DISPLAY, Icon, MONO, type Sfx} from '../kit';

const G = CONFIG.guide;
const N = G.items.length;
const KEYWORD = G.keyword;
const L = labels();
const c = cues('cta');

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const APPEAR = 12; // Reel.tsx brings the scene in at this frame: the word can fall earlier, nothing is timed in the void
const LIMIT = secLen('cta') - 2; // the window holds 1 s into the next sentence: the arrow lands before the end of the section, the final screen stays readable

const T = {
  subscribe: Math.max(APPEAR, c(G.words.subscribe)),
  link: c(G.words.link),
  click: c(G.words.click),
  keyword: c(G.words.keyword),
};

// First gesture
const CARD_AT = T.subscribe;
const BUTTON_AT = T.subscribe + 2;
const LINE_AT = (i: number) => CARD_AT + 3 + i * 2; // the lines land with the card
const CLICK = Math.max(T.subscribe + 8, APPEAR + 12); // 8 frames after the word, and never before the button is readable
const CURSOR_AT = CLICK - 12;
const CHECK_0 = CARD_AT + 8;
const CHECK_STEP = clamp(Math.round((T.link - 12 - CHECK_0) / N), 3, 6);
const CHECK_AT = (i: number) => CHECK_0 + i * CHECK_STEP;

// Second and third gestures
const LINK_AT = T.link;
const LINK_CLICK = T.click;
const LABEL_AT = T.keyword;
const FIELD_AT = T.keyword + 3;
const TYPE_AT = FIELD_AT + 3;
const ARROW_DUR = 12;
const TYPE_DUR = Math.max(8, Math.min(28, Math.ceil(KEYWORD.length * 2.5), LIMIT - ARROW_DUR - 1 - TYPE_AT)); // typing ends around the spoken word
const TYPE_END = TYPE_AT + TYPE_DUR;
const TYPE_CPS = (KEYWORD.length / TYPE_DUR) * 30;
const LETTER_AT = (i: number) => TYPE_AT + Math.ceil(((i + 1) * TYPE_DUR) / KEYWORD.length);
const ARROW_AT = TYPE_END + 1;
const IMPACT = ARROW_AT + ARROW_DUR; // the arrow lands, the card reacts

// Font size that fits on one line, never under 24 px
const fitSize = (chars: number, width: number, em: number, max: number) => clamp(Math.floor(width / (chars * em)), 24, max);

// Card: total height 600 at most; with its tilt it stays within y 41 to 659
const CARD = {cx: 226, cy: 350, w: 340, tilt: -3, banner: 132, pad: 16, sub: 76, gap: 10, bottom: 18, max: 600};
const LINE_GAP = N >= 6 ? 6 : 8;
const LINES_ROOM = CARD.max - CARD.banner - CARD.pad - CARD.sub - CARD.gap - CARD.bottom;
const LINE_H = Math.floor(Math.min(76, (LINES_ROOM - (N - 1) * LINE_GAP) / N));
const CARD_H = CARD.banner + CARD.pad + CARD.sub + CARD.gap + N * LINE_H + (N - 1) * LINE_GAP + CARD.bottom;
const CHECK_S = clamp(Math.round(LINE_H * 0.6), 26, 42);
const LINE_TEXT = CARD.w - 2 * CARD.pad - 2 * 14 - CHECK_S - 10;
const LINE_SIZE = Math.max(28, Math.min(Math.round(LINE_H * 0.66), fitSize(Math.max(...G.items.map((t) => t.length)), LINE_TEXT, 0.68, 38)));
const TITLE_SIZE = fitSize(G.card.length, (CARD.w - 40) * 0.95, 0.62, 76);
const SUB_SIZE = fitSize(KEYWORD.length, (CARD.w - 2 * CARD.pad - 28) * 0.95, 0.62, 46);

// Right column: x 480 to 930, y 94 to 606
const COL = {x: 480, w: 450};
const BUTTON = {y: 94, h: 124};
const LINK = {y: 270, h: 112, icon: 42};
const LABEL_Y = 434;
const FIELD = {y: 482, h: 124, icon: 46, cy: 544};
const LINK_SIZE = fitSize(G.link.length, COL.w - 2 * 20 - 8 - LINK.icon - 12, 0.6, 40);
// Button label: the longer of the two states (with its check badge) must fit in the pill
const BUTTON_SIZE = Math.min(54, Math.floor((COL.w - 2 * 24) / (Math.max(L.subscribe.length, L.subscribed.length + 2) * 0.62)));
const FIELD_SIZE = fitSize(KEYWORD.length, (COL.w - 2 * 26 - 7 - FIELD.icon - 14 - 9) * 0.95, 0.62, 46);

// Cursor tips, right of the label so nothing is hidden
const CLICK_TIP = {x: 872, y: 176};
const LINK_TIP = {x: 884, y: 346};
const ORIGIN = {x: CLICK_TIP.x - COL.x, y: CLICK_TIP.y - BUTTON.y}; // the mint spreads from the click point

// Arrow: from the edge of the field to the side of the card
const F = {x0: 478, y0: FIELD.cy, c1x: 440, c1y: FIELD.cy + 2, c2x: 434, c2y: 482, x1: 410, y1: 432, head: 32};
const F_ANGLE = Math.atan2(F.y1 - F.c2y, F.x1 - F.c2x);
const barb = (side: number, len: number) => `${F.x1 - len * Math.cos(F_ANGLE + side * 0.6)} ${F.y1 - len * Math.sin(F_ANGLE + side * 0.6)}`;

const hump = (frame: number, at: number, dur: number) => (frame < at || frame > at + dur ? 0 : Math.sin(((frame - at) / dur) * Math.PI));
const clicAt = (frame: number, at: number) => interpolate(frame, [at - 2, at, at + 5], [0, 1, 0], CLAMP);

// The card: banner, keyword, checked lines in cascade. It barely moves once it has landed.
const Card: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < CARD_AT) {
    return null;
  }
  const k = pop(frame, CARD_AT, 30, 13, 170);
  const shock = hump(frame, IMPACT, 14);
  const burst = flash(frame, IMPACT, 30);
  const glowRest = rise(frame, IMPACT, 8) * (0.4 + 0.1 * Math.sin(frame / 7));
  const glow = Math.min(1, burst + glowRest);
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
      <div style={{height: CARD.banner, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${C.mint}, #3FCFA8)`}}>
        <span style={{fontFamily: DISPLAY, fontWeight: 700, fontSize: TITLE_SIZE, letterSpacing: '-0.01em', textTransform: 'uppercase', color: C.bg, whiteSpace: 'nowrap'}}>{G.card}</span>
      </div>
      <div style={{position: 'absolute', left: CARD.pad, right: CARD.pad, top: CARD.banner + CARD.pad}}>
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
            fontSize: SUB_SIZE,
            letterSpacing: '-0.01em',
            color: C.mint,
            whiteSpace: 'nowrap',
          }}
        >
          {KEYWORD}
        </div>
        <div style={{marginTop: CARD.gap, display: 'flex', flexDirection: 'column', gap: LINE_GAP}}>
          {G.items.map((item, i) => {
            const landed = rise(frame, LINE_AT(i), 9);
            const on = rise(frame, CHECK_AT(i) - 1, 5);
            const tick = pop(frame, CHECK_AT(i) - 1, 30, 10, 240);
            const wave = hump(frame, IMPACT + 2 + i * 2, 10);
            return (
              <div
                key={`line-${i}`}
                style={{
                  height: LINE_H,
                  boxSizing: 'border-box',
                  padding: '0 14px',
                  borderRadius: 14,
                  background: `rgba(95,227,193,${0.05 + 0.07 * on + 0.14 * wave})`,
                  border: `1.5px solid ${on > 0.5 ? 'rgba(95,227,193,0.32)' : C.line}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  opacity: landed,
                  translate: `${(landed - 1) * 18}px 0px`,
                  scale: 1 + 0.03 * hump(frame, CHECK_AT(i) - 1, 10) + 0.025 * wave,
                }}
              >
                <span style={{flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: MONO, fontWeight: 500, fontSize: LINE_SIZE, textTransform: 'uppercase', color: C.text, whiteSpace: 'nowrap', opacity: 0.74 + 0.26 * on}}>{item}</span>
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
  const tick2 = pop(frame, CLICK + 3, 30, 11, 230);
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
        fontSize: BUTTON_SIZE,
        letterSpacing: '-0.005em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        boxShadow: `0 0 ${20 + 14 * breath + 46 * burst}px rgba(95,227,193,${0.3 + 0.08 * breath + 0.4 * burst}), 0 16px 36px rgba(0,0,0,0.4)`,
        opacity: Math.min(1, k * 2),
        scale: (0.8 + 0.2 * k) * (1 - 0.05 * press + 0.04 * hump(frame, CLICK + 2, 12)),
        translate: `${(1 - k) * 46}px 0px`,
      }}
    >
      <div style={{...layer, background: '#0E1822', boxShadow: `inset 0 0 0 4px ${C.mint}`, color: C.mint}}>{L.subscribe}</div>
      {done > 0 ? (
        <div style={{...layer, background: `linear-gradient(135deg, ${C.mint}, #49D8B2)`, color: C.bg, clipPath: `circle(${radius}px at ${ORIGIN.x}px ${ORIGIN.y}px)`}}>
          <div style={{width: 58, height: 58, borderRadius: 99, background: C.bg, display: 'grid', placeItems: 'center', flex: 'none', scale: Math.max(0, tick2)}}>
            <Icon name="check" size={38} color={C.mint} stroke={3.6} />
          </div>
          <span>{L.subscribed}</span>
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
      <span style={{fontFamily: MONO, fontWeight: 600, fontSize: LINK_SIZE, color: '#fff', whiteSpace: 'nowrap'}}>{G.link}</span>
    </div>
  );
};

// The search field: the keyword is typed letter by letter, the text cursor blinks until the end
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
      <div style={{position: 'absolute', left: COL.x + 8, top: LABEL_Y, fontFamily: MONO, fontWeight: 600, fontSize: 30, lineHeight: '38px', letterSpacing: '0.2em', color: C.mint, whiteSpace: 'nowrap', opacity: Math.min(1, label * 1.6), translate: `${(1 - label) * 34}px 0px`}}>{L.keyword}</div>
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
        <div style={{display: 'flex', alignItems: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: FIELD_SIZE, letterSpacing: '-0.01em', color: '#fff', whiteSpace: 'nowrap'}}>
          <span>{typed(KEYWORD, frame, TYPE_AT, TYPE_CPS)}</span>
          <div style={{width: 5, height: FIELD_SIZE * 1.04, marginLeft: 4, borderRadius: 3, background: C.mint, flex: 'none', opacity: caret ? 1 : 0}} />
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
  const draw = interpolate(frame, [ARROW_AT, IMPACT], [1, 0], {...CLAMP, easing: EASE_IN_OUT});
  const head = F.head * pop(frame, IMPACT - 3, 30, 11, 240);
  return (
    <svg width={960} height={700} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible', filter: 'drop-shadow(0 0 10px rgba(95,227,193,0.75))'}}>
      <g fill="none" stroke="#fff" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round">
        <path d={`M ${F.x0} ${F.y0} C ${F.c1x} ${F.c1y}, ${F.c2x} ${F.c2y}, ${F.x1} ${F.y1}`} pathLength={1} strokeDasharray="1 1" strokeDashoffset={draw} />
        {head > 0 ? <path d={`M ${barb(1, head)} L ${F.x1} ${F.y1} L ${barb(-1, head)}`} /> : null}
      </g>
    </svg>
  );
};

// A single cursor for both clicks: the button, then the link in bio
const Pointer: React.FC = () => {
  const frame = useCurrentFrame();
  const shown = Math.min(rise(frame, CURSOR_AT, 4), fall(frame, LINK_CLICK + 18, 8));
  if (shown <= 0) {
    return null;
  }
  const at = path(frame, [
    [CURSOR_AT, 905, 620],
    [CLICK - 4, CLICK_TIP.x, CLICK_TIP.y],
    [CLICK + 10, CLICK_TIP.x, CLICK_TIP.y],
    [LINK_CLICK - 4, LINK_TIP.x, LINK_TIP.y],
    [LINK_CLICK + 8, LINK_TIP.x, LINK_TIP.y],
    [LINK_CLICK + 24, 905, 640],
  ]);
  return <Cursor x={at.x - 4} y={at.y - 4} press={Math.max(clicAt(frame, CLICK), clicAt(frame, LINK_CLICK))} size={60} opacity={shown} />;
};

// Optional sentence before "Subscribe" ("Save this video..."): the window never stays empty while it is spoken
const SavePrompt: React.FC = () => {
  const frame = useCurrentFrame();
  if (T.subscribe < 40) {
    return null;
  }
  const k = pop(frame, APPEAR + 2, 30, 12, 190);
  return (
    <div style={{position: 'absolute', left: 0, right: 0, top: 150, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26, scale: 0.8 + 0.2 * k, opacity: Math.min(1, k * 2) * fall(frame, T.subscribe - 6, 6)}}>
      <svg width={170} height={210} viewBox="0 0 24 30" fill={C.mint}>
        <path d="M3 3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v25l-9-6-9 6Z" />
      </svg>
      <div style={{fontFamily: DISPLAY, fontWeight: 700, fontSize: 76, letterSpacing: '-0.02em', color: '#fff'}}>{L.save}</div>
    </div>
  );
};

export const CtaGuide: React.FC = () => (
  <div style={{position: 'absolute', left: 0, top: 0, width: 960, height: 700}}>
    <div style={{position: 'absolute', left: 0, top: 0, width: 960, height: 700, background: 'radial-gradient(52% 44% at 70% 30%, rgba(95,227,193,0.08), transparent 100%)'}} />
    <SavePrompt />
    <Card />
    <Button />
    <Link />
    <Field />
    <Arrow />
    <ClickRing x={CLICK_TIP.x} y={CLICK_TIP.y} at={CLICK} color="#fff" />
    <ClickRing x={LINK_TIP.x} y={LINK_TIP.y} at={LINK_CLICK} color="#fff" />
    <Pointer />
  </div>
);

export const ctaSfx: Sfx[] = [
  ...(T.subscribe < 40 ? [] : [{name: 'pop', at: APPEAR, vol: 0.2}]),
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
  {name: 'pop-high', at: IMPACT - 2, vol: 0.06},
  {name: 'chime', at: IMPACT + 12, vol: 0.09},
];
