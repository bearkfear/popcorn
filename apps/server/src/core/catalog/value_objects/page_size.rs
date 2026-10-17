//! Validates snapshot page sizes and their default value.

use crate::core::catalog::CatalogError;

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
