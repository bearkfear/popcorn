//! Atomically merges or replaces source bindings while preserving source identities and user data.

use crate::application::media::{MediaError, source_catalog::PreparedCatalogSource};
use sqlx::{Sqlite, Transaction};
use uuid::Uuid;

pub(super) async fn apply(
    transaction: &mut Transaction<'_, Sqlite>,
    sources: Vec<PreparedCatalogSource>,
    replace: bool,
) -> Result<(), MediaError> {
    if replace {
        sqlx::query("DELETE FROM source_bindings")
            .execute(&mut **transaction)
            .await?;
        sqlx::query("UPDATE sources SET state = 3")
            .execute(&mut **transaction)
            .await?;
    }
    for prepared in sources {
        let source = prepared.source;
        let existing: Option<String> =
            sqlx::query_scalar("SELECT source_id FROM sources WHERE info_hash = ?")
                .bind(&source.info_hash)
                .fetch_optional(&mut **transaction)
                .await?;
        let id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());
        sqlx::query(
            "INSERT INTO sources (source_id, info_hash, magnet, torrent_file, state, created_at)
             VALUES (?, ?, NULL, ?, 1, unixepoch()) ON CONFLICT(info_hash) DO UPDATE SET state = 1",
        )
        .bind(&id)
        .bind(&source.info_hash)
        .bind(&source.torrent)
        .execute(&mut **transaction)
        .await?;
        super::source_write::write_files(transaction, &id, &source.files).await?;
        for content in prepared.bindings {
            let (kind, season, episode) = super::sources::binding(&content);
            sqlx::query(
                "INSERT OR IGNORE INTO source_bindings
                 (source_id, media_type, tmdb_id, season_number, episode_number) VALUES (?, ?, ?, ?, ?)"
            ).bind(&id).bind(kind).bind(content.tmdb_id()).bind(season).bind(episode)
                .execute(&mut **transaction).await?;
        }
    }
    Ok(())
}
