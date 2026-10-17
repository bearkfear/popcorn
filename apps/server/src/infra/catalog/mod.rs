//! Declares snapshot and TMDB adapters and reexports catalog lifecycle and snapshot access.

mod error;
pub mod lifecycle;
pub mod snapshot;
pub mod tmdb;

pub use lifecycle::create_catalog;
pub(crate) use lifecycle::open;
pub(crate) use snapshot::SqliteSnapshot;
