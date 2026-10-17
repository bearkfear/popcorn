//! Declares TMDB HTTP, caching, credentials and mapping modules and reexports the adapter.

use crate::application::catalog::cached::Cached;
use crate::application::catalog::connection_status::ConnectionStatus;
use crate::application::catalog::title_page::TitlePage;
pub mod adapter;
pub mod cache;
pub mod catalog;
pub mod client;
pub mod credentials;
pub mod mapping;
pub mod ports;

pub(crate) use crate::core::catalog::{CastData, EpisodeData, GenreData, SeasonData, TitleData};
pub(super) use crate::core::catalog::{CatalogError as TmdbError, ReadAccessToken as Secret};
pub(crate) use adapter::Tmdb;
