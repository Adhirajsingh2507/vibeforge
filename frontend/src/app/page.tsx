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
  const [time, setTime] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(
        now.toISOString().replace("T", " · ").replace(/\.\d+Z/, " UTC")
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

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
      <main className="min-h-screen flex items-center justify-center p-8 grid-overlay">
        <div className="text-center space-y-3">
          <div className="text-[10px] font-mono tracking-[0.3em] text-muted uppercase">
            System Error
          </div>
          <h1 className="text-xl font-bold">CONNECTION LOST</h1>
          <p className="text-muted text-xs font-mono">{error}</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 grid-overlay">
        <div className="text-center space-y-4">
          <div className="relative w-10 h-10 mx-auto">
            <div className="absolute inset-0 border border-white/20 rounded-full" />
            <div className="absolute inset-1 border border-white/10 rounded-full animate-spin border-t-white/60" />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-mono tracking-[0.3em] text-muted uppercase">
              Acquiring Telemetry
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen grid-overlay relative">
      {/* Header */}
      <header className="border-b relative">
        <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div>
              <h1 className="text-lg font-bold tracking-[0.05em] uppercase">
                TerraSight
              </h1>
            </div>
            <div className="h-4 w-px bg-white/10" />
            <span className="text-[9px] font-mono tracking-[0.25em] text-muted uppercase">
              Mission Control
            </span>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  source === "live"
                    ? "bg-white animate-pulse-slow"
                    : "bg-white/30"
                }`}
              />
              <span className="text-[9px] font-mono tracking-[0.2em] text-muted uppercase">
                {source === "live" ? "Live" : "Simulation"}
              </span>
            </div>
            <div className="h-4 w-px bg-white/10" />
            <span className="text-[9px] font-mono tracking-wider text-muted tabular-nums">
              {time}
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        {/* Stats */}
        <section>
          <SectionLabel title="Telemetry Overview" />
          <StatsPanel tiles={data.tiles} path={data.path} sites={data.sites} />
        </section>

        {/* Terrain Map */}
        <section>
          <SectionLabel
            title="Terrain Analysis"
            right={`${data.tiles.length} cells · ${Math.max(...data.tiles.map((t) => t.x)) + 1}×${Math.max(...data.tiles.map((t) => t.y)) + 1} grid`}
          />
          <TerrainGrid
            tiles={data.tiles}
            path={data.path}
            sites={data.sites}
            boundaries={data.boundaries}
          />
        </section>

        {/* Bottom row */}
        <div className="grid lg:grid-cols-2 gap-6">
          <section>
            <SectionLabel
              title="Construction Sites"
              right={`${data.sites.length} candidates`}
            />
            <SiteTable sites={data.sites} />
          </section>

          <section>
            <SectionLabel
              title="Rover Trajectory"
              right={`${data.path.length} waypoints`}
            />
            <RoverTimeline path={data.path} />
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t mt-6">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
          <span className="text-[9px] font-mono tracking-[0.2em] text-muted uppercase">
            TerraSight v0.1.0
          </span>
          <span className="text-[9px] font-mono tracking-wider text-muted">
            SIH · Space Technology · Edge AI
          </span>
        </div>
      </footer>
    </main>
  );
}

function SectionLabel({ title, right }: { title: string; right?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[10px] font-mono tracking-[0.25em] text-muted uppercase">
        {title}
      </h2>
      {right && (
        <span className="text-[9px] font-mono tracking-wider text-muted/60">
          {right}
        </span>
      )}
    </div>
  );
}
