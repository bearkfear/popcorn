//! Conservative selection of a main video using metadata available before downloading.

use super::{SourceFile, is_media};

pub(crate) fn recommend(files: &[SourceFile]) -> Option<u32> {
    let mut candidates: Vec<_> = files.iter().filter(|file| {
        file.size_bytes > 0 && is_media(&file.name) && !is_extra(&file.name)
    }).collect();
    candidates.sort_by_key(|file| std::cmp::Reverse(file.size_bytes));
    let first = candidates.first()?;
    if candidates.len() == 1 {
        return Some(first.file_index);
    }
    // Do not guess between two full versions, episodes, or split movie parts.
    // A dominant feature must be substantial and at least four times its runner-up.
    let second = candidates[1];
    (first.size_bytes >= 100 * 1024 * 1024 && first.size_bytes / 4 >= second.size_bytes)
        .then_some(first.file_index)
}

fn is_extra(name: &str) -> bool {
    // Match complete filename tokens; e.g. "Sampled Life" is not a sample.
    name.to_lowercase().split(|c: char| !c.is_alphanumeric()).any(|token| {
        matches!(token, "sample" | "samples" | "trailer" | "trailers" | "extras" | "featurette" | "featurettes")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(index: u32, name: &str, mib: u64) -> SourceFile {
        SourceFile { file_index: index, name: name.into(), size_bytes: mib * 1024 * 1024, likely_media: is_media(name) }
    }

    #[test]
    fn selects_video_at_its_original_index_and_ignores_support_files() {
        assert_eq!(recommend(&[file(0, "cover.jpg", 1), file(7, "movie.MKV", 2000), file(8, "sub.srt", 1)]), Some(7));
    }

    #[test]
    fn excludes_samples_and_extras_including_directories() {
        assert_eq!(recommend(&[file(1, "Sample/movie.mkv", 20), file(2, "movie.mp4", 500), file(3, "Extras/interview.mkv", 300)]), Some(2));
        assert_eq!(recommend(&[file(1, "movie.trailer.mp4", 50)]), None);
        assert_eq!(recommend(&[file(1, "Sampled Life.mp4", 500)]), Some(1));
    }

    #[test]
    fn selects_a_dominant_feature_but_preserves_ambiguous_versions_and_parts() {
        assert_eq!(recommend(&[file(1, "movie.mp4", 2000), file(2, "interview.mp4", 100)]), Some(1));
        assert_eq!(recommend(&[file(1, "movie.cd1.avi", 700), file(2, "movie.cd2.avi", 650)]), None);
        assert_eq!(recommend(&[file(1, "movie.1080p.mkv", 2000), file(2, "movie.720p.mkv", 1000)]), None);
        assert_eq!(recommend(&[]), None);
    }
}
