//! Validates the nonzero TMDB identity used to select a television series.

use crate::core::catalog::CatalogError;

#[derive(Clone, Copy, Debug)]
pub(crate) struct SeriesId(u32);
impl SeriesId {
    pub(crate) const fn parse(id: u32) -> Result<Self, CatalogError> {
        if id == 0 {
            return Err(CatalogError::Invalid("series ID is required"));
        }
        Ok(Self(id))
    }
    pub(crate) const fn number(self) -> u32 {
        self.0
    }
}
