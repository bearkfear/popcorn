use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Request, State},
    http::{StatusCode, header},
    middleware::{self, Next},
    response::Response,
    routing::get,
};
use serde::Serialize;
use sqlx::SqlitePool;
use uuid::Uuid;

use super::auth::SessionToken;

#[derive(Debug, Clone)]
pub(super) struct HealthState {
    pub(super) catalog: SqlitePool,
    pub(super) user: SqlitePool,
    pub(super) instance_id: Uuid,
    pub(super) catalog_version: String,
}

#[derive(Debug)]
pub(super) struct AccessPolicy {
    pub(super) token: SessionToken,
    pub(super) host: String,
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
    instance_id: Uuid,
    catalog_version: String,
}

pub(super) fn router(state: HealthState, access: Arc<AccessPolicy>) -> Router {
    Router::new()
        .route("/health", get(health))
        .with_state(state)
        .layer(middleware::from_fn_with_state(access, authorize))
}

async fn authorize(
    State(access): State<Arc<AccessPolicy>>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let headers = request.headers();
    if headers.get_all(header::HOST).iter().count() != 1
        || headers
            .get(header::HOST)
            .is_none_or(|value| value.as_bytes() != access.host.as_bytes())
        || headers.contains_key(header::ORIGIN)
    {
        return Err(StatusCode::FORBIDDEN);
    }
    if headers.get_all(header::AUTHORIZATION).iter().count() != 1 {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.as_bytes().strip_prefix(b"Bearer "))
        .ok_or(StatusCode::UNAUTHORIZED)?;
    if !access.token.accepts(token) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(next.run(request).await)
}

async fn health(State(state): State<HealthState>) -> Result<Json<Health>, StatusCode> {
    let check = async {
        sqlx::query_scalar::<_, i64>("SELECT 1")
            .fetch_one(&state.catalog)
            .await?;
        sqlx::query_scalar::<_, i64>("SELECT 1")
            .fetch_one(&state.user)
            .await?;
        Ok::<(), sqlx::Error>(())
    };
    if let Err(error) = check.await {
        tracing::error!(%error, "health check failed");
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }
    Ok(Json(Health {
        status: "ok",
        instance_id: state.instance_id,
        catalog_version: state.catalog_version,
    }))
}
