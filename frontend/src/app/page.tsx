"use client";

import { useEffect, useState } from "react";
import type { Tile, PathPoint, Site, Boundary } from "@/lib/types";
import TerrainGrid from "@/components/terrain-grid";
import StatsPanel from "@/components/stats-panel";
import SiteTable from "@/components/site-table";
import RoverTimeline from "@/components/rover-timeline";

type Data = {
  tiles: Tile[];
  path: PathPoint[];
  sites: Site[];
  boundaries: Boundary[];
};

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

async function tryJson(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function loadData(): Promise<Data> {
  const base = API || "/api/backend";
  try {
    const [tiles, path, sites, boundaries] = await Promise.all([
      tryJson(`${base}/map/tiles`),
      tryJson(`${base}/rover/path`),
      tryJson(`${base}/sites`),
      tryJson(`${base}/boundaries`),
    ]);
    return { tiles, path, sites, boundaries };
  } catch {
    const [tiles, path, sites, boundaries] = await Promise.all([
      tryJson("/mock/tiles.json"),
      tryJson("/mock/path.json"),
      tryJson("/mock/sites.json"),
      tryJson("/mock/boundaries.json"),
    ]);
    return { tiles, path, sites, boundaries };
  }
}

export default function Home() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"live" | "mock" | null>(null);

  useEffect(() => {
    const base = API || "/api/backend";
    fetch(`${base}/health`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((h) => setSource(h.source === "supabase" ? "live" : "mock"))
      .catch(() => setSource("mock"));

    loadData()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-lg font-bold">Connection failed</h1>
          <p className="text-muted text-sm mt-2 font-mono">{error}</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border border-white/20 rounded-full border-t-white/60 animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="border-b">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-base font-bold tracking-wide uppercase">TerraSight</h1>
            <span className="text-[10px] font-mono text-muted">Mission Control</span>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                source === "live" ? "bg-white animate-pulse-slow" : "bg-white/30"
              }`}
            />
            <span className="text-[10px] font-mono text-muted">
              {source === "live" ? "Live" : "Simulation"}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <StatsPanel tiles={data.tiles} path={data.path} sites={data.sites} />

        <TerrainGrid
          tiles={data.tiles}
          path={data.path}
          sites={data.sites}
          boundaries={data.boundaries}
        />

        <a
          href="/explore"
          className="group block rounded border px-5 py-5 transition-colors hover:bg-white/[0.03]"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold">Surface View</h3>
              <p className="mt-1 text-sm text-muted">
                Drive the rover across the terrain in 3D. Blocks match the perception data above.
              </p>
            </div>
            <span className="shrink-0 rounded border bg-white px-4 py-2 font-mono text-[10px] font-bold tracking-wider text-black group-hover:bg-white/85">
              LAUNCH
            </span>
          </div>
        </a>

        <div className="grid lg:grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] font-mono text-muted mb-2">
              Construction sites · {data.sites.length} candidates
            </div>
            <SiteTable sites={data.sites} />
          </div>
          <div>
            <div className="text-[10px] font-mono text-muted mb-2">
              Rover path · {data.path.length} waypoints
            </div>
            <RoverTimeline path={data.path} />
          </div>
        </div>
      </div>
    </main>
  );
}
