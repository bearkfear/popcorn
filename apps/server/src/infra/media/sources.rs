//! `SQLite` reads and source lifecycle persistence.

use sqlx::{Row, SqlitePool};

use crate::{
    application::media::{MediaError, PlaybackFile, ResolvedSource, Sources},
    core::media::{Content, Coordinates, MediaKind, Source, SourceFile},
};

#[derive(Debug)]
pub(crate) struct SqliteSources {
    pub(super) pool: SqlitePool,
}

impl SqliteSources {
    pub(super) const fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl From<sqlx::Error> for MediaError {
    fn from(error: sqlx::Error) -> Self {
        Self::Database(Box::new(error))
    }
}

pub(super) const fn binding(content: &Content) -> (i32, Option<u32>, Option<u32>) {
    let kind = match content.kind() {
        MediaKind::Movie => 1,
        MediaKind::Tv => 2,
    };
    let (season, episode) = match content.coordinates() {
        Coordinates::Title => (None, None),
        Coordinates::Episode { season, episode } => (Some(season), Some(episode)),
    };
    (kind, season, episode)
}

impl Sources for SqliteSources {
    async fn export_catalog(
        &self,
        name: String,
        description: String,
    ) -> Result<String, MediaError> {
        self.export_archive(name, description).await
    }
    async fn preview_catalog(
        &self,
        catalog: crate::core::media::archive::SourceCatalog,
    ) -> Result<crate::application::media::source_catalog::CatalogPreview, MediaError> {
        self.preview_archive(catalog).await
    }
    async fn import_catalog(
        &self,
        catalog: crate::core::media::archive::SourceCatalog,
        replace: bool,
        revision: &str,
    ) -> Result<crate::application::media::source_catalog::CatalogPreview, MediaError> {
        self.import_archive(catalog, replace, revision).await
    }

    async fn save(&self, content: Content, source: ResolvedSource) -> Result<Source, MediaError> {
        super::source_write::save(&self.pool, content, source).await
    }

    async fn list(&self, content: &Content) -> Result<Vec<Source>, MediaError> {
        let (kind, season, episode) = binding(content);
        let rows = sqlx::query(
            "SELECT s.source_id, f.file_index, f.name, f.size_bytes, f.likely_media
             FROM sources s
             JOIN source_bindings b ON b.source_id = s.source_id
             LEFT JOIN source_files f ON f.source_id = s.source_id
             WHERE s.state = 1 AND b.media_type = ? AND b.tmdb_id = ?
               AND b.season_number IS ? AND b.episode_number IS ?
             ORDER BY s.created_at, f.file_index",
        )
        .bind(kind)
        .bind(content.tmdb_id())
        .bind(season)
        .bind(episode)
        .fetch_all(&self.pool)
        .await?;
        let mut sources: Vec<Source> = Vec::new();
        for row in rows {
            let id: String = row.try_get("source_id")?;
            if sources.last().is_none_or(|source| source.id != id) {
                sources.push(Source {
                    id,
                    content: content.clone(),
                    files: Vec::new(),
                });
            }
            if let Some(index) = row.try_get::<Option<i64>, _>("file_index")? {
                let source = sources.last_mut().ok_or(MediaError::Unavailable)?;
                source.files.push(SourceFile {
                    file_index: u32::try_from(index).map_err(|_| MediaError::Invalid)?,
                    name: row.try_get("name")?,
                    size_bytes: u64::try_from(row.try_get::<i64, _>("size_bytes")?)
                        .map_err(|_| MediaError::Invalid)?,
                    likely_media: row.try_get("likely_media")?,
                });
            }
        }
        Ok(sources)
    }

    async fn remove(&self, source_id: &str) -> Result<(), MediaError> {
        let result = sqlx::query("UPDATE sources SET state = 3 WHERE source_id = ? AND state = 1")
            .bind(source_id)
            .execute(&self.pool)
            .await?;
        if result.rows_affected() == 0 {
            return Err(MediaError::NotFound);
        }
        Ok(())
    }

    async fn playback_file(
        &self,
        source_id: &str,
        file_index: u32,
    ) -> Result<PlaybackFile, MediaError> {
        let row = sqlx::query(
            "SELECT s.torrent_file, f.name, f.size_bytes
             FROM sources s JOIN source_files f ON f.source_id = s.source_id
             WHERE s.source_id = ? AND s.state = 1 AND f.file_index = ?",
        )
        .bind(source_id)
        .bind(file_index)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(MediaError::NotFound)?;
        Ok(PlaybackFile {
            torrent: row.try_get("torrent_file")?,
            name: row.try_get("name")?,
            size: u64::try_from(row.try_get::<i64, _>("size_bytes")?)
                .map_err(|_| MediaError::Invalid)?,
        })
    }
}
