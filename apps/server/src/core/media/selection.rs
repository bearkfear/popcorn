//! Recommends a file only when the source contains exactly one nonempty video.

use super::{SourceFile, is_media};

pub(crate) fn recommend(files: &[SourceFile]) -> Option<u32> {
    let candidates: Vec<_> = files
        .iter()
        .filter(|file| file.size_bytes > 0 && is_media(&file.name))
        .collect();
    let first = candidates.first()?;
    if candidates.len() == 1 && !is_extra(&first.name) {
        return Some(first.file_index);
    }
    None
}

fn is_extra(name: &str) -> bool {
    // Match complete filename tokens; e.g. "Sampled Life" is not a sample.
    name.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .any(|token| {
            matches!(
                token,
                "sample"
                    | "samples"
                    | "trailer"
                    | "trailers"
                    | "extras"
                    | "featurette"
                    | "featurettes"
            )
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(index: u32, name: &str, mib: u64) -> SourceFile {
        SourceFile {
            file_index: index,
            name: name.into(),
            size_bytes: mib * 1024 * 1024,
            likely_media: is_media(name),
        }
    }

    #[test]
    fn selects_video_at_its_original_index_and_ignores_support_files() {
        assert_eq!(
            recommend(&[
                file(0, "cover.jpg", 1),
                file(7, "movie.MKV", 2000),
                file(8, "sub.srt", 1)
            ]),
            Some(7)
        );
    }

    #[test]
    fn requires_choice_when_extra_videos_are_present() {
        assert_eq!(
            recommend(&[
                file(1, "Sample/movie.mkv", 20),
                file(2, "movie.mp4", 500),
                file(3, "Extras/interview.mkv", 300)
            ]),
            None
        );
        assert_eq!(recommend(&[file(1, "movie.trailer.mp4", 50)]), None);
        assert_eq!(recommend(&[file(1, "Sampled Life.mp4", 500)]), Some(1));
    }

    #[test]
    fn requires_choice_even_when_one_video_is_much_larger() {
        assert_eq!(
            recommend(&[file(1, "movie.mp4", 2000), file(2, "interview.mp4", 100)]),
            None
        );
        assert_eq!(
            recommend(&[file(1, "movie.cd1.avi", 700), file(2, "movie.cd2.avi", 650)]),
            None
        );
        assert_eq!(
            recommend(&[
                file(1, "movie.1080p.mkv", 2000),
                file(2, "movie.720p.mkv", 1000)
            ]),
            None
        );
        assert_eq!(recommend(&[]), None);
    }
}
