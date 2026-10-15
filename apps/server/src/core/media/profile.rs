//! Selects a conservative desktop playback profile from inspected media tracks.

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) enum Quality {
    #[default]
    Auto,
    FullHd,
    Hd,
}

impl Quality {
    pub(crate) const fn bounds(self) -> (u32, u32) {
        match self {
            Self::Auto | Self::FullHd => (1920, 1080),
            Self::Hd => (1280, 720),
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct VideoTrack {
    pub(crate) codec: String,
    pub(crate) profile: String,
    pub(crate) pixel_format: String,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) level: i32,
    pub(crate) frame_rate: f64,
    pub(crate) color_transfer: String,
}

#[derive(Debug, Clone)]
pub(crate) struct AudioTrack {
    pub(crate) codec: String,
    pub(crate) profile: String,
    pub(crate) channels: u32,
}

#[derive(Debug, Clone)]
pub(crate) struct MediaInfo {
    pub(crate) format: String,
    pub(crate) duration: f64,
    pub(crate) video: VideoTrack,
    pub(crate) audio: Option<AudioTrack>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum VideoConversion {
    Copy,
    Encode { width: u32, height: u32, hdr: bool },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AudioConversion {
    Absent,
    Copy,
    Encode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct PlaybackPlan {
    pub(crate) direct: bool,
    pub(crate) video: VideoConversion,
    pub(crate) audio: AudioConversion,
}

impl MediaInfo {
    pub(crate) fn accepts_position(&self, seconds: f64) -> bool {
        seconds.is_finite()
            && self.duration.is_finite()
            && seconds >= 0.0
            && seconds < self.duration
    }

    pub(crate) fn plan(&self, quality: Quality) -> PlaybackPlan {
        let video = &self.video;
        let (max_width, max_height) = quality.bounds();
        let hdr = matches!(video.color_transfer.as_str(), "smpte2084" | "arib-std-b67");
        let copy_video = video.codec == "h264"
            && matches!(
                video.profile.as_str(),
                "Constrained Baseline" | "Baseline" | "Main" | "High"
            )
            && video.pixel_format == "yuv420p"
            && (1..=41).contains(&video.level)
            && video.width <= max_width
            && video.height <= max_height
            && video.frame_rate > 0.0
            && video.frame_rate <= 30.0
            && !hdr;
        let audio = match &self.audio {
            None => AudioConversion::Absent,
            Some(track)
                if track.codec == "aac"
                    && track.profile == "LC"
                    && (1..=2).contains(&track.channels) =>
            {
                AudioConversion::Copy
            }
            Some(_) => AudioConversion::Encode,
        };
        let direct = copy_video
            && audio != AudioConversion::Encode
            && self
                .format
                .split(',')
                .any(|format| format == "mp4" || format == "mov");
        PlaybackPlan {
            direct,
            video: if copy_video {
                VideoConversion::Copy
            } else {
                VideoConversion::Encode {
                    width: max_width,
                    height: max_height,
                    hdr,
                }
            },
            audio,
        }
    }
}

impl PlaybackPlan {
    pub(crate) const fn description(self) -> &'static str {
        match (self.direct, self.video, self.audio) {
            (true, _, _) => "direct",
            (false, VideoConversion::Copy, AudioConversion::Absent | AudioConversion::Copy) => {
                "remux"
            }
            (false, VideoConversion::Copy, AudioConversion::Encode) => "audio",
            (false, VideoConversion::Encode { .. }, _) => "transcode",
        }
    }
}

#[cfg(test)]
mod tests;
