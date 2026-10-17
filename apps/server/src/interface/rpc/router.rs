//! Registers domain RPC services on the Connect transport.

use std::sync::Arc;

use popcorn_proto::catalog::popcorn::v1::{
    PlaybackServiceRegisterMarker, SourceServiceRegisterMarker, StorageServiceRegisterMarker,
};

use crate::application::{
    catalog::ports::{MetadataProvider, SnapshotQueries},
    media::{Cache, MediaContext, Sources, Transfers},
};

use super::{catalog::CatalogRpc, source::MediaRpc};

pub(crate) fn router<
    M: MetadataProvider + 'static,
    S: SnapshotQueries + 'static,
    R: Sources + 'static,
    T: Transfers + 'static,
    H: crate::application::history::HistoryStore + 'static,
    C: Cache + 'static,
>(
    history: Arc<crate::application::history::History<H>>,
    metadata: Arc<M>,
    snapshot: Arc<S>,
    media: Arc<MediaContext<R, T, C>>,
) -> connectrpc::Router {
    let media = Arc::new(MediaRpc::new(media));
    connectrpc::Router::new()
        .add_service(Arc::new(super::history::HistoryRpc(history)))
        .add_service(Arc::new(CatalogRpc::new(metadata, snapshot)))
        .add_service::<MediaRpc<R, T, C>, SourceServiceRegisterMarker>(media.clone())
        .add_service::<MediaRpc<R, T, C>, PlaybackServiceRegisterMarker>(media.clone())
        .add_service::<MediaRpc<R, T, C>, StorageServiceRegisterMarker>(media)
}
