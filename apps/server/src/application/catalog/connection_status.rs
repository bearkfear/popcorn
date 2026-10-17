//! Describes whether the metadata connection is configured and remembered.

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct ConnectionStatus {
    pub(crate) configured: bool,
    pub(crate) remembered: bool,
}
