//! Validates a source request, resolves torrent metadata and saves the content binding.

use crate::application::media::{Cache, MediaError, Sources, Transfers, context::MediaContext};
use crate::core::media::{Content, Source, SourceInput};

pub(crate) struct AddSource {
    pub(crate) content: Content,
    pub(crate) input: SourceInput,
}

pub(crate) async fn handle<R: Sources, T: Transfers, C: Cache>(
    context: &MediaContext<R, T, C>,
    command: AddSource,
) -> Result<Source, MediaError> {
    command.input.validate()?;
    let resolved = context.transfers.resolve(command.input).await?;
    let _guard = context.command.lock().await;
    context.sources.save(command.content, resolved).await
}
