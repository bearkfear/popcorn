//! Declares TMDB HTTP, caching, credentials and mapping modules and reexports the adapter.

pub mod adapter;
pub mod cache;
pub mod catalog;
pub mod client;
pub mod credentials;
pub mod mapping;
pub mod ports;

pub(crate) use crate::core::catalog::{
    Cached, CastData, ConnectionStatus, EpisodeData, GenreData, SeasonData, TitleData, TitlePage,
};
pub(super) use crate::core::catalog::{CatalogError as TmdbError, ReadAccessToken as Secret};
pub(crate) use adapter::Tmdb;
