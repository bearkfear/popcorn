//! Opens one authorized conversion generation, replacing and reaping its predecessor.

use std::sync::{Arc, OnceLock};

use subtle::ConstantTimeEq as _;
use uuid::Uuid;

use crate::application::media::{AccessError, ConvertedAccess};

use super::{
    TorrentEngine,
    conversion_reader::{ConversionJob, ConversionReader},
    preparation::{Preparation, Processing},
    tools::MediaTools,
};

impl TorrentEngine {
    pub(super) async fn open_converted(
        &self,
        id: Uuid,
        credential: &str,
        start: f64,
        generation: u64,
    ) -> Result<ConvertedAccess, AccessError> {
        let processing = self.authorized_processing(id, credential).await?;
        let Preparation::Ready(media) = processing.state.borrow().clone() else {
            return Err(AccessError::Unavailable);
        };
        if !media.inspected.info.accepts_position(start) {
            return Err(AccessError::InvalidPosition);
        }
        let cancel = {
            let mut stream = processing.stream.lock().await;
            if generation <= stream.number || processing.cancel.is_cancelled() {
                return Err(AccessError::Gone);
            }
            stream.cancel.cancel();
            stream.number = generation;
            stream.cancel = processing.cancel.child_token();
            stream.cancel.clone()
        };
        let (reader, error) = {
            let permit = tokio::select! {
                () = cancel.cancelled() => return Err(AccessError::Gone),
                permit = processing.slot.clone().acquire_owned() => permit.map_err(|_| AccessError::Gone)?,
            };
            let mut tasks = processing.tasks.lock().await;
            if cancel.is_cancelled() {
                return Err(AccessError::Gone);
            }
            let url = format!("http://{}/media/{id}?token={credential}", self.address);
            let child = MediaTools::discover()
                .map_err(|_| AccessError::Unavailable)?
                .conversion(&media, &url, start)
                .spawn()
                .map_err(|_| AccessError::Unavailable)?;
            let (reader, writer) = tokio::io::duplex(256 * 1024);
            let error = Arc::new(OnceLock::new());
            while let Some(result) = tasks.try_join_next() {
                if let Err(error) = result {
                    tracing::warn!(%error, "media worker failed");
                }
            }
            tasks.spawn(
                ConversionJob {
                    child,
                    writer,
                    cancel: cancel.clone(),
                    playback: processing.cancel.clone(),
                    error: error.clone(),
                    state: processing.state.clone(),
                    _permit: permit,
                }
                .run(),
            );
            drop(tasks);
            (reader, error)
        };
        Ok(ConvertedAccess {
            reader: Box::new(ConversionReader::new(reader, cancel, error)),
        })
    }

    async fn authorized_processing(
        &self,
        id: Uuid,
        credential: &str,
    ) -> Result<Arc<Processing>, AccessError> {
        let playbacks = self.playbacks.lock().await;
        let active = playbacks.get(&id).ok_or(AccessError::Gone)?;
        if active
            .credential
            .as_bytes()
            .ct_eq(credential.as_bytes())
            .unwrap_u8()
            != 1
        {
            return Err(AccessError::Forbidden);
        }
        let processing = active.processing.clone();
        drop(playbacks);
        Ok(processing)
    }
}
