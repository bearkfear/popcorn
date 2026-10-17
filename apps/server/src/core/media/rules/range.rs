//! Pure single-byte-range selection with multipart fallback semantics.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RangeError {
    Malformed,
    Unsatisfiable,
}

pub(crate) fn parse_range(
    value: Option<&str>,
    size: u64,
) -> Result<Option<(u64, u64)>, RangeError> {
    let Some(value) = value else { return Ok(None) };
    let spec = value.strip_prefix("bytes=").ok_or(RangeError::Malformed)?;
    if spec.contains(',') {
        return Ok(None);
    }
    let (start, end) = spec.split_once('-').ok_or(RangeError::Malformed)?;
    if start.is_empty() {
        let suffix = end.parse::<u64>().map_err(|_| RangeError::Malformed)?;
        if suffix == 0 || size == 0 {
            return Err(RangeError::Unsatisfiable);
        }
        return Ok(Some((size.saturating_sub(suffix), size - 1)));
    }
    let start = start.parse::<u64>().map_err(|_| RangeError::Malformed)?;
    if start >= size {
        return Err(RangeError::Unsatisfiable);
    }
    let end = if end.is_empty() {
        size - 1
    } else {
        end.parse::<u64>()
            .map_err(|_| RangeError::Malformed)?
            .min(size - 1)
    };
    if end < start {
        return Err(RangeError::Unsatisfiable);
    }
    Ok(Some((start, end)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn range_parser_covers_player_request_forms() {
        // Given
        let forms = [
            (None, Ok(None)),
            (Some("bytes=10-19"), Ok(Some((10, 19)))),
            (Some("bytes=10-"), Ok(Some((10, 99)))),
            (Some("bytes=-10"), Ok(Some((90, 99)))),
            (Some("bytes=0-1,4-5"), Ok(None)),
            (Some("bytes=100-"), Err(RangeError::Unsatisfiable)),
            (Some("bytes=20-10"), Err(RangeError::Unsatisfiable)),
            (Some("bytes=-0"), Err(RangeError::Unsatisfiable)),
            (Some("items=0-1"), Err(RangeError::Malformed)),
        ];
        // When
        let results: Vec<_> = forms
            .iter()
            .map(|(value, _)| parse_range(*value, 100))
            .collect();
        // Then
        assert_eq!(
            results,
            forms
                .into_iter()
                .map(|(_, expected)| expected)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn suffix_cannot_select_empty_content() {
        // Given
        let value = Some("bytes=-10");
        // When
        let result = parse_range(value, 0);
        // Then
        assert_eq!(result, Err(RangeError::Unsatisfiable));
    }
}
