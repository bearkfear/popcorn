//! Enforces loopback host, bearer authentication and `WebView` origin policy.

use std::sync::Arc;

use axum::{
    extract::{Request, State},
    http::{HeaderMap, HeaderValue, Method, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
};

use crate::core::auth::SessionToken;

#[derive(Debug)]
pub(crate) struct AccessPolicy {
    pub(crate) token: SessionToken,
    pub(crate) host: String,
    pub(crate) origin: Option<String>,
}

pub(super) async fn authorize(
    State(access): State<Arc<AccessPolicy>>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let headers = request.headers();
    if headers.get_all(header::HOST).iter().count() != 1
        || headers
            .get(header::HOST)
            .is_none_or(|value| value.as_bytes() != access.host.as_bytes())
    {
        return Err(StatusCode::FORBIDDEN);
    }
    let origin = match headers.get_all(header::ORIGIN).iter().count() {
        0 => None,
        1 => {
            let origin = headers.get(header::ORIGIN).ok_or(StatusCode::FORBIDDEN)?;
            if origin == "null"
                || access.origin.as_deref().map(str::as_bytes) != Some(origin.as_bytes())
            {
                return Err(StatusCode::FORBIDDEN);
            }
            Some(origin.clone())
        }
        _ => return Err(StatusCode::FORBIDDEN),
    };
    if request.method() == Method::OPTIONS {
        if origin.is_none() || !valid_preflight(headers) {
            return Err(StatusCode::FORBIDDEN);
        }
        let mut response = StatusCode::NO_CONTENT.into_response();
        response.headers_mut().insert(
            header::ACCESS_CONTROL_ALLOW_METHODS,
            HeaderValue::from_static("POST"),
        );
        response.headers_mut().insert(
            header::ACCESS_CONTROL_ALLOW_HEADERS,
            HeaderValue::from_static(
                "content-type,authorization,connect-protocol-version,connect-timeout-ms,x-user-agent",
            ),
        );
        add_cors(&mut response, origin);
        return Ok(response);
    }
    let authorization = authorize_token(&access, headers);
    let mut response = match authorization {
        Ok(()) => next.run(request).await,
        Err(status) => status.into_response(),
    };
    add_cors(&mut response, origin);
    Ok(response)
}

fn authorize_token(access: &AccessPolicy, headers: &HeaderMap) -> Result<(), StatusCode> {
    if headers.get_all(header::AUTHORIZATION).iter().count() != 1 {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.as_bytes().strip_prefix(b"Bearer "))
        .ok_or(StatusCode::UNAUTHORIZED)?;
    if !access.token.accepts(token) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(())
}

fn valid_preflight(headers: &HeaderMap) -> bool {
    if headers
        .get_all(header::ACCESS_CONTROL_REQUEST_METHOD)
        .iter()
        .count()
        != 1
        || headers
            .get(header::ACCESS_CONTROL_REQUEST_METHOD)
            .is_none_or(|method| method != "POST")
        || headers
            .get_all(header::ACCESS_CONTROL_REQUEST_HEADERS)
            .iter()
            .count()
            > 1
    {
        return false;
    }
    headers
        .get(header::ACCESS_CONTROL_REQUEST_HEADERS)
        .is_none_or(|value| {
            value.to_str().is_ok_and(|value| {
                value.split(',').all(|name| {
                    matches!(
                        name.trim().to_ascii_lowercase().as_str(),
                        "content-type"
                            | "authorization"
                            | "connect-protocol-version"
                            | "connect-timeout-ms"
                            | "x-user-agent"
                    )
                })
            })
        })
}

fn add_cors(response: &mut Response, origin: Option<HeaderValue>) {
    response
        .headers_mut()
        .append(header::VARY, HeaderValue::from_static("Origin"));
    if let Some(origin) = origin {
        response
            .headers_mut()
            .insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin);
        response.headers_mut().insert(
            header::ACCESS_CONTROL_EXPOSE_HEADERS,
            HeaderValue::from_static(
                "connect-protocol-version,connect-content-encoding,connect-accept-encoding,grpc-status,grpc-message,grpc-status-details-bin",
            ),
        );
    }
}
