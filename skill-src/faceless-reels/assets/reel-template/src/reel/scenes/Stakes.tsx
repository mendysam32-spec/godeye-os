// Stakes: the problem, then the open loop. Full canvas, no window.
// Base version, driven by reel.json: big titles per phase, then one empty box per element, which flies into the progress bar.
// For a polished reel, add an image of the contrast in the center (example: assets/example-this-voice/scenes/Stakes.tsx, two cards compared).
import {interpolate, useCurrentFrame} from 'remotion';
import {CLAMP, cues, EASE_IN_OUT, fall, phase, pop, rise, secLen} from '../anim';
import {CONFIG, ELEMENTS, SECTIONS} from '../data';
import {C, DISPLAY, envAt, Mascot, segRect, type Sfx} from '../kit';

const c = cues('stakes');
const LEN = secLen('stakes');
const N = ELEMENTS.length;
const BOXES = c(CONFIG.stakes.boxes_word);
const FLY = LEN - 18; // the boxes fly to the progress bar
const TITLES = CONFIG.stakes.titles.map((t) => ({...t, at: c(t.word, t.n)}));

const Accent: React.FC<{readonly text: string; readonly accent?: string}> = ({text, accent}) => {
  if (!accent || !text.includes(accent)) {
    return <>{text}</>;
  }
  const [a, b] = text.split(accent);
  return (
    <>
      {a}
      <span style={{color: C.mint}}>{accent}</span>
      {b}
    </>
  );
};

export const Stakes: React.FC = () => {
  const frame = useCurrentFrame();
  const voice = envAt(frame + SECTIONS.stakes.from);
  const fly = interpolate(frame, [FLY, LEN - 2], [0, 1], {...CLAMP, easing: EASE_IN_OUT});
  const boxK = (i: number) => pop(frame, BOXES - 4 + i * 3, 30, 11, 210);
  const boxW = Math.min(176, (960 - (N - 1) * 20) / N);
  const x0 = 540 - (N * boxW + (N - 1) * 20) / 2;
  return (
    <>
      <div style={{position: 'absolute', left: 60, right: 60, top: 250, textAlign: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: 118, lineHeight: 1.02, letterSpacing: '-0.025em', color: '#fff'}}>
        {TITLES.map((t, i) => (
          <div key={t.text} style={{position: 'absolute', left: 0, right: 0, top: 0, opacity: phase(frame, t.at - 2, TITLES[i + 1]?.at ?? BOXES, 8, 7), scale: 0.94 + 0.06 * rise(frame, t.at - 2, 10)}}>
            <Accent text={t.text} accent={t.accent} />
          </div>
        ))}
      </div>

      {/* the big mascot of the dive stays until the boxes appear */}
      <Mascot x={540} feet={1120} h={interpolate(frame, [0, 26], [760, 520], {...CLAMP, easing: EASE_IN_OUT})} seed={1} voice={voice} look={[0, -0.2]} opacity={fall(frame, BOXES - 16, 8)} />

      {/* one empty box per element: the open loop, which then flies into the progress bar */}
      {ELEMENTS.map((sec, i) => {
        const k = boxK(i);
        const seg = segRect(i);
        const from = {x: x0 + i * (boxW + 20), y: 640, w: boxW, h: 236};
        return (
          <div
            key={`box-${sec}`}
            style={{
              position: 'absolute',
              left: interpolate(fly, [0, 1], [from.x, seg.x]),
              top: interpolate(fly, [0, 1], [from.y, seg.y]),
              width: interpolate(fly, [0, 1], [from.w, seg.w]),
              height: interpolate(fly, [0, 1], [from.h, seg.h]),
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
              opacity: frame < BOXES - 4 + i * 3 ? 0 : Math.min(1, k * 2),
            }}
          >
            <span style={{opacity: 1 - Math.min(1, fly * 3)}}>{i + 1}</span>
          </div>
        );
      })}
      <div style={{position: 'absolute', left: 0, right: 0, top: 930, textAlign: 'center', fontFamily: DISPLAY, fontWeight: 700, fontSize: 96, letterSpacing: '-0.02em', color: C.mint, opacity: rise(frame, BOXES + 4, 8) * fall(frame, FLY, 8)}}>
        {CONFIG.stakes.boxes_title}
      </div>
    </>
  );
};

export const stakesSfx: Sfx[] = [
  ...TITLES.map((t) => ({name: 'pop-high', at: t.at - 3, vol: 0.22})),
  ...ELEMENTS.map((_, i) => ({name: 'tick', at: BOXES - 4 + i * 3, vol: 0.22})),
  {name: 'whoosh', at: FLY - 2, vol: 0.2},
];
