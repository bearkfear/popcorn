//! Validates remote metadata page numbers and their default value.

use crate::core::catalog::CatalogError;

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
