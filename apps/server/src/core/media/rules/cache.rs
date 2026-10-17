//! Validates cache quota bounds, defines the default and tests boundary values.

use crate::core::media::InvalidMedia;

pub(crate) const MIN_CACHE_LIMIT: u64 = 512 * 1024 * 1024;
pub(crate) const MAX_CACHE_LIMIT: u64 = 1024 * 1024 * 1024 * 1024;

pub(crate) const DEFAULT_CACHE_LIMIT: u64 = 20 * 1024 * 1024 * 1024;

pub(crate) fn validate_cache_limit(value: u64) -> Result<(), InvalidMedia> {
    if (MIN_CACHE_LIMIT..=MAX_CACHE_LIMIT).contains(&value) {
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
