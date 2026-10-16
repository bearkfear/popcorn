//! Records media inspection, selected codecs and conversion policy without source identities or credentials.
use popcorn_diagnostics::ProcessContext;

use super::{
    preparation::{Preparation, PreparedMedia},
    tools::MediaTools,
};
use crate::core::media::profile::Quality;
use serde_json::json;
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::{Notify, watch};
use tokio_util::sync::CancellationToken;

pub(super) async fn inspect(
    url: String,
    quality: Quality,
    audio_stream_index: Option<u32>,
    gate: Arc<Notify>,
    stopped: CancellationToken,
    update: watch::Sender<Preparation>,
    context: ProcessContext,
) {
    let started = Instant::now();
    context.record(
        "media.probe.started",
        json!({ "quality": format!("{quality:?}"), "audio_stream_index": audio_stream_index }),
    );
    let work = async {
        gate.notified().await;
        context.record(
            "media.probe.authorized",
            json!({ "wait_ms": started.elapsed().as_millis() }),
        );
        MediaTools::discover()?
            .inspect(&url, audio_stream_index, context)
            .await
    };
    let outcome = tokio::select! {
        () = stopped.cancelled() => {
            context.record("media.probe.cancelled", json!({ "elapsed_ms": started.elapsed().as_millis() }));
            return;
        },
        result = tokio::time::timeout(Duration::from_mins(2), work) => result,
    };
    let next = match outcome {
        Ok(Ok(inspected)) => ready(inspected, quality, context),
        Ok(Err(error)) => {
            context.record(
                "media.probe.failed",
                json!({ "elapsed_ms": started.elapsed().as_millis(),
                "kind": format!("{:?}", error.kind()), "message": error.to_string() }),
            );
            Preparation::Failed(if error.kind() == std::io::ErrorKind::NotFound {
                "Conversor interno ausente. Reinstale o Popcorn."
            } else {
                "Não foi possível analisar o vídeo desta fonte."
            })
        }
        Err(_) => {
            context.record(
                "media.probe.timeout",
                json!({ "elapsed_ms": started.elapsed().as_millis() }),
            );
            Preparation::Failed("A fonte demorou demais para fornecer os dados do vídeo.")
        }
    };
    update.send_replace(next);
}

fn ready(
    inspected: super::probe::InspectedMedia,
    quality: Quality,
    context: ProcessContext,
) -> Preparation {
    let mut plan = inspected.info.plan(quality);
    if inspected.audio_tracks.len() > 1 {
        plan.direct = false;
    }
    let video = &inspected.info.video;
    context.record("media.probe.ready", json!({
        "format": inspected.info.format, "duration_seconds": inspected.info.duration,
        "video_index": inspected.video_index, "audio_index": inspected.audio_index,
        "video_codec": video.codec, "video_profile": video.profile, "pixel_format": video.pixel_format,
        "width": video.width, "height": video.height, "level": video.level,
        "frame_rate": video.frame_rate, "color_transfer": video.color_transfer,
        "audio_codec": inspected.info.audio.as_ref().map(|a| &a.codec),
        "audio_profile": inspected.info.audio.as_ref().map(|a| &a.profile),
        "audio_channels": inspected.info.audio.as_ref().map(|a| a.channels),
        "audio_track_count": inspected.audio_tracks.len(), "delivery": if plan.direct { "direct" } else { "mse" },
        "conversion": plan.description(), "video_plan": format!("{:?}", plan.video), "audio_plan": format!("{:?}", plan.audio),
    }));
    Preparation::Ready(Arc::new(PreparedMedia { inspected, plan }))
}
