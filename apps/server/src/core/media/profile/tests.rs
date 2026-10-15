//! Compatibility decisions without processes, operating systems or network access.

use super::*;

fn media(format: &str) -> MediaInfo {
    MediaInfo {
        format: format.into(),
        duration: 60.0,
        video: VideoTrack {
            codec: "h264".into(),
            profile: "High".into(),
            pixel_format: "yuv420p".into(),
            width: 1920,
            height: 1080,
            level: 41,
            frame_rate: 24.0,
            color_transfer: "bt709".into(),
        },
        audio: Some(AudioTrack {
            codec: "aac".into(),
            profile: "LC".into(),
            channels: 2,
        }),
    }
}

#[test]
fn compatible_mp4_is_direct_but_matroska_is_remuxed() {
    // Given
    let mp4 = media("mov,mp4,m4a,3gp,3g2,mj2");
    let mkv = media("matroska,webm");
    // When
    let plans = [mp4.plan(Quality::Auto), mkv.plan(Quality::Auto)];
    // Then
    assert!(plans[0].direct);
    assert!(!plans[1].direct);
    assert_eq!(plans[1].video, VideoConversion::Copy);
    assert_eq!(plans[1].audio, AudioConversion::Copy);
}

#[test]
fn incompatible_audio_does_not_force_video_encoding() {
    // Given
    let mut mkv = media("matroska");
    mkv.audio = Some(AudioTrack {
        codec: "eac3".into(),
        profile: String::new(),
        channels: 6,
    });
    // When
    let plan = mkv.plan(Quality::Auto);
    // Then
    assert!(!plan.direct);
    assert_eq!(plan.video, VideoConversion::Copy);
    assert_eq!(plan.audio, AudioConversion::Encode);
}

#[test]
fn lower_quality_requires_encoding_but_never_upscales_compatible_sources() {
    // Given
    let full_hd = media("matroska");
    let mut small = full_hd.clone();
    small.video.width = 640;
    small.video.height = 360;
    // When
    let plans = [full_hd.plan(Quality::Hd), small.plan(Quality::FullHd)];
    // Then
    assert_eq!(
        plans[0].video,
        VideoConversion::Encode {
            width: 1280,
            height: 720,
            hdr: false
        }
    );
    assert_eq!(plans[1].video, VideoConversion::Copy);
}

#[test]
fn hevc_high_bit_depth_hdr_and_excessive_levels_require_encoding() {
    // Given
    let baseline = media("matroska");
    let mut hevc = baseline.clone();
    hevc.video.codec = "hevc".into();
    let mut ten_bit = baseline.clone();
    ten_bit.video.pixel_format = "yuv420p10le".into();
    let mut hdr = baseline.clone();
    hdr.video.color_transfer = "smpte2084".into();
    let mut high_level = baseline;
    high_level.video.level = 51;
    // When
    let plans = [hevc, ten_bit, hdr, high_level].map(|info| info.plan(Quality::Auto));
    // Then
    for plan in plans {
        assert!(matches!(plan.video, VideoConversion::Encode { .. }));
    }
    assert!(matches!(
        plans[2].video,
        VideoConversion::Encode { hdr: true, .. }
    ));
}

#[test]
fn silent_media_stays_silent() {
    // Given
    let mut info = media("matroska");
    info.audio = None;
    // When
    let plan = info.plan(Quality::Auto);
    // Then
    assert_eq!(plan.audio, AudioConversion::Absent);
    assert_eq!(plan.description(), "remux");
}

#[test]
fn seek_accepts_only_finite_positions_inside_the_movie() {
    // Given
    let info = media("matroska");
    let positions = [-1.0, 0.0, 59.9, 60.0, f64::NAN, f64::INFINITY];
    // When
    let accepted = positions.map(|position| info.accepts_position(position));
    // Then
    assert_eq!(accepted, [false, true, true, false, false, false]);
}
