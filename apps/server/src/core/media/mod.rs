//! Declares media domain modules and reexports source, playback, cache and range types.

pub mod audio;
pub mod cache;
pub mod content;
pub mod download;
pub mod error;
pub mod format;
pub mod playback;
pub mod profile;
pub mod range;
pub mod selection;
pub mod source;

pub(crate) use cache::{CacheSettings, DEFAULT_CACHE_LIMIT, validate_cache_limit};
pub(crate) use content::{Content, Coordinates, MediaKind};
pub(crate) use error::InvalidMedia;
pub(crate) use format::{is_media, mime_type};
pub(crate) use playback::{Playback, PlaybackAudioTrack, PlaybackState};
pub(crate) use range::{RangeError, parse_range};
pub(crate) use source::{Source, SourceFile, SourceInput};
