// textures.js
// Procedurally-generated textures (canvas 2D) so the project is fully
// self-contained and runs with zero external assets. The texture generator
// also tries to load a real image from assets/textures/<name>.jpg first; if
// that file is missing or fails to load, it falls back to the procedural
// version. See README for how to drop in real (e.g. NASA, public-domain)
// textures.

import * as THREE from "../lib/three/three.module.js";

// Deterministic PRNG (mulberry32) so textures are identical every load.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- 3D value noise on a lattice (seamless on a sphere) ---
function makeHash() {
  const rand = mulberry32(1337);
  const table = new Array(256);
  for (let i = 0; i < 256; i++) table[i] = rand();
  return (x, y, z) => {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const zi = Math.floor(z) & 255;
    return table[(xi * 7 + yi * 13 + zi * 29) & 255];
  };
}
function smooth(t) { return t * t * (3 - 2 * t); }
function lerp(a, b, t) { return a + (b - a) * t; }
function valueNoise3D(hash, x, y, z) {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  const fx = x - X, fy = y - Y, fz = z - Z;
  const u = smooth(fx), v = smooth(fy), w = smooth(fz);
  const c000 = hash(X, Y, Z),     c100 = hash(X + 1, Y, Z);
  const c010 = hash(X, Y + 1, Z), c110 = hash(X + 1, Y + 1, Z);
  const c001 = hash(X, Y, Z + 1), c101 = hash(X + 1, Y, Z + 1);
  const c011 = hash(X, Y + 1, Z + 1), c111 = hash(X + 1, Y + 1, Z + 1);
  const x00 = lerp(c000, c100, u), x10 = lerp(c010, c110, u);
  const x01 = lerp(c001, c101, u), x11 = lerp(c011, c111, u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}
// Fractal Brownian motion (sum of octaves). Returns 0..1-ish.
function fbm3D(hash, x, y, z, octaves = 5, lac = 2, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3D(hash, x * freq, y * freq, z * freq);
    norm += amp;
    amp *= gain;
    freq *= lac;
  }
  return sum / norm;
}

// Map equirectangular texel (u,v) to a point on the unit sphere.
function spherePoint(u, v) {
  const lon = u * Math.PI * 2;
  const lat = (0.5 - v) * Math.PI; // +z up at v=0
  return {
    x: Math.cos(lat) * Math.cos(lon),
    y: Math.sin(lat),
    z: Math.cos(lat) * Math.sin(lon),
  };
}

