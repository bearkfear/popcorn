//! Wraps a query result with the freshness of its cached metadata.

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct Cached<T> {
    pub(crate) data: T,
    pub(crate) stale: bool,
}
