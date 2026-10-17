//! Validates portable catalog identity, episode coordinates and bounded versioned payloads.

use super::*;

fn catalog() -> SourceCatalog {
    SourceCatalog {
        format: "popcorn-source-catalog".to_owned(),
        version: 1,
        name: "Minha seleção".to_owned(),
        description: String::new(),
        sources: vec![CatalogSource {
            info_hash: "a".repeat(40),
            torrent_base64: "YQ==".to_owned(),
            bindings: vec![CatalogBinding {
                media_type: "movie".to_owned(),
                tmdb_id: 42,
                season_number: None,
                episode_number: None,
            }],
        }],
    }
}

#[test]
fn round_trip_preserves_shared_torrent_bindings_and_episode_zero()
-> Result<(), Box<dyn std::error::Error>> {
    let mut value = catalog();
    value.sources[0].bindings.push(CatalogBinding {
        media_type: "tv".to_owned(),
        tmdb_id: 7,
        season_number: Some(0),
        episode_number: Some(0),
    });
    let parsed = SourceCatalog::parse(&serde_json::to_string(&value)?)?;
    assert_eq!(parsed.sources[0].bindings, value.sources[0].bindings);
    Ok(())
}

#[test]
fn empty_catalog_is_valid_for_explicit_replacement() {
    let mut value = catalog();
    value.sources.clear();
    assert!(value.validate().is_ok());
}

#[test]
fn duplicate_sources_or_bindings_are_rejected() {
    let mut value = catalog();
    let binding = value.sources[0].bindings[0].clone();
    value.sources[0].bindings.push(binding);
    assert!(value.validate().is_err());
    let document = serde_json::to_string(&catalog()).unwrap_or_default();
    let mut value = catalog();
    if let Ok(other) = SourceCatalog::parse(&document) {
        value.sources.extend(other.sources);
    }
    assert!(value.validate().is_err());
}

#[test]
fn unsupported_version_and_malformed_hash_are_rejected() {
    let mut value = catalog();
    value.version = 2;
    assert!(value.validate().is_err());
    value.version = 1;
    value.sources[0].info_hash = "x".repeat(40);
    assert!(value.validate().is_err());
}

#[test]
fn invalid_content_identity_and_partial_episode_are_rejected() {
    let mut value = catalog();
    value.sources[0].bindings[0].tmdb_id = 0;
    assert!(value.validate().is_err());
    value.sources[0].bindings[0].tmdb_id = 42;
    value.sources[0].bindings[0].season_number = Some(1);
    assert!(value.validate().is_err());
    value.sources[0].bindings[0].episode_number = Some(1);
    assert!(value.validate().is_err());
}

#[test]
fn malformed_json_and_oversized_documents_are_rejected() {
    assert!(SourceCatalog::parse("{}").is_err());
    assert!(SourceCatalog::parse(&" ".repeat(MAX_ARCHIVE_BYTES + 1)).is_err());
}
