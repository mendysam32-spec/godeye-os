// Expressive face: viseme mouth shapes, blinking, brows and gaze.
// Attached to a head pivot; all controls are parametric so lip-sync and
// emotion stay smooth under frame-stepped rendering.
import * as THREE from 'three';
import { mat, mesh, ball, capsule, box, cone, pivot, clamp, lerp, seg, easeOut } from './props.js';

// Viseme targets: [open 0..1, width 0..1.4, pucker 0..1, corners -1..1]
export const VISEMES = {
  sil: [0.05, 0.85, 0.1, 0.0],   // resting
  aa:  [1.00, 1.00, 0.0, 0.1],   // open "a"
  ee:  [0.45, 1.25, 0.0, 0.5],   // wide "e/i"
  ih:  [0.35, 1.10, 0.0, 0.3],
  oh:  [0.85, 0.60, 0.6, -0.1],  // rounded "o"
  ou:  [0.65, 0.45, 1.0, -0.2],  // pursed "u/w"
  mbp: [0.04, 0.80, 0.2, 0.0],   // lips closed
  fv:  [0.22, 1.00, 0.3, 0.2],   // lip-teeth
  th:  [0.40, 0.95, 0.1, 0.2],   // tongue visible-ish
  ss:  [0.18, 0.95, 0.4, 0.0],   // hiss
  kk:  [0.55, 0.95, 0.1, 0.0],   // mid open
  nn:  [0.30, 0.90, 0.2, 0.1],
};

// Emotion presets: brows [raise, tilt(+ = angry inward)], eye squint, mouth corners, head tilt
export const EMOTIONS = {
  neutral:  { browRaise: 0.15, browTilt: 0.0, squint: 0.0, corners: 0.12 },
  happy:    { browRaise: 0.45, browTilt: 0.0, squint: 0.25, corners: 0.85 },
  sad:      { browRaise: -0.25, browTilt: -0.35, squint: 0.0, corners: -0.65 },
  angry:    { browRaise: -0.5, browTilt: 0.6, squint: 0.45, corners: -0.45 },
  surprised:{ browRaise: 0.9, browTilt: 0.0, squint: -0.3, corners: 0.0 },
  scared:   { browRaise: 0.7, browTilt: -0.2, squint: -0.2, corners: -0.5 },
};

export class Face {
  // parent: head pivot. arch: 'human' | 'critter'. dir: +1 face looks toward +Z of head space.
  constructor(parent, arch, colors, mode, seed = 0) {
    this.arch = arch;
    this.mode = mode;
    this.blinkSeed = seed;
    const s = arch === 'critter' ? 1.15 : 1.0; // critter faces slightly bigger
    this.scale = s;
    this.skin = colors.skin;
    this.group = pivot('face');
    parent.add(this.group);

    const eyeMat = mat(0xffffff, { mode, roughness: 0.25 });
    const irisMat = mat(colors.iris ?? 0x27343f, { mode, roughness: 0.35 });
    const pupilMat = mat(0x101418, { mode, roughness: 0.2 });
    const lidMat = mat(arch === 'critter' ? colors.skin : colors.skin, { mode, roughness: 0.7 });
    const browMat = mat(colors.hair ?? 0x3a2b20, { mode, roughness: 0.8 });

    // Eyes: sockets placed on the face; lids = squashed spheres that rotate closed.
    this.eyes = [];
    for (const side of [-1, 1]) {
      const eye = pivot('eye' + (side < 0 ? 'L' : 'R'), { pos: [0.085 * side, 0.06, 0.30 * s] });
      const white = mesh(ball(0.055 * s, 20), eyeMat, { kind: 'eye' });
      eye.add(white);
      const iris = mesh(ball(0.028 * s, 16), irisMat, { pos: [0, 0, 0.038 * s], kind: 'eye' });
      eye.add(iris);
      const pupil = mesh(ball(0.014 * s, 12), pupilMat, { pos: [0, 0, 0.048 * s], kind: 'eye' });
      eye.add(pupil);
      const lid = mesh(ball(0.062 * s, 16), lidMat, { kind: 'eye' });
      lid.scale.set(1.02, 0.75, 1.02);
      lid.position.y = 0.045 * s;
      eye.add(lid);
      eye.userData.lid = lid;
      eye.userData.open = 1;
      this.eyes.push(eye);
      this.group.add(eye);
    }

    // Brows
    this.brows = [];
    for (const side of [-1, 1]) {
      const brow = mesh(capsule(0.011 * s, 0.06 * s), browMat, {
        pos: [0.085 * side, 0.135 * s, 0.31 * s],
        rot: [0, 0, side * 8],
      });
      this.group.add(brow);
      this.brows.push(brow);
    }

    // Muzzle / nose / mouth
    if (arch === 'critter') {
      this.muzzle = mesh(box(0.30 * s, 0.20 * s, 0.22 * s), mat(colors.muzzle ?? colors.skin, { mode }), { pos: [0, -0.08, 0.28 * s], kind: 'face' });
      this.muzzle.geometry = new THREE.BoxGeometry(0.30 * s, 0.20 * s, 0.22 * s, 6, 4, 4);
      this.group.add(this.muzzle);
      this.nose = mesh(ball(0.035 * s, 14), mat(colors.nose ?? 0x1d1d22, { mode }), { pos: [0, -0.015, 0.40 * s], kind: 'face' });
      this.group.add(this.nose);
      this.mouthY = -0.145 * s;
      this.mouthZ = 0.34 * s;
    } else {
      this.nose = mesh(cone(0.022 * s, 0.05 * s, 10), mat(colors.skin, { mode }), { pos: [0, -0.005, 0.33 * s], rot: [90, 0, 0], kind: 'face' });
      this.group.add(this.nose);
      this.mouthY = -0.09 * s;
      this.mouthZ = 0.30 * s;
    }

    // Mouth: dark ellipse (torus-thin ring look avoided; simple soft ellipse mesh)
    const mouthGeo = new THREE.SphereGeometry(1, 20, 14);
    this.mouth = new THREE.Mesh(mouthGeo, mat(0x2a1414, { mode, roughness: 0.9 }));
    this.mouth.position.set(0, this.mouthY, this.mouthZ);
    this.mouth.userData.h = 0.05; this.mouth.userData.w = 0.85;
    this.group.add(this.mouth);

    // Teeth hint when mouth is wide open
    this.teeth = mesh(box(0.12 * s, 0.014 * s, 0.01), mat(0xf3efe6, { mode }), { pos: [0, this.mouthY + 0.0, this.mouthZ + 0.004], kind: 'face' });
    this.teeth.visible = false;
    this.group.add(this.teeth);

    // State
    this.open = 0.05; this.wide = 0.85; this.pucker = 0.1; this.corners = 0.1;
    this.browRaise = 0.15; this.browTilt = 0;
    this.squint = 0;
    this.gaze = new THREE.Vector2(0, 0); // look target offsets
    this._smooth = {};
  }

