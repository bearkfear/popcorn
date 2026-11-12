//! Installed launcher: supervises the local server and opens its interface in the browser.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod network;

use popcorn_desktop::{Bootstrap, Supervisor};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{
    Manager, WebviewUrl, WebviewWindowBuilder,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Mutex;

#[derive(serde::Deserialize)]
struct Launch {
    ticket: String,
}

#[derive(Debug, Default)]
struct DesktopState {
    supervisor: Mutex<Supervisor>,
    closing: AtomicBool,
    exit_confirmed: AtomicBool,
}

fn locations(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf, PathBuf, PathBuf), String> {
    let executable = tauri::utils::platform::current_exe().map_err(|e| e.to_string())?;
    let directory = executable
        .parent()
        .ok_or("desktop executable has no parent directory")?;
    let backend = directory.join(if cfg!(windows) {
        "popcorn-server.exe"
    } else {
        "popcorn-server"
    });
    let (catalog, web_root) = if cfg!(debug_assertions) {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        (
            root.join("../../../resources/catalog.sqlite"),
            root.join("../dist"),
        )
    } else {
        let resolve = |path| {
            app.path()
                .resolve(path, tauri::path::BaseDirectory::Resource)
                .map_err(|e| e.to_string())
        };
        (resolve("catalog.sqlite")?, resolve("web")?)
    };
    let data = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok((backend, catalog, data, web_root))
}

fn open_browser(app: &tauri::AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = start_and_open(&app).await;
        if let Err(error) = result {
            popcorn_diagnostics::record(
                "desktop.browser_open_failed",
                serde_json::json!({ "error": error }),
            );
            // No webview is available to show startup failures.
            app.dialog()
                .message(format!("Não foi possível abrir o Popcorn. {error}"))
                .title("Popcorn")
                .blocking_show();
        }
    });
}

async fn connection(app: &tauri::AppHandle) -> Result<Bootstrap, String> {
    let state = app.state::<DesktopState>();
    let mut supervisor = state.supervisor.lock().await;
    if state.closing.load(Ordering::Acquire) {
        return Err("O Popcorn está encerrando.".into());
    }
    let (backend, catalog, data, web_root) = locations(app)?;
    let frontend_origin = if cfg!(debug_assertions) {
        "http://localhost:1420"
    } else {
        "http://tauri.localhost"
    };
    let ready = supervisor
        .start(
            &backend,
            &catalog,
            &data,
            frontend_origin,
            &web_root,
        )
        .await
        .map_err(|e| e.to_string())?;
    drop(supervisor);
    Ok(ready)
}

async fn start_and_open(app: &tauri::AppHandle) -> Result<(), String> {
    let ready = connection(app).await?;
    // The one-use ticket is carried in a fragment, never in HTTP paths or server logs.
    let response = reqwest::Client::new()
        .post(format!("http://{}/browser/launch", ready.address))
        .bearer_auth(&ready.token)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|_| "Não foi possível conectar ao servidor local.")?
        .error_for_status()
        .map_err(|_| "Não foi possível autorizar o navegador.")?;
    let launch: Launch = response
        .json()
        .await
        .map_err(|_| "Resposta inválida do servidor local.")?;
    let url = if cfg!(debug_assertions) {
        format!(
            "http://localhost:1420/movies#server=localhost:{}&launch={}",
            ready.address.port(),
            launch.ticket
        )
    } else {
        format!("http://{}/movies#launch={}", ready.address, launch.ticket)
    };
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|_| "Não foi possível abrir o navegador padrão.".to_owned())?;
    popcorn_diagnostics::record(
        "desktop.browser_opened",
        serde_json::json!({ "instance_id": ready.instance_id }),
    );
    Ok(())
}

fn request_shutdown(app: &tauri::AppHandle) {
    if app
        .state::<DesktopState>()
        .closing
        .swap(true, Ordering::AcqRel)
    {
        return;
    }
    popcorn_diagnostics::record("desktop.shutdown_requested", serde_json::json!({}));
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<DesktopState>();
        match state.supervisor.lock().await.stop().await {
            Ok(()) => {
                popcorn_diagnostics::record(
                    "desktop.backend_stopped",
                    serde_json::json!({ "success": true }),
                );
                state.exit_confirmed.store(true, Ordering::Release);
                app.exit(0);
            }
            Err(error) => {
                state.closing.store(false, Ordering::Release);
                app.dialog()
                    .message(format!("Não foi possível encerrar o servidor: {error}"))
                    .title("Popcorn")
                    .blocking_show();
            }
        }
    });
}

