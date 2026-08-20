"""Dataset integrity validator for backend/data/. Data-side only — does not
import or touch scoring.py/guards.py/db.py; it only checks the manifest that
those layers will eventually be fed through a (later) loader.

Checks:
  (a) every manifest path exists
  (b) all labels are within the 9-class taxonomy
  (c) no scene_id appears under two different splits (leakage guard)
  (d) each referenced calibration file parses and has every Calibration field

Run: python data/validate_dataset.py   (from backend/)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent

# Kept in sync with app.scoring.CLASS_BEARING keys (the 9-class taxonomy).
TAXONOMY = {
    "compact_soil", "soil", "loose_soil", "rock", "crater",
    "shadow", "waterbed", "mineral_edge", "unknown",
}

# Kept in sync with app.depth.calibration.Calibration field names.
CALIBRATION_FIELDS = {
    "baseline_m", "focal_px", "cx", "cy",
    "min_disparity", "num_disparities", "block_size", "uniqueness_ratio",
    "speckle_window_size", "speckle_range", "disp12_max_diff",
    "min_valid_disparity_px",
}


def validate(manifest_path: Path, root: Path) -> list[str]:
    """Return a list of error strings; empty means the dataset is valid."""
    errors: list[str] = []
    manifest = json.loads(manifest_path.read_text())
    entries = manifest.get("entries", [])

    seen_splits: dict[str, str] = {}
    calib_cache: dict[str, dict] = {}

    for e in entries:
        scene_id = e.get("scene_id", "<missing scene_id>")

        # (c) leakage guard: a scene_id must map to exactly one split.
        split = e.get("split")
        if scene_id in seen_splits and seen_splits[scene_id] != split:
            errors.append(
                f"{scene_id}: appears in both '{seen_splits[scene_id]}' and "
                f"'{split}' splits (leakage)"
            )
        else:
            seen_splits[scene_id] = split

        # (a) referenced paths must exist.
        stereo = e.get("stereo", {})
        rel_paths = [stereo.get("left"), stereo.get("right"), e.get("labels"), e.get("calibration")]
        for rel in rel_paths:
            if rel is None or not (root / rel).exists():
                errors.append(f"{scene_id}: missing file {rel}")

        # (b) labels within the 9-class taxonomy.
        labels_rel = e.get("labels")
        labels_path = root / labels_rel if labels_rel else None
        if labels_path and labels_path.exists():
            grid = json.loads(labels_path.read_text()).get("labels", [])
            bad = {c for row in grid for c in row if c not in TAXONOMY}
            if bad:
                errors.append(f"{scene_id}: labels outside taxonomy: {sorted(bad)}")

        # (d) calibration parses and has every Calibration field.
        calib_rel = e.get("calibration")
        if calib_rel is None:
            continue
        calib_path = root / calib_rel
        if calib_rel not in calib_cache and calib_path.exists():
            try:
                calib_cache[calib_rel] = json.loads(calib_path.read_text())
            except json.JSONDecodeError as exc:
                errors.append(f"{scene_id}: calibration {calib_rel} invalid JSON: {exc}")
                calib_cache[calib_rel] = {}
        calib = calib_cache.get(calib_rel, {})
        missing = CALIBRATION_FIELDS - set(calib)
        if calib and missing:
            errors.append(f"{scene_id}: calibration {calib_rel} missing fields: {sorted(missing)}")

    return errors


def main() -> int:
    errors = validate(DATA_DIR / "manifest.json", DATA_DIR)
    if errors:
        print(f"INVALID — {len(errors)} error(s):")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("valid: manifest paths exist, labels in taxonomy, no split leakage, calibration complete")
    return 0


def _self_test() -> None:
    """Runnable self-check: validate() must catch every error class."""
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "calibration").mkdir()
        good_calib = {f: 1.0 for f in CALIBRATION_FIELDS}
        (root / "calibration" / "c.json").write_text(json.dumps(good_calib))
        (root / "labels_ok.json").write_text(json.dumps({"labels": [["soil", "rock"]]}))
        (root / "labels_bad.json").write_text(json.dumps({"labels": [["soil", "lava"]]}))
        (root / "left.txt").write_text("x")
        (root / "right.txt").write_text("x")

        base = {
            "stereo": {"left": "left.txt", "right": "right.txt"},
            "calibration": "calibration/c.json",
        }

        # clean single-split manifest passes.
        manifest = {"entries": [
            {**base, "scene_id": "s0", "split": "train", "labels": "labels_ok.json"},
        ]}
        (root / "manifest.json").write_text(json.dumps(manifest))
        assert validate(root / "manifest.json", root) == [], "expected clean manifest to pass"

        # leakage: same scene_id, two splits.
        manifest["entries"].append(
            {**base, "scene_id": "s0", "split": "val", "labels": "labels_ok.json"}
        )
        (root / "manifest.json").write_text(json.dumps(manifest))
        errs = validate(root / "manifest.json", root)
        assert any("leakage" in e for e in errs), "expected leakage to be caught"

        # bad label taxonomy + missing stereo file.
        manifest = {"entries": [
            {**base, "scene_id": "s1", "split": "train", "labels": "labels_bad.json"},
            {"scene_id": "s2", "split": "train", "labels": "labels_ok.json",
             "stereo": {"left": "missing.txt", "right": "right.txt"},
             "calibration": "calibration/c.json"},
        ]}
        (root / "manifest.json").write_text(json.dumps(manifest))
        errs = validate(root / "manifest.json", root)
        assert any("taxonomy" in e for e in errs), "expected bad label to be caught"
        assert any("missing file" in e for e in errs), "expected missing file to be caught"

        # calibration missing a Calibration field.
        (root / "calibration" / "bad.json").write_text(json.dumps({"baseline_m": 0.1}))
        manifest = {"entries": [
            {"scene_id": "s3", "split": "train", "labels": "labels_ok.json",
             "stereo": {"left": "left.txt", "right": "right.txt"},
             "calibration": "calibration/bad.json"},
        ]}
        (root / "manifest.json").write_text(json.dumps(manifest))
        errs = validate(root / "manifest.json", root)
        assert any("missing fields" in e for e in errs), "expected incomplete calibration to be caught"

    print("self-test ok: leakage / missing-file / bad-label / bad-calibration checks all fire")


if __name__ == "__main__":
    _self_test()
    sys.exit(main())
