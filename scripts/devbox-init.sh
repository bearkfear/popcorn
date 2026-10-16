#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -d node_modules ]]; then
  echo "Popcorn: instalando dependências Bun fixadas no lockfile..."
  bun install --frozen-lockfile
fi

echo "Popcorn Devbox pronto. Use 'devbox run doctor', 'devbox run desktop', 'devbox run web' ou 'devbox run check'."
