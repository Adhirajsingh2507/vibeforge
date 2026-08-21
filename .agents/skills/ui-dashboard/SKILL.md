---
name: ui-dashboard
description: >-
  Build the TerraSight 3D Mission Dashboard — the primary frontend interface
  that renders rover terrain data as an interactive 3D map with zone overlays,
  safety score heatmaps, and real-time data from the frozen API contract.
  Use when building or modifying the main dashboard page, 3D terrain rendering,
  zone visualization, or the overall dashboard layout.
---

# ui-dashboard

The primary frontend view: a 3D interactive terrain map with zone overlays and
safety scoring heatmaps, consuming the frozen API contract.

## Tech Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Three.js** via `@react-three/fiber` + `@react-three/drei` for 3D rendering
- **Tailwind CSS 4** for layout and utility styles

## API Endpoints (frozen — read-only)

| Endpoint | Data | Usage |
|----------|------|-------|
| `GET /map/tiles` | `[{ x, y, z, class, slope, safety_score, zone }]` | 3D terrain grid |
| `GET /rover/path` | `[{ t, x, y, heading, mode }]` | Rover trail overlay |
| `GET /sites` | `[{ id, x, y, safety_score, rank }]` | Construction site markers |
| `GET /boundaries` | `[{ type, polyline }]` | Geological/hazard boundaries |
| `GET /health` | `{ status, source }` | Connection status indicator |

## 3D Terrain Grid

Render tiles as a height-mapped grid:
- Each tile is a cell at `(x, y)` with height `z`
- Color by **zone**: Zone 0 = emerald green, Zone 1 = amber, Zone 2 = cyan/blue,
  Zone 3 = red/crimson
- Opacity/glow modulated by `safety_score` (0 = dim, 1 = bright)
- Hover tooltip: shows `class`, `slope`, `safety_score`, `zone`

## Layout

```
┌─────────────────────────────────────────────────┐
│  TerraSight          [status] [source] [zoom]   │  ← top bar
├────────────┬────────────────────────────────────┤
│            │                                    │
│  Sidebar   │       3D Terrain Viewport          │
│  - Zones   │       (Three.js Canvas)            │
│  - Sites   │                                    │
│  - Legend  │                                    │
│  - Stats   │                                    │
│            │                                    │
├────────────┴────────────────────────────────────┤
│  Timeline bar  ─────────○─────────────────      │  ← rover path scrubber
└─────────────────────────────────────────────────┘
```

- Sidebar: glassmorphism panel, collapsible, zone legend + site ranking list
- 3D viewport: OrbitControls for rotation/zoom/pan
- Top bar: health status, data source indicator, view mode toggles
- Bottom: timeline bar for rover path replay

## Camera Controls

- **Orbital** (default): orbit around terrain center
- **First-person**: follow rover along its path
- **Top-down**: orthographic overhead map view
- Toggle between modes via top-bar buttons

## Data Fetching

- Use `fetch()` or SWR/React Query from Next.js client components
- Poll `/health` every 10s for connection status
- Fetch tiles/sites/boundaries on mount, with refresh button
- Base URL: use env var `NEXT_PUBLIC_API_URL` (default: `/api/backend`)

## Constraints

- **Never import from `backend/`** — frontend consumes only the API contract
- Keep the viewport performant: use instanced meshes for large tile grids
- Dark theme by default (space aesthetic)
- Accessible: keyboard navigation for sidebar, screen reader labels on controls
