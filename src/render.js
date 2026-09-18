/* =====================================================================
   render.js — the planet as the physics says it is, in 3-D
   ---------------------------------------------------------------------
   A WebGL2 fragment shader ray-casts a sphere for every pixel and builds
   the surface from procedural noise.  Nothing on it is painted by hand;
   every layer is read from sim.visualState():

     polar caps     edge at capLat, which follows the ice mass left
     global frost   when the air itself freezes out (Venus, shaded)
     seas           fill the lowest seaFrac of the terrain, freeze
                    poleward of the frost line or everywhere if cold
     nitrogen seas  the same for liquefied air (Titan, dimmed)
     ice sheets     poleward of iceLat, as far as the ice mass stretches
     clouds         water, sulphuric acid (Venus), organic haze (Titan)
     sky            optical depth and scale height of the real column
     glow           the rock itself, once past the Draper point (798 K)
     scars          every single detonation you fire

   Blasts, plumes, ejecta, comets, mirrors and sunshades are drawn on a
   2-D layer above it through the same camera, so they sit on the globe.

   The JS twins of the GLSL noise (hash13 / vnoise / fbm / craterField /
   terrain) let a click be classified exactly as the pixel under it was
   drawn — ocean, ice, cap or rock — so a bomb hits what you can see.
   If WebGL2 is missing the same functions draw a coarser globe on the
   CPU, so the page never goes blank.
   ===================================================================== */
