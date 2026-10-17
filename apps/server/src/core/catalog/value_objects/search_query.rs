//! Validates and normalizes catalog search text.

use crate::core::catalog::CatalogError;

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
