"""Internal handoff shapes between perception pipeline stages.

Distinct from the *API* contract (main.py). These are the in-process interfaces
so segmentation, depth, SLAM fusion, and terrain assembly can be built and
tested independently against a synthetic grid. Frozen by P0.

Stage handoffs:
    frame            -> perception : rgb grid
    frame            -> depth      : height grid (stands in for stereo in P1)
    perception       -> fusion     : grid[y][x] of SegCell
    depth            -> fusion     : grid[y][x] of DepthCell
    fusion           -> terrain    : list[FusedCell]  (world-aligned)
    terrain -> scoring -> API      : tiles + boundaries (see main.py contract)

Pure data, dependency-free. Measurement side only — nothing here decides a zone.
"""
from __future__ import annotations
from dataclasses import dataclass


@dataclass
class SegCell:
    """Per-cell segmentation output. terrain_class is one of the 9-class
    taxonomy (see scoring.CLASS_BEARING); conf in [0,1], never overconfident."""
    terrain_class: str
    conf: float


@dataclass
class DepthCell:
    """Per-cell geometry from depth. Units: metres / degrees.
    Any field may be NaN when depth is invalid — never fabricate a number."""
    height: float      # elevation z (m)
    slope_deg: float   # local surface slope (deg)
    roughness: float   # local height stddev (m)


@dataclass
class FusedCell:
    """One world-aligned grid cell: segmentation + geometry, keyed by (x,y).
    This is exactly scoring.Cell's inputs + (x, y, height)."""
    x: int
    y: int
    height: float
    slope_deg: float
    roughness: float
    terrain_class: str
    conf: float
