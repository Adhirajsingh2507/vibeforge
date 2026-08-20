#!/usr/bin/env bash
# TerraSight local validation gate. Fails on first error. Deploys nothing.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
PY="${PYTHON:-python3}"

step() { echo; echo "==> $1"; }

# ---------------------------------------------------------------- Python syntax
step "Python syntax check"
find "$BACKEND" -name '*.py' -not -path '*/__pycache__/*' -print0 \
  | xargs -0 "$PY" -m py_compile
echo "syntax ok"

# ------------------------------------------------------------------ App imports
step "Backend import check"
( cd "$BACKEND" && "$PY" -c "import app.main; import app.db; import app.scoring; print('imports ok')" )

# --------------------------------------------------------------- Scoring tests
step "Scoring self-check"
( cd "$BACKEND" && "$PY" -m app.scoring )

step "Safety regression suite"
( cd "$BACKEND" && "$PY" tests/test_safety_regression.py )

# --------------------------------------------------- Perception pipeline (P0/P1)
step "Pipeline stage self-checks"
( cd "$BACKEND" && for m in app.perception.segment app.depth.pipeline \
    app.depth.stereo app.slam.pose app.slam.fuse app.slam.fixture_check \
    app.terrain.assemble; do "$PY" -m "$m"; done )

step "Fixture + end-to-end pipeline"
( cd "$BACKEND" && "$PY" tests/test_fixtures.py && "$PY" tests/test_pipeline.py )

step "Dataset ingestion validator"
( cd "$BACKEND" && "$PY" data/validate_dataset.py )

# ---------------------------------------------------------- API contract tests
step "API contract shape check"
( cd "$BACKEND" && "$PY" tests/test_contract.py )

# --------------------------------------------------------------- Frontend build
if [ -f "$FRONTEND/package.json" ]; then
  step "Frontend build"
  if [ -d "$FRONTEND/node_modules" ]; then
    ( cd "$FRONTEND" && npm run build )
  else
    echo "SKIP: frontend/node_modules missing (run 'npm ci' in frontend/)"
  fi
else
  step "Frontend build"; echo "SKIP: no frontend present"
fi

# ------------------------------------------------------------ Git diff sanity
step "Git diff sanity"
# Unresolved merge-conflict markers in tracked files.
if git -C "$ROOT" grep -nE '^(<<<<<<<|=======|>>>>>>>)' -- ':!scripts/validate-terrasight.sh' >/tmp/ts_conflicts 2>/dev/null; then
  echo "FAIL: merge conflict markers found:"; cat /tmp/ts_conflicts; exit 1
fi
# Service-role key must never be committed (see CLAUDE.md).
if git -C "$ROOT" grep -nI 'SUPABASE_SERVICE_ROLE_KEY[[:space:]]*=[[:space:]]*[A-Za-z0-9._-]\{20,\}' >/tmp/ts_secret 2>/dev/null; then
  echo "FAIL: committed service-role key:"; cat /tmp/ts_secret; exit 1
fi
echo "git sanity ok"

echo
echo "======================================"
echo "  PASS — all TerraSight checks passed"
echo "======================================"
