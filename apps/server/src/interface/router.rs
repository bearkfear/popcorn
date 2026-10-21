//! Adapts HTTP, RPC and CLI inputs to backend application operations.

use super::{AccessPolicy, HealthState, access, diagnostics, health};
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
    let browser = access.browser.as_ref().map_or_else(Router::new, |browser| {
        super::browser::router(browser.clone())
    });
    Router::new()
        .route("/health", get(health::<H>))
        .with_state(state)
        .merge(browser)
        .fallback_service(rpc.into_axum_service())
        .layer(middleware::from_fn_with_state(access, authorize))
        .merge(media)
        .layer(middleware::from_fn(diagnostics::request))
}
