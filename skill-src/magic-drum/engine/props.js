// Shared scene-building helpers: materials (PBR + toon), primitives, deterministic noise.
import * as THREE from 'three';

// Deterministic RNG — films must render identically every time.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a, b, k) => a + (b - a) * k;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const easeIO = (k) => k * k * (3 - 2 * k);
export const easeOut = (k) => 1 - Math.pow(1 - k, 3);
export const seg = (t, t0, t1) => clamp((t - t0) / Math.max(1e-6, t1 - t0), 0, 1);

// Layered smooth sines — cheap deterministic handheld camera / micro motion.
export function smoothNoise(t, seed = 0, octaves = 3) {
  let v = 0, amp = 1, f = 0.7, s = seed;
  for (let o = 0; o < octaves; o++) {
    v += amp * Math.sin(t * f + Math.sin(s * 12.9898) * 6.2831) * Math.sin(t * f * 1.618 + s);
    amp *= 0.5; f *= 2.17; s += 1;
  }
  return v * 0.5;
}

const DEG = Math.PI / 180;
export const deg = (d) => d * DEG;

// Material factory. mode "pbr" (default) or "toon" (2D flat look).
export function mat(color, opts = {}) {
  const mode = opts.mode || 'pbr';
  if (mode === 'toon') {
    return new THREE.MeshToonMaterial({ color, ...(opts.emissive ? { emissive: opts.emissive } : {}) });
  }
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.65,
    metalness: opts.metalness ?? 0.0,
    ...(opts.emissive ? { emissive: opts.emissive, emissiveIntensity: opts.emissiveIntensity ?? 1 } : {}),
    ...(opts.transparent ? { transparent: true, opacity: opts.opacity ?? 0.5 } : {}),
  });
  return m;
}

export function mesh(geo, material, opts = {}) {
  const m = new THREE.Mesh(geo, material);
  if (opts.pos) m.position.set(...opts.pos);
  if (opts.rot) m.rotation.set(...opts.rot.map(deg));
  if (opts.scale) m.scale.set(...opts.scale);
  if (opts.shadow) { m.castShadow = true; m.receiveShadow = true; }
  m.userData.kind = opts.kind || '';
  return m;
}

export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, seg = 20) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const ball = (r, seg = 24) => new THREE.SphereGeometry(r, seg, seg);
export const capsule = (r, len, seg = 12) => new THREE.CapsuleGeometry(r, len, 4, seg);
export const cone = (r, h, seg = 20) => new THREE.ConeGeometry(r, h, seg);

// Group with rotation in degrees (readable specs).
export function pivot(name, opts = {}) {
  const g = new THREE.Object3D();
  g.name = name;
  if (opts.pos) g.position.set(...opts.pos);
  if (opts.rot) g.rotation.set(...opts.rot.map(deg));
  return g;
}
