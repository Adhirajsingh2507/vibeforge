import type { PathPoint } from "@/lib/types";

export default function RoverTimeline({ path }: { path: PathPoint[] }) {
  return (
    <div className="border rounded p-5 bg-surface relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <h3 className="text-[9px] font-mono tracking-[0.2em] text-muted uppercase mb-5">
        Trajectory Log
      </h3>

      <div className="relative">
        {/* connecting line */}
        <div className="absolute top-3 left-0 right-0 h-px bg-white/10" />

        <div className="flex justify-between relative">
          {path.map((p, i) => {
            const isLast = i === path.length - 1;
            return (
              <div key={p.t} className="flex flex-col items-center">
                <div className="relative">
                  {isLast && (
                    <div className="absolute -inset-2 rounded-full border border-white/20" />
                  )}
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      isLast ? "bg-white" : "bg-white/30"
                    }`}
                  />
                </div>
                <div className="mt-4 text-center space-y-1">
                  <div className="text-[10px] font-mono font-bold tracking-widest">
                    T{p.t}
                  </div>
                  <div className="text-[10px] font-mono text-muted">
                    {p.x},{p.y}
                  </div>
                  <div className="text-[9px] font-mono text-muted">
                    {p.heading}°
                  </div>
                  <div
                    className={`text-[8px] font-mono tracking-[0.15em] uppercase px-2 py-0.5 rounded-sm ${
                      p.mode === "full"
                        ? "bg-white/10 text-white/70"
                        : "bg-white/5 text-white/40"
                    }`}
                  >
                    {p.mode}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
