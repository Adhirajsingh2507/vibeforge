import type { PathPoint } from "@/lib/types";

export default function RoverTimeline({ path }: { path: PathPoint[] }) {
  return (
    <div className="border rounded p-4">
      <div className="relative flex items-start justify-between">
        <div className="absolute top-[5px] left-0 right-0 h-px bg-white/10" />
        {path.map((p, i) => (
          <div key={p.t} className="relative flex flex-col items-center">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                i === path.length - 1 ? "bg-white" : "bg-white/25"
              }`}
            />
            <div className="mt-3 text-center font-mono text-[10px]">
              <div className="font-bold">T{p.t}</div>
              <div className="text-muted">{p.x},{p.y}</div>
              <div className="text-muted">{p.heading}°</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
