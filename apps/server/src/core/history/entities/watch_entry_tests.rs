//! Regression coverage for history progress and resume decisions.

use super::*;

fn entry(position: f64) -> WatchEntry {
    WatchEntry {
        content: Content::new(MediaKind::Movie, 42, Coordinates::Title).unwrap(),
        title: TitleData {
            media_type: 1,
            tmdb_id: 42,
            title: "Film".into(),
            overview: String::new(),
            release_year: 2026,
            poster_url: String::new(),
            backdrop_url: String::new(),
            vote_average: 0.0,
            genres: vec![],
            cast: vec![],
            runtime_minutes: 90,
            seasons: vec![],
            trailer_key: String::new(),
        },
        status: WatchStatus::Watching,
        position,
        duration: 100.0,
        updated_at: 1.0,
        source_id: None,
        file_index: None,
        audio_stream_index: None,
        quality: 1,
    }
}

#[test]
fn completion_threshold_and_explicit_end_disable_resume() {
    let almost = entry(94.9).progress(None, false).unwrap();
    assert_eq!(almost.status, WatchStatus::Watching);
    assert_eq!(almost.resume_seconds(), 94.9);
    let complete = entry(95.0).progress(None, false).unwrap();
    assert_eq!(complete.status, WatchStatus::Watched);
    assert_eq!(complete.resume_seconds(), 0.0);
    assert_eq!(
        entry(10.0).progress(None, true).unwrap().status,
        WatchStatus::Watched
    );
}

#[test]
fn failed_load_cannot_erase_saved_progress() {
    assert!(entry(0.0).progress(Some(&entry(50.0)), false).is_none());
    assert!(entry(0.0).progress(Some(&entry(50.0)), true).is_some());
}

#[test]
fn invalid_times_and_quality_are_rejected() {
    for position in [f64::NAN, f64::INFINITY, -1.0] {
        assert!(entry(position).progress(None, false).is_none());
    }
    let mut invalid = entry(50.0);
    invalid.duration = 0.0;
    assert!(invalid.progress(None, false).is_none());
    let mut invalid = entry(50.0);
    invalid.quality = 0;
    assert!(!invalid.validate());
    assert_eq!(entry(150.0).progress(None, false).unwrap().position, 100.0);
}

#[test]
fn episodes_have_independent_keys_and_short_sessions_restart() {
    let mut first = entry(4.0);
    assert_eq!(first.resume_seconds(), 0.0);
    first.content = Content::new(
        MediaKind::Tv,
        42,
        Coordinates::Episode {
            season: 0,
            episode: 1,
        },
    )
    .unwrap();
    let mut second = first.clone();
    second.content = Content::new(
        MediaKind::Tv,
        42,
        Coordinates::Episode {
            season: 0,
            episode: 2,
        },
    )
    .unwrap();
    assert_ne!(first.key(), second.key());
    assert_ne!(first.key(), entry(4.0).key());
}
