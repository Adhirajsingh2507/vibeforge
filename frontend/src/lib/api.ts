import type { Tile, PathPoint, Site, Boundary } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api/backend";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

export const fetchTiles = () => get<Tile[]>("/map/tiles");
export const fetchPath = () => get<PathPoint[]>("/rover/path");
export const fetchSites = () => get<Site[]>("/sites");
export const fetchBoundaries = () => get<Boundary[]>("/boundaries");
