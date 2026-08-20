"""Depth-geometry stub — derive per-cell slope + roughness from a height grid.

P1 takes the height grid directly (the fixture stands in for a stereo depth map).
P2 replaces `derive_geometry`'s input with real SGBM disparity -> metric depth,
keeping this slope/roughness output. Units: degrees / metres.

Slope = atan of the local height gradient (central differences, one-sided at
edges). Roughness = population stddev of finite heights in the 3x3 neighbourhood.
A non-finite height propagates as NaN — scoring scores NaN as 0, never full
credit, so missing depth can't become a safe cell. Pure stdlib.
"""
from __future__ import annotations
import math
from statistics import pstdev
from app.contracts import DepthCell


def _finite(v) -> bool:
    return v is not None and math.isfinite(v)


def _grad_axis(lo, hi, cur, step):
    """One partial derivative from neighbours; one-sided if a side is missing."""
    if _finite(lo) and _finite(hi):
        return (hi - lo) / (2 * step)
    if _finite(hi) and _finite(cur):
        return (hi - cur) / step
    if _finite(lo) and _finite(cur):
        return (cur - lo) / step
    return float("nan")


def derive_geometry(heights, cell_size_m: float) -> list[list[DepthCell]]:
    """heights[y][x] (m, may be None/NaN) -> grid[y][x] of DepthCell."""
    rows, cols = len(heights), len(heights[0])
    out: list[list[DepthCell]] = []
    for y in range(rows):
        line = []
        for x in range(cols):
            h = heights[y][x]
            if not _finite(h):
                line.append(DepthCell(float("nan"), float("nan"), float("nan")))
                continue
            dzdx = _grad_axis(heights[y][x - 1] if x > 0 else None,
                              heights[y][x + 1] if x < cols - 1 else None,
                              h, cell_size_m)
            dzdy = _grad_axis(heights[y - 1][x] if y > 0 else None,
                              heights[y + 1][x] if y < rows - 1 else None,
                              h, cell_size_m)
            if math.isfinite(dzdx) and math.isfinite(dzdy):
                slope = math.degrees(math.atan(math.hypot(dzdx, dzdy)))
            else:
                slope = float("nan")
            window = [heights[j][i]
                      for j in range(max(0, y - 1), min(rows, y + 2))
                      for i in range(max(0, x - 1), min(cols, x + 2))
                      if _finite(heights[j][i])]
            rough = pstdev(window) if len(window) > 1 else 0.0
            line.append(DepthCell(float(h), slope, rough))
        out.append(line)
    return out


def _demo():
    # flat plane -> ~0 slope, ~0 roughness
    flat = [[1.0] * 4 for _ in range(4)]
    g = derive_geometry(flat, 1.0)
    assert abs(g[1][1].slope_deg) < 1e-6 and g[1][1].roughness < 1e-9, g[1][1]
    # constant 45-deg ramp (dz == dx) -> slope ~45 deg
    ramp = [[float(x) for x in range(4)] for _ in range(4)]
    gr = derive_geometry(ramp, 1.0)
    assert abs(gr[1][1].slope_deg - 45.0) < 1e-6, gr[1][1]
    # missing depth propagates as NaN, not a fabricated number
    holed = [[1.0, 1.0], [1.0, float("nan")]]
    gh = derive_geometry(holed, 1.0)
    assert math.isnan(gh[1][1].slope_deg) and math.isnan(gh[1][1].height), gh[1][1]
    print("depth self-check ok")


if __name__ == "__main__":
    _demo()
