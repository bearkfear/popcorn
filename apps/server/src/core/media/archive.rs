//! Versioned portable source catalog format and pure structural validation.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use super::{Content, Coordinates, InvalidMedia, MediaKind};

pub(crate) const MAX_ARCHIVE_BYTES: usize = 32 * 1024 * 1024;

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SourceCatalog {
    pub(crate) format: String,
    pub(crate) version: u32,
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) sources: Vec<CatalogSource>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CatalogSource {
    pub(crate) info_hash: String,
    pub(crate) torrent_base64: String,
    pub(crate) bindings: Vec<CatalogBinding>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CatalogBinding {
    pub(crate) media_type: String,
    pub(crate) tmdb_id: u32,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub(crate) season_number: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub(crate) episode_number: Option<u32>,
}

impl CatalogBinding {
    pub(crate) fn content(&self) -> Result<Content, InvalidMedia> {
        let kind = match self.media_type.as_str() {
            "movie" => MediaKind::Movie,
            "tv" => MediaKind::Tv,
            _ => return Err(InvalidMedia),
        };
        let coordinates = match (self.season_number, self.episode_number) {
            (None, None) => Coordinates::Title,
            (Some(season), Some(episode)) => Coordinates::Episode { season, episode },
            _ => return Err(InvalidMedia),
        };
        Content::new(kind, self.tmdb_id, coordinates)
    }
}

impl SourceCatalog {
    pub(crate) fn parse(document: &str) -> Result<Self, InvalidMedia> {
        if document.len() > MAX_ARCHIVE_BYTES {
            return Err(InvalidMedia);
        }
        let catalog: Self = serde_json::from_str(document).map_err(|_| InvalidMedia)?;
        catalog.validate()?;
        Ok(catalog)
    }

    pub(crate) fn validate(&self) -> Result<(), InvalidMedia> {
        if self.format != "popcorn-source-catalog"
            || self.version != 1
            || self.name.trim().is_empty()
            || self.name.len() > 200
            || self.description.len() > 2000
            || self.sources.len() > 10_000
        {
            return Err(InvalidMedia);
        }
        let mut hashes = HashSet::new();
        let mut binding_count = 0;
        for source in &self.sources {
            if source.info_hash.len() != 40
                || !source
                    .info_hash
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
                || !hashes.insert(&source.info_hash)
                || source.bindings.is_empty()
                || source.torrent_base64.is_empty()
                || source.torrent_base64.len() > 14 * 1024 * 1024
            {
                return Err(InvalidMedia);
            }
            let mut bindings = HashSet::new();
            for binding in &source.bindings {
                binding.content()?;
                if !bindings.insert(binding) {
                    return Err(InvalidMedia);
                }
                binding_count += 1;
                if binding_count > 100_000 {
                    return Err(InvalidMedia);
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
#[path = "archive_tests.rs"]
mod tests;
