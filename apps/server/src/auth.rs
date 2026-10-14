use std::{fmt, path::Path};

use subtle::ConstantTimeEq;
use tokio::io::AsyncReadExt;

use crate::Error;

pub(super) struct SessionToken([u8; 64]);

impl fmt::Debug for SessionToken {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("SessionToken([REDACTED])")
    }
}

impl SessionToken {
    pub(super) async fn read(path: &Path) -> Result<Self, Error> {
        let mut bytes = Vec::with_capacity(67);
        tokio::fs::File::open(path)
            .await?
            .take(67)
            .read_to_end(&mut bytes)
            .await?;
        let bytes = bytes.strip_suffix(b"\n").unwrap_or(&bytes);
        let bytes = bytes.strip_suffix(b"\r").unwrap_or(bytes);
        Self::parse(bytes)
    }

    pub(super) fn parse(bytes: &[u8]) -> Result<Self, Error> {
        if !bytes.iter().all(u8::is_ascii_hexdigit) {
            return Err(Error::InvalidToken);
        }
        let secret = bytes.try_into().map_err(|_| Error::InvalidToken)?;
        Ok(Self(secret))
    }

    pub(super) fn accepts(&self, bytes: &[u8]) -> bool {
        bool::from(self.0.as_slice().ct_eq(bytes))
    }
}
