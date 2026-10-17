#!/usr/bin/env bash
set -euo pipefail
# Render supplies this HTTPS origin. Other hosts must set both public URL variables.
if [[ -n "${RENDER_EXTERNAL_URL:-}" ]]; then
  export BETTER_AUTH_URL="${BETTER_AUTH_URL:-$RENDER_EXTERNAL_URL}"
  export WEB_ORIGIN="${WEB_ORIGIN:-$RENDER_EXTERNAL_URL}"
fi
export OPENBLAS_NUM_THREADS=1
export OMP_NUM_THREADS=1
export MKL_NUM_THREADS=1
python -m uvicorn app.main:app --app-dir py --host 127.0.0.1 --port 8000 &
python_pid=$!
node --import tsx api/src/map-server.ts &
node_pid=$!
trap 'kill "$python_pid" "$node_pid" 2>/dev/null || true; wait || true' EXIT
trap 'exit 143' TERM INT
# A failed child must fail the container so the host can restart both services.
wait -n "$python_pid" "$node_pid"
exit 1
