/* =====================================================================
   WREN — the 3D eras (Lv 3 "early 3D" and Lv 4 "modern").
   A small self-contained WebGL2 engine: terrain, instancing, shadows,
   sky, water, grass, particles. The valley is built from the 2D map.
   ===================================================================== */
(function () {
'use strict';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const mixc = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
let seed = 1234567; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// ------------------------------------------------------------------ math
function M() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }
const IDENT = M();
function mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
function persp(fovy, asp, n, f) { const m = new Float32Array(16), t = 1 / Math.tan(fovy / 2); m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m; }
function ortho(l, r, b, t, n, f) { const m = M(); m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n); m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); return m; }
function lookAt(e, c, u) {
  let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx; l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx; const m = M();
  m[0] = xx; m[4] = xy; m[8] = xz; m[1] = yx; m[5] = yy; m[9] = yz; m[2] = zx; m[6] = zy; m[10] = zz;
  m[12] = -(xx * e[0] + xy * e[1] + xz * e[2]); m[13] = -(yx * e[0] + yy * e[1] + yz * e[2]); m[14] = -(zx * e[0] + zy * e[1] + zz * e[2]); return m;
}
function inv(a) {
  const o = new Float32Array(16);
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!det) return M(); det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}
function xform(tx, ty, tz, rx, ry, rz, sx, sy, sz) {
  if (sy == null) { sy = sx; sz = sx; }
  const cx = Math.cos(rx), sxx = Math.sin(rx), cy = Math.cos(ry), syy = Math.sin(ry), cz = Math.cos(rz), szz = Math.sin(rz);
  const r00 = cy * cz + syy * sxx * szz, r01 = -cy * szz + syy * sxx * cz, r02 = syy * cx;
  const r10 = cx * szz, r11 = cx * cz, r12 = -sxx;
  const r20 = -syy * cz + cy * sxx * szz, r21 = syy * szz + cy * sxx * cz, r22 = cy * cx;
  const m = new Float32Array(16);
  m[0] = r00 * sx; m[1] = r10 * sx; m[2] = r20 * sx; m[4] = r01 * sy; m[5] = r11 * sy; m[6] = r21 * sy; m[8] = r02 * sz; m[9] = r12 * sz; m[10] = r22 * sz;
  m[12] = tx; m[13] = ty; m[14] = tz; m[15] = 1; return m;
}
const trs = (x, y, z, ry, s, sy, sz) => xform(x, y, z, 0, ry, 0, s, sy == null ? s : sy, sz == null ? s : sz);

// ------------------------------------------------------------ geometry
function Geo() { this.p = []; this.n = []; this.c = []; }
Geo.prototype.add = function (prim, m, col) {
  const P = prim.p, N = prim.n;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    this.p.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
    let nx = m[0] * N[i] + m[4] * N[i + 1] + m[8] * N[i + 2], ny = m[1] * N[i] + m[5] * N[i + 1] + m[9] * N[i + 2], nz = m[2] * N[i] + m[6] * N[i + 1] + m[10] * N[i + 2]; const l = Math.hypot(nx, ny, nz) || 1;
    this.n.push(nx / l, ny / l, nz / l);
    const c = typeof col === 'function' ? col(x, y, z) : col; this.c.push(c[0], c[1], c[2]);
  }
  return this;
};
function boxP() {
  const p = [], n = [];
  for (const [nx, ny, nz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const u = nx ? [0, 1, 0] : [1, 0, 0]; const v = [ny * u[2] - nz * u[1], nz * u[0] - nx * u[2], nx * u[1] - ny * u[0]];
    const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [nx * 0.5 + (u[0] * a + v[0] * b) * 0.5, ny * 0.5 + (u[1] * a + v[1] * b) * 0.5, nz * 0.5 + (u[2] * a + v[2] * b) * 0.5]);
    for (const i of [0, 1, 2, 0, 2, 3]) { p.push(...q[i]); n.push(nx, ny, nz); }
  }
  return { p, n };
}
function cylP(rt, rb, h, seg) {
  const p = [], n = [], sl = (rb - rt) / h, nl = Math.hypot(1, sl);
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const b0 = [c0 * rb, 0, s0 * rb], b1 = [c1 * rb, 0, s1 * rb], t0 = [c0 * rt, h, s0 * rt], t1 = [c1 * rt, h, s1 * rt];
    const n0 = [c0 / nl, sl / nl, s0 / nl], n1 = [c1 / nl, sl / nl, s1 / nl];
    p.push(...b0, ...t1, ...b1, ...b0, ...t0, ...t1); n.push(...n0, ...n1, ...n1, ...n0, ...n0, ...n1);
    if (rt > 0) { p.push(0, h, 0, ...t0, ...t1); n.push(0, 1, 0, 0, 1, 0, 0, 1, 0); }
    p.push(0, 0, 0, ...b1, ...b0); n.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
  }
  return { p, n };
}
const ICO_CACHE = {};
function icoP(detail, deform) {
  const key = detail + (deform ? 'd' + deform.k : '');
  if (!deform && ICO_CACHE[key]) return ICO_CACHE[key];
  const t = (1 + Math.sqrt(5)) / 2;
  let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(v => { const l = Math.hypot(...v); return v.map(x => x / l); });
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let d = 0; d < detail; d++) {
    const cache = new Map(); const mid = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (cache.has(k)) return cache.get(k); const v = V[a].map((x, i) => (x + V[b][i]) / 2); const l = Math.hypot(...v); V.push(v.map(x => x / l)); cache.set(k, V.length - 1); return V.length - 1; };
    const NF = []; for (const [a, b, c] of F) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); NF.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); } F = NF;
  }
  if (deform) V = V.map(v => { const k = 1 + deform.f(v); return v.map(x => x * k); });
  const p = [], n = [];
  for (const f of F) for (const i of f) { p.push(...V[i]); const l = Math.hypot(...V[i]); n.push(V[i][0] / l, V[i][1] / l, V[i][2] / l); }
  const r = { p, n }; if (!deform) ICO_CACHE[key] = r; return r;
}
function roofP() {
  const p = [], n = []; const A = [-0.5, 0, -0.5], B = [0.5, 0, -0.5], C = [0.5, 0, 0.5], D = [-0.5, 0, 0.5], E = [-0.5, 1, 0], Fp = [0.5, 1, 0];
  const tri = (a, b, c, cen) => { p.push(...a, ...b, ...c); const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0]; const mx = (a[0] + b[0] + c[0]) / 3 - cen[0], my = (a[1] + b[1] + c[1]) / 3 - cen[1], mz = (a[2] + b[2] + c[2]) / 3 - cen[2]; if (nx * mx + ny * my + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; } const l = Math.hypot(nx, ny, nz) || 1; for (let i = 0; i < 3; i++) n.push(nx / l, ny / l, nz / l); };
  const cen = [0, 0.3, 0]; tri(A, B, Fp, cen); tri(A, Fp, E, cen); tri(D, E, Fp, cen); tri(D, Fp, C, cen); tri(A, E, D, cen); tri(B, C, Fp, cen);
  return { p, n };
}
function bladeP() { // two crossed grass blades
  const p = [], n = [];
  for (const a of [0, Math.PI / 2]) { const c = Math.cos(a) * 0.07, s = Math.sin(a) * 0.07; p.push(-c, 0, -s, c, 0, s, 0.03, 0.6, 0.05); n.push(0, 1, 0, 0, 1, 0, 0, 1, 0); }
  return { p, n };
}
function ringP(seg) { const p = [], n = []; for (let i = 0; i < seg; i++) { const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU; const o0 = [Math.cos(a0), 0, Math.sin(a0)], o1 = [Math.cos(a1), 0, Math.sin(a1)]; const i0 = o0.map(v => v * 0.86), i1 = o1.map(v => v * 0.86); p.push(...i0, ...o0, ...o1, ...i0, ...o1, ...i1); for (let k = 0; k < 6; k++) n.push(0, 1, 0); } return { p, n }; }

