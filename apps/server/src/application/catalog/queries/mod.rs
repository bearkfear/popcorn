//! Declares catalog query use cases and reexports their request and result types.

pub mod browse_titles;
pub mod get_title;
pub mod get_tmdb_status;
pub mod list_episodes;
pub mod list_genres;
pub mod list_seasons;
pub mod list_titles;
pub mod search_titles;

pub(crate) use browse_titles::BrowseTitles;
pub(crate) use get_title::GetTitle;
pub(crate) use get_tmdb_status::GetTmdbStatus;
pub(crate) use list_episodes::ListEpisodes;
pub(crate) use list_genres::ListGenres;
pub(crate) use list_seasons::ListSeasons;
pub(crate) use list_titles::ListTitles;
pub(crate) use search_titles::SearchTitles;
