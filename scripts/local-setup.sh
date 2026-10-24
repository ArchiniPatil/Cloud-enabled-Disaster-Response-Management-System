#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export npm_config_cache="${npm_config_cache:-$PWD/.local/npm-cache}"
npm ci
if [ ! -f .env ]; then cp .env.example .env; chmod 600 .env; fi
docker compose up -d --wait db
AUTH_MODE=demo npm run db:migrate
AUTH_MODE=demo npm run db:seed
test_database_exists=$(docker compose exec -T db psql -U response -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='response_test'")
if [ "$test_database_exists" != "1" ]; then
  docker compose exec -T db createdb -U response response_test
fi
