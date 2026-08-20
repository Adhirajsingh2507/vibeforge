"""Phase 4 / P7 evaluation metrics — perception + end-to-end decision vs. GT.

Distinct from `testing` (correctness/regression of rules + contract shape):
this module measures *quality* — how close predictions are to ground truth.
Read-only over every other stage: pure functions of (pred, gt), imports
`app.scoring` and `app.perception.segment` but never modifies them.

Metrics:
    segmentation_metrics  per-class IoU + mean IoU + accuracy (9-class taxonomy)
    depth_metrics         MAE / RMSE over finite GT cells (NaN never scored)
    zone_metrics          zone accuracy + confusion counts
    safety_score_metrics  MAE of safety_score vs GT
    false_safe            MISSION-CRITICAL: fraction of GT-hazard cells predicted
                           Zone 0 (buildable) -- must be reportable, red flag if > 0
                           (see CLAUDE.md "No false-safe" invariant). Reports its
                           dual too: the raw missed-hazard count.

Ground truth sources:
    Segmentation -- REAL: backend/data/scenes/*/labels.json (P6 dataset), run
        through the real app.perception.segment.classify(). Those scenes'
        left.txt/right.txt are documented placeholder text (no real imagery
        yet), so per-cell RGB is synthesized from each GT class's own
        CLASS_COLORS centroid to drive the real classifier -- this is a
        self-consistency check of the real classifier against real labels,
        NOT a generalization/robustness measure (that needs real captures).
    Depth / zone / safety / false-safe -- SYNTHETIC: no labelled depth or
        zone dataset exists yet (P6 status, see backend/data/README.md).
        Hand-built scenes with known-by-construction GT, run through the
        real app.depth.pipeline / app.scoring.

Run:  python -m app.eval.metrics   (from backend/)
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from app.scoring import Cell, CLASS_BEARING, safety_score, zone
from app.perception.segment import classify, CLASS_COLORS
from app.depth.pipeline import derive_geometry

TAXONOMY = tuple(CLASS_BEARING)  # the 9-class taxonomy, single source of truth
DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"

# off-gamut probe colour -- same one app.perception.segment._demo() uses to
# elicit "unknown"; CLASS_COLORS has no centroid for "unknown" by design.
_UNKNOWN_RGB = (0, 255, 0)


def _flatten(x):
    """Grid (list of lists) or flat sequence -> flat list."""
    out = []
    for v in x:
        if isinstance(v, (list, tuple)) and v and isinstance(v[0], (list, tuple)):
            out.extend(_flatten(v))
        elif isinstance(v, (list, tuple)):
            out.extend(v)
        else:
            out.append(v)
    return out


# --------------------------------------------------------------- segmentation
def segmentation_metrics(pred, gt, classes=TAXONOMY) -> dict:
    """(pred_labels, gt_labels) -> {iou: {class: IoU|None}, miou, accuracy}.
    IoU = |pred==c & gt==c| / |pred==c or gt==c|; classes absent from both
    pred and gt report IoU=None and are excluded from the mean (undefined,
    not zero)."""
    p, g = _flatten(pred), _flatten(gt)
    assert len(p) == len(g) and len(p) > 0, "pred/gt length mismatch or empty"
    p_arr, g_arr = np.asarray(p), np.asarray(g)
    iou = {}
    for c in classes:
        pm, gm = p_arr == c, g_arr == c
        union = int((pm | gm).sum())
        iou[c] = None if union == 0 else int((pm & gm).sum()) / union
    scored = [v for v in iou.values() if v is not None]
    miou = float(np.mean(scored)) if scored else float("nan")
    accuracy = float((p_arr == g_arr).mean())
    return {"iou": iou, "miou": miou, "accuracy": accuracy, "n": len(p)}


# ------------------------------------------------------------------- generic
def _mae_rmse(pred, gt) -> dict:
    """Shared MAE/RMSE core for depth + safety_score: only pairs finite in
    BOTH pred and gt are scored -- never fabricate an error for a missing
    value (mirrors scoring.py's own NaN discipline)."""
    p, g = np.asarray(_flatten(pred), dtype=float), np.asarray(_flatten(gt), dtype=float)
    assert p.shape == g.shape and p.size > 0, "pred/gt length mismatch or empty"
    mask = np.isfinite(p) & np.isfinite(g)
    n = int(mask.sum())
    if n == 0:
        return {"mae": float("nan"), "rmse": float("nan"), "n": 0}
    diff = p[mask] - g[mask]
    return {"mae": float(np.mean(np.abs(diff))), "rmse": float(np.sqrt(np.mean(diff ** 2))), "n": n}


def depth_metrics(pred_z, gt_z) -> dict:
    """MAE / RMSE of predicted height/depth vs GT, over finite cells only."""
    return _mae_rmse(pred_z, gt_z)


def safety_score_metrics(pred_score, gt_score) -> dict:
    """MAE of safety_score vs GT, over finite cells only."""
    return _mae_rmse(pred_score, gt_score)


# --------------------------------------------------------------------- zone
def zone_metrics(pred_zone, gt_zone) -> dict:
    """Zone accuracy + a small (gt,pred) confusion count dict, 4x4 (Zones 0-3)."""
    p, g = _flatten(pred_zone), _flatten(gt_zone)
    assert len(p) == len(g) and len(p) > 0, "pred/gt length mismatch or empty"
    confusion = {}
    for gz, pz in zip(g, p):
        confusion[(gz, pz)] = confusion.get((gz, pz), 0) + 1
    accuracy = sum(1 for a, b in zip(p, g) if a == b) / len(p)
    return {"accuracy": accuracy, "confusion": confusion, "n": len(p)}


# ------------------------------------------------------- HEADLINE: false-safe
def false_safe(pred_zone, gt_zone, gt_class=None) -> dict:
    """Fraction of GT-hazard cells (GT zone 3, or GT class 'crater' when
    gt_class is given) that pred called Zone 0 (buildable). This is the
    headline safety metric (CLAUDE.md "No false-safe" invariant) -- a
    nonzero rate means the pipeline would let a rover build on ground GT
    marks as hazardous. Also reports the dual: the raw missed-hazard count
    (same cells, count form instead of rate)."""
    p, g = _flatten(pred_zone), _flatten(gt_zone)
    c = _flatten(gt_class) if gt_class is not None else [None] * len(g)
    assert len(p) == len(g) == len(c), "pred/gt/class length mismatch"
    hazard_idx = [i for i in range(len(g)) if g[i] == 3 or c[i] == "crater"]
    total_hazard = len(hazard_idx)
    if total_hazard == 0:
        return {"rate": 0.0, "missed_hazard_count": 0, "total_hazard": 0}
    missed = sum(1 for i in hazard_idx if p[i] == 0)
    return {"rate": missed / total_hazard, "missed_hazard_count": missed,
            "total_hazard": total_hazard}


# ============================================================== real-GT runner
def _load_real_seg_gt() -> tuple[list[str], list[str]]:
    """-> (pred, gt) class-label lists over every scene in the P6 dataset
    manifest. See module docstring: pred is the real classifier fed a
    synthetic per-cell colour derived from the GT label (no real imagery
    exists yet)."""
    manifest = json.loads((DATA_DIR / "manifest.json").read_text())
    pred, gt = [], []
    for entry in manifest["entries"]:
        labels = json.loads((DATA_DIR / entry["labels"]).read_text())["labels"]
        for row in labels:
            for cls in row:
                gt.append(cls)
                rgb = CLASS_COLORS.get(cls, _UNKNOWN_RGB)
                pred.append(classify(rgb).terrain_class)
    return pred, gt


# ============================================================ synthetic-GT runner
def _synthetic_depth_zone_scene():
    """Hand-built cells with GT assigned by construction (documented
    synthetic -- P6 has no labelled depth/zone dataset yet). Runs the REAL
    depth.pipeline geometry + scoring.zone/safety_score, so this exercises
    production code end-to-end, not a mocked decision layer."""
    # -- depth: isolated flat patch (GT slope/roughness 0) and a 45deg ramp
    # (GT slope 45, matches depth.pipeline._demo's own known-answer).
    flat = [[1.0] * 3 for _ in range(3)]
    ramp = [[float(x) for x in range(3)] for _ in range(3)]
    flat_geo = derive_geometry(flat, 1.0)
    ramp_geo = derive_geometry(ramp, 1.0)
    pred_slope = [flat_geo[1][1].slope_deg, ramp_geo[1][1].slope_deg]
    gt_slope = [0.0, 45.0]

    # -- zone/safety: cells mirroring scoring._demo's documented semantics,
    # run through the REAL zone()/safety_score() to get pred; GT assigned by
    # the same intent (flat buildable soil -> Zone 0 safe; crater -> Zone 3
    # hazard, regardless of how smooth it looks -- the "no false-safe"
    # invariant scoring.py itself enforces).
    cells = {
        "safe_flat": Cell(3, 0.02, "compact_soil", 10, conf=0.9),
        "smooth_crater": Cell(4, 0.03, "crater", 12, conf=0.9),   # looks flat, still hazard
        "boulder": Cell(5, 0.5, "rock", 9, conf=0.9),
        "loose": Cell(6, 0.1, "loose_soil", 8, conf=0.9),
    }
    gt_zone_by_name = {"safe_flat": 0, "smooth_crater": 3, "boulder": 3, "loose": 1}
    # synthetic "expert-labelled" safety scores -- independent of pred, so
    # safety_score_metrics below is a real (non-trivial) MAE, not pred-vs-pred.
    gt_score_by_name = {"safe_flat": 0.90, "smooth_crater": 0.10, "boulder": 0.10, "loose": 0.50}
    gt_class_by_name = {n: c.terrain_class for n, c in cells.items()}
    pred_zone = [zone(cells[n]) for n in cells]
    gt_zone_list = [gt_zone_by_name[n] for n in cells]
    gt_class_list = [gt_class_by_name[n] for n in cells]
    pred_score = [safety_score(cells[n]) for n in cells]
    gt_score_list = [gt_score_by_name[n] for n in cells]

    return {
        "pred_slope": pred_slope, "gt_slope": gt_slope,
        "pred_zone": pred_zone, "gt_zone": gt_zone_list, "gt_class": gt_class_list,
        "pred_score": pred_score, "gt_score": gt_score_list,
    }


def run_report() -> None:
    print("=== segmentation (REAL GT: backend/data/scenes/*/labels.json) ===")
    pred, gt = _load_real_seg_gt()
    seg = segmentation_metrics(pred, gt)
    print(f"  n={seg['n']}  accuracy={seg['accuracy']:.3f}  mIoU={seg['miou']:.3f}")
    for c, v in seg["iou"].items():
        print(f"    {c:14s} IoU={'n/a' if v is None else f'{v:.3f}'}")

    print("=== depth / zone / safety / false-safe (SYNTHETIC GT) ===")
    s = _synthetic_depth_zone_scene()
    d = depth_metrics(s["pred_slope"], s["gt_slope"])
    print(f"  depth (slope, deg): MAE={d['mae']:.3f} RMSE={d['rmse']:.3f} n={d['n']}")
    z = zone_metrics(s["pred_zone"], s["gt_zone"])
    print(f"  zone accuracy={z['accuracy']:.3f}  confusion(gt,pred)={z['confusion']}")
    sm = safety_score_metrics(s["pred_score"], s["gt_score"])
    print(f"  safety_score MAE={sm['mae']:.3f} RMSE={sm['rmse']:.3f} n={sm['n']}")
    fs = false_safe(s["pred_zone"], s["gt_zone"], s["gt_class"])
    print(f"  FALSE-SAFE RATE (headline) = {fs['rate']:.3f}  "
          f"missed_hazard_count={fs['missed_hazard_count']}/{fs['total_hazard']}")


# ---------------------------------------------------------------- self-check
def _demo():
    # ---- segmentation: perfect prediction -> IoU 1.0 all classes, mIoU 1.0
    gt = ["soil", "rock", "soil", "crater"]
    seg_perfect = segmentation_metrics(gt, gt, classes=("soil", "rock", "crater"))
    assert seg_perfect["accuracy"] == 1.0
    assert seg_perfect["miou"] == 1.0
    assert all(v == 1.0 for v in seg_perfect["iou"].values())

    # ---- segmentation: known-answer partial mismatch (hand-computed IoU)
    # gt:   soil soil rock rock  |  pred: soil rock rock rock
    # soil: pred{0} gt{0,1} -> inter=1 union=2 -> IoU 0.5
    # rock: pred{1,2,3} gt{2,3} -> inter=2 union=3 -> IoU 2/3
    gt2 = ["soil", "soil", "rock", "rock"]
    pred2 = ["soil", "rock", "rock", "rock"]
    seg2 = segmentation_metrics(pred2, gt2, classes=("soil", "rock"))
    assert seg2["iou"]["soil"] == 0.5, seg2
    assert abs(seg2["iou"]["rock"] - 2 / 3) < 1e-9, seg2
    assert seg2["accuracy"] == 0.75, seg2

    # ---- segmentation: a class absent from both pred and gt -> None, not 0
    seg3 = segmentation_metrics(["soil"], ["soil"], classes=("soil", "crater"))
    assert seg3["iou"]["crater"] is None, seg3

    # ---- depth: perfect prediction -> 0 / 0; NaN entries ignored, not fabricated
    perfect_pred = [1.0, 2.0, float("nan"), 5.0]
    perfect_gt = [1.0, 2.0, 3.0, 5.0]  # NaN in pred at idx 2 must be skipped, not scored as error
    d0 = depth_metrics(perfect_pred, perfect_gt)
    assert d0["mae"] == 0.0 and d0["rmse"] == 0.0 and d0["n"] == 3, d0

    # ---- depth: known-answer error. errors = [1, -2] -> MAE=1.5, RMSE=sqrt(2.5)
    d1 = depth_metrics([2.0, 1.0], [1.0, 3.0])
    assert abs(d1["mae"] - 1.5) < 1e-9, d1
    assert abs(d1["rmse"] - math.sqrt(2.5)) < 1e-9, d1

    # ---- depth: all-NaN pair -> n=0, no crash, no fabricated number
    d_all_nan = depth_metrics([float("nan")], [float("nan")])
    assert d_all_nan["n"] == 0 and math.isnan(d_all_nan["mae"])

    # ---- zone: perfect agreement -> accuracy 1.0
    zm = zone_metrics([0, 1, 3, 2], [0, 1, 3, 2])
    assert zm["accuracy"] == 1.0 and zm["confusion"] == {(0, 0): 1, (1, 1): 1, (3, 3): 1, (2, 2): 1}

    # ---- zone: mismatch -> confusion counted, accuracy < 1
    zm2 = zone_metrics([0, 1], [3, 1])
    assert zm2["accuracy"] == 0.5 and zm2["confusion"][(3, 0)] == 1, zm2

    # ---- safety score MAE: perfect -> 0
    ssm = safety_score_metrics([0.5, 0.8], [0.5, 0.8])
    assert ssm["mae"] == 0.0 and ssm["rmse"] == 0.0

    # ---- FALSE-SAFE: no hazard cells in GT -> rate 0
    fs0 = false_safe([0, 1], [0, 1])
    assert fs0["rate"] == 0.0 and fs0["missed_hazard_count"] == 0

    # ---- FALSE-SAFE: constructed case, a GT-hazard cell predicted safe.
    # gt_zone=[3,1,3], pred_zone=[0,1,3] -> cell 0 is GT hazard called Zone 0
    # (false-safe) but cell 2 is GT hazard correctly called Zone 3.
    fs1 = false_safe(pred_zone=[0, 1, 3], gt_zone=[3, 1, 3])
    assert fs1["total_hazard"] == 2, fs1
    assert fs1["missed_hazard_count"] == 1, fs1
    assert abs(fs1["rate"] - 0.5) < 1e-9, fs1
    assert fs1["rate"] > 0, "false-safe must be flagged when a GT-hazard cell is predicted safe"

    # ---- FALSE-SAFE via gt_class (crater without an explicit zone-3 GT tag)
    fs2 = false_safe(pred_zone=[0, 3], gt_zone=[1, 1], gt_class=["crater", "rock"])
    assert fs2["total_hazard"] == 1 and fs2["missed_hazard_count"] == 1 and fs2["rate"] == 1.0, fs2

    # ---- FALSE-SAFE: all hazards correctly caught -> rate 0 (the healthy case)
    fs3 = false_safe(pred_zone=[3, 3, 1], gt_zone=[3, 3, 0])
    assert fs3["rate"] == 0.0 and fs3["missed_hazard_count"] == 0, fs3

    # ---- integration: real scoring.py on known-hazard cells never false-safes
    # (mirrors scoring._demo()'s own hazard exemplars; this checks the metric
    # against genuinely-computed production zones, not a hand-built array).
    hazard_cells = [
        Cell(30, 0.4, "crater", 0.5),        # rim
        Cell(4, 0.03, "crater", 12),         # smooth-looking crater floor
        Cell(5, 0.5, "rock", 9),             # boulder
        Cell(30, 0.5, "waterbed", 9),        # hazard beats geological
    ]
    real_pred_zone = [zone(c) for c in hazard_cells]
    real_gt_zone = [3, 3, 3, 3]
    fs_real = false_safe(real_pred_zone, real_gt_zone)
    assert fs_real["rate"] == 0.0, ("production scoring.py false-safed on a "
                                     f"known-hazard cell: {fs_real}")

    print("eval metrics self-check ok")


if __name__ == "__main__":
    _demo()
    print()
    run_report()
