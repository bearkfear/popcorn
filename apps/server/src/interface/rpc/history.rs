//! Authenticated Connect entry points for user library queries, mutations and legacy import.

use super::{
    errors::invalid,
    history_mapping::{decode, encode, status},
};
use crate::application::history::{History, HistoryError, HistoryStore};
use connectrpc::{
    ConnectError, Encodable, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use popcorn_proto::{
    catalog::popcorn::v1::HistoryService,
    proto::popcorn::v1::{
        ImportHistoryRequest, ImportHistoryResponse, ListHistoryRequest, ListHistoryResponse,
        UpdateHistoryRequest, UpdateHistoryResponse,
    },
};
use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug)]
pub(super) struct HistoryRpc<S>(pub(super) Arc<History<S>>);

fn error(value: HistoryError) -> ConnectError {
    match value {
        HistoryError::Invalid => invalid("invalid history update"),
        HistoryError::Storage => ConnectError::new(ErrorCode::Internal, "history storage failed"),
    }
}

impl<S: HistoryStore + 'static> HistoryService for HistoryRpc<S> {
    async fn list_history<'a>(
        &'a self,
        _context: RequestContext,
        _request: ServiceRequest<'_, ListHistoryRequest>,
    ) -> ServiceResult<impl Encodable<ListHistoryResponse> + Send + use<'a, S>> {
        let entries = self.0.list().await.map_err(error)?;
        Response::ok(ListHistoryResponse {
            entries: entries.into_iter().map(encode).collect(),
            ..Default::default()
        })
    }

    async fn update_history<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, UpdateHistoryRequest>,
    ) -> ServiceResult<impl Encodable<UpdateHistoryResponse> + Send + use<'a, S>> {
        let request = request.to_owned_message();
        let entry = request
            .entry
            .into_option()
            .ok_or_else(|| invalid("entry is required"))?;
        let mark = request.mark_status.as_deref().map(status).transpose()?;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs_f64()
            * 1000.0;
        let entries = self
            .0
            .update(decode(entry)?, mark, request.ended, now)
            .await
            .map_err(error)?;
        Response::ok(UpdateHistoryResponse {
            entries: entries.into_iter().map(encode).collect(),
            ..Default::default()
        })
    }

    async fn import_history<'a>(
        &'a self,
        _context: RequestContext,
        request: ServiceRequest<'_, ImportHistoryRequest>,
    ) -> ServiceResult<impl Encodable<ImportHistoryResponse> + Send + use<'a, S>> {
        let entries = request
            .to_owned_message()
            .entries
            .into_iter()
            .map(decode)
            .collect::<Result<Vec<_>, _>>()?;
        let entries = self.0.import(entries).await.map_err(error)?;
        Response::ok(ImportHistoryResponse {
            entries: entries.into_iter().map(encode).collect(),
            ..Default::default()
        })
    }
}
