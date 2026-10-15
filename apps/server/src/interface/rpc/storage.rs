//! Protobuf mapping and delegation for media cache use cases.

use connectrpc::{Encodable, RequestContext, Response, ServiceRequest, ServiceResult};
use popcorn_proto::catalog::popcorn::v1::StorageService;
use popcorn_proto::proto::popcorn::v1::{
    self as proto, ClearCacheRequest, ClearCacheResponse, GetCacheSettingsRequest,
    GetCacheSettingsResponse, SetCacheLimitRequest, SetCacheLimitResponse,
};

use crate::{
    application::media::{Cache, Sources, Transfers},
    core::media::CacheSettings,
};

use super::{errors::source_error, source::MediaRpc};

impl<R: Sources + 'static, T: Transfers + 'static, C: Cache + 'static> StorageService
    for MediaRpc<R, T, C>
{
    async fn get_cache_settings<'a>(
        &'a self,
        _context: RequestContext,
        _request: ServiceRequest<'_, GetCacheSettingsRequest>,
    ) -> ServiceResult<impl Encodable<GetCacheSettingsResponse> + Send + use<'a, R, T, C>> {
        let settings = self.service.cache_settings().await.map_err(source_error)?;
        Response::ok(GetCacheSettingsResponse {
            settings: encode_settings(settings).into(),
            ..Default::default()
        })
    }

    async fn set_cache_limit<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, SetCacheLimitRequest>,
    ) -> ServiceResult<impl Encodable<SetCacheLimitResponse> + Send + use<'a, R, T, C>> {
        let settings = self
            .service
            .set_cache_limit(request.limit_bytes)
            .await
            .map_err(source_error)?;
        Response::ok(SetCacheLimitResponse {
            settings: encode_settings(settings).into(),
            ..Default::default()
        })
    }

    async fn clear_cache<'a>(
        &'a self,
        _context: RequestContext,
        _request: ServiceRequest<'_, ClearCacheRequest>,
    ) -> ServiceResult<impl Encodable<ClearCacheResponse> + Send + use<'a, R, T, C>> {
        let settings = self.service.clear_cache().await.map_err(source_error)?;
        Response::ok(ClearCacheResponse {
            settings: encode_settings(settings).into(),
            ..Default::default()
        })
    }
}

fn encode_settings(value: CacheSettings) -> proto::CacheSettings {
    proto::CacheSettings {
        directory: value.directory,
        limit_bytes: value.limit_bytes,
        used_bytes: value.used_bytes,
        ..Default::default()
    }
}
