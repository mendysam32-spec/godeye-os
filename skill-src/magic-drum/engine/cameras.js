// Camera rig: character-framed shot presets + moves + handheld shake.
// Poses are computed per-frame from live character positions, so a shot keeps
// its framing while the target walks (stateless → resume-safe).
import * as THREE from 'three';
import { lerp, clamp, seg, easeIO, smoothNoise, deg } from './props.js';

export const PRESETS = {
  wide:   { d: 6.2, h: 1.75, fov: 42, lookOff: -0.35 },
  full:   { d: 4.4, h: 1.55, fov: 38, lookOff: -0.2 },
  medium: { d: 3.0, h: 1.5,  fov: 33, lookOff: -0.05 },
  close:  { d: 1.7, h: 1.5,  fov: 30, lookOff: 0 },
  ecu:    { d: 0.95, h: 1.52, fov: 26, lookOff: 0 },
  two:    { d: 0,   h: 1.45, fov: 36, lookOff: -0.15, two: true },
  ots:    { d: 0,   h: 1.5,  fov: 32, lookOff: 0, ots: true },
  insert: { d: 0.8, h: 1.0,  fov: 30, lookOff: 0, insert: true },
  low:    { d: 2.3, h: 0.55, fov: 36, lookOff: 0.15 },
  high:   { d: 3.6, h: 3.4,  fov: 40, lookOff: -0.6 },
};

const Y = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _dir = new THREE.Vector3(),
  _side = new THREE.Vector3(), _pos = new THREE.Vector3(), _look = new THREE.Vector3();

function headsOf(chars) {
  return chars.map((c) => c.headWorld());
}

export function cameraPose(shot, t, chars, anchors, shotIndex = 0) {
  const t0 = shot.at ? shot.at[0] : 0;
  const t1 = shot.at ? shot.at[1] : 1e9;
  const k = seg(t, t0, t1);
  const ke = easeIO(k);
  const cam = typeof shot.cam === 'string' ? (PRESETS[shot.cam] || PRESETS.medium) : Object.assign({}, PRESETS.medium, shot.cam || {});
  const who = shot.who;
  let targets;
  if (Array.isArray(who)) targets = who.map((n) => chars.find((c) => c.name === n)).filter(Boolean);
  else {
    const c = chars.find((x) => x.name === who);
    targets = c ? [c] : [];
  }
  if (!targets.length) targets = chars.slice(0, 1);

  const mv = shot.move || null;
  const distMul = mv && mv.type === 'dolly' ? lerp(mv.from ?? 1, mv.to ?? 0.8, ke) : 1;
  const hOff = mv && mv.type === 'crane' ? lerp(mv.from ?? 0, mv.to ?? 0.8, ke) : 0;
  const fov = shot.fov || cam.fov;

  const pos = _pos, look = _look;
  let handheldSeed = shotIndex * 3.7 + 1.3;

  if (cam.insert) {
    const key = (Array.isArray(who) ? who[0] : who) || Object.keys(anchors)[0];
    const a = anchors[key] || anchors[Object.keys(anchors)[0]];
    look.set(a[0], a[1], a[2]);
    const baseYaw = deg(shot.angle ?? 35);
    _dir.set(Math.sin(baseYaw), 0.55, Math.cos(baseYaw)).normalize();
    const d = (shot.d || cam.d) * distMul;
    pos.copy(look).addScaledVector(_dir, d);
    pos.y = look.y + d * 0.55;
  } else if (cam.two && targets.length >= 2) {
    const [h1, h2] = headsOf(targets.slice(0, 2));
    _a.set(h1.x, 0, h1.z); _b.set(h2.x, 0, h2.z);
    const sep = _a.distanceTo(_b);
    look.set((h1.x + h2.x) / 2, (h1.y + h2.y) / 2 + cam.lookOff, (h1.z + h2.z) / 2);
    _dir.subVectors(_b, _a); _dir.y = 0;
    if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, 1); else _dir.normalize();
    _side.set(_dir.z, 0, -_dir.x);
    if (_side.z < 0) _side.negate();               // prefer camera on the +Z side
    const d = clamp(sep * 1.4 + 1.15, 2.4, 6.5) * distMul;
    pos.copy(look).addScaledVector(_side, d);
    pos.y = cam.h + hOff;
  } else if (cam.ots && targets.length >= 1) {
    const watcher = targets[0];
    // other = nearest other visible character
    let other = null, best = 1e9;
    const hw = watcher.headWorld();
    for (const c of chars) {
      if (c === watcher || !c.root.visible) continue;
      const d2 = c.headWorld().distanceTo(hw);
      if (d2 < best) { best = d2; other = c; }
    }
    const oh = other ? other.headWorld() : hw;
    look.set(oh.x, oh.y + cam.lookOff, oh.z);
    _dir.set(oh.x - hw.x, 0, oh.z - hw.z);
    if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, 1); else _dir.normalize();
    _side.set(_dir.z, 0, -_dir.x);
    if (_side.z < 0) _side.negate();
    pos.set(hw.x, hw.y + 0.12, hw.z).addScaledVector(_dir, -0.85).addScaledVector(_side, 0.4);
  } else {
    const c = targets[0];
    const head = c.headWorld();
    // frontal base direction = character's current facing
    const ry = c.root.rotation.y + deg(shot.angle ?? 0);
    _dir.set(Math.sin(ry), 0, Math.cos(ry));
    if (mv && mv.type === 'orbit') {
      const rot = ke * (mv.amt ?? Math.PI * 0.7);
      _dir.applyAxisAngle(Y, -rot);
    } else if (mv && mv.type === 'pan') {
      const rot = (ke - 0.5) * (mv.amt ?? deg(30)) * 2;
      _dir.applyAxisAngle(Y, -rot);
    }
    const d = (shot.d || cam.d) * distMul;
    pos.set(head.x + _dir.x * d, cam.h + hOff, head.z + _dir.z * d);
    look.set(head.x, head.y + (shot.lookY ?? cam.lookOff), head.z);
  }

  // handheld shake (also gives static shots a living feel when amt > 0)
  const hh = shot.handheld ?? 0;
  if (hh > 0) {
    pos.x += smoothNoise(t * 1.35, handheldSeed) * 0.09 * hh;
    pos.y += smoothNoise(t * 1.7, handheldSeed + 5) * 0.05 * hh;
    pos.z += smoothNoise(t * 1.15, handheldSeed + 9) * 0.09 * hh;
    look.x += smoothNoise(t * 1.1, handheldSeed + 13) * 0.05 * hh;
    look.y += smoothNoise(t * 1.5, handheldSeed + 17) * 0.03 * hh;
  }

  return { pos: pos.clone(), look: look.clone(), fov };
}
