// Hook: big words at the top of the frame, over the studio shot. Absolute frames (the hook starts at 0).
// Enrich it for each reel: a checked list, an object that arrives on a word, as in assets/example-this-voice/scenes/Hook.tsx.
import {interpolate, useCurrentFrame} from 'remotion';
import {CLAMP, EASE_OUT} from '../anim';
import {HOOK_PAGES, SECTIONS} from '../data';
import {C, caseStyle, DISPLAY, type Sfx} from '../kit';

const HOOK_END = SECTIONS.hook.to;

const Word: React.FC<{readonly t: string; readonly on: boolean; readonly said: boolean; readonly size: number}> = ({t, on, said, size}) => (
  <span
    style={{
      padding: '2px 16px 8px',
      borderRadius: 20,
      background: on ? C.mint : 'transparent',
      color: on ? C.bg : '#fff',
      textShadow: on ? 'none' : '0 5px 0 rgba(6,10,16,0.65), 0 0 34px rgba(6,10,16,0.85)',
      opacity: said ? 1 : 0.76, // readable from the very first frame, the one that stops the thumb
      scale: on ? 1.04 : 1,
      whiteSpace: 'nowrap',
      fontSize: size,
      ...caseStyle(t),
    }}
  >
    {t}
  </span>
);

const Scrim: React.FC<{readonly opacity?: number}> = ({opacity = 1}) => (
  <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 760, background: 'linear-gradient(180deg, rgba(4,8,14,0.82) 0%, rgba(4,8,14,0.55) 55%, transparent 100%)', opacity}} />
);

// One page of big words; `active` = index of the current word (-1: none)
const Page: React.FC<{readonly page: (typeof HOOK_PAGES)[number]; readonly active: number; readonly allSaid?: boolean}> = ({page, active, allSaid = false}) => {
  const all = page.lines.flat();
  return (
    <div style={{position: 'absolute', left: 40, right: 40, top: 226, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, fontFamily: DISPLAY, fontWeight: 700, lineHeight: 1.08, letterSpacing: '-0.02em', textTransform: 'uppercase', color: '#fff'}}>
      {page.lines.map((line, i) => (
        <div key={`line-${i}`} style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 6px'}}>
          {line.map((w, j) => {
            const idx = all.indexOf(w);
            return <Word key={`word-${page.start}-${i}-${j}`} t={w.t} on={idx === active} said={allSaid || idx <= active} size={all.length <= 3 ? 112 : 100} />;
          })}
        </div>
      ))}
    </div>
  );
};

// First page, still: it closes the video so the last frame is the first one (seamless loop)
export const HookFirstPage: React.FC<{readonly allSaid?: boolean}> = ({allSaid = false}) => (
  <>
    <Scrim />
    <Page page={HOOK_PAGES[0]} active={-1} allSaid={allSaid} />
  </>
);

export const HookText: React.FC = () => {
  const frame = useCurrentFrame();
  // the text is there from the very first frame: that frame is what stops the thumb
  const page = HOOK_PAGES.find((p) => frame < p.end && (frame >= p.start || p === HOOK_PAGES[0]));
  const scrim = interpolate(frame, [HOOK_END - 29, HOOK_END - 2], [1, 0], CLAMP);
  let active = -1;
  if (page) {
    page.lines.flat().forEach((x, k) => {
      if (frame >= x.at - 1) {
        active = k;
      }
    });
  }
  return (
    <>
      <Scrim opacity={scrim} />
      {page ? <Page key={`page-${page.start}`} page={page} active={active} /> : null}
    </>
  );
};

// Screen light at the moment of the dive
export const ScreenFlash: React.FC = () => {
  const frame = useCurrentFrame();
  const a = interpolate(frame, [HOOK_END - 10, HOOK_END - 2, HOOK_END + 10], [0, 0.85, 0], {...CLAMP, easing: EASE_OUT});
  return <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(60% 45% at 50% 50%, #BFFBEA, rgba(95,227,193,0.5) 60%, transparent 100%)', opacity: a}} />;
};

// Hook sound effects, kept away from the important words: the voice must stay in front
export const hookSfx: Sfx[] = [
  {name: 'sparkles', at: 26, vol: 0.28},
  {name: 'swoosh-up', at: 42, vol: 0.2},
  {name: 'riser', at: HOOK_END - 84, vol: 0.13},
  {name: 'whoosh', at: HOOK_END - 30, vol: 0.2},
  {name: 'impact', at: HOOK_END - 8, vol: 0.2},
];
