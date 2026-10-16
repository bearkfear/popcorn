//! Native shell: owns process lifecycle and exposes only bootstrap IPC.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod diagnostics;
mod player_window;

use std::{
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
};

use popcorn_desktop::{Bootstrap, Supervisor};
use tauri::{Emitter, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Mutex;

#[derive(Debug, Default)]
struct DesktopState {
    supervisor: Mutex<Supervisor>,
    closing: AtomicBool,
    exit_confirmed: AtomicBool,
}

fn locations(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let executable = tauri::utils::platform::current_exe().map_err(|e| e.to_string())?;
    let executable_dir = executable
        .parent()
        .ok_or("desktop executable has no parent directory")?;
    let backend = executable_dir.join(if cfg!(windows) {
        "popcorn-server.exe"
    } else {
        "popcorn-server"
    });
    let catalog = if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../resources/catalog.sqlite")
    } else {
        app.path()
            .resolve("catalog.sqlite", tauri::path::BaseDirectory::Resource)
            .map_err(|e| e.to_string())?
    };
    let data_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok((backend, catalog, data_dir))
}

const fn webview_origin() -> &'static str {
    if cfg!(debug_assertions) {
        "http://localhost:1420"
    } else if cfg!(windows) {
        "http://tauri.localhost"
    } else {
        "tauri://localhost"
    }
}

#[tauri::command]
async fn bootstrap(
    app: tauri::AppHandle,
    state: tauri::State<'_, DesktopState>,
) -> Result<Bootstrap, String> {
    let mut supervisor = state.supervisor.lock().await;
    if state.closing.load(Ordering::Acquire) {
        return Err("desktop shutdown is in progress".to_owned());
    }
    let (executable, catalog, data_dir) = locations(&app)?;
    let started = std::time::Instant::now();
    let result = supervisor
        .start(&executable, &catalog, &data_dir, webview_origin())
        .await;
    drop(supervisor);
    popcorn_diagnostics::record(
        "desktop.backend_bootstrap",
        serde_json::json!({
            "elapsed_ms": started.elapsed().as_millis(), "success": result.is_ok(),
            "instance_id": result.as_ref().ok().map(|ready| ready.instance_id),
            "error": result.as_ref().err().map(ToString::to_string),
        }),
    );
    result.map_err(|error| error.to_string())
}

#[tauri::command]
async fn stop_backend(state: tauri::State<'_, DesktopState>) -> Result<(), String> {
    state
        .supervisor
        .lock()
        .await
        .stop()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[allow(
    clippy::needless_pass_by_value,
    reason = "Tauri injects an owned AppHandle into commands"
)]
fn open_tmdb_settings(app: tauri::AppHandle) -> Result<(), String> {
    app.opener()
        .open_url("https://www.themoviedb.org/settings/api", None::<&str>)
        .map_err(|_| "Não foi possível abrir as configurações do TMDB no navegador.".to_owned())
}

#[tauri::command]
fn media_diagnostic(sample: diagnostics::MediaSample) -> Result<(), String> {
    diagnostics::record(sample)
}

fn request_shutdown(app: &tauri::AppHandle) {
    let state = app.state::<DesktopState>();
    if state.closing.swap(true, Ordering::AcqRel) {
        return;
    }
    popcorn_diagnostics::record("desktop.shutdown_requested", serde_json::json!({}));
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let started = std::time::Instant::now();
        let state = app.state::<DesktopState>();
        let result = state.supervisor.lock().await.stop().await;
        popcorn_diagnostics::record(
            "desktop.backend_stopped",
            serde_json::json!({
                "elapsed_ms": started.elapsed().as_millis(), "success": result.is_ok(),
                "error": result.as_ref().err().map(ToString::to_string),
            }),
        );
        match result {
            Ok(()) => {
                state.exit_confirmed.store(true, Ordering::Release);
                app.exit(0);
            }
            Err(error) => {
                state.closing.store(false, Ordering::Release);
                eprintln!("desktop shutdown failed: {error}");
                if let Err(emit_error) = app.emit("backend-shutdown-error", error.to_string()) {
                    eprintln!("could not display shutdown error: {emit_error}");
                }
            }
        }
    });
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let directory = app.path().app_local_data_dir()?.join("logs");
            popcorn_diagnostics::init(&directory, "desktop")?;
            popcorn_diagnostics::record(
                "desktop.started",
                serde_json::json!({
                    "development": cfg!(debug_assertions),
                }),
            );
            Ok(())
        })
        .manage(DesktopState::default())
        .manage(player_window::PlayerSession::default())
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            stop_backend,
            open_tmdb_settings,
            media_diagnostic,
            player_window::open_player_window,
            player_window::take_player_session,
            player_window::player_window_active
        ])
        .on_window_event(|window, event| {
            if window.label() != "main" {
                if matches!(event, tauri::WindowEvent::Destroyed) {
                    let _ = window
                        .app_handle()
                        .emit_to("main", "player-window-closed", ());
                }
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                if !app
                    .state::<DesktopState>()
                    .exit_confirmed
                    .load(Ordering::Acquire)
                {
                    // Keep the window available to display a shutdown failure.
                    api.prevent_close();
                    request_shutdown(app);
                }
            }
        })
        .build(tauri::generate_context!())?;
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event
            && !app
                .state::<DesktopState>()
                .exit_confirmed
                .load(Ordering::Acquire)
        {
            api.prevent_exit();
            request_shutdown(app);
        }
    });
    Ok(())
}
