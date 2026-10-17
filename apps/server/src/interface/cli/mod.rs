//! Declares standalone and sidecar adapters and reexports CLI dispatch.

mod dispatch;
mod sidecar;
mod standalone;

pub use dispatch::run;
use dispatch::{emit_ready, with_tmdb_environment};
