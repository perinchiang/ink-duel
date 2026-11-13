// Ink-wash shading for 3D parts: stepped two-tone wash with brush grain + a wobbling
// back-face outline that keeps roughly constant on-screen width.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const COLORS = {
  paper: '#ebe3d2',
  ink: '#141317',
  red: '#b3352b',
};

// ShaderMaterials write display values directly, so colours stay in raw sRGB.
export function hex3(h) {
  const n = parseInt(h.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const LIGHT_DIR = new THREE.Vector3(-0.45, 0.78, 0.5).normalize();

const NOISE = /* glsl */ `
float ihash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float inoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(ihash(i), ihash(i + vec2(1.0, 0.0)), u.x), mix(ihash(i + vec2(0.0, 1.0)), ihash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float dissolveField(vec3 w){ return inoise(w.xy * 7.0 + w.z * 3.0) * 0.6 + inoise(w.zy * 19.0 + 3.7) * 0.4; }
`;

export function inkMaterial({ light = '#b9b2a5', dark = '#232126', glow = COLORS.red, side = THREE.FrontSide } = {}) {
  return new THREE.ShaderMaterial({
    side,
    uniforms: {
      uLight: { value: hex3(light) },
      uDark: { value: hex3(dark) },
      uLightDir: { value: LIGHT_DIR },
      uGlow: { value: 0 },
      uGlowColor: { value: hex3(glow) },
      uFlash: { value: 0 },
      uFlashColor: { value: hex3(COLORS.paper) },
      uDissolve: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight, uDark, uLightDir, uGlowColor, uFlashColor;
      uniform float uGlow, uFlash, uDissolve;
      varying vec3 vN; varying vec3 vW;
      ${NOISE}
      void main(){
        vec3 N = normalize(vN);
        if (!gl_FrontFacing) N = -N;
        float l = dot(N, uLightDir) * 0.5 + 0.5;
        vec2 sp = gl_FragCoord.xy;
        vec2 q = vec2(sp.x + sp.y, sp.y - sp.x) * 0.7071;
        float g = inoise(vec2(q.x * 0.03, q.y * 0.55)) * 0.62 + inoise(sp * 0.42) * 0.38;
        float t = l + (g - 0.5) * 0.32;
        float band = smoothstep(0.43, 0.48, t) * 0.5 + smoothstep(0.69, 0.74, t) * 0.5;
        vec3 col = mix(uDark, uLight, band);
        if (uDissolve > 0.0) {
          float d = dissolveField(vW);
          float th = uDissolve * 1.15 - 0.08;
          if (d < th) discard;
          if (d < th + 0.06) col = uDark;
        }
        col = mix(col, uGlowColor, uGlow);
        col = mix(col, uFlashColor, uFlash);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export function outlineMaterial({ color = COLORS.ink, thick = 0.0052 } = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uColor: { value: hex3(color) },
      uThick: { value: thick },
      uDissolve: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uThick; varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix) * normal);
        float dist = length(cameraPosition - wp.xyz);
        float wob = 0.72 + 0.28 * sin(wp.x * 13.0 + wp.y * 7.0) * sin(wp.z * 11.0 - wp.y * 5.0 + 1.3);
        wp.xyz += n * uThick * clamp(dist, 0.4, 9.0) * wob;
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uDissolve; varying vec3 vW;
      ${NOISE}
      void main(){
        if (uDissolve > 0.0 && dissolveField(vW) < uDissolve * 1.15 - 0.02) discard;
        gl_FragColor = vec4(uColor, 1.0);
      }`,
  });
}

export function outlineGeometry(geo) {
  let g = geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  return g;
}

/** A mesh plus its outline hull, grouped so it can be placed as one part. */
export function inkPart(geo, mat, lineMat) {
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(geo, mat));
  if (lineMat) grp.add(new THREE.Mesh(outlineGeometry(geo), lineMat));
  return grp;
}

/** Soft radial ink wash texture for contact shadows. */
export function washTexture(size = 128, inner = 0.15, alpha = 0.55) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, size * inner * 0.5, size / 2, size / 2, size / 2);
  grd.addColorStop(0, `rgba(20,19,23,${alpha})`);
  grd.addColorStop(0.55, `rgba(20,19,23,${alpha * 0.45})`);
  grd.addColorStop(1, 'rgba(20,19,23,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
