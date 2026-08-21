---
name: ui-rover-viz
description: >-
  Rover path visualization for the TerraSight dashboard — animated rover movement,
  heading indicators, trail rendering, and timeline scrubbing from the /rover/path
  API. Use when building or modifying rover visualization, path animation, or the
  timeline controls.
---

# ui-rover-viz

Rover movement visualization on the 3D terrain map.

## Data Source

`GET /rover/path` → `[{ t, x, y, heading, mode }]`

- `t`: frame/tick index (integer, sequential)
- `x, y`: world-grid position in meters
- `heading`: degrees (0 = north, clockwise)
- `mode`: drive state (`full`, `cautious`, `survey-only`, `safe-hold`)

## Rover Model

- Simple 3D rover mesh (box body + wheels or a low-poly rover model)
- Positioned at `(x, y, terrain_z)` where `terrain_z` is interpolated from nearby tiles
- Rotated to match `heading`
- Color/glow reflects `mode`:
  - `full` → green glow
  - `cautious` → amber glow
  - `survey-only` → blue glow
  - `safe-hold` → red pulse

## Trail Rendering

- Line geometry connecting all `(x, y)` points up to current `t`
- Trail color gradient: older segments fade to transparent
- Trail segments colored by `mode` at that tick
- Optional: particle trail effect for visual flair

## Timeline Controls

```
◀ ║ ▶   ──────────●──────────────   t=42/200   ▸ 1x
```

- Play/pause button
- Scrubber bar (range input mapped to `t`)
- Current tick / total ticks display
- Playback speed selector (0.5x, 1x, 2x, 4x)
- Auto-play on page load (optional, controlled by user preference)

## Camera Follow Mode

When "follow rover" is toggled:
- Camera smoothly tracks the rover position
- Camera `lookAt` stays slightly ahead of heading
- Smooth interpolation via `THREE.Vector3.lerp`
- User can still orbit around the rover as center

## Constraints

- Animate smoothly between ticks using `requestAnimationFrame` or `useFrame`
- Keep rover mesh lightweight (low poly count)
- Trail should not exceed 500 segments for performance — truncate old ones
- Respect the frozen API contract — don't add fields to path data
