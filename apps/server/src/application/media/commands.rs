//! Source, playback and cache mutations with serialized playback transitions.

use uuid::Uuid;

use crate::core::media::profile::Quality;
use crate::core::media::{
    CacheSettings, Content, Playback, Source, SourceInput, validate_cache_limit,
};

use super::{Cache, MediaError, MediaService, Sources, Transfers};

pub(crate) struct AddSource {
    pub(crate) content: Content,
    pub(crate) input: SourceInput,
}

pub(crate) struct StartPlayback {
    pub(crate) source_id: String,
    pub(crate) file_index: u32,
    pub(crate) idempotency_key: String,
    pub(crate) quality: Quality,
}

impl<R: Sources, T: Transfers, C: Cache> MediaService<R, T, C> {
    pub(crate) async fn add(&self, command: AddSource) -> Result<Source, MediaError> {
        command.input.validate()?;
        let resolved = self.transfers.resolve(command.input).await?;
        self.sources.save(command.content, resolved).await
    }

    pub(crate) async fn remove(&self, source_id: &str) -> Result<(), MediaError> {
        if self.transfers.in_use(Some(source_id)).await {
            return Err(MediaError::InUse);
        }
        self.sources.remove(source_id).await
    }

    pub(crate) async fn start(&self, request: StartPlayback) -> Result<Playback, MediaError> {
        if request.idempotency_key.is_empty() || request.idempotency_key.len() > 128 {
            return Err(MediaError::Invalid);
        }
        if let Some(id) = self.transfers.previous(&request.idempotency_key).await {
            return self.playback(id).await;
        }
        let file = self
            .sources
            .playback_file(&request.source_id, request.file_index)
            .await?;
        if file.size > self.cache.limit().await? {
            return Err(MediaError::Capacity);
        }
        let prepared = self.transfers.prepare(&file, request.file_index).await?;
        let command = self.command.lock().await;
        if let Some(id) = self.transfers.previous(&request.idempotency_key).await {
            drop(command);
            return self.playback(id).await;
        }
        let id = self.transfers.activate(request, file, prepared).await?;
        drop(command);
        self.playback(id).await
    }

    pub(crate) async fn pause(&self, id: Uuid) -> Result<Playback, MediaError> {
        let command = self.command.lock().await;
        self.transfers.pause(id).await?;
        drop(command);
        self.playback(id).await
    }

    pub(crate) async fn resume(&self, id: Uuid) -> Result<Playback, MediaError> {
        let command = self.command.lock().await;
        self.transfers.resume(id).await?;
        drop(command);
        self.playback(id).await
    }

    pub(crate) async fn stop(&self, id: Uuid) -> Result<(), MediaError> {
        let command = self.command.lock().await;
        self.transfers.stop(id).await?;
        drop(command);
        Ok(())
    }

    pub(crate) async fn set_cache_limit(&self, bytes: u64) -> Result<CacheSettings, MediaError> {
        validate_cache_limit(bytes)?;
        self.cache.set_limit(bytes).await?;
        self.cache.settings().await
    }

    pub(crate) async fn clear_cache(&self) -> Result<CacheSettings, MediaError> {
        let command = self.command.lock().await;
        if self.transfers.in_use(None).await {
            return Err(MediaError::InUse);
        }
        self.transfers.shutdown().await;
        self.cache.clear().await?;
        drop(command);
        self.cache.settings().await
    }

    pub(crate) async fn shutdown(&self) {
        self.transfers.shutdown().await;
    }
}