fn open_downloads(app: &tauri::AppHandle) -> Result<(), String> {
    let (_, _, data, _) = locations(app)?;
    let directory = data.join("downloads");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    app.opener()
        .open_path(directory.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[allow(
    clippy::needless_pass_by_value,
    reason = "Tauri injects an owned AppHandle"
)]
fn launcher_open(app: tauri::AppHandle) {
    open_browser(&app);
}

#[tauri::command]
#[allow(
    clippy::needless_pass_by_value,
    reason = "Tauri injects an owned AppHandle"
)]
fn launcher_network(app: tauri::AppHandle) {
    network::show(&app);
}

#[tauri::command]
#[allow(
    clippy::needless_pass_by_value,
    reason = "Tauri injects an owned AppHandle"
)]
fn launcher_downloads(app: tauri::AppHandle) -> Result<(), String> {
    open_downloads(&app)
}

#[tauri::command]
#[allow(
    clippy::needless_pass_by_value,
    reason = "Tauri injects an owned AppHandle"
)]
fn launcher_quit(app: tauri::AppHandle) {
    request_shutdown(&app);
}

#[cfg(target_os = "linux")]
fn is_wsl() -> bool {
    let distro = std::env::var("WSL_DISTRO_NAME").ok();
    let interop = std::env::var("WSL_INTEROP").ok();
    let release = std::fs::read_to_string("/proc/sys/kernel/osrelease").unwrap_or_default();
    has_wsl_markers(distro.as_deref(), interop.as_deref(), &release)
}

#[cfg(not(target_os = "linux"))]
fn is_wsl() -> bool {
    false
}

fn has_wsl_markers(distro: Option<&str>, interop: Option<&str>, release: &str) -> bool {
    distro.is_some() || interop.is_some() || release.to_ascii_lowercase().contains("microsoft")
}

fn show_launcher_controls(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("launcher") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(target_os = "linux")]
fn configure_wsl_window_controls() {
    use gtk::prelude::GtkSettingsExt;

    if let Some(settings) = gtk::Settings::default() {
        // WSLg inherits GNOME's close-only default. Keep the override local to Popcorn.
        settings.set_gtk_decoration_layout(Some("appmenu:minimize,close"));
    }
}

fn setup_launcher_controls(app: &tauri::AppHandle) -> tauri::Result<()> {
    #[cfg(target_os = "linux")]
    configure_wsl_window_controls();

    let window =
        WebviewWindowBuilder::new(app, "launcher", WebviewUrl::App("launcher.html".into()))
            .title("Popcorn · Controles")
            .inner_size(430.0, 430.0)
            .min_inner_size(360.0, 400.0)
            .resizable(false)
            .maximizable(false)
            .minimizable(true)
            .closable(true)
            .center()
            .build()?;
    window.on_window_event({
        let app = app.clone();
        move |event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                request_shutdown(&app);
            }
        }
    });
    Ok(())
}

fn setup_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let open = MenuItem::with_id(app, "open", "Abrir Popcorn", true, None::<&str>)?;
    let network = MenuItem::with_id(app, "network", "Acessar pela TV", true, None::<&str>)?;
    let folder = MenuItem::with_id(
        app,
        "downloads",
        "Abrir pasta de vídeos",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Encerrar Popcorn", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &network, &folder, &quit])?;
    let mut tray = TrayIconBuilder::with_id("popcorn")
        .tooltip("Popcorn · servidor local")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => open_browser(app),
            "network" => network::show(app),
            "quit" => request_shutdown(app),
            "downloads" => {
                let _ = open_downloads(app);
            }
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_launcher_controls(app);
            open_browser(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(DesktopState::default())
        .invoke_handler(tauri::generate_handler![
            launcher_open,
            launcher_network,
            launcher_downloads,
            launcher_quit
        ])
        .setup(|app| {
            popcorn_diagnostics::init(&app.path().app_local_data_dir()?.join("logs"), "desktop")?;
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            if is_wsl() {
                setup_launcher_controls(app.handle())?;
            } else {
                setup_tray(app.handle())?;
            }
            open_browser(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())?;
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { ref api, code, .. } = event
            && !app
                .state::<DesktopState>()
                .exit_confirmed
                .load(Ordering::Acquire)
        {
            api.prevent_exit();
            // Closing the browser or having no native windows must keep the server alive.
            if code.is_some() {
                request_shutdown(app);
            }
        }
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            open_browser(app);
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::has_wsl_markers;

    #[test]
    fn recognizes_wsl_environment_variables() {
        assert!(has_wsl_markers(Some("Ubuntu"), None, "6.8.0-generic"));
        assert!(has_wsl_markers(
            None,
            Some("/run/WSL/1_interop"),
            "6.8.0-generic"
        ));
    }

    #[test]
    fn recognizes_wsl_kernel_release() {
        assert!(has_wsl_markers(
            None,
            None,
            "5.15.167.4-microsoft-standard-WSL2"
        ));
        assert!(!has_wsl_markers(None, None, "6.8.0-49-generic"));
    }
}
