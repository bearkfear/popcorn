//! Constructs the media application from `SQLite` sources, the torrent engine and the disk cache.

use super::{DiskCache, SqliteSources, TorrentEngine};
use std::path::Path;

use sqlx::SqlitePool;

use crate::application::media::MediaContext;

pub(crate) type MediaApplication = MediaContext<SqliteSources, TorrentEngine, DiskCache>;

pub(crate) fn media_application(
    pool: SqlitePool,
    data_dir: &Path,
    address: String,
) -> MediaApplication {
    let downloads = data_dir.join("downloads");
    MediaContext::new(
        SqliteSources::new(pool.clone()),
        TorrentEngine::new(downloads.clone(), address),
        DiskCache::new(pool, downloads),
    )
}
