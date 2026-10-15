//! Adapts HTTP, RPC and CLI inputs to backend application operations.

pub mod access;
pub mod cli;
pub mod health;
pub mod media;
pub mod rpc;

pub(crate) use access::AccessPolicy;
pub(crate) use health::HealthState;

use std::sync::Arc;

use axum::{Router, middleware, routing::get};

use crate::application::health::HealthProbe;

use access::authorize;
use health::health;

pub(crate) fn router<H: HealthProbe>(
    state: HealthState<H>,
    access: Arc<AccessPolicy>,
    rpc: connectrpc::Router,
    media: Router,
) -> Router {
    Router::new()
        .route("/health", get(health::<H>))
        .with_state(state)
        .fallback_service(rpc.into_axum_service())
        .layer(middleware::from_fn_with_state(access, authorize))
        .merge(media)
}
