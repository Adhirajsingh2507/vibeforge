# TerraSight — Directory Ownership

Authoritative owners. No agent modifies another subsystem without explicit
coordination. Mirrors the ownership table in root `CLAUDE.md`.

| Path | Owner |
|------|-------|
| `backend/app/perception/` | perception-agent |
| `backend/app/depth/` | stereo-depth-agent |
| `backend/app/slam/` | slam-mapping-agent |
| `backend/app/terrain/` | terrain-intelligence-agent |
| `backend/app/scoring.py`, `backend/app/guards.py` | terrain-intelligence-agent (decision layer) |
| `backend/app/main.py`, `backend/app/pipeline.py`, `backend/app/contracts.py` | backend-agent |
| `backend/app/db.py`, `backend/supabase/` | database-agent |
| `backend/mock/`, `backend/gen_mock.py` | dataset-agent |
| `backend/tests/`, `scripts/validate-terrasight.sh` | testing-agent |
| `frontend/` | frontend |
| `.github/`, `Dockerfile`, `docker-compose.yml`, `vercel.json` | devops-agent |

`backend/app/contracts.py` is the shared internal-handoff schema — changes ripple
across perception/depth/slam/terrain, so treat edits as cross-agent.

`backend/app/scoring.py` is the sole decision layer: only terrain-intelligence-agent
touches it, and only with safety-agent / architecture-guardian review. Measurement
stages never import a decision from it beyond handing over a fully-built `Cell`.

The frozen API contract (`main.py` shapes) is changed only deliberately, with
`tests/test_contract.py` updated in the same change.
