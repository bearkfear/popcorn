//! `SQLite` implementation of immutable catalog snapshot queries.
use crate::application::catalog::{
    ports::SnapshotQueries,
    queries::{ListTitles, SnapshotPage},
};
use crate::core::catalog::{CatalogError, Cursor, TitleData, TitleId};
use sqlx::SqlitePool;
#[derive(Debug)]
pub(crate) struct SqliteSnapshot {
    pool: SqlitePool,
}
impl SqliteSnapshot {
    pub(crate) const fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}
#[derive(Debug, sqlx::FromRow)]
struct CatalogTitle {
    media_type: i32,
    tmdb_id: u32,
    title: String,
    overview: String,
    release_year: u32,
}
impl From<CatalogTitle> for TitleData {
    fn from(r: CatalogTitle) -> Self {
        Self {
            media_type: u32::try_from(r.media_type).unwrap_or_default(),
            tmdb_id: r.tmdb_id,
            title: r.title,
            overview: r.overview,
            release_year: r.release_year,
            poster_url: String::new(),
            backdrop_url: String::new(),
            vote_average: 0.0,
            genres: Vec::new(),
            cast: Vec::new(),
            runtime_minutes: 0,
            seasons: Vec::new(),
            trailer_key: String::new(),
        }
    }
}
impl SnapshotQueries for SqliteSnapshot {
    async fn list(&self, q: ListTitles) -> Result<SnapshotPage, CatalogError> {
        let mut rows = sqlx::query_as::<_, CatalogTitle>(
            "SELECT media_type, tmdb_id, title, overview, release_year
             FROM catalog_contents WHERE (media_type, tmdb_id) > (?, ?)
             ORDER BY media_type, tmdb_id LIMIT ?",
        )
        .bind(q.cursor.media_type)
        .bind(q.cursor.tmdb_id)
        .bind(i64::from(q.page_size.number()) + 1)
        .fetch_all(&self.pool)
        .await?;
        let has_more = rows.len()
            > usize::try_from(q.page_size.number())
                .map_err(|_| CatalogError::Invalid("page size"))?;
        if has_more {
            rows.pop();
        }
        let next_cursor = if has_more {
            rows.last().map(|r| Cursor {
                media_type: r.media_type,
                tmdb_id: r.tmdb_id,
            })
        } else {
            None
        };
        Ok(SnapshotPage {
            titles: rows.into_iter().map(TitleData::from).collect(),
            next_cursor,
        })
    }
    async fn title(&self, id: TitleId) -> Result<TitleData, CatalogError> {
        sqlx::query_as::<_, CatalogTitle>(
            "SELECT media_type, tmdb_id, title, overview, release_year
             FROM catalog_contents WHERE media_type = ? AND tmdb_id = ?",
        )
        .bind(i64::from(id.media_type.number()))
        .bind(id.tmdb_id)
        .fetch_optional(&self.pool)
        .await?
        .map(TitleData::from)
        .ok_or(CatalogError::SnapshotNotFound)
    }
}
