//! Pure catalog value rules exercised without external adapters.
use super::{Category, Cursor, EpisodeSelection, Page, SearchQuery, TitleId};
#[test]
fn page_defaults_when_unspecified() {
    // Given
    let raw = 0;
    // When
    let page = Page::parse(raw).unwrap();
    // Then
    assert_eq!(page.number(), 1);
}
#[test]
fn query_trims_when_parsed() {
    // Given
    let raw = "  cinema  ";
    // When
    let query = SearchQuery::parse(raw).unwrap();
    // Then
    assert_eq!(query.text(), "cinema");
}
#[test]
fn filters_reject_when_category_is_not_popular() {
    // Given
    let genre = 18;
    // When
    let result = Category::parse(2, genre);
    // Then
    assert!(result.is_err());
}
#[test]
fn cursor_rejects_when_coordinates_are_invalid() {
    // Given
    let token = "v1:2:0";
    // When
    let result = Cursor::parse(token);
    // Then
    assert!(result.is_err());
}
#[test]
fn title_rejects_when_episode_coordinates_present() {
    // Given
    let coordinates = true;
    // When
    let result = TitleId::parse(2, 10, coordinates);
    // Then
    assert!(result.is_err());
}
#[test]
fn episodes_accept_specials_when_season_is_zero() {
    // Given
    let season = 0;
    // When
    let result = EpisodeSelection::parse(10, season);
    // Then
    assert!(result.is_ok());
}
