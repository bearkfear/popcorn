//! Declares media use cases and ports and reexports context, request and error types.

pub mod commands;
pub mod context;
pub mod error;
pub mod ports;
pub mod queries;

pub(crate) use commands::{AddSource, StartPlayback};
pub(crate) use context::MediaContext;
pub(crate) use error::MediaError;
pub(crate) use ports::{
    AccessError, Cache, ConvertedAccess, MediaAccess, PlaybackFile, ResolvedSource, Sources,
    Transfers,
};
