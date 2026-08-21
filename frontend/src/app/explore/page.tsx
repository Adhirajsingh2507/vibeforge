"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Tile, PathPoint, Site } from "@/lib/types";

const Game = dynamic(() => import("@/components/game/game"), { ssr: false });

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

async function tryJson(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function load() {
  const base = API || "/api/backend";
  try {
    return await Promise.all([
      tryJson(`${base}/map/tiles`),
      tryJson(`${base}/rover/path`),
      tryJson(`${base}/sites`),
    ]);
  } catch {
    return Promise.all([
      tryJson("/mock/tiles.json"),
      tryJson("/mock/path.json"),
      tryJson("/mock/sites.json"),
    ]);
  }
}

export default function ExplorePage() {
  const [data, setData] = useState<{
    tiles: Tile[];
    path: PathPoint[];
    sites: Site[];
  } | null>(null);

  useEffect(() => {
    load().then(([tiles, path, sites]) => setData({ tiles, path, sites }));
  }, []);

  if (!data) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-black">
        <div className="space-y-4 text-center">
          <div className="relative mx-auto h-9 w-9">
            <div className="absolute inset-0 rounded-full border border-white/15" />
            <div className="absolute inset-1 animate-spin rounded-full border border-white/10 border-t-white/60" />
          </div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-white/40">
            GENERATING TERRAIN
          </p>
        </div>
      </main>
    );
  }

  return <Game tiles={data.tiles} path={data.path} sites={data.sites} />;
}
