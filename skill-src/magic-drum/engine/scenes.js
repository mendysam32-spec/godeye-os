// Parametric film sets: street (dusk), cafe (warm interior), void (symbolic).
// Each builder returns { group, anchors, update(t), fog, bounds } and is mode-aware (pbr | toon).
// anchors: named [x, y, z] points used by cameras (insert shots) and sits (seat Y).
import * as THREE from 'three';
import { mat, mesh, box, cyl, ball, capsule, cone, pivot, deg, mulberry32, clamp, lerp } from './props.js';

/* ------------------------------- helpers -------------------------------- */

function gradientSky(o) {
  const uniforms = {
    top: { value: new THREE.Color(o.top) },
    mid: { value: new THREE.Color(o.mid) },
    bot: { value: new THREE.Color(o.bot) },
    sunDir: { value: new THREE.Vector3(...o.sunDir).normalize() },
    sunColor: { value: new THREE.Color(o.sunColor) },
    sunSize: { value: o.sunSize ?? 32 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vP;
      uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunColor; uniform vec3 sunDir; uniform float sunSize;
      void main(){
        vec3 d = normalize(vP);
        float h = d.y * 0.5 + 0.5;
        vec3 c = mix(bot, mid, smoothstep(0.28, 0.55, h));
        c = mix(c, top, smoothstep(0.5, 0.95, h));
        float s = pow(max(dot(d, sunDir), 0.0), sunSize);
        c += sunColor * s;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(70, 28, 18), m);
}

function shadowDir(color, intensity, pos, size = 9, map = 1024) {
  const d = new THREE.DirectionalLight(color, intensity);
  d.position.set(...pos);
  d.castShadow = true;
  d.shadow.mapSize.set(map, map);
  d.shadow.camera.left = -size; d.shadow.camera.right = size;
  d.shadow.camera.top = size; d.shadow.camera.bottom = -size;
  d.shadow.camera.far = 45;
  d.shadow.bias = -0.0006;
  return d;
}

function stars(n, spread, rng) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rng() - 0.5) * spread;
    pos[i * 3 + 1] = rng() * spread * 0.5 + 2;
    pos[i * 3 + 2] = (rng() - 0.5) * spread;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcdd6ff, size: 0.09, transparent: true, opacity: 0.75, fog: false }));
  return pts;
}

/* -------------------------------- street -------------------------------- */

