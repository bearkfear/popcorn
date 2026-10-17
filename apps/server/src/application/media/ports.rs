//! Media persistence, transfer execution and cache boundary contracts.

use crate::application::media::queries::get_cache_settings::CacheSettings;
use crate::application::media::queries::get_playback::Playback;
use std::future::Future;

use tokio::io::{AsyncRead, AsyncSeek};
use uuid::Uuid;

use crate::core::media::{Content, Source, SourceFile, SourceInput};

use super::{ConvertedAccess, MediaAccess, MediaError, StartPlayback};

pub(crate) struct ResolvedSource {
    pub(crate) info_hash: String,
    pub(crate) magnet: Option<String>,
    pub(crate) torrent: Vec<u8>,
    pub(crate) files: Vec<SourceFile>,
}

pub(crate) struct PlaybackFile {
    pub(crate) torrent: Vec<u8>,
    pub(crate) name: String,
    pub(crate) size: u64,
}

pub(crate) trait Sources: Send + Sync {
    fn save(
        &self,
        content: Content,
        source: ResolvedSource,
    ) -> impl Future<Output = Result<Source, MediaError>> + Send;
    fn list(
        &self,
        content: &Content,
    ) -> impl Future<Output = Result<Vec<Source>, MediaError>> + Send;
    fn remove(&self, source_id: &str) -> impl Future<Output = Result<(), MediaError>> + Send;
    fn playback_file(
        &self,
        source_id: &str,
        file_index: u32,
    ) -> impl Future<Output = Result<PlaybackFile, MediaError>> + Send;
}

pub(crate) trait Transfers: Send + Sync {
    type Prepared: Send;
    fn resolve(
        &self,
        input: SourceInput,
    ) -> impl Future<Output = Result<ResolvedSource, MediaError>> + Send;
    fn previous(&self, key: &str) -> impl Future<Output = Option<Uuid>> + Send;
    fn prepare(
        &self,
        file: &PlaybackFile,
        index: u32,
    ) -> impl Future<Output = Result<Self::Prepared, MediaError>> + Send;
    fn activate(
        &self,
        command: StartPlayback,
        file: PlaybackFile,
        prepared: Self::Prepared,
    ) -> impl Future<Output = Result<Uuid, MediaError>> + Send;
    fn playback(&self, id: Uuid) -> impl Future<Output = Result<Playback, MediaError>> + Send;
    fn pause(&self, id: Uuid) -> impl Future<Output = Result<(), MediaError>> + Send;
    fn resume(&self, id: Uuid) -> impl Future<Output = Result<(), MediaError>> + Send;
    fn stop(&self, id: Uuid) -> impl Future<Output = Result<(), MediaError>> + Send;
    fn in_use(&self, source_id: Option<&str>) -> impl Future<Output = bool> + Send;
    fn shutdown(&self) -> impl Future<Output = ()> + Send;
    fn open(
        &self,
        id: Uuid,
        credential: &str,
    ) -> impl Future<Output = Result<MediaAccess, AccessError>> + Send;
    fn converted(
        &self,
        id: Uuid,
        credential: &str,
        start: f64,
        generation: u64,
    ) -> impl Future<Output = Result<ConvertedAccess, AccessError>> + Send;
}

pub(crate) trait Cache: Send + Sync {
    fn settings(&self) -> impl Future<Output = Result<CacheSettings, MediaError>> + Send;
    fn limit(&self) -> impl Future<Output = Result<u64, MediaError>> + Send;
    fn set_limit(&self, bytes: u64) -> impl Future<Output = Result<(), MediaError>> + Send;
    fn trim(&self, bytes: u64) -> impl Future<Output = Result<(), MediaError>> + Send;
    fn clear(&self) -> impl Future<Output = Result<(), MediaError>> + Send;
}

pub(crate) trait MediaReader: AsyncRead + AsyncSeek + Unpin + Send {}
impl<T: AsyncRead + AsyncSeek + Unpin + Send> MediaReader for T {}

pub(crate) enum AccessError {
    Gone,
    Forbidden,
    Unavailable,
    InvalidPosition,
}
