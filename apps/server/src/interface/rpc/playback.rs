//! Protobuf mapping and delegation for playback lifecycle use cases.

use connectrpc::{Encodable, RequestContext, Response, ServiceRequest, ServiceResult};
use popcorn_proto::catalog::popcorn::v1::PlaybackService;
use popcorn_proto::proto::popcorn::v1::{
    self as proto, GetPlaybackRequest, GetPlaybackResponse, PausePlaybackRequest,
    PausePlaybackResponse, ResumePlaybackRequest, ResumePlaybackResponse, StartPlaybackRequest,
    StartPlaybackResponse, StopPlaybackRequest, StopPlaybackResponse,
};
use uuid::Uuid;

use crate::core::media::profile::Quality;
use crate::{
    application::media::{Cache, Sources, StartPlayback, Transfers},
    core::media::{Playback, PlaybackState},
};

use super::{
    errors::{invalid, source_error},
    source::MediaRpc,
};

impl<R: Sources + 'static, T: Transfers + 'static, C: Cache + 'static> PlaybackService
    for MediaRpc<R, T, C>
{
    async fn start_playback<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, StartPlaybackRequest>,
    ) -> ServiceResult<impl Encodable<StartPlaybackResponse> + Send + use<'a, R, T, C>> {
        let attempt_id = Uuid::parse_str(request.idempotency_key).ok();
        popcorn_diagnostics::record(
            "playback.start_rpc",
            serde_json::json!({
                "attempt_id": attempt_id, "source_id": Uuid::parse_str(request.source_id).ok(),
                "file_index": request.file_index, "quality": request.quality.to_i32(),
                "audio_stream_index": request.audio_stream_index,
            }),
        );
        let playback = self
            .service
            .start(StartPlayback {
                source_id: request.source_id.to_owned(),
                file_index: request.file_index,
                idempotency_key: request.idempotency_key.to_owned(),
                audio_stream_index: request.audio_stream_index,
                quality: match request.quality.to_i32() {
                    0 | 1 => Quality::Auto,
                    2 => Quality::FullHd,
                    3 => Quality::Hd,
                    _ => return Err(invalid("valid playback quality is required")),
                },
            })
            .await
            .inspect_err(|error| {
                popcorn_diagnostics::record(
                    "playback.start_rpc_failed",
                    serde_json::json!({
                        "attempt_id": attempt_id, "error": error.to_string(),
                    }),
                );
            })
            .map_err(source_error)?;
        popcorn_diagnostics::record(
            "playback.start_rpc_ready",
            serde_json::json!({
                "attempt_id": attempt_id, "playback_id": playback.id,
            }),
        );
        Response::ok(StartPlaybackResponse {
            playback: encode_playback(playback).into(),
            ..Default::default()
        })
    }

    async fn get_playback<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, GetPlaybackRequest>,
    ) -> ServiceResult<impl Encodable<GetPlaybackResponse> + Send + use<'a, R, T, C>> {
        let id = Uuid::parse_str(request.playback_id)
            .map_err(|_| invalid("valid playback ID is required"))?;
        let playback = self.service.playback(id).await.map_err(source_error)?;
        Response::ok(GetPlaybackResponse {
            playback: encode_playback(playback).into(),
            ..Default::default()
        })
    }

    async fn stop_playback<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, StopPlaybackRequest>,
    ) -> ServiceResult<impl Encodable<StopPlaybackResponse> + Send + use<'a, R, T, C>> {
        let id = Uuid::parse_str(request.playback_id)
            .map_err(|_| invalid("valid playback ID is required"))?;
        self.service.stop(id).await.map_err(source_error)?;
        Response::ok(StopPlaybackResponse::default())
    }

    async fn pause_playback<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, PausePlaybackRequest>,
    ) -> ServiceResult<impl Encodable<PausePlaybackResponse> + Send + use<'a, R, T, C>> {
        let id = Uuid::parse_str(request.playback_id)
            .map_err(|_| invalid("valid playback ID is required"))?;
        let playback = self.service.pause(id).await.map_err(source_error)?;
        Response::ok(PausePlaybackResponse {
            playback: encode_playback(playback).into(),
            ..Default::default()
        })
    }

    async fn resume_playback<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, ResumePlaybackRequest>,
    ) -> ServiceResult<impl Encodable<ResumePlaybackResponse> + Send + use<'a, R, T, C>> {
        let id = Uuid::parse_str(request.playback_id)
            .map_err(|_| invalid("valid playback ID is required"))?;
        let playback = self.service.resume(id).await.map_err(source_error)?;
        Response::ok(ResumePlaybackResponse {
            playback: encode_playback(playback).into(),
            ..Default::default()
        })
    }
}

fn encode_playback(value: Playback) -> proto::Playback {
    let state = match value.state {
        PlaybackState::Preparing => proto::PlaybackState::Preparing,
        PlaybackState::Ready => proto::PlaybackState::Ready,
        PlaybackState::Failed => proto::PlaybackState::Failed,
        PlaybackState::Paused => proto::PlaybackState::Paused,
    };
    proto::Playback {
        playback_id: value.id,
        state: state.into(),
        media_url: value.media_url,
        size_bytes: value.size_bytes,
        mime_type: value.mime_type.into(),
        downloaded_bytes: value.downloaded_bytes,
        total_bytes: value.total_bytes,
        download_bytes_per_second: value.download_bytes_per_second,
        peers: value.peers,
        duration_seconds: value.duration_seconds,
        delivery: value.delivery.into(),
        conversion: value.conversion.into(),
        stream_type: value.stream_type.into(),
        error: value.error.into(),
        timestamp_offset_seconds: value.timestamp_offset_seconds,
        audio_stream_index: value.audio_stream_index,
        audio_tracks: value
            .audio_tracks
            .into_iter()
            .map(|track| proto::PlaybackAudioTrack {
                stream_index: track.stream_index,
                language: track.language,
                title: track.title,
                channels: track.channels,
                codec: track.codec,
                is_default: track.is_default,
                ..Default::default()
            })
            .collect(),
        ..Default::default()
    }
}
