#!/usr/bin/env bash
set -uo pipefail

cd "$(dirname "$0")/.."

errors=0
warnings=0

pass() {
  printf 'ok   %s\n' "$1"
}

fail() {
  printf 'erro %s\n' "$1" >&2
  errors=$((errors + 1))
}

warn() {
  printf 'aviso %s\n' "$1" >&2
  warnings=$((warnings + 1))
}

require_command() {
  local command_name="$1"
  if command -v "$command_name" >/dev/null 2>&1; then
    pass "$command_name: $(command -v "$command_name")"
  else
    fail "$command_name não está disponível no PATH"
  fi
}

require_pkg_config() {
  local module="$1"
  if pkg-config --exists "$module" 2>/dev/null; then
    pass "$module: $(pkg-config --modversion "$module")"
  else
    fail "pkg-config não encontrou $module"
  fi
}

echo "Popcorn development environment"
require_command bun
require_command cargo
require_command rustc
require_command rustfmt
require_command cargo-clippy
require_command cc
require_command gst-inspect-1.0
require_command pkg-config

if command -v bun >/dev/null 2>&1; then
  bun_version="$(bun --version)"
  if [[ "$bun_version" == 1.3.* ]]; then
    pass "Bun $bun_version (linha 1.3 exigida pelo projeto)"
  else
    fail "Bun $bun_version encontrado; o projeto exige Bun 1.3.x"
  fi
fi

if command -v rustc >/dev/null 2>&1; then
  rust_version="$(rustc --version | awk '{print $2}')"
  if [[ "$rust_version" == 1.94.* ]]; then
    pass "Rust $rust_version"
  else
    fail "Rust $rust_version encontrado; o workspace exige Rust 1.94.x"
  fi
fi

if command -v pkg-config >/dev/null 2>&1; then
  require_pkg_config webkit2gtk-4.1
  require_pkg_config openssl
  require_pkg_config librsvg-2.0
fi

if command -v gst-inspect-1.0 >/dev/null 2>&1; then
  if gst-inspect-1.0 appsink >/dev/null 2>&1; then
    pass "GStreamer appsink disponível"
  else
    fail "GStreamer não encontrou o elemento appsink"
  fi
fi

if grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null; then
  pass "WSL detectado"
  if [[ -n "${WAYLAND_DISPLAY:-}" || -n "${DISPLAY:-}" ]]; then
    pass "sessão gráfica WSLg disponível"
  else
    warn "DISPLAY/WAYLAND_DISPLAY ausentes; janelas Tauri não poderão abrir"
  fi
fi

if [[ "$(uname -s)" == "Linux" ]]; then
  pass "FFmpeg/ffprobe Linux x64 são preparados pelo hook do Tauri"
fi

if ((errors > 0)); then
  printf '\nDiagnóstico: %d erro(s), %d aviso(s).\n' "$errors" "$warnings" >&2
  exit 1
fi

printf '\nDiagnóstico: ambiente válido, %d aviso(s).\n' "$warnings"