// --------------------------------------------------------------- shaders
const MAIN_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNorm; layout(location=2) in vec3 aCol;
layout(location=3) in vec4 aI0; layout(location=4) in vec4 aI1; layout(location=5) in vec4 aI2; layout(location=6) in vec4 aI3; layout(location=7) in vec4 aIT;
uniform mat4 uVP; uniform mat4 uModel; uniform mat4 uSVP; uniform float uTime; uniform float uSway; uniform float uSnap; uniform float uGrow;
out vec3 vCol; out vec3 vN; out vec3 vW; out vec4 vS;
void main(){
  mat4 I = mat4(aI0, aI1, aI2, aI3);
  vec3 p = aPos; p.y *= uGrow;
  vec4 w = uModel * I * vec4(p, 1.0);
  float hh = max(aPos.y, 0.0) * aIT.a;
  w.x += sin(uTime * 1.6 + w.x * 0.31 + w.z * 0.17) * uSway * hh;
  w.z += cos(uTime * 1.25 + w.z * 0.27 + w.x * 0.11) * uSway * hh * 0.7;
  vW = w.xyz; vN = mat3(uModel * I) * aNorm; vCol = aCol * aIT.rgb; vS = uSVP * w;
  vec4 c = uVP * w;
  if (uSnap > 0.0) c.xy = floor(c.xy / c.w * uSnap + 0.5) / uSnap * c.w;
  gl_Position = c;
}`;
const MAIN_FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vCol; in vec3 vN; in vec3 vW; in vec4 vS;
uniform vec3 uSun, uSunCol, uAmb, uGround, uFog, uCam; uniform float uFogN, uFogF, uFlat, uToon, uShadowOn, uFlash, uRim, uEmit, uAlpha, uSMSize;
uniform sampler2DShadow uSM;
out vec4 o;
float shade(){ if (uShadowOn < 0.5) return 1.0; vec3 p = vS.xyz / vS.w * 0.5 + 0.5; if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0; float s = 0.0; vec2 ts = vec2(1.5 / uSMSize); for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) s += texture(uSM, vec3(p.xy + vec2(x, y) * ts, p.z - 0.0018)); return s / 9.0; }
void main(){
  vec3 n = normalize(vN); vec3 v = normalize(uCam - vW);
  if (uFlat > 0.5) { n = normalize(cross(dFdx(vW), dFdy(vW))); if (dot(n, v) < 0.0) n = -n; }
  float lit = max(dot(n, uSun), 0.0) * shade();
  if (uToon > 0.5) lit = smoothstep(0.02, 0.1, lit) * 0.55 + smoothstep(0.4, 0.5, lit) * 0.45;
  vec3 amb = mix(uGround, uAmb, n.y * 0.5 + 0.5);
  vec3 col = vCol * (amb + uSunCol * lit);
  if (uRim > 0.0) { float r = pow(1.0 - max(dot(n, v), 0.0), 3.0); col += uRim * r * vec3(1.0, 0.93, 0.8) * (0.35 + 0.65 * lit); }
  col = mix(col, vCol, uEmit); col = mix(col, vec3(1.0), uFlash);
  float f = clamp((length(uCam - vW) - uFogN) / (uFogF - uFogN), 0.0, 1.0);
  col = mix(col, uFog, f * f * (3.0 - 2.0 * f));
  o = vec4(col, uAlpha);
}`;
const DEPTH_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=3) in vec4 aI0; layout(location=4) in vec4 aI1; layout(location=5) in vec4 aI2; layout(location=6) in vec4 aI3; layout(location=7) in vec4 aIT;
uniform mat4 uSVP; uniform mat4 uModel; uniform float uTime; uniform float uSway;
void main(){ vec4 w = uModel * mat4(aI0, aI1, aI2, aI3) * vec4(aPos, 1.0); float hh = max(aPos.y, 0.0) * aIT.a; w.x += sin(uTime * 1.6 + w.x * 0.31 + w.z * 0.17) * uSway * hh; w.z += cos(uTime * 1.25 + w.z * 0.27 + w.x * 0.11) * uSway * hh * 0.7; gl_Position = uSVP * w; }`;
const DEPTH_FS = `#version 300 es
precision mediump float; void main(){}`;
const SKY_VS = `#version 300 es
out vec2 vP; void main(){ vec2 P[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0)); vP = P[gl_VertexID]; gl_Position = vec4(vP, 0.99999, 1.0); }`;
const SKY_FS = `#version 300 es
precision highp float; in vec2 vP; uniform mat4 uInv; uniform vec3 uCam, uSun, uTop, uHor, uFog; uniform float uTime, uClouds, uSunSize; out vec4 o;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }
void main(){
  vec4 w = uInv * vec4(vP, 1.0, 1.0); vec3 d = normalize(w.xyz / w.w - uCam); float y = d.y;
  vec3 col = mix(uHor, uTop, pow(clamp(y, 0.0, 1.0), 0.55)); if (y < 0.0) col = mix(uHor, uFog, clamp(-y * 6.0, 0.0, 1.0));
  float s = max(dot(d, uSun), 0.0); col += vec3(1.0, 0.9, 0.7) * (pow(s, uSunSize) * 1.3 + pow(s, 10.0) * 0.16);
  if (uClouds > 0.0 && y > 0.01) { vec2 uv = d.xz / (y + 0.15) * 1.3 + vec2(uTime * 0.01, uTime * 0.004); float c = smoothstep(0.5, 0.78, fbm(uv)); vec3 cc = mix(vec3(1.0), vec3(1.0, 0.9, 0.78), s * 0.8); col = mix(col, cc, c * uClouds * smoothstep(0.01, 0.2, y)); }
  o = vec4(col, 1.0);
}`;
const WATER_VS = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uVP; uniform float uTime, uWaves, uSnap, uLevel; out vec3 vW;
void main(){ vec3 p = aPos; p.y = uLevel + uWaves * (sin(p.x * 0.35 + uTime * 1.3) * 0.12 + cos(p.z * 0.29 + uTime * 1.1) * 0.1); vW = p; vec4 c = uVP * vec4(p, 1.0); if (uSnap > 0.0) c.xy = floor(c.xy / c.w * uSnap + 0.5) / uSnap * c.w; gl_Position = c; }`;
const WATER_FS = `#version 300 es
precision highp float; in vec3 vW; uniform sampler2D uHM; uniform vec3 uCam, uSun, uSky, uFog, uDeep, uShallow; uniform float uFogN, uFogF, uTime, uFancy, uWS; out vec4 o;
void main(){
  vec2 uv = (vW.xz + uWS) / (2.0 * uWS); float th = texture(uHM, uv).r; float depth = vW.y - th;
  if (depth < -0.05) discard;
  vec3 col = mix(uShallow, uDeep, clamp(depth / 3.5, 0.0, 1.0)); float a = clamp(0.35 + depth * 0.4, 0.0, 0.92);
  if (uFancy > 0.5) {
    vec3 n = normalize(vec3(sin(vW.x * 0.9 + uTime * 1.7) * 0.05 + sin(vW.z * 1.7 - uTime * 1.3) * 0.035, 1.0, cos(vW.z * 0.8 + uTime * 1.5) * 0.05 + cos(vW.x * 1.9 + uTime) * 0.035));
    vec3 v = normalize(uCam - vW); float fr = pow(1.0 - max(dot(n, v), 0.0), 3.0); col = mix(col, uSky, fr * 0.65);
    vec3 h = normalize(v + uSun); col += pow(max(dot(n, h), 0.0), 220.0) * vec3(1.0, 0.95, 0.85) * 1.6;
    float foam = smoothstep(0.45, 0.0, depth) * (0.55 + 0.45 * sin(uTime * 2.0 + vW.x * 1.3 + vW.z)); col = mix(col, vec3(0.95, 0.98, 1.0), foam * 0.75); a = max(a, foam);
  } else { a = 0.9; col += vec3(0.06) * step(0.82, fract((vW.x * 0.7 + vW.z * 0.4) * 0.25 + uTime * 0.25)); }
  float f = clamp((length(uCam - vW) - uFogN) / (uFogF - uFogN), 0.0, 1.0); col = mix(col, uFog, f);
  o = vec4(col, a);
}`;
const PTS_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol; layout(location=2) in float aSize; uniform mat4 uVP; uniform float uScale; out vec4 vC;
void main(){ vec4 c = uVP * vec4(aPos, 1.0); gl_Position = c; gl_PointSize = clamp(aSize * uScale / c.w, 1.0, 64.0); vC = aCol; }`;
const PTS_FS = `#version 300 es
precision mediump float; in vec4 vC; uniform float uRound; out vec4 o; void main(){ vec2 d = gl_PointCoord - 0.5; if (uRound > 0.5 && dot(d, d) > 0.25) discard; o = vC; }`;

// ------------------------------------------------------------------ state
const W3D = { active: false };
window.W3D = W3D;
let api = null, gl = null, cv = null, hud = null, hc = null, ok = false;
let VW = 0, VH = 0, dpr = 1, hs = 1, rdpr = 1;
let era = 3, T = 0;
const prog = {}; let emptyVAO = null, shadowT = null, hmTex = null, target = null;
const MESH = {};
let player = null, cam = null, ents = [], projs = [], rings = [], parts = [], floaters = [], pickups = [];
let colliders = [], cgrid = new Map(), bushes = [];
let mode = 'play', dialog = null, banner = null, lvlFx = null, intro = null, eraFx = null, prompt = '', regionName = '', saveT = 0, deadT = 0;
let boss = null, grassChunks = new Map();
let VP = M(), camPos = [0, 0, 0], SVP = M();
const W = { lit: { forest: false, shore: false, sky: false }, bossDead: false, metElder: false };

// --------------------------------------------------------------- world
const WS = 200, CELL = 2, GN = WS * 2 / CELL + 1, TILE = 4, VX0 = -96, VZ0 = -66, VWT = 48, VHT = 33, WATER = -1.0;
const COURT = { x0: -26, x1: 26, z0: -104, z1: -66 }, CCX = 0, CCZ = -86;
const RIDGE = { x: 80, z: -104, r: 50, h: 46 }, MESA = { x: 112, z: -128, r: 8, h: 31 }, HEAD = { x: 136, z: 12, r: 15, h: 6 }, CLEAR = { x: -150, z: -10, r: 16 };
const STONES = [{ id: 'forest', name: 'FOREST WAYSTONE', x: -150, z: -10 }, { id: 'shore', name: 'SHORE WAYSTONE', x: 137, z: 13 }, { id: 'sky', name: 'SKY WAYSTONE', x: 112, z: -128 }];
let tiles = null, HM = null;
function hash(x, z) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z) { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf); return lerp(lerp(hash(xi, zi), hash(xi + 1, zi), u), lerp(hash(xi, zi + 1), hash(xi + 1, zi + 1), u), v); }
function fbm(x, z) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; } return s; }
function tileAt(x, z) { const tx = Math.floor((x - VX0) / TILE), tz = Math.floor((z - VZ0) / TILE); if (tx < 0 || tz < 0 || tx >= VWT || tz >= VHT) return null; return tiles[tz][tx]; }
const TH = { W: -3.2, S: -0.35, q: -1.7, '^': 7.5, X: 7.5, C: 7.5, c: 7.5, '=': -3.2 };
function tileH(tx, tz) { tx = clamp(tx, 0, VWT - 1); tz = clamp(tz, 0, VHT - 1); const h = TH[tiles[tz][tx]]; return h != null ? h : 0; }
function valleyH(x, z) { const fx = (x - VX0) / TILE - 0.5, fz = (z - VZ0) / TILE - 0.5, x0 = Math.floor(fx), z0 = Math.floor(fz), ax = fx - x0, az = fz - z0; return lerp(lerp(tileH(x0, z0), tileH(x0 + 1, z0), ax), lerp(tileH(x0, z0 + 1), tileH(x0 + 1, z0 + 1), ax), az); }
const inCourt = (x, z, m = 0) => x > COURT.x0 - m && x < COURT.x1 + m && z > COURT.z0 - m && z < COURT.z1 + m;
const inValley = (x, z, m = 0) => x > VX0 - m && x < VX0 + VWT * TILE + m && z > VZ0 - m && z < VZ0 + VHT * TILE + m;
function outsideH(x, z) {
  let h = (fbm(x * 0.018 + 11, z * 0.018 - 7) - 0.45) * 9 + 1.6;
  h += smooth(-128, -185, z) * (34 + fbm(x * 0.03, z * 0.03) * 26);
  const sea = smooth(104, 120, x); h = lerp(h, -6 - Math.max(0, x - 120) * 0.03, sea);
  const edge = Math.max(smooth(-170, -196, x), smooth(170, 196, z)); h = lerp(h, 26 + fbm(x * 0.05, z * 0.05) * 24, edge * (1 - sea));
  const dr = Math.hypot(x - RIDGE.x, z - RIDGE.z); h = Math.max(h, RIDGE.h * (1 - dr / RIDGE.r) * (0.94 + 0.06 * vnoise(x * 0.2, z * 0.2)));
  const dm = Math.hypot(x - MESA.x, z - MESA.z); if (dm < MESA.r + 3.5) h = Math.max(h, lerp(MESA.h, h, smooth(MESA.r, MESA.r + 3.5, dm)));
  const dh = Math.hypot(x - HEAD.x, z - HEAD.z); h = Math.max(h, lerp(HEAD.h, -6, smooth(HEAD.r - 5, HEAD.r + 3, dh)));
  if (x > 92 && x < 130) { const m = smooth(7.5, 4.5, Math.abs(z - 9)); const hb = lerp(1.0, HEAD.h, smooth(112, 126, x)); h = lerp(h, Math.max(h, hb), m); }
  return h;
}
function rawH(x, z) {
  const dx = Math.max(VX0 - x, 0, x - (VX0 + VWT * TILE)), dz = Math.max(VZ0 - z, 0, z - (VZ0 + VHT * TILE)); const dOut = Math.hypot(dx, dz);
  let h = valleyH(clamp(x, VX0 + 0.1, VX0 + VWT * TILE - 0.1), clamp(z, VZ0 + 0.1, VZ0 + VHT * TILE - 0.1));
  if (dOut > 0) h = lerp(h, outsideH(x, z), smooth(0, 14, dOut));
  const cdx = Math.max(COURT.x0 - x, 0, x - COURT.x1), cdz = Math.max(COURT.z0 - z, 0, z - COURT.z1); h = lerp(0, h, smooth(0, 9, Math.hypot(cdx, cdz)));
  return h;
}
function terrainH(x, z) { const fx = (x + WS) / CELL, fz = (z + WS) / CELL; const j = clamp(Math.floor(fx), 0, GN - 2), i = clamp(Math.floor(fz), 0, GN - 2); const ax = clamp(fx - j, 0, 1), az = clamp(fz - i, 0, 1); return lerp(lerp(HM[i * GN + j], HM[i * GN + j + 1], ax), lerp(HM[(i + 1) * GN + j], HM[(i + 1) * GN + j + 1], ax), az); }
function groundH(x, z) { const h = terrainH(x, z); return tileAt(x, z) === '=' ? Math.max(h, 0.25) : h; }
const isDeep = (x, z) => groundH(x, z) < -1.95;
function slopeAt(x, z) { return Math.hypot(terrainH(x + 1, z) - terrainH(x - 1, z), terrainH(x, z + 1) - terrainH(x, z - 1)) / 2; }
const C = { grass: hex('#5f9e3f'), grassD: hex('#3f7a34'), path: hex('#b8935a'), sand: hex('#d8c088'), rock: hex('#80705f'), stone: hex('#8a8f8a'), snow: hex('#dfe6ee'), bed: hex('#4a6a5a'), spring: hex('#5ac8c0') };
function colorAt(x, z, h, sl) {
  const ch = tileAt(x, z); let c;
  if (ch) { switch (ch) { case ',': c = C.path; break; case 'S': c = C.sand; break; case '^': case 'X': case 'C': case 'c': c = C.rock; break; case 'M': case 'D': c = C.stone; break; case 'q': c = C.spring; break; case 'W': case '=': c = h < -1.2 ? C.bed : C.sand; break; default: c = C.grass; } }
  else { c = x < -100 ? mixc(C.grass, C.grassD, smooth(-100, -130, x)) : C.grass; if (h < 0.5 && x > 88) c = C.sand; if (h < -1.2) c = C.bed; if (h > 26) c = mixc(C.rock, C.snow, smooth(36, 44, h)); }
  if (inCourt(x, z, 1)) c = C.stone;
  if (sl > 0.75 && ch !== ',') c = mixc(c, C.rock, smooth(0.75, 1.3, sl));
  const n = vnoise(x * 0.17, z * 0.17) * 0.14 - 0.07; return [c[0] * (1 + n), c[1] * (1 + n), c[2] * (1 + n)];
}
function regionAt(x, z) {
  if (inCourt(x, z)) return 'KEEP COURTYARD';
  if (inValley(x, z)) { const rx = Math.floor((x - VX0) / 64), rz = Math.floor((z - VZ0) / 44); return ({ '0,0': 'SPRING OF REST', '1,0': 'THE SUNKEN KEEP', '2,0': 'ROCKFALL HEIGHTS', '0,1': 'MIRROR LAKE', '1,1': 'THE CROSSROADS', '2,1': 'MERCHANT TRAIL', '0,2': 'TANGLEWOOD', '1,2': 'WILLOWMERE', '2,2': "GULL'S POINT" })[rx + ',' + rz] || ''; }
  if (x < -96) return 'WHISPERING WOODS'; if (x > 96 && z > -40) return 'SEA CLIFFS'; if (z < -66) return 'NORTHERN PEAKS'; if (z > 66) return 'SOUTHERN MEADOWS'; return 'THE WILDS';
}

// -------------------------------------------------------------- GL utils
function compile(vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); gl.attachShader(p, s); }
  gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}
function vbuf(data, loc, size) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data instanceof Float32Array ? data : new Float32Array(data), gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); return b; }
function instAttribs() { for (let i = 0; i < 5; i++) { gl.enableVertexAttribArray(3 + i); gl.vertexAttribPointer(3 + i, 4, gl.FLOAT, false, 80, i * 16); gl.vertexAttribDivisor(3 + i, 1); } }
function mkMesh(g, index) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const m = { vao, n: index ? index.length : g.p.length / 3, indexed: !!index };
  m.bp = vbuf(g.p, 0, 3); m.bn = vbuf(g.n, 1, 3); m.bc = vbuf(g.c, 2, 3);
  if (index) { m.eb = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.eb); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW); }
  gl.bindVertexArray(null); return m;
}
function mkInst(base, data) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  for (const [b, loc] of [[base.bp, 0], [base.bn, 1], [base.bc, 2]]) { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0); }
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); instAttribs();
  gl.bindVertexArray(null); return { vao, n: base.n, ib, count: data.length / 20, data };
}
const geoMesh = (fn) => { const g = new Geo(); fn(g); return mkMesh(g); };
function instData(list) { const d = new Float32Array(list.length * 20); list.forEach((it, i) => { d.set(it.m, i * 20); d[i * 20 + 16] = it.t ? it.t[0] : 1; d[i * 20 + 17] = it.t ? it.t[1] : 1; d[i * 20 + 18] = it.t ? it.t[2] : 1; d[i * 20 + 19] = it.sway || 0; }); return d; }

// ---------------------------------------------------------- model kits
const COL = { hood: hex('#e8a93a'), hoodD: hex('#b0701c'), skin: hex('#f4c9a0'), scarf: hex('#d03a3a'), tunic: hex('#3f6fc4'), tunicD: hex('#284a8a'), boot: hex('#6b4226'), blade: hex('#e2e9f4'), gold: hex('#e8c040'), hilt: hex('#7a4a22'), eye: hex('#1b1424'), white: [1, 1, 1] };
function buildModels(lo) {
  const D = lo ? 0 : 1, SEG = lo ? 5 : 8;
  const B = boxP();
  const part = fn => geoMesh(fn);
  const K = {};
  K.torso = part(g => { g.add(B, xform(0, 0.31, 0, 0, 0, 0, 0.62, 0.62, 0.42), COL.tunic); g.add(B, xform(0, 0.05, 0, 0, 0, 0, 0.64, 0.1, 0.44), COL.boot); g.add(B, xform(0, 0.62, 0, 0, 0, 0, 0.5, 0.14, 0.46), COL.scarf); g.add(B, xform(0, 0.25, 0.215, 0, 0, 0, 0.4, 0.3, 0.02), COL.tunicD); });
  K.head = part(g => { g.add(icoP(D), xform(0, 0.28, 0.02, 0, 0, 0, 0.3), COL.skin); g.add(icoP(D), xform(0, 0.36, -0.08, 0, 0, 0, 0.35, 0.36, 0.35), (x, y, z) => y < -0.2 ? COL.hoodD : COL.hood); g.add(cylP(0, 0.15, 0.4, SEG), xform(0, 0.52, -0.36, -2.1, 0, 0, 1), COL.hoodD); for (const ex of [-0.1, 0.1]) g.add(B, xform(ex, 0.3, 0.3, 0, 0, 0, 0.06, 0.1, 0.03), COL.eye); });
  K.scarfTail = part(g => g.add(B, xform(0, -0.22, 0, 0, 0, 0, 0.15, 0.45, 0.05), COL.scarf));
  K.arm = part(g => { g.add(B, xform(0, -0.2, 0, 0, 0, 0, 0.17, 0.42, 0.17), COL.tunic); g.add(B, xform(0, -0.47, 0, 0, 0, 0, 0.15, 0.14, 0.15), COL.skin); });
  K.leg = part(g => { g.add(B, xform(0, -0.18, 0, 0, 0, 0, 0.21, 0.36, 0.22), COL.tunicD); g.add(B, xform(0, -0.48, 0.03, 0, 0, 0, 0.23, 0.26, 0.31), COL.boot); });
  K.sword = part(g => { g.add(B, xform(0, 0.08, 0, 0, 0, 0, 0.06, 0.2, 0.06), COL.hilt); g.add(B, xform(0, 0.2, 0, 0, 0, 0, 0.32, 0.06, 0.09), COL.gold); g.add(B, xform(0, 0.68, 0, 0, 0, 0, 0.08, 0.9, 0.025), COL.blade); g.add(B, xform(0, 1.14, 0, 0, 0, Math.PI / 4, 0.055, 0.055, 0.025), COL.blade); });
  K.sail = part(g => { for (let i = -2; i <= 2; i++) g.add(B, xform(i * 0.5, -Math.abs(i) * 0.09, 0, 0, 0, -i * 0.18, 0.52, 0.05, 1.0), i % 2 ? COL.scarf : hex('#e85a4a')); });
  K.slime = part(g => { g.add(icoP(D + 1), xform(0, 0.55, 0, 0, 0, 0, 0.85, 0.6, 0.85), (x, y) => mixc(hex('#3f9a34'), hex('#8ade6a'), clamp(y * 0.8 + 0.4, 0, 1))); for (const ex of [-0.25, 0.25]) g.add(B, xform(ex, 0.75, 0.72, 0, 0, 0, 0.12, 0.2, 0.05), COL.eye); });
  K.crab = part(g => { const o = hex('#e0603a'), oD = hex('#a83a22'); g.add(icoP(D), xform(0, 0.55, 0, 0, 0, 0, 0.9, 0.42, 0.7), o); for (const s of [-1, 1]) { g.add(icoP(D), xform(s * 0.95, 0.6, 0.55, 0, 0, 0, 0.36, 0.28, 0.3), o); g.add(B, xform(s * 1.05, 0.62, 0.9, 0, s * 0.3, 0, 0.12, 0.12, 0.35), oD); g.add(B, xform(s * 0.22, 0.95, 0.35, 0, 0, 0, 0.07, 0.35, 0.07), oD); g.add(icoP(0), xform(s * 0.22, 1.15, 0.35, 0, 0, 0, 0.11), COL.white); for (let k = 0; k < 3; k++) g.add(B, xform(s * 0.85, 0.3, -0.3 + k * 0.3, 0, 0, s * 0.7, 0.55, 0.07, 0.07), oD); } });
  K.skelBody = part(g => { const w = hex('#eeeadc'); g.add(B, xform(0, 1.55, 0, 0, 0, 0, 0.5, 0.45, 0.45), w); for (const ex of [-0.12, 0.12]) { g.add(B, xform(ex, 1.58, 0.226, 0, 0, 0, 0.13, 0.13, 0.01), COL.eye); g.add(B, xform(ex, 1.58, 0.232, 0, 0, 0, 0.05, 0.05, 0.01), hex('#e04040')); } g.add(B, xform(0, 1.42, 0.2, 0, 0, 0, 0.3, 0.06, 0.06), COL.eye); for (let k = 0; k < 4; k++) g.add(B, xform(0, 0.9 + k * 0.12, 0, 0, 0, 0, 0.52 - k * 0.02, 0.05, 0.3), w); g.add(B, xform(0, 1.05, -0.1, 0, 0, 0, 0.06, 0.55, 0.06), w); g.add(B, xform(0, 0.75, 0, 0, 0, 0, 0.4, 0.12, 0.24), w); });
  K.bone = part(g => g.add(B, xform(0, -0.33, 0, 0, 0, 0, 0.09, 0.66, 0.09), hex('#e4e0d0')));
  K.batBody = part(g => { const p = hex('#7a4ab8'); g.add(icoP(D), xform(0, 0, 0, 0, 0, 0, 0.36, 0.34, 0.34), p); for (const s of [-1, 1]) { g.add(cylP(0, 0.1, 0.25, 4), xform(s * 0.16, 0.25, 0, 0, 0, -s * 0.3, 1), p); g.add(B, xform(s * 0.12, 0.05, 0.31, 0, 0, 0, 0.08, 0.08, 0.03), hex('#ffd447')); } });
  K.wing = part(g => g.add(B, xform(0.5, 0, 0, 0, 0, 0, 1.0, 0.04, 0.55), hex('#4e2c80')));
  K.pod = part(g => { g.add(cylP(0.08, 0.12, 0.9, SEG), xform(0, 0, 0, 0, 0, 0, 1), hex('#3f9a3c')); for (const s of [-1, 1]) g.add(B, xform(s * 0.3, 0.2, 0, 0, 0, s * 0.5, 0.5, 0.05, 0.25), hex('#5cc24a')); g.add(icoP(D), xform(0, 1.1, 0, 0, 0, 0, 0.5, 0.5, 0.35), hex('#d0508e')); g.add(icoP(D), xform(0, 1.1, 0.25, 0, 0, 0, 0.24, 0.24, 0.14), hex('#ffe066')); g.add(icoP(0), xform(0, 1.1, 0.34, 0, 0, 0, 0.12, 0.12, 0.08), hex('#4a0a1a')); });
  K.seed = part(g => g.add(icoP(0), xform(0, 0, 0, 0, 0, 0, 0.2), hex('#e8d070')));
  K.thorn = part(g => g.add(cylP(0, 0.16, 0.9, 5), xform(0, 0, -0.45, Math.PI / 2, 0, 0, 1), hex('#dcc490')));
  K.heart = part(g => { const R = ['.kk.kk.', 'krwkrrk', 'krrrrrk', 'krrrrrk', '.krrrk.', '..krk..', '...k...']; R.forEach((row, y) => row.split('').forEach((ch, x) => { if (ch !== '.') g.add(B, xform((x - 3) * 0.1, (6 - y) * 0.1, 0, 0, 0, 0, 0.1), ch === 'k' ? hex('#5a1020') : ch === 'w' ? hex('#ffb0b0') : hex('#e0343e')); })); });
  K.elder = part(g => { g.add(cylP(0.2, 0.42, 1.25, SEG), xform(0, 0, 0, 0, 0, 0, 1), hex('#7d5bb5')); g.add(icoP(D), xform(0, 1.42, 0, 0, 0, 0, 0.27), COL.skin); g.add(icoP(D), xform(0, 1.52, -0.06, 0, 0, 0, 0.3, 0.26, 0.3), hex('#d6d1e2')); for (const ex of [-0.09, 0.09]) g.add(B, xform(ex, 1.44, 0.25, 0, 0, 0, 0.05, 0.07, 0.02), COL.eye); g.add(cylP(0.04, 0.04, 1.7, 5), xform(0.42, 0, 0.1, 0, 0, 0, 1), hex('#7a5230')); g.add(icoP(0), xform(0.42, 1.75, 0.1, 0, 0, 0, 0.12), hex('#86e3e6')); });
  K.sign = part(g => { g.add(B, xform(0, 0.6, 0, 0, 0, 0, 0.14, 1.2, 0.14), hex('#5a3418')); g.add(B, xform(0, 1.2, 0, 0, 0, 0, 1.2, 0.7, 0.1), hex('#b07a3a')); for (const y of [1.32, 1.18, 1.04]) g.add(B, xform(0, y, 0.06, 0, 0, 0, 0.9, 0.05, 0.01), hex('#7a4a22')); });
  K.stone = part(g => { const st = hex('#8a8f9a'), dk = hex('#5a5e6a'); g.add(B, xform(0, 0.3, 0, 0, 0, 0, 2.4, 0.6, 2.4), dk); g.add(cylP(0.45, 0.8, 4.2, 4), xform(0, 0.6, 0, 0, Math.PI / 4, 0, 1), st); g.add(B, xform(0, 2.5, 0, 0, Math.PI / 4, 0, 1.25, 0.25, 1.25), hex('#3fa8a0')); g.add(cylP(0.6, 0.35, 0.4, 6), xform(0, 4.8, 0, 0, 0, 0, 1), dk); });
  K.flame = part(g => { g.add(icoP(1), xform(0, 0, 0, 0, 0, 0, 0.55, 0.75, 0.55), hex('#ffb03a')); g.add(icoP(1), xform(0, -0.05, 0, 0, 0, 0, 0.32, 0.45, 0.32), hex('#fff2b0')); });
  K.beam = part(g => g.add(cylP(0.5, 0.7, 1, 10), IDENT, hex('#ffd890')));
  K.ring = part(g => g.add(ringP(40), IDENT, hex('#ffb060')));
  K.dome = part(g => g.add(icoP(2), IDENT, hex('#a070ff')));
  K.trail = part(g => { const p = [], n = []; for (let i = 0; i < 10; i++) { const a0 = -1.1 + i / 10 * 2.4, a1 = -1.1 + (i + 1) / 10 * 2.4; const P = (a, r) => [Math.sin(a) * r, 0, Math.cos(a) * r]; p.push(...P(a0, 0.6), ...P(a0, 1.9), ...P(a1, 1.9), ...P(a0, 0.6), ...P(a1, 1.9), ...P(a1, 0.6)); for (let k = 0; k < 6; k++) n.push(0, 1, 0); } g.add({ p, n }, IDENT, [1, 1, 1]); });
  K.blob = part(g => { const p = [], n = []; for (let i = 0; i < 12; i++) { const a0 = i / 12 * TAU, a1 = (i + 1) / 12 * TAU; p.push(0, 0, 0, Math.cos(a1), 0, Math.sin(a1), Math.cos(a0), 0, Math.sin(a0)); n.push(0, 1, 0, 0, 1, 0, 0, 1, 0); } g.add({ p, n }, IDENT, [0, 0, 0]); });
  // the Bramble King
  const bark = hex('#5a3a26'), barkL = hex('#7a5236'), thorn = hex('#dcc490'), moss = hex('#4f7f34');
  K.kingBody = part(g => { g.add(icoP(D + 1, { k: 'kb', f: v => (vnoise(v[0] * 3 + 9, v[2] * 3 + v[1] * 2) - 0.5) * 0.25 }), xform(0, 2.2, 0, 0, 0, 0, 1.7, 1.9, 1.4), (x, y) => y > 0.5 ? moss : (x + y > 0 ? barkL : bark)); for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, yy = 1.4 + (i % 3) * 0.8; g.add(cylP(0, 0.18, 0.9, 5), xform(Math.cos(a) * 1.55, yy, Math.sin(a) * 1.25, Math.sin(a) * 1.3, 0, -Math.cos(a) * 1.3, 1), thorn); } });
  K.kingHead = part(g => { g.add(icoP(D + 1), xform(0, 0, 0, 0, 0, 0, 1.0, 0.9, 0.9), bark); for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2.4; g.add(cylP(0, 0.16, 1.0, 5), xform(Math.sin(a) * 0.7, 0.7, Math.cos(a) * 0.1 - 0.2, -0.3, 0, -Math.sin(a) * 0.8, 1), thorn); } g.add(B, xform(0, -0.25, 0.8, 0, 0, 0, 0.8, 0.12, 0.1), hex('#1a0e08')); });
  K.kingEyes = part(g => { for (const ex of [-0.35, 0.35]) g.add(B, xform(ex, 0.1, 0.82, 0, 0, 0, 0.26, 0.18, 0.06), hex('#ffd447')); });
  K.kingArm = part(g => { g.add(icoP(D), xform(0, -0.6, 0, 0, 0, 0, 0.55, 0.85, 0.55), bark); g.add(icoP(D), xform(0, -1.7, 0.1, 0, 0, 0, 0.7, 0.75, 0.7), barkL); for (let i = 0; i < 4; i++) g.add(cylP(0, 0.12, 0.6, 5), xform(Math.cos(i * 1.6) * 0.5, -1.9, Math.sin(i * 1.6) * 0.5 + 0.2, 1.2, i * 1.6, 0, 1), thorn); });
  return K;
}
function buildProps(lo) {
  const D = lo ? 0 : 1, SEG = lo ? 5 : 8, B = boxP(); const K = {};
  K.tree = geoMesh(g => { g.add(cylP(0.22, 0.34, 1.7, SEG), IDENT, hex('#6b4226')); const leaf = (x, y) => mixc(hex('#2f7d39'), hex('#5fb84f'), clamp(y * 0.5 + 0.5, 0, 1)); if (lo) g.add(icoP(0), xform(0, 2.4, 0, 0, 0, 0, 1.25, 1.15, 1.25), leaf); else { g.add(icoP(1), xform(0, 2.3, 0, 0, 0, 0, 1.15), leaf); g.add(icoP(1), xform(0.55, 2.0, 0.2, 0, 0, 0, 0.75), leaf); g.add(icoP(1), xform(-0.45, 2.05, -0.3, 0, 0, 0, 0.8), leaf); g.add(icoP(1), xform(0.05, 2.95, -0.1, 0, 0, 0, 0.7), leaf); } });
  K.pine = geoMesh(g => { g.add(cylP(0.18, 0.26, 1.0, SEG), IDENT, hex('#5a3a22')); const pc = (x, y) => mixc(hex('#1f5a35'), hex('#3f8a50'), clamp(y * 0.8, 0, 1)); g.add(cylP(0, 1.25, 1.6, SEG), xform(0, 0.8, 0, 0, 0, 0, 1), pc); g.add(cylP(0, 1.0, 1.4, SEG), xform(0, 1.7, 0, 0, 0, 0, 1), pc); g.add(cylP(0, 0.7, 1.2, SEG), xform(0, 2.6, 0, 0, 0, 0, 1), pc); });
  K.rock = geoMesh(g => g.add(icoP(D, { k: 'rock' + D, f: v => (vnoise(v[0] * 2.3 + 5, v[2] * 2.3 + v[1] * 1.7) - 0.5) * 0.45 }), xform(0, 0.35, 0, 0, 0, 0, 1, 0.75, 1), (x, y) => mixc(hex('#6f6a72'), hex('#a9a5ae'), clamp(y * 0.6 + 0.5, 0, 1))));
  K.bush = geoMesh(g => { const bc = (x, y) => mixc(hex('#3f9a3c'), hex('#7ad06a'), clamp(y + 0.5, 0, 1)); g.add(icoP(D), xform(0, 0.5, 0, 0, 0, 0, 0.75, 0.6, 0.75), bc); if (!lo) { g.add(icoP(1), xform(0.4, 0.4, 0.15, 0, 0, 0, 0.45), bc); g.add(icoP(1), xform(-0.35, 0.42, -0.2, 0, 0, 0, 0.45), bc); } });
  K.flower = geoMesh(g => { for (let i = 0; i < 5; i++) { const a = i * 2.4, r = 0.3 + (i % 2) * 0.4; const col = [hex('#ffffff'), hex('#f59ac0'), hex('#f6d24a'), hex('#b8a0ff')][i % 4]; g.add(cylP(0.02, 0.02, 0.35, 3), xform(Math.cos(a) * r, 0, Math.sin(a) * r, 0, 0, 0, 1), hex('#3f9a3c')); g.add(icoP(0), xform(Math.cos(a) * r, 0.4, Math.sin(a) * r, 0, 0, 0, 0.09), col); } });
  K.wall = geoMesh(g => { g.add(B, xform(0, 5, 0, 0, 0, 0, 4, 10, 4), (x, y) => y > 0.45 ? hex('#939e9a') : hex('#7d8884')); for (const [cx, cz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) g.add(B, xform(cx, 10.5, cz, 0, 0, 0, 1.1, 1.0, 1.1), hex('#8a958f')); g.add(B, xform(0, 2.5, 2.01, 0, 0, 0, 3.6, 0.15, 0.02), hex('#5f8c48')); });
  K.blade = mkMesh((() => { const g = new Geo(); g.add(bladeP(), IDENT, (x, y) => mixc(hex('#2f6a2a'), hex('#a8d860'), clamp(y / 0.6, 0, 1))); return g; })());
  return K;
}

// ------------------------------------------------------------- building
let PROPS = null, PROPS_LO = null, MOD = null, MOD_LO = null, STATIC = null;
const instLists = { tree: [], pine: [], rock: [], bush: [], flower: [], wall: [] };
let instHi = {}, instLo = {};
function addCol(c) { colliders.push(c); const r = c.r || Math.max(c.hx, c.hz) + 1; for (let gx = Math.floor((c.x - r) / 8); gx <= Math.floor((c.x + r) / 8); gx++) for (let gz = Math.floor((c.z - r) / 8); gz <= Math.floor((c.z + r) / 8); gz++) { const k = gx + ',' + gz; if (!cgrid.has(k)) cgrid.set(k, []); cgrid.get(k).push(c); } return c; }
function buildWorld() {
  seed = 99173;
  tiles = []; for (let ry = 0; ry < 3; ry++) for (let r = 0; r < 11; r++) { let row = ''; for (let rx = 0; rx < 3; rx++) { const R = api.ROOMS['overworld:' + rx + ',' + ry]; row += R ? R.map[r] : 'TTTTTTTTTTTTTTTT'; } tiles.push(row); }
  HM = new Float32Array(GN * GN);
  for (let i = 0; i < GN; i++) for (let j = 0; j < GN; j++) HM[i * GN + j] = rawH(-WS + j * CELL, -WS + i * CELL);
  // terrain mesh
  const p = new Float32Array(GN * GN * 3), n = new Float32Array(GN * GN * 3), c = new Float32Array(GN * GN * 3);
  for (let i = 0; i < GN; i++) for (let j = 0; j < GN; j++) {
    const k = i * GN + j, x = -WS + j * CELL, z = -WS + i * CELL, h = HM[k];
    const hl = HM[i * GN + Math.max(j - 1, 0)], hr = HM[i * GN + Math.min(j + 1, GN - 1)], hu = HM[Math.max(i - 1, 0) * GN + j], hd = HM[Math.min(i + 1, GN - 1) * GN + j];
    const nx = (hl - hr) / (2 * CELL), nz = (hu - hd) / (2 * CELL), l = Math.hypot(nx, 1, nz);
    p.set([x, h, z], k * 3); n.set([nx / l, 1 / l, nz / l], k * 3); c.set(colorAt(x, z, h, Math.hypot(nx, nz)), k * 3);
  }
  const idx = new Uint32Array((GN - 1) * (GN - 1) * 6); let q = 0;
  for (let i = 0; i < GN - 1; i++) for (let j = 0; j < GN - 1; j++) { const a = i * GN + j, b = a + 1, d = a + GN, e = d + 1; idx.set([a, d, b, b, d, e], q); q += 6; }
  STATIC = {}; STATIC.terrain = mkMesh({ p, n, c }, idx);
  // water grid
  { const WN = 100, wp = [], wi = []; for (let i = 0; i <= WN; i++) for (let j = 0; j <= WN; j++) wp.push(-WS + j * (2 * WS / WN), 0, -WS + i * (2 * WS / WN)); for (let i = 0; i < WN; i++) for (let j = 0; j < WN; j++) { const a = i * (WN + 1) + j; wi.push(a, a + WN + 1, a + 1, a + 1, a + WN + 1, a + WN + 2); }
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao); vbuf(wp, 0, 3); const eb = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, eb); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(wi), gl.STATIC_DRAW); gl.bindVertexArray(null); STATIC.water = { vao, n: wi.length }; }
  // height texture for water depth
  hmTex = gl.createTexture(); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, hmTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, GN, GN, 0, gl.RED, gl.FLOAT, HM); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.activeTexture(gl.TEXTURE0);
  // props from the valley tiles
  const B = boxP(); const village = new Geo(), castle = new Geo(), bridge = new Geo(), court = new Geo();
  const seen = new Set();
  for (let tz = 0; tz < VHT; tz++) for (let tx = 0; tx < VWT; tx++) {
    const ch = tiles[tz][tx], x = VX0 + tx * TILE + 2, z = VZ0 + tz * TILE + 2, h = terrainH(x, z);
    if (ch === 'T') { const s = 1.3 + rnd() * 0.4; instLists.tree.push({ m: trs(x + (rnd() - 0.5), h - 0.1, z + (rnd() - 0.5), rnd() * TAU, s), sway: 0.05, t: [0.9 + rnd() * 0.2, 0.9 + rnd() * 0.2, 0.9] }); addCol({ x, z, r: 0.8 }); }
    else if (ch === 'R') { const s = 1.4 + rnd() * 0.3; instLists.rock.push({ m: trs(x, h - 0.2, z, rnd() * TAU, s) }); addCol({ x, z, r: 1.3 }); }
    else if (ch === 'B') { const b = { x, z, h, idx: instLists.bush.length, alive: true }; instLists.bush.push({ m: trs(x, h, z, rnd() * TAU, 1.1), sway: 0.03 }); b.col = addCol({ x, z, r: 0.9, bush: b }); bushes.push(b); }
    else if (ch === 'F') { for (let i = 0; i < 2; i++) instLists.flower.push({ m: trs(x + (rnd() - 0.5) * 3, h, z + (rnd() - 0.5) * 3, rnd() * TAU, 1) }); }
    else if (ch === 'M' && !(tx >= 23 && tx <= 24)) { instLists.wall.push({ m: trs(x, 0, z, 0, 1) }); addCol({ x, z, hx: 2, hz: 2 }); }
    else if (ch === '=') { bridge.add(B, xform(x, 0.1, z, 0, 0, 0, 4, 0.3, 4.1), hex('#b37c40')); for (const s of [-1, 1]) bridge.add(B, xform(x + s * 1.9, 0.7, z, 0, 0, 0, 0.2, 0.9, 4), hex('#6b4226')); }
    else if ('Cc'.includes(ch)) castle.add(B, xform(x, 1.6, z + 1.95, 0, 0, 0, 2.6, 3.2, 0.2), hex('#0b0709'));
    if ('rwd'.includes(ch) && !seen.has(tx + ',' + tz)) { // flood fill a house
      const q2 = [[tx, tz]]; let x0 = tx, x1 = tx, z0 = tz, z1 = tz; while (q2.length) { const [a, b] = q2.pop(); const k = a + ',' + b; if (seen.has(k) || a < 0 || b < 0 || a >= VWT || b >= VHT || !'rwd'.includes(tiles[b][a])) continue; seen.add(k); x0 = Math.min(x0, a); x1 = Math.max(x1, a); z0 = Math.min(z0, b); z1 = Math.max(z1, b); q2.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]); }
      const cx = VX0 + (x0 + x1 + 1) / 2 * TILE, cz = VZ0 + (z0 + z1 + 1) / 2 * TILE, w = (x1 - x0 + 1) * TILE, d = (z1 - z0 + 1) * TILE;
      village.add(B, xform(cx, 2, cz, 0, 0, 0, w * 0.86, 4, d * 0.8), hex('#ead9b2')); village.add(roofP(), xform(cx, 4, cz, 0, 0, 0, w * 0.98, 2.6, d * 1.0), hex('#b5463a'));
      village.add(B, xform(cx, 1.2, cz + d * 0.4 + 0.02, 0, 0, 0, 1.3, 2.4, 0.1), hex('#6b4226')); for (const s of [-1, 1]) village.add(B, xform(cx + s * w * 0.26, 2.3, cz + d * 0.4 + 0.02, 0, 0, 0, 1.0, 0.9, 0.1), hex('#3a6aa0'));
      village.add(B, xform(cx + w * 0.25, 5.4, cz - d * 0.15, 0, 0, 0, 0.7, 1.8, 0.7), hex('#8a7a6a'));
      addCol({ x: cx, z: cz, hx: w * 0.45, hz: d * 0.42 });
    }
  }
  // castle gate arch, courtyard walls
  castle.add(B, xform(0, 8.5, -60, 0, 0, 0, 8, 3, 12), hex('#7d8884'));
  castle.add(B, xform(0, 0.02, -60, 0, 0, 0, 8, 0.04, 12), hex('#5a605c'));
  const cw = (x, z, w, d) => { court.add(B, xform(x, 6, z, 0, 0, 0, w, 12, d), (xx, y) => y > 0.45 ? hex('#939e9a') : hex('#727c78')); addCol({ x, z, hx: w / 2, hz: d / 2 }); };
  cw(-27.5, -85, 3, 40); cw(27.5, -85, 3, 40); cw(0, -105.5, 58, 3); cw(-23.5, -66, 7, 3); cw(23.5, -66, 7, 3);
  for (const s of [-1, 1]) addCol({ x: s * 6, z: -60, hx: 2, hz: 6 });
  STATIC.village = mkMesh(village); STATIC.castle = mkMesh(castle); STATIC.bridge = bridge.p.length ? mkMesh(bridge) : null; STATIC.court = mkMesh(court);
  // outside scatter
  for (let x = -196; x <= 196; x += 5) for (let z = -196; z <= 196; z += 5) {
    const px = x + (rnd() - 0.5) * 4, pz = z + (rnd() - 0.5) * 4;
    if (inValley(px, pz, 2) || inCourt(px, pz, 6)) { rnd(); rnd(); continue; }
    const h = terrainH(px, pz), sl = slopeAt(px, pz);
    if (h < -0.4 || sl > 0.8 || Math.hypot(px - CLEAR.x, pz - CLEAR.z) < CLEAR.r || STONES.some(s => Math.hypot(px - s.x, pz - s.z) < 7) || (px > 90 && px < 128 && Math.abs(pz - 9) < 7) || Math.hypot(px - HEAD.x, pz - HEAD.z) < HEAD.r || (px > -12 && px < 12 && pz > -78 && pz < -62)) { rnd(); rnd(); continue; }
    const dens = px < -100 ? 0.62 : pz < -66 ? 0.16 : pz > 66 ? 0.13 : 0.1;
    const r1 = rnd(), r2 = rnd();
    if (r1 < dens) { const pine = h > 9 || (px < -100 && r2 < 0.5); const s = 1.2 + r2 * 0.8; (pine ? instLists.pine : instLists.tree).push({ m: trs(px, h - 0.15, pz, r2 * TAU, s), sway: 0.05, t: [0.85 + r2 * 0.3, 0.9 + r1 * 0.2, 0.9] }); addCol({ x: px, z: pz, r: 0.7 * s / 1.3 }); }
    else if (r1 < dens + 0.035 + (h > 14 ? 0.06 : 0)) { const s = 1 + r2 * 1.6; instLists.rock.push({ m: trs(px, h - 0.25, pz, r2 * TAU, s) }); addCol({ x: px, z: pz, r: 0.95 * s }); }
    else if (pz > 66 && r1 < dens + 0.3) instLists.flower.push({ m: trs(px, h, pz, r2 * TAU, 1.1) });
  }
  PROPS_LO = buildProps(true); PROPS = buildProps(false); MOD_LO = buildModels(true); MOD = buildModels(false);
  for (const k in instLists) { const d = instData(instLists[k]); if (!d.length) continue; instHi[k] = mkInst(PROPS[k], d); instLo[k] = mkInst(PROPS_LO[k], d); }
  // signs, elder, waystones
  W.signs = [];
  for (let ry = 0; ry < 3; ry++) for (let rx = 0; rx < 3; rx++) { const R = api.ROOMS['overworld:' + rx + ',' + ry]; if (!R) continue; for (const npc of R.npcs) { const x = VX0 + (rx * 16 + npc.x) * TILE + 2, z = VZ0 + (ry * 11 + npc.y) * TILE + 2; if (npc.type === 'sign') W.signs.push({ x, z, text: npc.text }); if (npc.type === 'elder') W.elder = { x, z }; } }
  W.signs.push({ x: 4, z: 30, text: 'WAYSTONES\nWEST: THE WHISPERING WOODS\nEAST: THE SEA CLIFFS\nNORTH-EAST: THE SEA STACK, PAST THE RIDGE' });
  W.signs.push({ x: 44, z: -74, text: 'THE SKY WAYSTONE stands on the sea stack beyond this ridge. No one can walk there. Only a cloak that rides the wind could reach it.' });
  W.signs.push({ x: 99, z: 3, text: 'SEA CLIFFS\nThe Shore Waystone waits at the end of this rocky path. Mind the crabs.' });
  for (const s of W.signs) addCol({ x: s.x, z: s.z, r: 0.5 });
  if (!W.elder) W.elder = { x: 12, z: 46 }; addCol({ x: W.elder.x, z: W.elder.z, r: 0.6 });
  for (const s of STONES) { s.y = terrainH(s.x, s.z); addCol({ x: s.x, z: s.z, r: 1.4 }); }
  // spawns
  W.spawns = [];
  const sp = (type, x, z) => W.spawns.push({ type, x, z, ent: null, t: 0 });
  for (let ry = 0; ry < 3; ry++) for (let rx = 0; rx < 3; rx++) { const R = api.ROOMS['overworld:' + rx + ',' + ry]; if (!R) continue; for (const [t, ex, ey] of R.enemies) if (['slime', 'pod', 'skel', 'bat', 'crab'].includes(t)) sp(t, VX0 + (rx * 16 + ex) * TILE + 2, VZ0 + (ry * 11 + ey) * TILE + 2); }
  [['skel', -140, -30], ['skel', -160, 8], ['slime', -125, -5], ['slime', -135, 20], ['bat', -150, -18], ['bat', -170, -25], ['slime', -115, -40], ['skel', -130, 40],
    ['crab', 120, 9], ['crab', 130, 20], ['crab', 142, 4], ['crab', 146, 18], ['crab', 75, 52], ['crab', 88, 46],
    ['bat', 60, -88], ['bat', 85, -110], ['skel', 40, -84], ['skel', 95, -92], ['bat', 100, -80], ['slime', -40, -90], ['slime', -60, -110],
    ['slime', -20, 92], ['slime', 30, 102], ['pod', 0, 122], ['slime', 60, 86], ['pod', -50, 96], ['skel', 90, 120], ['slime', -90, 130]].forEach(a => sp(...a));
  ok = true;
}
function grassChunk(cx, cz) {
  const key = cx + ',' + cz; if (grassChunks.has(key)) return grassChunks.get(key);
  const list = []; const S = 20, N = api.touch ? 520 : 1100; let s2 = (cx * 73856093 ^ cz * 19349663) >>> 0;
  const r = () => { s2 = (s2 * 1664525 + 1013904223) >>> 0; return s2 / 4294967296; };
  for (let i = 0; i < N; i++) {
    const x = cx * S + r() * S, z = cz * S + r() * S, a = r(), b = r();
    const h = terrainH(x, z); if (h < -0.7 || inCourt(x, z, 1)) continue;
    const ch = tileAt(x, z); if (ch && !'.FTBR'.includes(ch)) continue; if (!ch && (h > 26 || (x > 88 && h < 0.6))) continue;
    if (slopeAt(x, z) > 0.6) continue;
    const k = 0.7 + b * 0.6; list.push({ m: trs(x, h - 0.05, z, a * TAU, 1, k * (1 + (x < -100 ? 0.3 : 0)), 1), sway: 1, t: [0.8 + a * 0.35, 0.85 + b * 0.25, 0.75 + a * 0.2] });
  }
  const m = list.length ? mkInst(PROPS.blade, instData(list)) : null; grassChunks.set(key, m); return m;
}

// --------------------------------------------------------------- targets
function makeShadow(size) {
  const tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE], [gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.activeTexture(gl.TEXTURE0);
  return { tex, fb, size };
}
function makeTarget(w, h, samples) {
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const cb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, cb); if (samples) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h); else gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, cb);
  const db = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, db); if (samples) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h); else gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, db);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); return { fb, cb, db, w, h, samples };
}
function freeTarget(t) { if (!t) return; gl.deleteFramebuffer(t.fb); gl.deleteRenderbuffer(t.cb); gl.deleteRenderbuffer(t.db); if (t.resolve) freeTarget(t.resolve); }
function retro() { return era < 4; }
function resize() {
  const w = innerWidth, h = innerHeight; dpr = Math.min(window.devicePixelRatio || 1, 2);
  rdpr = api.touch ? Math.min(dpr, 1.5) : dpr;
  const cw = Math.round(w * rdpr), ch = Math.round(h * rdpr);
  if (w !== VW || h !== VH || cv.width !== cw || !target || target.era !== era) {
    VW = w; VH = h; cv.width = cw; cv.height = ch; cv.style.width = w + 'px'; cv.style.height = h + 'px';
    hud.width = Math.round(w * dpr); hud.height = Math.round(h * dpr); hud.style.width = w + 'px'; hud.style.height = h + 'px';
    hs = clamp(Math.min(w, h) / 380, 1, 2.4);
    freeTarget(target);
    if (retro()) { const rh = 232, rw = Math.round(rh * w / h); target = makeTarget(rw, rh, 0); }
    else { target = makeTarget(cw, ch, api.touch ? 0 : Math.min(4, gl.getParameter(gl.MAX_SAMPLES))); if (target.samples) target.resolve = makeTarget(cw, ch, 0); }
    target.era = era;
  }
}

// ------------------------------------------------------------- entities
const ETYPES = { slime: { hp: 2, dmg: 1, r: 0.8, xp: 4 }, pod: { hp: 2, dmg: 1, r: 0.6, xp: 5 }, crab: { hp: 3, dmg: 1, r: 0.9, xp: 5 }, skel: { hp: 4, dmg: 2, r: 0.6, xp: 7 }, bat: { hp: 1, dmg: 1, r: 0.6, xp: 4 }, king: { hp: 30, dmg: 2, r: 2.6, xp: 0 } };
function spawnEnemy(type, x, z) { const e = { type, x, z, y: groundH(x, z) + (type === 'bat' ? 3 : 0), vx: 0, vy: 0, vz: 0, yaw: rnd() * TAU, hp: ETYPES[type].hp, inv: 0, kb: 0, t: rnd() * 5, timer: rnd() * 1.5, state: 'idle', anim: 0, flash: 0, ground: true, hx: x, hz: z }; ents.push(e); return e; }
function makePlayer(x, z, yaw) { return { x, z, y: groundH(x, z), vx: 0, vz: 0, vy: 0, yaw: yaw || 0, ground: true, inv: 0, kbT: 0, swing: 0, hit: null, stam: 1, glide: false, anim: 0, moveAmt: 0, safe: [x, z], safeT: 0, exhausted: false }; }

// ----------------------------------------------------------- public API
W3D.init = function (a) { api = a; };
W3D.start = function (opts) {
  if (!gl) {
    cv = document.getElementById('g3d'); hud = document.getElementById('h3d'); hc = hud.getContext('2d');
    gl = cv.getContext('webgl2', { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance' });
    if (!gl) return false;
    prog.main = compile(MAIN_VS, MAIN_FS); prog.depth = compile(DEPTH_VS, DEPTH_FS); prog.sky = compile(SKY_VS, SKY_FS); prog.water = compile(WATER_VS, WATER_FS); prog.pts = compile(PTS_VS, PTS_FS);
    gl.vertexAttrib4f(3, 1, 0, 0, 0); gl.vertexAttrib4f(4, 0, 1, 0, 0); gl.vertexAttrib4f(5, 0, 0, 1, 0); gl.vertexAttrib4f(6, 0, 0, 0, 1); gl.vertexAttrib4f(7, 1, 1, 1, 0);
    emptyVAO = gl.createVertexArray();
    shadowT = makeShadow(api.touch ? 1024 : 2048);
    MESH.pts = { vao: gl.createVertexArray(), buf: gl.createBuffer() }; gl.bindVertexArray(MESH.pts.vao); gl.bindBuffer(gl.ARRAY_BUFFER, MESH.pts.buf); gl.bufferData(gl.ARRAY_BUFFER, 4000 * 32, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 28); gl.bindVertexArray(null);
    buildWorld();
    attachInput();
  }
  const S = api.S; const w3 = S.w3 || (S.w3 = {});
  Object.assign(W.lit, w3.lit || {}); W.bossDead = !!w3.bossDead; W.metElder = !!w3.metElder;
  era = Math.max(3, Math.min(4, S.era || 3)); target = null;
  let x = opts.x, z = opts.z, yaw = opts.yaw || 0;
  if (x == null) { x = w3.x != null ? w3.x : W.elder.x; z = w3.z != null ? w3.z : W.elder.z + 4; yaw = w3.yaw || Math.PI; }
  if (isDeep(x, z)) { x = W.elder.x; z = W.elder.z + 4; }
  player = makePlayer(x, z, yaw); cam = { yaw: yaw + Math.PI, pitch: 0.32, dist: era >= 4 ? 10 : 8.5, idle: 0 };
  ents = []; projs = []; rings = []; parts = []; floaters = []; pickups = [];
  for (const s of W.spawns) { s.ent = null; s.t = 0; }
  boss = null; if (!W.bossDead) { boss = spawnEnemy('king', CCX, CCZ - 6); boss.state = 'dormant'; boss.yaw = 0; }
  mode = 'play'; dialog = null; banner = null; lvlFx = null; eraFx = null; regionName = '';
  intro = opts.intro ? { t: 0, dur: 4.2 } : null;
  if (intro) mode = 'intro';
  W3D.active = true; cv.style.display = 'block'; hud.style.display = 'block';
  resize(); api.SND.music('over');
  return true;
};
W3D.stop = function () { W3D.active = false; if (cv) { cv.style.display = 'none'; hud.style.display = 'none'; } };
W3D.setEra = function (e, fx) { if (fx) { eraFx = { t: 0, from: era, to: e }; } else { era = e; target = null; } };
W3D.levelUp = function (lv) { lvlFx = { t: 0, lv }; if (lv >= 4 && era < 4) W3D.setEra(4, true); };
W3D.floatXP = function (n, x, y, z) { floaters.push({ x, y, z, t: 0, text: '+' + n + ' XP' }); };
function persist() { const S = api.S; S.w3 = { x: player.x, z: player.z, yaw: player.yaw, lit: Object.assign({}, W.lit), bossDead: W.bossDead, metElder: W.metElder }; api.save(); }

// ----------------------------------------------------------------- input
let drag = null;
function attachInput() {
  cv.addEventListener('pointerdown', e => { api.SND.init(); drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch (_) { } api.tap(); });
  cv.addEventListener('pointermove', e => { if (!drag || drag.id !== e.pointerId || !cam) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; cam.yaw -= dx * 0.006; cam.pitch = clamp(cam.pitch + dy * 0.004, 0.05, 1.15); cam.idle = 0; });
  const end = e => { if (drag && drag.id === e.pointerId) drag = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', e => { if (cam) cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * 0.8, 5, 16); e.preventDefault(); }, { passive: false });
}

// ----------------------------------------------------------------- update
const STATS = () => ({ walk: era >= 4 ? 9.5 : 8.5, run: 14.5, jump: 9.6, grav: 26, glideSink: 2.4, glideSpeed: 11, dmg: era >= 4 ? 2 : 1 });
function say3(text, onClose) { dialog = { pages: api.wrapText(text, 34), page: 0, chars: 0, onClose }; mode = 'dialog'; }
function update(dt, I) {
  const S = api.S; T += dt;
  if (eraFx) { eraFx.t += dt; if (eraFx.t >= 0.6 && era !== eraFx.to) { era = eraFx.to; target = null; cam.dist = 10; } if (eraFx.t >= 2.6) eraFx = null; }
  if (lvlFx) { lvlFx.t += dt; if (lvlFx.t > 3.2) lvlFx = null; }
  if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
  for (const f of floaters) f.t += dt; floaters = floaters.filter(f => f.t < 1.4);
  updateParts(dt);
  switch (mode) {
    case 'intro': intro.t += dt; if (intro.t >= intro.dur || (intro.t > 1 && (I.pressed.start || I.pressed.a))) { intro = null; mode = 'play'; if (!W.metElder) say3(["A voice on the wind: Wren... you've grown. The world has grown with you.", 'The Bramble King stirs behind the old keep, held by a fading seal. Light the three WAYSTONES to break the seal, then end this.', 'The village elder will know more. She waits by her house in Willowmere.', api.touch ? 'Move with the D-pad, B jumps, A swings and talks. Drag the screen to look around.' : 'Move with WASD or the arrows. Space or X jumps, Z swings and talks. Drag the mouse (or Q/E) to look around.'], null); } return;
    case 'dialog': {
      const D = dialog, page = D.pages[D.page], total = page.join('').length;
      if (D.chars < total) D.chars += dt * 52;
      if (I.pressed.a || I.pressed.start || I.pressed.tap) { if (D.chars < total) D.chars = total; else { D.page++; D.chars = 0; if (D.page >= D.pages.length) { dialog = null; mode = 'play'; if (D.onClose) D.onClose(); } } }
      return;
    }
    case 'pause': if (I.pressed.start || I.pressed.tap) mode = 'play'; return;
    case 'dead': deadT += dt; if (deadT > 1.2 && (I.pressed.start || I.pressed.a || I.pressed.tap)) respawn(); return;
    case 'victory': deadT += dt; if (deadT > 2 && (I.pressed.start || I.pressed.a || I.pressed.tap)) { mode = 'play'; api.SND.music('over'); persist(); } return;
  }
  if (I.pressed.start) { mode = 'pause'; return; }
  S.stats.time += dt;
  updatePlayer(dt, I); if (mode !== 'play') return;
  updateEnemies(dt); if (mode !== 'play') return;
  updateProjs(dt);
  updateSpawns(dt);
  // pickups
  for (const pk of pickups) { pk.t += dt; if (Math.hypot(pk.x - player.x, pk.z - player.z) < 1.4 && Math.abs(pk.y - player.y) < 2) { pk.dead = true; S.hp = Math.min(S.maxHp, S.hp + 2); api.SND.sfx('heart'); burst(pk.x, pk.y + 0.6, pk.z, [1, 0.5, 0.5], 10, 3); } if (pk.t > 20) pk.dead = true; }
  pickups = pickups.filter(p => !p.dead);
  // region banner
  const rg = regionAt(player.x, player.z); if (rg && rg !== regionName) { regionName = rg; banner = { text: rg, t: 2.4 }; }
  // elder, signs, stones prompt
  prompt = ''; const near = nearestInteract(); if (near) prompt = near.label;
  // seal & boss trigger
  if (seal() && inCourt(player.x, player.z, 1)) { const c = clampOut(player.x, player.z); player.x = c[0]; player.z = c[1]; }
  if (boss && boss.state === 'dormant' && !seal() && inCourt(player.x, player.z, -3)) { boss.state = 'wake'; boss.timer = 1.6; banner = { text: 'THE BRAMBLE KING', t: 3 }; api.SND.music('boss'); W.trap = true; cam.yaw = Math.atan2(player.x - boss.x, player.z - boss.z); cam.idle = 0; }
  saveT += dt; if (saveT > 6) { saveT = 0; persist(); }
}
const seal = () => !(W.lit.forest && W.lit.shore && W.lit.sky);
function clampOut(x, z) { const c = COURT, m = 1.2; const d = [x - (c.x0 - m), (c.x1 + m) - x, z - (c.z0 - m), (c.z1 + m) - z]; const i = d.indexOf(Math.min(...d)); return i === 0 ? [c.x0 - m, z] : i === 1 ? [c.x1 + m, z] : i === 2 ? [x, c.z0 - m] : [x, c.z1 + m]; }
function nearestInteract() {
  const px = player.x, pz = player.z; let best = null, bd = 1e9;
  const consider = (d, o) => { if (d < bd) { bd = d; best = o; } };
  if (W.elder) { const d = Math.hypot(W.elder.x - px, W.elder.z - pz); if (d < 3.2) consider(d, { kind: 'elder', label: 'A: TALK' }); }
  for (const s of W.signs) { const d = Math.hypot(s.x - px, s.z - pz); if (d < 2.6) consider(d, { kind: 'sign', s, label: 'A: READ' }); }
  for (const s of STONES) { const d = Math.hypot(s.x - px, s.z - pz); if (d < 4.2 && Math.abs(player.y - s.y) < 3 && !W.lit[s.id]) consider(d, { kind: 'stone', s, label: 'A: LIGHT THE WAYSTONE' }); }
  return best;
}
function interact(o) {
  if (o.kind === 'sign') { say3(o.s.text); return; }
  if (o.kind === 'elder') {
    W.metElder = true; const n = Object.values(W.lit).filter(Boolean).length;
    if (W.bossDead) say3(['You did it, Wren. The Bramble King is gone and the vale is ours again.', 'Go on, explore! The world is so much bigger than it used to be.']);
    else if (n === 0) say3(['Wren! Look at you, and look at the world! Everything has... depth now.', 'The thief who took our relics served the BRAMBLE KING. He sleeps behind the keep, inside a seal of old magic.', 'Light the three WAYSTONES: one in the Whispering Woods to the west, one on the Sea Cliffs to the east, and one on the sea stack past the north-east ridge.', 'Follow the signs and your radar. When the beams of light are lit, the seal will break.'], () => persist());
    else if (n < 3) say3([`${n} of 3 Waystones burn. I can see the beams from here!`, !W.lit.sky ? (era >= 4 ? 'For the sea stack, climb the ridge and leap off it. Hold JUMP in the air and your cloak will catch the wind.' : 'The sea stack is out of reach for now. Keep growing stronger, Wren. I sense your cloak will one day ride the wind.') : 'Only one more!']);
    else say3(['All three Waystones are lit, and the seal is broken! The keep\'s gate is open.', 'Go through the keep to its courtyard. End this, Wren.']);
    return;
  }
  if (o.kind === 'stone') {
    const s = o.s; W.lit[s.id] = true; api.SND.sfx('secret'); burst(s.x, s.y + 5, s.z, [1, 0.8, 0.4], 40, 6);
    const n = Object.values(W.lit).filter(Boolean).length;
    banner = { text: `${s.name} LIT (${n}/3)`, t: 3 }; api.gainXP(40, s.x, s.y + 5, s.z);
    if (n === 3) setTimeout(() => { banner = { text: 'THE SEAL IS BROKEN - THE KEEP IS OPEN', t: 3.5 }; api.SND.sfx('door'); }, 1800);
    persist();
  }
}
function moveWish(I) {
  let ix = (I.held.right ? 1 : 0) - (I.held.left ? 1 : 0), iy = (I.held.down ? 1 : 0) - (I.held.up ? 1 : 0);
  if (I.ax || I.ay) { ix = I.ax; iy = I.ay; }
  const m = Math.min(1, Math.hypot(ix, iy)); if (m < 0.12) return null;
  const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw); const fx = -s, fz = -c, rx = c, rz = -s;
  const wx = fx * -iy + rx * ix, wz = fz * -iy + rz * ix, l = Math.hypot(wx, wz) || 1; return { x: wx / l, z: wz / l, m };
}
function blockedAt(x, z, fromX, fromZ) {
  if (Math.abs(x) > WS - 4 || Math.abs(z) > WS - 4) return true;
  if (isDeep(x, z)) return true;
  const g0 = groundH(fromX, fromZ), g1 = groundH(x, z), d = Math.hypot(x - fromX, z - fromZ) || 1e-6;
  if (player.ground) { if ((g1 - g0) / d > 1.25 && g1 > player.y + 0.25) return true; }
  else if (g1 > player.y + 0.3) return true;
  if (W.trap && !inCourt(x, z, -0.5) && inCourt(fromX, fromZ, -0.5)) return true;
  if (!seal() || W.bossDead) { /* gate open */ } else if (x > -4 && x < 4 && z < -53.5 && z > -66) return true;
  return false;
}
function resolveCols(o, r) {
  const gx = Math.floor(o.x / 8), gz = Math.floor(o.z / 8);
  for (let a = gx - 1; a <= gx + 1; a++) for (let b = gz - 1; b <= gz + 1; b++) {
    const list = cgrid.get(a + ',' + b); if (!list) continue;
    for (const c of list) {
      if (c.bush && !c.bush.alive) continue;
      if (c.r) { const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz), m = c.r + r; if (d < m && d > 1e-4) { o.x = c.x + dx / d * m; o.z = c.z + dz / d * m; } }
      else { const dx = o.x - c.x, dz = o.z - c.z, px = c.hx + r - Math.abs(dx), pz = c.hz + r - Math.abs(dz); if (px > 0 && pz > 0) { if (px < pz) o.x += Math.sign(dx || 1) * px; else o.z += Math.sign(dz || 1) * pz; } }
    }
  }
}
function updatePlayer(dt, I) {
  const S = api.S, ST = STATS(), p = player;
  p.inv = Math.max(0, p.inv - dt);
  if (p.y < WATER - 1.6 || isDeep(p.x, p.z)) { p.x = p.safe[0]; p.z = p.safe[1]; p.y = groundH(p.x, p.z); p.vy = 0; hurt(1, null); if (mode !== 'play') return; }
  // camera keys
  if (I.held.camL) { cam.yaw += dt * 2; cam.idle = 0; } if (I.held.camR) { cam.yaw -= dt * 2; cam.idle = 0; }
  const w = p.kbT > 0 ? null : moveWish(I);
  let speed = ST.walk;
  const canRun = era >= 4 && I.held.run && w && p.ground && !p.exhausted && p.stam > 0;
  if (canRun) { speed = ST.run; p.stam = Math.max(0, p.stam - dt * 0.28); }
  if (p.swing > 0) speed *= 0.35;
  let tvx = 0, tvz = 0; if (w) { tvx = w.x * speed * w.m; tvz = w.z * speed * w.m; p.yaw = p.yaw + angDiff(p.yaw, Math.atan2(w.x, w.z)) * Math.min(1, dt * 14); }
  if (p.kbT > 0) { p.kbT -= dt; } else { const k = p.ground ? 14 : (p.glide ? 3 : 4); p.vx = lerp(p.vx, tvx, Math.min(1, dt * k)); p.vz = lerp(p.vz, tvz, Math.min(1, dt * k)); }
  // jump & glide
  if (I.pressed.b && p.ground) { p.vy = ST.jump; p.ground = false; api.SND.sfx('place'); }
  p.glide = era >= 4 && !p.ground && I.held.b && p.vy < 0.5 && p.stam > 0 && !p.exhausted;
  if (p.glide) { p.vy = Math.max(p.vy - ST.grav * dt, -ST.glideSink); const gs = ST.glideSpeed; const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw); p.vx = lerp(p.vx, fx * gs * (w ? 1 : 0.6), dt * 2); p.vz = lerp(p.vz, fz * gs * (w ? 1 : 0.6), dt * 2); p.stam = Math.max(0, p.stam - dt * 0.09); if (rnd() < 0.3) parts.push({ x: p.x + (rnd() - 0.5) * 2, y: p.y + 2, z: p.z + (rnd() - 0.5) * 2, vx: -p.vx * 0.2, vy: 0, vz: -p.vz * 0.2, life: 0.5, max: 0.5, c: [1, 1, 1, 0.5], s: 3 }); }
  else p.vy -= ST.grav * dt;
  if (p.ground && !canRun && !p.glide) p.stam = Math.min(1, p.stam + dt * 0.35);
  if (p.stam <= 0) p.exhausted = true; if (p.exhausted && p.stam > 0.35) p.exhausted = false;
  // horizontal move in substeps
  const steps = Math.max(1, Math.ceil(Math.hypot(p.vx, p.vz) * dt / 0.35));
  for (let i = 0; i < steps; i++) {
    const dx = p.vx * dt / steps, dz = p.vz * dt / steps;
    if (!blockedAt(p.x + dx, p.z + dz, p.x, p.z)) { p.x += dx; p.z += dz; }
    else if (!blockedAt(p.x + dx, p.z, p.x, p.z)) p.x += dx;
    else if (!blockedAt(p.x, p.z + dz, p.x, p.z)) p.z += dz;
    resolveCols(p, 0.45);
  }
  // vertical
  const g = groundH(p.x, p.z);
  p.y += p.vy * dt;
  if (p.y <= g) { if (!p.ground && p.vy < -22) hurt(1, null); p.y = g; p.vy = 0; p.ground = true; }
  else if (p.ground && p.y - g < 0.7 && p.vy <= 0) { p.y = g; }
  else p.ground = false;
  if (p.ground && g > WATER - 0.3) { p.safeT += dt; if (p.safeT > 0.5) { p.safe = [p.x, p.z]; p.safeT = 0; } }
  const hm = Math.hypot(p.vx, p.vz); p.moveAmt = lerp(p.moveAmt, clamp(hm / ST.walk, 0, 1.4), Math.min(1, dt * 10)); p.anim += dt * (4 + hm * 0.9);
  // camera auto-follow
  cam.idle += dt;
  if (W.trap && boss && boss.state !== 'dormant') { if (cam.idle > 0.6) cam.yaw += angDiff(cam.yaw, Math.atan2(p.x - boss.x, p.z - boss.z)) * Math.min(1, dt * 2.2); }
  else if (w && cam.idle > 1.2 && !p.glide) cam.yaw += angDiff(cam.yaw, p.yaw + Math.PI) * Math.min(1, dt * 0.9);
  // spring heal
  if (tileAt(p.x, p.z) === 'q' && S.hp < S.maxHp) { p.heal = (p.heal || 0) + dt; if (p.heal > 0.4) { p.heal = 0; S.hp++; api.SND.sfx('heart'); burst(p.x, p.y + 1.5, p.z, [0.6, 1, 1], 6, 2); } }
  // sword / interact
  if (p.swing > 0) {
    p.swing -= dt; const k = 1 - p.swing / 0.32;
    if (k > 0.15 && k < 0.8) {
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      for (const e of ents) { if (e.dead || p.hit.has(e) || e.state === 'dormant' || e.state === 'dying') continue; const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz) - ETYPES[e.type].r; if (d > 2.4 || Math.abs((e.y + (e.type === 'king' ? 2 : 0.6)) - (p.y + 1)) > (e.type === 'king' ? 4 : 2.2)) continue; if ((dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1) < 0.25) continue; p.hit.add(e); hitEnemy(e, ST.dmg, fx, fz); }
      for (const pr of projs) { if (pr.dead) continue; const dx = pr.x - p.x, dz = pr.z - p.z; if (Math.hypot(dx, dz) < 2.6 && (dx * fx + dz * fz) > 0 && Math.abs(pr.y - p.y - 1) < 2) { pr.dead = true; burst(pr.x, pr.y, pr.z, [1, 1, 0.8], 8, 4); api.SND.sfx('hit'); } }
      for (const b of bushes) { if (!b.alive) continue; const dx = b.x - p.x, dz = b.z - p.z; if (Math.hypot(dx, dz) < 2.4 && (dx * fx + dz * fz) > 0) cutBush(b); }
    }
  } else if (I.pressed.a) {
    const near = nearestInteract(); if (near) { interact(near); return; }
    p.swing = 0.32; p.hit = new Set(); api.SND.sfx('sword');
  }
}
function cutBush(b) { b.alive = false; const d = instHi.bush.data; d.set(trs(b.x, -50, b.z, 0, 0.001), b.idx * 20); for (const m of [instHi.bush, instLo.bush]) { gl.bindBuffer(gl.ARRAY_BUFFER, m.ib); gl.bufferSubData(gl.ARRAY_BUFFER, b.idx * 80, d.subarray(b.idx * 20, b.idx * 20 + 16)); } api.SND.sfx('cut'); burst(b.x, b.h + 0.6, b.z, [0.4, 0.8, 0.3], 14, 4); if (rnd() < 0.25) pickups.push({ x: b.x, y: b.h + 0.3, z: b.z, t: 0 }); }
function hurt(dmg, src) {
  const S = api.S, p = player; if (p.inv > 0 || mode !== 'play') return;
  S.hp = Math.max(0, S.hp - dmg); p.inv = 1; api.SND.sfx('hurt');
  if (src) { const dx = p.x - src.x, dz = p.z - src.z, d = Math.hypot(dx, dz) || 1; p.vx = dx / d * 12; p.vz = dz / d * 12; p.kbT = 0.18; if (p.ground) { p.vy = 4; p.ground = false; } }
  if (S.hp <= 0) { mode = 'dead'; deadT = 0; S.stats.deaths++; api.SND.music(null); api.SND.sfx('die'); }
}
function respawn() {
  const S = api.S; S.hp = S.maxHp; mode = 'play';
  const inFight = W.trap; W.trap = false;
  if (inFight && boss && !W.bossDead) { boss.hp = ETYPES.king.hp; boss.state = 'dormant'; boss.x = CCX; boss.z = CCZ - 6; ents = ents.filter(e => e === boss || e.type !== 'slime' || !e.summoned); player = makePlayer(0, -50, Math.PI); }
  else player = makePlayer(W.elder.x, W.elder.z + 4, Math.PI);
  cam.yaw = player.yaw + Math.PI; projs = []; rings = []; api.SND.music('over'); persist();
}
function hitEnemy(e, dmg, fx, fz) {
  if (e.inv > 0) return; e.hp -= dmg; e.inv = e.type === 'king' ? 0.35 : 0.25; e.flash = 0.15;
  burst(e.x, e.y + (e.type === 'king' ? 2.5 : 0.8), e.z, [1, 1, 0.85], 10, 5);
  if (e.type !== 'king' && e.type !== 'pod') { e.vx = fx * 10; e.vz = fz * 10; e.kb = 0.2; if (e.type !== 'bat') e.vy = 3; }
  api.SND.sfx(e.type === 'king' ? 'bossHit' : 'hit');
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  const S = api.S; S.stats.kills++;
  if (e.type === 'king') { e.state = 'dying'; e.timer = 3; api.SND.music(null); projs = []; rings = []; for (const o of ents) if (o !== e && !o.dead) { o.dead = true; burst(o.x, o.y + 0.6, o.z, [1, 1, 1], 10, 4); } return; }
  e.dead = true; api.SND.sfx('kill'); burst(e.x, e.y + 0.6, e.z, [1, 1, 1], 14, 5); burst(e.x, e.y + 0.6, e.z, [1, 0.85, 0.3], 8, 3);
  if (!e.summoned) api.gainXP(ETYPES[e.type].xp, e.x, e.y + 1.5, e.z);
  if (rnd() < 0.18) pickups.push({ x: e.x, y: groundH(e.x, e.z) + 0.3, z: e.z, t: 0 });
}
function updateSpawns(dt) {
  for (const s of W.spawns) {
    const d = Math.hypot(s.x - player.x, s.z - player.z);
    if (s.ent && s.ent.dead) { s.ent = null; s.t = 0; }
    if (!s.ent) { s.t += dt; if ((s.t > 40 || !s.used) && d > 30 && d < 90) { s.used = true; s.ent = spawnEnemy(s.type, s.x, s.z); } }
    else if (d > 120) { s.ent.dead = true; s.ent = null; s.used = false; }
  }
  ents = ents.filter(e => !e.dead || e === boss);
}
function enemyMove(e, dt, r) {
  const nx = e.x + e.vx * dt, nz = e.z + e.vz * dt;
  if (!isDeep(nx, nz) && Math.abs(groundH(nx, nz) - groundH(e.x, e.z)) < 1.0 + (e.ground ? 0 : 1) && !(seal() && inCourt(nx, nz, 1) && e.type !== 'king') && !(W.trap && e.type !== 'king' && !inCourt(nx, nz, -1) && inCourt(e.x, e.z, -1))) { e.x = nx; e.z = nz; } else { e.vx *= -0.5; e.vz *= -0.5; }
  resolveCols(e, r);
}
function updateEnemies(dt) {
  const p = player;
  for (const e of ents) {
    if (e.dead) continue; const ET = ETYPES[e.type];
    e.t += dt; e.inv = Math.max(0, e.inv - dt); e.flash = Math.max(0, e.flash - dt);
    const dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz);
    if (dist > 75 && e.type !== 'king') continue;
    if (e.type === 'king') { updateKing(e, dt, dist, dx, dz); if (mode !== 'play') return; continue; }
    if (e.kb > 0) { e.kb -= dt; enemyMove(e, dt, ET.r); }
    else switch (e.type) {
      case 'slime': {
        e.timer -= dt;
        if (e.ground && e.timer <= 0) { const chase = dist < 20; const a = chase ? Math.atan2(dx, dz) + (rnd() - 0.5) * 0.6 : rnd() * TAU; const sp = chase ? 5.5 : 2.5; e.vx = Math.sin(a) * sp; e.vz = Math.cos(a) * sp; e.vy = 5.5; e.ground = false; e.yaw = a; e.timer = 0.8 + rnd() * 0.7; }
        if (!e.ground) enemyMove(e, dt, ET.r); break;
      }
      case 'crab': {
        e.timer -= dt; if (e.timer <= 0) { e.timer = 0.6 + rnd() * 0.8; const a = Math.atan2(dx, dz); if (dist < 22) { const side = rnd() < 0.5 ? 1 : -1; const dash = rnd() < 0.35; const ang = dash ? a : a + side * Math.PI / 2; const sp = dash ? 8 : 5; e.vx = Math.sin(ang) * sp; e.vz = Math.cos(ang) * sp; e.yaw = a; } else { const r = rnd() * TAU; e.vx = Math.sin(r) * 2; e.vz = Math.cos(r) * 2; } }
        enemyMove(e, dt, ET.r); break;
      }
      case 'skel': {
        if (dist < 26) { const a = Math.atan2(dx, dz); e.yaw = e.yaw + angDiff(e.yaw, a) * Math.min(1, dt * 6); const sp = dist < 3 ? 1.5 : 3.8; e.vx = Math.sin(e.yaw) * sp; e.vz = Math.cos(e.yaw) * sp; }
        else { e.timer -= dt; if (e.timer <= 0) { e.timer = 2 + rnd() * 2; e.yaw = rnd() * TAU; } e.vx = Math.sin(e.yaw) * 1.2; e.vz = Math.cos(e.yaw) * 1.2; }
        enemyMove(e, dt, ET.r); break;
      }
      case 'bat': {
        e.timer -= dt; const gy = groundH(e.x, e.z);
        if (e.timer <= 0) { e.timer = 1.2 + rnd() * 1.5; e.swoop = dist < 18 && rnd() < 0.6; }
        let a = e.swoop ? Math.atan2(dx, dz) : e.yaw + Math.sin(e.t * 1.3) * 0.08; e.yaw = a; const sp = e.swoop ? 7 : 4;
        e.x += Math.sin(a) * sp * dt; e.z += Math.cos(a) * sp * dt; const ty = e.swoop ? p.y + 1 : gy + 3 + Math.sin(e.t * 2) * 0.5; e.y = lerp(e.y, Math.max(ty, gy + 0.6), dt * 3);
        if (isDeep(e.x, e.z) && e.y < WATER + 1) e.y = WATER + 2; break;
      }
      case 'pod': {
        e.yaw = Math.atan2(dx, dz); e.timer -= dt; if (e.timer <= 0) { e.timer = 2.4 + rnd(); if (dist < 28) { const d3 = Math.hypot(dx, p.y + 1 - (e.y + 1.1), dz) || 1; projs.push({ kind: 'seed', x: e.x, y: e.y + 1.1, z: e.z, vx: dx / d3 * 13, vy: (p.y + 1 - e.y - 1.1) / d3 * 13, vz: dz / d3 * 13, life: 3, dmg: 1 }); api.SND.sfx('shoot'); e.mouth = 0.3; } } break;
      }
    }
    if (e.type !== 'bat') { const g = groundH(e.x, e.z); if (!e.ground || e.kb > 0) { e.vy -= 26 * dt; e.y += e.vy * dt; if (e.y <= g) { e.y = g; e.vy = 0; e.ground = true; if (e.type === 'slime') { e.vx = 0; e.vz = 0; } } } else e.y = g; }
    if (p.inv <= 0 && dist < ET.r + 0.45 && Math.abs(p.y - e.y) < 1.6) hurt(ET.dmg, e);
    if (mode !== 'play') return;
  }
}
function updateKing(e, dt, dist, dx, dz) {
  const p = player, ph2 = e.hp <= ETYPES.king.hp / 2;
  if (e.state === 'dormant') { e.y = 0; return; }
  if (e.state === 'dying') { e.timer -= dt; if (rnd() < 0.5) { burst(e.x + (rnd() - 0.5) * 4, 1 + rnd() * 5, e.z + (rnd() - 0.5) * 4, [1, 0.7, 0.3], 8, 6); if (rnd() < 0.15) api.SND.sfx('pop'); } if (e.timer <= 0) { e.dead = true; boss = null; W.bossDead = true; W.trap = false; api.SND.sfx('boom'); burst(e.x, 3, e.z, [1, 0.9, 0.5], 80, 12); persist(); mode = 'victory'; deadT = 0; api.SND.music('win'); } return; }
  e.yaw = e.yaw + angDiff(e.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 2.5);
  e.timer -= dt;
  if (e.state === 'wake') { e.y = Math.sin(e.t * 20) * 0.05; if (e.timer <= 0) { e.state = 'walk'; e.timer = 2; } return; }
  if (e.state === 'walk') {
    if (dist > 7) { const sp = ph2 ? 3.6 : 2.6; e.x += Math.sin(e.yaw) * sp * dt; e.z += Math.cos(e.yaw) * sp * dt; e.x = clamp(e.x, COURT.x0 + 4, COURT.x1 - 4); e.z = clamp(e.z, COURT.z0 + 4, COURT.z1 - 4); }
    if (e.timer <= 0) { const r = rnd(); e.state = (dist < 9 || r < 0.45) ? 'slam' : (ph2 && r > 0.8 && ents.filter(o => o.summoned && !o.dead).length < 3) ? 'summon' : 'volley'; e.timer = e.state === 'slam' ? 1.0 : 0.7; }
  } else if (e.state === 'slam') {
    if (e.timer <= 0) { rings.push({ x: e.x + Math.sin(e.yaw) * 2.5, z: e.z + Math.cos(e.yaw) * 2.5, r: 1, sp: 13, life: 2.6 }); if (ph2) setTimeout(() => { if (boss && boss.state !== 'dying') rings.push({ x: e.x, z: e.z, r: 1, sp: 16, life: 2.4 }); }, 550); api.SND.sfx('slam'); burst(e.x + Math.sin(e.yaw) * 2.5, 0.3, e.z + Math.cos(e.yaw) * 2.5, [0.7, 0.6, 0.45], 30, 8); e.state = 'recover'; e.timer = 1.1; }
  } else if (e.state === 'volley') {
    if (e.timer <= 0) { const n = ph2 ? 7 : 5, base = Math.atan2(dx, dz); for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * 0.16; projs.push({ kind: 'thorn', x: e.x + Math.sin(a) * 2, y: 3.4, z: e.z + Math.cos(a) * 2, vx: Math.sin(a) * 15, vy: (p.y + 1 - 3.4) / Math.max(dist, 4) * 15, vz: Math.cos(a) * 15, life: 3, dmg: 2, yaw: a }); } api.SND.sfx('shoot'); e.state = 'recover'; e.timer = 0.8; }
  } else if (e.state === 'summon') {
    if (e.timer <= 0) { for (let i = 0; i < 2; i++) { const s = spawnEnemy('slime', e.x + (i ? 4 : -4), e.z + 3); s.summoned = true; burst(s.x, 1, s.z, [1, 1, 1], 12, 4); } api.SND.sfx('secret'); e.state = 'recover'; e.timer = 0.6; }
  } else if (e.state === 'recover') { if (e.timer <= 0) { e.state = 'walk'; e.timer = ph2 ? 1.2 : 1.8; } }
  if (p.inv <= 0 && dist < 3.0 && p.y < 4) hurt(2, e);
}
function updateProjs(dt) {
  const p = player;
  for (const pr of projs) {
    if (pr.dead) continue; pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.z += pr.vz * dt; pr.life -= dt;
    if (pr.life <= 0 || pr.y < groundH(pr.x, pr.z) - 0.2) { pr.dead = true; burst(pr.x, pr.y + 0.2, pr.z, [0.9, 0.8, 0.6], 5, 3); continue; }
    if (p.inv <= 0 && Math.hypot(pr.x - p.x, pr.z - p.z) < 0.8 && pr.y > p.y - 0.2 && pr.y < p.y + 2.2) { pr.dead = true; hurt(pr.dmg, pr); if (mode !== 'play') return; }
  }
  projs = projs.filter(q => !q.dead);
  for (const r of rings) { r.r += r.sp * dt; r.life -= dt; const d = Math.hypot(p.x - r.x, p.z - r.z); if (p.inv <= 0 && Math.abs(d - r.r) < 1.0 && p.y - groundH(p.x, p.z) < 0.6) hurt(2, { x: r.x, z: r.z }); if (mode !== 'play') return; }
  rings = rings.filter(r => r.life > 0);
}
function burst(x, y, z, col, n, sp) { for (let i = 0; i < n; i++) { const a = rnd() * TAU, b = rnd() * 2 - 0.3, s = sp * (0.4 + rnd() * 0.8); parts.push({ x, y, z, vx: Math.cos(a) * s, vy: b * s * 0.8 + 1, vz: Math.sin(a) * s, life: 0.5 + rnd() * 0.5, max: 1, c: [col[0], col[1], col[2], 1], s: 6 + rnd() * 6, g: 9 }); } }
function updateParts(dt) {
  for (const q of parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.vy -= (q.g || 0) * dt; q.life -= dt; }
  parts = parts.filter(q => q.life > 0); if (parts.length > 3500) parts.splice(0, parts.length - 3500);
  if (!ok || !player) return;
  for (const s of STONES) if (W.lit[s.id] && rnd() < dt * 12) parts.push({ x: s.x + (rnd() - 0.5) * 0.8, y: s.y + 5.4, z: s.z + (rnd() - 0.5) * 0.8, vx: (rnd() - 0.5) * 0.6, vy: 2 + rnd() * 2, vz: (rnd() - 0.5) * 0.6, life: 1.2, max: 1.2, c: [1, 0.7, 0.3, 1], s: 7 });
  if (era >= 4 && rnd() < dt * 18) { const a = rnd() * TAU, r = 4 + rnd() * 22; const x = player.x + Math.cos(a) * r, z = player.z + Math.sin(a) * r; parts.push({ x, y: groundH(x, z) + 0.5 + rnd() * 3, z, vx: 0.3, vy: 0.15, vz: 0.2, life: 3, max: 3, c: [1, 0.97, 0.75, 0.75], s: 4, glow: 1 }); }
}

// --------------------------------------------------------------- render
const ENV = {
  3: { sun: [0.45, 0.8, 0.35], sunCol: [0.85, 0.8, 0.72], amb: [0.44, 0.48, 0.58], ground: [0.32, 0.3, 0.28], fog: [0.62, 0.7, 0.82], fogN: 26, fogF: 96, top: [0.42, 0.56, 0.82], hor: [0.62, 0.7, 0.82] },
  4: { sun: [0.5, 0.62, 0.42], sunCol: [0.86, 0.78, 0.64], amb: [0.36, 0.42, 0.56], ground: [0.26, 0.23, 0.18], fog: [0.72, 0.8, 0.9], fogN: 60, fogF: 300, top: [0.26, 0.48, 0.86], hor: [0.78, 0.86, 0.95] },
};
function norm3(v) { const l = Math.hypot(...v); return v.map(x => x / l); }
let curProg = null;
function use(pr) { if (curProg !== pr) { gl.useProgram(pr.p); curProg = pr; } }
function setCommon(pr, env, modern) {
  const u = pr.u; use(pr);
  gl.uniformMatrix4fv(u.uVP, false, VP); gl.uniformMatrix4fv(u.uSVP, false, SVP); gl.uniform1f(u.uTime, T); gl.uniform1f(u.uSway, modern ? 1 : 0); gl.uniform1f(u.uSnap, modern ? 0 : 150); gl.uniform1f(u.uGrow, 1);
  gl.uniform3fv(u.uSun, norm3(env.sun)); gl.uniform3fv(u.uSunCol, env.sunCol); gl.uniform3fv(u.uAmb, env.amb); gl.uniform3fv(u.uGround, env.ground); gl.uniform3fv(u.uFog, env.fog); gl.uniform3fv(u.uCam, camPos);
  gl.uniform1f(u.uFogN, env.fogN); gl.uniform1f(u.uFogF, env.fogF); gl.uniform1f(u.uFlat, modern ? 0 : 1); gl.uniform1f(u.uToon, modern ? 1 : 0); gl.uniform1f(u.uShadowOn, modern ? 1 : 0); gl.uniform1f(u.uFlash, 0); gl.uniform1f(u.uRim, modern ? 0.55 : 0); gl.uniform1f(u.uEmit, 0); gl.uniform1f(u.uAlpha, 1); gl.uniform1f(u.uSMSize, shadowT.size);
  gl.uniform1i(u.uSM, 1);
}
function draw(m, model) { gl.bindVertexArray(m.vao); gl.uniformMatrix4fv(curProg.u.uModel, false, model || IDENT); if (m.indexed) gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0); else gl.drawArrays(gl.TRIANGLES, 0, m.n); }
function drawInst(m) { if (!m || !m.count) return; gl.bindVertexArray(m.vao); gl.uniformMatrix4fv(curProg.u.uModel, false, IDENT); gl.drawArraysInstanced(gl.TRIANGLES, 0, m.n, m.count); }
function drawPlayer(K, depthOnly) {
  const p = player; if (!depthOnly && p.inv > 0 && mode === 'play' && Math.floor(p.inv * 14) % 2) return;
  const root = trs(p.x, p.y, p.z, p.yaw, 1);
  const ph = p.anim, ma = p.ground ? Math.min(1, p.moveAmt) : 0, sw = Math.sin(ph) * 0.75 * ma;
  const air = !p.ground, gl_ = p.glide;
  const bob = p.ground ? Math.abs(Math.sin(ph)) * 0.06 * ma : 0;
  const R = (m) => mul(root, m);
  const legL = gl_ ? 0.6 : air ? -0.5 : sw, legR = gl_ ? 0.4 : air ? 0.3 : -sw;
  draw(K.leg, R(xform(-0.15, 0.62 + bob, 0, legL, 0, 0, 1))); draw(K.leg, R(xform(0.15, 0.62 + bob, 0, legR, 0, 0, 1)));
  draw(K.torso, R(xform(0, 0.62 + bob, 0, gl_ ? 0.5 : 0, 0, 0, 1)));
  draw(K.head, R(xform(0, 1.3 + bob, gl_ ? 0.25 : 0, gl_ ? 0.3 : 0, 0, 0, 1)));
  draw(K.scarfTail, R(xform(0, 1.22 + bob, -0.24, 0.3 + Math.min(1.2, Math.hypot(p.vx, p.vz) * 0.08) + Math.sin(T * 9) * 0.08, 0, 0, 1)));
  let armL = -sw * 0.8, armRx = sw * 0.8, armRy = 0, armZL = 0, armZR = 0;
  if (gl_) { armZL = -1.4; armZR = 1.4; armL = 0; armRx = 0; } else if (air) { armL = -0.6; armRx = -0.6; }
  if (p.swing > 0) { const k = 1 - p.swing / 0.32, e = k < 0.6 ? 1 - Math.pow(1 - k / 0.6, 3) : 1; armRx = 1.45; armRy = lerp(1.25, -1.1, e); }
  draw(K.arm, R(xform(-0.4, 1.2 + bob, 0, armL, 0, armZL, 1)));
  const armM = R(xform(0.4, 1.2 + bob, 0, armRx, armRy, armZR, 1)); draw(K.arm, armM);
  draw(K.sword, mul(armM, xform(0, -0.48, 0.05, p.swing > 0 ? Math.PI * 0.5 : Math.PI * 0.62, 0, 0, 1)));
  if (gl_) draw(K.sail, R(xform(0, 2.35, -0.1, 0.15, 0, 0, 1)));
}
function drawEnemyModel(K, e) {
  const fl = e.flash > 0 || (e.type === 'king' && e.state === 'dying' && Math.floor(T * 12) % 2);
  if (curProg === prog.main) gl.uniform1f(prog.main.u.uFlash, fl ? 0.85 : 0);
  const root = trs(e.x, e.y, e.z, e.yaw, 1);
  switch (e.type) {
    case 'slime': { const sq = e.ground ? 1 + Math.sin(e.t * 6) * 0.05 : 0.85; draw(K.slime, mul(root, xform(0, 0, 0, 0, 0, 0, 1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)))); break; }
    case 'crab': draw(K.crab, mul(root, xform(0, Math.abs(Math.sin(e.t * 12)) * 0.06, 0, 0, 0, 0, 1))); break;
    case 'skel': { const s = Math.sin(e.t * 7) * 0.6; draw(K.skelBody, root); draw(K.bone, mul(root, xform(-0.13, 0.7, 0, s, 0, 0, 1))); draw(K.bone, mul(root, xform(0.13, 0.7, 0, -s, 0, 0, 1))); draw(K.bone, mul(root, xform(-0.34, 1.3, 0, -s * 0.8 - 0.3, 0, 0, 1))); draw(K.bone, mul(root, xform(0.34, 1.3, 0, s * 0.8 - 0.3, 0, 0, 1))); break; }
    case 'bat': { const f = Math.sin(e.t * 16) * 0.7; draw(K.batBody, root); draw(K.wing, mul(root, xform(0.25, 0, 0, 0, 0, f, 1))); draw(K.wing, mul(root, xform(-0.25, 0, 0, 0, Math.PI, f, 1))); break; }
    case 'pod': draw(K.pod, mul(root, xform(0, 0, 0, (e.mouth || 0) > 0 ? -0.2 : 0, 0, 0, 1))); if (e.mouth) e.mouth = Math.max(0, e.mouth - 0.016); break;
    case 'king': {
      const s = 1.6, raise = e.state === 'slam' ? clamp(1 - e.timer / 1.0, 0, 1) * 2.6 : e.state === 'recover' && e.timer > 0.8 ? 0 : 0;
      const wob = e.state === 'dormant' ? 0 : Math.sin(e.t * 3) * 0.05; const rootK = mul(root, xform(0, 0, 0, 0, 0, wob, s));
      draw(K.kingBody, rootK); draw(K.kingHead, mul(rootK, xform(0, 4.3, 0.2, e.state === 'dormant' ? 0.5 : 0, 0, 0, 1)));
      if (curProg === prog.main) gl.uniform1f(prog.main.u.uEmit, e.state === 'dormant' ? 0 : 1);
      draw(K.kingEyes, mul(rootK, xform(0, 4.3, 0.2, e.state === 'dormant' ? 0.5 : 0, 0, 0, 1)));
      if (curProg === prog.main) gl.uniform1f(prog.main.u.uEmit, 0);
      for (const sd of [-1, 1]) draw(K.kingArm, mul(rootK, xform(sd * 1.9, 3.3, 0.2, -raise + Math.sin(e.t * 2 + sd) * 0.1, 0, sd * 0.25, 1)));
      break;
    }
  }
  if (curProg === prog.main) gl.uniform1f(prog.main.u.uFlash, 0);
}
function sceneGeometry(modern, depthOnly) {
  const K = modern ? MOD : MOD_LO, I = modern ? instHi : instLo;
  draw(STATIC.village); draw(STATIC.castle); draw(STATIC.court); if (STATIC.bridge) draw(STATIC.bridge);
  for (const k of ['tree', 'pine', 'rock', 'bush', 'wall', 'flower']) { if (depthOnly && k === 'flower') continue; drawInst(I[k]); }
  for (const s of W.signs) if (near2(s.x, s.z, 140)) draw(K.sign, trs(s.x, groundH(s.x, s.z), s.z, Math.atan2(-s.x, 40 - s.z) * 0, 1));
  if (W.elder) draw(K.elder, trs(W.elder.x, groundH(W.elder.x, W.elder.z), W.elder.z, Math.atan2(player.x - W.elder.x, player.z - W.elder.z), 1));
  for (const s of STONES) draw(K.stone, trs(s.x, s.y, s.z, 0, 1));
  drawPlayer(K, depthOnly);
  for (const e of ents) if (!e.dead && near2(e.x, e.z, 110)) drawEnemyModel(K, e);
  for (const pr of projs) draw(pr.kind === 'thorn' ? K.thorn : K.seed, trs(pr.x, pr.y, pr.z, pr.yaw || 0, 1));
  for (const pk of pickups) draw(K.heart, xform(pk.x, pk.y + 0.4 + Math.sin(pk.t * 3) * 0.15, pk.z, 0, pk.t * 2, 0, 1));
}
const near2 = (x, z, r) => Math.abs(x - player.x) < r && Math.abs(z - player.z) < r;
function render() {
  if (!ok) return;
  resize();
  const modern = era >= 4; const env = ENV[modern ? 4 : 3];
  let fogN = env.fogN, fogF = env.fogF;
  if (eraFx && eraFx.to === 4) { const k = smooth(0.6, 2.4, eraFx.t); fogN = lerp(26, env.fogN, k); fogF = lerp(96, env.fogF, k); }
  if (intro) { const ki = 1 - smooth(0.4, intro.dur - 0.3, intro.t); fogN += ki * 200; fogF += ki * 320; }
  const envX = Object.assign({}, env, { fogN, fogF });
  // camera
  const p = player, tgt = [p.x, p.y + 1.5, p.z];
  let eye, fov = modern ? 0.92 : 0.98, aspect = VW / VH, up = [0, 1, 0];
  const cp = Math.cos(cam.pitch), back = [Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp];
  let dist = cam.dist;
  for (let i = 1; i <= 8; i++) { const d = dist * i / 8, qx = tgt[0] + back[0] * d, qz = tgt[2] + back[2] * d, list = cgrid.get(Math.floor(qx / 8) + ',' + Math.floor(qz / 8)); if (list && list.some(c => (c.r ? Math.hypot(qx - c.x, qz - c.z) < c.r + 0.7 : Math.abs(qx - c.x) < c.hx + 0.3 && Math.abs(qz - c.z) < c.hz + 0.3) && !(c.bush && !c.bush.alive))) { dist = Math.max(2.2, d - dist / 8); break; } }
  cam.vd = cam.vd == null ? dist : (dist < cam.vd ? dist : lerp(cam.vd, dist, 0.08)); dist = cam.vd;
  eye = [tgt[0] + back[0] * dist, tgt[1] + back[1] * dist, tgt[2] + back[2] * dist];
  if (inCourt(p.x, p.z, 0)) { eye[0] = clamp(eye[0], COURT.x0 + 1.2, COURT.x1 - 1.2); eye[2] = clamp(eye[2], COURT.z0 + 1.2, COURT.z1 - 1.2); }
  const gh = groundH(eye[0], eye[2]) + 0.8; if (eye[1] < gh) eye[1] = gh;
  if (intro) { const k = smooth(0.4, intro.dur - 0.3, intro.t); const top = [p.x, p.y + 110, p.z + 0.6]; eye = eye.map((v, i) => lerp(top[i], v, k)); fov = lerp(0.42, fov, k); }
  camPos = eye; const V = lookAt(eye, tgt, up); VP = mul(persp(fov, aspect, 0.3, 700), V);
  // shadow pass
  if (modern) {
    const sd = norm3(env.sun), c = [p.x, p.y, p.z]; const le = [c[0] + sd[0] * 90, c[1] + sd[1] * 90, c[2] + sd[2] * 90];
    SVP = mul(ortho(-55, 55, -55, 55, 1, 200), lookAt(le, c, [0, 1, 0]));
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowT.fb); gl.viewport(0, 0, shadowT.size, shadowT.size); gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    use(prog.depth); gl.uniformMatrix4fv(prog.depth.u.uSVP, false, SVP); gl.uniform1f(prog.depth.u.uTime, T); gl.uniform1f(prog.depth.u.uSway, 1);
    curProg = prog.depth; sceneGeometry(true, true);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); gl.viewport(0, 0, target.w, target.h);
  gl.clearColor(envX.fog[0], envX.fog[1], envX.fog[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
  // sky
  use(prog.sky); const su = prog.sky.u; gl.depthMask(false); gl.uniformMatrix4fv(su.uInv, false, inv(VP)); gl.uniform3fv(su.uCam, camPos); gl.uniform3fv(su.uSun, norm3(env.sun)); gl.uniform3fv(su.uTop, env.top); gl.uniform3fv(su.uHor, env.hor); gl.uniform3fv(su.uFog, envX.fog); gl.uniform1f(su.uTime, T); gl.uniform1f(su.uClouds, modern ? 0.85 : 0); gl.uniform1f(su.uSunSize, modern ? 900 : 300);
  gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.depthMask(true);
  // world
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, shadowT.tex); gl.activeTexture(gl.TEXTURE0);
  setCommon(prog.main, envX, modern);
  gl.uniform1f(prog.main.u.uRim, 0); gl.uniform1f(prog.main.u.uSway, 0); draw(STATIC.terrain); gl.uniform1f(prog.main.u.uRim, modern ? 0.55 : 0); gl.uniform1f(prog.main.u.uSway, modern ? 1 : 0);
  sceneGeometry(modern, false);
  // grass
  if (modern) {
    const cx = Math.floor(p.x / 20), cz = Math.floor(p.z / 20), rr = api.touch ? 1 : 2;
    gl.uniform1f(prog.main.u.uRim, 0.25); gl.uniform1f(prog.main.u.uGrow, eraFx && eraFx.to === 4 ? smooth(0.8, 2.6, eraFx.t) : 1);
    for (let a = cx - rr; a <= cx + rr; a++) for (let b = cz - rr; b <= cz + rr; b++) drawInst(grassChunk(a, b));
    gl.uniform1f(prog.main.u.uGrow, 1);
  }
  // water
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  use(prog.water); const wu = prog.water.u; gl.uniformMatrix4fv(wu.uVP, false, VP); gl.uniform1f(wu.uTime, T); gl.uniform1f(wu.uWaves, modern ? 1 : 0); gl.uniform1f(wu.uSnap, modern ? 0 : 150); gl.uniform1f(wu.uLevel, WATER);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, hmTex); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(wu.uHM, 2);
  gl.uniform3fv(wu.uCam, camPos); gl.uniform3fv(wu.uSun, norm3(env.sun)); gl.uniform3fv(wu.uSky, env.hor); gl.uniform3fv(wu.uFog, envX.fog); gl.uniform3fv(wu.uDeep, modern ? [0.06, 0.26, 0.42] : [0.16, 0.36, 0.7]); gl.uniform3fv(wu.uShallow, modern ? [0.25, 0.62, 0.66] : [0.3, 0.5, 0.82]);
  gl.uniform1f(wu.uFogN, envX.fogN); gl.uniform1f(wu.uFogF, envX.fogF); gl.uniform1f(wu.uFancy, modern ? 1 : 0); gl.uniform1f(wu.uWS, WS);
  gl.bindVertexArray(STATIC.water.vao); gl.drawElements(gl.TRIANGLES, STATIC.water.n, gl.UNSIGNED_INT, 0);
  // emissive / additive fx
  setCommon(prog.main, envX, modern); const K = modern ? MOD : MOD_LO; const u = prog.main.u;
  gl.uniform1f(u.uEmit, 1); gl.uniform1f(u.uRim, 0);
  for (const s of STONES) if (W.lit[s.id]) draw(K.flame, xform(s.x, s.y + 5.6 + Math.sin(T * 3) * 0.1, s.z, 0, T, 0, 1 + Math.sin(T * 7) * 0.06));
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
  for (const s of STONES) if (W.lit[s.id]) { gl.uniform1f(u.uAlpha, 0.18 + Math.sin(T * 2) * 0.04); draw(K.beam, xform(s.x, s.y + 5, s.z, 0, 0, 0, 1, 160, 1)); }
  for (const r of rings) { gl.uniform1f(u.uAlpha, clamp(r.life, 0, 1) * 0.9); draw(K.ring, xform(r.x, groundH(r.x, r.z) + 0.25, r.z, 0, 0, 0, r.r, 1, r.r)); }
  if (player.swing > 0) { const k = 1 - player.swing / 0.32; gl.uniform1f(u.uAlpha, 0.55 * (1 - k)); draw(K.trail, xform(player.x, player.y + 1.05, player.z, 0, player.yaw, 0, 1)); }
  if (seal() && !W.bossDead) { gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.uniform1f(u.uAlpha, 0.16 + Math.sin(T * 1.5) * 0.03); draw(K.dome, xform(0, 0, -85, 0, 0, 0, 31, 20, 23)); gl.uniform1f(u.uAlpha, 0.45); const gb = geoBox(); draw(gb, xform(0, 3.5, -54, 0, 0, 0, 8, 7, 0.3)); }
  if (W.trap) { gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.uniform1f(u.uAlpha, 0.5); draw(geoBox(), xform(0, 3.5, -66.5, 0, 0, 0, 8, 7, 0.3)); }
  gl.uniform1f(u.uAlpha, 1); gl.uniform1f(u.uEmit, 0); gl.depthMask(true);
  // blob shadows (early 3D)
  if (!modern) { gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.uniform1f(u.uEmit, 1); gl.uniform1f(u.uAlpha, 0.35); gl.depthMask(false); draw(K.blob, xform(player.x, groundH(player.x, player.z) + 0.06, player.z, 0, 0, 0, 0.6, 1, 0.6)); for (const e of ents) if (!e.dead && near2(e.x, e.z, 60)) draw(K.blob, xform(e.x, groundH(e.x, e.z) + 0.06, e.z, 0, 0, 0, ETYPES[e.type].r * (e.type === 'king' ? 1.3 : 0.9), 1, ETYPES[e.type].r * (e.type === 'king' ? 1.3 : 0.9))); gl.uniform1f(u.uEmit, 0); gl.uniform1f(u.uAlpha, 1); gl.depthMask(true); }
  // particles
  if (parts.length) {
    const d = new Float32Array(Math.min(parts.length, 4000) * 8); let i = 0; for (const q of parts) { if (i >= 4000) break; const a = clamp(q.life / q.max * 1.6, 0, 1) * q.c[3]; d.set([q.x, q.y, q.z, q.c[0], q.c[1], q.c[2], a, q.s], i * 8); i++; }
    use(prog.pts); gl.uniformMatrix4fv(prog.pts.u.uVP, false, VP); gl.uniform1f(prog.pts.u.uScale, target.h * 0.06); gl.uniform1f(prog.pts.u.uRound, modern ? 1 : 0);
    gl.bindVertexArray(MESH.pts.vao); gl.bindBuffer(gl.ARRAY_BUFFER, MESH.pts.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, d); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false); gl.drawArrays(gl.POINTS, 0, i); gl.depthMask(true);
  }
  gl.disable(gl.BLEND);
  // present
  let src = target;
  if (target.resolve) { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.resolve.fb); gl.blitFramebuffer(0, 0, target.w, target.h, 0, 0, target.w, target.h, gl.COLOR_BUFFER_BIT, gl.NEAREST); src = target.resolve; }
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src.fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  gl.blitFramebuffer(0, 0, src.w, src.h, 0, 0, cv.width, cv.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
let GBOX = null; function geoBox() { return GBOX || (GBOX = geoMesh(g => g.add(boxP(), IDENT, [0.7, 0.5, 1.0]))); }

// ------------------------------------------------------------------- HUD
function project(x, y, z) { const v = [x, y, z, 1]; const o = [0, 0, 0, 0]; for (let r = 0; r < 4; r++) o[r] = VP[r] * v[0] + VP[4 + r] * v[1] + VP[8 + r] * v[2] + VP[12 + r]; if (o[3] <= 0.1) return null; return [(o[0] / o[3] * 0.5 + 0.5) * VW, (1 - (o[1] / o[3] * 0.5 + 0.5)) * VH]; }
function txt(s, x, y, size, col, align = 'left', sh = 'rgba(0,0,0,0.75)') { hc.font = `${Math.round(size)}px ${api.FONT}`; hc.textAlign = align; hc.textBaseline = 'top'; if (sh) { hc.fillStyle = sh; hc.fillText(s, x + Math.max(1, size / 8), y + Math.max(1, size / 8)); } hc.fillStyle = col; hc.fillText(s, x, y); }
function panel(x, y, w, h, a = 0.55) { hc.fillStyle = `rgba(12,9,18,${a})`; hc.fillRect(x, y, w, h); }
function drawHUD() {
  const S = api.S; hc.setTransform(dpr, 0, 0, dpr, 0, 0); hc.clearRect(0, 0, VW, VH); hc.imageSmoothingEnabled = false;
  const k = hs, modern = era >= 4, pad = 12 * k;
  if (intro) { const a = 1 - smooth(intro.dur - 1.2, intro.dur, intro.t); txt('LEVEL 3', VW / 2, VH * 0.2, 22 * k, `rgba(242,184,68,${a})`, 'center'); txt('THE WORLD GAINS A NEW DIMENSION', VW / 2, VH * 0.2 + 34 * k, 9 * k, `rgba(239,230,210,${a})`, 'center'); if (intro.t > 1) txt('PRESS A TO SKIP', VW / 2, VH - 60 * k, 8 * k, `rgba(168,159,189,${a})`, 'center'); }
  // hearts
  const hsz = 7 * 2 * k * (modern ? 1 : 1.1); for (let i = 0; i < S.maxHp / 2; i++) { const v = S.hp - i * 2; const img = v >= 2 ? api.SP.heart : v === 1 ? api.SP.heartHalf : api.SP.heartEmpty; hc.drawImage(img, pad + (i % 10) * (hsz + 3 * k), pad + Math.floor(i / 10) * (hsz + 3 * k), hsz, hsz); }
  // level & xp
  const L = api.levelInfo(); const by = pad + hsz + 10 * k + (S.maxHp > 20 ? hsz : 0);
  txt('LV ' + L.level, pad, by, 9 * k, '#f2b844');
  const bw = 120 * k, bx = pad + 46 * k; panel(bx, by + 1 * k, bw, 7 * k, 0.6); hc.fillStyle = '#f2b844'; hc.fillRect(bx + 1 * k, by + 2 * k, (bw - 2 * k) * L.frac, 5 * k);
  if (L.max) txt('MAX', bx + bw + 6 * k, by, 8 * k, '#cfc4e0');
  if (modern && (player.stam < 1 || player.glide)) { const sy = by + 14 * k; panel(bx, sy, bw, 6 * k, 0.6); hc.fillStyle = player.exhausted ? '#e04848' : '#7ad06a'; hc.fillRect(bx + 1 * k, sy + 1 * k, (bw - 2 * k) * player.stam, 4 * k); txt('STAMINA', pad, sy - 1 * k, 6 * k, '#a8d8a0'); }
  // radar
  const rr = 46 * k, rx = VW - pad - rr, ry = pad + rr;
  hc.fillStyle = 'rgba(12,9,18,0.55)'; hc.beginPath(); hc.arc(rx, ry, rr, 0, TAU); hc.fill(); hc.strokeStyle = 'rgba(242,184,68,0.6)'; hc.lineWidth = 1.5 * k; hc.stroke();
  const rs = rr / 80, cy = Math.cos(cam.yaw), sy2 = Math.sin(cam.yaw);
  const toR = (x, z) => { const dx = x - player.x, dz = z - player.z; const ux = dx * cy - dz * sy2, uz = dx * sy2 + dz * cy; let px = ux * rs, pz = uz * rs; const l = Math.hypot(px, pz); if (l > rr - 4 * k) { px *= (rr - 4 * k) / l; pz *= (rr - 4 * k) / l; } return [rx + px, ry + pz]; };
  for (const e of ents) { if (e.dead || e.state === 'dormant') continue; if (!near2(e.x, e.z, 70)) continue; const [a, b] = toR(e.x, e.z); hc.fillStyle = e.type === 'king' ? '#ff5050' : '#e04848'; hc.fillRect(a - 1.5 * k, b - 1.5 * k, 3 * k, 3 * k); }
  for (const s of STONES) { const [a, b] = toR(s.x, s.z); hc.fillStyle = W.lit[s.id] ? '#ffd447' : '#cfc4e0'; hc.beginPath(); hc.moveTo(a, b - 5 * k); hc.lineTo(a + 3.5 * k, b + 3 * k); hc.lineTo(a - 3.5 * k, b + 3 * k); hc.fill(); }
  if (W.elder) { const [a, b] = toR(W.elder.x, W.elder.z); hc.fillStyle = '#b8a0ff'; hc.fillRect(a - 2 * k, b - 2 * k, 4 * k, 4 * k); }
  if (!seal() && !W.bossDead) { const [a, b] = toR(CCX, CCZ); hc.fillStyle = '#ff7a5a'; hc.beginPath(); hc.arc(a, b, 4 * k, 0, TAU); hc.fill(); }
  hc.fillStyle = '#ffffff'; hc.beginPath(); const pa = player.yaw - cam.yaw + Math.PI; hc.moveTo(rx + Math.sin(pa) * -6 * k, ry + Math.cos(pa) * -6 * k); hc.lineTo(rx + Math.sin(pa + 2.5) * -5 * k, ry + Math.cos(pa + 2.5) * -5 * k); hc.lineTo(rx + Math.sin(pa - 2.5) * -5 * k, ry + Math.cos(pa - 2.5) * -5 * k); hc.fill();
  txt('N', rx + Math.sin(-cam.yaw + Math.PI) * 0, ry - rr - 2 * k, 7 * k, '#cfc4e0', 'center', null);
  // waystones counter
  const lit = Object.values(W.lit).filter(Boolean).length; txt(`WAYSTONES ${lit}/3`, VW - pad, ry + rr + 6 * k, 7 * k, lit === 3 ? '#ffd447' : '#cfc4e0', 'right');
  // banner
  if (banner) { const a = clamp(Math.min(banner.t * 2, (3 - banner.t) * 3), 0, 1); hc.globalAlpha = a; txt(banner.text, VW / 2, VH * 0.16, 12 * k, '#f2b844', 'center'); hc.globalAlpha = 1; }
  // floaters
  for (const f of floaters) { const sp = project(f.x, f.y + f.t * 1.5, f.z); if (!sp) continue; hc.globalAlpha = clamp(1.4 - f.t, 0, 1); txt(f.text, sp[0], sp[1], 8 * k, '#ffe066', 'center'); hc.globalAlpha = 1; }
  // boss bar
  if (boss && boss.state !== 'dormant' && boss.state !== 'dying' && W.trap) { const w = Math.min(VW - 40, 360 * k), x = (VW - w) / 2, y = VH - (api.touch && VH > VW ? 250 : 46) * 1 - 8 * k; txt('THE BRAMBLE KING', VW / 2, y - 14 * k, 8 * k, '#ffb0a0', 'center'); panel(x, y, w, 9 * k, 0.7); hc.fillStyle = '#d0402a'; hc.fillRect(x + 1.5 * k, y + 1.5 * k, (w - 3 * k) * boss.hp / ETYPES.king.hp, 6 * k); }
  // prompt
  const bottom = api.touch && VH > VW ? VH - 230 : VH - 40 * k;
  if (prompt && mode === 'play') { hc.font = `${Math.round(8 * k)}px ${api.FONT}`; const w = hc.measureText(prompt).width + 16 * k; panel(VW / 2 - w / 2, bottom - 8 * k, w, 20 * k, 0.7); txt(prompt, VW / 2, bottom - 2 * k, 8 * k, '#ffe9a8', 'center', null); }
  // dialog
  if (mode === 'dialog' && dialog) {
    const w = Math.min(VW - 24 * k, 520 * k), lh = 15 * k, h = lh * 3 + 26 * k, x = (VW - w) / 2, y = bottom - h - 16 * k;
    panel(x, y, w, h, 0.88); hc.strokeStyle = '#efe6d2'; hc.lineWidth = 2 * k; hc.strokeRect(x + 3 * k, y + 3 * k, w - 6 * k, h - 6 * k);
    const page = dialog.pages[dialog.page]; let n = dialog.chars | 0; const fs = Math.min(9 * k, (w - 28 * k) / 34 * 1.0);
    page.forEach((ln, i) => { txt(ln.slice(0, Math.max(0, n)), x + 14 * k, y + 13 * k + i * lh, fs, '#efe6d2', 'left', null); n -= ln.length; });
    if (dialog.chars >= page.join('').length && Math.floor(T * 3) % 2) txt('v', x + w - 18 * k, y + h - 16 * k, 8 * k, '#f2b844', 'left', null);
  }
  // level-up overlay
  if (lvlFx) { const a = clamp(Math.min(lvlFx.t * 3, (3.2 - lvlFx.t) * 2), 0, 1); hc.globalAlpha = a; txt('LEVEL UP!', VW / 2, VH * 0.3, 20 * k, '#ffe066', 'center'); txt('LV ' + lvlFx.lv + (lvlFx.lv >= 4 ? '  -  THE MODERN AGE' : ''), VW / 2, VH * 0.3 + 30 * k, 10 * k, '#efe6d2', 'center'); if (lvlFx.lv >= 4) txt('YOUR CLOAK CAN RIDE THE WIND: HOLD JUMP IN THE AIR', VW / 2, VH * 0.3 + 50 * k, 7 * k, '#a8d8ff', 'center'); hc.globalAlpha = 1; }
  if (eraFx) { const a = eraFx.t < 0.6 ? eraFx.t / 0.6 : clamp(1 - (eraFx.t - 0.6) / 0.8, 0, 1); hc.fillStyle = `rgba(255,255,255,${a * 0.9})`; hc.fillRect(0, 0, VW, VH); }
  if (mode === 'pause') {
    panel(0, 0, VW, VH, 0.72); txt('PAUSED', VW / 2, VH * 0.12, 18 * k, '#f2b844', 'center');
    const lines = [`LEVEL ${L.level}   XP ${S.xp}`, `WAYSTONES LIT  ${lit} / 3`, W.bossDead ? 'THE BRAMBLE KING IS DEFEATED' : seal() ? 'GOAL: LIGHT ALL THREE WAYSTONES' : 'GOAL: DEFEAT THE BRAMBLE KING', '', api.touch ? 'D-PAD MOVE   A SWORD/TALK   B JUMP' : 'WASD/ARROWS MOVE   Z/J SWORD, TALK', api.touch ? 'DRAG THE SCREEN TO TURN THE CAMERA' : 'SPACE/X JUMP   DRAG MOUSE OR Q/E: CAMERA', era >= 4 ? (api.touch ? 'HOLD B IN THE AIR TO GLIDE' : 'SHIFT RUN   HOLD JUMP IN THE AIR TO GLIDE') : 'GLIDING UNLOCKS AT LEVEL 4', '', 'PRESS START TO RESUME'];
    lines.forEach((l, i) => txt(l, VW / 2, VH * 0.26 + i * 18 * k, 8 * k, i === lines.length - 1 ? '#ffe9a8' : '#cfc4e0', 'center'));
  }
  if (mode === 'dead') { panel(0, 0, VW, VH, 0.6); txt('YOU HAVE FALLEN', VW / 2, VH * 0.38, 14 * k, '#ff8a8a', 'center'); if (deadT > 1.2) txt('PRESS START TO RISE AGAIN', VW / 2, VH * 0.38 + 30 * k, 8 * k, '#efe6d2', 'center'); }
  if (mode === 'victory') {
    const a = clamp(deadT / 1.5, 0, 1); panel(0, 0, VW, VH, 0.7 * a); hc.globalAlpha = a;
    txt('THE VALE IS SAVED', VW / 2, VH * 0.2, 18 * k, '#f2b844', 'center');
    const st = [['TIME', fmt(S.stats.time)], ['MONSTERS', S.stats.kills], ['FALLS', S.stats.deaths], ['LEVEL', L.level]];
    st.forEach(([a1, b], i) => { txt(a1, VW / 2 - 90 * k, VH * 0.36 + i * 16 * k, 8 * k, '#a89fbd'); txt(String(b), VW / 2 + 90 * k, VH * 0.36 + i * 16 * k, 8 * k, '#efe6d2', 'right'); });
    txt('From 8-bit sprite to a world with depth:', VW / 2, VH * 0.36 + 74 * k, 7 * k, '#cfc4e0', 'center'); txt('thank you for growing up with Wren.', VW / 2, VH * 0.36 + 88 * k, 7 * k, '#cfc4e0', 'center');
    if (deadT > 2 && Math.floor(T * 2) % 2) txt('PRESS START TO KEEP EXPLORING', VW / 2, VH * 0.75, 8 * k, '#ffe9a8', 'center');
    hc.globalAlpha = 1;
  }
}
const fmt = s => { s = Math.floor(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ------------------------------------------------------------- frame
W3D.frame = function (dt, I) { if (!ok) return; if (!api.panelOpen()) update(dt, I); render(); drawHUD(); };
W3D.debug = { glinfo: () => { const e = []; let x; while ((x = gl.getError()) && e.length < 8) e.push(x); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER); gl.bindFramebuffer(gl.FRAMEBUFFER, null); return { errors: e, status: st, complete: gl.FRAMEBUFFER_COMPLETE, target: { w: target.w, h: target.h, s: target.samples }, cv: [cv.width, cv.height], maxSamples: gl.getParameter(gl.MAX_SAMPLES) }; }, skip: () => { intro = null; dialog = null; mode = 'play'; }, setEra: e => { era = e; target = null; }, get player() { return player; }, get ents() { return ents; }, get W() { return W; }, get mode() { return mode; }, set mode(v) { mode = v; }, get era() { return era; }, get boss() { return boss; }, groundH: (x, z) => groundH(x, z), STONES, tp: (x, z) => { player.x = x; player.z = z; player.y = groundH(x, z) + 0.5; player.vy = 0; player.vx = 0; player.vz = 0; player.kbT = 0; }, sim: (n, held = {}, press = {}) => { const I = { held, pressed: Object.assign({}, press), ax: 0, ay: 0 }; for (let i = 0; i < n; i++) { update(1 / 60, I); I.pressed = {}; } return { x: +player.x.toFixed(1), y: +player.y.toFixed(1), z: +player.z.toFixed(1), ground: player.ground, glide: player.glide, mode, stam: +player.stam.toFixed(2) }; }, near: () => nearestInteract(), cam: () => cam, get eraFx() { return eraFx; }, get dialog() { return dialog; } };
})();
