//! Coordinates portable source catalog operations and serializes conflicting media commands.

use super::{Cache, MediaContext, MediaError, ResolvedSource, Sources, Transfers};
use crate::core::media::archive::SourceCatalog;

pub(crate) struct PreparedCatalogSource {
    pub(crate) source: ResolvedSource,
    pub(crate) bindings: Vec<crate::core::media::Content>,
}

#[derive(Debug, Default)]
pub(crate) struct CatalogPreview {
    pub(crate) name: String,
    pub(crate) sources: u32,
    pub(crate) bindings: u32,
    pub(crate) movies: u32,
    pub(crate) series: u32,
    pub(crate) existing_sources: u32,
    pub(crate) reactivated_sources: u32,
    pub(crate) local_sources: u32,
    pub(crate) revision: String,
}

pub(crate) async fn export<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    name: String,
    description: String,
) -> Result<String, MediaError> {
    let _guard = context.command.lock().await;
    context.sources.export_catalog(name, description).await
}

pub(crate) async fn preview<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    document: &str,
) -> Result<CatalogPreview, MediaError> {
    let catalog = SourceCatalog::parse(document)?;
    context.sources.preview_catalog(catalog).await
}

pub(crate) async fn import<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    document: &str,
    replace: bool,
    revision: &str,
) -> Result<CatalogPreview, MediaError> {
    let catalog = SourceCatalog::parse(document)?;
    let _guard = context.command.lock().await;
    if replace && context.transfers.in_use(None).await {
        return Err(MediaError::InUse);
    }
    context
        .sources
        .import_catalog(catalog, replace, revision)
        .await
}
