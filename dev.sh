#!/usr/bin/env bash
# dev.sh — run frontend + backend dev servers together
set -euo pipefail

pids=()

cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]}"; do
    # kill each child's process group to catch grandchildren (uvicorn, vite)
    kill -- -"$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# setsid: give each server its own process group so we can kill the whole tree
setsid bash -c 'cd backend  && exec poe dev' &
pids+=($!)
setsid bash -c 'cd frontend && exec bun run dev' &
pids+=($!)

wait
