//! Defines a catalog genre identified by its provider genre ID.

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct GenreData {
    pub(crate) id: u32,
    pub(crate) name: String,
}
