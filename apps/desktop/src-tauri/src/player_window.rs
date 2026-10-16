//! Dedicated playback window with session handoff kept in native memory.
#![expect(
    clippy::redundant_pub_crate,
    reason = "Keep native binary commands private to the crate"
)]

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::Mutex;

#[tauri::command]
#[allow(
    clippy::needless_pass_by_value,
    reason = "Tauri injects an owned AppHandle"
)]
pub(crate) fn player_window_active(app: tauri::AppHandle) -> bool {
    app.get_webview_window("player").is_some()
}

#[derive(Default)]
pub(crate) struct PlayerSession(pub(crate) Mutex<Option<serde_json::Value>>);

#[tauri::command]
pub(crate) async fn open_player_window(
    app: tauri::AppHandle,
    state: tauri::State<'_, PlayerSession>,
    session: serde_json::Value,
) -> Result<(), String> {
    let mut pending = state.0.lock().await;
    if let Some(window) = app.get_webview_window("player") {
        window.set_focus().map_err(|error| error.to_string())?;
        return Err(
            "Já existe uma janela de reprodução aberta. Feche-a para trocar de vídeo.".into(),
        );
    }
    if session.to_string().len() > 256 * 1024 {
        return Err("Sessão de reprodução inválida.".into());
    }
    let title = window_title(&session);
    *pending = Some(session);
    let result =
        WebviewWindowBuilder::new(&app, "player", WebviewUrl::App("index.html#video".into()))
            .title(title)
            .inner_size(1120.0, 700.0)
            .min_inner_size(480.0, 300.0)
            .background_color(tauri::webview::Color(0, 0, 0, 255))
            .build();
    if let Err(error) = result {
        *pending = None;
        drop(pending);
        return Err(error.to_string());
    }
    drop(pending);
    popcorn_diagnostics::record("desktop.player_window_opened", serde_json::json!({}));
    Ok(())
}

fn window_title(session: &serde_json::Value) -> String {
    let context = &session["context"];
    let name = context["title"]["title"]
        .as_str()
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("Reprodução");
    let name: String = name.chars().filter(|c| !c.is_control()).take(180).collect();
    let identity = &context["content"];
    match (
        identity["seasonNumber"].as_u64(),
        identity["episodeNumber"].as_u64(),
    ) {
        (Some(season), Some(episode)) => format!("{name} · T{season:02}E{episode:02} · Popcorn"),
        _ => format!("{name} · Popcorn"),
    }
}

#[tauri::command]
pub(crate) async fn take_player_session(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, PlayerSession>,
) -> Result<serde_json::Value, String> {
    if window.label() != "player" {
        return Err("Sessão disponível apenas na janela de reprodução.".into());
    }
    state
        .0
        .lock()
        .await
        .take()
        .ok_or_else(|| "Sessão de reprodução indisponível.".into())
}
