//! Owns cancellable inspection and conversion state for one playback generation.

use std::sync::Arc;

use tokio::{
    sync::{Mutex, Notify, watch},
    task::JoinSet,
};
use tokio_util::sync::CancellationToken;

use crate::core::media::value_objects::playback_profile::{AudioConversion, PlaybackPlan, Quality};

use super::probe::InspectedMedia;
use popcorn_diagnostics::ProcessContext;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub(super) enum Preparation {
    Preparing,
    Ready(Arc<PreparedMedia>),
    Failed(&'static str),
}

#[derive(Debug)]
pub(super) struct PreparedMedia {
    pub(super) inspected: InspectedMedia,
    pub(super) plan: PlaybackPlan,
}

impl PreparedMedia {
    pub(super) const fn stream_type(&self) -> &'static str {
        match self.plan.audio {
            AudioConversion::Absent => "video/mp4; codecs=\"avc1.640029\"",
            AudioConversion::Copy | AudioConversion::Encode => {
                "video/mp4; codecs=\"avc1.640029, mp4a.40.2\""
            }
        }
    }
}

pub(super) struct Processing {
    pub(super) state: watch::Sender<Preparation>,
    pub(super) cancel: CancellationToken,
    pub(super) stream: Mutex<StreamGeneration>,
    pub(super) slot: Arc<tokio::sync::Semaphore>,
    // Dropping the playback aborts outstanding inspection and kills its child.
    pub(super) tasks: Mutex<JoinSet<()>>,
    published: Arc<Notify>,
}

pub(super) struct StreamGeneration {
    pub(super) number: u64,
    pub(super) cancel: CancellationToken,
}

impl Processing {
    pub(super) fn start(
        url: String,
        quality: Quality,
        audio_stream_index: Option<u32>,
        playback_id: Uuid,
    ) -> Self {
        let (state, _) = watch::channel(Preparation::Preparing);
        let cancel = CancellationToken::new();
        let mut tasks = JoinSet::new();
        let update = state.clone();
        let stopped = cancel.clone();
        let published = Arc::new(Notify::new());
        let gate = published.clone();
        let context = ProcessContext {
            playback_id,
            generation: None,
            tool: "ffprobe",
        };
        tasks.spawn(super::inspection::inspect(
            url,
            quality,
            audio_stream_index,
            gate,
            stopped,
            update,
            context,
        ));
        Self {
            state,
            cancel,
            stream: Mutex::new(StreamGeneration {
                number: 0,
                cancel: CancellationToken::new(),
            }),
            slot: Arc::new(tokio::sync::Semaphore::new(1)),
            tasks: Mutex::new(tasks),
            published,
        }
    }

    pub(super) fn publish(&self) {
        self.published.notify_one();
    }

    pub(super) async fn stop(&self) {
        self.cancel.cancel();
        let mut tasks = self.tasks.lock().await;
        while let Some(result) = tasks.join_next().await {
            if let Err(error) = result {
                tracing::warn!(%error, "media worker stopped unsuccessfully");
            }
        }
    }
}

impl Drop for Processing {
    fn drop(&mut self) {
        self.cancel.cancel();
    }
}
