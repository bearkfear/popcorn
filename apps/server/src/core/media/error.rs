//! Defines the domain error for invalid media requests and settings.

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
#[error("invalid source request")]
pub(crate) struct InvalidMedia;
