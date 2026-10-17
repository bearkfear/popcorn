//! Saves portable source catalogs only to a destination selected in the native dialog.

use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub(crate) async fn save_source_catalog(
    app: tauri::AppHandle,
    document: String,
) -> Result<bool, String> {
    if document.len() > 32 * 1024 * 1024 {
        return Err("O catálogo excede o limite de 32 MB.".to_owned());
    }
    let path = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Exportar catálogo")
            .set_file_name("meu-catalogo.popcatalog")
            .add_filter("Catálogo Popcorn", &["popcatalog"])
            .blocking_save_file()
    })
    .await
    .map_err(|_| "Não foi possível abrir o seletor de arquivos.".to_owned())?;
    let Some(path) = path else {
        return Ok(false);
    };
    let path = path
        .into_path()
        .map_err(|_| "Destino inválido.".to_owned())?;
    tokio::fs::write(path, document)
        .await
        .map_err(|_| "Não foi possível salvar o catálogo. Escolha outro destino.".to_owned())?;
    Ok(true)
}
