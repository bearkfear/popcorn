//! Defines bounded, independently seekable segments for native HLS playback.

pub(crate) const SEGMENT_SECONDS: f64 = 6.0;

pub(crate) fn segment_count(duration: f64) -> Option<u32> {
    let count = (duration / SEGMENT_SECONDS).ceil();
    if !duration.is_finite() || duration <= 0.0 || count > 100_000.0 {
        return None;
    }
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    Some(count as u32)
}

pub(crate) fn segment(duration: f64, index: u32) -> Option<std::ops::Range<f64>> {
    if index >= segment_count(duration)? {
        return None;
    }
    let start = f64::from(index) * SEGMENT_SECONDS;
    Some(start..(start + SEGMENT_SECONDS).min(duration))
}

#[cfg(test)]
mod tests {
    use super::{segment, segment_count};

    #[test]
    fn segments_cover_the_timeline_and_trim_the_last_segment() {
        assert_eq!(segment_count(14.5), Some(3));
        assert_eq!(segment(14.5, 0), Some(0.0..6.0));
        assert_eq!(segment(14.5, 1), Some(6.0..12.0));
        assert_eq!(segment(14.5, 2), Some(12.0..14.5));
        assert_eq!(segment(14.5, 3), None);
        assert_eq!(segment_count(12.0), Some(2));
        assert_eq!(segment(12.0, 2), None);
    }

    #[test]
    fn invalid_durations_and_unbounded_playlists_are_rejected() {
        for duration in [0.0, -1.0, f64::NAN, f64::INFINITY, 600_001.0] {
            assert_eq!(segment_count(duration), None);
            assert_eq!(segment(duration, 0), None);
        }
        assert_eq!(segment(10.0, u32::MAX), None);
    }
}
