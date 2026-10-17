//! Reads and refreshes cached TMDB responses with TTLs and stale fallback on transient failures.
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Serialize, de::DeserializeOwned};

use super::{Cached, Tmdb, TmdbError};

impl Tmdb {
    pub(super) async fn cached<R, T, F>(
        &self,
        path: &str,
        mut params: Vec<(&str, String)>,
        ttl: i64,
        map: F,
    ) -> Result<Cached<T>, TmdbError>
    where
        R: DeserializeOwned + Send,
        T: Serialize + DeserializeOwned + Send + Sync,
        F: FnOnce(R) -> T + Send,
    {
        let token = self
            .credential
            .read()
            .await
            .token
            .clone()
            .ok_or(TmdbError::NotConfigured)?;
        params.push(("language", "pt-BR".into()));
        params.sort_unstable_by(|a, b| a.0.cmp(b.0));
        let key =
            serde_json::to_string(&(path, &params)).map_err(|_| TmdbError::InvalidResponse)?;
        let stored: Option<(String, i64)> =
            sqlx::query_as("SELECT payload, expires_at FROM catalog_cache WHERE cache_key = ?")
                .bind(&key)
                .fetch_optional(&self.user)
                .await?;
        let now = unix_seconds()?;
        if let Some((payload, expiry)) = &stored
            && *expiry > now
        {
            return Ok(Cached {
                data: serde_json::from_str(payload).map_err(|_| TmdbError::InvalidResponse)?,
                stale: false,
            });
        }
        match self.http::<R>(path, &params, &token).await {
            Ok(raw) => {
                let data = map(raw);
                self.store(&key, &data, ttl).await?;
                Ok(Cached { data, stale: false })
            }
            Err(error @ (TmdbError::Unavailable | TmdbError::RateLimited { .. })) => match stored {
                Some((payload, _)) => Ok(Cached {
                    data: serde_json::from_str(&payload).map_err(|_| TmdbError::InvalidResponse)?,
                    stale: true,
                }),
                None => Err(error),
            },
            Err(error) => Err(error),
        }
    }
    async fn store<T: Serialize + Sync>(
        &self,
        key: &str,
        data: &T,
        ttl: i64,
    ) -> Result<(), TmdbError> {
        let payload = serde_json::to_string(data).map_err(|_| TmdbError::InvalidResponse)?;
        let now = unix_seconds()?;
        sqlx::query(
            "INSERT INTO catalog_cache(cache_key,payload,expires_at,fetched_at) VALUES(?,?,?,?)
             ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,
             expires_at=excluded.expires_at,fetched_at=excluded.fetched_at",
        )
        .bind(key)
        .bind(payload)
        .bind(now.saturating_add(ttl))
        .bind(now)
        .execute(&self.user)
        .await?;
        Ok(())
    }
}

fn unix_seconds() -> Result<i64, TmdbError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_secs()).ok())
        .ok_or(TmdbError::Unavailable)
}
