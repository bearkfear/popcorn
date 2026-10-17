//! Declares catalog entities and reexports their types.

pub mod episode;
pub mod genre;
pub mod season;
pub mod title;

pub(crate) use episode::EpisodeData;
pub(crate) use genre::GenreData;
pub(crate) use season::SeasonData;
pub(crate) use title::TitleData;
