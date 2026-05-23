#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[AITimeMachine] starting backend on :8000 and frontend on :5173"

# 1) backend
(
  cd backend
  if [ ! -f .env ]; then
    echo "缺少 backend/.env，先拷贝模板：cp backend/.env.example backend/.env 并填入 API key"
    cp .env.example .env
  fi
  # 优先使用 uv，没有则用 python -m venv
  if command -v uv >/dev/null 2>&1; then
    uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
  else
    if [ ! -d .venv ]; then
      python3 -m venv .venv
      .venv/bin/pip install -e .
    fi
    .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
  fi
) &
BACK_PID=$!

# 2) frontend
(
  cd frontend
  if [ ! -d node_modules ]; then
    npm install
  fi
  npm run dev
) &
FRONT_PID=$!

trap "echo '[stopping]'; kill $BACK_PID $FRONT_PID 2>/dev/null || true" INT TERM
wait
