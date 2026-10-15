//! Defines the readiness probe boundary used by backend diagnostics.

use std::future::Future;

pub(crate) trait HealthProbe: Clone + Send + Sync + 'static {
    fn is_healthy(&self) -> impl Future<Output = bool> + Send;
}
