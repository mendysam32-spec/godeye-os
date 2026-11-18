// 9:16 reel "This voice is not me": one single shot. The hook studio (Atlas Cloud, Kling 3.0 Pro), the dive
// into the screen, the animated canvas timed word by word to the ElevenLabs voice (never cut), and the return to the studio that loops.
import {Audio, Video} from '@remotion/media';
import {AbsoluteFill, Img, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {CLAMP, cues, EASE_IN_OUT, EASE_OUT, fall, pop, rise} from './anim';
import {SECTIONS as S, type SectionId, TOTAL} from './data';
import {AppWindow, Backdrop, BOTTOM, C, Captions, envAt, Header, Mascot, ProgressBar, SceneFade, type Sfx, SH, SW} from './kit';
import {HOOK_T, HookFirstPage, hookSfx, HookText, ScreenFlash} from './scenes/Hook';
import {Cta, ctaSfx} from './scenes/Cta';
import {Recap, recapSfx} from './scenes/Recap';
import {Setting1, r1Sfx} from './scenes/Setting1';
import {Setting2, r2Sfx} from './scenes/Setting2';
import {Setting3, r3Sfx} from './scenes/Setting3';
import {Setting4, r4Sfx} from './scenes/Setting4';
import {Setting5, r5Sfx} from './scenes/Setting5';
import {Stakes, stakesSfx} from './scenes/Stakes';

// Monitor screen in the studio shot, measured on the Kling image
const MON = {x: 350, y: 488, w: 386, h: 713};
const S_MAX = SW / MON.w;

const DIVE_IN: [number, number] = [198, 232];
const END_HOLD = 30; // the keyword screen stays 1 s into the next sentence, long enough to read it
const OUT_AT = S.outro.from + END_HOLD;
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

const ON_COMPUTER = cues('r1')('computer', 2) - 2;
const AT_GUIDE = cues('cta')('Subscribe');
const FRAMES: {sec: SectionId; title: string; title2?: [number, string]; icon?: 'claude' | 'terminal' | 'plug' | 'file' | 'bot' | 'heart'; icon2?: 'file'}[] = [
  {sec: 'r1', title: 'claude.ai', title2: [ON_COMPUTER, 'Claude · on my Mac']},
  {sec: 'r2', title: 'Settings · Connectors', icon: 'plug'},
  {sec: 'r3', title: 'video-editing / SKILL.md', icon: 'file'},
  {sec: 'r4', title: 'CLAUDE.md', icon: 'file'},
  {sec: 'r5', title: 'Agents · reel in progress', icon: 'bot'},
  {sec: 'recap', title: 'Your Claude'},
  {sec: 'cta', title: 'Instagram · Your Name', title2: [AT_GUIDE, 'The guide'], icon: 'heart', icon2: 'file'},
];

// Each scene overlaps the next one: the last word of a setting (stamp, "your team") stays readable,
// then the window changes just after the next sentence starts. `start` = local frame where it appears, `extra` = hold.
const STAGES: {sec: SectionId; C: React.FC; start: number; extra: number}[] = [
  {sec: 'r1', C: Setting1, start: 0, extra: 10},
  {sec: 'r2', C: Setting2, start: 6, extra: 10},
  {sec: 'r3', C: Setting3, start: 6, extra: 10},
  {sec: 'r4', C: Setting4, start: 6, extra: 10},
  {sec: 'r5', C: Setting5, start: 6, extra: 10},
  {sec: 'recap', C: Recap, start: 6, extra: 16},
  {sec: 'cta', C: Cta, start: 12, extra: END_HOLD + 24},
];
const secLen = (sec: SectionId) => S[sec].to - S[sec].from;
const stageDur = (i: number) => secLen(STAGES[i].sec) + STAGES[i].extra;
// a header stays until the next one appears
const headerDur = (i: number) => secLen(STAGES[i].sec) + (STAGES[i + 1]?.start ?? STAGES[i].extra);

const HEADERS: {sec: SectionId; n: number | 'check' | 'file'; kicker: string; before: string; word: string; size?: number; titleAt?: number}[] = [
  {sec: 'r1', n: 1, kicker: 'IT ACTS', before: 'The app on your', word: 'computer', size: 56},
  {sec: 'r2', n: 2, kicker: 'IT CONNECTS', before: 'The', word: 'connectors'},
  {sec: 'r3', n: 3, kicker: 'IT LEARNS', before: 'The', word: 'skills'},
  {sec: 'r4', n: 4, kicker: 'IT REMEMBERS', before: 'The', word: 'instructions'},
  {sec: 'r5', n: 5, kicker: 'IT MULTIPLIES', before: 'Parallel', word: 'agents', size: 62, titleAt: cues('r5')('agents') - 2},
  {sec: 'recap', n: 'check', kicker: 'RECAP', before: 'The 5', word: 'settings'},
  {sec: 'cta', n: 'file', kicker: 'THE 5 SETTINGS GUIDE', before: 'Keyword', word: 'SETTINGS'},
];

// Title of the single window, based on the scene on screen
const windowHead = (f: number) => {
  let cur = FRAMES[0];
  FRAMES.forEach((w, i) => {
    if (f >= S[w.sec].from + STAGES[i].start + 4) {
      cur = w;
    }
  });
  const later = cur.title2 && f >= S[cur.sec].from + cur.title2[0];
  return {title: later && cur.title2 ? cur.title2[1] : cur.title, icon: later && cur.icon2 ? cur.icon2 : cur.icon};
};

// Presenter mascot: arrives when the two cards fade out ("And for that"), talks with the voice, hops at each new setting
const Presenter: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = pop(frame, S.stakes.from + 200, 30, 11, 170);
  const hops = [S.r1.from, S.r2.from, S.r3.from, S.r4.from, S.r5.from, S.recap.from, S.cta.from];
  let lift = 0;
  hops.forEach((h) => {
    const t = frame - h;
    if (t >= 0 && t < 16) {
      lift = Math.max(lift, Math.sin((t / 16) * Math.PI) * 34);
    }
  });
  const happy = frame >= S.recap.from + 100 || [S.r1, S.r2, S.r3, S.r4, S.r5].some((s) => frame >= s.to - 34 && frame < s.to);
  const leave = fall(frame, OUT_AT + 4, 8); // fades out before crossing the captions during the return to the studio
  if (frame < S.stakes.from + 196) {
    return null;
  }
  return (
    <Mascot
      x={BOTTOM.x}
      feet={BOTTOM.feet - lift + (1 - enter) * 280}
      h={BOTTOM.h}
      voice={envAt(frame)}
      mood={happy ? 'happy' : 'idle'}
      look={[0, -0.5]}
      seed={3}
      opacity={Math.min(1, enter * 2) * leave}
    />
  );
};

