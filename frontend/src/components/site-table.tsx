import type { Site } from "@/lib/types";

export default function SiteTable({ sites }: { sites: Site[] }) {
  const sorted = [...sites].sort((a, b) => a.rank - b.rank);

  return (
    <div className="border rounded overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-[10px] font-mono text-muted tracking-wider">
            <th className="px-4 py-2 font-normal">#</th>
            <th className="px-4 py-2 font-normal">Site</th>
            <th className="px-4 py-2 font-normal">Position</th>
            <th className="px-4 py-2 font-normal text-right">Safety</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((site) => (
            <tr key={site.id} className="border-b last:border-b-0">
              <td className="px-4 py-2 font-mono text-xs text-muted">{site.rank}</td>
              <td className="px-4 py-2 font-mono text-xs font-bold">{site.id}</td>
              <td className="px-4 py-2 font-mono text-xs text-muted">{site.x},{site.y}</td>
              <td className="px-4 py-2 font-mono text-xs font-bold text-right tabular-nums">
                {(site.safety_score * 100).toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
