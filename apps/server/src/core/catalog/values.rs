//! Validated catalog query values shared by all entrypoints.
use super::CatalogError;

#[derive(Clone, Copy, Debug)]
pub(crate) enum MediaType {
    Movie,
    Tv,
}
impl MediaType {
    pub(crate) const fn parse(value: i32) -> Result<Self, CatalogError> {
        match value {
            1 => Ok(Self::Movie),
            2 => Ok(Self::Tv),
            _ => Err(CatalogError::Invalid("media type must be movie or TV")),
        }
    }
    pub(crate) const fn number(self) -> u32 {
        match self {
            Self::Movie => 1,
            Self::Tv => 2,
        }
    }
}
#[derive(Clone, Copy, Debug)]
pub(crate) enum Category {
    Popular,
    Upcoming,
    TopRated,
}
impl Category {
    pub(crate) const fn parse(value: i32, genre: u32) -> Result<Self, CatalogError> {
        let category = match value {
            0 | 1 => Self::Popular,
            2 => Self::Upcoming,
            3 => Self::TopRated,
            _ => return Err(CatalogError::Invalid("unknown catalog category")),
        };
        if genre > 0 && !matches!(category, Self::Popular) {
            return Err(CatalogError::Invalid(
                "genre filtering applies to popular titles",
            ));
        }
        Ok(category)
    }
    pub(crate) const fn path(self) -> &'static str {
        match self {
            Self::Popular => "popular",
            Self::Upcoming => "upcoming",
            Self::TopRated => "top_rated",
        }
    }
}
#[derive(Clone, Copy, Debug)]
pub(crate) struct Page(u32);
impl Page {
    pub(crate) const fn parse(value: u32) -> Result<Self, CatalogError> {
        match value {
            0 => Ok(Self(1)),
            1..=500 => Ok(Self(value)),
            _ => Err(CatalogError::Invalid("page must be between 1 and 500")),
        }
    }
    pub(crate) const fn number(self) -> u32 {
        self.0
    }
}
#[derive(Debug)]
pub(crate) struct SearchQuery(String);
impl SearchQuery {
    pub(crate) fn parse(value: &str) -> Result<Self, CatalogError> {
        let value = value.trim();
        if value.is_empty() || value.chars().count() > 200 {
            return Err(CatalogError::Invalid(
                "query must contain between 1 and 200 characters",
            ));
        }
        Ok(Self(value.into()))
    }
    pub(crate) fn text(&self) -> &str {
        &self.0
    }
}
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
#[derive(Clone, Copy, Debug)]
pub(crate) struct PageSize(u32);
impl PageSize {
    pub(crate) const fn parse(value: u32) -> Result<Self, CatalogError> {
        match value {
            0 => Ok(Self(20)),
            1..=100 => Ok(Self(value)),
            _ => Err(CatalogError::Invalid("page size must not exceed 100")),
        }
    }
    pub(crate) const fn number(self) -> u32 {
        self.0
    }
}
#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct Cursor {
    pub(crate) media_type: i32,
    pub(crate) tmdb_id: u32,
}
impl Cursor {
    pub(crate) fn parse(token: &str) -> Result<Self, CatalogError> {
        if token.is_empty() {
            return Ok(Self::default());
        }
        let invalid = || CatalogError::Invalid("invalid page token");
        if token.len() > 32 {
            return Err(invalid());
        }
        let mut parts = token.split(':');
        let (Some("v1"), Some(media), Some(id), None) =
            (parts.next(), parts.next(), parts.next(), parts.next())
        else {
            return Err(invalid());
        };
        let media_type = media.parse().map_err(|_| invalid())?;
        let tmdb_id = id.parse().map_err(|_| invalid())?;
        if !matches!(media_type, 1 | 2) || tmdb_id == 0 {
            return Err(invalid());
        }
        Ok(Self {
            media_type,
            tmdb_id,
        })
    }
    pub(crate) fn token(self) -> String {
        format!("v1:{}:{}", self.media_type, self.tmdb_id)
    }
}
