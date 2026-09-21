use crate::{Reply, startup::StartupOptions, with_vault};
use tauri::Manager;

#[tauri::command]
pub async fn renderer_ready(app: tauri::AppHandle) -> Reply<()> {
    if let Some(endpoint) = app.state::<StartupOptions>().handoff.clone() {
        tauri::async_runtime::spawn_blocking(move || endpoint.notify(None))
            .await
            .map_err(crate::message)?
            .map_err(crate::message)?;
    }
    if app.state::<StartupOptions>().smoke {
        with_vault(app.clone(), move |v| {
            std::fs::write(
                v.dir().join("smoke-ready.txt"),
                "Renderer mounted successfully; waiting for PDF render",
            )?;
            Ok(())
        })
        .await?;
    }
    Ok(())
}
#[tauri::command]
pub async fn smoke_result(app: tauri::AppHandle, success: bool, detail: String) -> Reply<()> {
    if !app.state::<StartupOptions>().smoke {
        return Ok(());
    }
    let exit = !app.state::<StartupOptions>().inspect || detail == "Inspection complete";
    with_vault(app.clone(), move |v| {
        std::fs::write(
            v.dir().join("smoke-result.json"),
            serde_json::to_vec(&serde_json::json!({"success":success,"detail":detail}))?,
        )?;
        Ok(())
    })
    .await?;
    if exit {
        app.exit(if success { 0 } else { 1 });
    }
    Ok(())
}
