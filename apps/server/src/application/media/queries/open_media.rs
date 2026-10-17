//! Opens an authorized source reader without starting a conversion.

use crate::application::media::ports::MediaReader;
use crate::application::media::{AccessError, Cache, Sources, Transfers, context::MediaContext};
use uuid::Uuid;

pub(crate) struct OpenMedia<'a> {
    pub(crate) id: Uuid,
    pub(crate) credential: &'a str,
}

pub(crate) struct MediaAccess {
    pub(crate) reader: Box<dyn MediaReader>,
    pub(crate) size: u64,
    pub(crate) mime_type: &'static str,
}

pub(crate) async fn handle<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    query: OpenMedia<'_>,
) -> Result<MediaAccess, AccessError> {
    context.transfers.open(query.id, query.credential).await
}
