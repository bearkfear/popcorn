//! Mutation of managed torrent playback state under application serialization.

use std::sync::Arc;

use librqbit::{ManagedTorrent, Session, TorrentStatsState};
use uuid::Uuid;

use crate::application::media::{MediaError, PlaybackFile, StartPlayback};

use super::preparation::Processing;
use super::{TorrentEngine, transfers::ActivePlayback};

impl TorrentEngine {
    pub(super) async fn activate_playback(
        &self,
        command: StartPlayback,
        file: PlaybackFile,
        handle: Arc<ManagedTorrent>,
    ) -> Result<Uuid, MediaError> {
        let previous: Vec<ActivePlayback> = self
            .playbacks
            .lock()
            .await
            .drain()
            .map(|(_, playback)| playback)
            .collect();
        self.idempotency.lock().await.clear();
        for active in &previous {
            active.processing.stop().await;
        }
        if let Some(session) = self.active_session().await {
            for active in previous {
                pause_if_live(&session, &active.handle).await?;
            }
            resume_if_paused(&session, &handle).await?;
        }
        let id = Uuid::new_v4();
        let credential = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let stats = handle.stats();
        popcorn_diagnostics::record(
            "playback.activated",
            serde_json::json!({ "playback_id": id,
            "source_id": command.source_id, "file_index": command.file_index, "file_size": file.size,
            "downloaded_bytes": stats.progress_bytes, "total_bytes": stats.total_bytes,
            "quality": format!("{:?}", command.quality), "audio_stream_index": command.audio_stream_index }),
        );
        let processing = Arc::new(Processing::start(
            format!("http://{}/media/{id}?token={credential}", self.address),
            command.quality,
            command.audio_stream_index,
            id,
        ));
        self.playbacks.lock().await.insert(
            id,
            ActivePlayback {
                source_id: command.source_id,
                handle,
                file_index: usize::try_from(command.file_index).map_err(|_| MediaError::Invalid)?,
                file_name: file.name,
                size: file.size,
                credential,
                processing: processing.clone(),
            },
        );
        processing.publish();
        self.idempotency
            .lock()
            .await
            .insert(command.idempotency_key, id);
        Ok(id)
    }

    async fn playback_handle(&self, id: Uuid) -> Result<Arc<ManagedTorrent>, MediaError> {
        self.playbacks
            .lock()
            .await
            .get(&id)
            .map(|active| active.handle.clone())
            .ok_or(MediaError::NotFound)
    }

    pub(super) async fn pause_playback(&self, id: Uuid) -> Result<(), MediaError> {
        popcorn_diagnostics::record(
            "playback.pause_requested",
            serde_json::json!({ "playback_id": id }),
        );
        let handle = self.playback_handle(id).await?;
        let session = self.active_session().await.ok_or(MediaError::Unavailable)?;
        pause_if_live(&session, &handle).await
    }

    pub(super) async fn resume_playback(&self, id: Uuid) -> Result<(), MediaError> {
        popcorn_diagnostics::record(
            "playback.resume_requested",
            serde_json::json!({ "playback_id": id }),
        );
        let handle = self.playback_handle(id).await?;
        let session = self.active_session().await.ok_or(MediaError::Unavailable)?;
        resume_if_paused(&session, &handle).await
    }

    pub(super) async fn stop_playback(&self, id: Uuid) -> Result<(), MediaError> {
        popcorn_diagnostics::record(
            "playback.stop_requested",
            serde_json::json!({ "playback_id": id }),
        );
        let active = self
            .playbacks
            .lock()
            .await
            .remove(&id)
            .ok_or(MediaError::NotFound)?;
        self.idempotency
            .lock()
            .await
            .retain(|_, value| *value != id);
        active.processing.stop().await;
        if let Some(session) = self.active_session().await {
            pause_if_live(&session, &active.handle).await?;
        }
        Ok(())
    }
}

async fn pause_if_live(session: &Session, handle: &Arc<ManagedTorrent>) -> Result<(), MediaError> {
    if !matches!(
        handle.stats().state,
        TorrentStatsState::Paused | TorrentStatsState::Initializing { paused: true }
    ) {
        session
            .pause(handle)
            .await
            .map_err(|_| MediaError::Unavailable)?;
    }
    Ok(())
}

async fn resume_if_paused(
    session: &Arc<Session>,
    handle: &Arc<ManagedTorrent>,
) -> Result<(), MediaError> {
    if matches!(
        handle.stats().state,
        TorrentStatsState::Paused | TorrentStatsState::Initializing { paused: true }
    ) {
        session
            .unpause(handle)
            .await
            .map_err(|_| MediaError::Unavailable)?;
    }
    Ok(())
}
