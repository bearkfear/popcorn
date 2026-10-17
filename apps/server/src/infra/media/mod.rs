//! Declares media infrastructure modules and reexports concrete adapters and their composition.

pub mod cache;
pub mod composition;
mod conversion_reader;
mod conversion_start;
mod encoding;
mod inspection;
mod output;
mod preparation;
mod probe;
mod read_metrics;
mod reader;
mod source_ready;
pub mod source_write;
pub mod sources;
mod tools;
pub mod transfer_control;
mod transfer_conversion;
pub mod transfer_playback;
pub mod transfer_source;
pub mod transfer_stream;
pub mod transfers;

pub(crate) use cache::DiskCache;
pub(crate) use composition::{MediaApplication, media_application};
pub(crate) use sources::SqliteSources;
pub(crate) use transfers::TorrentEngine;
