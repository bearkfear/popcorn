//! `SQLite` source catalog export, preview and transactional import adapters.

use super::{SqliteSources, catalog_decode, catalog_read, catalog_write};
use crate::{
    application::media::{MediaError, source_catalog::CatalogPreview},
    core::media::archive::{MAX_ARCHIVE_BYTES, SourceCatalog},
};

impl SqliteSources {
    pub(super) async fn export_archive(
        &self,
        name: String,
        description: String,
    ) -> Result<String, MediaError> {
        let mut transaction = self.pool.begin().await?;
        let sources = catalog_read::snapshot(&mut transaction, true)
            .await?
            .into_iter()
            .filter(|source| source.active)
            .map(|source| source.entry)
            .collect();
        let catalog = SourceCatalog {
            format: "popcorn-source-catalog".to_owned(),
            version: 1,
            name,
            description,
            sources,
        };
        catalog.validate()?;
        let document = serde_json::to_string_pretty(&catalog).map_err(|_| MediaError::Invalid)?;
        if document.len() > MAX_ARCHIVE_BYTES {
            return Err(MediaError::Invalid);
        }
        transaction.commit().await?;
        Ok(document)
    }

    pub(super) async fn preview_archive(
        &self,
        catalog: SourceCatalog,
    ) -> Result<CatalogPreview, MediaError> {
        let catalog = tokio::task::spawn_blocking(move || {
            catalog_decode::decode(&catalog)?;
            Ok::<_, MediaError>(catalog)
        })
        .await
        .map_err(|_| MediaError::Invalid)??;
        let mut transaction = self.pool.begin().await?;
        let local = catalog_read::snapshot(&mut transaction, false).await?;
        let result = catalog_read::preview(&catalog, &local)?;
        transaction.commit().await?;
        Ok(result)
    }

    pub(super) async fn import_archive(
        &self,
        catalog: SourceCatalog,
        replace: bool,
        revision: &str,
    ) -> Result<CatalogPreview, MediaError> {
        let (catalog, prepared) = tokio::task::spawn_blocking(move || {
            let prepared = catalog_decode::decode(&catalog)?;
            Ok::<_, MediaError>((catalog, prepared))
        })
        .await
        .map_err(|_| MediaError::Invalid)??;
        let mut transaction = self.pool.begin_with("BEGIN IMMEDIATE").await?;
        let local = catalog_read::snapshot(&mut transaction, false).await?;
        let result = catalog_read::preview(&catalog, &local)?;
        if result.revision != revision {
            return Err(MediaError::CatalogChanged);
        }
        catalog_write::apply(&mut transaction, prepared, replace).await?;
        transaction.commit().await?;
        Ok(result)
    }
}
