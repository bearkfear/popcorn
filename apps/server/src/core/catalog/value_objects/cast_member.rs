//! Describes an acting credit by person name, character and profile image.

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct CastData {
    pub(crate) name: String,
    pub(crate) character: String,
    pub(crate) profile_url: String,
}
