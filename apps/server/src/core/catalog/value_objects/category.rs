//! Validates catalog categories independently of the genre filter.

use crate::core::catalog::CatalogError;

#[derive(Clone, Copy, Debug)]
pub(crate) enum Category {
    Popular,
    Upcoming,
    TopRated,
}
impl Category {
    pub(crate) const fn parse(value: i32) -> Result<Self, CatalogError> {
        let category = match value {
            0 | 1 => Self::Popular,
            2 => Self::Upcoming,
            3 => Self::TopRated,
            _ => return Err(CatalogError::Invalid("unknown catalog category")),
        };
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
