//! Classifies a user library entry independently of playback transport state.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum WatchStatus {
    Watching,
    Watched,
    Want,
}
