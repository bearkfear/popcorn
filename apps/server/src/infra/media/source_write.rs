//! Atomic persistence of resolved torrent metadata and content bindings.

use sqlx::{Sqlite, SqlitePool, Transaction};
use uuid::Uuid;

use crate::{
    application::media::{MediaError, ResolvedSource},
    core::media::{Content, Source, SourceFile},
};

pub(super) async fn save(
    pool: &SqlitePool,
    content: Content,
    source: ResolvedSource,
) -> Result<Source, MediaError> {
    let existing: Option<String> =
        sqlx::query_scalar("SELECT source_id FROM sources WHERE info_hash = ?")
            .bind(&source.info_hash)
            .fetch_optional(pool)
            .await?;
    let source_id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());
    let mut transaction = pool.begin().await?;
    sqlx::query(
        "INSERT INTO sources (source_id, info_hash, magnet, torrent_file, state, created_at)
         VALUES (?, ?, ?, ?, 1, unixepoch())
         ON CONFLICT(info_hash) DO UPDATE SET state = 1",
    )
    .bind(&source_id)
    .bind(&source.info_hash)
    .bind(source.magnet)
    .bind(source.torrent)
    .execute(&mut *transaction)
    .await?;
    let (kind, season, episode) = super::sources::binding(&content);
    sqlx::query(
        "INSERT OR IGNORE INTO source_bindings
         (source_id, media_type, tmdb_id, season_number, episode_number)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&source_id)
    .bind(kind)
    .bind(content.tmdb_id())
    .bind(season)
    .bind(episode)
    .execute(&mut *transaction)
    .await?;
    write_files(&mut transaction, &source_id, &source.files).await?;
    transaction.commit().await?;
    Ok(Source {
        id: source_id,
        content,
        files: source.files,
    })
}

async fn write_files(
    transaction: &mut Transaction<'_, Sqlite>,
    source_id: &str,
    files: &[SourceFile],
) -> Result<(), MediaError> {
    for file in files {
        sqlx::query(
            "INSERT OR REPLACE INTO source_files
             (source_id, file_index, name, size_bytes, likely_media) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(source_id)
        .bind(file.file_index)
        .bind(&file.name)
        .bind(i64::try_from(file.size_bytes).map_err(|_| MediaError::Invalid)?)
        .bind(file.likely_media)
        .execute(&mut **transaction)
        .await?;
    }
    Ok(())
}
