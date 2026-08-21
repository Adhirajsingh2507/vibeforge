import type { Site } from "@/lib/types";

export default function SiteTable({ sites }: { sites: Site[] }) {
  const sorted = [...sites].sort((a, b) => a.rank - b.rank);

  return (
    <div className="border rounded overflow-hidden bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="px-4 py-3 text-[9px] font-mono tracking-[0.2em] text-muted uppercase font-normal">
                Rank
              </th>
              <th className="px-4 py-3 text-[9px] font-mono tracking-[0.2em] text-muted uppercase font-normal">
                Site ID
              </th>
              <th className="px-4 py-3 text-[9px] font-mono tracking-[0.2em] text-muted uppercase font-normal">
                Coordinates
              </th>
              <th className="px-4 py-3 text-[9px] font-mono tracking-[0.2em] text-muted uppercase font-normal text-right">
                Safety Score
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((site, i) => (
              <tr
                key={site.id}
                className="border-b last:border-b-0 hover:bg-surface-hover transition-colors"
                style={{ borderColor: 'rgba(255,255,255,0.05)' }}
              >
                <td className="px-4 py-3">
                  <span className="text-xs font-mono text-muted">
                    {String(site.rank).padStart(2, "0")}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs font-bold tracking-wider">
                  {site.id}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted">
                  {site.x}, {site.y}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white rounded-full"
                        style={{ width: `${site.safety_score * 100}%`, opacity: 0.8 }}
                      />
                    </div>
                    <span className="font-mono text-xs font-bold tabular-nums">
                      {(site.safety_score * 100).toFixed(1)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
