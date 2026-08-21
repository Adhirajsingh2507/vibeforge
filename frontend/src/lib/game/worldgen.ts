import type { Tile } from "@/lib/types";
import { CLASS_TO_BLOCK, type BlockId } from "./blocks";

/** Blocks per scanned cell. Each API tile becomes a SUBDIV x SUBDIV patch. */
export const SUBDIV = 12;
/** Unmapped fringe around the scanned area, in blocks. */
export const PAD = 12;
/** Ground level under the lowest terrain. */
export const BASE_Y = 8;
/** Vertical exaggeration on the measured elevation (metres -> blocks). */
export const Z_SCALE = 24;

/** Per-class relief in blocks, applied on top of measured elevation. */
const RELIEF: Record<string, number> = {
  compact_soil: 0,
  soil: -0.5,
  loose_soil: -1,
  rock: 3,
  crater: -5,
  shadow: -1.5,
  waterbed: -2.5,
  mineral_edge: 1.5,
  unknown: 0,
};

/* ------------------------------------------------------------------- noise */

function hash2(x: number, y: number, seed: number) {
  let h = x * 374761393 + y * 668265263 + seed * 1442695040;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function valueNoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const u = smooth(xf);
  const v = smooth(yf);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fbm(x: number, y: number, seed: number, octaves = 4) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 97) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/* ------------------------------------------------------------------- world */

export interface World {
  /** Width (x) and depth (z) in blocks. */
  W: number;
  D: number;
  /** Column surface height, indexed z * W + x. */
  height: Int16Array;
  /** Surface block type per column. */
  surface: BlockId[];
  /** Index into `tiles` for the column, or -1 when unmapped. */
  tileOf: Int16Array;
  tiles: Tile[];
  /** Bounds of the scanned (walkable) region, in blocks. */
  bounds: { x0: number; x1: number; z0: number; z1: number };
  /** Grid dimensions of the source scan. */
  cols: number;
  rows: number;
}

const idx = (w: World | { W: number }, x: number, z: number) => z * w.W + x;

