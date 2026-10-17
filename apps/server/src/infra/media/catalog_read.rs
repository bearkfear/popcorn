//! Reads a consistent source catalog snapshot and computes import previews and revisions.

use crate::{
    application::media::{MediaError, source_catalog::CatalogPreview},
    core::media::archive::{CatalogBinding, CatalogSource, MAX_ARCHIVE_BYTES, SourceCatalog},
};
use base64::{Engine, prelude::BASE64_STANDARD};
use sqlx::{Row, SqliteConnection};
use std::{
    collections::{HashMap, HashSet},
    hash::{DefaultHasher, Hash, Hasher},
};

pub(super) struct StoredSource {
    pub(super) entry: CatalogSource,
    pub(super) active: bool,
}

pub(super) async fn snapshot(
    connection: &mut SqliteConnection,
    include_torrents: bool,
) -> Result<Vec<StoredSource>, MediaError> {
    let rows = sqlx::query(
        "SELECT source_id, info_hash, state,
                CASE WHEN ? AND state = 1 THEN torrent_file ELSE NULL END AS torrent_file
         FROM sources ORDER BY info_hash",
    )
    .bind(include_torrents)
    .fetch_all(&mut *connection)
    .await?;
    let mut sources = Vec::new();
    let mut ids = HashMap::new();
    let mut bytes = 0;
    for row in rows {
        let torrent: Option<Vec<u8>> = row.try_get("torrent_file")?;
        let torrent = torrent.unwrap_or_default();
        bytes += torrent.len();
        if bytes > MAX_ARCHIVE_BYTES {
            return Err(MediaError::Invalid);
        }
        ids.insert(row.try_get::<String, _>("source_id")?, sources.len());
        sources.push(StoredSource {
            entry: CatalogSource {
                info_hash: row.try_get("info_hash")?,
                torrent_base64: BASE64_STANDARD.encode(torrent),
                bindings: Vec::new(),
            },
            active: row.try_get::<i32, _>("state")? == 1,
        });
    }
    read_bindings(connection, &ids, &mut sources).await?;
    Ok(sources)
}

async fn read_bindings(
    connection: &mut SqliteConnection,
    ids: &HashMap<String, usize>,
    sources: &mut [StoredSource],
) -> Result<(), MediaError> {
    let rows = sqlx::query(
        "SELECT source_id, media_type, tmdb_id, season_number, episode_number
         FROM source_bindings ORDER BY media_type, tmdb_id, season_number, episode_number",
    )
    .fetch_all(connection)
    .await?;
    for row in rows {
        let id: String = row.try_get("source_id")?;
        let source = sources
            .get_mut(*ids.get(&id).ok_or(MediaError::Invalid)?)
            .ok_or(MediaError::Invalid)?;
        source.entry.bindings.push(CatalogBinding {
            media_type: if row.try_get::<i32, _>("media_type")? == 1 {
                "movie"
            } else {
                "tv"
            }
            .to_owned(),
            tmdb_id: row.try_get("tmdb_id")?,
            season_number: row.try_get("season_number")?,
            episode_number: row.try_get("episode_number")?,
        });
    }
    Ok(())
}

pub(super) fn preview(
    catalog: &SourceCatalog,
    local: &[StoredSource],
) -> Result<CatalogPreview, MediaError> {
    let known: HashMap<_, _> = local
        .iter()
        .map(|source| (&source.entry.info_hash, source.active))
        .collect();
    let titles: HashSet<_> = catalog
        .sources
        .iter()
        .flat_map(|source| &source.bindings)
        .map(|binding| (&binding.media_type, binding.tmdb_id))
        .collect();
    let mut result = CatalogPreview {
        name: catalog.name.clone(),
        sources: count(catalog.sources.len())?,
        bindings: count(
            catalog
                .sources
                .iter()
                .map(|source| source.bindings.len())
                .sum(),
        )?,
        movies: count(
            titles
                .iter()
                .filter(|(kind, _)| kind.as_str() == "movie")
                .count(),
        )?,
        series: count(
            titles
                .iter()
                .filter(|(kind, _)| kind.as_str() == "tv")
                .count(),
        )?,
        local_sources: count(local.iter().filter(|source| source.active).count())?,
        revision: revision(local),
        ..Default::default()
    };
    for source in &catalog.sources {
        match known.get(&source.info_hash) {
            Some(true) => result.existing_sources += 1,
            Some(false) => result.reactivated_sources += 1,
            None => {}
        }
    }
    Ok(result)
}

fn revision(local: &[StoredSource]) -> String {
    let mut hasher = DefaultHasher::new();
    for source in local {
        source.active.hash(&mut hasher);
        source.entry.info_hash.hash(&mut hasher);
        source.entry.bindings.hash(&mut hasher);
    }
    format!("{:016x}", hasher.finish())
}

fn count(value: usize) -> Result<u32, MediaError> {
    u32::try_from(value).map_err(|_| MediaError::Invalid)
}
