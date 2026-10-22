//! Converts independently requested native HLS segments with bounded process concurrency.

use super::{
    TorrentEngine,
    conversion_reader::ConversionReader,
    preparation::{ConversionOutput, Preparation},
};
use crate::{
    application::media::{AccessError, ConvertedAccess},
    core::media::rules::hls::segment,
};
use popcorn_diagnostics::ProcessContext;
use uuid::Uuid;

impl TorrentEngine {
    pub(super) async fn open_hls_segment(
        &self,
        id: Uuid,
        credential: &str,
        index: u32,
    ) -> Result<ConvertedAccess, AccessError> {
        let processing = self.authorized_processing(id, credential).await?;
        let Preparation::Ready(media) = processing.state.borrow().clone() else {
            return Err(AccessError::Unavailable);
        };
        let range =
            segment(media.inspected.info.duration, index).ok_or(AccessError::InvalidPosition)?;
        let cancel = processing.cancel.child_token();
        let context = ProcessContext {
            playback_id: id,
            generation: Some(u64::from(index)),
            tool: "ffmpeg",
        };
        let url = format!("http://{}/media/{id}?token={credential}", self.address);
        // Native clients may prefetch adjacent segments concurrently. Queue them in
        // the existing conversion slot rather than cancelling an earlier request.
        let (reader, error) = super::conversion_start::start(
            &processing,
            &media,
            &url,
            range.start,
            &cancel,
            context,
            ConversionOutput::HlsSegment { end: range.end },
        )
        .await?;
        Ok(ConvertedAccess {
            reader: Box::new(ConversionReader::new(reader, cancel, error, context)),
        })
    }
}
