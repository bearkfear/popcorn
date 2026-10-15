//! Returns backend readiness after probing local storage.

use axum::{Json, extract::State, http::StatusCode};
use serde::Serialize;
use uuid::Uuid;

use crate::application::health::HealthProbe;

#[derive(Debug, Clone)]
pub(crate) struct HealthState<H> {
    pub(crate) check: H,
    pub(crate) instance_id: Uuid,
    pub(crate) catalog_version: String,
}

#[derive(Serialize)]
pub(super) struct Health {
    status: &'static str,
    instance_id: Uuid,
    catalog_version: String,
}

pub(super) async fn health<H: HealthProbe>(
    State(state): State<HealthState<H>>,
) -> Result<Json<Health>, StatusCode> {
    if !state.check.is_healthy().await {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }
    Ok(Json(Health {
        status: "ok",
        instance_id: state.instance_id,
        catalog_version: state.catalog_version,
    }))
}
