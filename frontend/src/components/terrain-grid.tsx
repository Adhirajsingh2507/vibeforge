"use client";

import { useState } from "react";
import type { Tile, PathPoint, Site, Boundary } from "@/lib/types";

const ZONE_LABELS: Record<number, string> = {
  0: "CONSTRUCTION-SAFE",
  1: "NAVIGATION",
  2: "GEOLOGICAL",
  3: "HAZARD",
};

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

const CELL = 64;
const GAP = 2;
const PAD = 32;

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

  const maxX = Math.max(...tiles.map((t) => t.x));
  const maxY = Math.max(...tiles.map((t) => t.y));
  const cols = maxX + 1;
  const rows = maxY + 1;

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
    <div className="space-y-3">
      <div className="relative overflow-x-auto border rounded bg-black">
        <div className="absolute inset-0 grid-overlay pointer-events-none" />
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="w-full relative"
          style={{ minWidth: 540 }}
        >
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {tiles.map((tile) => {
            const x = PAD + tile.x * (CELL + GAP);
            const y = PAD + tile.y * (CELL + GAP);
            const isHovered = hovered?.x === tile.x && hovered?.y === tile.y;
            const fill = ZONE_COLORS[tile.zone];
            const textFill = ZONE_TEXT[tile.zone];
            return (
              <g
                key={`${tile.x}-${tile.y}`}
                onMouseEnter={() => setHovered(tile)}
                onMouseLeave={() => setHovered(null)}
                className="cursor-crosshair"
              >
                <rect
                  x={x}
                  y={y}
                  width={CELL}
                  height={CELL}
                  fill={fill}
                  opacity={isHovered ? 1 : 0.85}
                  stroke={isHovered ? "#ffffff" : "rgba(255,255,255,0.06)"}
                  strokeWidth={isHovered ? 1.5 : 0.5}
                />
                <text
                  x={x + CELL / 2}
                  y={y + 20}
                  textAnchor="middle"
                  fill={textFill}
                  fontSize="14"
                  fontFamily="Helvetica, Arial, sans-serif"
                  fontWeight="700"
                  letterSpacing="0.5"
                >
                  {(tile.safety_score * 100).toFixed(0)}
                </text>
                <text
                  x={x + CELL / 2}
                  y={y + 34}
                  textAnchor="middle"
                  fill={textFill}
                  fontSize="8"
                  fontFamily="monospace"
                  opacity={0.6}
                  letterSpacing="1"
                >
                  Z{tile.zone}
                </text>
                <text
                  x={x + CELL / 2}
                  y={y + CELL - 8}
                  textAnchor="middle"
                  fill={textFill}
                  fontSize="6.5"
                  fontFamily="Helvetica, Arial, sans-serif"
                  opacity={0.4}
                  letterSpacing="0.5"
                  style={{ textTransform: "uppercase" }}
                >
                  {tile.class.replace(/_/g, " ")}
                </text>
              </g>
            );
          })}

          {boundaries.map((b, i) => {
            const d = b.polyline
              .map(
                ([bx, by], j) =>
                  `${j === 0 ? "M" : "L"} ${cx(bx)} ${cy(by)}`
              )
              .join(" ");
            return (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="#ffffff"
                strokeWidth={1}
                strokeDasharray={b.type === "crater" ? "8 4" : "3 6"}
                opacity={0.2}
              />
            );
          })}

          {pathD && (
            <>
              <path
                d={pathD}
                fill="none"
                stroke="#ffffff"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.5}
                strokeDasharray="4 2"
                filter="url(#glow)"
              />
              {path.map((p, i) => (
                <g key={`rover-${i}`}>
                  {i === path.length - 1 && (
                    <>
                      <circle
                        cx={cx(p.x)}
                        cy={cy(p.y)}
                        r={14}
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth={0.5}
                        opacity={0.2}
                      />
                      <circle
                        cx={cx(p.x)}
                        cy={cy(p.y)}
                        r={10}
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth={0.5}
                        opacity={0.3}
                      />
                    </>
                  )}
                  <circle
                    cx={cx(p.x)}
                    cy={cy(p.y)}
                    r={i === path.length - 1 ? 4 : 2.5}
                    fill="#ffffff"
                    opacity={i === path.length - 1 ? 1 : 0.4}
                    filter={i === path.length - 1 ? "url(#glow)" : undefined}
                  />
                </g>
              ))}
            </>
          )}

          {sites.map((s) => (
            <g key={s.id}>
              <line
                x1={cx(s.x)}
                y1={cy(s.y) - CELL / 2 + 2}
                x2={cx(s.x)}
                y2={cy(s.y) - CELL / 2 - 10}
                stroke="#ffffff"
                strokeWidth={0.5}
                opacity={0.4}
              />
              <text
                x={cx(s.x)}
                y={cy(s.y) - CELL / 2 - 14}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="7"
                fontFamily="monospace"
                fontWeight="700"
                letterSpacing="1"
              >
                S{s.rank}
              </text>
            </g>
          ))}

          {/* axis labels */}
          {Array.from({ length: cols }, (_, i) => (
            <text
              key={`ax-${i}`}
              x={cx(i)}
              y={PAD - 10}
              textAnchor="middle"
              fill="#ffffff"
              fontSize="7"
              fontFamily="monospace"
              opacity={0.2}
            >
              {i}
            </text>
          ))}
          {Array.from({ length: rows }, (_, i) => (
            <text
              key={`ay-${i}`}
              x={PAD - 12}
              y={cy(i) + 3}
              textAnchor="middle"
              fill="#ffffff"
              fontSize="7"
              fontFamily="monospace"
              opacity={0.2}
            >
              {i}
            </text>
          ))}
        </svg>
      </div>

      {hovered && (
        <div className="border rounded p-4 bg-surface backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono tracking-widest text-muted uppercase">
              Cell {hovered.x},{hovered.y}
            </span>
            <span className="text-[10px] font-mono tracking-widest uppercase">
              {ZONE_LABELS[hovered.zone]}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {[
              ["SAFETY", `${(hovered.safety_score * 100).toFixed(1)}%`],
              ["CLASS", hovered.class.replace(/_/g, " ")],
              ["SLOPE", hovered.slope.toFixed(2)],
              ["ELEV", `${hovered.z.toFixed(2)}m`],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-[9px] font-mono tracking-widest text-muted">{label}</div>
                <div className="text-sm font-bold mt-0.5">{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-5 text-[10px] font-mono tracking-wider text-muted">
        {Object.entries(ZONE_LABELS).map(([z, label]) => (
          <div key={z} className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5"
              style={{ background: ZONE_COLORS[Number(z)] }}
            />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
