//! Selects explicit or default audio tracks without silently changing the requested language.

use super::{InvalidMedia, PlaybackAudioTrack};

pub(crate) fn select_audio_index(
    tracks: &[PlaybackAudioTrack],
    requested: Option<u32>,
) -> Result<Option<u32>, InvalidMedia> {
    match requested {
        Some(index) if tracks.iter().any(|track| track.stream_index == index) => Ok(Some(index)),
        Some(_) => Err(InvalidMedia),
        None => Ok(tracks
            .iter()
            .find(|track| track.is_default)
            .or_else(|| tracks.first())
            .map(|track| track.stream_index)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tracks() -> Vec<PlaybackAudioTrack> {
        [(1, "por", false), (3, "eng", true)]
            .into_iter()
            .map(|(index, language, default)| PlaybackAudioTrack {
                stream_index: index,
                language: language.into(),
                title: String::new(),
                channels: 2,
                codec: "aac".into(),
                is_default: default,
            })
            .collect()
    }

    #[test]
    fn explicit_language_overrides_the_default_track() {
        // Given two languages with English marked as the default.
        let tracks = tracks();
        // When the user chooses Portuguese.
        let index = select_audio_index(&tracks, Some(1));
        // Then the original stream index is retained.
        assert_eq!(index, Ok(Some(1)));
        assert_eq!(select_audio_index(&tracks, None), Ok(Some(3)));
    }

    #[test]
    fn removed_or_non_audio_streams_are_rejected_instead_of_changing_languages() {
        // Given audio streams one and three (not video stream zero).
        let tracks = tracks();
        // When a stale selection or video index is requested.
        let results = [0, 2, 99].map(|index| select_audio_index(&tracks, Some(index)));
        // Then none can silently fall back to the default language.
        assert_eq!(results, [Err(InvalidMedia); 3]);
    }

    #[test]
    fn silent_media_and_tracks_without_a_default_are_supported() {
        // Given media without a default designation.
        let mut tracks = tracks();
        tracks[1].is_default = false;
        // When no language is requested.
        let results = [
            select_audio_index(&[], None),
            select_audio_index(&tracks, None),
        ];
        // Then silent media stays silent and other media uses its first audio stream.
        assert_eq!(results, [Ok(None), Ok(Some(1))]);
    }
}
