//! Parses and formats the versioned snapshot pagination cursor.

use crate::core::catalog::CatalogError;

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
