//! Validates embedded torrent metadata locally without creating a torrent session or contacting peers.

use crate::{
    application::media::{MediaError, ResolvedSource, source_catalog::PreparedCatalogSource},
    core::media::{SourceFile, archive::SourceCatalog, is_media},
};
use base64::{Engine, prelude::BASE64_STANDARD};

pub(super) fn decode(catalog: &SourceCatalog) -> Result<Vec<PreparedCatalogSource>, MediaError> {
    catalog
        .sources
        .iter()
        .map(|entry| {
            let torrent = BASE64_STANDARD
                .decode(&entry.torrent_base64)
                .map_err(|_| MediaError::Invalid)?;
            if torrent.is_empty() || torrent.len() > 10 * 1024 * 1024 {
                return Err(MediaError::Invalid);
            }
            let metadata =
                librqbit::torrent_from_bytes(&torrent).map_err(|_| MediaError::Invalid)?;
            if metadata.info_hash.as_string() != entry.info_hash {
                return Err(MediaError::Invalid);
            }
            let info = metadata
                .info
                .data
                .validate()
                .map_err(|_| MediaError::Invalid)?;
            let files = info
                .iter_file_details()
                .enumerate()
                .map(|(index, file)| {
                    let name = file.filename.to_string();
                    Ok(SourceFile {
                        file_index: u32::try_from(index).map_err(|_| MediaError::Invalid)?,
                        likely_media: is_media(&name),
                        name,
                        size_bytes: file.len,
                    })
                })
                .collect::<Result<Vec<_>, MediaError>>()?;
            let bindings = entry
                .bindings
                .iter()
                .map(|binding| binding.content().map_err(MediaError::from))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(PreparedCatalogSource {
                source: ResolvedSource {
                    info_hash: entry.info_hash.clone(),
                    magnet: None,
                    torrent,
                    files,
                },
                bindings,
            })
        })
        .collect()
}
