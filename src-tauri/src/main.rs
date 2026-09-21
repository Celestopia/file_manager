#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod handoff;
mod model;
mod paths;
mod scanner;
mod smoke;
mod startup;
use smoke::{renderer_ready, smoke_result};
use startup::StartupOptions;
#[cfg(test)]
mod tests;
mod vault;

use model::*;
use std::{
    io::{Read, Seek, SeekFrom},
    sync::Mutex,
};
use tauri::{Emitter, Manager};
use vault::Vault;

struct AppState(Mutex<Vault>);
type Reply<T> = Result<T, String>;
fn message(err: impl std::fmt::Display) -> String {
    err.to_string()
}
async fn with_vault<T: Send + 'static>(
    app: tauri::AppHandle,
    action: impl FnOnce(&mut Vault) -> anyhow::Result<T> + Send + 'static,
) -> Reply<T> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut vault = state.0.lock().map_err(message)?;
        action(&mut vault).map_err(|e| format!("{e:#}"))
    })
    .await
    .map_err(message)?
}
#[tauri::command]
async fn snapshot(app: tauri::AppHandle) -> Reply<Snapshot> {
    with_vault(app, |v| Ok(v.snapshot())).await
}
#[tauri::command]
async fn refresh(app: tauri::AppHandle) -> Reply<(Snapshot, RefreshSummary)> {
    let events = app.clone();
    with_vault(app, move |v| {
        let summary = scanner::refresh(v, |count, path| {
            let _ = events.emit("refresh-progress", (count, path));
        })?;
        Ok((v.snapshot(), summary))
    })
    .await
}
#[tauri::command]
async fn edit_source(app: tauri::AppHandle, edit: SourceEdit) -> Reply<Snapshot> {
    with_vault(app, move |v| {
        v.edit_source(edit)?;
        Ok(v.snapshot())
    })
    .await
}
#[tauri::command]
async fn read_source_text(app: tauri::AppHandle, id: String) -> Reply<String> {
    with_vault(app, move |v| v.read_source_text(&id)).await
}
#[tauri::command]
async fn read_note(app: tauri::AppHandle, id: String) -> Reply<String> {
    with_vault(app, move |v| v.read_note(&id)).await
}
#[tauri::command]
async fn save_note(app: tauri::AppHandle, edit: NoteEdit) -> Reply<(Snapshot, String)> {
    with_vault(app, move |v| {
        let id = v.save_note(edit)?;
        Ok((v.snapshot(), id))
    })
    .await
}
#[tauri::command]
async fn delete_note(app: tauri::AppHandle, id: String) -> Reply<Snapshot> {
    with_vault(app, move |v| {
        v.delete_note(&id)?;
        Ok(v.snapshot())
    })
    .await
}
#[tauri::command]
async fn edit_tag(app: tauri::AppHandle, edit: TagEdit) -> Reply<Snapshot> {
    with_vault(app, move |v| {
        v.edit_tag(edit)?;
        Ok(v.snapshot())
    })
    .await
}
#[tauri::command]
async fn delete_tag(app: tauri::AppHandle, id: String) -> Reply<Snapshot> {
    with_vault(app, move |v| {
        v.delete_tag(&id)?;
        Ok(v.snapshot())
    })
    .await
}
#[tauri::command]
async fn open_source(app: tauri::AppHandle, id: String) -> Reply<()> {
    with_vault(app, move |v| {
        let path = v.source_path(&id)?;
        anyhow::ensure!(path.is_file(), "Source file is missing");
        open::that(path)?;
        Ok(())
    })
    .await
}
#[tauri::command]
async fn open_url(app: tauri::AppHandle, id: String) -> Reply<()> {
    with_vault(app, move |v| {
        let s = v
            .catalog
            .sources
            .iter()
            .find(|s| s.id == id)
            .ok_or_else(|| anyhow::anyhow!("Unknown source"))?;
        anyhow::ensure!(
            !s.source_url.is_empty() && vault::valid_url(&s.source_url),
            "No valid source URL"
        );
        open::that(&s.source_url)?;
        Ok(())
    })
    .await
}
#[tauri::command]
async fn pdf_size(app: tauri::AppHandle, id: String) -> Reply<u64> {
    with_vault(app, move |v| {
        let path = v.source_path(&id)?;
        anyhow::ensure!(
            path.extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("pdf")),
            "Not a PDF"
        );
        Ok(std::fs::metadata(path)?.len())
    })
    .await
}
#[tauri::command]
async fn pdf_range(
    app: tauri::AppHandle,
    id: String,
    begin: u64,
    end: u64,
) -> Reply<tauri::ipc::Response> {
    with_vault(app, move |v| {
        anyhow::ensure!(
            end > begin && end - begin <= 2 * 1024 * 1024,
            "Invalid PDF range"
        );
        let path = v.source_path(&id)?;
        anyhow::ensure!(
            path.extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("pdf")),
            "Not a PDF"
        );
        let mut f = std::fs::File::open(path)?;
        anyhow::ensure!(
            end <= f.metadata()?.len(),
            "PDF changed or requested range exceeds file size"
        );
        f.seek(SeekFrom::Start(begin))?;
        let mut bytes = vec![0; (end - begin) as usize];
        f.read_exact(&mut bytes)?;
        Ok(tauri::ipc::Response::new(bytes))
    })
    .await
}
#[tauri::command]
async fn choose_folder(app: tauri::AppHandle) -> Reply<Option<String>> {
    let path = tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Open a resource folder")
            .pick_folder()
    })
    .await
    .map_err(message)?;
    with_vault(app, move |v| {
        Ok(path
            .filter(|p| std::fs::canonicalize(p).ok().as_ref() != Some(&v.root))
            .map(|p| p.to_string_lossy().into()))
    })
    .await
}
#[tauri::command]
async fn switch_folder(app: tauri::AppHandle, path: String) -> Reply<()> {
    tauri::async_runtime::spawn_blocking(move || handoff::open(&path))
        .await
        .map_err(message)?
        .map_err(message)?;
    app.exit(0);
    Ok(())
}
fn main() {
    let options = StartupOptions::parse();
    if let Err(error) = start(options.clone()) {
        if let Some(endpoint) = options.handoff {
            let _ = endpoint.notify(Some(format!("{error:#}")));
            return;
        }
        rfd::MessageDialog::new()
            .set_title("File Manager")
            .set_description(format!("{error:#}"))
            .set_level(rfd::MessageLevel::Error)
            .show();
    }
}
fn start(options: StartupOptions) -> anyhow::Result<()> {
    let selected = options.vault.clone().or_else(|| {
        rfd::FileDialog::new()
            .set_title("Choose your resource folder")
            .pick_folder()
    });
    let Some(root) = selected else {
        return Ok(());
    };
    let create = !root.join(paths::STORAGE_DIR).join("vault.json").exists();
    if create && !options.smoke {
        let answer = rfd::MessageDialog::new().set_title("Create a vault?").set_description("Store metadata and notes in this folder's .file_manager directory. Original files stay untouched. Initial discovery will read and hash all source files.").set_buttons(rfd::MessageButtons::OkCancel).show();
        if answer != rfd::MessageDialogResult::Ok {
            return Ok(());
        }
    }
    let vault = Vault::open(&root, create)?;
    let runtime = vault::safe_path(&vault.dir(), "runtime")?;
    std::fs::create_dir_all(&runtime)?;
    let webview = vault::safe_path(&runtime, "webview2")?;
    let smoke = options.smoke;
    tauri::Builder::default()
        .manage(options)
        .manage(AppState(Mutex::new(vault)))
        .setup(move |app| {
            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("File Manager")
            .decorations(false)
            .inner_size(1240., 850.)
            .maximized(true)
            .min_inner_size(850., 600.)
            .data_directory(webview)
            .visible(!smoke)
            .initialization_script(if smoke {
                "window.__SMOKE__ = true;"
            } else {
                "window.__SMOKE__ = false;"
            })
            .initialization_script(if create {
                "window.__INITIAL_SCAN__ = true;"
            } else {
                "window.__INITIAL_SCAN__ = false;"
            })
            .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            snapshot,
            refresh,
            edit_source,
            read_note,
            read_source_text,
            save_note,
            delete_note,
            edit_tag,
            delete_tag,
            open_source,
            open_url,
            pdf_size,
            pdf_range,
            choose_folder,
            switch_folder,
            renderer_ready,
            smoke_result
        ])
        .run(tauri::generate_context!())?;
    Ok(())
}
