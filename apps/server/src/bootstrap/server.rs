//! Serves HTTP with bounded graceful shutdown after the owner's signal.

use std::{future::Future, io, net::Ipv4Addr, time::Duration};

use axum::Router;
use tokio::net::TcpListener;

use crate::Error;

pub(super) async fn serve(
    listener: TcpListener,
    app: Router,
    shutdown: impl Future<Output = ()> + Send + 'static,
) -> Result<(), Error> {
    let (notified, mut notification) = tokio::sync::oneshot::channel();
    let shutdown = async move {
        shutdown.await;
        if notified.send(()).is_err() {
            tracing::debug!("server finished before shutdown notification");
        }
    };
    let server = axum::serve(listener, app)
        .with_graceful_shutdown(shutdown)
        .into_future();
    tokio::pin!(server);
    tokio::select! {
        result = &mut server => result.map_err(Error::Io),
        _ = &mut notification => {
            tokio::time::timeout(Duration::from_secs(5), &mut server)
                .await
                .map_err(|_| Error::ShutdownTimeout)
                .and_then(|result| result.map_err(Error::Io))
        }
    }
}

pub(super) async fn listen(address: (Ipv4Addr, u16), fallback: bool) -> io::Result<TcpListener> {
    match TcpListener::bind(address).await {
        Err(error) if fallback && error.kind() == io::ErrorKind::AddrInUse => {
            tracing::info!(
                preferred_port = address.1,
                "preferred HTTP port occupied; selecting a free port"
            );
            TcpListener::bind((address.0, 0)).await
        }
        result => result,
    }
}
