#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# TerraSight Auto-Sync Script
# Watches the GitHub remote for changes and auto-pulls to local codebase.
#
# Usage:
#   ./scripts/auto-sync.sh start   # Start background sync daemon
#   ./scripts/auto-sync.sh stop    # Stop the daemon
#   ./scripts/auto-sync.sh status  # Check if daemon is running
#   ./scripts/auto-sync.sh once    # Run a single sync (no daemon)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$SCRIPT_DIR/.auto-sync.pid"
LOG_FILE="$SCRIPT_DIR/sync.log"
SYNC_INTERVAL="${SYNC_INTERVAL:-60}"       # seconds between checks (default 60)
REMOTE="${SYNC_REMOTE:-origin}"
BRANCH="${SYNC_BRANCH:-main}"

# ── Logging ──────────────────────────────────────────────────────────────────
log() {
  local ts
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  echo "[$ts] $*" | tee -a "$LOG_FILE"
}

log_err() {
  log "ERROR: $*" >&2
}

# ── Core sync logic ─────────────────────────────────────────────────────────
do_sync() {
  cd "$REPO_DIR"

  # Fetch remote
  if ! git fetch "$REMOTE" "$BRANCH" 2>>"$LOG_FILE"; then
    log_err "git fetch failed — check network or remote config"
    return 1
  fi

  local LOCAL_SHA REMOTE_SHA
  LOCAL_SHA="$(git rev-parse HEAD)"
  REMOTE_SHA="$(git rev-parse "$REMOTE/$BRANCH")"

  if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
    log "✓ Already up-to-date ($LOCAL_SHA)"
    return 0
  fi

  log "⬇ Remote has new commits ($LOCAL_SHA → $REMOTE_SHA)"

  # Check for uncommitted changes
  if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    log "⚠ Local changes detected — stashing before pull"
    git stash push -m "auto-sync-stash-$(date +%s)" 2>>"$LOG_FILE"
    local STASHED=1
  else
    local STASHED=0
  fi

  # Try rebase pull
  if git pull --rebase "$REMOTE" "$BRANCH" 2>>"$LOG_FILE"; then
    log "✓ Pulled and rebased successfully"
  else
    log_err "Rebase failed — aborting rebase and resetting"
    git rebase --abort 2>/dev/null || true
    git reset --hard "$LOCAL_SHA" 2>>"$LOG_FILE"
    log "↺ Reset to $LOCAL_SHA — manual intervention needed"
  fi

  # Re-apply stash if we stashed
  if [ "$STASHED" -eq 1 ]; then
    if git stash pop 2>>"$LOG_FILE"; then
      log "✓ Re-applied stashed changes"
    else
      log_err "Stash pop had conflicts — your changes are in 'git stash list'"
    fi
  fi
}

# ── Daemon management ────────────────────────────────────────────────────────
start_daemon() {
  if [ -f "$PID_FILE" ]; then
    local OLD_PID
    OLD_PID="$(cat "$PID_FILE")"
    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "Auto-sync is already running (PID $OLD_PID)"
      return 0
    fi
    rm -f "$PID_FILE"
  fi

  log "▶ Starting auto-sync daemon (interval=${SYNC_INTERVAL}s, remote=$REMOTE/$BRANCH)"

  # Run in background
  (
    trap 'log "■ Daemon stopped"; rm -f "$PID_FILE"; exit 0' SIGTERM SIGINT

    while true; do
      do_sync || true
      sleep "$SYNC_INTERVAL"
    done
  ) &

  local DAEMON_PID=$!
  echo "$DAEMON_PID" > "$PID_FILE"
  echo "Auto-sync started (PID $DAEMON_PID, interval ${SYNC_INTERVAL}s)"
  echo "Logs: $LOG_FILE"
}

stop_daemon() {
  if [ ! -f "$PID_FILE" ]; then
    echo "Auto-sync is not running"
    return 0
  fi

  local PID
  PID="$(cat "$PID_FILE")"
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    rm -f "$PID_FILE"
    log "■ Stopped auto-sync daemon (PID $PID)"
    echo "Auto-sync stopped"
  else
    rm -f "$PID_FILE"
    echo "Auto-sync was not running (stale PID file cleaned)"
  fi
}

show_status() {
  if [ -f "$PID_FILE" ]; then
    local PID
    PID="$(cat "$PID_FILE")"
    if kill -0 "$PID" 2>/dev/null; then
      echo "Auto-sync is RUNNING (PID $PID, interval ${SYNC_INTERVAL}s)"
      echo "Remote: $REMOTE/$BRANCH"
      echo "Logs:   $LOG_FILE"
      if [ -f "$LOG_FILE" ]; then
        echo ""
        echo "Last 5 log entries:"
        tail -5 "$LOG_FILE"
      fi
      return 0
    fi
  fi
  echo "Auto-sync is NOT running"
}

# ── Entry point ──────────────────────────────────────────────────────────────
case "${1:-help}" in
  start)   start_daemon ;;
  stop)    stop_daemon ;;
  status)  show_status ;;
  once)    do_sync ;;
  help|*)
    echo "Usage: $0 {start|stop|status|once}"
    echo ""
    echo "  start   — Start background sync daemon"
    echo "  stop    — Stop the daemon"
    echo "  status  — Show daemon status and recent logs"
    echo "  once    — Run a single sync check"
    echo ""
    echo "Environment variables:"
    echo "  SYNC_INTERVAL  Seconds between checks (default: 60)"
    echo "  SYNC_REMOTE    Git remote name (default: origin)"
    echo "  SYNC_BRANCH    Branch to sync (default: main)"
    ;;
esac
