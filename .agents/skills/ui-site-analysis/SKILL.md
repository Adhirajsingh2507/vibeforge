---
name: ui-site-analysis
description: >-
  Construction site analysis UI for the TerraSight dashboard — site markers,
  safety score ranking panels, boundary polyline overlays, and geological/hazard
  zone highlighting from /sites and /boundaries APIs. Use when building the site
  ranking panel, boundary overlays, or construction viability visualizations.
---

# ui-site-analysis

Construction site analysis and boundary visualization.

## Data Sources

### Sites: `GET /sites` → `[{ id, x, y, safety_score, rank }]`

- `id`: unique site identifier
- `x, y`: world-grid position
- `safety_score`: 0–1 (higher = safer to build)
- `rank`: integer rank (1 = best site)

### Boundaries: `GET /boundaries` → `[{ type, polyline }]`

- `type`: `crater` | `waterbed` | `mineral_edge`
- `polyline`: array of `[x, y]` coordinate pairs

## Site Markers (3D)

- Render each site as a pin/beacon on the terrain at `(x, y, terrain_z)`
- Pin color: green gradient for high score → red for low score
- Pin size: proportional to rank (rank 1 = largest)
- Hover/click: show detail card with all fields
- Pulsing animation on the top-ranked site

## Site Ranking Panel (Sidebar)

```
┌─ Construction Sites ──────────────┐
│ #1  Site A  ████████░░  0.92      │
│ #2  Site B  ███████░░░  0.85      │
│ #3  Site C  █████░░░░░  0.71      │
│ #4  Site D  ███░░░░░░░  0.48      │
└───────────────────────────────────┘
```

- Sorted by rank (ascending)
- Progress bar colored by score (green → amber → red)
- Click to fly camera to that site's position
- Highlight the corresponding 3D marker on hover

## Boundary Polylines (3D)

Render each boundary as a line on the terrain surface:

| Type | Color | Style |
|------|-------|-------|
| `crater` | Red (#EF4444) | Solid, 3px, glow effect |
| `waterbed` | Cyan (#06B6D4) | Dashed, 2px |
| `mineral_edge` | Purple (#A855F7) | Dotted, 2px |

- Lines follow terrain height (sample `z` from nearby tiles)
- Optional: fill enclosed areas with semi-transparent color
- Toggle visibility per boundary type via sidebar checkboxes

## Zone Highlighting

- Toggle overlays for each zone (0–3) independently
- When a zone is highlighted, dim all other zones
- Zone legend with click-to-toggle behavior
- Show zone statistics: percentage of tiles in each zone

## Constraints

- Keep site markers performant with instanced rendering for many sites
- Boundary polylines should use `THREE.Line2` for thick lines with proper depth
- Respect the frozen API contract — render exactly what the API provides
- Site ranking panel must be scrollable for many sites
