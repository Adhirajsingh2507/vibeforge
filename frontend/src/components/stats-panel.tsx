import type { Tile, PathPoint, Site } from "@/lib/types";

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border rounded p-4 bg-surface relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="text-[9px] font-mono tracking-[0.2em] text-muted uppercase">
        {label}
      </div>
      <div className="text-2xl font-bold tracking-tight mt-1.5 font-[Helvetica,Arial,sans-serif]">
        {value}
      </div>
      {sub && (
        <div className="text-[10px] font-mono text-muted mt-1 tracking-wide">
          {sub}
        </div>
      )}
    </div>
  );
}

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
  const topSite = sites.length > 0 ? sites.reduce((a, b) => (a.rank < b.rank ? a : b)) : null;
  const roverPos = path.length > 0 ? path[path.length - 1] : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      <Stat
        label="Avg Safety"
        value={`${(avgSafety * 100).toFixed(1)}%`}
        sub={`${tiles.length} cells scanned`}
      />
      <Stat
        label="Safe Zones"
        value={`${safeTiles}`}
        sub={`${((safeTiles / tiles.length) * 100).toFixed(0)}% of terrain`}
      />
      <Stat
        label="Hazard Zones"
        value={`${hazardTiles}`}
        sub={`${((hazardTiles / tiles.length) * 100).toFixed(0)}% of terrain`}
      />
      <Stat
        label="Top Site"
        value={topSite ? topSite.id : "—"}
        sub={topSite ? `${(topSite.safety_score * 100).toFixed(1)}% · (${topSite.x},${topSite.y})` : undefined}
      />
      <Stat
        label="Rover Position"
        value={roverPos ? `${roverPos.x}, ${roverPos.y}` : "—"}
        sub={roverPos ? `HDG ${roverPos.heading}° · ${roverPos.mode.toUpperCase()}` : undefined}
      />
      <Stat
        label="Path Length"
        value={`${path.length}`}
        sub="waypoints"
      />
      <Stat
        label="Sites"
        value={`${sites.length}`}
        sub="construction candidates"
      />
      <Stat
        label="Zones"
        value={`${[0, 1, 2, 3].map((z) => tiles.filter((t) => t.zone === z).length).join(" · ")}`}
        sub="S · N · G · H"
      />
    </div>
  );
}
