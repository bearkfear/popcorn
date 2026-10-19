//! Exercises combined catalog filters through RPC against a local TMDB fixture.
#![allow(clippy::unwrap_used)]

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use axum::{
    Json, Router,
    extract::{Query, State},
    http::Uri,
};
use chrono::{Duration, Utc};
use popcorn_server::{Backend, ServerConfig, create_catalog};
use serde_json::{Value, json};
use tokio::{net::TcpListener, sync::oneshot};

type Requests = Arc<Mutex<Vec<(String, HashMap<String, String>)>>>;

async fn tmdb_fixture(
    State(requests): State<Requests>,
    uri: Uri,
    Query(params): Query<HashMap<String, String>>,
) -> Json<Value> {
    requests
        .lock()
        .unwrap()
        .push((uri.path().to_owned(), params));
    Json(json!({"page": 1, "total_pages": 2, "results": [{
        "id": 42, "title": "Drama", "name": "Drama", "genre_ids": [18]
    }]}))
}

#[tokio::test]
async fn genre_combines_with_every_collection_for_movies_and_series() {
    let requests = Requests::default();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let fixture_address = listener.local_addr().unwrap();
    let fixture = tokio::spawn(
        axum::serve(
            listener,
            Router::new()
                .fallback(tmdb_fixture)
                .with_state(requests.clone()),
        )
        .into_future(),
    );

    let directory = tempfile::tempdir().unwrap();
    let catalog = directory.path().join("catalog.sqlite");
    create_catalog(&catalog).await.unwrap();
    let token = "a".repeat(64);
    let token_file = directory.path().join("token");
    tokio::fs::write(&token_file, &token).await.unwrap();
    let config = ServerConfig::new(catalog, directory.path().join("data"), token_file)
        .with_tmdb_token("fixture-read-access-token".into())
        .with_tmdb_api_base(&format!("http://{fixture_address}/"))
        .unwrap();
    let backend = Backend::prepare(config).await.unwrap();
    let endpoint = format!(
        "http://{}/popcorn.v1.CatalogService/BrowseTitles",
        backend.ready().address
    );
    let (stop, shutdown) = oneshot::channel();
    let server = tokio::spawn(backend.run(async move {
        let _ = shutdown.await;
    }));
    let client = reqwest::Client::new();

    for media_type in [1, 2] {
        for category in [1, 2, 3] {
            let response = client.post(&endpoint).bearer_auth(&token)
                .header("connect-protocol-version", "1")
                .json(&json!({"mediaType": media_type, "category": category, "genreId": 18, "page": 1}))
                .send().await.unwrap();
            let status = response.status();
            let body: Value = response.json().await.unwrap();
            assert!(status.is_success(), "{status}: {body}");
            assert_eq!(body["titles"][0]["title"], "Drama");
        }
    }

    {
        let calls = requests.lock().unwrap();
        assert_eq!(calls.len(), 6);
        for (index, (path, params)) in calls.iter().enumerate() {
            let movie = index < 3;
            assert_eq!(
                path,
                if movie {
                    "/discover/movie"
                } else {
                    "/discover/tv"
                }
            );
            assert_eq!(params["with_genres"], "18");
            assert_eq!(params["page"], "1");
            match index % 3 {
                0 => assert_eq!(params["sort_by"], "popularity.desc"),
                1 => {
                    let today = Utc::now().date_naive();
                    let (from, until, days) = if movie {
                        assert_eq!(params["region"], "BR");
                        assert_eq!(params["with_release_type"], "2|3");
                        ("release_date.gte", "release_date.lte", 30)
                    } else {
                        ("air_date.gte", "air_date.lte", 7)
                    };
                    assert_eq!(params[from], today.to_string());
                    assert_eq!(params[until], (today + Duration::days(days)).to_string());
                }
                _ => {
                    assert_eq!(params["sort_by"], "vote_average.desc");
                    assert_eq!(params["vote_count.gte"], "200");
                }
            }
        }
    }

    stop.send(()).unwrap();
    server.await.unwrap().unwrap();
    fixture.abort();
}
