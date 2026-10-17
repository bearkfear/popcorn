//! Describes a metadata query page containing titles and pagination totals.

use crate::core::catalog::TitleData;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct TitlePage {
    pub(crate) titles: Vec<TitleData>,
    pub(crate) page: u32,
    pub(crate) total_pages: u32,
}
