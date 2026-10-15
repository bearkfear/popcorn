//! Private sidecar supervision, independent of the native `WebView` for testing.

mod supervisor;

pub use supervisor::{Bootstrap, Supervisor, SupervisorError};
