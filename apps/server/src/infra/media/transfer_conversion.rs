//! Opens one authorized conversion generation, replacing and reaping its predecessor.

use std::sync::Arc;

use popcorn_diagnostics::ProcessContext;
use serde_json::json;
use subtle::ConstantTimeEq as _;
use uuid::Uuid;

use crate::application::media::{AccessError, ConvertedAccess};

use super::{
    TorrentEngine,
    conversion_reader::ConversionReader,
    preparation::{ConversionOutput, Preparation, Processing},
};

impl TorrentEngine {
    pub(super) async fn open_converted(
        &self,
        id: Uuid,
        credential: &str,
        start: f64,
        generation: u64,
    ) -> Result<ConvertedAccess, AccessError> {
        let context = ProcessContext {
            playback_id: id,
            generation: Some(generation),
            tool: "ffmpeg",
        };
        context.record("media.stream.requested", json!({ "start_seconds": start }));
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
                context.record("media.stream.rejected", json!({ "last_generation": stream.number,
                    "cancelled": processing.cancel.is_cancelled(), "reason": "stale_generation_or_stopped" }));
                return Err(AccessError::Gone);
            }
            stream.cancel.cancel();
            stream.number = generation;
            stream.cancel = processing.cancel.child_token();
            stream.cancel.clone()
        };
        let url = format!("http://{}/media/{id}?token={credential}", self.address);
        let (reader, error) = super::conversion_start::start(
            &processing,
            &media,
            &url,
            start,
            &cancel,
            context,
            ConversionOutput::FragmentedMp4,
        )
        .await?;
        Ok(ConvertedAccess {
            reader: Box::new(ConversionReader::new(reader, cancel, error, context)),
        })
    }

    pub(super) async fn authorized_processing(
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
