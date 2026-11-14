// Procedural character rig: bipedal humans and critters with gait, idle,
// gesture clips, talk energy and full head/eye articulation.
import * as THREE from 'three';
import { mat, mesh, ball, capsule, box, cone, pivot, clamp, lerp, seg, easeIO, easeOut, smoothNoise, deg, mulberry32 } from './props.js';
import { Face } from './faces.js';

// Proportion presets (meters). h = total height.
const ARCH = {
  human: {
    h: 1.70, legLen: 0.78, hipY: 0.92, torsoLen: 0.52, torsoR: 0.155, headR: 0.105,
    armLen: 0.30, foreLen: 0.26, shoulderY: 0.40, shoulderX: 0.20, stride: 0.72,
    walkSpeed: 1.35, runSpeed: 3.0, headY: 0.66,
  },
  critter: {
    h: 1.22, legLen: 0.50, hipY: 0.62, torsoLen: 0.42, torsoR: 0.24, headR: 0.17,
    armLen: 0.22, foreLen: 0.18, shoulderY: 0.26, shoulderX: 0.24, stride: 0.5,
    walkSpeed: 1.1, runSpeed: 2.6, headY: 0.46,
  },
};

const PALETTES = {
  fox:   { fur: 0xd97b3f, belly: 0xf5e9d7, skin: 0xd97b3f, muzzle: 0xf5e9d7, nose: 0x24202a, iris: 0x7a5b2e, hair: 0x8c4a1f, clothes: 0x2e6f6a, accent: 0xe8b13a },
  cat:   { fur: 0x4d4a57, belly: 0xe8e4ef, skin: 0x4d4a57, muzzle: 0xe8e4ef, nose: 0x1d1d22, iris: 0x3f7f5c, hair: 0x35323c, clothes: 0x8c3b4a, accent: 0xe8b13a },
  bear:  { fur: 0x7a5636, belly: 0xc9a06b, skin: 0x7a5636, muzzle: 0xc9a06b, nose: 0x24202a, iris: 0x4a3520, hair: 0x5a3d24, clothes: 0x3e5c46, accent: 0xd9c37a },
  skater:{ fur: 0x8d8478, belly: 0xd9d4cb, skin: 0xc99a72, muzzle: 0xd9d4cb, nose: 0x24202a, iris: 0x33566b, hair: 0x2b2723, clothes: 0x31456b, accent: 0xd95d39 },
  mayor: { fur: 0x9aa0a6, belly: 0xdfe3e7, skin: 0xa0745a, muzzle: 0xdfe3e7, nose: 0x24202a, iris: 0x27343f, hair: 0xbfc5cb, clothes: 0x513a56, accent: 0xd9b13a },
};

export function resolveColors(spec) {
  const base = PALETTES[spec.palette] || PALETTES.fox;
  const c = { ...base, ...(spec.colors || {}) };
  // human skin tone default
  if ((spec.archetype || 'critter') === 'human' && !spec.colors?.skin) c.skin = 0xc99a72;
  return c;
}

export class Character {
  constructor(spec, mode, seed = 1) {
    this.spec = spec;
    this.name = spec.name;
    this.arch = ARCH[spec.archetype === 'human' ? 'human' : 'critter'];
    this.kind = spec.archetype === 'human' ? 'human' : 'critter';
    this.mode = mode; // 'pbr' | 'toon'
    this.colors = resolveColors(spec);
    this.scale = spec.scale ?? 1;
    this.rng = mulberry32(seed * 7919 + 17);
    this.blinkOffset = this.rng() * 3;

    this.root = pivot('root:' + this.name);
    this.root.position.set(...(spec.position || [0, 0, 0]));
    this.root.rotation.y = deg(spec.facing ?? 0);
    this.root.scale.setScalar(this.scale);

    this._buildRig();
    this._resetPose();
    this.gestures = []; // active: {clip, t0, dur, target}
    this._cur = {};     // smoothed joint state
    this.talkEnergy = 0;
  }

  /* ---------------------------------- build --------------------------------- */