function buildStreet(mode, p = {}) {
  const rng = mulberry32(p.seed ?? 7);
  const g = new THREE.Group(); g.name = 'scene:street';
  const anchors = {
    bench: [-3.9, 0.46, 1.2],
    corner: [3.0, 0, 2.4],
    lamppost: [2.8, 0, -1.2],
    door: [-3.6, 0, -2.4],
    insert_car: [1.8, 0.75, -3.6],
  };
  const anim = { lamps: [], windows: [] };

  g.add(gradientSky({ top: 0x141e40, mid: 0x7c3f63, bot: 0xe08a4e, sunDir: [-0.5, 0.16, -0.85], sunColor: 0xffab5e, sunSize: 42 }));

  const road = mesh(box(15, 0.1, 26), mat(0x22252d, { mode, roughness: 0.96 }), { pos: [0, -0.05, 1] });
  road.receiveShadow = true; g.add(road);
  for (const s of [-1, 1]) {
    const walk = mesh(box(3.4, 0.15, 26), mat(0x3b404a, { mode, roughness: 0.92 }), { pos: [4.6 * s, 0.02, 1] });
    walk.receiveShadow = true; g.add(walk);
    g.add(mesh(box(0.18, 0.17, 26), mat(0x4a4f59, { mode, roughness: 0.85 }), { pos: [3.05 * s, 0.03, 1] }));
  }
  for (let i = -6; i <= 6; i++) {
    g.add(mesh(box(0.14, 0.02, 1.5), mat(0xb9bd8f, { mode }), { pos: [0, 0.012, i * 2.2] }));
  }

  // Buildings along both sides with lit window strips (dusk).
  function buildingRow(side) {
    let z = -9;
    while (z < 10) {
      const w = 3 + rng() * 3;           // depth along Z
      const h = 5 + rng() * 9;
      const x = side * (7.6 + rng() * 0.9);
      const col = new THREE.Color().setHSL(0.6 + rng() * 0.08, 0.16, 0.15 + rng() * 0.08);
      const body = mesh(box(2.6, h, w), mat(col.getHex(), { mode, roughness: 0.95 }), { pos: [x, h / 2, z + w / 2], shadow: h > 8 });
      g.add(body);
      const faceX = x - side * (1.3 + 0.03);
      const strips = Math.min(4, Math.max(1, Math.floor(h / 2.4)));
      for (let r = 0; r < strips; r++) {
        const wy = 1.4 + r * 2.3;
        if (wy > h - 0.8) break;
        const lit = rng() < 0.72;
        const wmat = mat(0x151009, { mode, emissive: lit ? 0xffc27a : 0x35415f, emissiveIntensity: lit ? 1.35 : 0.4, roughness: 0.4 });
        const win = mesh(box(0.05, 0.5, w * 0.66), wmat, { pos: [faceX, wy, z + w / 2] });
        g.add(win);
        anim.windows.push(wmat);
      }
      if (rng() < 0.4) { // storefront glow
        g.add(mesh(box(0.06, 1.5, w * 0.6), mat(0x140f08, { mode, emissive: 0xffb060, emissiveIntensity: 0.9, roughness: 0.5 }), { pos: [faceX, 0.85, z + w / 2] }));
      }
      z += w + 0.7;
    }
  }
  buildingRow(-1); buildingRow(1);

  // Street lamps
  for (let i = 0; i < 3; i++) {
    const x = 2.8, z = -1.2 + i * 5.4;
    g.add(mesh(cyl(0.045, 0.07, 4.0, 10), mat(0x2c3038, { mode, roughness: 0.6, metalness: 0.5 }), { pos: [x, 2.0, z], shadow: true }));
    g.add(mesh(cyl(0.03, 0.03, 0.9, 8), mat(0x2c3038, { mode }), { pos: [x - 0.4, 4.05, z], rot: [0, 0, 90] }));
    const bulbM = mat(0xfff1cf, { mode, emissive: 0xffd9a5, emissiveIntensity: 2.6, roughness: 0.4 });
    g.add(mesh(ball(0.11, 12), bulbM, { pos: [x - 0.8, 3.92, z] }));
    const L = new THREE.PointLight(0xffc58f, 9, 11, 2);
    L.position.set(x - 0.8, 3.9, z);
    g.add(L);
    anim.lamps.push({ L, i });
  }

  // Bench, trash can, hydrant
  const bench = pivot('bench', { pos: [-3.9, 0, 1.2], rot: [0, 90, 0] });
  bench.add(mesh(box(0.5, 0.08, 1.7), mat(0x5d4a33, { mode, roughness: 0.7 }), { pos: [0, 0.46, 0], shadow: true }));
  bench.add(mesh(box(0.5, 0.55, 0.08), mat(0x5d4a33, { mode }), { pos: [-0.21, 0.75, 0] }));
  for (const [lx, lz] of [[-0.18, -0.7], [0.18, -0.7], [-0.18, 0.7], [0.18, 0.7]]) {
    bench.add(mesh(box(0.06, 0.45, 0.06), mat(0x2c3038, { mode, metalness: 0.5 }), { pos: [lx, 0.23, lz] }));
  }
  g.add(bench);
  g.add(mesh(cyl(0.28, 0.24, 0.75, 12), mat(0x37413a, { mode, roughness: 0.8 }), { pos: [3.2, 0.38, 3.0], shadow: true }));
  g.add(mesh(cyl(0.09, 0.12, 0.5, 10), mat(0xb43a2e, { mode, roughness: 0.6 }), { pos: [-3.4, 0.26, 3.4] }));
  g.add(mesh(ball(0.09, 10), mat(0xb43a2e, { mode }), { pos: [-3.4, 0.55, 3.4] }));

  // Trees
  for (const [tx, tz] of [[-4.9, -5.6], [-4.6, 5.9], [5.1, -7.4], [4.8, 7.8]]) {
    g.add(mesh(cyl(0.09, 0.14, 1.7, 8), mat(0x3d2b1c, { mode, roughness: 0.9 }), { pos: [tx, 0.85, tz], shadow: true }));
    const crownM = mat(0x24402a, { mode, roughness: 0.9 });
    g.add(mesh(ball(0.85, 14), crownM, { pos: [tx, 2.15, tz], scale: [1.1, 0.9, 1.1], shadow: true }));
    g.add(mesh(ball(0.55, 12), crownM, { pos: [tx + 0.35, 1.75, tz + 0.2], shadow: true }));
  }

  // Parked car
  const car = pivot('car', { pos: [1.8, 0, -3.6] });
  car.add(mesh(box(1.65, 0.55, 3.5), mat(0x5a3b4a, { mode, roughness: 0.35, metalness: 0.6 }), { pos: [0, 0.55, 0], shadow: true }));
  car.add(mesh(box(1.45, 0.5, 1.7), mat(0x5a3b4a, { mode, roughness: 0.35, metalness: 0.6 }), { pos: [0, 1.02, -0.35] }));
  car.add(mesh(box(1.3, 0.4, 1.5), mat(0x1a2129, { mode, roughness: 0.2, metalness: 0.4 }), { pos: [0, 1.06, -0.35] }));
  for (const [wx, wz] of [[-0.78, -1.15], [0.78, -1.15], [-0.78, 1.15], [0.78, 1.15]]) {
    const wheel = mesh(cyl(0.32, 0.32, 0.22, 14), mat(0x14161a, { mode, roughness: 0.9 }), { pos: [wx, 0.32, wz] });
    wheel.rotation.z = deg(90);
    car.add(wheel);
  }
  car.add(mesh(box(1.2, 0.1, 0.06), mat(0xfff2c9, { mode, emissive: 0xfff2c9, emissiveIntensity: 1.8 }), { pos: [0, 0.62, 1.76] }));
  car.add(mesh(box(1.2, 0.1, 0.06), mat(0x3a0f0f, { mode, emissive: 0xd23c2a, emissiveIntensity: 1.4 }), { pos: [0, 0.62, -1.76] }));
  g.add(car);

  g.add(new THREE.HemisphereLight(0x54628f, 0x33261c, 0.5));
  g.add(shadowDir(0xff9a5e, 1.5, [-6, 4, -8], 11));
  const fill = new THREE.DirectionalLight(0x4a5a8a, 0.35);
  fill.position.set(5, 6, 6);
  g.add(fill);

  return {
    group: g, anchors,
    fog: new THREE.Fog(0x2a2438, 14, 55),
    bounds: null,
    update(t) {
      for (const { L, i } of anim.lamps) L.intensity = 9 * (0.93 + 0.07 * Math.sin(t * 6.7 + i * 2.1));
      for (let i = 0; i < anim.windows.length; i++) {
        anim.windows[i].emissiveIntensity = (i % 3 === 0) ? 1.2 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.8 + i * 1.7)) : 1.35;
      }
    },
  };
}

