//! Defines source inputs, validates their bounds and describes torrent file metadata.

use super::{Content, InvalidMedia};

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
