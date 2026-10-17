//! Defines movie and television media types and their validated numeric mapping.

use crate::core::catalog::CatalogError;

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
