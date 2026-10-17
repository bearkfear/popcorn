# Server lint gate

Run `bun run lint:server` from the repository root. It runs, in order:

```sh
bun scripts/lint-server.ts
cargo fmt --manifest-path apps/server/Cargo.toml -p popcorn-server --check
CLIPPY_CONF_DIR="$PWD/apps/server" cargo clippy -p popcorn-server --lib --bins -- -D warnings
```

The dependency-free structural script resolves paths from its own location.
Every Rust file under `apps/server/src` must have at most 250 physical lines,
including blank lines, comments, and handwritten tests, and a meaningful first-line
`//` or `//!` comment. Only `apps/server/src/generated` is excluded.

Handwritten `mod.rs` files may contain only documentation, attributes, external
module declarations and imports/reexports. Definitions, implementations, inline
modules and implementation macros belong in descriptively named files. See
[ADR 0001](../docs/adr/0001-backend-file-responsibilities.md). The script checks
syntax structure; reviewers assess whether each header accurately describes its file.

In `src/core.rs` and `src/core/**`, imports (including grouped imports and
reexports) and qualified paths may not reference `application`, `infra`,
`interface`, `sqlx`, `axum`, `reqwest`, `librqbit`, or `popcorn_proto`.
This is a lexical dependency check, not Rust name resolution; comments and
literals are ignored.

The application layer has the same external dependency restrictions, while it
may depend on core and sibling application modules. Handwritten server tests
belong exclusively in core.

Interface adapters may use HTTP and Protobuf, but cannot import infrastructure,
SQLx, reqwest, or librqbit. Bootstrap alone selects concrete implementations.

Clippy owns function-length analysis with `too-many-lines-threshold = 60`.
The server crate must enable `deny(clippy::too_many_lines)`. Clippy targets only
the server library and binaries, not tests; the structural check still includes
handwritten tests. Formatting is restricted to the server package.

# Cache quota regression

Run `cargo build -p popcorn-server` and then `python3 scripts/test-cache-limit.py`.
The test starts the real server with isolated temporary data and sparse files. It
checks immediate eviction when reducing 20 to 4 GB, oldest-entry removal, retained
files when increasing the limit, invalid limits, symlink safety, active playback
protection, and successful reduction after playback stops. It does not use the
application's data directory.
