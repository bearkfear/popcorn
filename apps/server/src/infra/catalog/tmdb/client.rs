//! Executes bounded TMDB HTTP requests with concurrency limits, cooldowns and status translation.
use std::time::Duration;

use reqwest::StatusCode;
use serde::de::DeserializeOwned;
use tokio::time::Instant;

use super::{Secret, Tmdb, TmdbError};

pub(super) const MAX_BODY: usize = 2 * 1024 * 1024;

impl Tmdb {
    async fn check_cooldown(&self) -> Result<(), TmdbError> {
        if let Some(deadline) = *self.cooldown.lock().await
            && let Some(remaining) = deadline.checked_duration_since(Instant::now())
        {
            return Err(TmdbError::RateLimited {
                retry_after_seconds: u32::try_from(remaining.as_secs().saturating_add(1))
                    .unwrap_or(u32::MAX),
            });
        }
        Ok(())
    }

    pub(super) async fn http<T: DeserializeOwned>(
        &self,
        path: &str,
        params: &[(&str, String)],
        token: &Secret,
    ) -> Result<T, TmdbError> {
        // The deadline includes semaphore queueing, headers, and the complete body.
        tokio::time::timeout(Duration::from_secs(8), async {
            self.check_cooldown().await?;
            let _permit = self
                .requests
                .acquire()
                .await
                .map_err(|_| TmdbError::Unavailable)?;
            self.check_cooldown().await?;
            let url = self
                .base_url
                .join(path)
                .map_err(|_| TmdbError::Configuration)?;
            let response = self
                .client
                .get(url)
                .bearer_auth(token.text())
                .header("accept", "application/json")
                .query(params)
                .send()
                .await
                .map_err(|_| TmdbError::Unavailable)?;
            self.check_status(&response).await?;
            decode(response).await
        })
        .await
        .map_err(|_| TmdbError::Unavailable)?
    }

    async fn check_status(&self, response: &reqwest::Response) -> Result<(), TmdbError> {
        match response.status() {
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
                return Err(TmdbError::InvalidCredential);
            }
            StatusCode::NOT_FOUND => return Err(TmdbError::NotFound),
            StatusCode::TOO_MANY_REQUESTS => {
                let retry_after_seconds = response
                    .headers()
                    .get("retry-after")
                    .and_then(|value| value.to_str().ok())
                    .and_then(|value| value.parse::<u32>().ok())
                    .unwrap_or(60)
                    .max(1);
                let deadline = Instant::now() + Duration::from_secs(u64::from(retry_after_seconds));
                let mut cooldown = self.cooldown.lock().await;
                *cooldown = Some(cooldown.map_or(deadline, |current| current.max(deadline)));
                drop(cooldown);
                return Err(TmdbError::RateLimited {
                    retry_after_seconds,
                });
            }
            status if status.is_server_error() => return Err(TmdbError::Unavailable),
            status if !status.is_success() => return Err(TmdbError::InvalidResponse),
            _ => {}
        }
        Ok(())
    }
}

async fn decode<T: DeserializeOwned>(mut response: reqwest::Response) -> Result<T, TmdbError> {
    if response
        .content_length()
        .is_some_and(|length| length > u64::try_from(MAX_BODY).unwrap_or(u64::MAX))
    {
        return Err(TmdbError::InvalidResponse);
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| TmdbError::Unavailable)? {
        if bytes.len().saturating_add(chunk.len()) > MAX_BODY {
            return Err(TmdbError::InvalidResponse);
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| TmdbError::InvalidResponse)
}
