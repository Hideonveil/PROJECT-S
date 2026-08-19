#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

if [ -z "${APP_VERSION:-}" ]; then
  APP_VERSION=$(git -C "$SCRIPT_DIR/../.." rev-parse --short HEAD 2>/dev/null || printf 'unknown')
fi
export APP_VERSION

if [ ! -f .env.production ]; then
  echo "Missing deploy/china-hk/.env.production" >&2
  exit 1
fi

docker compose --env-file .env.production build
docker compose --env-file .env.production up -d --remove-orphans
docker compose --env-file .env.production ps
