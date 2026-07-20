#!/usr/bin/env bash
# Deploy Party Perfect dashboard on a Linux VPS (e.g. Tulsa Server).
# Run from project root on the server after git pull.
set -euo pipefail

echo "Installing dependencies..."
npm ci

echo "Building Next.js (standalone)..."
npm run build

echo "Copying static assets into standalone bundle..."
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static

mkdir -p data
echo "Build complete. Start with: pm2 start ecosystem.config.cjs"
