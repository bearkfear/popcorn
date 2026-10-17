//! Serializes user library mutations and delegates persistence through a port.

use crate::core::history::{WatchEntry, WatchStatus};
use std::future::Future;
use tokio::sync::Mutex;

#[derive(Clone, Copy, Debug, thiserror::Error)]
pub(crate) enum HistoryError {
    #[error("invalid history entry")]
    Invalid,
    #[error("history storage failed")]
    Storage,
}

pub(crate) trait HistoryStore: Send + Sync {
    fn list(&self) -> impl Future<Output = Result<Vec<WatchEntry>, HistoryError>> + Send;
    fn save(
        &self,
        entry: &WatchEntry,
        missing_only: bool,
    ) -> impl Future<Output = Result<(), HistoryError>> + Send;
}

#[derive(Debug)]
pub(crate) struct History<S> {
    store: S,
    command: Mutex<()>,
}

impl<S: HistoryStore> History<S> {
    pub(crate) const fn new(store: S) -> Self {
        Self {
            store,
            command: Mutex::const_new(()),
        }
    }

    pub(crate) async fn list(&self) -> Result<Vec<WatchEntry>, HistoryError> {
        self.store.list().await
    }

    pub(crate) async fn update(
        &self,
        mut entry: WatchEntry,
        mark: Option<WatchStatus>,
        ended: bool,
        now: f64,
    ) -> Result<Vec<WatchEntry>, HistoryError> {
        if !entry.validate() || mark == Some(WatchStatus::Watching) {
            return Err(HistoryError::Invalid);
        }
        let _guard = self.command.lock().await;
        let entries = self.store.list().await?;
        let old = entries.iter().find(|item| item.key() == entry.key());
        entry.updated_at = now;
        let entry = if let Some(status) = mark {
            if let Some(old) = old {
                let title = entry.title;
                entry = old.clone();
                entry.title = title;
                entry.updated_at = now;
            }
            entry.status = status;
            Some(entry)
        } else {
            entry.progress(old, ended)
        };
        if let Some(entry) = entry {
            self.store.save(&entry, false).await?;
        }
        self.store.list().await
    }

    pub(crate) async fn import(
        &self,
        entries: Vec<WatchEntry>,
    ) -> Result<Vec<WatchEntry>, HistoryError> {
        if entries.len() > 500 || entries.iter().any(|entry| !entry.validate()) {
            return Err(HistoryError::Invalid);
        }
        let _guard = self.command.lock().await;
        for entry in entries {
            self.store.save(&entry, true).await?;
        }
        self.store.list().await
    }
}