// --- Earth day texture: oceans + continents + ice caps ---
function earthDayCanvas(w = 2048, h = 1024) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h);
  const hash = makeHash();
  for (let y = 0; y < h; y++) {
    const v = y / h;
    const lat = (0.5 - v) * Math.PI;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const p = spherePoint(u, v);
      // Continents: low-frequency fbm gives landmass shapes.
      const elev = fbm3D(hash, p.x * 1.6, p.y * 1.6, p.z * 1.6, 6, 2.1, 0.5);
      const detail = fbm3D(hash, p.x * 6, p.y * 6, p.z * 6, 4, 2, 0.5);
      const e = elev * 0.8 + detail * 0.2;
      const seaLevel = 0.5;
      const absLat = Math.abs(lat);
      let r, g, b;
      if (e < seaLevel) {
        // Ocean: shallow near coast, deep blue elsewhere.
        const d = (seaLevel - e) / seaLevel; // 0 coast .. 1 deep
        r = 12 + 30 * (1 - d);
        g = 40 + 60 * (1 - d);
        b = 90 + 90 * (1 - d);
      } else {
        // Land: green lowlands, brown highlands, with latitude tint.
        const h2 = (e - seaLevel) / (1 - seaLevel); // 0..1 elevation
        const tropical = 1 - Math.min(1, absLat / (Math.PI / 2.2));
        if (h2 > 0.55) { // mountains
          r = 120 + 60 * h2; g = 100 + 50 * h2; b = 80 + 40 * h2;
        } else if (tropical > 0.6) { // green tropics
          r = 50 + 40 * h2; g = 110 + 40 * h2; b = 45 + 20 * h2;
        } else { // temperate / arid
          r = 120 + 40 * h2; g = 110 + 30 * h2; b = 70 + 20 * h2;
        }
        // Sandy deserts near ~25° latitude bands.
        const desertBand = Math.exp(-Math.pow((absLat - 0.42), 2) / 0.02);
        if (desertBand > 0.5 && h2 < 0.4) {
          r = lerp(r, 200, 0.5); g = lerp(g, 180, 0.5); b = lerp(b, 120, 0.5);
        }
      }
      // Polar ice caps.
      const ice = smoothstep(1.08, 1.25, absLat * 1.0 + e * 0.15);
      if (ice > 0) { r = lerp(r, 240, ice); g = lerp(g, 245, ice); b = lerp(b, 250, ice); }
      const i = (y * w + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// --- Earth night texture: dark land + clustered city lights ---
function earthNightCanvas(w = 1024, h = 512) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const day = earthDayCanvas(w, h);
  const dayCtx = day.getContext("2d");
  const dayData = dayCtx.getImageData(0, 0, w, h).data;
  const img = ctx.createImageData(w, h);
  const hash = makeHash();
  const rand = mulberry32(99);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    const absLat = Math.abs((0.5 - v) * Math.PI);
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const p = spherePoint(u, v);
      const elev = fbm3D(hash, p.x * 1.6, p.y * 1.6, p.z * 1.6, 6, 2.1, 0.5);
      const i = (y * w + x) * 4;
      const isLand = elev > 0.5;
      // City lights: cluster on land, denser in temperate latitudes.
      let light = 0;
      if (isLand) {
        const pop = fbm3D(hash, p.x * 8 + 10, p.y * 8 + 10, p.z * 8 + 10, 4, 2, 0.5);
        const latFactor = Math.exp(-Math.pow(absLat - 0.5, 2) / 0.6);
        light = pop > 0.62 ? (pop - 0.62) * 3 * latFactor : 0;
      }
      // Dark land base.
      img.data[i] = Math.min(255, 8 + 180 * light);
      img.data[i + 1] = Math.min(255, 8 + 160 * light);
      img.data[i + 2] = Math.min(255, 12 + 90 * light);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// --- Earth clouds: transparent white blobs ---
function earthCloudsCanvas(w = 1024, h = 512) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h);
  const hash = makeHash();
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const p = spherePoint(u, v);
      const n = fbm3D(hash, p.x * 3 + 50, p.y * 3 + 50, p.z * 3 + 50, 5, 2.2, 0.55);
      const cloud = smoothstep(0.58, 0.78, n);
      const i = (y * w + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255;
      img.data[i + 3] = Math.floor(cloud * 200);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// --- Moon: gray regolith, maria, craters ---
function moonCanvas(w = 2048, h = 1024) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h);
  const hash = makeHash();
  // Base regolith + broad albedo variation.
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const p = spherePoint(u, v);
      const base = fbm3D(hash, p.x * 3, p.y * 3, p.z * 3, 5, 2, 0.5);
      const fine = fbm3D(hash, p.x * 18, p.y * 18, p.z * 18, 3, 2, 0.5);
      let g = 120 + 50 * base + 15 * (fine - 0.5);
      // Maria: large low-albedo patches (front-side biased, but keep simple).
      const maria = fbm3D(hash, p.x * 1.3 + 5, p.y * 1.3 + 5, p.z * 1.3 + 5, 3, 2, 0.5);
      if (maria < 0.42) g = lerp(g, 60, 0.65);
      const i = (y * w + x) * 4;
      img.data[i] = g; img.data[i + 1] = g * 0.98; img.data[i + 2] = g * 0.95;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Craters: draw many rings with light rim + dark interior (shaded).
  const rand = mulberry32(7);
  const drawCrater = (cx, cy, rad) => {
    const grad = ctx.createRadialGradient(cx, cy, rad * 0.2, cx, cy, rad);
    grad.addColorStop(0, "rgba(20,20,20,0.55)");
    grad.addColorStop(0.7, "rgba(40,40,40,0.25)");
    grad.addColorStop(0.92, "rgba(230,230,225,0.5)");
    grad.addColorStop(1, "rgba(230,230,225,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  };
  for (let k = 0; k < 70; k++) {
    // Big craters / maria basins.
    const cx = rand() * w;
    const cy = h * (0.25 + rand() * 0.5);
    drawCrater(cx, cy, 30 + rand() * 60);
  }
  for (let k = 0; k < 900; k++) {
    const cx = rand() * w;
    const cy = rand() * h;
    drawCrater(cx, cy, 2 + rand() * 7);
  }
  return c;
}

// --- Sun surface: granulated emissive plasma ---
function sunCanvas(w = 1024, h = 512) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(w, h);
  const hash = makeHash();
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const p = spherePoint(u, v);
      const gran = fbm3D(hash, p.x * 16, p.y * 16, p.z * 16, 4, 2.2, 0.55);
      const flow = fbm3D(hash, p.x * 3, p.y * 3, p.z * 3, 4, 2, 0.5);
      const t = gran * 0.6 + flow * 0.4;
      // Hot orange-yellow palette.
      const r = 255;
      const g = 150 + 90 * t;
      const b = 30 + 80 * t;
      const i = (y * w + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// --- Sun glow sprite (radial gradient, additive) ---
function sunGlowCanvas(size = 512) {
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,230,150,0.9)");
  g.addColorStop(0.2, "rgba(255,180,60,0.5)");
  g.addColorStop(0.5, "rgba(255,120,20,0.18)");
  g.addColorStop(1, "rgba(255,80,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// --- Public API: build THREE textures. ---
function tryLoadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
async function localImageTexture(path, fallbackCanvas, { srgb = true, flipX = false } = {}) {
  const img = await tryLoadImage(path);
  if (img) {
    const tex = new THREE.Texture(img);
    configureTexture(tex, srgb, flipX);
    return tex;
  }
  console.warn(`[sun-moon-earth] texture not found at ${path}; using procedural fallback.`);
  return canvasTexture(fallbackCanvas(), srgb, flipX);
}

function configureTexture(tex, srgb = true, flipX = false) {
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  if (flipX) {
    tex.repeat.x = -1;
    tex.offset.x = 1;
  }
  tex.needsUpdate = true;
}

function canvasTexture(canvas, srgb = true, flipX = false) {
  const tex = new THREE.CanvasTexture(canvas);
  configureTexture(tex, srgb, flipX);
  return tex;
}

export async function makeEarthTextures() {
  return {
    day: await localImageTexture("assets/textures/earth_day.jpg", earthDayCanvas),
    night: await localImageTexture("assets/textures/earth_night.jpg", earthNightCanvas),
    // Procedural clouds remain dynamic-looking and do not encode geography.
    clouds: canvasTexture(earthCloudsCanvas()),
  };
}

export async function makeMoonTexture() {
  return {
    color: await localImageTexture("assets/textures/moon.jpg", moonCanvas),
    bump: await localImageTexture("assets/textures/moon_bump.jpg", moonCanvas, { srgb: false }),
  };
}

export async function makeSunTexture() {
  return canvasTexture(sunCanvas());
}

export function makeSunGlowTexture() {
  return canvasTexture(sunGlowCanvas(), true);
}
