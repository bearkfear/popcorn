#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Build the shipped empty snapshot through the CLI, never through app startup.
output="$(mktemp -d)"
trap 'rm -rf "$output"' EXIT
cargo run --locked -p popcorn-server -- init-catalog --output "$output/catalog.sqlite"
install -m 0644 "$output/catalog.sqlite" resources/catalog.sqlite
