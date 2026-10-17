//! Defines cache settings, validates quota bounds and tests their boundary values.

use super::InvalidMedia;

#[derive(Debug)]
pub(crate) struct CacheSettings {
    pub(crate) directory: String,
    pub(crate) limit_bytes: u64,
    pub(crate) used_bytes: u64,
}

pub(crate) const DEFAULT_CACHE_LIMIT: u64 = 20 * 1024 * 1024 * 1024;

pub(crate) fn validate_cache_limit(value: u64) -> Result<(), InvalidMedia> {
    if (512 * 1024 * 1024..=1024 * 1024 * 1024 * 1024).contains(&value) {
        Ok(())
    } else {
        Err(InvalidMedia)
    }
}

#[cfg(test)]
mod tests {
    use super::{InvalidMedia, validate_cache_limit};

    #[test]
    fn cache_limit_includes_boundaries_and_rejects_values_outside_them() {
        // Given
        let minimum = 512 * 1024 * 1024;
        let maximum = 1024 * 1024 * 1024 * 1024;
        let values = [minimum - 1, minimum, maximum, maximum + 1];
        // When
        let results = values.map(validate_cache_limit);
        // Then
        assert_eq!(
            results,
            [Err(InvalidMedia), Ok(()), Ok(()), Err(InvalidMedia)]
        );
    }
}
