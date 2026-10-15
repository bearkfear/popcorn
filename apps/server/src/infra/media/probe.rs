//! Inspects selected tracks through the authenticated, seekable torrent HTTP reader.

use serde::Deserialize;
use tokio::io::AsyncReadExt as _;

use crate::core::media::profile::{AudioTrack, MediaInfo, VideoTrack};

use super::tools::MediaTools;

#[derive(Debug, Clone)]
pub(super) struct InspectedMedia {
    pub(super) info: MediaInfo,
    pub(super) video_index: u32,
    pub(super) audio_index: Option<u32>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Track {
    index: u32,
    codec_type: String,
    codec_name: String,
    profile: String,
    pix_fmt: String,
    width: u32,
    height: u32,
    level: i32,
    avg_frame_rate: String,
    channels: u32,
    color_transfer: String,
    disposition: Disposition,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Disposition {
    attached_pic: u32,
    default: u32,
}

#[derive(Deserialize)]
struct Inspection {
    format: Format,
    streams: Vec<Track>,
}

#[derive(Deserialize)]
struct Format {
    format_name: String,
    duration: String,
}

impl MediaTools {
    pub(super) async fn inspect(&self, url: &str) -> std::io::Result<InspectedMedia> {
        let mut child = self
            .command(true)
            .args([
                "-v", "error", "-protocol_whitelist", "http,tcp",
                "-rw_timeout", "90000000",
                "-format_whitelist", "matroska,webm,mov,avi,mpegts,ogg",
                "-show_entries",
                "format=format_name,duration:stream=index,codec_type,codec_name,profile,pix_fmt,width,height,level,avg_frame_rate,channels,color_transfer:stream_disposition=default,attached_pic",
                "-of", "json", url,
            ])
            .spawn()?;
        let mut bytes = Vec::new();
        child
            .stdout
            .take()
            .ok_or_else(|| std::io::Error::other("probe stdout unavailable"))?
            .take(262_145)
            .read_to_end(&mut bytes)
            .await?;
        if bytes.len() > 262_144 {
            return Err(std::io::Error::other("media metadata exceeds limit"));
        }
        if !child.wait().await?.success() {
            return Err(std::io::Error::other("media inspection failed"));
        }
        let inspection: Inspection = serde_json::from_slice(&bytes)?;
        inspection.into_media()
    }
}

impl Inspection {
    fn into_media(self) -> std::io::Result<InspectedMedia> {
        let duration: f64 = self
            .format
            .duration
            .parse()
            .map_err(std::io::Error::other)?;
        let video = self
            .streams
            .iter()
            .find(|track| track.codec_type == "video" && track.disposition.attached_pic == 0)
            .ok_or_else(|| std::io::Error::other("media has no video track"))?;
        if !duration.is_finite() || duration <= 0.0 || video.width == 0 || video.height == 0 {
            return Err(std::io::Error::other(
                "media has no valid duration or dimensions",
            ));
        }
        let audio = self
            .streams
            .iter()
            .filter(|track| track.codec_type == "audio")
            .max_by_key(|track| track.disposition.default);
        Ok(InspectedMedia {
            video_index: video.index,
            audio_index: audio.map(|track| track.index),
            info: MediaInfo {
                format: self.format.format_name,
                duration,
                video: video.video(),
                audio: audio.map(|track| AudioTrack {
                    codec: track.codec_name.clone(),
                    profile: track.profile.clone(),
                    channels: track.channels,
                }),
            },
        })
    }
}

impl Track {
    fn video(&self) -> VideoTrack {
        let frame_rate = self
            .avg_frame_rate
            .split_once('/')
            .and_then(|(numerator, denominator)| {
                Some(numerator.parse::<f64>().ok()? / denominator.parse::<f64>().ok()?)
            })
            .unwrap_or(0.0);
        VideoTrack {
            codec: self.codec_name.clone(),
            profile: self.profile.clone(),
            pixel_format: self.pix_fmt.clone(),
            width: self.width,
            height: self.height,
            level: self.level,
            frame_rate,
            color_transfer: self.color_transfer.clone(),
        }
    }
}
