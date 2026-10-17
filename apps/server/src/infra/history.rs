//! Persists user history in the user database with atomic upsert and bounded retention.

use crate::{
    application::history::{HistoryError, HistoryStore},
    core::history::WatchEntry,
};
use sqlx::SqlitePool;

#[derive(Debug)]
pub(crate) struct SqliteHistory(pub(crate) SqlitePool);

impl HistoryStore for SqliteHistory {
    async fn list(&self) -> Result<Vec<WatchEntry>, HistoryError> {
        let rows: Vec<String> = sqlx::query_scalar(
            "SELECT entry_json FROM watch_history ORDER BY updated_at DESC, content_key LIMIT 500",
        )
        .fetch_all(&self.0)
        .await
        .map_err(|_| HistoryError::Storage)?;
        rows.iter()
            .map(|row| serde_json::from_str(row).map_err(|_| HistoryError::Storage))
            .collect()
    }

    async fn save(&self, entry: &WatchEntry, missing_only: bool) -> Result<(), HistoryError> {
        let json = serde_json::to_string(entry).map_err(|_| HistoryError::Storage)?;
        let mut transaction = self.0.begin().await.map_err(|_| HistoryError::Storage)?;
        let statement = if missing_only {
            "INSERT INTO watch_history VALUES (?, ?, ?) ON CONFLICT(content_key) DO NOTHING"
        } else {
            "INSERT INTO watch_history VALUES (?, ?, ?) ON CONFLICT(content_key)
             DO UPDATE SET entry_json = excluded.entry_json, updated_at = excluded.updated_at"
        };
        sqlx::query(statement)
            .bind(entry.key())
            .bind(json)
            .bind(entry.updated_at)
            .execute(&mut *transaction)
            .await
            .map_err(|_| HistoryError::Storage)?;
        sqlx::query("DELETE FROM watch_history WHERE content_key NOT IN
            (SELECT content_key FROM watch_history ORDER BY updated_at DESC, content_key LIMIT 500)")
            .execute(&mut *transaction).await.map_err(|_| HistoryError::Storage)?;
        transaction
            .commit()
            .await
            .map_err(|_| HistoryError::Storage)
    }
}
