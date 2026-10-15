//! Authorized progressive media readers hiding managed torrent handles.

use subtle::ConstantTimeEq as _;
use uuid::Uuid;

use crate::{
    application::media::{AccessError, MediaAccess},
    core::media::mime_type,
};

use super::{TorrentEngine, reader::PlaybackReader};

impl TorrentEngine {
    pub(super) async fn open_stream(
        &self,
        id: Uuid,
        credential: &str,
    ) -> Result<MediaAccess, AccessError> {
        let (handle, file_index, file_name, expected_size, cancel) = {
            let playbacks = self.playbacks.lock().await;
            let active = playbacks.get(&id).ok_or(AccessError::Gone)?;
            if active
                .credential
                .as_bytes()
                .ct_eq(credential.as_bytes())
                .unwrap_u8()
                != 1
            {
                return Err(AccessError::Forbidden);
            }
            let values = (
                active.handle.clone(),
                active.file_index,
                active.file_name.clone(),
                active.size,
                active.processing.cancel.clone(),
            );
            drop(playbacks);
            values
        };
        handle
            .stream(file_index)
            .await
            .map_err(|_| AccessError::Unavailable)
            .and_then(|stream| {
                if stream.len() != expected_size {
                    return Err(AccessError::Unavailable);
                }
                Ok(MediaAccess {
                    size: expected_size,
                    reader: Box::new(PlaybackReader::new(stream, cancel)),
                    mime_type: mime_type(&file_name),
                })
            })
    }
}
