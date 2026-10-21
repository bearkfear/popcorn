//! Declares HTTP, RPC and CLI adapters and reexports routing, access policy and health state.

pub mod access;
pub(crate) mod browser;
mod browser_assets;
mod browser_diagnostics;
mod browser_pairing;
mod browser_player;
pub mod cli;
mod diagnostics;
pub mod health;
pub mod media;
pub mod router;
pub mod rpc;

pub(crate) use access::AccessPolicy;
pub(crate) use health::HealthState;
pub(crate) use router::router;
