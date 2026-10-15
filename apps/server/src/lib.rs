//! Local backend, authenticated catalog RPC and cached TMDB metadata.

mod bootstrap;
mod error;
// The transport module uses these crate-visible domain types without exposing
// the implementation from the public library API.
#[allow(clippy::redundant_pub_crate)]
pub(crate) mod source;
// These types are shared by sibling backend modules but are not part of the public crate API.
#[allow(clippy::redundant_pub_crate)]
pub(crate) mod tmdb;

pub use bootstrap::{Backend, Ready, ServerConfig, create_catalog};
pub use error::Error;
