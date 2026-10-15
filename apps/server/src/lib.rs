//! Exposes backend composition while keeping domain, application and adapters separate.

#![deny(clippy::too_many_lines)]

pub mod application;
mod bootstrap;
pub mod core;
pub mod infra;
pub mod interface;

pub use bootstrap::{Backend, Error, Ready, ServerConfig};
pub use infra::catalog::create_catalog;
pub use interface::cli::run as run_cli;
