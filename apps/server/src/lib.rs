//! Standalone backend bootstrap, local storage and authenticated diagnostics.
//!
//! This first increment does not implement catalog RPC, Tauri or playback.

mod bootstrap;
mod error;

pub use bootstrap::{Backend, Ready, ServerConfig, create_catalog};
pub use error::Error;