  _buildRig() {
    const A = this.arch, C = this.colors, mode = this.mode;
    const skinM = mat(C.skin, { mode, roughness: 0.55 });
    const clothM = mat(C.clothes, { mode, roughness: 0.8 });
    const shoeM = mat(0x2a2a30, { mode, roughness: 0.9 });
    const hairM = mat(C.hair, { mode, roughness: 0.85 });

    this.hips = pivot('hips', { pos: [0, A.hipY, 0] });
    this.root.add(this.hips);

    // pelvis
    this.hips.add(mesh(capsule(A.torsoR * 0.9, A.torsoLen * 0.35, 12), clothM, { shadow: true, kind: 'body' }));

    // spine → chest
    this.spine = pivot('spine', { pos: [0, A.torsoLen * 0.18, 0] });
    this.hips.add(this.spine);
    this.chest = pivot('chest', { pos: [0, A.torsoLen * 0.42, 0] });
    this.spine.add(this.chest);
    this.chest.add(mesh(capsule(A.torsoR, A.torsoLen * 0.62, 14), clothM, { shadow: true, kind: 'body' }));
    if (this.kind === 'critter') {
      // round belly
      this.chest.add(mesh(ball(A.torsoR * 1.02, 20), mat(C.belly, { mode, roughness: 0.7 }), { pos: [0, -A.torsoLen * 0.18, A.torsoR * 0.42], scale: [1, 1.05, 0.72], kind: 'body' }));
    } else {
      // shirt chest + collar hint
      this.chest.add(mesh(capsule(A.torsoR * 0.98, 0.02, 12), mat(C.accent, { mode, roughness: 0.75 }), { pos: [0, 0.02, 0.02], kind: 'body' }));
    }

    // neck + head
    this.neck = pivot('neck', { pos: [0, A.torsoR * 0.9, 0] });
    this.chest.add(this.neck);
    this.head = pivot('head', { pos: [0, A.headR * 0.95 + 0.04, 0] });
    this.neck.add(this.head);
    this.head.add(mesh(ball(A.headR, 26), skinM, { shadow: true, kind: 'head' }));

    if (this.kind === 'human') {
      // hair cap
      const hair = mesh(ball(A.headR * 1.06, 22), hairM, { pos: [0, 0.015, -0.008], kind: 'hair' });
      hair.scale.set(1.0, 0.86, 1.0);
      this.head.add(hair);
    } else {
      // ears + tail
      for (const side of [-1, 1]) {
        const ear = pivot('ear', { pos: [0.52 * A.headR * side, 0.78 * A.headR, -0.02] });
        ear.rotation.z = deg(-14 * side);
        const outer = mesh(cone(0.30 * A.headR, 0.55 * A.headR, 12), mat(C.skin, { mode }), { kind: 'ear' });
        outer.rotation.x = deg(-8);
        ear.add(outer);
        const inner = mesh(cone(0.16 * A.headR, 0.30 * A.headR, 10), mat(C.belly, { mode }), { pos: [0, 0.02, 0.012] });
        inner.rotation.x = deg(-8);
        ear.add(inner);
        this.head.add(ear);
      }
      // tail: 3 spheres trailing behind
      this.tail = [];
      let prev = this.hips;
      for (let i = 0; i < 3; i++) {
        const segP = pivot('tail' + i, { pos: [0, -0.04, -0.16] });
        if (i > 0) segP.position.set(0, 0.03, -0.13);
        const t = mesh(ball(A.torsoR * (0.34 - i * 0.05), 14), mat(C.skin, { mode }), { kind: 'tail' });
        segP.add(t);
        if (i === 2) segP.add(mesh(ball(A.torsoR * 0.16, 10), mat(C.belly, { mode }), { pos: [0, 0, -0.02] }));
        prev.add(segP); prev = segP;
        this.tail.push(segP);
      }
    }

    // Face
    this.face = new Face(this.head, this.kind, this.colors, mode, this.blinkOffset);

    // Arms: shoulder → upper → elbow → forearm → hand
    this.arms = {};
    for (const side of [-1, 1]) {
      const s = side < 0 ? 'L' : 'R';
      const sh = pivot('shoulder' + s, { pos: [(A.shoulderX) * side, A.shoulderY - 0.02, 0] });
      this.chest.add(sh);
      sh.add(mesh(capsule(A.torsoR * 0.55, 0.03, 10), clothM, { pos: [0, 0, 0], kind: 'body' }));
      sh.add(mesh(capsule(0.045, A.armLen - 0.09, 10), clothM, { pos: [0, -A.armLen / 2, 0], kind: 'body' }));
      const el = pivot('elbow' + s, { pos: [0, -A.armLen, 0] });
      sh.add(el);
      el.add(mesh(capsule(0.038, A.foreLen - 0.07, 10), skinM, { pos: [0, -A.foreLen / 2, 0], kind: 'body' }));
      const hand = mesh(ball(0.052, 14), skinM, { pos: [0, -A.foreLen - 0.02, 0], kind: 'body' });
      hand.scale.set(0.8, 1.15, 0.55);
      el.add(hand);
      this.arms[s] = { sh, el, hand };
    }

    // Legs: hip → thigh → knee → shin → foot
    this.legs = {};
    for (const side of [-1, 1]) {
      const s = side < 0 ? 'L' : 'R';
      const hip = pivot('hip' + s, { pos: [0.09 * side, 0, 0] });
      this.hips.add(hip);
      hip.add(mesh(capsule(0.062, A.legLen * 0.46, 12), clothM, { pos: [0, -A.legLen * 0.25, 0], kind: 'body' }));
      const knee = pivot('knee' + s, { pos: [0, -A.legLen * 0.5, 0] });
      hip.add(knee);
      knee.add(mesh(capsule(0.05, A.legLen * 0.42, 12), clothM, { pos: [0, -A.legLen * 0.22, 0], kind: 'body' }));
      const foot = pivot('foot' + s, { pos: [0, -A.legLen * 0.48, 0] });
      knee.add(foot);
      foot.add(mesh(box(0.11, 0.06, 0.20), shoeM, { pos: [0, -0.03, 0.045], shadow: true, kind: 'body' }));
      this.legs[s] = { hip, knee, foot };
    }
  }

