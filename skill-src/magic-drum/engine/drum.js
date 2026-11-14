// Magic Drum engine — parses window.SPEC / window.SPEECH (written by build.py),
// builds the world once, then exposes:
//   window.READY      — true when everything built
//   window.META       — { dur, fps, frames, w, h, cuts, events, steps }
//   window.renderAt(i) — renders frame i (t = i / fps) and returns a JPEG data URL
// All motion is a pure function of absolute time, so any frame can be rendered
// in any order (parallel workers, resume) with identical results.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Character } from './chars.js';
import { buildScene } from './scenes.js';
import { cameraPose } from './cameras.js';
import { createPost, applyGrade } from './grade.js';
import { stepTimes } from './chars.js';
import { clamp, seg, lerp, mulberry32 } from './props.js';

const SPEC = window.SPEC || {};
const SPEECH = window.SPEECH || { lines: [] };
const style = SPEC.style || {};
const MODE = style.mode === 'toon' ? 'toon' : 'pbr';
const FPS = style.fps || 24;
const SIZE = style.size || [1280, 720];
const W = SIZE[0], H = SIZE[1];
const DT = 1 / FPS;

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H, false);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, W / H, 0.05, 200);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

/* ------------------------------ speech utils ----------------------------- */

const VMAP = { a: 'aa', e: 'ee', i: 'ih', o: 'oh', u: 'ou', y: 'ih' };
function wordVisemes(word) {
  const letters = String(word).toLowerCase().replace(/[^a-z]/g, '');
  const out = [];
  let cur = 'kk';
  for (const ch of letters) {
    if (VMAP[ch]) { out.push(VMAP[ch]); cur = VMAP[ch]; }
    else if ('mbp'.includes(ch)) out.push('mbp');
    else if ('fv'.includes(ch)) out.push('fv');
    else if (ch === 's' || ch === 'z' || ch === 'c') out.push('ss');
    else if (ch === 't' || ch === 'd' || ch === 'n' || ch === 'l' || ch === 'j') out.push('nn');
    else if (ch === 'k' || ch === 'g' || ch === 'q' || ch === 'x') out.push('kk');
    else if (ch === 'r' || ch === 'w') out.push(cur === 'kk' ? 'oh' : cur);
    else if (ch === 'h') out.push(cur);
    else out.push('kk');
  }
  if (!out.length) out.push('aa');
  return out;
}

const speech = (SPEECH.lines || []).slice().sort((a, b) => a.t0 - b.t0);
for (const l of speech) {
  l.sub = [];
  for (const cue of l.cues || []) {
    const [ct, cd, w] = cue;
    const vs = wordVisemes(w);
    const n = vs.length;
    for (let i = 0; i < n; i++) l.sub.push([ct + (cd * i) / n, vs[i]]);
  }
  l.sub.sort((a, b) => a[0] - b[0]);
}
function visemeAt(l, t) {
  if (!l || !l.sub || !l.sub.length) return 'sil';
  let best = 'sil';
  for (const s of l.sub) { if (s[0] <= t + 0.02) best = s[1]; else break; }
  return best;
}
function energyAt(l, t) {
  if (!l || !l.env || !l.env.length) return 0.55;
  const i = Math.round((t - l.t0) * FPS);
  return clamp((l.env[Math.max(0, Math.min(l.env.length - 1, i))] ?? 0) / 100, 0, 1);
}
function lineAt(t, name) {
  for (const l of speech) if (l.who === name && t >= l.t0 && t < l.t1) return l;
  return null;
}

/* --------------------------------- build --------------------------------- */

const SCENES = (SPEC.scenes && SPEC.scenes.length ? SPEC.scenes : [{ type: 'street', from: 0, to: 1e9, cast: {} }])
  .map((s) => {
    const built = buildScene(s.type || 'street', MODE, s.params || {});
    built.group.visible = false;
    scene.add(built.group);
    return { spec: s, built };
  });

const cast = (SPEC.cast || []).map((c, i) => {
  const ch = new Character(c, MODE, i + 1);
  ch.root.visible = false;
  scene.add(ch.root);
  return ch;
});
const byName = {};
for (const ch of cast) byName[ch.name] = ch;

const shots = ((SPEC.shots && SPEC.shots.length) ? SPEC.shots : [{ at: [0, 1e9], cam: 'medium', who: cast[0] && cast[0].name }])
  .slice().sort((a, b) => a.at[0] - b.at[0]);
const moves = SPEC.moves || [];
const sits = SPEC.sits || [];

function activeScene(t) {
  for (const s of SCENES) {
    const a = s.spec.from ?? 0, b = s.spec.to ?? 1e9;
    if (t >= a && t < b) return s;
  }
  return SCENES[SCENES.length - 1];
}
function activeShot(t) {
  let cur = null;
  for (const s of shots) {
    if (t >= s.at[0] && t < s.at[1]) return s;
    if (s.at[0] <= t) cur = s;
  }
  return cur || shots[0];
}
function activeMove(t, name) {
  for (const m of moves) if (m.who === name && t >= m.at[0] && t < m.at[1]) return m;
  return null;
}
function activeSit(t, name, anchors) {
  for (const s of sits) {
    if (s.who !== name) continue;
    const a = s.at || [0, 1e9];
    if (t >= a[0] && t < a[1]) {
      const key = s.seat || 'chair1';
      const p = anchors ? anchors[key] : null;
      return p ? p[1] : null;
    }
  }
  return null;
}

