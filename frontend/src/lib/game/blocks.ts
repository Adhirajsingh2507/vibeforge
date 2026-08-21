import * as THREE from "three";

export type BlockId =
  | "regolith_compact"
  | "regolith"
  | "sand"
  | "stone"
  | "basalt"
  | "ice"
  | "ore"
  | "shadow"
  | "bedrock"
  | "unmapped";

interface BlockSpec {
  name: string;
  base: [number, number, number];
  grain: number;
  speck?: { color: [number, number, number]; density: number };
  top?: [number, number, number];
  blotchy?: boolean;
  cracks?: boolean;
  strata?: [number, number, number];
  edgeHighlight?: [number, number, number];
  zoneIndicator?: [number, number, number];
}

export const BLOCKS: Record<BlockId, BlockSpec> = {
  regolith_compact: {
    name: "Compact Regolith",
    base: [166, 132, 104],
    grain: 0.12,
    top: [190, 158, 128],
    edgeHighlight: [210, 180, 150],
    zoneIndicator: [80, 200, 120],
  },
  regolith: {
    name: "Regolith",
    base: [143, 104, 76],
    grain: 0.16,
    top: [158, 118, 88],
    edgeHighlight: [175, 135, 105],
  },
  sand: {
    name: "Loose Regolith",
    base: [196, 158, 112],
    grain: 0.11,
    top: [210, 175, 130],
    edgeHighlight: [220, 190, 145],
  },
  stone: {
    name: "Basalt Rock",
    base: [116, 110, 106],
    grain: 0.18,
    blotchy: true,
    cracks: true,
    edgeHighlight: [140, 134, 128],
  },
  basalt: {
    name: "Crater Floor",
    base: [62, 54, 52],
    grain: 0.22,
    blotchy: true,
    cracks: true,
    strata: [48, 40, 38],
  },
  ice: {
    name: "Subsurface Ice",
    base: [126, 186, 198],
    grain: 0.14,
    top: [155, 210, 225],
    speck: { color: [214, 246, 252], density: 0.22 },
    edgeHighlight: [180, 230, 240],
    zoneIndicator: [60, 180, 200],
  },
  ore: {
    name: "Mineral Vein",
    base: [104, 100, 112],
    grain: 0.16,
    blotchy: true,
    speck: { color: [122, 224, 196], density: 0.18 },
    edgeHighlight: [130, 126, 138],
    zoneIndicator: [100, 220, 180],
  },
  shadow: {
    name: "Shadowed Terrain",
    base: [74, 70, 82],
    grain: 0.18,
    top: [64, 60, 72],
    strata: [58, 54, 66],
  },
  bedrock: {
    name: "Bedrock",
    base: [38, 36, 38],
    grain: 0.28,
    blotchy: true,
    cracks: true,
    strata: [30, 28, 30],
  },
  unmapped: {
    name: "Unmapped",
    base: [26, 26, 30],
    grain: 0.08,
    strata: [20, 20, 24],
  },
};

export const CLASS_TO_BLOCK: Record<string, BlockId> = {
  compact_soil: "regolith_compact",
  soil: "regolith",
  loose_soil: "sand",
  rock: "stone",
  crater: "basalt",
  shadow: "shadow",
  waterbed: "ice",
  mineral_edge: "ore",
  unknown: "regolith",
};

const TEX = 16;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

function drawFace(
  spec: BlockSpec,
  seed: number,
  color: [number, number, number],
  isTop: boolean
): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = cv.height = TEX;
  const ctx = cv.getContext("2d")!;
  const rand = rng(seed);

  const cell = spec.blotchy ? 4 : 1;
  const blot: number[] = [];
  for (let i = 0; i < (TEX / cell) * (TEX / cell); i++) {
    blot.push(1 + (rand() - 0.5) * spec.grain * 2);
  }

  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const bi =
        Math.floor(y / cell) * Math.floor(TEX / cell) + Math.floor(x / cell);
      const coarse = blot[bi] ?? 1;
      const fine = 1 + (rand() - 0.5) * spec.grain;
      const k = coarse * fine;

      let [r, g, b] = color.map((c) => c * k) as [number, number, number];

      // Strata lines on side faces
      if (!isTop && spec.strata && (y === 5 || y === 10 || y === 14)) {
        const sk = 0.9 + rand() * 0.2;
        [r, g, b] = spec.strata.map((c) => c * sk) as [number, number, number];
      }

      // Crack lines
      if (spec.cracks) {
        const crackSeed = rand();
        if (crackSeed < 0.03 && y > 2 && y < 14) {
          r *= 0.6;
          g *= 0.6;
          b *= 0.6;
        }
      }

      // Speckle minerals
      if (spec.speck && rand() < spec.speck.density) {
        const j = 0.85 + rand() * 0.3;
        [r, g, b] = spec.speck.color.map((c) => c * j) as [number, number, number];
      }

      // Edge highlight — bright pixels along top-face edges for definition
      if (isTop && spec.edgeHighlight) {
        if (x === 0 || y === 0 || x === 15 || y === 15) {
          const ek = 0.75 + rand() * 0.25;
          [r, g, b] = spec.edgeHighlight.map((c) => c * ek) as [number, number, number];
        }
      }

      // Zone indicator dots on top face corners
      if (isTop && spec.zoneIndicator && rand() < 0.06) {
        if ((x < 3 || x > 12) && (y < 3 || y > 12)) {
          const zk = 0.7 + rand() * 0.3;
          [r, g, b] = spec.zoneIndicator.map((c) => c * zk) as [number, number, number];
        }
      }

      // Subtle directional shadow on top face (south-east darker)
      if (isTop) {
        const shade = 1.0 - (x + y) / (TEX * 2) * 0.12;
        r *= shade;
        g *= shade;
        b *= shade;
      }

      ctx.fillStyle = `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  return cv;
}

function toTexture(cv: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface BlockMaterials {
  materials: THREE.Material[];
  spec: BlockSpec;
}

let cache: Record<string, BlockMaterials> | null = null;

export function getBlockMaterials(): Record<BlockId, BlockMaterials> {
  if (cache) return cache as Record<BlockId, BlockMaterials>;

  const out = {} as Record<BlockId, BlockMaterials>;
  let seed = 1;

  for (const id of Object.keys(BLOCKS) as BlockId[]) {
    const spec = BLOCKS[id];
    const sideTex = toTexture(drawFace(spec, seed++, spec.base, false));
    const topTex = toTexture(drawFace(spec, seed++, spec.top ?? spec.base, true));
    const bottomTex = toTexture(
      drawFace(
        spec,
        seed++,
        spec.base.map((c) => c * 0.68) as [number, number, number],
        false
      )
    );

    const mk = (map: THREE.Texture) =>
      new THREE.MeshLambertMaterial({ map });

    out[id] = {
      spec,
      materials: [
        mk(sideTex),
        mk(sideTex),
        mk(topTex),
        mk(bottomTex),
        mk(sideTex),
        mk(sideTex),
      ],
    };
  }

  cache = out;
  return out;
}