(function (global) {
  'use strict';

  const RN = {};
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const fract = (x) => x - Math.floor(x);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  RN.util = { dot, add, sub, mul, cross, norm, clamp, sstep };

  /* ------------------------------------------------------------------
     Noise.  Each function here has an identical GLSL twin below.
     ------------------------------------------------------------------ */
  function hash13(x, y, z) {
    let a = fract(x * 0.1031), b = fract(y * 0.1031), c = fract(z * 0.1031);
    const d = a * (c + 31.32) + b * (b + 31.32) + c * (a + 31.32);
    a += d; b += d; c += d;
    return fract((a + b) * c);
  }
  function hash33(x, y, z) {
    let a = fract(x * 0.1031), b = fract(y * 0.1030), c = fract(z * 0.0973);
    const d = a * (b + 33.33) + b * (a + 33.33) + c * (c + 33.33);
    a += d; b += d; c += d;
    return [fract((a + b) * c), fract((a + a) * b), fract((b + a) * a)];
  }
  function vnoise(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
    const L = (p, q, t) => p + (q - p) * t;
    return L(
      L(L(hash13(ix, iy, iz), hash13(ix + 1, iy, iz), ux), L(hash13(ix, iy + 1, iz), hash13(ix + 1, iy + 1, iz), ux), uy),
      L(L(hash13(ix, iy, iz + 1), hash13(ix + 1, iy, iz + 1), ux), L(hash13(ix, iy + 1, iz + 1), hash13(ix + 1, iy + 1, iz + 1), ux), uy),
      uz);
  }
  function fbm(x, y, z, oct) {
    let s = 0, a = 0.5, n = 0;
    for (let i = 0; i < 10; i++) {
      if (i >= oct) break;
      s += a * vnoise(x, y, z); n += a;
      x = x * 2.03 + 1.7; y = y * 2.03 + 9.2; z = z * 2.03 + 3.1; a *= 0.5;
    }
    return s / n;
  }
  /* bowl-and-rim craters scattered through 3-D cells; the sphere cuts
     each one as a disc, so sizes come out naturally varied */
  function craterField(px, py, pz, freq, seed) {
    const qx = px * freq, qy = py * freq, qz = pz * freq;
    const ix = Math.floor(qx), iy = Math.floor(qy), iz = Math.floor(qz);
    const fx = qx - ix, fy = qy - iy, fz = qz - iz;
    let h = 0;
    for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
      const cx = ix + x, cy = iy + y, cz = iz + z;
      const pr = hash13(cx + seed, cy + seed, cz + seed);
      if (pr < 0.55) continue;
      const r = hash33(cx + seed * 1.37, cy + seed * 1.37, cz + seed * 1.37);
      const dx = x + 0.15 + 0.7 * r[0] - fx, dy = y + 0.15 + 0.7 * r[1] - fy, dz = z + 0.15 + 0.7 * r[2] - fz;
      const rad = 0.18 + 0.32 * (pr - 0.55) / 0.45;
      const xx = Math.sqrt(dx * dx + dy * dy + dz * dz) / rad;
      if (xx < 1.6) h += rad * ((xx < 1 ? (xx * xx - 1) * 0.6 : 0) + 0.22 * Math.exp(-((xx - 1) * 5) * ((xx - 1) * 5)));
    }
    return h;
  }
  /* height, 0..1-ish, at unit direction (x,y,z) in the planet's frame */
  function terrain(r, x, y, z, oct) {
    const s = r.seed;
    const qx = x * 1.6 + s, qy = y * 1.6 + s * 0.7, qz = z * 1.6 - s * 1.3;
    let h = fbm(qx, qy, qz, oct);
    h = 0.5 + (h - 0.5) * (0.6 + 0.9 * r.rough);
    if (r.style === 1) h -= 0.13 * sstep(-0.45, 0.55, y + 0.35 * (vnoise(qx * 0.8 + 5, qy * 0.8 + 5, qz * 0.8 + 5) - 0.5));
    if (r.style === 2) h += 0.30 * (fbm(x * 0.8 + s + 7, y * 0.8 + s + 7, z * 0.8 + s + 7, 4) - 0.5);
    if (r.crater > 0.01) h += r.crater * (0.05 * craterField(x, y, z, 5, s) + 0.03 * craterField(x, y, z, 12, s + 3.3));
    return h;
  }
  /* Pluto's Tombaugh Regio, centred at 20°N 180°E; the western lobe is
     Sputnik Planitia, a basin of nitrogen ice */
  function heart(x, y, z, scale) {
    if (0.3429 * y - 0.9394 * z < 0.5) return 0;
    const u = -x / (0.55 * scale), v = (0.9394 * y + 0.3429 * z) / (0.55 * scale) + 0.15;
    const a = u * u + v * v - 1;
    return a * a * a - u * u * v * v * v < 0 ? 1 : 0;
  }
  /* Sputnik Planitia itself: a basin of nitrogen ice ~1000 km across in
     the western lobe, centred near 22°N 162°E here; it shrinks as the ice
     sublimes (area ~ mass) */
  function sputnik(x, y, z, scale) {
    if (0.2865 * x + 0.3746 * y - 0.8818 * z < 0.5) return 0;
    const u = -0.9511 * x - 0.3090 * z, v = -0.1158 * x + 0.9272 * y + 0.3563 * z;
    const a = 0.36 * scale, b = (v < 0 ? 0.5 : 0.42) * scale;
    return (u / a) * (u / a) + (v / b) * (v / b) < 1 ? 1 : 0;
  }
  RN.noise = { hash13, hash33, vnoise, fbm, craterField, terrain, heart, sputnik };

  /* heights sampled evenly over the sphere, so "fill the lowest 71% with
     sea" becomes a single threshold */
  const HT = {};
  function heightTable(w) {
    if (HT[w.key]) return HT[w.key];
    const N = 4096, out = new Float64Array(N), ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - 2 * (i + 0.5) / N, rr = Math.sqrt(1 - y * y), th = ga * i;
      out[i] = terrain(w.render, rr * Math.cos(th), y, rr * Math.sin(th), 6);
    }
    out.sort();
    return (HT[w.key] = out);
  }
  function level(t, f) {
    if (!(f > 0)) return -10;
    if (f >= 1) return 10;
    return t[Math.min(t.length - 1, Math.floor(f * t.length))];
  }
  RN.heightTable = heightTable;

  RN.dirFromLatLon = (latDeg, lonDeg) => {
    const la = latDeg * D2R, lo = lonDeg * D2R;
    return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
  };
  RN.latLonFromDir = (p) => ({ lat: Math.asin(clamp(p[1], -1, 1)) * R2D, lon: Math.atan2(p[0], p[2]) * R2D });

  /* What is on the ground at direction (x,y,z)?  Same tests, same order,
     same noise as the shader. */
  RN.classify = function (w, vs, look, x, y, z) {
    const r = w.render;
    const lat = Math.asin(clamp(y, -1, 1));
    const h = terrain(r, x, y, z, 6);
    const n2 = vs.capSpecies === 'n2';
    const capWord = n2 ? (w.polarTrap ? 'nitrogen ice' : 'nitrogen frost') : (w.polarTrap ? 'CO₂ polar ice' : 'CO₂ frost');
    if (vs.capFrac > 0) {
      if (r.heart) {
        if (sputnik(x, y, z, Math.sqrt(Math.max(vs.capFrac, 1e-4)))) return { kind: 'cap', label: 'nitrogen ice (Sputnik Planitia)', h };
      } else if (vs.capLat < 90) {
        const e = vs.capLat * D2R + 0.06 * (fbm(x * 6 + r.seed + 21, y * 6 + r.seed + 21, z * 6 + r.seed + 21, 3) - 0.5) * Math.min(1, vs.capLat * D2R / 0.1);
        if (vs.capLat * D2R < 0.004 || Math.abs(lat) > e) return { kind: 'cap', label: capWord, h };
      }
    }
    if (h < look.cryoLevel) return { kind: 'cap', label: n2 ? 'liquid-nitrogen sea' : 'liquid CO₂ sea', h };
    if (h < look.seaLevel) {
      const frozen = vs.frozenSea || Math.abs(lat) > vs.frostLat * D2R;
      return { kind: 'ocean', label: frozen ? 'frozen sea' : 'open ocean', h };
    }
    if (r.iceNative) return { kind: 'ice', label: w.key === 'titan' ? 'water-ice bedrock' : 'water-ice crust', h };
    if (vs.iceLat < 90) {
      const e = vs.iceLat * D2R + 0.06 * (fbm(x * 5 + r.seed + 31, y * 5 + r.seed + 31, z * 5 + r.seed + 31, 3) - 0.5) * Math.min(1, vs.iceLat * D2R / 0.1);
      if (vs.iceLat * D2R < 0.004 || Math.abs(lat) > e) return { kind: 'ice', label: 'water-ice sheet', h };
    }
    return { kind: 'rock', label: w.res0.rego_co2 > 0 ? 'regolith' : 'bare rock', h };
  };

  /* ------------------------------------------------------------------
     Shaders
     ------------------------------------------------------------------ */
  const VERT = `#version 300 es
void main() {
  vec2 P = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(P, 0.0, 1.0);
}`;

  const FRAG = `#version 300 es
precision highp float;
precision highp int;
out vec4 outCol;
uniform vec2 uRes;
uniform vec3 uCamPos, uCamR, uCamU, uCamF;
uniform float uTanF, uSpin, uTime, uOct, uExposure;
uniform vec3 uSun, uSunCol;
uniform int uStyle;
uniform vec3 uC0, uC1, uC2, uC3;
uniform float uCraterAmt, uRough, uSeed;
uniform vec4 uFlags;
uniform float uSeaLevel, uFrozenSea, uFrostLat, uSnow, uArid;
uniform float uCryoLevel;
uniform vec3 uCryoCol;
uniform float uIceLat, uIceNative;
uniform float uCapLat, uCapFrac;
uniform vec3 uCapCol;
uniform float uCloud;
uniform int uCloudKind;
uniform float uAtmTau, uAtmH;
uniform vec3 uAtmCol;
uniform float uGlow, uFallout, uBump;
uniform int uNScar;
uniform vec4 uScar[48];
uniform int uDebug;

float sstep(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float sq(float x) { return x * x; }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 hash33(vec3 p3) { p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y),
    u.z);
}
float fbm(vec3 p, float oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 10; i++) {
    if (float(i) >= oct) break;
    s += a * vnoise(p); n += a;
    p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5;
  }
  return s / n;
}
float craterField(vec3 p, float freq, float seed) {
  vec3 q = p * freq;
  vec3 i = floor(q), f = fract(q);
  float h = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 c = i + g;
    float pr = hash13(c + seed);
    if (pr < 0.55) continue;
    vec3 r = hash33(c + seed * 1.37);
    vec3 d = g + 0.15 + 0.7 * r - f;
    float rad = 0.18 + 0.32 * (pr - 0.55) / 0.45;
    float xx = length(d) / rad;
    if (xx < 1.6) h += rad * ((xx < 1.0 ? (xx * xx - 1.0) * 0.6 : 0.0) + 0.22 * exp(-((xx - 1.0) * 5.0) * ((xx - 1.0) * 5.0)));
  }
  return h;
}
float terrain(vec3 p, float oct) {
  vec3 q = p * 1.6 + vec3(uSeed, uSeed * 0.7, -uSeed * 1.3);
  float h = fbm(q, oct);
  h = 0.5 + (h - 0.5) * (0.6 + 0.9 * uRough);
  if (uStyle == 1) h -= 0.13 * sstep(-0.45, 0.55, p.y + 0.35 * (vnoise(q * 0.8 + 5.0) - 0.5));
  if (uStyle == 2) h += 0.30 * (fbm(p * 0.8 + vec3(uSeed + 7.0), 4.0) - 0.5);
  if (uCraterAmt > 0.01) h += uCraterAmt * (0.05 * craterField(p, 5.0, uSeed) + 0.03 * craterField(p, 12.0, uSeed + 3.3));
  return h;
}
float heart(vec3 p, float scale) {
  if (0.3429 * p.y - 0.9394 * p.z < 0.5) return 0.0;
  float u = -p.x / (0.55 * scale), v = (0.9394 * p.y + 0.3429 * p.z) / (0.55 * scale) + 0.15;
  float a = u * u + v * v - 1.0;
  float f = a * a * a - u * u * v * v * v;
  return 1.0 - sstep(-0.004, 0.004, f);
}
float sputnik(vec3 p, float scale) {
  if (0.2865 * p.x + 0.3746 * p.y - 0.8818 * p.z < 0.5) return 0.0;
  float u = -0.9511 * p.x - 0.3090 * p.z, v = -0.1158 * p.x + 0.9272 * p.y + 0.3563 * p.z;
  float a = 0.36 * scale, b = (v < 0.0 ? 0.5 : 0.42) * scale;
  return 1.0 - sstep(0.92, 1.05, (u / a) * (u / a) + (v / b) * (v / b));
}
vec3 toPlanet(vec3 v) { float c = cos(uSpin), s = sin(uSpin); return vec3(c * v.x - s * v.z, v.y, s * v.x + c * v.z); }
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x - s * v.z, v.y, s * v.x + c * v.z); }

vec3 baseColor(vec3 p, float h, float lat, float n2) {
  vec3 c;
  if (uStyle == 1) {                                   /* Mars */
    vec3 q = p * 1.6 + vec3(uSeed, uSeed * 0.7, -uSeed * 1.3);
    c = mix(uC0, uC1, sstep(0.35, 0.7, fbm(q * 1.3 + 2.0, 4.0)));
    float dark = sstep(0.54, 0.63, fbm(p * 1.4 + uSeed + 11.0, 5.0)) * (1.0 - sstep(0.45, 0.85, abs(p.y)));
    c = mix(c, uC2, 0.75 * dark);
    float lon = atan(p.x, p.z);
    float vm = exp(-sq((lat + 0.14 + 0.03 * sin(lon * 9.0)) / 0.014)) * (1.0 - sstep(0.25, 0.55, abs(lon + 1.3)));
    c = mix(c, uC2 * 0.8, 0.8 * vm);
    c *= 0.88 + 0.24 * n2;
  } else if (uStyle == 2) {                            /* Earth: land */
    float desert = sstep(0.42, 0.62, fbm(p * 2.6 + uSeed + 5.0, 4.0) + 0.3 * exp(-sq((abs(lat) - 0.42) / 0.16)) - 0.12 + uArid);
    c = mix(uC0, uC1, desert);
    c = mix(c, vec3(0.42, 0.40, 0.38), sstep(uSeaLevel + 0.14, uSeaLevel + 0.26, h) * (1.0 - 0.5 * uArid));
    c = mix(c, vec3(0.45, 0.42, 0.33), sstep(0.9, 1.2, abs(lat)) * (1.0 - uArid));
    c = mix(c, vec3(0.30, 0.20, 0.13), 0.6 * uArid * sstep(0.2, 0.6, n2));
  } else if (uStyle == 3) {                            /* Venus: the ground under the clouds */
    c = mix(uC0, uC1, sstep(0.35, 0.7, h + 0.3 * (n2 - 0.5)));
    c = mix(c, uC1 * 1.1, 0.5 * sstep(0.62, 0.72, fbm(p * 3.0 + uSeed + 1.0, 5.0)));
  } else if (uStyle == 4) {                            /* Europa */
    c = mix(uC1, uC0, sstep(0.4, 0.7, fbm(p * 2.2 + uSeed, 5.0)));
    float l1 = 1.0 - abs(2.0 * vnoise(p * 7.0 + uSeed) - 1.0);
    float l2 = 1.0 - abs(2.0 * vnoise(p * 15.0 + uSeed + 4.0) - 1.0);
    c = mix(c, uC2, 0.8 * max(sstep(0.94, 0.985, l1), 0.7 * sstep(0.95, 0.99, l2)));
    c = mix(c, mix(uC2, uC0, 0.5), 0.6 * sstep(0.64, 0.7, fbm(p * 3.0 + uSeed + 9.0, 4.0)));
  } else if (uStyle == 5) {                            /* Ganymede */
    float bright = sstep(0.47, 0.53, fbm(p * 1.5 + uSeed + 3.0, 5.0));
    float groove = 0.5 + 0.5 * sin(dot(p, normalize(vec3(0.3, 0.8, 0.5))) * 120.0 + 6.0 * vnoise(p * 6.0));
    c = mix(uC0, uC1 * (0.9 + 0.1 * groove), bright);
    c = mix(c, uC3, 0.5 * sstep(0.75, 0.95, abs(p.y)));
  } else if (uStyle == 6) {                            /* Io */
    c = mix(uC0, uC1, sstep(0.35, 0.7, fbm(p * 2.5 + uSeed, 5.0)));
    c = mix(c, uC3, 0.6 * sstep(0.62, 0.7, fbm(p * 3.5 + uSeed + 7.0, 4.0)));
    float v = craterField(p, 9.0, uSeed + 1.0);
    c = mix(c, uC2 * 0.4, sstep(-0.02, -0.1, v));
    c = mix(c, vec3(0.7, 0.25, 0.1), 0.6 * sstep(0.03, 0.09, v));
  } else if (uStyle == 7) {                            /* Titan */
    c = mix(uC1, uC0, sstep(0.4, 0.6, fbm(p * 2.0 + uSeed, 5.0)));
    float dunes = (1.0 - sstep(0.35, 0.6, abs(lat))) * sstep(0.45, 0.6, fbm(p * 2.5 + uSeed + 4.0, 4.0));
    c = mix(c, uC2, 0.85 * dunes);
    c = mix(c, vec3(0.02, 0.02, 0.03), sstep(1.05, 1.2, abs(lat)) * sstep(0.49, 0.45, h));
  } else if (uStyle == 8) {                            /* Enceladus */
    c = mix(uC0, uC1, fbm(p * 3.0 + uSeed, 4.0));
    float s = sin((p.x * 0.8 + p.z * 0.6) * 38.0);
    c = mix(c, uC2, 0.8 * sstep(0.93, 0.99, s) * sstep(-0.95, -1.1, lat));
  } else if (uStyle == 9) {                            /* Pluto, Triton */
    c = mix(uC0, uC1, sstep(0.35, 0.72, fbm(p * 1.8 + uSeed, 5.0)));
    if (uFlags.w > 0.5) {
      float cth = (1.0 - sstep(0.1, 0.45, abs(lat + 0.05))) * sstep(0.3, 0.8, -p.x + 0.3 * (n2 - 0.5));
      c = mix(c, uC2, 0.9 * cth);
      c = mix(c, mix(uC3, uC1, 0.35), 0.6 * heart(p, 1.0));
    } else {
      c *= 0.92 + 0.12 * vnoise(p * 40.0 + uSeed);
    }
  } else {                                             /* airless rock: Mercury, Moon, Ceres, Callisto, TRAPPIST-1e */
    c = mix(uC2, uC1, sstep(0.30, 0.78, h + 0.25 * (n2 - 0.5)));
    if (uFlags.x > 0.5) c = mix(c, uC0 * 0.75, 0.85 * sstep(0.50, 0.56, fbm(p * 1.2 + uSeed + 2.0, 4.0) + 0.08 * p.z));
    if (uFlags.y > 0.5) c = mix(c, uC2, 1.0 - sstep(0.0, 0.0006, 1.0 - dot(p, normalize(vec3(-0.6, 0.34, -0.72)))));
    if (uFlags.z > 0.5) c = mix(c, uC2, 0.7 * sstep(0.80, 0.9, vnoise(p * 55.0 + uSeed)));
  }
  return c;
}

vec3 stars(vec3 rd) {
  vec3 q = rd * 240.0;
  vec3 id = floor(q);
  float h = hash13(id + 11.0);
  if (h < 0.9965) return vec3(0.0);
  vec3 cp = id + 0.5 + 0.35 * (hash33(id) - 0.5);
  float s = (1.0 - sstep(0.0, 0.42, length(q - cp))) * (0.2 + 0.8 * (h - 0.9965) / 0.0035);
  return mix(vec3(1.0, 0.8, 0.62), vec3(0.72, 0.84, 1.0), hash13(id + 3.0)) * s * 0.6;
}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * uRes.y);
  vec3 rd = normalize(uCamF + uTanF * (uv.x * uCamR + uv.y * uCamU));
  vec3 ro = uCamPos;
  float b = dot(ro, rd);
  float disc = b * b - (dot(ro, ro) - 1.0);
  vec3 sunL = uSunCol;
  vec3 atm = pow(uAtmCol, vec3(2.2));
  float Hn = max(uAtmH, 1e-4);
  vec3 col;

  if (disc > 0.0 && b < 0.0) {
    float t = -b - sqrt(disc);
    vec3 P = ro + rd * t;
    vec3 n = normalize(P);
    vec3 p = toPlanet(n);
    float lat = asin(clamp(p.y, -1.0, 1.0));
    float h = terrain(p, uOct);
    float n2 = fbm(p * 4.0 + uSeed * 1.9, 4.0);
    vec3 alb = baseColor(p, h, lat, n2);
    alb *= 0.84 + 0.32 * fbm(p * 22.0 + 7.0, max(uOct - 4.0, 2.0));   /* fine detail when zoomed in */
    float spec = 0.0, relief = 1.0;

    /* parity check: paint the surface class exactly as RN.classify decides it */
    if (uDebug == 1) {
      vec3 k = vec3(0.0, 1.0, 0.0);                                   /* rock */
      bool cap = false;
      if (uCapFrac > 0.0) {
        if (uFlags.w > 0.5) cap = sputnik(p, sqrt(max(uCapFrac, 1e-4))) > 0.5;
        else if (uCapLat < 1.5707) {
          float e = uCapLat + 0.06 * (fbm(p * 6.0 + uSeed + 21.0, 3.0) - 0.5) * min(1.0, uCapLat / 0.1);
          cap = uCapLat < 0.004 || abs(lat) > e;
        }
      }
      bool ice = false;
      if (uIceLat < 1.5707) {
        float e = uIceLat + 0.06 * (fbm(p * 5.0 + uSeed + 31.0, 3.0) - 0.5) * min(1.0, uIceLat / 0.1);
        ice = uIceLat < 0.004 || abs(lat) > e;
      }
      if (cap || h < uCryoLevel) k = vec3(1.0, 0.0, 0.0);
      else if (h < uSeaLevel) k = vec3(0.0, 0.0, 1.0);
      else if (uIceNative > 0.5 || ice) k = vec3(1.0, 1.0, 1.0);
      outCol = vec4(k, 1.0);
      return;
    }

    /* gas frozen onto the ground */
    if (uCapFrac > 0.0) {
      float m = 0.0;
      if (uFlags.w > 0.5) m = sputnik(p, sqrt(max(uCapFrac, 1e-4)));
      else if (uCapLat < 1.5707) {
        float e = uCapLat + 0.06 * (fbm(p * 6.0 + uSeed + 21.0, 3.0) - 0.5) * min(1.0, uCapLat / 0.1);
        m = uCapLat < 0.004 ? 1.0 : sstep(e - 0.012, e + 0.012, abs(lat));
      }
      alb = mix(alb, uCapCol * (0.9 + 0.1 * n2), m);
      relief -= 0.6 * m;
    }
    /* liquefied air pooling in the lowlands */
    if (h < uCryoLevel) { alb = uCryoCol; spec = 0.7; relief = 0.0; }
    /* oceans, frozen poleward of the frost line */
    if (h < uSeaLevel) {
      vec3 sc = mix(vec3(0.05, 0.22, 0.38), vec3(0.01, 0.05, 0.16), sstep(0.0, 0.10, uSeaLevel - h));
      float frozen = max(uFrozenSea, sstep(uFrostLat - 0.03, uFrostLat + 0.03, abs(lat) + 0.05 * (n2 - 0.5)));
      alb = mix(sc, vec3(0.86, 0.90, 0.95), frozen);
      spec = 1.0 - frozen;
      relief = 0.0;
    } else if (uSnow > 0.5) {
      alb = mix(alb, vec3(0.92, 0.93, 0.96), 0.8 * sstep(uFrostLat - 0.04, uFrostLat + 0.08, abs(lat) + 0.08 * (n2 - 0.5)));
    }
    /* ice sheets */
    if (uIceNative < 0.5 && uIceLat < 1.5707) {
      float e = uIceLat + 0.06 * (fbm(p * 5.0 + uSeed + 31.0, 3.0) - 0.5) * min(1.0, uIceLat / 0.1);
      float m = uIceLat < 0.004 ? 1.0 : sstep(e - 0.012, e + 0.012, abs(lat));
      alb = mix(alb, vec3(0.93, 0.95, 0.98), m);
      relief -= 0.7 * m; spec *= 1.0 - m;
    }
    /* craters from single detonations: kind in the integer part of w,
       angular radius in the fraction */
    for (int i = 0; i < 48; i++) {
      if (i >= uNScar) break;
      vec4 s = uScar[i];
      float k = floor(s.w), r = max(fract(s.w), 1e-6);
      if (k > 2.5) continue;
      float x = acos(clamp(dot(p, s.xyz), -1.0, 1.0)) / r;
      if (x < 2.2) {
        vec3 dark = (k > 0.5 && k < 1.5) ? uC0 * 0.55 : alb * 0.35;
        alb = mix(alb, alb * 0.72, 0.4 * (1.0 - sstep(1.1, 2.2, x)));
        alb = mix(alb, dark, 0.85 * (1.0 - sstep(0.7, 1.0, x)));
        alb = mix(alb, alb * 1.25 + 0.04, 0.6 * exp(-((x - 1.05) * 6.0) * ((x - 1.05) * 6.0)));
      }
    }

    /* relief, from screen-space derivatives of the height */
    vec3 nb = n;
    vec3 dpx = dFdx(P), dpy = dFdy(P);
    float hb = h * uBump;
    float dhx = dFdx(hb), dhy = dFdy(hb);
    vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
    float det = dot(dpx, r1);
    if (abs(det) > 1e-14) nb = normalize(abs(det) * n - sign(det) * (dhx * r1 + dhy * r2));
    nb = normalize(mix(n, nb, clamp(relief, 0.0, 1.0)));   /* seas and ice lie flat */

    alb = pow(clamp(alb, 0.0, 1.0), vec3(2.2));
    float wrap = min(0.3, uAtmTau * 0.05);
    float lit = max((dot(nb, uSun) + wrap) / (1.0 + wrap), 0.0) * sstep(-0.15, 0.05, dot(n, uSun) + wrap);
    vec3 surf = alb * sunL * lit + alb * 0.003;
    if (spec > 0.0) {
      vec3 hv = normalize(uSun - rd);
      float sp = pow(max(dot(n, hv), 0.0), 120.0);
      float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
      surf += sunL * spec * sp * 1.5 * (0.3 + fres) * step(0.0, dot(n, uSun));
    }
    if (uGlow > 0.0) {
      vec3 gc = mix(vec3(0.55, 0.06, 0.01), vec3(1.0, 0.42, 0.10), uGlow);
      surf += gc * uGlow * (0.45 + 0.55 * n2) * 0.9;
    }
    if (uFallout > 0.0) {
      float f = uFallout * sstep(0.42, 0.62, fbm(p * 3.0 + 70.0, 4.0));
      surf = mix(surf, vec3(0.25, 0.85, 0.05) * 0.35, 0.55 * f);
    }

    /* clouds */
    if (uCloud > 0.001) {
      float cd; vec3 cc = vec3(0.96);
      if (uCloudKind == 1) {
        float band = fbm(vec3(p.x * 1.6, p.y * 9.0, p.z * 1.6) + vec3(uTime * 0.02, 0.0, 0.0), 4.0);
        cc = mix(vec3(0.78, 0.68, 0.45), vec3(0.98, 0.93, 0.78), band); cd = uCloud;
      } else if (uCloudKind == 2) {
        float band = fbm(vec3(p.x * 1.2, p.y * 6.0, p.z * 1.2) + 3.0, 3.0);
        cc = mix(vec3(0.60, 0.36, 0.12), vec3(0.86, 0.58, 0.25), band); cd = uCloud;
      } else {
        vec3 cq = rotY(p, uTime * 0.015);
        float nn = fbm(cq * 3.0 + vec3(40.0, 13.0, 7.0), 6.0) + 0.05 * cos(lat * 6.0);
        float th = 0.5 + 0.12 * (1.0 - 2.0 * uCloud);
        cd = sstep(th - 0.015, th + 0.045, nn) * sstep(0.04, 0.45, uCloud);
      }
      float cl = max((dot(n, uSun) + 0.12) / 1.12, 0.0);
      vec3 under = uGlow > 0.0 ? vec3(0.5, 0.12, 0.03) * uGlow * 0.3 : vec3(0.0);
      surf = mix(surf, pow(cc, vec3(2.2)) * sunL * cl + under, cd * 0.96);
    }
    /* the sky between you and the ground */
    if (uAtmTau > 0.0) {
      /* under a cloud deck, only the thin air above the cloud tops scatters */
      float tau0 = (uCloudKind > 0 && uCloud > 0.5) ? min(uAtmTau, 0.25) : uAtmTau;
      float mu = max(dot(n, -rd), 0.0);
      float X = min(1.0 / max(mu, 0.01), sqrt(1.5708 / Hn));
      float tau = tau0 * X;
      float sl = sstep(-0.25, 0.35, dot(n, uSun));
      surf = surf * exp(-tau * 0.35) + atm * sunL * sl * (1.0 - exp(-tau * 0.6)) * 0.8;
    }
    col = surf;
  } else {
    col = stars(rd);
    float sd = max(dot(rd, uSun), 0.0);
    col += sunL * (pow(sd, 3000.0) * 30.0 + pow(sd, 250.0) * 0.25);
    if (uDebug == 1) { outCol = vec4(0.0, 0.0, 0.0, 1.0); return; }
    if (uAtmTau > 0.0 && b < 0.0) {
      vec3 pc = ro - rd * b;
      float bi = length(pc);
      float tl = uAtmTau * sqrt(6.2832 / Hn) * exp(-(bi - 1.0) / Hn);
      float sl = sstep(-0.3, 0.3, dot(pc / bi, uSun));
      float fwd = pow(sd, 8.0);
      col += atm * sunL * (1.0 - exp(-tl * 0.6)) * (sl * 0.8 + 1.5 * fwd);
    }
  }
  col = aces(col * uExposure);
  outCol = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;
  RN.VERT = VERT;
  RN.FRAG = FRAG;

  const UNIFORMS = ['uRes', 'uCamPos', 'uCamR', 'uCamU', 'uCamF', 'uTanF', 'uSpin', 'uTime', 'uOct', 'uExposure',
    'uSun', 'uSunCol', 'uStyle', 'uC0', 'uC1', 'uC2', 'uC3', 'uCraterAmt', 'uRough', 'uSeed', 'uFlags',
    'uSeaLevel', 'uFrozenSea', 'uFrostLat', 'uSnow', 'uArid', 'uCryoLevel', 'uCryoCol', 'uIceLat', 'uIceNative',
    'uCapLat', 'uCapFrac', 'uCapCol', 'uCloud', 'uCloudKind', 'uAtmTau', 'uAtmH', 'uAtmCol',
    'uGlow', 'uFallout', 'uBump', 'uNScar', 'uScar', 'uDebug'];

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return { ok: false, log: gl.getShaderInfoLog(s) || 'compile failed' };
    return { ok: true, s };
  }

  const SCAR_KIND = { rock: 0, cap: 1, capn2: 1, ice: 2, ocean: 3 };

  /* ------------------------------------------------------------------
     The view
     ------------------------------------------------------------------ */
  function View(canvas, overlay) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.fx = overlay.getContext('2d');
    this.cam = { yaw: 0.45, pitch: 0.30, dist: 4.3, fov: 34 * D2R };
    this.spin = 0;
    this.spinOn = true;
    this.spinDir = 1;
    this.sun = norm([1.0, 0.22, 0.05]);
    this.trueScale = false;
    this.showFallout = false;
    this.effects = [];
    this.impactScars = [];
    this.labels = true;
    this.resScale = 1;
    this._ema = 16.7;
    this._resT = 0;
    this.lastExag = 1;
    this.w = null;
    this.vs = null;
    this.plan = null;
    this.look = { seaLevel: -10, cryoLevel: -10 };
    this.cssW = 1; this.cssH = 1; this.dpr = 1;
    this.mode = 'none';
    const forceCPU = global.location && /[?&]cpu=1/.test(global.location.search || '');   /* ?cpu=1 for testing */
    if (forceCPU || !this._initGL()) { if (forceCPU) this.glError = 'CPU renderer forced by ?cpu=1'; this._initCPU(); }
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this._initGL(); });
  }
  RN.View = View;

  View.prototype._initGL = function () {
    let gl = null;
    try {
      gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    } catch (e) { gl = null; }
    if (!gl) { this.glError = 'WebGL2 is not available in this browser'; return false; }
    const v = compile(gl, gl.VERTEX_SHADER, VERT), f = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!v.ok || !f.ok) {
      this.glError = 'shader: ' + (v.log || f.log);
      console.warn('[render] ' + this.glError);
      return false;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, v.s); gl.attachShader(prog, f.s);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      this.glError = 'link: ' + gl.getProgramInfoLog(prog);
      console.warn('[render] ' + this.glError);
      return false;
    }
    this.gl = gl; this.prog = prog;
    this.vao = gl.createVertexArray();
    this.U = {};
    for (const n of UNIFORMS) this.U[n] = gl.getUniformLocation(prog, n);
    this.scarBuf = new Float32Array(48 * 4);
    this.mode = 'webgl2';
    return true;
  };

  View.prototype._initCPU = function () {
    this.mode = 'cpu';
    this.canvas.style.visibility = 'hidden';
    this.cpu = document.createElement('canvas');
    this.cpuT = -1;
  };

  View.prototype.setWorld = function (w) {
    this.w = w;
    this.table = heightTable(w);
    this.spinDir = w.rotation_h < 0 ? -1 : 1;
    this.effects = [];
    this.impactScars = [];
    this.cpuT = -1;
  };

  View.prototype.setState = function (vs, plan) {
    this.vs = vs;
    this.plan = plan || this.plan;
    this.look.seaLevel = level(this.table, vs.seaFrac);
    this.look.cryoLevel = level(this.table, vs.cryoSeaFrac);
  };

  /* ---------------- camera ---------------- */
  View.prototype.basis = function () {
    const c = this.cam, cp = Math.cos(c.pitch);
    const pos = [c.dist * cp * Math.sin(c.yaw), c.dist * Math.sin(c.pitch), c.dist * cp * Math.cos(c.yaw)];
    const F = norm(mul(pos, -1));
    const R = norm(cross(F, [0, 1, 0]));
    const U = cross(R, F);
    /* in a portrait view keep the planet's width, not its height, in frame */
    const tanF = Math.tan(c.fov / 2) * Math.max(1, (this.cssH || 1) / (this.cssW || 1));
    return { pos, F, R, U, tanF };
  };
  View.prototype.orbit = function (dx, dy) {
    const k = 0.005 * Math.min(1, (this.cam.dist - 1) / 1.5 + 0.08);
    this.cam.yaw -= dx * k;
    this.cam.pitch = clamp(this.cam.pitch + dy * k, -1.45, 1.45);
  };
  View.prototype.zoom = function (f) {
    this.cam.dist = clamp(1 + (this.cam.dist - 1) * f, 1.015, 9);
  };
  View.prototype.resetView = function () { this.cam.yaw = 0.45; this.cam.pitch = 0.30; this.cam.dist = 4.3; };

  View.prototype.toWorld = function (v) {
    const c = Math.cos(this.spin), s = Math.sin(this.spin);
    return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]];
  };
  View.prototype.toPlanet = function (v) {
    const c = Math.cos(this.spin), s = Math.sin(this.spin);
    return [c * v[0] - s * v[2], v[1], s * v[0] + c * v[2]];
  };
  /* world point -> CSS pixels, with pixels per unit length at that depth */
  View.prototype.project = function (P, B) {
    B = B || this.B || this.basis();
    const v = sub(P, B.pos);
    const z = dot(v, B.F);
    if (z <= 1e-6) return null;
    const k = (this.cssH / 2) / (z * B.tanF);
    return { x: this.cssW / 2 + dot(v, B.R) * k, y: this.cssH / 2 - dot(v, B.U) * k, z, s: k };
  };
  /* is world point P hidden behind the planet? */
  View.prototype.visible = function (P, B) {
    B = B || this.B;
    const d = sub(P, B.pos), L = Math.hypot(d[0], d[1], d[2]);
    const rd = mul(d, 1 / L);
    const b = dot(B.pos, rd), disc = b * b - (dot(B.pos, B.pos) - 1);
    if (disc <= 0) return true;
    return -b - Math.sqrt(disc) >= L - 1e-4;
  };
  View.prototype.ray = function (x, y) {
    const B = this.B || this.basis();
    const ux = (x - this.cssW / 2) / (this.cssH / 2), uy = -(y - this.cssH / 2) / (this.cssH / 2);
    const rd = norm(add(B.F, add(mul(B.R, ux * B.tanF), mul(B.U, uy * B.tanF))));
    const b = dot(B.pos, rd), disc = b * b - (dot(B.pos, B.pos) - 1);
    if (disc <= 0 || b >= 0) return null;
    const P = add(B.pos, mul(rd, -b - Math.sqrt(disc)));
    return norm(P);
  };
  /* what lies under CSS pixel (x, y) */
  View.prototype.pick = function (x, y) {
    const n = this.ray(x, y);
    if (!n || !this.w || !this.vs) return null;
    const p = this.toPlanet(n);
    const ll = RN.latLonFromDir(p);
    const cls = RN.classify(this.w, this.vs, this.look, p[0], p[1], p[2]);
    return { lat: ll.lat, lon: ll.lon, dir: p, cls };
  };
  /* a random point of the requested kind, for campaign flashes */
  View.prototype.randomSpot = function (kind) {
    if (!this.w || !this.vs) return null;
    let best = null;
    for (let i = 0; i < 40; i++) {
      const y = 2 * Math.random() - 1, th = Math.random() * 2 * Math.PI, r = Math.sqrt(1 - y * y);
      const p = [r * Math.cos(th), y, r * Math.sin(th)];
      const cls = RN.classify(this.w, this.vs, this.look, p[0], p[1], p[2]);
      if (!best) best = p;
      if (cls.kind === kind || (kind === 'rego' || kind === 'carb' || kind === 'rock') && cls.kind === 'rock') return p;
    }
    return best;
  };
  View.prototype.pxPerR = function () { return (this.cssH / 2) / (Math.max(this.cam.dist - 1, 0.01) * (this.B || this.basis()).tanF); };

  /* ---------------- effects ---------------- */
  /* info: {fireball, crater, plumeTop (m), vacuum, target, yieldMt, count, campaign} */
  View.prototype.addBlast = function (dirPlanet, info) {
    this.effects.push(Object.assign({ type: 'blast', dir: dirPlanet, t0: performance.now() / 1000, seed: Math.random() * 1000 }, info));
    if (this.effects.length > 40) this.effects.splice(0, this.effects.length - 40);
  };
  View.prototype.addComet = function (dirPlanet, info) {
    const t = norm(cross(dirPlanet, Math.abs(dirPlanet[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const a = Math.random() * Math.PI * 2;
    const side = norm(add(mul(t, Math.cos(a)), mul(cross(dirPlanet, t), Math.sin(a))));
    this.effects.push(Object.assign({
      type: 'comet', dir: dirPlanet, side, t0: performance.now() / 1000 + 1.3, seed: Math.random() * 1000
    }, info));
    if (info.crater && !info.campaign) {
      this.impactScars.push({ dir: dirPlanet, r: info.crater, t: performance.now() });
      if (this.impactScars.length > 12) this.impactScars.shift();
    }
  };

  /* ---------------- frame ---------------- */
  View.prototype._resize = function () {
    const box = this.overlay.parentElement.getBoundingClientRect();
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    this.cssW = Math.max(2, box.width); this.cssH = Math.max(2, box.height); this.dpr = dpr;
    const ow = Math.round(this.cssW * dpr), oh = Math.round(this.cssH * dpr);
    if (this.overlay.width !== ow || this.overlay.height !== oh) { this.overlay.width = ow; this.overlay.height = oh; }
    const k = dpr * this.resScale;
    const gw = Math.max(2, Math.round(this.cssW * k)), gh = Math.max(2, Math.round(this.cssH * k));
    if (this.canvas.width !== gw || this.canvas.height !== gh) { this.canvas.width = gw; this.canvas.height = gh; }
  };

  View.prototype.frame = function (now, dtReal) {
    if (!this.w || !this.vs) return;
    this._resize();
    if (this.spinOn) this.spin += dtReal * 0.05 * this.spinDir;
    const B = this.B = this.basis();
    if (this.mode === 'webgl2' && !this.lost) this._drawGL(now, B);
    this._drawFX(now, B);
    /* keep the frame rate up on slow GPUs by lowering the shader's resolution */
    if (this.mode === 'webgl2' && dtReal > 0 && dtReal < 0.5) {
      this._ema += (dtReal * 1000 - this._ema) * 0.05;
      if (now - this._resT > 1.2) {
        if (this._ema > 30 && this.resScale > 0.4) { this.resScale = Math.max(0.4, this.resScale - 0.1); this._resT = now; }
        else if (this._ema < 18 && this.resScale < 1) { this.resScale = Math.min(1, this.resScale + 0.05); this._resT = now; }
      }
    }
  };

  View.prototype._scars = function () {
    const out = [];
    const minAng = this.trueScale ? 0 : 3.5 / this.pxPerR();
    const R = this.w.R;
    const sims = (this.vs.scars || []).slice(-36);
    for (const s of sims) {
      const d = RN.dirFromLatLon(s.lat, s.lon);
      out.push([d, Math.max(s.r / R, minAng), SCAR_KIND[s.surface] || 0]);
    }
    for (const s of this.impactScars) out.push([s.dir, Math.max(s.r / R, minAng), 0]);
    return out.slice(-48);
  };

  View.prototype._drawGL = function (now, B) {
    const gl = this.gl, U = this.U, w = this.w, r = w.render, vs = this.vs;
    const W = this.canvas.width, H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    const u1 = (n, v) => gl.uniform1f(U[n], v);
    const u3 = (n, v) => gl.uniform3f(U[n], v[0], v[1], v[2]);
    gl.uniform2f(U.uRes, W, H);
    u3('uCamPos', B.pos); u3('uCamR', B.R); u3('uCamU', B.U); u3('uCamF', B.F);
    u1('uTanF', B.tanF); u1('uSpin', this.spin); u1('uTime', now % 10000);
    const pix = Math.max(this.cam.dist - 1, 0.005) * 2 * B.tanF / H;
    u1('uOct', clamp(1 + Math.log2(0.5 / (1.6 * pix)) / Math.log2(2.03), 6, 10));
    u1('uExposure', 1.1);
    u3('uSun', this.sun);
    const boost = clamp(Math.pow(vs.sunBoost || 1, 0.4), 0.05, 3);
    u3('uSunCol', mul(r.redStar ? [1.0, 0.62, 0.42] : [1.0, 0.97, 0.93], boost));
    gl.uniform1i(U.uStyle, r.style);
    u3('uC0', r.c0); u3('uC1', r.c1); u3('uC2', r.c2); u3('uC3', r.c3);
    u1('uCraterAmt', r.crater); u1('uRough', r.rough); u1('uSeed', r.seed);
    gl.uniform4f(U.uFlags, r.maria ? 1 : 0, r.spots ? 1 : 0, r.rays ? 1 : 0, r.heart ? 1 : 0);
    u1('uSeaLevel', this.look.seaLevel); u1('uFrozenSea', vs.frozenSea ? 1 : 0);
    u1('uFrostLat', vs.frostLat * D2R); u1('uSnow', vs.hydro ? 1 : 0); u1('uArid', vs.arid || 0);
    u1('uCryoLevel', this.look.cryoLevel); u3('uCryoCol', [0.04, 0.06, 0.10]);
    u1('uIceLat', vs.iceLat * D2R); u1('uIceNative', r.iceNative ? 1 : 0);
    u1('uCapLat', vs.capLat * D2R); u1('uCapFrac', vs.capFrac);
    u3('uCapCol', w.polarTrap ? r.c3 : [0.93, 0.94, 0.97]);
    u1('uCloud', vs.cloud); gl.uniform1i(U.uCloudKind, vs.cloudKind);
    const tau = vs.pPa > 0.5 ? Math.max(vs.atmoTau, 0.02) : 0;
    u1('uAtmTau', tau); u1('uAtmH', Math.max(vs.atmoShell / 4, 0.002)); u3('uAtmCol', vs.atmoCol);
    u1('uGlow', vs.glow); u1('uFallout', this.showFallout ? Math.max(vs.fallout, 0) : 0);
    u1('uBump', r.crater > 0.5 ? 0.05 : 0.03);
    const sc = this._scars();
    this.scarBuf.fill(0);
    sc.forEach((s, i) => {
      this.scarBuf.set([s[0][0], s[0][1], s[0][2], s[2] + Math.min(0.999, s[1])], i * 4);
    });
    gl.uniform1i(U.uNScar, sc.length);
    gl.uniform4fv(U.uScar, this.scarBuf);
    gl.uniform1i(U.uDebug, this._debug ? 1 : 0);
    if (this._debug) u1('uOct', 6);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  /* Draw one frame in "class" colours and compare n random pixels with what
     RN.classify says is there.  Returns the fraction that agree. */
  View.prototype.parityTest = function (n) {
    if (this.mode !== 'webgl2') return null;
    const gl = this.gl, B = this.B || this.basis();
    this._debug = true;
    this._drawGL(performance.now() / 1000, B);
    this._debug = false;
    const W = this.canvas.width, H = this.canvas.height, all = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, all);   /* one read: each readPixels stalls the GPU */
    const name = (r, g, b) => r > 127 && g < 128 ? 'cap' : b > 127 && r < 128 && g < 128 ? 'ocean' : r > 127 && g > 127 ? 'ice' : g > 127 ? 'rock' : 'space';
    let agree = 0, tried = 0;
    const counts = {};
    for (let i = 0; i < n * 4 && tried < n; i++) {
      const X = Math.floor(Math.random() * W), Y = Math.floor(Math.random() * H);
      const o = (Y * W + X) * 4, px = [all[o], all[o + 1], all[o + 2]];
      const gpu = name(px[0], px[1], px[2]);
      if (gpu === 'space') continue;
      const pk = this.pick((X + 0.5) / W * this.cssW, (1 - (Y + 0.5) / H) * this.cssH);
      if (!pk) continue;
      tried++;
      const cpu = pk.cls.kind;
      counts[gpu] = (counts[gpu] || 0) + 1;
      if (cpu === gpu) agree++;
    }
    return { agree: tried ? agree / tried : 0, tried, counts };
  };

  /* coarse CPU globe for machines without WebGL2 */
  View.prototype._cpuGlobe = function (now, B) {
    if (now - this.cpuT < 0.35 && this.cpuT > 0) return;
    this.cpuT = now;
    const W = Math.max(40, Math.min(220, Math.round(this.cssW / 3))), H = Math.max(30, Math.round(W * this.cssH / this.cssW));
    const cv = this.cpu; cv.width = W; cv.height = H;
    const cx = cv.getContext('2d'), img = cx.createImageData(W, H), d = img.data;
    const w = this.w, r = w.render, vs = this.vs, sun = this.sun;
    const lin = (c) => c.map((v) => Math.pow(v, 2.2));
    const c1 = lin(r.c1), c2 = lin(r.style === 0 || r.style === 10 ? r.c2 : r.c0);
    const capC = lin(w.polarTrap ? r.c3 : [0.93, 0.94, 0.97]);
    const cloudC = lin(vs.cloudKind === 1 ? [0.95, 0.88, 0.65] : vs.cloudKind === 2 ? [0.8, 0.52, 0.22] : [0.95, 0.95, 0.95]);
    const atm = lin(vs.atmoCol), tau = vs.pPa > 0.5 ? Math.max(vs.atmoTau, 0.02) : 0;
    const sunC = r.redStar ? [1, 0.62, 0.42] : [1, 0.97, 0.93];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const ux = (i + 0.5 - W / 2) / (H / 2), uy = -(j + 0.5 - H / 2) / (H / 2);
      const rd = norm(add(B.F, add(mul(B.R, ux * B.tanF), mul(B.U, uy * B.tanF))));
      const b = dot(B.pos, rd), disc = b * b - (dot(B.pos, B.pos) - 1);
      let col = [0, 0, 0];
      if (disc > 0 && b < 0) {
        const n = norm(add(B.pos, mul(rd, -b - Math.sqrt(disc))));
        const p = this.toPlanet(n);
        const cls = RN.classify(w, vs, this.look, p[0], p[1], p[2]);
        let a;
        if (cls.kind === 'cap') a = cls.label.indexOf('sea') >= 0 ? [0.004, 0.006, 0.012] : capC;
        else if (cls.kind === 'ocean') a = cls.label === 'frozen sea' ? [0.7, 0.78, 0.88] : [0.003, 0.03, 0.1];
        else if (cls.kind === 'ice' && !r.iceNative) a = [0.85, 0.88, 0.94];
        else { const t = sstep(0.3, 0.75, cls.h); a = c2.map((v, k) => v + (c1[k] - v) * t); }
        const lit = Math.max(0, dot(n, sun));
        col = a.map((v, k) => v * sunC[k] * lit);
        if (vs.cloud > 0) col = col.map((v, k) => v + (cloudC[k] * sunC[k] * Math.max(0, dot(n, sun) + 0.1) - v) * vs.cloud * (vs.cloudKind ? 0.95 : 0.45));
        if (tau > 0) {
          const mu = Math.max(dot(n, mul(rd, -1)), 0.02), tt = tau / mu;
          col = col.map((v, k) => v * Math.exp(-tt * 0.35) + atm[k] * sunC[k] * sstep(-0.25, 0.35, dot(n, sun)) * (1 - Math.exp(-tt * 0.6)) * 0.8);
        }
        if (vs.glow > 0) { col[0] += 0.9 * vs.glow; col[1] += 0.3 * vs.glow; col[2] += 0.06 * vs.glow; }
      } else if (tau > 0 && b < 0) {
        const pc = sub(B.pos, mul(rd, b)), bi = Math.hypot(pc[0], pc[1], pc[2]);
        const Hn = Math.max(vs.atmoShell / 4, 0.002);
        const tl = tau * Math.sqrt(6.2832 / Hn) * Math.exp(-(bi - 1) / Hn);
        const sl = sstep(-0.3, 0.3, dot(mul(pc, 1 / bi), sun));
        col = atm.map((v, k) => v * sunC[k] * (1 - Math.exp(-tl * 0.6)) * sl * 0.8);
      }
      const o = (j * W + i) * 4;
      for (let k = 0; k < 3; k++) {
        const x = col[k] * 1.1;
        const m = Math.max(0, Math.min(1, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
        d[o + k] = Math.round(255 * Math.pow(m, 1 / 2.2));
      }
      d[o + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
  };

  /* ---------------- the 2-D effects layer ---------------- */
  View.prototype._drawFX = function (now, B) {
    const g = this.fx, dpr = this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.overlay.width, this.overlay.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.mode !== 'webgl2' || this.lost) {
      this._cpuGlobe(now, B);
      g.fillStyle = '#000'; g.fillRect(0, 0, this.cssW, this.cssH);
      g.imageSmoothingEnabled = true;
      g.drawImage(this.cpu, 0, 0, this.cssW, this.cssH);
    }
    this._drawMirror(g, B);

    const disc = { x: this.cssW / 2, y: this.cssH / 2, r: (this.cssH / 2) * Math.tan(Math.asin(1 / this.cam.dist)) / B.tanF };
    const keep = [];
    for (const e of this.effects) {
      const a = now - e.t0;
      const life = e.type === 'comet' ? 14 : (e.vacuum ? 10 : 12 + 3 * pulseTime(e));
      if (a > life) continue;
      keep.push(e);
      if (e.type === 'comet' && a < 0) this._drawCometApproach(g, e, a, B);
      else this._drawBlast(g, e, Math.max(a, 0), B, disc);
    }
    this.effects = keep;
  };

  /* the thermal pulse of a nuclear fireball peaks later and lasts longer
     for bigger yields: t_max ~ 0.0417 s * Y_kt^0.44 (Glasstone & Dolan
     §7.88).  It plays here in real time. */
  function pulseTime(e) {
    if (!e.yieldMt) return 0.3;
    return clamp(0.0417 * Math.pow(e.yieldMt * 1000, 0.44), 0.15, 5);
  }

  function rgba(c, a) { return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${Math.max(0, Math.min(1, a)).toFixed(3)})`; }

  /* a disc of radius r (R units) lying in the tangent plane at world
     point C with normal n, drawn through the camera as an affine ellipse */
  View.prototype._ellipse = function (g, C, n, r, B, paint) {
    const t1 = norm(cross(n, Math.abs(n[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0])), t2 = cross(n, t1);
    const c = this.project(C, B), a = this.project(add(C, mul(t1, r)), B), b = this.project(add(C, mul(t2, r)), B);
    if (!c || !a || !b) return;
    const dpr = this.dpr;
    g.save();
    g.setTransform(dpr * (a.x - c.x), dpr * (a.y - c.y), dpr * (b.x - c.x), dpr * (b.y - c.y), dpr * c.x, dpr * c.y);
    g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2);
    paint(g, [dot(this.sun, t1), dot(this.sun, t2)]);
    g.restore();
  };

  View.prototype._drawBlast = function (g, e, a, B, disc) {
    const w = this.w;
    const n = this.toWorld(e.dir);
    const base = this.project(n, B);
    if (!base) return;
    const facing = this.visible(add(n, mul(n, 1e-4)), B);
    const R = w.R;
    const plR = Math.max(e.plumeTop || 1, 1) / R, fbR = (e.fireball || 0) / R, crR = (e.crater || 1) / R;
    const exag = this.trueScale ? 1 : Math.max(1, 30 / (plR * base.s));
    if (!e.campaign) this.lastExag = exag;
    const light = clamp(0.35 + 1.1 * dot(n, this.sun), 0.07, 1.25);
    const tp = pulseTime(e);
    const sunlit = dot(n, this.sun);
    const steam = e.target === 'ocean' || e.target === 'ice';
    const dustRGB = w.render.c1.map((v) => 255 * v * 0.85);
    /* surface bursts loft whatever they hit: steam over water, dirty
       vapour and dust over ice, the planet's own soil over rock */
    const smokeRGB = steam ? [228, 232, 238] : e.target === 'cap' ? [168, 160, 155] : dustRGB.map((v) => v * 0.6 + 205 * 0.4);
    const k = e.campaign ? 0.7 : 1;

    /* 1. the flash lights up the ground around it */
    const flash = Math.min(1, a / 0.02) * (0.55 * Math.exp(-a / 0.08) + 0.45 * Math.exp(-a / (1.3 * tp))) + 0.15 * Math.exp(-a / (4 * tp));
    if (facing && flash > 0.01) {
      const gr = Math.max((fbR || crR * 2) * exag * 5, 12 / base.s);
      g.save();
      g.beginPath(); g.arc(disc.x, disc.y, disc.r, 0, Math.PI * 2); g.clip();
      g.globalCompositeOperation = 'lighter';
      this._ellipse(g, n, n, gr, B, (gg) => {
        const rg = gg.createRadialGradient(0, 0, 0, 0, 0, 1);
        rg.addColorStop(0, rgba([255, 250, 235], 0.95 * flash * k));
        rg.addColorStop(0.25, rgba([255, 205, 140], 0.45 * flash * k));
        rg.addColorStop(1, rgba([255, 150, 80], 0));
        gg.fillStyle = rg; gg.fill();
      });
      g.restore();
    }

    if (!e.vacuum) {
      /* 2. the blast wave — a condensation or dust ring racing outward */
      if (facing && a < 3.2) {
        const rr = Math.max(fbR * exag, 4 / base.s) * (1.2 + 7 * a / 3.2);
        g.save();
        g.beginPath(); g.arc(disc.x, disc.y, disc.r, 0, Math.PI * 2); g.clip();
        this._ellipse(g, n, n, rr, B, (gg) => {
          const rg = gg.createRadialGradient(0, 0, 0.72, 0, 0, 1);
          const cc = (steam || w.key === 'earth') ? [240, 244, 250] : smokeRGB;
          rg.addColorStop(0, rgba(cc, 0));
          rg.addColorStop(0.85, rgba(cc, 0.55 * (1 - a / 3.2) * k * Math.max(0.35, light)));
          rg.addColorStop(1, rgba(cc, 0));
          gg.fillStyle = rg; gg.fill();
        });
        g.restore();
      }

      /* 3. the mushroom.  The rising fireball becomes the cap: it condenses
         out as the fireball cools, climbs to the plume top and spreads.
         (Rise is sped up — the real climb takes several minutes.) */
      const form = 0.6 * tp + 0.6;
      const env = sstep(0.15 * form, form, a) * (a < 8 + tp ? 1 : Math.max(0, 1 - (a - 8 - tp) / 5)) * k;
      const gRise = 1 - Math.exp(-a / (1.6 + 0.3 * tp));
      const top = plR * exag * gRise;
      const capR = plR * exag * (0.25 + 0.45 * gRise);
      if (env > 0.01) {
        const lightC = smokeRGB.map((v) => v * light);
        const glowC = [255, 140, 60];
        const glowMix = Math.exp(-a / (1.5 * tp + 1)) * (sunlit < 0.1 ? 0.85 : 0.45);
        const col = lightC.map((v, i) => Math.min(255, v * (1 - glowMix) + glowC[i] * glowMix));

        /* its shadow on the ground, cast away from the sun */
        const c = dot(n, this.sun);
        if (facing && c > 0.08) {
          const away = norm(sub(mul(n, c), this.sun));
          const off = Math.min(top * Math.sqrt(1 - c * c) / c, 4 * top);
          const S = norm(add(n, mul(away, off)));
          g.save();
          g.beginPath(); g.arc(disc.x, disc.y, disc.r, 0, Math.PI * 2); g.clip();
          this._ellipse(g, S, S, capR * 1.05, B, (gg) => {
            const rg = gg.createRadialGradient(0, 0, 0.2, 0, 0, 1);
            rg.addColorStop(0, `rgba(0,0,0,${(0.42 * env).toFixed(3)})`);
            rg.addColorStop(1, 'rgba(0,0,0,0)');
            gg.fillStyle = rg; gg.fill();
          });
          g.restore();
        }

        const B0 = this.project(n, B), T0 = this.project(mul(n, 1 + top * 0.86), B);
        if (B0 && T0 && (this.visible(mul(n, 1 + top * 0.5), B) || facing)) {
          const dx = T0.x - B0.x, dy = T0.y - B0.y, L = Math.hypot(dx, dy);
          if (L > 1.5) {
            const nx = -dy / L, ny = dx / L;
            const wb = capR * 0.30 * B0.s, wt = capR * 0.18 * T0.s;
            const lg = g.createLinearGradient(B0.x, B0.y, T0.x, T0.y);
            lg.addColorStop(0, rgba(col.map((v) => v * 0.62), 0.85 * env));
            lg.addColorStop(1, rgba(col, 0.9 * env));
            g.fillStyle = lg;
            g.beginPath();
            g.moveTo(B0.x + nx * wb, B0.y + ny * wb); g.lineTo(T0.x + nx * wt, T0.y + ny * wt);
            g.lineTo(T0.x - nx * wt, T0.y - ny * wt); g.lineTo(B0.x - nx * wb, B0.y - ny * wb);
            g.closePath(); g.fill();
          }
        }
        const layers = [[-0.45, 0.78], [0, 1.0], [0.4, 0.8]];
        for (const [dh, rf] of layers) {
          const C = mul(n, 1 + top + dh * capR * 0.45);
          if (!this.visible(C, B)) continue;
          this._ellipse(g, C, n, capR * rf, B, (gg, sd) => {
            const ox = clamp(sd[0], -1, 1) * 0.4, oy = clamp(sd[1], -1, 1) * 0.4;
            const rg = gg.createRadialGradient(ox, oy, 0.05, 0, 0, 1);
            rg.addColorStop(0, rgba(col.map((v) => Math.min(255, v * 1.3 + 20)), 0.96 * env));
            rg.addColorStop(0.5, rgba(col, 0.92 * env));
            rg.addColorStop(0.88, rgba(col.map((v) => v * 0.55), 0.85 * env));
            rg.addColorStop(1, rgba(col.map((v) => v * 0.4), 0));
            gg.fillStyle = rg; gg.fill();
          });
        }
      }

      /* 4. the fireball, on top: blinding, then cooling from white through
         orange to dull red as it climbs into the cap */
      const fr = fbR * exag * (0.35 + 0.65 * (1 - Math.exp(-a / (0.35 * tp)))) * (1 + 0.5 * sstep(tp, 4 * tp + 2, a));
      const rise = fbR * exag * (1 + 2 * sstep(0, 3 * tp + 1, a)) + top * 0.9 * sstep(0.5 * tp, 3 * tp + 2, a);
      const C = mul(n, 1 + rise);
      const temp = Math.exp(-a / (1.2 * tp + 0.4));
      const fbEnd = 3.5 * tp + 3;
      const cp = this.project(C, B);
      if (cp && this.visible(C, B) && a < fbEnd) {
        const px = Math.max(fr * cp.s, 2.5);
        const hot = temp > 0.5 ? [255, 245, 215] : temp > 0.2 ? [255, 170, 70] : [200, 70, 25];
        g.save();
        g.globalCompositeOperation = 'lighter';
        const rg = g.createRadialGradient(cp.x, cp.y, 0, cp.x, cp.y, px * 1.8);
        const al = Math.min(1, a / 0.03) * (0.12 + 0.88 * temp) * Math.min(1, (fbEnd - a) / 1.5) * k;
        rg.addColorStop(0, rgba(hot, al));
        rg.addColorStop(0.5, rgba([255, 120, 40], al * 0.55));
        rg.addColorStop(1, rgba([255, 80, 20], 0));
        g.fillStyle = rg;
        g.beginPath(); g.arc(cp.x, cp.y, px * 1.8, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    } else {
      /* in vacuum: a brief ball of vaporised rock, then ejecta on
         ballistic arcs — no mushroom, nothing to hold it up */
      if (a < 0.9) {
        const C = mul(n, 1 + crR * exag * 0.6);
        const cp = this.project(C, B);
        if (cp && this.visible(C, B)) {
          const px = Math.max(crR * exag * 1.4 * cp.s, 3);
          g.save(); g.globalCompositeOperation = 'lighter';
          const rg = g.createRadialGradient(cp.x, cp.y, 0, cp.x, cp.y, px);
          rg.addColorStop(0, rgba([255, 240, 220], (1 - a / 0.9) * k));
          rg.addColorStop(1, rgba([255, 120, 50], 0));
          g.fillStyle = rg; g.beginPath(); g.arc(cp.x, cp.y, px, 0, Math.PI * 2); g.fill();
          g.restore();
        }
      }
      const t1 = norm(cross(n, Math.abs(n[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0])), t2 = cross(n, t1);
      const Hmax = plR * exag;
      const np = e.campaign ? 36 : 90;
      const dcol = (steam ? [225, 230, 238] : dustRGB).map((v) => v * light);
      for (let i = 0; i < np; i++) {
        const h1 = fract(Math.sin(e.seed + i * 12.9898) * 43758.5453);
        const h2 = fract(Math.sin(e.seed + i * 78.233) * 12543.123);
        const h3 = fract(Math.sin(e.seed + i * 37.719) * 23421.631);
        const th = (25 + 45 * h1) * D2R, ph = h2 * Math.PI * 2, sp = 0.35 + 0.65 * h3;
        const T = 6 * sp * Math.sin(th);
        const tau = a / T;
        const apex = sp * sp * Math.sin(th) * Math.sin(th) * Hmax;
        const range = 2 * Hmax * sp * sp * Math.sin(2 * th);
        const tt = Math.min(tau, 1);
        const hgt = 4 * apex * tt * (1 - tt), dist = range * tt;
        const dir = add(mul(t1, Math.cos(ph)), mul(t2, Math.sin(ph)));
        const P = mul(norm(add(mul(n, Math.cos(dist)), mul(dir, Math.sin(dist)))), 1 + hgt);
        if (!this.visible(tau >= 1 ? mul(P, 1.0001) : P, B)) continue;
        const pp = this.project(P, B);
        if (!pp) continue;
        const al = (tau < 1 ? 0.9 : Math.max(0, 1 - (a - T) / 3)) * k;
        if (al <= 0.01) continue;
        g.fillStyle = rgba(tau < 1 ? dcol : dcol.map((v) => v * 0.55), al);
        g.beginPath(); g.arc(pp.x, pp.y, tau < 1 ? 1.6 : 1.2, 0, Math.PI * 2); g.fill();
      }
    }

    /* label */
    if (this.labels && !e.campaign && a < 6 && facing) {
      g.font = '600 11px ui-monospace, Consolas, monospace';
      g.fillStyle = `rgba(255,214,140,${(a < 5 ? 1 : 6 - a).toFixed(2)})`;
      g.fillText(e.tag || '', base.x + 10, base.y - 10);
    } else if (e.campaign && e.count > 1 && a < 1.2 && facing) {
      g.font = '10px ui-monospace, Consolas, monospace';
      g.fillStyle = `rgba(255,190,120,${(1 - a / 1.2).toFixed(2)})`;
      g.fillText('×' + e.countLabel, base.x + 6, base.y - 6);
    }
  };

  View.prototype._drawCometApproach = function (g, e, a, B) {
    const n = this.toWorld(e.dir), side = this.toWorld(e.side);
    const inc = norm(add(mul(n, -0.7), mul(side, -0.7)));      /* velocity */
    const d = 1.5 * (-a / 1.3);
    const head = sub(n, mul(inc, d * 1.02));
    const hp = this.project(head, B);
    if (!hp || !this.visible(head, B)) return;
    const tailDir = norm(add(mul(this.sun, -1), mul(inc, -0.6)));
    const tail = add(head, mul(tailDir, 0.22 + 0.25 * d));
    const tp = this.project(tail, B);
    g.save();
    g.globalCompositeOperation = 'lighter';
    if (tp) {
      const lg = g.createLinearGradient(hp.x, hp.y, tp.x, tp.y);
      lg.addColorStop(0, 'rgba(200,230,255,0.85)');
      lg.addColorStop(1, 'rgba(120,170,255,0)');
      g.strokeStyle = lg; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(hp.x, hp.y); g.lineTo(tp.x, tp.y); g.stroke();
    }
    const alt = Math.hypot(head[0], head[1], head[2]) - 1;
    const entry = this.vs && this.vs.pPa > 100 && alt < 0.08 ? 1 : 0;
    const rg = g.createRadialGradient(hp.x, hp.y, 0, hp.x, hp.y, entry ? 9 : 5);
    rg.addColorStop(0, entry ? 'rgba(255,230,180,1)' : 'rgba(235,245,255,1)');
    rg.addColorStop(1, 'rgba(160,200,255,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(hp.x, hp.y, entry ? 9 : 5, 0, Math.PI * 2); g.fill();
    g.restore();
  };

  /* mirrors and sunshades, drawn to size relative to the planet; their
     distance is not to scale (a real sunshade would sit at L1, millions
     of km sunward) */
  View.prototype._drawMirror = function (g, B) {
    const p = this.plan;
    if (!p || !p.mirrorOn || !p.mirrorFrac) return;
    const shade = p.mirrorFrac < 0;
    const rad = Math.sqrt(Math.min(Math.abs(p.mirrorFrac), 1));
    const C = shade ? mul(this.sun, 2.3) : mul(norm(add(mul(this.sun, -0.55), [0, 0.95, 0])), 2.3);
    const nrm = shade ? this.sun : norm(add(norm(mul(C, -1)), this.sun));
    const c = this.project(C, B);
    if (!c) return;
    const behind = dot(sub(C, B.pos), B.F) > dot(mul(B.pos, -1), B.F);   /* further than the planet's centre */
    g.save();
    if (behind) {
      /* the planet hides whatever of it lies behind the disc */
      const r = (this.cssH / 2) * Math.tan(Math.asin(1 / this.cam.dist)) / B.tanF;
      g.beginPath(); g.rect(0, 0, this.cssW, this.cssH);
      g.arc(this.cssW / 2, this.cssH / 2, r, 0, Math.PI * 2, true);
      g.clip('evenodd');
    }
    if (!shade) {
      const pc = this.project([0, 0, 0], B);
      if (pc) {
        g.globalCompositeOperation = 'lighter';
        const lg = g.createLinearGradient(c.x, c.y, pc.x, pc.y);
        lg.addColorStop(0, 'rgba(255,245,210,0.16)'); lg.addColorStop(1, 'rgba(255,245,210,0)');
        g.strokeStyle = lg; g.lineWidth = Math.max(2, rad * c.s * 1.2);
        g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(pc.x, pc.y); g.stroke();
        g.globalCompositeOperation = 'source-over';
      }
    }
    this._ellipse(g, C, nrm, rad, B, (gg) => {
      if (shade) {
        gg.fillStyle = 'rgba(12,12,20,0.62)'; gg.fill();
        gg.lineWidth = 0.02; gg.strokeStyle = 'rgba(160,170,200,0.7)'; gg.stroke();
      } else {
        const rg = gg.createRadialGradient(-0.3, -0.3, 0.05, 0, 0, 1);
        rg.addColorStop(0, 'rgba(255,252,235,0.95)'); rg.addColorStop(1, 'rgba(180,190,210,0.75)');
        gg.fillStyle = rg; gg.fill();
        gg.lineWidth = 0.02; gg.strokeStyle = 'rgba(255,255,255,0.9)'; gg.stroke();
      }
    });
    g.font = '10.5px ui-monospace, Consolas, monospace';
    g.fillStyle = shade ? 'rgba(170,185,220,0.9)' : 'rgba(255,230,170,0.9)';
    const km = 2 * rad * this.w.R / 1000;
    g.fillText(`${shade ? 'sunshade' : 'mirror'} ${km >= 100 ? Math.round(km).toLocaleString() : km.toFixed(1)} km across`, c.x + rad * c.s + 6, c.y);
    g.fillStyle = 'rgba(150,140,130,0.8)';
    g.fillText(shade ? 'size to scale, distance not (real one: at L1)' : 'size to scale, distance not', c.x + rad * c.s + 6, c.y + 13);
    g.restore();
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RN;
  global.PLANETRENDER = RN;
})(typeof globalThis !== 'undefined' ? globalThis : this);
