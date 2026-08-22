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
  roughness?: number;
  weathering?: number;
}

export const BLOCKS: Record<BlockId, BlockSpec> = {
  regolith_compact: {
    name: "Compact Regolith",
    base: [166, 132, 104],
    grain: 0.08,
    top: [190, 158, 128],
    edgeHighlight: [210, 180, 150],
    zoneIndicator: [80, 200, 120],
    roughness: 0.3,
    weathering: 0.4,
  },
  regolith: {
    name: "Regolith",
    base: [143, 104, 76],
    grain: 0.10,
    top: [158, 118, 88],
    edgeHighlight: [175, 135, 105],
    roughness: 0.5,
    weathering: 0.6,
  },
  sand: {
    name: "Loose Regolith",
    base: [196, 158, 112],
    grain: 0.07,
    top: [210, 175, 130],
    edgeHighlight: [220, 190, 145],
    roughness: 0.2,
    weathering: 0.3,
  },
  stone: {
    name: "Basalt Rock",
    base: [116, 110, 106],
    grain: 0.12,
    blotchy: true,
    cracks: true,
    edgeHighlight: [140, 134, 128],
    roughness: 0.7,
    weathering: 0.5,
  },
  basalt: {
    name: "Crater Floor",
    base: [62, 54, 52],
    grain: 0.14,
    blotchy: true,
    cracks: true,
    strata: [48, 40, 38],
    roughness: 0.8,
    weathering: 0.7,
  },
  ice: {
    name: "Subsurface Ice",
    base: [126, 186, 198],
    grain: 0.08,
    top: [155, 210, 225],
    speck: { color: [214, 246, 252], density: 0.18 },
    edgeHighlight: [180, 230, 240],
    zoneIndicator: [60, 180, 200],
    roughness: 0.15,
    weathering: 0.1,
  },
  ore: {
    name: "Mineral Vein",
    base: [104, 100, 112],
    grain: 0.10,
    blotchy: true,
    speck: { color: [122, 224, 196], density: 0.14 },
    edgeHighlight: [130, 126, 138],
    zoneIndicator: [100, 220, 180],
    roughness: 0.6,
    weathering: 0.4,
  },
  shadow: {
    name: "Shadowed Terrain",
    base: [74, 70, 82],
    grain: 0.12,
    top: [64, 60, 72],
    strata: [58, 54, 66],
    roughness: 0.4,
    weathering: 0.5,
  },
  bedrock: {
    name: "Bedrock",
    base: [38, 36, 38],
    grain: 0.18,
    blotchy: true,
    cracks: true,
    strata: [30, 28, 30],
    roughness: 0.9,
    weathering: 0.8,
  },
  unmapped: {
    name: "Unmapped",
    base: [26, 26, 30],
    grain: 0.05,
    strata: [20, 20, 24],
    roughness: 0.2,
    weathering: 0.1,
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

const TEX = 48;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

function smoothNoise(x: number, y: number, rand: () => number, scale: number) {
  return (Math.sin(x * scale * 0.7 + rand() * 6.28) *
    Math.cos(y * scale * 0.5 + rand() * 6.28)) * 0.5 + 0.5;
}

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

  const roughness = spec.roughness ?? 0.4;
  const weathering = spec.weathering ?? 0.3;

  const cell = spec.blotchy ? 6 : 2;
  const blotW = Math.ceil(TEX / cell);
  const blot: number[] = [];
  for (let i = 0; i < blotW * blotW; i++) {
    blot.push(1 + (rand() - 0.5) * spec.grain * 1.5);
  }

  const noiseField: number[] = [];
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const n1 = smoothNoise(x, y, rand, 0.3) * 0.4;
      const n2 = smoothNoise(x * 2.1, y * 1.7, rand, 0.7) * 0.2;
      noiseField.push(n1 + n2);
    }
  }

  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const bi = Math.floor(y / cell) * blotW + Math.floor(x / cell);
      const coarse = blot[bi] ?? 1;
      const fine = 1 + (rand() - 0.5) * spec.grain * 0.6;
      const noise = noiseField[y * TEX + x];
      const k = coarse * fine * (1 + (noise - 0.3) * roughness * 0.3);

      let [r, g, b] = color.map((c) => c * k) as [number, number, number];

      if (!isTop && spec.strata) {
        const strataPos = y / TEX;
        const strataWave = Math.sin(strataPos * Math.PI * 3 + rand() * 0.3);
        if (strataWave > 0.7) {
          const sk = 0.85 + rand() * 0.15;
          const blend = (strataWave - 0.7) / 0.3;
          r = r * (1 - blend) + spec.strata[0] * sk * blend;
          g = g * (1 - blend) + spec.strata[1] * sk * blend;
          b = b * (1 - blend) + spec.strata[2] * sk * blend;
        }
      }

      if (spec.cracks) {
        const cx = x / TEX;
        const cy = y / TEX;
        const crack1 = Math.abs(Math.sin(cx * 12 + cy * 8 + rand() * 0.1));
        const crack2 = Math.abs(Math.sin(cx * 7 - cy * 15 + rand() * 0.1));
        if (crack1 < 0.06 || crack2 < 0.04) {
          const depth = 0.5 + rand() * 0.2;
          r *= depth; g *= depth; b *= depth;
        }
      }

      if (spec.speck && rand() < spec.speck.density) {
        const j = 0.8 + rand() * 0.4;
        const blend = 0.6 + rand() * 0.4;
        r = r * (1 - blend) + spec.speck.color[0] * j * blend;
        g = g * (1 - blend) + spec.speck.color[1] * j * blend;
        b = b * (1 - blend) + spec.speck.color[2] * j * blend;
      }

      if (isTop && spec.edgeHighlight) {
        const edgeDist = Math.min(x, y, TEX - 1 - x, TEX - 1 - y);
        if (edgeDist <= 1) {
          const ek = 0.7 + rand() * 0.3;
          const blend = edgeDist === 0 ? 0.6 : 0.3;
          r = r * (1 - blend) + spec.edgeHighlight[0] * ek * blend;
          g = g * (1 - blend) + spec.edgeHighlight[1] * ek * blend;
          b = b * (1 - blend) + spec.edgeHighlight[2] * ek * blend;
        }
      }

      if (isTop && spec.zoneIndicator && rand() < 0.04) {
        if ((x < 4 || x > TEX - 5) && (y < 4 || y > TEX - 5)) {
          const zk = 0.6 + rand() * 0.4;
          r = spec.zoneIndicator[0] * zk;
          g = spec.zoneIndicator[1] * zk;
          b = spec.zoneIndicator[2] * zk;
        }
      }

      if (isTop) {
        const shade = 1.0 - (x + y) / (TEX * 2) * 0.15;
        const ao = 1.0 - Math.max(0, 1 - Math.min(x, y, TEX - 1 - x, TEX - 1 - y) / 4) * 0.12;
        r *= shade * ao;
        g *= shade * ao;
        b *= shade * ao;
      } else {
        const vShade = 0.85 + (y / TEX) * 0.15;
        r *= vShade; g *= vShade; b *= vShade;
      }

      if (weathering > 0 && rand() < weathering * 0.08) {
        const w = 0.92 + rand() * 0.08;
        r *= w; g *= w; b *= w;
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
  t.minFilter = THREE.NearestMipmapLinearFilter;
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
        spec.base.map((c) => c * 0.6) as [number, number, number],
        false
      )
    );

    const mk = (map: THREE.Texture) =>
      new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0.05 });

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
