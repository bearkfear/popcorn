//! TMDB credentials adapter.
use std::{io::Write as _, path::Path};

pub(super) fn prepare_token(
    path: &Path,
    token: &str,
) -> Result<tempfile::TempPath, std::io::Error> {
    let parent = path
        .parent()
        .ok_or_else(|| std::io::Error::other("missing credential directory"))?;
    let mut file = tempfile::NamedTempFile::new_in(parent)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        file.as_file()
            .set_permissions(std::fs::Permissions::from_mode(0o600))?;
    }
    file.write_all(token.as_bytes())?;
    file.as_file().sync_all()?;
    Ok(file.into_temp_path())
}

pub(super) async fn remove_token(path: &Path) -> Result<(), std::io::Error> {
    match tokio::fs::remove_file(path).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}
