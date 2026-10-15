//! Explicit TMDB connection configuration commands.
#[derive(Debug)]
pub(crate) struct ConfigureTmdb<'a> {
    pub(crate) token: &'a str,
    pub(crate) remember: bool,
}
#[derive(Debug)]
pub(crate) struct ClearTmdb;
