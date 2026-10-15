//! Concrete `SQLite`, torrent and disk adapters for media use cases.

pub mod cache;
mod conversion_reader;
mod encoding;
mod preparation;
mod probe;
mod reader;
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
pub(crate) use sources::SqliteSources;
pub(crate) use transfers::TorrentEngine;

use std::path::Path;

use sqlx::SqlitePool;

use crate::application::media::MediaService;

pub(crate) type MediaApplication = MediaService<SqliteSources, TorrentEngine, DiskCache>;

pub(crate) fn media_application(
    pool: SqlitePool,
    data_dir: &Path,
    address: String,
) -> MediaApplication {
    let downloads = data_dir.join("downloads");
    MediaService::new(
        SqliteSources::new(pool.clone()),
        TorrentEngine::new(downloads.clone(), address),
        DiskCache::new(pool, downloads),
    )
}
