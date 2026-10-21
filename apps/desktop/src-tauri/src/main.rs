//! Installed launcher: supervises the local server and opens its interface in the browser.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use popcorn_desktop::Supervisor;
use std::{
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{
    Manager,
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

async fn start_and_open(app: &tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<DesktopState>();
    let mut supervisor = state.supervisor.lock().await;
    if state.closing.load(Ordering::Acquire) {
        return Ok(());
    }
    let (backend, catalog, data, web_root) = locations(app)?;
    let ready = supervisor
        .start(
            &backend,
            &catalog,
            &data,
            "http://localhost:1420",
            &web_root,
        )
        .await
        .map_err(|e| e.to_string())?;
    drop(supervisor);
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
    let url = format!("http://{}/#launch={}", ready.address, launch.ticket);
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

fn setup_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let open = MenuItem::with_id(app, "open", "Abrir Popcorn", true, None::<&str>)?;
    let folder = MenuItem::with_id(
        app,
        "downloads",
        "Abrir pasta de vídeos",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Encerrar Popcorn", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &folder, &quit])?;
    let mut tray = TrayIconBuilder::with_id("popcorn")
        .tooltip("Popcorn · servidor local")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => open_browser(app),
            "quit" => request_shutdown(app),
            "downloads" => {
                if let Ok((_, _, data, _)) = locations(app) {
                    let directory = data.join("downloads");
                    if std::fs::create_dir_all(&directory).is_ok() {
                        let _ = app
                            .opener()
                            .open_path(directory.to_string_lossy().into_owned(), None::<&str>);
                    }
                }
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
            open_browser(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(DesktopState::default())
        .setup(|app| {
            popcorn_diagnostics::init(&app.path().app_local_data_dir()?.join("logs"), "desktop")?;
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            setup_tray(app.handle())?;
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
