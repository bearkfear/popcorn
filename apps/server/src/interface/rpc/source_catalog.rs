//! Connect mappings for portable source catalog export, preview and import.

use super::{errors::source_error, source::MediaRpc};
use crate::application::media::{
    Cache, Sources, Transfers,
    source_catalog::{self, CatalogPreview},
};
use connectrpc::{Encodable, RequestContext, Response, ServiceRequest, ServiceResult};
use popcorn_proto::{
    catalog::popcorn::v1::SourceCatalogService,
    proto::popcorn::v1::{
        self as proto, ExportSourceCatalogRequest, ExportSourceCatalogResponse,
        ImportSourceCatalogRequest, ImportSourceCatalogResponse, PreviewSourceCatalogRequest,
        PreviewSourceCatalogResponse,
    },
};

impl<R: Sources + 'static, T: Transfers + 'static, C: Cache + 'static> SourceCatalogService
    for MediaRpc<R, T, C>
{
    async fn export_source_catalog<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, ExportSourceCatalogRequest>,
    ) -> ServiceResult<impl Encodable<ExportSourceCatalogResponse> + Send + use<'a, R, T, C>> {
        let request = request.to_owned_message();
        let document =
            source_catalog::export(self.context.as_ref(), request.name, request.description)
                .await
                .map_err(source_error)?;
        Response::ok(ExportSourceCatalogResponse {
            document,
            ..Default::default()
        })
    }

    async fn preview_source_catalog<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, PreviewSourceCatalogRequest>,
    ) -> ServiceResult<impl Encodable<PreviewSourceCatalogResponse> + Send + use<'a, R, T, C>> {
        let request = request.to_owned_message();
        let preview = source_catalog::preview(self.context.as_ref(), &request.document)
            .await
            .map_err(source_error)?;
        Response::ok(PreviewSourceCatalogResponse {
            preview: encode(preview).into(),
            ..Default::default()
        })
    }

    async fn import_source_catalog<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, ImportSourceCatalogRequest>,
    ) -> ServiceResult<impl Encodable<ImportSourceCatalogResponse> + Send + use<'a, R, T, C>> {
        let request = request.to_owned_message();
        let preview = source_catalog::import(
            self.context.as_ref(),
            &request.document,
            request.replace,
            &request.expected_revision,
        )
        .await
        .map_err(source_error)?;
        Response::ok(ImportSourceCatalogResponse {
            preview: encode(preview).into(),
            ..Default::default()
        })
    }
}

fn encode(value: CatalogPreview) -> proto::SourceCatalogPreview {
    proto::SourceCatalogPreview {
        name: value.name,
        sources: value.sources,
        bindings: value.bindings,
        movies: value.movies,
        series: value.series,
        existing_sources: value.existing_sources,
        reactivated_sources: value.reactivated_sources,
        local_sources: value.local_sources,
        revision: value.revision,
        ..Default::default()
    }
}
