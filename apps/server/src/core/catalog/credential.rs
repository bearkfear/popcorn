//! Validated metadata credential with redacted debug output.
use std::fmt;

use super::CatalogError;

#[derive(Clone)]
pub(crate) struct ReadAccessToken(String);

impl ReadAccessToken {
    pub(crate) fn parse(value: &str) -> Result<Self, CatalogError> {
        let value = value.trim();
        if value.is_empty() || value.len() > 4096 || !value.bytes().all(|b| b.is_ascii_graphic()) {
            return Err(CatalogError::InvalidCredential);
        }
        Ok(Self(value.into()))
    }

    pub(crate) fn text(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for ReadAccessToken {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("[REDACTED]")
    }
}
