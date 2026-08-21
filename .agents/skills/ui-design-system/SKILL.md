---
name: ui-design-system
description: >-
  TerraSight design system — the dark space-themed visual language for the mission
  dashboard including color palette, typography, component patterns, animations,
  and glassmorphism effects. Use when establishing visual consistency, creating
  reusable UI components, or defining the aesthetic for any frontend element.
---

# ui-design-system

The visual identity of TerraSight: a dark, space-themed mission control aesthetic
with glassmorphism, subtle glow effects, and data-dense readability.

## Color Palette

### Base (Dark Theme)

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-primary` | `#0A0E17` | Main background (deep space black) |
| `--bg-secondary` | `#111827` | Card/panel backgrounds |
| `--bg-elevated` | `#1F2937` | Elevated surfaces, hovers |
| `--border` | `rgba(255,255,255,0.08)` | Subtle borders |
| `--text-primary` | `#F9FAFB` | Primary text |
| `--text-secondary` | `#9CA3AF` | Secondary/muted text |
| `--text-tertiary` | `#6B7280` | Labels, captions |

### Zone Colors (Semantic)

| Zone | Color | Hex | Glow |
|------|-------|-----|------|
| Zone 0 (Safe) | Emerald | `#10B981` | `0 0 20px rgba(16,185,129,0.4)` |
| Zone 1 (Nav) | Amber | `#F59E0B` | `0 0 20px rgba(245,158,11,0.4)` |
| Zone 2 (Geo) | Cyan | `#06B6D4` | `0 0 20px rgba(6,182,212,0.4)` |
| Zone 3 (Hazard) | Red | `#EF4444` | `0 0 20px rgba(239,68,68,0.4)` |

### Accent

| Token | Hex | Usage |
|-------|-----|-------|
| `--accent` | `#6366F1` | Primary actions, active states |
| `--accent-hover` | `#818CF8` | Hover states |
| `--warning` | `#F59E0B` | Warnings, caution states |
| `--success` | `#10B981` | Success, safe indicators |
| `--danger` | `#EF4444` | Errors, hazard indicators |

## Typography

```css
/* UI text — clean, modern */
--font-ui: 'Inter', 'system-ui', sans-serif;

/* Data/monospace — scores, coordinates, technical readouts */
--font-data: 'JetBrains Mono', 'Fira Code', monospace;

/* Display — headings, hero text */
--font-display: 'Outfit', 'Inter', sans-serif;
```

Load via Google Fonts in `layout.tsx`:
```tsx
import { Inter, Outfit, JetBrains_Mono } from 'next/font/google';
```

### Scale

| Level | Size | Weight | Font | Usage |
|-------|------|--------|------|-------|
| Display | 2.5rem | 800 | Outfit | Page title "TerraSight" |
| H1 | 1.5rem | 700 | Outfit | Section headers |
| H2 | 1.125rem | 600 | Inter | Panel titles |
| Body | 0.875rem | 400 | Inter | Default text |
| Caption | 0.75rem | 400 | Inter | Labels, hints |
| Data | 0.8125rem | 500 | JetBrains Mono | Scores, coords |

## Glassmorphism Components

### Panel (Sidebar, Cards)

```css
.glass-panel {
  background: rgba(17, 24, 39, 0.7);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
```

### Floating Card (Tooltips, Popovers)

```css
.glass-card {
  background: rgba(31, 41, 55, 0.8);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}
```

## Micro-Animations

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Panel slide-in | `translateX(-100%) → 0` | 300ms | `ease-out` |
| Card hover | `scale(1.02)` + glow increase | 200ms | `ease-in-out` |
| Zone toggle | opacity `0 → 1` | 150ms | `ease` |
| Safety score bar | width `0% → N%` | 800ms | `ease-out` |
| Rover pulse | scale `1 → 1.2 → 1` | 1500ms | `ease-in-out` (infinite) |
| Data refresh | rotate spinner 360° | 1000ms | `linear` (infinite) |
| Site marker | `translateY(-4px → 0)` bounce | 600ms | `cubic-bezier(0.36, 0.07, 0.19, 0.97)` |

## Component Patterns

### Status Indicator
```
● Connected (green dot + text)
○ Disconnected (hollow red dot)
◌ Loading (spinning ring)
```

### Score Badge
Rounded pill with score value, background gradient from red→green based on value:
```
[0.92] ← green background, white text
[0.48] ← amber background, dark text
[0.15] ← red background, white text
```

### Data Readout
Monospace value with label above:
```
SAFETY SCORE
   0.847
```

### Zone Tag
Small rounded tag with zone color + subtle border:
```
[Zone 0 · Safe]  [Zone 3 · Hazard]
```

## Responsive Breakpoints

| Breakpoint | Layout |
|------------|--------|
| `≥1280px` | Full layout: sidebar + 3D viewport + timeline |
| `≥768px` | Collapsed sidebar (icon-only), full viewport |
| `<768px` | Bottom sheet panels, stacked layout, simplified 3D |

## Constraints

- All colors must meet WCAG AA contrast on `--bg-primary`
- Animations respect `prefers-reduced-motion`
- Glassmorphism requires `backdrop-filter` support — provide a solid fallback
- Keep the space aesthetic cohesive — no bright white surfaces
- Data readouts always use monospace font for alignment
