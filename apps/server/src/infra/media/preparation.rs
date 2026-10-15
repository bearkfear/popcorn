//! Owns cancellable inspection and conversion state for one playback generation.

use std::{sync::Arc, time::Duration};

use tokio::{
    sync::{Mutex, watch},
    task::JoinSet,
};
use tokio_util::sync::CancellationToken;

use crate::core::media::profile::{AudioConversion, PlaybackPlan, Quality};

use super::{probe::InspectedMedia, tools::MediaTools};

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
}

pub(super) struct StreamGeneration {
    pub(super) number: u64,
    pub(super) cancel: CancellationToken,
}

impl Processing {
    pub(super) fn start(url: String, quality: Quality) -> Self {
        let (state, _) = watch::channel(Preparation::Preparing);
        let cancel = CancellationToken::new();
        let mut tasks = JoinSet::new();
        let update = state.clone();
        let stopped = cancel.clone();
        tasks.spawn(async move {
            let work = async { MediaTools::discover()?.inspect(&url).await };
            let outcome = tokio::select! {
                () = stopped.cancelled() => return,
                result = tokio::time::timeout(Duration::from_mins(2), work) => result,
            };
            let next = match outcome {
                Ok(Ok(inspected)) => {
                    let plan = inspected.info.plan(quality);
                    Preparation::Ready(Arc::new(PreparedMedia { inspected, plan }))
                }
                Ok(Err(error)) if error.kind() == std::io::ErrorKind::NotFound => {
                    Preparation::Failed("Conversor interno ausente. Reinstale o Popcorn.")
                }
                Ok(Err(error)) => {
                    tracing::warn!(%error, "media inspection failed");
                    Preparation::Failed("Não foi possível analisar o vídeo desta fonte.")
                }
                Err(_) => {
                    Preparation::Failed("A fonte demorou demais para fornecer os dados do vídeo.")
                }
            };
            update.send_replace(next);
        });
        Self {
            state,
            cancel,
            stream: Mutex::new(StreamGeneration {
                number: 0,
                cancel: CancellationToken::new(),
            }),
            slot: Arc::new(tokio::sync::Semaphore::new(1)),
            tasks: Mutex::new(tasks),
        }
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
