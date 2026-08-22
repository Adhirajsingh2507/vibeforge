"use client";

import { useState, useMemo } from "react";
import type { Tile, PathPoint, Site, Boundary } from "@/lib/types";

const ZONE_COLORS: Record<number, string> = {
  0: "#ffffff",
  1: "#737373",
  2: "#404040",
  3: "#1a1a1a",
};

const ZONE_TEXT: Record<number, string> = {
  0: "#000000",
  1: "#ffffff",
  2: "#ffffff",
  3: "#666666",
};

const ZONE_LABELS = ["Safe", "Nav", "Geo", "Hazard"];

const CELL = 52;
const GAP = 1;
const PAD = 24;

export default function TerrainGrid({
  tiles,
  path,
  sites,
  boundaries,
}: {
  tiles: Tile[];
  path: PathPoint[];
  sites: Site[];
  boundaries: Boundary[];
}) {
  const [hovered, setHovered] = useState<Tile | null>(null);

  const cols = Math.max(...tiles.map((t) => t.x)) + 1;
  const rows = Math.max(...tiles.map((t) => t.y)) + 1;
  const w = cols * (CELL + GAP) - GAP + PAD * 2;
  const h = rows * (CELL + GAP) - GAP + PAD * 2;

  const cx = (x: number) => PAD + x * (CELL + GAP) + CELL / 2;
  const cy = (y: number) => PAD + y * (CELL + GAP) + CELL / 2;

  const pathD =
    path.length > 0
      ? path
          .map((p, i) => `${i === 0 ? "M" : "L"} ${cx(p.x)} ${cy(p.y)}`)
          .join(" ")
      : "";

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border rounded bg-black">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ minWidth: 420 }}>
          {useMemo(() => tiles.map((tile) => {
            const x = PAD + tile.x * (CELL + GAP);
            const y = PAD + tile.y * (CELL + GAP);
            return (
              <g
                key={`${tile.x}-${tile.y}`}
                onMouseEnter={() => setHovered(tile)}
                onMouseLeave={() => setHovered(null)}
                className="cursor-crosshair group"
              >
                <rect
                  x={x} y={y} width={CELL} height={CELL}
                  fill={ZONE_COLORS[tile.zone]}
                  className="opacity-85 group-hover:opacity-100 group-hover:stroke-white transition-all"
                  strokeWidth={1.5}
                  stroke="transparent"
                />
                <text
                  x={x + CELL / 2} y={y + CELL / 2 + 5}
                  textAnchor="middle"
                  fill={ZONE_TEXT[tile.zone]}
                  fontSize="13" fontWeight="700"
                  fontFamily="Helvetica, Arial, sans-serif"
                  style={{ pointerEvents: "none" }}
                >
                  {(tile.safety_score * 100).toFixed(0)}
                </text>
              </g>
            );
          }), [tiles])}

          {boundaries.map((b, i) => (
            <path
              key={i}
              d={b.polyline.map(([bx, by], j) => `${j === 0 ? "M" : "L"} ${cx(bx)} ${cy(by)}`).join(" ")}
              fill="none" stroke="#fff" strokeWidth={0.8}
              strokeDasharray={b.type === "crater" ? "6 3" : "2 4"}
              opacity={0.15}
            />
          ))}

          {pathD && (
            <>
              <path
                d={pathD} fill="none" stroke="#fff"
                strokeWidth={1.5} strokeLinecap="round"
                opacity={0.4} strokeDasharray="4 2"
              />
              {path.map((p, i) => (
                <circle
                  key={i}
                  cx={cx(p.x)} cy={cy(p.y)}
                  r={i === path.length - 1 ? 4 : 2}
                  fill="#fff"
                  opacity={i === path.length - 1 ? 1 : 0.35}
                />
              ))}
            </>
          )}

          {sites.map((s) => (
            <text
              key={s.id}
              x={cx(s.x)} y={cy(s.y) - CELL / 2 - 6}
              textAnchor="middle" fill="#fff"
              fontSize="7" fontFamily="monospace" fontWeight="700"
            >
              S{s.rank}
            </text>
          ))}
        </svg>
      </div>

      {hovered && (
        <div className="border rounded px-4 py-3 bg-surface flex gap-8 text-xs">
          <span className="font-mono text-muted">
            Cell {hovered.x},{hovered.y}
          </span>
          <span className="font-bold">
            {(hovered.safety_score * 100).toFixed(1)}% safe
          </span>
          <span className="text-muted">
            {hovered.class.replace(/_/g, " ")}
          </span>
          <span className="text-muted">
            slope {hovered.slope.toFixed(2)}
          </span>
          <span className="text-muted">
            {hovered.z.toFixed(2)}m
          </span>
        </div>
      )}

      <div className="flex gap-4 text-[10px] font-mono text-muted">
        {ZONE_LABELS.map((label, z) => (
          <div key={z} className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2" style={{ background: ZONE_COLORS[z] }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