  _resetPose() {
    // relaxed rest pose
    this._set({ hips: { y: 0, roll: 0, yaw: 0 }, spine: { pitch: 0.04, yaw: 0 }, chest: { pitch: 0.02, yaw: 0 },
      neck: { pitch: 0, yaw: 0 }, head: { pitch: 0, yaw: 0, roll: 0 },
      shL: { pitch: 0, roll: deg(-4), yaw: 0 }, elL: { pitch: -0.15 }, shR: { pitch: 0, roll: deg(4), yaw: 0 }, elR: { pitch: -0.15 },
      thL: { pitch: 0 }, knL: { pitch: 0 }, ftL: { pitch: 0 }, thR: { pitch: 0 }, knR: { pitch: 0 }, ftR: { pitch: 0 },
    });
  }

  /* --------------------------------- helpers -------------------------------- */

  _set(p) {
    const J = {
      hips: this.hips, spine: this.spine, chest: this.chest, neck: this.neck, head: this.head,
      shL: this.arms.L.sh, elL: this.arms.L.el, shR: this.arms.R.sh, elR: this.arms.R.el,
      thL: this.legs.L.hip, knL: this.legs.L.knee, ftL: this.legs.L.foot,
      thR: this.legs.R.hip, knR: this.legs.R.knee, ftR: this.legs.R.foot,
    };
    for (const [k, v] of Object.entries(p)) {
      const j = J[k]; if (!j || !v) continue;
      if (v.pitch !== undefined) j.rotation.x = v.pitch;
      if (v.yaw !== undefined) j.rotation.y = v.yaw;
      if (v.roll !== undefined) j.rotation.z = v.roll;
      if (v.y !== undefined) j.position.y = this.arch.hipY + v.y;
    }
  }

  worldPos(obj) { const v = new THREE.Vector3(); obj.getWorldPosition(v); return v; }
  headWorld() { return this.worldPos(this.head); }
  chestWorld() { return this.worldPos(this.chest); }
  handWorld(side) { return this.worldPos(this.arms[side < 0 ? 'L' : 'R'].hand); }
  footWorld(side) { return this.worldPos(this.legs[side < 0 ? 'L' : 'R'].foot); }
  get headTop() { return this.headWorld().y + this.arch.headR * 1.6 * this.scale; }

  /* --------------------------------- update --------------------------------- */

