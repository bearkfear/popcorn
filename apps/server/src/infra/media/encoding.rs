//! Builds selective `FFmpeg` conversions while preserving the source media timeline.

use tokio::process::Command;

use crate::core::media::value_objects::playback_profile::{AudioConversion, VideoConversion};

use super::{
    preparation::{ConversionOutput, PreparedMedia},
    tools::MediaTools,
};

impl MediaTools {
    pub(super) fn conversion(
        &self,
        media: &PreparedMedia,
        url: &str,
        start: f64,
        output: ConversionOutput,
    ) -> Command {
        let video = match (output, media.plan.video) {
            // Every independently requested segment must begin with a keyframe.
            (ConversionOutput::HlsSegment { .. }, VideoConversion::Copy) => {
                VideoConversion::Encode {
                    width: 1920,
                    height: 1080,
                    hdr: false,
                }
            }
            (_, video) => video,
        };
        let mut command = self.command(false);
        command
            .args([
                "-nostdin",
                "-hide_banner",
                "-loglevel",
                "warning",
                "-copyts",
                "-start_at_zero",
                "-ss",
            ])
            .arg(start.to_string());
        if video == VideoConversion::Copy {
            command.arg("-noaccurate_seek");
        }
        command
            .args([
                "-rw_timeout",
                "90000000",
                "-protocol_whitelist",
                "http,tcp",
                "-format_whitelist",
                "matroska,webm,mov,avi,mpegts,ogg",
                // WebKit can drain HTTP into its fetch queue even when JS stops reading.
                // Pace at the producer so remux cannot queue an entire movie in memory.
                "-readrate",
                "1",
                "-readrate_initial_burst",
                "5",
                "-readrate_catchup",
                "1",
                "-i",
                url,
                "-map",
            ])
            .arg(format!("0:{}", media.inspected.video_index));
        if let Some(index) = media.inspected.audio_index {
            command.arg("-map").arg(format!("0:{index}"));
        }
        command.args(["-sn", "-dn", "-map_metadata", "-1", "-map_chapters", "-1"]);
        video_options(&mut command, video);
        audio_options(&mut command, media.plan.audio, video, start);
        output_options(&mut command, output);
        command
    }
}

fn output_options(command: &mut Command, output: ConversionOutput) {
    if let ConversionOutput::HlsSegment { end } = output {
        command.args([
            "-to",
            &end.to_string(),
            "-output_ts_offset",
            "3600",
            "-mpegts_flags",
            "+resend_headers",
            "-muxdelay",
            "0",
            "-muxpreload",
            "0",
            "-f",
            "mpegts",
            "pipe:1",
        ]);
        return;
    }
    command.args([
        "-avoid_negative_ts",
        "disabled",
        "-output_ts_offset",
        "3600",
        "-use_editlist",
        "0",
        "-movflags",
        "+empty_moov+default_base_moof+frag_keyframe+frag_discont",
        "-frag_duration",
        "1000000",
        "-flush_packets",
        "1",
        "-f",
        "mp4",
        "pipe:1",
    ]);
}

fn video_options(command: &mut Command, conversion: VideoConversion) {
    match conversion {
        VideoConversion::Copy => {
            command.args(["-c:v", "copy", "-tag:v", "avc1"]);
        }
        VideoConversion::Encode { width, height, hdr } => {
            let scale = format!(
                "scale=w='min(iw,{width})':h='min(ih,{height})':force_original_aspect_ratio=decrease:force_divisible_by=2"
            );
            let filter = if hdr {
                format!(
                    "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,\
                     tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,{scale},format=yuv420p"
                )
            } else {
                scale
            };
            command
                .args([
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-crf",
                    "23",
                    "-maxrate",
                    "8M",
                    "-bufsize",
                    "16M",
                    "-pix_fmt",
                    "yuv420p",
                    "-profile:v",
                    "high",
                    "-level:v",
                    "4.1",
                    "-r",
                    "30",
                    "-g",
                    "60",
                    "-threads",
                    "2",
                    "-vf",
                ])
                .arg(filter);
            if hdr {
                command.args([
                    "-colorspace",
                    "bt709",
                    "-color_primaries",
                    "bt709",
                    "-color_trc",
                    "bt709",
                ]);
            }
        }
    }
}

fn audio_options(
    command: &mut Command,
    audio: AudioConversion,
    video: VideoConversion,
    start: f64,
) {
    match audio {
        AudioConversion::Absent => {
            command.arg("-an");
        }
        AudioConversion::Copy if video == VideoConversion::Copy || start == 0.0 => {
            command.args(["-c:a", "copy"]);
        }
        AudioConversion::Copy | AudioConversion::Encode => {
            command.args([
                "-c:a",
                "aac",
                "-profile:a",
                "aac_low",
                "-ac",
                "2",
                "-ar",
                "48000",
                "-b:a",
                "160k",
            ]);
        }
    }
}
