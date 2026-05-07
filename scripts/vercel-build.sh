#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
npm ci
npm run build
mkdir -p dist/vercel-bundle/mythic-archive
cp -R "$ROOT/docs/mythic-archive/." dist/vercel-bundle/mythic-archive/
cp "$ROOT/backend/data/sheets.json" dist/vercel-bundle/sheets.json
cd "$ROOT/frontend"
npm ci
npm run build
