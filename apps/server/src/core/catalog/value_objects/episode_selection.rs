//! Validates a series and season selection, including special seasons.

use super::series_id::SeriesId;
use crate::core::catalog::CatalogError;

#[derive(Clone, Copy, Debug)]
pub(crate) struct EpisodeSelection {
    pub(crate) series: SeriesId,
    pub(crate) season: u32,
}
impl EpisodeSelection {
    pub(crate) fn parse(series: u32, season: u32) -> Result<Self, CatalogError> {
        if series == 0 || season > 10_000 {
            return Err(CatalogError::Invalid(
                "valid series ID and season number are required",
            ));
        }
        Ok(Self {
            series: SeriesId::parse(series)?,
            season,
        })
    }
}
