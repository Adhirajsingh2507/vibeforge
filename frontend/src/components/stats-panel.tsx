import type { Tile, PathPoint, Site } from "@/lib/types";

export default function StatsPanel({
  tiles,
  path,
  sites,
}: {
  tiles: Tile[];
  path: PathPoint[];
  sites: Site[];
}) {
  const avgSafety =
    tiles.reduce((s, t) => s + t.safety_score, 0) / tiles.length;
  const safeTiles = tiles.filter((t) => t.zone === 0).length;
  const hazardTiles = tiles.filter((t) => t.zone === 3).length;

  const stats = [
    { label: "Safety", value: `${(avgSafety * 100).toFixed(1)}%` },
    { label: "Safe zones", value: `${safeTiles}/${tiles.length}` },
    { label: "Hazards", value: `${hazardTiles}` },
    { label: "Sites", value: `${sites.length}` },
  ];

  return (
    <div className="grid grid-cols-4 gap-px border rounded overflow-hidden">
      {stats.map((s) => (
        <div key={s.label} className="bg-surface px-4 py-4">
          <div className="text-[10px] font-mono tracking-wider text-muted">
            {s.label}
          </div>
          <div className="text-xl font-bold mt-1 tabular-nums">{s.value}</div>
        </div>
      ))}
    </div>
  );
}
