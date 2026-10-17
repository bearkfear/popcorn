//! Projects verified torrent pieces into disjoint byte ranges of one selected file.

use std::ops::Range;

pub(crate) fn verified_file_ranges(
    file_offset: u64,
    file_size: u64,
    piece_length: u64,
    have: impl IntoIterator<Item = bool>,
) -> Vec<Range<u64>> {
    let mut ranges: Vec<Range<u64>> = Vec::new();
    if piece_length == 0 || file_size == 0 {
        return ranges;
    }
    let file_end = file_offset.saturating_add(file_size);
    for (index, verified) in have.into_iter().enumerate() {
        let start = (index as u64).saturating_mul(piece_length);
        if start >= file_end {
            break;
        }
        let end = start.saturating_add(piece_length).min(file_end);
        if !verified || end <= file_offset {
            continue;
        }
        let start = start.max(file_offset) - file_offset;
        let end = end - file_offset;
        if let Some(previous) = ranges.last_mut()
            && previous.end == start
        {
            previous.end = end;
        } else {
            ranges.push(start..end);
        }
    }
    ranges
}

#[cfg(test)]
mod tests {
    use super::verified_file_ranges;

    #[test]
    fn preserves_gaps_and_merges_only_adjacent_verified_pieces() {
        assert_eq!(
            verified_file_ranges(0, 60, 10, [true, true, false, true, false, true]),
            vec![0..20, 30..40, 50..60]
        );
    }

    #[test]
    fn clips_shared_pieces_and_excludes_other_files() {
        assert_eq!(
            verified_file_ranges(15, 32, 10, [true, true, false, true, true, true]),
            vec![0..5, 15..32]
        );
    }

    #[test]
    fn handles_complete_absent_and_uninitialized_downloads() {
        assert_eq!(verified_file_ranges(15, 32, 10, [true; 6]), vec![0..32]);
        assert!(verified_file_ranges(15, 32, 10, [false; 6]).is_empty());
        assert!(verified_file_ranges(15, 32, 10, []).is_empty());
        assert!(verified_file_ranges(15, 0, 10, [true; 6]).is_empty());
        assert!(verified_file_ranges(15, 32, 0, [true; 6]).is_empty());
    }
}
