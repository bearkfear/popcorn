//! Validates session credentials and compares them without exposing their contents.

pub mod pairing;

use std::fmt;

use subtle::ConstantTimeEq;

#[derive(Debug, Clone, Copy, thiserror::Error)]
#[error("token must contain 64 hexadecimal characters")]
pub(crate) struct InvalidToken;

pub(crate) struct SessionToken([u8; 64]);

impl fmt::Debug for SessionToken {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("SessionToken([REDACTED])")
    }
}

impl SessionToken {
    pub(crate) fn parse(bytes: &[u8]) -> Result<Self, InvalidToken> {
        if !bytes.iter().all(u8::is_ascii_hexdigit) {
            return Err(InvalidToken);
        }
        let secret = bytes.try_into().map_err(|_| InvalidToken)?;
        Ok(Self(secret))
    }

    pub(crate) fn accepts(&self, bytes: &[u8]) -> bool {
        bool::from(self.0.as_slice().ct_eq(bytes))
    }
}
