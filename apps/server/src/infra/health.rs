//! Probes the installed catalog and writable database without changing either.

use sqlx::SqlitePool;

use crate::application::health::HealthProbe;

#[derive(Debug, Clone)]
pub(crate) struct HealthCheck {
    catalog: SqlitePool,
    user: SqlitePool,
}

impl HealthCheck {
    pub(crate) const fn new(catalog: SqlitePool, user: SqlitePool) -> Self {
        Self { catalog, user }
    }

    async fn check(&self) -> Result<(), sqlx::Error> {
        sqlx::query_scalar::<_, i64>("SELECT 1")
            .fetch_one(&self.catalog)
            .await?;
        sqlx::query_scalar::<_, i64>("SELECT 1")
            .fetch_one(&self.user)
            .await?;
        Ok(())
    }
}

impl HealthProbe for HealthCheck {
    async fn is_healthy(&self) -> bool {
        match self.check().await {
            Ok(()) => true,
            Err(error) => {
                tracing::error!(%error, "health check failed");
                false
            }
        }
    }
}
