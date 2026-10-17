//! Defines torrent source inputs and validates magnet and torrent payload bounds.

use crate::core::media::InvalidMedia;

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
