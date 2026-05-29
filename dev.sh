#!/usr/bin/env bash
# dev.sh — run frontend + backend dev servers together
set -euo pipefail

trap 'kill 0' EXIT   # kill both children when this script exits

(cd backend  && poe dev) &
(cd frontend && bun run dev) &

wait
