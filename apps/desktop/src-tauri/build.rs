//! Generates native Tauri metadata only when building the desktop feature.

fn main() {
    #[cfg(feature = "desktop")]
    tauri_build::build();
}
