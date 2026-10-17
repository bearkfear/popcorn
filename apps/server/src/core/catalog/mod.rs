//! Declares catalog entities, value objects and domain errors.

pub mod entities;
pub mod error;
pub mod value_objects;

pub(crate) use entities::{EpisodeData, GenreData, SeasonData, TitleData};
pub(crate) use error::CatalogError;
pub(crate) use value_objects::{
    CastData, Category, Cursor, EpisodeSelection, MediaType, Page, PageSize, ReadAccessToken,
    SearchQuery, SeriesId, TitleId,
};
