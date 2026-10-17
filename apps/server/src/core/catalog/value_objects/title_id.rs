//! Validates the composite media-type and TMDB identity of a catalog title.

use super::media_type::MediaType;
use crate::core::catalog::CatalogError;

#[derive(Clone, Copy, Debug)]
pub(crate) struct TitleId {
    pub(crate) media_type: MediaType,
    pub(crate) tmdb_id: u32,
}
impl TitleId {
    pub(crate) fn parse(media: i32, id: u32, coordinates: bool) -> Result<Self, CatalogError> {
        if !matches!(media, 1 | 2) || id == 0 || coordinates {
            return Err(CatalogError::Invalid(
                "content must identify a movie or TV title without episode coordinates",
            ));
        }
        Ok(Self {
            media_type: MediaType::parse(media)?,
            tmdb_id: id,
        })
    }
}
