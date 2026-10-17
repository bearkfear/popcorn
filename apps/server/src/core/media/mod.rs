//! Declares media entities, value objects, pure rules and domain errors.

pub mod entities;
pub mod error;
pub mod rules;
pub mod value_objects;

pub(crate) use entities::Source;
pub(crate) use error::InvalidMedia;
pub(crate) use rules::cache::{DEFAULT_CACHE_LIMIT, validate_cache_limit};
pub(crate) use rules::format::{is_media, mime_type};
pub(crate) use rules::range::{RangeError, parse_range};
pub(crate) use value_objects::{
    Content, Coordinates, MediaKind, PlaybackAudioTrack, PlaybackState, SourceFile, SourceInput,
};
