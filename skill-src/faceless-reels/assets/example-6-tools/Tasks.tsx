// The 6 tasks of the reel and the proof for each. Everything shown is really used to make this reel.
import {useCurrentFrame} from 'remotion';
import {cues, pop, rise, typed} from '../anim';
import {SECTIONS} from '../data';
import {C, Check, DISPLAY, Icon, MONO, type Sfx, VoiceWave} from '../kit';
import {Band, type Task, Thumb, Trio, trioSfx} from './Trio';

const Skill: React.FC<{readonly at: number}> = ({at}) => {
  const f = useCurrentFrame();
  const lines = ['# My method', '1. Hook', '2. The elements', '3. Subscribe, link, keyword'];
  return (
    <Band k={pop(f, at, 30, 13, 200)}>
      <div style={{padding: '22px 30px', fontFamily: MONO, fontSize: 36, lineHeight: 1.5, color: '#fff'}}>
        <div style={{fontSize: 28, color: C.mint, marginBottom: 6}}>SKILL.md</div>
        {lines.map((l, i) => (
          <div key={l}>{typed(l, f, at + 6 + i * 10, 70)}</div>
        ))}
      </div>
    </Band>
  );
};

const Wave: React.FC<{readonly at: number}> = ({at}) => {
  const f = useCurrentFrame();
  return (
    <Band k={pop(f, at, 30, 13, 200)}>
      <VoiceWave abs={f + SECTIONS.e2.from} w={840} h={200} bars={40} style={{position: 'absolute', left: 30, top: 34}} />
      <div style={{position: 'absolute', left: 30, bottom: 16, fontFamily: MONO, fontWeight: 700, fontSize: 30, color: C.mint}}>Cloned voice</div>
    </Band>
  );
};

const Atlas: React.FC<{readonly at: number}> = ({at}) => {
  const f = useCurrentFrame();
  return (
    <Band k={pop(f, at, 30, 13, 200)}>
      <Thumb src="reel/atlas_image.jpg" tag="Image" k={pop(f, at + 4, 30, 12, 200)} x={40} />
      <div style={{position: 'absolute', left: 372, top: 112, opacity: rise(f, at + 12, 8)}}>
        <Icon name="zap" size={72} color={C.mint} />
      </div>
      <Thumb src="reel/atlas_video.jpg" tag="Video" k={pop(f, at + 16, 30, 12, 200)} x={476} />
    </Band>
  );
};

const Timeline: React.FC<{readonly at: number}> = ({at}) => {
  const f = useCurrentFrame();
  const c = cues('e4');
  const words = ['written', 'in', 'code', 'timed', 'to', 'every', 'word'];
  return (
    <Band k={pop(f, at, 30, 13, 200)}>
      <div style={{padding: '24px 28px', fontFamily: MONO, fontSize: 32, color: C.mint}}>{typed("pop(c('word'))", f, at + 4, 40)}</div>
      <div style={{position: 'absolute', left: 28, right: 28, top: 104, display: 'flex', flexWrap: 'wrap', gap: 12}}>
        {words.map((m, i) => {
          const a = c(m);
          const on = f >= a - 1;
          return <div key={`word-${i}`} style={{padding: '8px 18px', borderRadius: 14, fontFamily: DISPLAY, fontWeight: 700, fontSize: 40, background: on ? C.mint : 'rgba(255,255,255,0.08)', color: on ? C.bg : 'rgba(255,255,255,0.5)', scale: on ? 0.92 + 0.08 * pop(f, a - 1, 30, 12, 220) : 1}}>{m}</div>;
        })}
      </div>
    </Band>
  );
};

const Networks: React.FC<{readonly at: number}> = ({at}) => {
  const f = useCurrentFrame();
  const c = cues('e5');
  const q = c('Four');
  return (
    <Band k={pop(f, at, 30, 13, 200)}>
      <div style={{position: 'absolute', left: 30, top: 16, display: 'grid', gridTemplateColumns: '410px 410px', gap: 14}}>
        {['Instagram', 'TikTok', 'YouTube', 'Facebook'].map((n, i) => {
          const k = pop(f, q - 3 + i * 4, 30, 12, 220);
          return (
            <div key={n} style={{display: 'flex', alignItems: 'center', gap: 18, height: 86, padding: '0 24px', borderRadius: 18, background: 'rgba(255,255,255,0.07)', fontFamily: DISPLAY, fontWeight: 700, fontSize: 42, color: '#fff', scale: k, opacity: Math.min(1, k * 2)}}>
              <Check k={pop(f, q + 4 + i * 4, 30, 11, 220)} size={46} />
              {n}
            </div>
          );
        })}
      </div>
    </Band>
  );
};