  // cues: [t0, t1, visemeName, amplitude] relative to line start; tLocal within line
  apply(t, dt, ctx) {
    // ctx: { talking, viseme, energy 0..1, emotion, lookAt }
    const target = VISEMES[ctx.viseme || 'sil'] || VISEMES.sil;
    const k = 1 - Math.exp(-dt * 18); // fast but smooth morph
    const energy = ctx.energy ?? 0;
    this.open = lerp(this.open, target[0] * (0.55 + 0.45 * energy), k);
    this.wide = lerp(this.wide, target[1], k);
    this.pucker = lerp(this.pucker, target[2], k);
    this.corners = lerp(this.corners, (EMOTIONS[ctx.emotion]?.corners ?? 0.1) * (ctx.talking ? 1 : 1), k);
    this.browRaise = lerp(this.browRaise, EMOTIONS[ctx.emotion]?.browRaise ?? 0.15, 1 - Math.exp(-dt * 4));
    this.browTilt = lerp(this.browTilt, EMOTIONS[ctx.emotion]?.browTilt ?? 0, 1 - Math.exp(-dt * 4));
    this.squint = lerp(this.squint, EMOTIONS[ctx.emotion]?.squint ?? 0, 1 - Math.exp(-dt * 5));

    // Stateless blink: one dip per window, offset per character (resume-safe).
    let blinkOpen = 1;
    const bw = 3.4 + (this.blinkSeed % 1.3);
    const bp = ((t + this.blinkSeed * 2.17) % bw) / bw;
    if (bp < 0.16) {
      const p = bp / 0.16;
      blinkOpen = p < 0.45 ? 1 - easeOut(p / 0.45) : easeOut((p - 0.45) / 0.55);
    }

    // Apply: eyes open + squint + blink
    for (const eye of this.eyes) {
      const openness = clamp(blinkOpen * (1 - 0.7 * Math.max(0, this.squint)), 0.04, 1);
      const lid = eye.userData.lid;
      lid.rotation.x = lerp(0.9, -0.55, openness); // closed ~0.9 down, open -0.55 up
      eye.position.y = 0.06 * this.scale + 0.004 * this.browRaise;
      // gaze
      eye.rotation.y = this.gaze.x * 0.35;
      eye.rotation.x = -this.gaze.y * 0.25;
    }
    // Brows
    for (let i = 0; i < this.brows.length; i++) {
      const side = i === 0 ? -1 : 1;
      const b = this.brows[i];
      b.position.y = (0.135 + 0.028 * this.browRaise) * this.scale;
      b.position.z = 0.31 * this.scale + 0.01 * this.browRaise;
      b.rotation.z = side * (8 + 22 * this.browTilt) * (Math.PI / 180);
      b.position.y += 0.012 * this.squint * side * 0; // reserved
    }
    // Mouth morph
    const h = 0.03 + 0.16 * this.open * this.scale;
    const w = (0.16 + 0.06 * (this.wide - 0.85) + 0.015 * this.corners) * this.scale * (1 - 0.25 * this.pucker);
    this.mouth.scale.set(w, h, 0.02);
    this.mouth.position.y = this.mouthY + 0.02 * this.corners * this.scale;
    this.mouth.position.z = this.mouthZ - 0.02 * this.pucker * this.scale;
    this.teeth.visible = this.open > 0.55;
    this.teeth.position.y = this.mouthY + h * 0.55;
    this.teeth.scale.x = w * 1.2;
  }
}