/* --------------------------------- frame --------------------------------- */

function frame(t, fi) {
  const sc = activeScene(t);
  for (const s of SCENES) s.built.group.visible = (s === sc);
  scene.fog = sc.built.fog || null;

  let speaker = null;
  for (const ch of cast) {
    ch._line = lineAt(t, ch.name);
    if (ch._line) speaker = ch;
  }

  for (const ch of cast) {
    const entry = (sc.spec.cast || {})[ch.name];
    if (!entry) { ch.root.visible = false; continue; }
    const p = Array.isArray(entry) ? entry : [0, 0];
    const mv = activeMove(t, ch.name);
    if (!mv) {
      ch.root.position.x = p[0];
      ch.root.position.z = p[1];
    }
    ch.root.visible = true;
    ch._base = p;
    ch._baseFacing = p[2] !== undefined ? p[2] : (ch.spec.facing ?? 0);
    const sitY = mv ? null : activeSit(t, ch.name, sc.built.anchors);
    // auto-look: speaker looks at the nearest other visible char; others look at speaker
    let lookAt = null;
    if (mv) lookAt = null;
    else if (ch._line) {
      let best = null, bd = 1e9;
      const hw = ch.headWorld();
      for (const o of cast) {
        if (o === ch || !o.root.visible) continue;
        const d = o.headWorld().distanceTo(hw);
        if (d < bd) { bd = d; best = o; }
      }
      if (best && bd < 6) lookAt = best.headWorld();
    } else if (speaker && speaker !== ch && speaker.root.visible) {
      const sw = speaker.headWorld();
      const me = ch.headWorld();
      if (sw.distanceTo(me) < 6) lookAt = sw;
    }
    // gestures attached to the active line
    const gestures = [];
    if (ch._line && ch._line.gestures) {
      for (const g of ch._line.gestures) {
        const gt = ch._line.t0 + (g.at ?? 0);
        const gd = g.dur ?? 1.2;
        const k = seg(t, gt, gt + gd);
        if (k > 0) gestures.push(Object.assign({}, g, { k }));
      }
    }
    ch.update({
      t, dt: DT,
      move: mv ? { from: mv.from, to: mv.to, t0: mv.at[0], t1: mv.at[1], style: mv.style || 'walk' } : null,
      base: ch._base, baseFacing: ch._baseFacing, sit: sitY,
      talking: ch._line ? { energy: energyAt(ch._line, t), viseme: visemeAt(ch._line, t), emotion: ch._line.emotion || 'neutral' } : null,
      gestures, lookAt,
    });
  }

  sc.built.update(t);

  // camera
  const shot = activeShot(t);
  const idx = shots.indexOf(shot);
  const pose = cameraPose(shot, t, cast, sc.built.anchors, idx);
  const b = sc.built.bounds;
  if (b) {
    pose.pos.x = clamp(pose.pos.x, b.x[0], b.x[1]);
    pose.pos.z = clamp(pose.pos.z, b.z[0], b.z[1]);
    pose.pos.y = clamp(pose.pos.y, b.y[0], b.y[1]);
  }
  pose.pos.y = Math.max(pose.pos.y, 0.22);
  camera.position.copy(pose.pos);
  camera.lookAt(pose.look);
  if (Math.abs(camera.fov - pose.fov) > 1e-3) { camera.fov = pose.fov; camera.updateProjectionMatrix(); }
  return pose;
}

/* --------------------------------- META ---------------------------------- */

const cutSet = new Set();
for (const s of SCENES) cutSet.add(s.spec.from ?? 0);
for (const s of shots) cutSet.add(s.at[0]);
const cuts = [...cutSet].sort((a, b) => a - b).filter((x) => x > 0.01);

const events = [];
for (const mv of moves) {
  for (const st of stepTimes({ from: mv.from, to: mv.to, t0: mv.at[0], t1: mv.at[1], style: mv.style }, byName[mv.who] ? byName[mv.who].kind : 'human')) {
    events.push({ t: Math.round(st.t * 1000) / 1000, kind: 'step', who: mv.who });
  }
}
for (const c of cuts) events.push({ t: Math.round(c * 1000) / 1000, kind: 'whoosh' });
for (const s of SPEC.sfx || []) events.push({ t: s.t, kind: s.kind, gain: s.gain });
events.sort((a, b) => a.t - b.t);

let dur = 0;
for (const s of SCENES) dur = Math.max(dur, s.spec.to ?? 0);
for (const s of shots) dur = Math.max(dur, s.at ? s.at[1] : 0);
for (const l of speech) dur = Math.max(dur, l.t1 || l.t0);
dur = Math.min(dur + (style.tail ?? 0.8), dur + 3);

const META = {
  dur: Math.round(dur * 1000) / 1000,
  fps: FPS,
  frames: Math.max(1, Math.round(dur * FPS)),
  w: W, h: H,
  cuts,
  events,
  mode: MODE,
};
window.META = META;

/* -------------------------------- renderAt -------------------------------- */

const post = createPost(renderer, scene, camera, style);

function renderAt(i) {
  const t = i / FPS + 1e-6;
  frame(t, i);
  post.renderFrame(i);
  return canvas.toDataURL('image/jpeg', 0.9);
}
window.renderAt = renderAt;
window.__md = { chars: cast, scenes: SCENES, camera };

// warm-up frame (shader compile) so the first real frame is clean
frame(0.0001, 0);
post.renderFrame(0);
window.READY = true;