  // ctx: { t, dt, move: {from,to,t0,t1,style} | null, talking: {energy, viseme, emotion}|null,
  //        gestures: [{clip, k(0..1), target}], lookAt: Vector3|null, sit: seatY|null }
  update(ctx) {
    const t = ctx.t, dt = Math.min(0.1, ctx.dt ?? 1 / 30);
    const A = this.arch;
    const sm = (k) => 1 - Math.exp(-dt * k);

    // ---- locomotion ----
    let walkPhase = null, speed = 0;
    if (ctx.move) {
      const { from, to, t0, t1, style } = ctx.move;
      const k = easeIO(seg(t, t0, t1));
      const d = Math.hypot(to[0] - from[0], to[1] - from[1]);
      speed = (style === 'run' ? A.runSpeed : A.walkSpeed);
      const dur = d / speed;
      const kk = seg(t, t0, t0 + dur);
      const px = lerp(from[0], to[0], easeIO(kk));
      const pz = lerp(from[1], to[1], easeIO(kk));
      this.root.position.x = px; this.root.position.z = pz;
      // face travel direction
      const yaw = Math.atan2(to[0] - from[0], to[1] - from[1]);
      this.root.rotation.y = lerp(this.root.rotation.y, yaw, sm(6));
      walkPhase = (t * speed / A.stride) * Math.PI * 2;
    } else {
      walkPhase = null;
      // facing drifts back to spec / scene base
      const want = deg(ctx.baseFacing ?? this.spec.facing ?? 0);
      this.root.rotation.y = lerp(this.root.rotation.y, want, sm(3));
    }

    // ---- gesture state ----
    const gAct = (ctx.gestures || []).filter((g) => g.k > 0 && g.k < 1 || (g.k >= 1 && g.hold));
    const gWave = gAct.find((g) => g.clip === 'wave');
    const gPoint = gAct.find((g) => g.clip === 'point');
    const gNod = gAct.find((g) => g.clip === 'nod');
    const gShake = gAct.find((g) => g.clip === 'shake');
    const gShrug = gAct.find((g) => g.clip === 'shrug');
    const gThink = gAct.find((g) => g.clip === 'think');

    // ---- base pose ----
    const P = {
      hips: { y: 0, roll: 0, yaw: 0 }, spine: { pitch: 0.04, yaw: 0 }, chest: { pitch: 0.02, yaw: 0 },
      neck: { pitch: 0, yaw: 0 }, head: { pitch: 0, yaw: 0, roll: 0 },
      shL: { pitch: 0.05, roll: deg(-5), yaw: 0 }, elL: { pitch: -0.18 },
      shR: { pitch: 0.05, roll: deg(5), yaw: 0 }, elR: { pitch: -0.18 },
      thL: { pitch: 0 }, knL: { pitch: 0.02 }, ftL: { pitch: 0 },
      thR: { pitch: 0 }, knR: { pitch: 0.02 }, ftR: { pitch: 0 },
    };

    if (ctx.sit != null) {
      const seat = ctx.sit;
      P.hips.y = seat - A.hipY + 0.02;
      P.thL.pitch = deg(-84); P.thR.pitch = deg(-84);
      P.knL.pitch = deg(78); P.knR.pitch = deg(78);
      P.ftL.pitch = deg(6); P.ftR.pitch = deg(6);
      P.spine.pitch = 0.06;
    } else if (walkPhase !== null) {
      const run = ctx.move.style === 'run';
      const amp = run ? 1.25 : 1.0;
      const ph = walkPhase;
      const s1 = Math.sin(ph), s2 = Math.sin(ph + Math.PI);
      P.thL.pitch = s1 * 0.55 * amp;
      P.thR.pitch = s2 * 0.55 * amp;
      P.knL.pitch = Math.max(0, Math.sin(ph + 0.9)) * 0.95 * amp;
      P.knR.pitch = Math.max(0, Math.sin(ph + Math.PI + 0.9)) * 0.95 * amp;
      P.ftL.pitch = Math.max(0, -Math.cos(ph)) * 0.5 * amp - Math.max(0, Math.sin(ph + 2.2)) * 0.35;
      P.ftR.pitch = Math.max(0, -Math.cos(ph + Math.PI)) * 0.5 * amp - Math.max(0, Math.sin(ph + Math.PI + 2.2)) * 0.35;
      P.hips.y = Math.abs(Math.cos(ph)) * (run ? 0.055 : 0.035) * amp;
      P.hips.roll = s1 * (run ? 0.10 : 0.055);
      P.hips.yaw = s1 * 0.10;
      P.chest.yaw = -s1 * 0.16;
      P.chest.pitch = run ? 0.30 : 0.09;
      P.spine.pitch = run ? 0.12 : 0.05;
      // arms counter-swing unless a gesture owns them
      const armAmp = run ? 0.75 : 0.5;
      if (!gWave && !gShrug && !gThink) { P.shL.pitch = s2 * armAmp * 0.9; P.elL.pitch = -0.3 - Math.max(0, -s2) * 0.55; }
      if (!gPoint && !gShrug && !gThink) { P.shR.pitch = s1 * armAmp * 0.9; P.elR.pitch = -0.3 - Math.max(0, -s1) * 0.55; }
    } else {
      // idle: breath + weight sway + micro head motion
      const sway = Math.sin(t * 1.9) * 0.5 + Math.sin(t * 0.61 + 1.3) * 0.5;
      P.hips.roll = sway * 0.022;
      P.chest.yaw = -sway * 0.03;
      const breath = Math.sin(t * 2.1 + this.blinkOffset);
      P.chest.pitch = 0.02 + breath * 0.012;
      P.shL.pitch = 0.05 + breath * 0.02; P.shR.pitch = 0.05 + breath * 0.02;
      P.head.yaw = smoothNoise(t, 3.1, 2) * 0.10;
      P.head.pitch = smoothNoise(t + 40, 7.7, 2) * 0.05;
      // talking head bob
      if (ctx.talking) {
        const e = ctx.talking.energy;
        P.head.pitch += smoothNoise(t * 2.4, 11.3, 2) * 0.06 * (0.3 + e);
        P.head.roll = smoothNoise(t * 1.7 + 8, 5.2, 2) * 0.05 * (0.3 + e);
      }
    }

    // ---- gesture overlays (attack/hold/release envelope comes from k) ----
    const bump = (k, hold) => (hold && k >= 1 ? 1 : Math.sin(clamp(k, 0, 1) * Math.PI));
    if (gWave) {
      const k = bump(gWave.k, gWave.hold);
      const wobble = Math.sin(t * 9.5) * 0.35 * k;
      const side = gWave.side || 'R';
      const sh = side === 'L' ? P.shL : P.shR, el = side === 'L' ? P.elL : P.elR;
      sh.pitch = lerp(sh.pitch, deg(-160), k);
      sh.roll = lerp(sh.roll, side === 'L' ? deg(-14) : deg(14), k);
      el.pitch = lerp(el.pitch, deg(-30) + wobble, k);
    }
    if (gPoint) {
      const k = bump(gPoint.k, gPoint.hold);
      const sh = gPoint.side === 'L' ? P.shL : P.shR, el = gPoint.side === 'L' ? P.elL : P.elR;
      const yawT = gPoint.yaw ?? 0; // radians toward target
      sh.pitch = lerp(sh.pitch, deg(-78), k);
      sh.yaw = lerp(sh.yaw ?? 0, yawT * 0.6, k);
      el.pitch = lerp(el.pitch, deg(-12), k);
    }
    if (gNod) {
      const k = bump(gNod.k, gNod.hold);
      P.head.pitch += Math.sin(gNod.k * Math.PI * 4) * 0.16 * k;
    }
    if (gShake) {
      const k = bump(gShake.k, gShake.hold);
      P.head.yaw += Math.sin(gShake.k * Math.PI * 5) * 0.3 * k;
    }
    if (gShrug) {
      const k = bump(gShrug.k, gShrug.hold);
      P.shL.roll = lerp(P.shL.roll, deg(38), k); P.shR.roll = lerp(P.shR.roll, deg(-38), k);
      P.shL.pitch = lerp(P.shL.pitch, deg(-16), k); P.shR.pitch = lerp(P.shR.pitch, deg(-16), k);
      P.elL.pitch = lerp(P.elL.pitch, deg(-50), k); P.elR.pitch = lerp(P.elR.pitch, deg(-50), k);
      P.head.roll = lerp(P.head.roll, 0.14, k);
    }
    if (gThink) {
      const k = bump(gThink.k, gThink.hold);
      const sh = P.shR, el = P.elR;
      sh.pitch = lerp(sh.pitch, deg(-118), k); sh.roll = lerp(sh.roll, deg(-30), k);
      el.pitch = lerp(el.pitch, deg(-88), k);
      P.head.pitch = lerp(P.head.pitch, 0.10, k); P.head.roll = lerp(P.head.roll, -0.10, k);
    }

    // ---- apply with smoothing ----
    for (const key of Object.keys(P)) {
      const target = P[key], cur = this._cur[key] || {};
      const merged = {};
      for (const f of ['pitch', 'yaw', 'roll', 'y']) {
        if (target[f] === undefined) continue;
        merged[f] = lerp(cur[f] ?? target[f], target[f], f === 'y' ? sm(10) : sm(14));
      }
      this._cur[key] = merged;
      this._applyJoint(key, merged);
    }

    // ---- face ----
    let lookGaze = null;
    if (ctx.lookAt) {
      const wp = this.headWorld();
      const d = new THREE.Vector3().subVectors(ctx.lookAt, wp);
      const local = d.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.root.rotation.y);
      const yawT = clamp(Math.atan2(local.x, local.z), -deg(70), deg(70));
      const pitchT = clamp(Math.atan2(local.y, Math.hypot(local.x, local.z)), -deg(40), deg(45));
      P.head.yaw = lerp(this._cur.head?.yaw ?? 0, yawT, sm(5));
      P.head.pitch = lerp(this._cur.head?.pitch ?? 0, -pitchT * 0.6, sm(5));
      // re-apply head with look
      const merged = {};
      for (const f of ['pitch', 'yaw', 'roll']) if (P.head[f] !== undefined) merged[f] = P.head[f];
      this._cur.head = merged; this._applyJoint('head', merged);
      lookGaze = new THREE.Vector2(yawT, pitchT);
    }
    this.face.gaze.set(lookGaze ? lookGaze.x * 0.4 : 0, lookGaze ? lookGaze.y * 0.3 : 0);
    this.face.apply(t, dt, {
      talking: !!ctx.talking,
      viseme: ctx.talking ? ctx.talking.viseme : 'sil',
      energy: ctx.talking ? ctx.talking.energy : 0,
      emotion: ctx.talking ? ctx.talking.emotion : this.spec.mood || 'neutral',
    });

