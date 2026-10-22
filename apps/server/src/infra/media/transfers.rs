//! Torrent session lifecycle and the application transfer-port adapter.

use crate::application::media::queries::get_playback::Playback;
use std::{collections::HashMap, fmt, path::PathBuf, sync::Arc};

use librqbit::{ManagedTorrent, Session, SessionOptions};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::{
    application::media::{
        AccessError, ConvertedAccess, MediaAccess, MediaError, PlaybackFile, ResolvedSource,
        StartPlayback, Transfers,
    },
    core::media::SourceInput,
};

use super::preparation::Processing;

pub(super) struct ActivePlayback {
    pub(super) source_id: String,
    pub(super) handle: Arc<ManagedTorrent>,
    pub(super) file_index: usize,
    pub(super) file_name: String,
    pub(super) size: u64,
    pub(super) credential: String,
    pub(super) processing: Arc<Processing>,
}

impl Drop for ActivePlayback {
    fn drop(&mut self) {
        self.processing.cancel.cancel();
    }
}

pub(crate) struct TorrentEngine {
    directory: PathBuf,
    pub(super) address: String,
    pub(super) relative_urls: bool,
    session: Mutex<Option<Arc<Session>>>,
    pub(super) playbacks: Mutex<HashMap<Uuid, ActivePlayback>>,
    pub(super) idempotency: Mutex<HashMap<String, Uuid>>,
}

impl fmt::Debug for TorrentEngine {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("TorrentEngine")
            .field("directory", &self.directory)
            .field("address", &self.address)
            .finish_non_exhaustive()
    }
}

impl TorrentEngine {
    pub(super) fn new(directory: PathBuf, address: String, relative_urls: bool) -> Self {
        Self {
            directory,
            address,
            relative_urls,
            session: Mutex::new(None),
            playbacks: Mutex::new(HashMap::new()),
            idempotency: Mutex::new(HashMap::new()),
        }
    }

    pub(super) async fn session(&self) -> Result<Arc<Session>, MediaError> {
        let mut current = self.session.lock().await;
        if let Some(session) = current.as_ref() {
            return Ok(session.clone());
        }
        tokio::fs::create_dir_all(&self.directory)
            .await
            .map_err(|_| MediaError::Unavailable)?;
        let mut options = SessionOptions::default();
        if let Some(dht) = options.dht.as_mut() {
            dht.persistence = None;
        }
        options.disable_local_service_discovery = true;
        options.ipv4_only = true;
        options.client_name_and_version = Some(format!(
            "Popcorn/{} rqbit/{}",
            env!("CARGO_PKG_VERSION"),
            librqbit::version()
        ));
        let session = Session::new_with_opts(self.directory.clone(), options)
            .await
            .map_err(|_| MediaError::Unavailable)?;
        *current = Some(session.clone());
        drop(current);
        Ok(session)
    }

    pub(super) async fn active_session(&self) -> Option<Arc<Session>> {
        self.session.lock().await.as_ref().cloned()
    }
}

impl Transfers for TorrentEngine {
    type Prepared = Arc<ManagedTorrent>;

    async fn resolve(&self, input: SourceInput) -> Result<ResolvedSource, MediaError> {
        self.resolve_source(input).await
    }

    async fn previous(&self, key: &str) -> Option<Uuid> {
        self.idempotency.lock().await.get(key).copied()
    }

    async fn prepare(&self, file: &PlaybackFile, index: u32) -> Result<Self::Prepared, MediaError> {
        self.prepare_file(file, index).await
    }

    async fn activate(
        &self,
        command: StartPlayback,
        file: PlaybackFile,
        prepared: Self::Prepared,
    ) -> Result<Uuid, MediaError> {
        self.activate_playback(command, file, prepared).await
    }

    async fn playback(&self, id: Uuid) -> Result<Playback, MediaError> {
        self.snapshot(id).await
    }

    async fn pause(&self, id: Uuid) -> Result<(), MediaError> {
        self.pause_playback(id).await
    }

    async fn resume(&self, id: Uuid) -> Result<(), MediaError> {
        self.resume_playback(id).await
    }

    async fn stop(&self, id: Uuid) -> Result<(), MediaError> {
        self.stop_playback(id).await
    }

    async fn in_use(&self, source_id: Option<&str>) -> bool {
        self.playbacks
            .lock()
            .await
            .values()
            .any(|active| source_id.is_none_or(|id| active.source_id == id))
    }

    async fn shutdown(&self) {
        let active: Vec<_> = self
            .playbacks
            .lock()
            .await
            .drain()
            .map(|(_, active)| active)
            .collect();
        self.idempotency.lock().await.clear();
        for playback in active {
            playback.processing.stop().await;
        }
        let session = self.session.lock().await.take();
        if let Some(session) = session {
            session.stop().await;
        }
    }

    async fn open(&self, id: Uuid, credential: &str) -> Result<MediaAccess, AccessError> {
        self.open_stream(id, credential).await
    }

    async fn converted(
        &self,
        id: Uuid,
        credential: &str,
        start: f64,
        generation: u64,
    ) -> Result<ConvertedAccess, AccessError> {
        self.open_converted(id, credential, start, generation).await
    }

    async fn hls_segment(
        &self,
        id: Uuid,
        credential: &str,
        index: u32,
    ) -> Result<ConvertedAccess, AccessError> {
        self.open_hls_segment(id, credential, index).await
    }
}
