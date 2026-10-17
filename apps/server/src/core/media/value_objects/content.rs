//! Validated title identity and optional television episode coordinates.

use crate::core::media::InvalidMedia;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MediaKind {
    Movie,
    Tv,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Coordinates {
    Title,
    Episode { season: u32, episode: u32 },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Content {
    kind: MediaKind,
    tmdb_id: u32,
    coordinates: Coordinates,
}

impl Content {
    pub(crate) const fn new(
        kind: MediaKind,
        tmdb_id: u32,
        coordinates: Coordinates,
    ) -> Result<Self, InvalidMedia> {
        if tmdb_id == 0
            || matches!(
                (kind, coordinates),
                (MediaKind::Movie, Coordinates::Episode { .. })
            )
        {
            return Err(InvalidMedia);
        }
        Ok(Self {
            kind,
            tmdb_id,
            coordinates,
        })
    }

    pub(crate) const fn kind(&self) -> MediaKind {
        self.kind
    }

    pub(crate) const fn tmdb_id(&self) -> u32 {
        self.tmdb_id
    }

    pub(crate) const fn coordinates(&self) -> Coordinates {
        self.coordinates
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn movie_rejects_episode_coordinates() {
        // Given
        let coordinates = Coordinates::Episode {
            season: 1,
            episode: 2,
        };
        // When
        let result = Content::new(MediaKind::Movie, 7, coordinates);
        // Then
        assert_eq!(result, Err(InvalidMedia));
    }

    #[test]
    fn television_preserves_special_episode_coordinates() {
        // Given
        let coordinates = Coordinates::Episode {
            season: 0,
            episode: 0,
        };
        // When
        let content = Content::new(MediaKind::Tv, 7, coordinates).unwrap();
        // Then
        assert_eq!(content.coordinates(), coordinates);
    }

    #[test]
    fn title_requires_nonzero_identity() {
        // Given
        let coordinates = Coordinates::Title;
        // When
        let result = Content::new(MediaKind::Tv, 0, coordinates);
        // Then
        assert_eq!(result, Err(InvalidMedia));
    }
}
