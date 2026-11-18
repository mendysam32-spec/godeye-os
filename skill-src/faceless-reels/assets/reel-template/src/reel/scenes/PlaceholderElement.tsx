// Placeholder scene for an element: each sentence of the voice appears on a card, on its first word.
// It gives a complete animatic as soon as reel.json is written. Replace it with real scenes.
import {useCurrentFrame} from 'remotion';
import {phase, pop, rise} from '../anim';
import {SECTIONS, type SectionId, WORDS} from '../data';
import {BODY, C, cardStyle, Check, Mascot, type Sfx} from '../kit';

const sentences = (sec: SectionId) => {
  const s = SECTIONS[sec];
  const words = WORDS.filter((w) => w.f >= s.from && w.f < s.to);
  const out: {text: string; at: number}[] = [];
  let cur: typeof words = [];
  words.forEach((m) => {
    cur.push(m);
    if (/[.?!…]$/.test(m.t)) {
      out.push({text: cur.map((x) => x.t).join(' '), at: cur[0].f - s.from});
      cur = [];
    }
  });
  if (cur.length > 0) {
    out.push({text: cur.map((x) => x.t).join(' '), at: cur[0].f - s.from});
  }
  return out;
};

export const PlaceholderElement: React.FC<{readonly sec: SectionId}> = ({sec}) => {
  const frame = useCurrentFrame();
  const list = sentences(sec);
  const latest = list.map((p, i) => ({...p, end: i < list.length - 3 ? list[i + 3].at : 9999}));
  return (
    <div style={{position: 'absolute', left: 30, right: 30, top: 30, bottom: 30, display: 'flex', flexDirection: 'column', gap: 18}}>
      {latest
        .filter((p) => frame >= p.at - 2 && frame < p.end)
        .map((p) => {
          const k = pop(frame, p.at - 2, 30, 13, 190);
          return (
            <div key={p.text} style={{...cardStyle, display: 'flex', alignItems: 'center', gap: 22, padding: '20px 26px', fontFamily: BODY, fontWeight: 600, fontSize: 38, lineHeight: 1.2, color: C.text, opacity: Math.min(1, k * 2) * phase(frame, p.at - 2, p.end + 8, 6, 6), translate: `${(1 - k) * 50}px 0px`}}>
              <Check k={pop(frame, p.at + 6, 30, 11, 220)} size={44} />
              <span>{p.text}</span>
            </div>
          );
        })}
      <Mascot x={840} feet={690} h={150 * rise(frame, 0, 8)} seed={7} shadow={false} />
    </div>
  );
};

export const placeholderSfx = (sec: SectionId): Sfx[] => sentences(sec).map((p) => ({name: 'pop', at: p.at - 2, vol: 0.18}));
