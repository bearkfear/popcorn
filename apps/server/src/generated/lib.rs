//! Public Protobuf messages and Connect service contracts generated from `proto/`.
//!
//! Regenerate with `bun run generate`; verify with `bun run generate:check`.

/// Official Buffa message types, views and enum contracts.
#[path = "buffa/mod.rs"]
pub mod proto;

/// Official Connect service traits, router registration and clients.
#[path = "connect/mod.rs"]
pub mod catalog;
