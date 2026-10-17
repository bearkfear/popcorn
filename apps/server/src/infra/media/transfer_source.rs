//! Torrent metadata resolution and selected-file transfer preparation.

use std::sync::Arc;

use librqbit::{AddTorrent, AddTorrentOptions, ManagedTorrent};

use crate::{
    application::media::{MediaError, PlaybackFile, ResolvedSource},
    core::media::{SourceFile, SourceInput, is_media},
};

use super::TorrentEngine;

impl TorrentEngine {
    pub(super) async fn resolve_source(
        &self,
        input: SourceInput,
    ) -> Result<ResolvedSource, MediaError> {
        let (add, magnet) = match input {
            SourceInput::Magnet(magnet) => (AddTorrent::from_url(magnet.clone()), Some(magnet)),
            SourceInput::TorrentFile(bytes) => (AddTorrent::from_bytes(bytes), None),
        };
        let response = self
            .session()
            .await?
            .add_torrent(
                add,
                Some(AddTorrentOptions {
                    list_only: true,
                    ..Default::default()
                }),
            )
            .await
            .map_err(|_| MediaError::Unavailable)?;
        let librqbit::AddTorrentResponse::ListOnly(resolved) = response else {
            return Err(MediaError::Unavailable);
        };
        let files = resolved
            .info
            .iter_file_details()
            .enumerate()
            .map(|(index, file)| {
                let name = file.filename.to_string();
                SourceFile {
                    file_index: u32::try_from(index).unwrap_or(u32::MAX),
                    likely_media: is_media(&name),
                    name,
                    size_bytes: file.len,
                }
            })
            .collect();
        Ok(ResolvedSource {
            info_hash: resolved.info_hash.as_string(),
            magnet,
            torrent: resolved.torrent_bytes.as_ref().to_vec(),
            files,
        })
    }

    pub(super) async fn prepare_file(
        &self,
        file: &PlaybackFile,
        index: u32,
    ) -> Result<Arc<ManagedTorrent>, MediaError> {
        self.session()
            .await?
            .add_torrent(
                AddTorrent::from_bytes(file.torrent.clone()),
                Some(AddTorrentOptions {
                    paused: true,
                    only_files: Some(vec![
                        usize::try_from(index).map_err(|_| MediaError::Invalid)?,
                    ]),
                    overwrite: true,
                    ..Default::default()
                }),
            )
            .await
            .map_err(|_| MediaError::Unavailable)?
            .into_handle()
            .ok_or(MediaError::Unavailable)
    }
}
