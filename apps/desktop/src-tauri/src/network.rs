//! Displays the current LAN addresses and short-lived TV pairing code.

#![expect(
    clippy::redundant_pub_crate,
    reason = "Network menu is internal to the launcher"
)]

use serde::Deserialize;
use tauri_plugin_dialog::DialogExt;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NetworkInfo {
    addresses: Vec<String>,
    pairing_code: String,
}

pub(super) fn show(app: &tauri::AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let message = information(&app).await.unwrap_or_else(|error| error);
        app.dialog()
            .message(message)
            .title("Acessar Popcorn pela TV")
            .blocking_show();
    });
}

async fn information(app: &tauri::AppHandle) -> Result<String, String> {
    let ready = super::connection(app).await?;
    let response = reqwest::Client::new()
        .get(format!("http://{}/browser/network", ready.address))
        .bearer_auth(&ready.token)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|_| "Não foi possível consultar os endereços da rede.")?
        .error_for_status()
        .map_err(|_| "Não foi possível consultar os endereços da rede.")?;
    let info: NetworkInfo = response
        .json()
        .await
        .map_err(|_| "Resposta inválida do servidor local.")?;
    if info.addresses.is_empty() {
        return Ok("Nenhuma rede local encontrada. Conecte o computador ao Wi-Fi ou cabo de rede e reinicie o Popcorn.".into());
    }
    Ok(format!(
        "Na TV, abra o navegador e acesse:\n\n{}\n\nCódigo de conexão: {}\n\nO código expira em até 10 minutos. Mantenha o computador ligado e conectado à mesma rede da TV.",
        info.addresses.join("\n"),
        info.pairing_code
    ))
}
