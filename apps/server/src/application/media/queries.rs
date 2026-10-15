//! Source, playback, cache and authorized media-access queries.

use uuid::Uuid;

use crate::core::media::{CacheSettings, Content, Playback, Source};

use super::{
    AccessError, Cache, ConvertedAccess, MediaAccess, MediaError, MediaService, Sources, Transfers,
};

impl<R: Sources, T: Transfers, C: Cache> MediaService<R, T, C> {
    pub(crate) async fn list(&self, content: &Content) -> Result<Vec<Source>, MediaError> {
        self.sources.list(content).await
    }

    pub(crate) async fn playback(&self, id: Uuid) -> Result<Playback, MediaError> {
        self.transfers.playback(id).await
    }

    pub(crate) async fn cache_settings(&self) -> Result<CacheSettings, MediaError> {
        self.cache.settings().await
    }

    pub(crate) async fn open_media(
        &self,
        id: Uuid,
        credential: &str,
    ) -> Result<MediaAccess, AccessError> {
        self.transfers.open(id, credential).await
    }

    pub(crate) async fn converted_media(
        &self,
        id: Uuid,
        credential: &str,
        start: f64,
        generation: u64,
    ) -> Result<ConvertedAccess, AccessError> {
        self.transfers
            .converted(id, credential, start, generation)
            .await
    }
}
