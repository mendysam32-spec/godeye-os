// Hook: big words at the top of the frame, over the studio shot generated with Atlas Cloud (Kling 3.0 Pro).
// "This voice is not me. It's my clone. The script, the animations, the editing: I didn't touch a thing.
// Claude did it all." Absolute frames (the hook starts at 0).
import {interpolate, useCurrentFrame} from 'remotion';
import {CLAMP, cues, EASE_OUT, pop} from '../anim';
import {HOOK_PAGES} from '../data';
import {Check, C, DISPLAY, type Sfx} from '../kit';

const c = cues('hook');
export const HOOK_T = {
  clone: c('clone'),
  script: c('script'),
  animations: c('animations'),
  editing: c('editing'),
  i: c('I'),
  touch: c('touch'),
  thing: c('thing'),
  claude: c('Claude'),
  did: c('did'),
  all: c('all'),
};

const Word: React.FC<{readonly t: string; readonly on: boolean; readonly said: boolean; readonly size: number}> = ({t, on, said, size}) => (
  <span
    style={{
      padding: '2px 16px 8px',
      borderRadius: 20,
      background: on ? C.mint : 'transparent',
      color: on ? C.bg : '#fff',
      textShadow: on ? 'none' : '0 5px 0 rgba(6,10,16,0.65), 0 0 34px rgba(6,10,16,0.85)',
      opacity: said ? 1 : 0.76, // readable enough from the very first frame, the one that stops the thumb
      scale: on ? 1.04 : 1,
      whiteSpace: 'nowrap',
      fontSize: size,
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

// First page, static: it closes the video so the last frame is the first one (seamless loop), and it is used for the cover
export const HookFirstPage: React.FC<{readonly allSaid?: boolean}> = ({allSaid = false}) => (
  <>
    <Scrim />
    <Page page={HOOK_PAGES[0]} active={-1} allSaid={allSaid} />
  </>
);

export const HookText: React.FC = () => {
  const frame = useCurrentFrame();
  // the text is there from the very first frame: that frame is the one that stops the thumb
  const page = HOOK_PAGES.find((p) => frame < p.end && (frame >= p.start || p === HOOK_PAGES[0]));
  const scrim = interpolate(frame, [205, 232], [1, 0], CLAMP);
  const list = [
    {label: 'The script', at: HOOK_T.script},
    {label: 'Animations', at: HOOK_T.animations},
    {label: 'The editing', at: HOOK_T.editing},
  ];
  const showList = frame >= HOOK_T.script - 3 && frame < HOOK_T.i - 1;
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
      {showList ? (
        <div style={{position: 'absolute', left: 104, top: 232, display: 'flex', flexDirection: 'column', gap: 16}}>
          {list.map((l) => {
            const k = pop(frame, l.at - 1, 30, 12, 210);
            const on = frame >= l.at - 1 && frame < (l.at === HOOK_T.editing ? HOOK_T.i : list[list.indexOf(l) + 1].at) - 1;
            return (
              <div key={l.label} style={{display: 'flex', alignItems: 'center', gap: 26, opacity: Math.min(1, k * 2), translate: `${(1 - k) * -60}px 0px`}}>
                <Check k={pop(frame, l.at + 4, 30, 10, 230)} size={84} />
                <span style={{fontFamily: DISPLAY, fontWeight: 700, fontSize: 92, letterSpacing: '-0.02em', textTransform: 'uppercase', color: on ? C.mint : '#fff', textShadow: '0 5px 0 rgba(6,10,16,0.65), 0 0 34px rgba(6,10,16,0.85)', whiteSpace: 'nowrap'}}>{l.label}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
};

// Screen light at the moment the clone is pulled into it
export const ScreenFlash: React.FC = () => {
  const frame = useCurrentFrame();
  const a = interpolate(frame, [224, 232, 244], [0, 0.85, 0], {...CLAMP, easing: EASE_OUT});
  return <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(60% 45% at 50% 50%, #BFFBEA, rgba(95,227,193,0.5) 60%, transparent 100%)', opacity: a}} />;
};

export const hookSfx: Sfx[] = [
  {name: 'sparkles', at: 26, vol: 0.28},
  {name: 'swoosh-up', at: 42, vol: 0.2},
  {name: 'impact', at: HOOK_T.clone + 12, vol: 0.2},
  {name: 'pop-high', at: HOOK_T.script - 1, vol: 0.24},
  {name: 'pop-high', at: HOOK_T.animations - 1, vol: 0.24},
  {name: 'pop-high', at: HOOK_T.editing - 1, vol: 0.24},
  {name: 'tick', at: HOOK_T.script + 4, vol: 0.2},
  {name: 'tick', at: HOOK_T.animations + 4, vol: 0.2},
  {name: 'tick', at: HOOK_T.editing + 4, vol: 0.2},
  {name: 'stamp', at: HOOK_T.thing - 1, vol: 0.2},
  {name: 'riser', at: 150, vol: 0.13},
  {name: 'whoosh', at: 204, vol: 0.2},
  {name: 'impact', at: 226, vol: 0.2},
];
