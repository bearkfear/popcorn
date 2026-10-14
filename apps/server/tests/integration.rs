//! Deterministic integration checks for the first backend increment.

use std::{net::SocketAddr, path::PathBuf, time::Duration};

use popcorn_server::{Backend, Ready, ServerConfig, create_catalog};
use tempfile::TempDir;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    sync::oneshot,
    task::JoinHandle,
};

type TestResult<T = ()> = Result<T, Box<dyn std::error::Error + Send + Sync>>;
const TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

#[derive(Debug)]
struct Fixture {
    _root: TempDir,
    catalog: PathBuf,
    data: PathBuf,
    token: PathBuf,
}

impl Fixture {
    async fn new() -> TestResult<Self> {
        let root = tempfile::tempdir()?;
        let catalog = root.path().join("app/catalog.sqlite");
        let token = root.path().join("token");
        let data = root.path().join("data");
        create_catalog(&catalog).await?;
        tokio::fs::write(&token, TOKEN).await?;
        Ok(Self {
            _root: root,
            catalog,
            data,
            token,
        })
    }

    fn config(&self) -> ServerConfig {
        ServerConfig::new(self.catalog.clone(), self.data.clone(), self.token.clone())
    }
}

#[derive(Debug)]
struct Running {
    ready: Ready,
    shutdown: oneshot::Sender<()>,
    task: JoinHandle<Result<(), popcorn_server::Error>>,
}

impl Running {
    async fn start(fixture: &Fixture) -> TestResult<Self> {
        let backend = Backend::prepare(fixture.config()).await?;
        let ready = backend.ready().clone();
        let (shutdown, signal) = oneshot::channel();
        let task = tokio::spawn(backend.run(async move {
            assert!(signal.await.is_ok());
        }));
        Ok(Self {
            ready,
            shutdown,
            task,
        })
    }

    async fn stop(self) -> TestResult {
        self.shutdown
            .send(())
            .map_err(|()| std::io::Error::other("server already stopped"))?;
        tokio::time::timeout(Duration::from_secs(8), self.task).await???;
        Ok(())
    }
}

async fn request(address: SocketAddr, headers: &str) -> TestResult<String> {
    let response = tokio::time::timeout(Duration::from_secs(3), async {
        let mut stream = TcpStream::connect(address).await?;
        let request = format!("GET /health HTTP/1.1\r\n{headers}Connection: close\r\n\r\n");
        stream.write_all(request.as_bytes()).await?;
        let mut bytes = Vec::new();
        stream.read_to_end(&mut bytes).await?;
        Ok::<_, std::io::Error>(bytes)
    })
    .await??;
    Ok(String::from_utf8(response)?)
}
#[path = "integration/health.rs"]
mod health;
#[cfg(unix)]
#[path = "integration/process.rs"]
mod process;
#[path = "integration/storage.rs"]
mod storage;