export function generateWorld(tiles: Tile[]): World {
  const cols = Math.max(...tiles.map((t) => t.x)) + 1;
  const rows = Math.max(...tiles.map((t) => t.y)) + 1;

  const W = cols * SUBDIV + PAD * 2;
  const D = rows * SUBDIV + PAD * 2;

  // Fast lookup of the source tile grid.
  const grid: (Tile | undefined)[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(undefined)
  );
  const tileIndex = new Map<string, number>();
  tiles.forEach((t, i) => {
    grid[t.y][t.x] = t;
    tileIndex.set(`${t.x},${t.y}`, i);
  });

  const height = new Int16Array(W * D);
  const surface: BlockId[] = new Array(W * D);
  const tileOf = new Int16Array(W * D).fill(-1);

  const bounds = {
    x0: PAD,
    x1: PAD + cols * SUBDIV - 1,
    z0: PAD,
    z1: PAD + rows * SUBDIV - 1,
  };

  /** Continuous tile-space coords for a block column. */
  const toTileSpace = (x: number, z: number) => ({
    tx: (x - PAD) / SUBDIV - 0.5,
    tz: (z - PAD) / SUBDIV - 0.5,
  });

  const clampTile = (v: number, max: number) =>
    Math.max(0, Math.min(max - 1, v));

  const sampleTile = (tx: number, tz: number): Tile | undefined =>
    grid[clampTile(Math.round(tz), rows)]?.[clampTile(Math.round(tx), cols)];

  /** Bilinear blend of a per-tile scalar, so terrain flows between cells. */
  const blend = (tx: number, tz: number, f: (t: Tile) => number): number => {
    const x0 = Math.floor(tx);
    const z0 = Math.floor(tz);
    const fx = tx - x0;
    const fz = tz - z0;
    const at = (ix: number, iz: number) => {
      const t = grid[clampTile(iz, rows)]?.[clampTile(ix, cols)];
      return t ? f(t) : 0;
    };
    const a = at(x0, z0);
    const b = at(x0 + 1, z0);
    const c = at(x0, z0 + 1);
    const d = at(x0 + 1, z0 + 1);
    const u = smooth(Math.max(0, Math.min(1, fx)));
    const v = smooth(Math.max(0, Math.min(1, fz)));
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  };

  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      const { tx, tz } = toTileSpace(x, z);

      const inScan =
        x >= bounds.x0 && x <= bounds.x1 && z >= bounds.z0 && z <= bounds.z1;

      // Jitter the classification sample so patch borders look eroded rather
      // than perfectly square.
      const jx = tx + (fbm(x * 0.14, z * 0.14, 11) - 0.5) * 0.55;
      const jz = tz + (fbm(x * 0.14 + 40, z * 0.14 + 40, 23) - 0.5) * 0.55;
      const cls = sampleTile(jx, jz);

      const elev = blend(tx, tz, (t) => t.z) * Z_SCALE;
      const relief = blend(tx, tz, (t) => RELIEF[t.class] ?? 0);

      const detail = (fbm(x * 0.09, z * 0.09, 5) - 0.5) * 3.2;
      const fine = (fbm(x * 0.31, z * 0.31, 31) - 0.5) * 1.1;

      let h = BASE_Y + elev + relief + detail + fine;

      if (!inScan) {
        // Fringe falls away toward the horizon so the mapped plateau reads as
        // an island of known terrain.
        const dx = Math.max(bounds.x0 - x, x - bounds.x1, 0);
        const dz = Math.max(bounds.z0 - z, z - bounds.z1, 0);
        const d = Math.hypot(dx, dz);
        h -= Math.pow(d / PAD, 1.6) * 9;
      }

      height[i] = Math.max(1, Math.round(h));

      if (inScan && cls) {
        surface[i] = CLASS_TO_BLOCK[cls.class] ?? "regolith";
        const ti = tileIndex.get(`${cls.x},${cls.y}`);
        tileOf[i] = ti === undefined ? -1 : ti;
      } else {
        surface[i] = "unmapped";
      }
    }
  }

  const world: World = {
    W,
    D,
    height,
    surface,
    tileOf,
    tiles,
    bounds,
    cols,
    rows,
  };

  scatterBoulders(world);
  return world;
}

/** Raises isolated 1-2 block bumps on rocky terrain so it isn't a smooth field. */
function scatterBoulders(w: World) {
  for (let z = w.bounds.z0; z <= w.bounds.z1; z++) {
    for (let x = w.bounds.x0; x <= w.bounds.x1; x++) {
      const i = z * w.W + x;
      if (w.surface[i] !== "stone" && w.surface[i] !== "ore") continue;
      if (hash2(x, z, 777) > 0.93) {
        w.height[i] += 1 + (hash2(x, z, 778) > 0.6 ? 1 : 0);
      }
    }
  }
}

/* --------------------------------------------------------------- accessors */

export function heightAt(w: World, x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  if (xi < 0 || zi < 0 || xi >= w.W || zi >= w.D) return 0;
  return w.height[idx(w, xi, zi)];
}

export function blockAt(w: World, x: number, z: number): BlockId {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  if (xi < 0 || zi < 0 || xi >= w.W || zi >= w.D) return "unmapped";
  return w.surface[idx(w, xi, zi)];
}

export function tileAt(w: World, x: number, z: number): Tile | null {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  if (xi < 0 || zi < 0 || xi >= w.W || zi >= w.D) return null;
  const t = w.tileOf[idx(w, xi, zi)];
  return t < 0 ? null : w.tiles[t];
}

/** Converts scan-grid coordinates to world-block centre coordinates. */
export function gridToWorld(x: number, y: number) {
  return {
    x: PAD + (x + 0.5) * SUBDIV,
    z: PAD + (y + 0.5) * SUBDIV,
  };
}