/* --------------------------------- cafe --------------------------------- */

function buildCafe(mode, p = {}) {
  const rng = mulberry32(p.seed ?? 11);
  const g = new THREE.Group(); g.name = 'scene:cafe';
  const anchors = {
    chair1: [0.3, 0.46, 1.1],
    chair2: [1.5, 0.46, -0.7],
    counter: [-3.6, 1.04, -0.2],
    behind: [-3.55, 0, -1.6],
    table1: [0.9, 0.76, 0.2],
    table2: [-1.1, 0.76, -1.5],
    window: [1.9, 1.65, -2.9],
    door: [2.4, 0, 2.6],
    insert_cup: [0.75, 0.8, 0.1],
  };
  const anim = { pendants: [], bulbs: [] };

  const floor = mesh(box(9, 0.1, 6.4), mat(0x8a5a36, { mode, roughness: 0.7 }), { pos: [0, -0.05, 0] });
  floor.receiveShadow = true; g.add(floor);
  g.add(mesh(box(3.4, 0.02, 2.2), mat(0x7a3b34, { mode, roughness: 0.95 }), { pos: [0.2, 0.015, 0.6] }));

  const wallMat = mat(0x4a3a2c, { mode, roughness: 0.9 });
  g.add(mesh(box(9, 3.1, 0.15), wallMat, { pos: [0, 1.55, -3.2] }));
  g.add(mesh(box(0.15, 3.1, 6.4), wallMat, { pos: [-4.5, 1.55, 0] }));
  g.add(mesh(box(0.15, 3.1, 6.4), wallMat, { pos: [4.5, 1.55, 0] }));
  g.add(mesh(box(9, 0.1, 6.4), mat(0x33261c, { mode, roughness: 1 }), { pos: [0, 3.12, 0] }));
  g.add(mesh(box(9, 0.85, 0.06), mat(0x5a4433, { mode, roughness: 0.8 }), { pos: [0, 0.45, -3.11] }));
  g.add(mesh(box(0.06, 0.85, 6.4), mat(0x5a4433, { mode, roughness: 0.8 }), { pos: [-4.41, 0.45, 0] }));
  g.add(mesh(box(0.06, 0.85, 6.4), mat(0x5a4433, { mode, roughness: 0.8 }), { pos: [4.41, 0.45, 0] }));

  // Window with dusk glow + frame
  g.add(mesh(box(2.6, 1.7, 0.06), mat(0x0c1226, { mode, emissive: 0xe8925c, emissiveIntensity: 0.85, roughness: 0.4 }), { pos: [1.9, 1.65, -3.14] }));
  g.add(mesh(box(2.7, 0.08, 0.1), mat(0x2a201a, { mode }), { pos: [1.9, 2.52, -3.12] }));
  g.add(mesh(box(2.7, 0.08, 0.1), mat(0x2a201a, { mode }), { pos: [1.9, 0.82, -3.12] }));
  g.add(mesh(box(0.08, 1.8, 0.1), mat(0x2a201a, { mode }), { pos: [1.9, 1.65, -3.12] }));

  // Counter along left wall + espresso machine + cups
  g.add(mesh(box(1.0, 0.95, 3.4), mat(0x3e2f24, { mode, roughness: 0.8 }), { pos: [-3.7, 0.48, -0.6] }));
  g.add(mesh(box(1.2, 0.08, 3.6), mat(0x2c2c31, { mode, roughness: 0.35, metalness: 0.55 }), { pos: [-3.65, 1.0, -0.6] }));
  g.add(mesh(box(0.7, 0.5, 0.8), mat(0xb8bcc4, { mode, roughness: 0.3, metalness: 0.85 }), { pos: [-3.6, 1.3, -1.4], shadow: true }));
  g.add(mesh(box(0.2, 0.16, 0.5), mat(0x22262c, { mode }), { pos: [-3.25, 1.18, -1.4] }));
  for (let i = 0; i < 3; i++) {
    g.add(mesh(cyl(0.05, 0.04, 0.09, 12), mat(0xe8e2d5, { mode }), { pos: [-3.5, 1.09, 0.1 + i * 0.5] }));
  }

  // Menu board
  g.add(mesh(box(2.2, 1.0, 0.08), mat(0x1c1712, { mode }), { pos: [-1.4, 1.9, -3.12] }));
  for (let i = 0; i < 3; i++) {
    g.add(mesh(box(1.4, 0.05, 0.02), mat(0x1c1712, { mode, emissive: 0xd8cfa8, emissiveIntensity: 0.7 }), { pos: [-1.5, 2.15 - i * 0.25, -3.07] }));
  }

  // Tables + chairs
  function table(x, z) {
    g.add(mesh(cyl(0.45, 0.45, 0.05, 20), mat(0x6b4a2e, { mode, roughness: 0.55 }), { pos: [x, 0.74, z], shadow: true }));
    g.add(mesh(cyl(0.05, 0.07, 0.72, 10), mat(0x2c2c31, { mode, metalness: 0.6, roughness: 0.4 }), { pos: [x, 0.37, z] }));
    g.add(mesh(cyl(0.3, 0.3, 0.03, 16), mat(0x2c2c31, { mode }), { pos: [x, 0.02, z] }));
  }
  table(0.9, 0.2); table(-1.1, -1.5);
  g.add(mesh(cyl(0.045, 0.038, 0.08, 12), mat(0xe8e2d5, { mode }), { pos: [0.75, 0.8, 0.1] }));
  g.add(mesh(cyl(0.045, 0.038, 0.08, 12), mat(0xe8e2d5, { mode }), { pos: [-0.95, 0.8, -1.4] }));
  g.add(mesh(cyl(0.038, 0.03, 0.005, 10), mat(0x2a1610, { mode, roughness: 0.3 }), { pos: [0.75, 0.845, 0.1] }));

  function chair(x, z, rotY) {
    const c = pivot('chair', { pos: [x, 0, z], rot: [0, rotY, 0] });
    c.add(mesh(box(0.42, 0.05, 0.42), mat(0x5d3f26, { mode, roughness: 0.6 }), { pos: [0, 0.46, 0], shadow: true }));
    c.add(mesh(box(0.42, 0.5, 0.05), mat(0x5d3f26, { mode }), { pos: [0, 0.72, -0.19] }));
    for (const [lx, lz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) {
      c.add(mesh(box(0.045, 0.44, 0.045), mat(0x2c2c31, { mode }), { pos: [lx, 0.22, lz] }));
    }
    g.add(c);
  }
  chair(0.3, 1.1, 160); chair(1.5, -0.7, -20);
  chair(-1.75, -0.65, 140); chair(-0.45, -2.3, -40);

  // Plant
  g.add(mesh(cyl(0.16, 0.12, 0.3, 10), mat(0x8a4a3a, { mode, roughness: 0.8 }), { pos: [3.6, 0.15, -2.6] }));
  const leafM = mat(0x2f5c33, { mode, roughness: 0.85 });
  g.add(mesh(ball(0.28, 12), leafM, { pos: [3.6, 0.62, -2.6], scale: [1, 1.3, 1], shadow: true }));
  g.add(mesh(ball(0.2, 10), leafM, { pos: [3.45, 0.5, -2.5] }));

  // Pendant lamps (pivot at ceiling so sway looks right)
  for (const [px, pz] of [[-0.5, 0.2], [0.9, -0.9], [-1.6, 0.6]]) {
    const lamp = pivot('pendant', { pos: [px, 3.05, pz] });
    lamp.add(mesh(cyl(0.008, 0.008, 0.55, 6), mat(0x1a1a1e, { mode }), { pos: [0, -0.28, 0] }));
    const shade = mesh(cone(0.17, 0.16, 14, true), mat(0x2e4a44, { mode, roughness: 0.5, metalness: 0.3 }), { pos: [0, -0.62, 0] });
    shade.rotation.x = deg(180);
    lamp.add(shade);
    const bulbM = mat(0xffe9c8, { mode, emissive: 0xffe0b0, emissiveIntensity: 2.4, roughness: 0.4 });
    lamp.add(mesh(ball(0.05, 10), bulbM, { pos: [0, -0.68, 0] }));
    const L = new THREE.PointLight(0xffd2a0, 5.5, 5.5, 2);
    L.position.set(0, -0.68, 0);
    lamp.add(L);
    g.add(lamp);
    anim.pendants.push({ lamp, i: anim.pendants.length });
    anim.bulbs.push({ L, i: anim.bulbs.length });
  }

  g.add(new THREE.HemisphereLight(0x8a6a4a, 0x2a1c12, 0.35));
  const key = new THREE.SpotLight(0xffdcb0, 55, 13, deg(52), 0.55, 1.7);
  key.position.set(1.6, 2.85, 2.0);
  key.target.position.set(0.4, 0.8, -0.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0006;
  g.add(key); g.add(key.target);
  const rim = new THREE.DirectionalLight(0x7a86b8, 0.55);
  rim.position.set(1.9, 1.7, -2.2);
  rim.target.position.set(-0.5, 0.6, 1.2);
  g.add(rim); g.add(rim.target);

  return {
    group: g, anchors,
    fog: new THREE.Fog(0x241a12, 9, 26),
    bounds: { x: [-3.9, 3.9], z: [-2.7, 2.7], y: [0.35, 2.85] },
    update(t) {
      for (const { lamp, i } of anim.pendants) lamp.rotation.z = Math.sin(t * 0.9 + i * 2.1) * 0.028;
      for (const { L, i } of anim.bulbs) L.intensity = 5.5 * (0.96 + 0.04 * Math.sin(t * 3.1 + i));
    },
  };
}

/* --------------------------------- void --------------------------------- */

function buildVoid(mode, p = {}) {
  const rng = mulberry32(p.seed ?? 23);
  const g = new THREE.Group(); g.name = 'scene:void';
  const anchors = { center: [0, 0, 0], mark: [0, 0, 1.6], monolith: [2.4, 0.8, -1.2], insert_orb: [1.2, 1.05, 0.4] };
  const anim = { shapes: [], rims: [] };

  g.add(gradientSky({ top: 0x04050a, mid: 0x0a0d1c, bot: 0x111527, sunDir: [0, 1, 0], sunColor: 0x1a2038, sunSize: 3 }));
  g.add(stars(240, 60, rng));

  const disc = mesh(cyl(15, 15, 0.1, 48), mat(0x0d0f18, { mode, metalness: 0.72, roughness: 0.3 }), { pos: [0, -0.05, 0] });
  disc.receiveShadow = true; g.add(disc);
  g.add(mesh(new THREE.TorusGeometry(3.2, 0.025, 8, 64), mat(0x3ec8b8, { mode, emissive: 0x3ec8b8, emissiveIntensity: 1.2 }), { pos: [0, 0.02, 0], rot: [90, 0, 0] }));

  // Floating geometry
  const shapeMat = (em) => mat(0x161a26, { mode, metalness: 0.6, roughness: 0.35, emissive: em, emissiveIntensity: 0.35 });
  const defs = [
    [new THREE.IcosahedronGeometry(0.5), [1.2, 1.05, 0.4], 0x3ec8b8, 0.21, 0.17],
    [new THREE.TorusGeometry(0.55, 0.16, 10, 26), [-1.6, 1.6, -0.8], 0xc05a9a, 0.13, -0.23],
    [new THREE.OctahedronGeometry(0.42), [2.4, 0.8, -1.2], 0x8a92c0, -0.17, 0.11],
    [new THREE.IcosahedronGeometry(0.34), [-0.6, 2.3, 1.4], 0x3ec8b8, 0.09, -0.13],
    [new THREE.TorusKnotGeometry(0.32, 0.1, 48, 8), [0.2, 2.9, -1.6], 0xc05a9a, -0.11, 0.07],
  ];
  for (const [geo, pos, em, sx, sy] of defs) {
    const m = mesh(geo, shapeMat(em), { pos, shadow: true });
    g.add(m);
    anim.shapes.push({ m, sx, sy, y0: pos[1] });
  }

  const rimA = new THREE.SpotLight(0x3ec8b8, 85, 26, deg(38), 0.6, 1.8);
  rimA.position.set(-5, 5, -4);
  rimA.target.position.set(0, 1, 0);
  rimA.castShadow = true;
  rimA.shadow.mapSize.set(1024, 1024);
  g.add(rimA); g.add(rimA.target);
  const rimB = new THREE.SpotLight(0xc05a9a, 60, 26, deg(42), 0.6, 1.8);
  rimB.position.set(5, 4, 3);
  rimB.target.position.set(0, 1, 0);
  g.add(rimB); g.add(rimB.target);
  anim.rims.push(rimA, rimB);
  g.add(new THREE.HemisphereLight(0x232a44, 0x0a0810, 0.5));
  const top = new THREE.DirectionalLight(0x8a92c0, 0.3);
  top.position.set(0, 8, 2);
  g.add(top);

  return {
    group: g, anchors,
    fog: new THREE.Fog(0x07080f, 10, 34),
    bounds: null,
    update(t) {
      for (const { m, sx, sy, y0 } of anim.shapes) {
        m.rotation.set(t * sx, t * sy, 0);
        m.position.y = y0 + Math.sin(t * 0.7 + sx * 9) * 0.08;
      }
      rimA.intensity = 85 * (0.9 + 0.1 * Math.sin(t * 0.9));
      rimB.intensity = 60 * (0.9 + 0.1 * Math.sin(t * 0.7 + 2.2));
    },
  };
}

export const SCENE_BUILDERS = { street: buildStreet, cafe: buildCafe, void: buildVoid };
export function buildScene(type, mode, params = {}) {
  const b = SCENE_BUILDERS[type] || buildStreet;
  return b(mode, params);
}
