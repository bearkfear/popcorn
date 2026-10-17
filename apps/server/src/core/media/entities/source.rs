//! Defines a source entity identified by its stored ID and bound to content and files.

use crate::core::media::{Content, SourceFile};

#[derive(Debug, Clone)]
pub(crate) struct Source {
    pub(crate) id: String,
    pub(crate) content: Content,
    pub(crate) files: Vec<SourceFile>,
}