const Night: React.FC<{readonly at: number}> = ({at}) => {
  const f = useCurrentFrame();
  const c = cues('e6');
  const n = c('night');
  const d = c('folder');
  return (
    <Band k={pop(f, at, 30, 13, 200)}>
      <div style={{position: 'absolute', left: 44, top: 50, fontFamily: MONO, fontWeight: 700, fontSize: 110, color: '#fff', opacity: rise(f, n - 8, 8)}}>00:00</div>
      <div style={{position: 'absolute', left: 44, top: 190, fontFamily: MONO, fontSize: 32, color: C.mint, opacity: rise(f, n, 8)}}>scheduled task</div>
      <div style={{position: 'absolute', left: 560, top: 50, scale: pop(f, d - 4, 30, 12, 200), opacity: rise(f, d - 4, 6)}}>
        <svg width={230} height={190} viewBox="0 0 24 20" fill="rgba(95,227,193,0.14)" stroke={C.mint} strokeWidth={1.4} strokeLinejoin="round"><path d="M2 3a1 1 0 0 1 1-1h6l2 3h10a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Z" /></svg>
      </div>
    </Band>
  );
};

const TASKS: Task[] = [
  {sec: 'e1', slots: [{word: 'blank', name: 'Blank page', icon: 'file', verdict: 'Evening lost', vword: 'lose'}, {word: 'chat', name: 'Regular chat', icon: 'message', verdict: 'Gets you by', vword: 'by'}, {word: 'Claude', name: 'Claude + skill', logo: 'claude'}], punch: 'follows', stamp: 'MY METHOD', proof: Skill},
  {sec: 'e2', slots: [{word: 'mic', name: 'On the mic', icon: 'refresh', verdict: 'Redo it', vword: 'mistake'}, {word: 'standard', name: 'Standard voice', icon: 'bot', verdict: 'Fine', vword: 'fine'}, {word: 'Eleven', name: 'ElevenLabs', logo: 'elevenlabs'}], punch: 'one', stamp: 'MY VOICE', proof: Wave},
  {sec: 'e3', slots: [{word: 'Stock', name: 'Stock photos', icon: 'image', verdict: 'Same ones', vword: 'same'}, {word: 'generator', name: 'Free generator', icon: 'sparkles', verdict: 'Gets you by', vword: 'by'}, {word: 'Atlas', name: 'Atlas Cloud', icon: 'video'}], punch: 'place', stamp: 'SAME PLACE', stampSize: 52, proof: Atlas},
  {sec: 'e4', slots: [{word: 'hand', name: 'By hand', icon: 'clock', verdict: 'Hours', vword: 'hours'}, {word: 'template', name: 'Ready-made template', icon: 'laptop', verdict: "It's quick", vword: 'quick'}, {word: 'Remotion', name: 'Remotion', icon: 'code'}], punch: 'word', stamp: 'EVERY WORD', proof: Timeline},
  {sec: 'e5', slots: [{word: 'Network', name: 'Network by network', icon: 'refresh', verdict: 'Takes forever', vword: 'forever'}, {word: 'Scheduling', name: 'By hand', icon: 'calendar', verdict: "It's okay", vword: 'okay'}, {word: 'Blotato', name: 'Blotato', icon: 'send'}], punch: 'action', stamp: 'ONE ACTION', stampSize: 44, stampTop: 590, proof: Networks},
  {sec: 'e6', slots: [{word: 'Launching', name: 'Launch it all', icon: 'pointer', verdict: 'Wears you out', vword: 'wears'}, {word: 'workflow', name: 'n8n workflow', icon: 'workflow', verdict: 'Very good', vword: 'very'}, {word: 'Claude', name: 'Claude Code', logo: 'claude'}], punch: 'checks', stamp: 'EVERY NIGHT', proof: Night, relaunch: {word: 'changes', text: 'Changes everything'}},
];

export const TASK_SCENES: {C: React.FC; sfx: Sfx[]}[] = TASKS.map((t) => ({C: () => <Trio t={t} />, sfx: trioSfx(t)}));