    // tail sway for critters
    if (this.tail) {
      for (let i = 0; i < this.tail.length; i++) {
        this.tail[i].rotation.y = Math.sin(t * 2.2 + i * 0.8 + this.blinkOffset) * (0.22 - i * 0.04);
      }
    }
    this.talkEnergy = ctx.talking ? ctx.talking.energy : this.talkEnergy * 0.9;
  }

  _applyJoint(key, v) {
    const map = {
      hips: this.hips, spine: this.spine, chest: this.chest, neck: this.neck, head: this.head,
      shL: this.arms.L.sh, elL: this.arms.L.el, shR: this.arms.R.sh, elR: this.arms.R.el,
      thL: this.legs.L.hip, knL: this.legs.L.knee, ftL: this.legs.L.foot,
      thR: this.legs.R.hip, knR: this.legs.R.knee, ftR: this.legs.R.foot,
    };
    const j = map[key]; if (!j) return;
    if (v.pitch !== undefined) j.rotation.x = v.pitch;
    if (v.yaw !== undefined) j.rotation.y = v.yaw;
    if (v.roll !== undefined) j.rotation.z = v.roll;
    if (v.y !== undefined) j.position.y = this.arch.hipY + v.y;
  }
}

// Foot strike times for a move window (for the audio stage): strikes at each half stride.
export function stepTimes(move, arch = 'human') {
  const A = ARCH[arch] || ARCH.human;
  const speed = move.style === 'run' ? A.runSpeed : A.walkSpeed;
  const d = Math.hypot(move.to[0] - move.from[0], move.to[1] - move.from[1]);
  const dur = d / speed;
  const n = Math.max(0, Math.floor(dur / (A.stride / speed) * 2));
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = move.t0 + (i * (A.stride / speed)) / 2 + 0.06;
    if (t <= move.t0 + dur) out.push({ t, side: i % 2 === 0 ? 'L' : 'R' });
  }
  return out;
}
