//! Describes one source file by its torrent index, name, size and media classification.

#[derive(Debug, Clone)]
pub(crate) struct SourceFile {
    pub(crate) file_index: u32,
    pub(crate) name: String,
    pub(crate) size_bytes: u64,
    pub(crate) likely_media: bool,
}