const progress = (f: number) => (['r1', 'r2', 'r3', 'r4', 'r5'] as const).map((k) => interpolate(f, [S[k].from, S[k].to], [0, 1], CLAMP));

// The canvas: everything that lives "inside the screen"
const Canvas: React.FC = () => {
  const frame = useCurrentFrame();
  const inWin = frame >= S.r1.from && frame < OUT_AT + 38;
  const winK = pop(frame, S.r1.from - 4, 30, 14, 170);
  const winOut = fall(frame, OUT_AT + 4, 16);
  const barK = frame >= S.r1.from - 2 ? 1 : 0;
  const head = windowHead(frame);
  // big mascot that appears on "Claude" during the dive
  const big = pop(frame, HOOK_T.claude + 8, 30, 12, 160);
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
              <Header n={h.n} kicker={h.kicker} before={h.before} word={h.word} size={h.size} at={st.start} titleAt={h.titleAt} />
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

// The world: the studio video and, inside its screen, the canvas
const World: React.FC = () => {
  const frame = useCurrentFrame();
  const s = zoomAt(frame);
  const k = (s - 1) / (S_MAX - 1);
  const cx = MON.x + MON.w / 2;
  const cy = MON.y + MON.h / 2;
  const tx = interpolate(k, [0, 1], [cx, SW / 2]) - cx * s;
  const ty = interpolate(k, [0, 1], [cy, SH / 2]) - cy * s;
  const inHook = frame < S.stakes.from;
  // the screen lights up when the clone is pulled into it; at the end it turns off to match the first frame exactly
  const screen = inHook ? interpolate(frame, [210, 226], [0, 1], {...CLAMP, easing: EASE_OUT}) : interpolate(frame, [OUT_END - 22, OUT_END - 2], [1, 0], CLAMP);
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: SW, height: SH, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${s})`}}>
      {inHook ? <Video src={staticFile('reel/hook.mp4')} muted style={{position: 'absolute', left: 0, top: 0, width: SW, height: SH}} /> : <Img src={staticFile('reel/empty_studio.jpg')} style={{position: 'absolute', left: 0, top: 0, width: SW, height: SH}} />}
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
  ...r1Sfx.map((x) => ({...x, at: x.at + S.r1.from})),
  ...r2Sfx.map((x) => ({...x, at: x.at + S.r2.from})),
  ...r3Sfx.map((x) => ({...x, at: x.at + S.r3.from})),
  ...r4Sfx.map((x) => ({...x, at: x.at + S.r4.from})),
  ...r5Sfx.map((x) => ({...x, at: x.at + S.r5.from})),
  ...recapSfx.map((x) => ({...x, at: x.at + S.recap.from})),
  ...ctaSfx.map((x) => ({...x, at: x.at + S.cta.from})),
  // setting change: a whoosh at each new section
  ...STAGES.map((st) => ({name: 'whoosh-short', at: S[st.sec].from + st.start, vol: 0.18})),
  {name: 'whoosh', at: OUT_AT + 18, vol: 0.2},
  {name: 'power-off', at: OUT_END - 16, vol: 0.14},
];

// Sound effects kept a bit back: the voice stays at least 10 dB above them (checked on the final mix)
const SFX_GAIN = 0.8;

// Music very low under the voice (rule: 0.05 as soon as the voice comes back after the intro)
const SOFT: [number, number][] = [[0, 0.15], [S.stakes.from - 6, 0.17], [S.stakes.from + 10, 0.05], [TOTAL - 10, 0.05], [TOTAL, 0.15]];
const level = (keys: [number, number][]) => (f: number) => interpolate(f, keys.map((k) => k[0]), keys.map((k) => k[1]), CLAMP);

const Soundtrack: React.FC = () => (
  <>
    <Audio name="ElevenLabs voice" src={staticFile('reel/voice.wav')} />
    <Audio name="Soft music" src={staticFile('music/soft.wav')} volume={level(SOFT)} />
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

// Reel cover: the seated clone and the hook
export const Cover: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: C.bg}}>
    <Img src={staticFile('reel/clone.jpg')} style={{position: 'absolute', left: 0, top: 0, width: SW, height: SH}} />
    <HookFirstPage allSaid />
  </AbsoluteFill>
);
