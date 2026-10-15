//! Transport-independent media identities, source metadata and playback rules.

pub mod content;
pub mod range;

pub(crate) use content::{Content, Coordinates, MediaKind};
pub(crate) use range::{RangeError, parse_range};

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
#[error("invalid source request")]
pub(crate) struct InvalidMedia;

#[derive(Debug, Clone)]
pub(crate) enum SourceInput {
    Magnet(String),
    TorrentFile(Vec<u8>),
}

impl SourceInput {
    pub(crate) fn validate(&self) -> Result<(), InvalidMedia> {
        let valid = match self {
            Self::Magnet(value) => value.len() <= 8192 && value.starts_with("magnet:?"),
            Self::TorrentFile(bytes) => !bytes.is_empty() && bytes.len() <= 10 * 1024 * 1024,
        };
        if valid { Ok(()) } else { Err(InvalidMedia) }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct SourceFile {
    pub(crate) file_index: u32,
    pub(crate) name: String,
    pub(crate) size_bytes: u64,
    pub(crate) likely_media: bool,
}

#[derive(Debug, Clone)]
pub(crate) struct Source {
    pub(crate) id: String,
    pub(crate) content: Content,
    pub(crate) files: Vec<SourceFile>,
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum PlaybackState {
    Preparing,
    Ready,
    Failed,
    Paused,
}

#[derive(Debug)]
pub(crate) struct Playback {
    pub(crate) id: String,
    pub(crate) state: PlaybackState,
    pub(crate) media_url: String,
    pub(crate) size_bytes: u64,
    pub(crate) mime_type: &'static str,
    pub(crate) downloaded_bytes: u64,
    pub(crate) total_bytes: u64,
    pub(crate) download_bytes_per_second: u64,
    pub(crate) peers: u32,
}

#[derive(Debug)]
pub(crate) struct CacheSettings {
    pub(crate) directory: String,
    pub(crate) limit_bytes: u64,
    pub(crate) used_bytes: u64,
}

pub(crate) const DEFAULT_CACHE_LIMIT: u64 = 20 * 1024 * 1024 * 1024;

pub(crate) fn validate_cache_limit(value: u64) -> Result<(), InvalidMedia> {
    if (512 * 1024 * 1024..=1024 * 1024 * 1024 * 1024).contains(&value) {
        Ok(())
    } else {
        Err(InvalidMedia)
    }
}

pub(crate) fn mime_type(name: &str) -> &'static str {
    match name
        .rsplit('.')
        .next()
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("mp4" | "m4v") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mov") => "video/quicktime",
        Some("mkv") => "video/x-matroska",
        _ => "application/octet-stream",
    }
}

pub(crate) fn is_media(name: &str) -> bool {
    matches!(
        name.rsplit('.')
            .next()
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("mp4" | "m4v" | "mkv" | "webm" | "mov" | "avi")
    )
}

#[cfg(test)]
mod tests {
    use super::{InvalidMedia, validate_cache_limit};

    #[test]
    fn cache_limit_includes_boundaries_and_rejects_values_outside_them() {
        // Given
        let minimum = 512 * 1024 * 1024;
        let maximum = 1024 * 1024 * 1024 * 1024;
        let values = [minimum - 1, minimum, maximum, maximum + 1];
        // When
        let results = values.map(validate_cache_limit);
        // Then
        assert_eq!(
            results,
            [Err(InvalidMedia), Ok(()), Ok(()), Err(InvalidMedia)]
        );
    }
}
