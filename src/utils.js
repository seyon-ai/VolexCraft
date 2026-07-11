// utils.js — seeded RNG, simplex noise, and small shared helpers.
// Kept dependency-free so terrain generation stays fully deterministic per seed.

/** Mulberry32 PRNG — fast, deterministic, good enough for terrain/permutation shuffling. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string seed into a 32-bit int so players can type "flowers" as a seed. */
export function hashStringSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/**
 * Classic 2D/3D Simplex noise, seeded via a permutation table built from a PRNG.
 * Public-domain algorithm structure (Gustavson-style), reseeded per-instance
 * so every world with a given seed produces identical terrain.
 */
export class SimplexNoise {
  constructor(seed = 0) {
    const rand = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const n = Math.floor(rand() * (i + 1));
      const tmp = p[i];
      p[i] = p[n];
      p[n] = tmp;
    }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  static grad3 = [
    [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
    [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
  ];

  noise2D(xin, yin) {
    const grad3 = SimplexNoise.grad3;
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t, Y0 = j - t;
    const x0 = xin - X0, y0 = yin - Y0;
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    const gi0 = this.permMod12[ii + this.perm[jj]];
    const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
    const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];

    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * (grad3[gi0][0] * x0 + grad3[gi0][1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * (grad3[gi1][0] * x1 + grad3[gi1][1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * (grad3[gi2][0] * x2 + grad3[gi2][1] * y2); }
    return 70 * (n0 + n1 + n2);
  }

  /** Sum of several noise2D octaves, normalized to roughly [-1, 1]. */
  fbm2D(x, y, octaves = 4, lacunarity = 2, persistence = 0.5) {
    let amplitude = 1, frequency = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += this.noise2D(x * frequency, y * frequency) * amplitude;
      norm += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return sum / norm;
  }
}

/** Clamp helper. */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Linear interpolation. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Integer floor-division that behaves for negative numbers (needed for chunk coords). */
export function floorDiv(a, b) {
  return Math.floor(a / b);
}

/** Positive modulo (JS % keeps sign of dividend, which breaks negative-coordinate voxel math). */
export function mod(n, m) {
  return ((n % m) + m) % m;
}

export function keyForChunk(cx, cz) {
  return `${cx},${cz}`;
}
