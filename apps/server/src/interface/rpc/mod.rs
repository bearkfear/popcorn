//! Registers domain RPC services on the Connect transport.

use std::sync::Arc;

use popcorn_proto::catalog::popcorn::v1::{
    PlaybackServiceRegisterMarker, SourceServiceRegisterMarker, StorageServiceRegisterMarker,
};

use crate::application::{
    catalog::{
        Catalog,
        ports::{MetadataProvider, SnapshotQueries},
    },
    media::{Cache, MediaService, Sources, Transfers},
};

use self::{catalog::CatalogRpc, source::MediaRpc};

mod catalog;
mod conversions;
mod errors;
mod playback;
mod source;
mod storage;
mod validation;

pub(crate) fn router<
    M: MetadataProvider + 'static,
    S: SnapshotQueries + 'static,
    R: Sources + 'static,
    T: Transfers + 'static,
    C: Cache + 'static,
>(
    catalog: Arc<Catalog<M, S>>,
    media: Arc<MediaService<R, T, C>>,
) -> connectrpc::Router {
    let media = Arc::new(MediaRpc::new(media));
    connectrpc::Router::new()
        .add_service(Arc::new(CatalogRpc::new(catalog)))
        .add_service::<MediaRpc<R, T, C>, SourceServiceRegisterMarker>(media.clone())
        .add_service::<MediaRpc<R, T, C>, PlaybackServiceRegisterMarker>(media.clone())
        .add_service::<MediaRpc<R, T, C>, StorageServiceRegisterMarker>(media)
}
