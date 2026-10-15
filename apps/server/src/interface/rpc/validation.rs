//! Parse protobuf catalog inputs into domain query values.
use super::errors::{catalog_error, invalid};
use crate::core::catalog::TitleId;
use connectrpc::ConnectError;
use popcorn_proto::proto::popcorn::v1::ContentRef;
pub(super) fn title_id(content: Option<&ContentRef>) -> Result<TitleId, ConnectError> {
    let content = content.ok_or_else(|| invalid("content is required"))?;
    TitleId::parse(
        content.media_type.to_i32(),
        content.tmdb_id,
        content.season_number.is_some() || content.episode_number.is_some(),
    )
    .map_err(catalog_error)
}
