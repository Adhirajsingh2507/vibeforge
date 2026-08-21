"use client";

import type { Tile } from "@/lib/types";
import { BLOCKS, CLASS_TO_BLOCK } from "@/lib/game/blocks";

const ZONE_NAME = ["Safe", "Nav", "Geo", "Hazard"] as const;

export interface HudData {
  x: number;
  y: number;
  z: number;
  tile: Tile | null;
  mapped: boolean;
  fps: number;
  thirdPerson: boolean;
}

export default function Hud({ data }: { data: HudData }) {
  const { tile, mapped } = data;
  const blockName = tile
    ? BLOCKS[CLASS_TO_BLOCK[tile.class] ?? "regolith"].name
    : "Unmapped";

  return (
    <>
      {/* crosshair */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="h-5 w-5 opacity-50">
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white" />
          <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-white" />
        </div>
      </div>

      {/* top-left */}
      <div className="pointer-events-none absolute left-4 top-4 font-mono text-[10px] text-white/50">
        <div>
          {data.x.toFixed(1)} {data.y.toFixed(1)} {data.z.toFixed(1)}
        </div>
        <div className="text-white/30">
          {data.fps} fps
        </div>
      </div>

      {/* top-right */}
      {!mapped && (
        <div className="pointer-events-none absolute right-4 top-4 font-mono text-[10px] text-amber-300/70">
          unmapped
        </div>
      )}

      {/* bottom-left: terrain */}
      {tile && (
        <div className="pointer-events-none absolute bottom-4 left-4 rounded border border-white/10 bg-black/60 px-3 py-2 backdrop-blur-sm">
          <div className="font-mono text-xs font-bold">{blockName}</div>
          <div className="mt-1 flex gap-4 font-mono text-[10px] text-white/50">
            <span>{(tile.safety_score * 100).toFixed(0)}% safe</span>
            <span>zone {tile.zone} {ZONE_NAME[tile.zone]}</span>
            <span>slope {tile.slope.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* bottom-right */}
      <div className="pointer-events-none absolute bottom-4 right-4 font-mono text-[10px] text-white/25">
        Arrow keys move · Shift boost
      </div>
    </>
  );
}
