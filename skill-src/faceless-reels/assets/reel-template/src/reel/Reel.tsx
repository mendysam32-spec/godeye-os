// 9:16 reel in a single shot: the hook studio, the dive into the screen, the animated canvas timed word by word to the
// ElevenLabs voice (never cut), and the return to the studio that loops back to the first frame.
// This file does not change from one reel to the next: the content comes from reel.json and scenes/index.tsx.
import {Audio, Video} from '@remotion/media';
import {AbsoluteFill, Img, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {CLAMP, EASE_IN_OUT, EASE_OUT, fall, pop, rise} from './anim';
import {CONFIG, ELEMENTS, SECTIONS as S, type SectionId, TOTAL} from './data';
import {labels} from './labels';
import {AppWindow, Backdrop, BOTTOM, C, Captions, envAt, Header, type IconName, Mascot, ProgressBar, SceneFade, type Sfx, SH, SW} from './kit';
import {HookFirstPage, hookSfx, HookText, ScreenFlash} from './scenes/Hook';
import {CtaGuide, ctaSfx} from './scenes/CtaGuide';
import {Stakes, stakesSfx} from './scenes/Stakes';
import {SCENES} from './scenes/index';
import {Recap, recapSfx} from './scenes/Recap';

// Monitor screen in the studio shot, measured on empty_studio.jpg. Measure it again if the studio image changes.
const MON = {x: 350, y: 488, w: 386, h: 713};
const S_MAX = SW / MON.w;

const DIVE_IN: [number, number] = [S.stakes.from - 36, S.stakes.from - 2];
// the keyword screen holds for about 1 s into the last sentence, long enough to read it
const OUTRO_HOLD = 22;
const OUT_AT = S.outro.from + OUTRO_HOLD;
const OUT_END = TOTAL - 8;

const zoomAt = (f: number) => {
  if (f < DIVE_IN[0]) {
    return interpolate(f, [0, DIVE_IN[0]], [1, 1.14], CLAMP);
  }
  if (f < S.stakes.from) {
    return interpolate(f, DIVE_IN, [1.14, S_MAX], {...CLAMP, easing: EASE_IN_OUT});
  }
  if (f < OUT_AT) {
    return S_MAX;
  }
  return interpolate(f, [OUT_AT, OUT_END], [S_MAX, 1], {...CLAMP, easing: EASE_IN_OUT});
};

// Each scene overlaps the next one: the last word of an element stays readable, then the window changes just after
// the start of the next sentence. `start` = local frame where it appears, `extra` = hold.
type Stage = {sec: SectionId; C: React.FC; start: number; extra: number; title: string; icon: 'claude' | IconName};
const STAGES: Stage[] = [
  ...ELEMENTS.map((sec, i) => ({sec, C: SCENES[i].C, start: i === 0 ? 0 : 6, extra: 10, title: CONFIG.headers[i].window, icon: CONFIG.headers[i].icon ?? 'file'})),
  {sec: 'recap', C: Recap, start: 6, extra: 16, title: CONFIG.overview.window, icon: CONFIG.overview.icon ?? 'check'},
  {sec: 'cta', C: CtaGuide, start: 12, extra: OUTRO_HOLD + 24, title: labels().guide, icon: 'file'},
];
const secLen = (sec: SectionId) => S[sec].to - S[sec].from;
const stageDur = (i: number) => secLen(STAGES[i].sec) + STAGES[i].extra;
// a header stays until the next one appears
const headerDur = (i: number) => secLen(STAGES[i].sec) + (STAGES[i + 1]?.start ?? STAGES[i].extra);

const HEADERS: {sec: SectionId; n: number | 'check' | 'file'; kicker: string; before: string; word: string; size?: number}[] = [
  ...ELEMENTS.map((sec, i) => ({sec, n: i + 1, kicker: CONFIG.headers[i].kicker, before: CONFIG.headers[i].before, word: CONFIG.headers[i].word, size: CONFIG.headers[i].size})),
  {sec: 'recap', n: 'check', kicker: CONFIG.overview.kicker, before: CONFIG.overview.before, word: CONFIG.overview.word, size: CONFIG.overview.size},
  {sec: 'cta', n: 'file', kicker: CONFIG.guide.title.toUpperCase(), before: labels().keywordTitle, word: CONFIG.guide.keyword, size: 62},
];

// Title of the single window, depending on the scene on screen
const windowHead = (f: number) => {
  let cur = STAGES[0];
  STAGES.forEach((st) => {
    if (f >= S[st.sec].from + st.start + 4) {
      cur = st;
    }
  });
  return {title: cur.title, icon: cur.icon};
};

// Presenter mascot: it arrives just before the first element, talks with the voice, hops at each new element
const Presenter: React.FC = () => {
  const frame = useCurrentFrame();
  const enterAt = S[ELEMENTS[0]].from - 60;
  const enter = pop(frame, enterAt, 30, 11, 170);
  const hops = [...ELEMENTS.map((e) => S[e].from), S.recap.from, S.cta.from];
  let lift = 0;
  hops.forEach((h) => {
    const t = frame - h;
    if (t >= 0 && t < 16) {
      lift = Math.max(lift, Math.sin((t / 16) * Math.PI) * 34);
    }
  });
  const happy = frame >= S.recap.from + 100 || ELEMENTS.some((e) => frame >= S[e].to - 34 && frame < S[e].to);
  const leave = fall(frame, OUT_AT + 4, 8); // it fades out before crossing the captions during the return to the studio
  if (frame < enterAt - 4) {
    return null;
  }
  return (
    <Mascot x={BOTTOM.x} feet={BOTTOM.feet - lift + (1 - enter) * 280} h={BOTTOM.h} voice={envAt(frame)} mood={happy ? 'happy' : 'idle'} look={[0, -0.5]} seed={3} opacity={Math.min(1, enter * 2) * leave} />
  );
};

const progress = (f: number) => ELEMENTS.map((k) => interpolate(f, [S[k].from, S[k].to], [0, 1], CLAMP));

// The canvas: everything that lives "inside the screen"
const Canvas: React.FC = () => {
  const frame = useCurrentFrame();
  const first = S[ELEMENTS[0]];
  const inWin = frame >= first.from && frame < OUT_AT + 38;
  const winK = pop(frame, first.from - 4, 30, 14, 170);
  const winOut = fall(frame, OUT_AT + 4, 16);
  const barK = frame >= first.from - 2 ? 1 : 0;
  const head = windowHead(frame);
  // big mascot that appears during the dive
  const big = pop(frame, DIVE_IN[0] + 8, 30, 12, 160);
  return (
    <AbsoluteFill>
      <Backdrop />
      {frame < S.stakes.from ? <Mascot x={540} feet={1240} h={760} seed={1} voice={envAt(frame)} mood="happy" opacity={Math.min(1, big * 2)} scale={0.8 + 0.2 * big} /> : null}
      <Sequence from={S.stakes.from} durationInFrames={S.stakes.to - S.stakes.from} name="Stakes">
        <Stakes />
      </Sequence>
      {barK ? <ProgressBar fill={progress(frame)} opacity={winOut} /> : null}
      {STAGES.map((st, i) => {
        const h = HEADERS.find((x) => x.sec === st.sec);
        if (!h) {
          return null;
        }
        return (
          <Sequence key={`header-${st.sec}`} from={S[st.sec].from} durationInFrames={headerDur(i)} layout="none" name={`Header ${st.sec}`}>
            <div style={{opacity: st.sec === 'cta' ? winOut : 1}}>
              <Header n={h.n} kicker={h.kicker} before={h.before} word={h.word} size={h.size} at={st.start} />
            </div>
          </Sequence>
        );
      })}
      {inWin ? (
        <div style={{opacity: winOut}}>
          <AppWindow title={head.title} icon={head.icon} k={winK}>
            {STAGES.map((st, i) => (
              <Sequence key={st.sec} from={S[st.sec].from} durationInFrames={stageDur(i)} layout="none" name={st.sec}>
                <SceneFade start={st.start} dur={stageDur(i)}>
                  <st.C />
                </SceneFade>
              </Sequence>
            ))}
          </AppWindow>
        </div>
      ) : null}
      <Presenter />
    </AbsoluteFill>
  );
};

// The world: the studio shot and, inside its screen, the canvas
const World: React.FC = () => {
  const frame = useCurrentFrame();
  const s = zoomAt(frame);
  const k = (s - 1) / (S_MAX - 1);
  const cx = MON.x + MON.w / 2;
  const cy = MON.y + MON.h / 2;
  const tx = interpolate(k, [0, 1], [cx, SW / 2]) - cx * s;
  const ty = interpolate(k, [0, 1], [cy, SH / 2]) - cy * s;
  const inHook = frame < S.stakes.from;
  // the screen lights up during the dive; at the end it turns off to match the first frame exactly
  const screen = inHook ? interpolate(frame, [S.stakes.from - 24, S.stakes.from - 8], [0, 1], {...CLAMP, easing: EASE_OUT}) : interpolate(frame, [OUT_END - 22, OUT_END - 2], [1, 0], CLAMP);
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: SW, height: SH, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${s})`}}>
      {inHook && CONFIG.hook.video ? <Video src={staticFile('reel/hook.mp4')} muted style={{position: 'absolute', left: 0, top: 0, width: SW, height: SH}} /> : <Img src={staticFile('reel/empty_studio.jpg')} style={{position: 'absolute', left: 0, top: 0, width: SW, height: SH}} />}
      {screen > 0 ? (
        <div style={{position: 'absolute', left: MON.x, top: MON.y, width: MON.w, height: MON.h, overflow: 'hidden', background: C.bg, opacity: screen}}>
          <div style={{position: 'absolute', left: 0, top: (MON.h - SH / S_MAX) / 2, width: SW, height: SH, transformOrigin: '0 0', transform: `scale(${1 / S_MAX})`}}>
            <Canvas />
          </div>
        </div>
      ) : null}
    </div>
  );
};

const inWorld = (f: number) => f < S.stakes.from || f >= OUT_AT;

const ALL_SFX: Sfx[] = [
  ...hookSfx,
  ...stakesSfx.map((x) => ({...x, at: x.at + S.stakes.from})),
  ...SCENES.flatMap((sc, i) => sc.sfx.map((x) => ({...x, at: x.at + S[ELEMENTS[i]].from}))),
  ...recapSfx.map((x) => ({...x, at: x.at + S.recap.from})),
  ...ctaSfx.map((x) => ({...x, at: x.at + S.cta.from})),
  // element change: a whoosh at each new section
  ...STAGES.map((st) => ({name: 'whoosh-short', at: S[st.sec].from + st.start, vol: 0.18})),
  {name: 'whoosh', at: OUT_AT + 18, vol: 0.08},
  {name: 'power-off', at: OUT_END - 16, vol: 0.06},
];

// Sound effects slightly back: the voice stays at least 10 dB above them (checked on the final mix)
const SFX_GAIN = 0.8;

// Music very low under the voice (0.05 as soon as the voice resumes after the hook)
const MUSIC: [number, number][] = [[0, 0.15], [S.stakes.from - 6, 0.17], [S.stakes.from + 10, 0.05], [TOTAL - 10, 0.05], [TOTAL, 0.15]];
const level = (keys: [number, number][]) => (f: number) => interpolate(f, keys.map((k) => k[0]), keys.map((k) => k[1]), CLAMP);

const Soundtrack: React.FC = () => (
  <>
    <Audio name="ElevenLabs voice" src={staticFile('reel/voice.wav')} />
    <Audio name="Soft music" src={staticFile('music/soft.wav')} volume={level(MUSIC)} />
    {ALL_SFX.filter((s) => s.at >= 0 && s.at < TOTAL).map((s, i) => (
      <Sequence key={`sfx-${s.name}-${s.at}-${i}`} from={s.at} durationInFrames={Math.min(TOTAL - s.at, 110)} layout="none" name={`Sfx ${s.name}`}>
        <Audio src={staticFile(`sfx/${s.name}.wav`)} volume={s.vol * SFX_GAIN} />
      </Sequence>
    ))}
  </>
);

export const Reel: React.FC<{readonly audioOnly?: boolean}> = ({audioOnly = false}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{backgroundColor: audioOnly ? '#000' : C.bg}}>
      {audioOnly ? null : (
        <>
          {inWorld(frame) ? <World /> : <Canvas />}
          {frame < S.stakes.from + 12 ? <ScreenFlash /> : null}
          {frame < S.stakes.from ? <HookText /> : null}
          <Captions hideIn={[[0, S.stakes.from], [TOTAL - 2, TOTAL]]} />
          {/* the last frame becomes the first again: same shot, same text, the reel loops seamlessly */}
          {frame >= TOTAL - 8 ? (
            <AbsoluteFill style={{opacity: rise(frame, TOTAL - 8, 7)}}>
              <Img src={staticFile('reel/empty_studio.jpg')} style={{position: 'absolute', left: 0, top: 0, width: SW, height: SH}} />
              <HookFirstPage />
            </AbsoluteFill>
          ) : null}
        </>
      )}
      <Soundtrack />
    </AbsoluteFill>
  );
};
