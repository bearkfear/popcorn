//! Verifies the minimum title metadata required for catalog discovery.

use super::TitleData;

fn title() -> TitleData {
    TitleData {
        media_type: 1,
        tmdb_id: 42,
        title: "Um filme".into(),
        overview: "Uma história para assistir.".into(),
        release_year: 2026,
        poster_url: "https://image.tmdb.org/t/p/w500/poster.jpg".into(),
        backdrop_url: String::new(),
        vote_average: 0.0,
        genres: Vec::new(),
        cast: Vec::new(),
        runtime_minutes: 0,
        seasons: Vec::new(),
        trailer_key: String::new(),
    }
}

#[test]
fn movies_and_series_do_not_require_optional_detail_metadata() {
    let mut current = title();
    assert!(current.has_catalog_metadata());
    current.media_type = 2;
    assert!(current.has_catalog_metadata());
}

#[test]
fn missing_or_blank_title_overview_and_poster_are_excluded() {
    for blank in ["", " \t\n", "\u{2003}"] {
        let mut current = title();
        current.title = blank.into();
        assert!(!current.has_catalog_metadata());
        current = title();
        current.overview = blank.into();
        assert!(!current.has_catalog_metadata());
        current = title();
        current.poster_url = blank.into();
        assert!(!current.has_catalog_metadata());
    }
}

#[test]
fn unknown_year_and_invalid_identity_are_excluded() {
    for year in [0, 999, 10_000] {
        let mut current = title();
        current.release_year = year;
        assert!(!current.has_catalog_metadata());
    }
    let mut current = title();
    current.tmdb_id = 0;
    assert!(!current.has_catalog_metadata());
    current = title();
    current.media_type = 0;
    assert!(!current.has_catalog_metadata());
}
