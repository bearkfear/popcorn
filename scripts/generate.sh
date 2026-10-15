#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Official local plugins, pinned independently of the user's global toolchain.
cargo install --locked --root target/codegen connectrpc-codegen --version 0.9.0
cargo install --locked --root target/codegen protoc-gen-buffa --version 0.9.1
cargo install --locked --root target/codegen protoc-gen-buffa-packaging --version 0.9.1
bun node_modules/@bufbuild/buf/bin/buf lint

if [[ "${1:-}" == "--check" ]]; then
  output="$(mktemp -d)"
  trap 'rm -rf "$output"' EXIT
else
  output="."
fi
bun node_modules/@bufbuild/buf/bin/buf generate --output "$output"
rustfmt --edition 2024 \
  "$output/apps/server/src/generated/buffa/mod.rs" \
  "$output/apps/server/src/generated/connect/mod.rs"
if [[ "${1:-}" == "--check" ]]; then
  diff -ru apps/server/src/generated/buffa "$output/apps/server/src/generated/buffa"
  diff -ru apps/server/src/generated/connect "$output/apps/server/src/generated/connect"
  diff -ru packages/sdk/src/gen "$output/packages/sdk/src/gen"
fi
