// Post pipeline: render → bloom → grade (temp/tint/sat/contrast/lift/vignette/grain) → output.
// Grain uses the frame index so every render is deterministic.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const GRADES = {
  neutral: { temp: 0, tint: 0, sat: 1.0, contrast: 1.0, lift: 0, vig: 0.26, grain: 0.045, exposure: 1.0 },
  warm:    { temp: 0.45, tint: 0.05, sat: 1.08, contrast: 1.06, lift: 0.02, vig: 0.3, grain: 0.05, exposure: 1.02 },
  dusk:    { temp: 0.35, tint: -0.05, sat: 1.12, contrast: 1.1, lift: 0.03, vig: 0.38, grain: 0.06, exposure: 1.0 },
  cool:    { temp: -0.4, tint: -0.02, sat: 1.0, contrast: 1.08, lift: 0, vig: 0.32, grain: 0.05, exposure: 1.0 },
  noir:    { temp: 0, tint: 0, sat: 0.22, contrast: 1.18, lift: 0.01, vig: 0.5, grain: 0.09, exposure: 1.0 },
  dream:   { temp: 0.2, tint: 0.1, sat: 0.92, contrast: 0.95, lift: 0.18, vig: 0.25, grain: 0.05, exposure: 1.05 },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    exposure: { value: 1 }, temp: { value: 0 }, tint: { value: 0 }, sat: { value: 1 },
    contrast: { value: 1 }, lift: { value: 0 }, vig: { value: 0.3 }, grain: { value: 0.05 }, time: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float exposure, temp, tint, sat, contrast, lift, vig, grain, time;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c *= exposure;
      c.r *= 1.0 + temp * 0.15;
      c.b *= 1.0 - temp * 0.15;
      c.g *= 1.0 + tint * 0.08;
      c = max(c + lift * 0.05, 0.0);
      c = (c - 0.18) * contrast + 0.18;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat);
      vec2 q = vUv - 0.5;
      c *= 1.0 - vig * dot(q, q) * 1.7;
      float n = hash(vUv * vec2(1231.7, 767.3) + time * 137.0);
      c += (n - 0.5) * grain;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function createPost(renderer, scene, camera, style = {}) {
  const w = renderer.domElement.width, h = renderer.domElement.height;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomStrength = style.bloom ?? 0.45;
  let bloom = null;
  if (bloomStrength > 0.001) {
    bloom = new UnrealBloomPass(new THREE.Vector2(w, h), bloomStrength, style.bloomRadius ?? 0.5, style.bloomThreshold ?? 0.82);
    composer.addPass(bloom);
  }
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  composer.setSize(w, h);
  applyGrade(grade, style.grade || 'neutral', style);
  return {
    composer, bloom, grade,
    renderFrame(i) {
      grade.uniforms.time.value = i;
      composer.render();
    },
  };
}

export function applyGrade(gradePass, name, style = {}) {
  const g = Object.assign({}, GRADES[name] || GRADES.neutral, style.gradeParams || {});
  const u = gradePass.uniforms;
  u.exposure.value = g.exposure;
  u.temp.value = g.temp; u.tint.value = g.tint; u.sat.value = g.sat;
  u.contrast.value = g.contrast; u.lift.value = g.lift;
  u.vig.value = g.vig; u.grain.value = g.grain;
}
