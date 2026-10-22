//! Opens an authorized conversion generation, starting or replacing its process.

use crate::application::media::{AccessError, Cache, Sources, Transfers, context::MediaContext};
use tokio::io::AsyncRead;
use uuid::Uuid;

pub(crate) struct StartConvertedStream<'a> {
    pub(crate) id: Uuid,
    pub(crate) credential: &'a str,
    pub(crate) start: f64,
    pub(crate) generation: u64,
}

pub(crate) struct ConvertedAccess {
    pub(crate) reader: Box<dyn AsyncRead + Unpin + Send>,
}

pub(crate) async fn segment<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    id: Uuid,
    credential: &str,
    index: u32,
) -> Result<ConvertedAccess, AccessError> {
    context.transfers.hls_segment(id, credential, index).await
}

pub(crate) async fn handle<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    request: StartConvertedStream<'_>,
) -> Result<ConvertedAccess, AccessError> {
    context
        .transfers
        .converted(
            request.id,
            request.credential,
            request.start,
            request.generation,
        )
        .await
}
