use anyhow::{Result, ensure};
use std::path::{Component, Path};

pub const STORAGE_DIR: &str = ".file_manager";

pub fn validate_relative(path: &str) -> Result<()> {
    ensure!(
        !path.is_empty()
            && !path.contains(['\\', ':', '\0'])
            && path
                .split('/')
                .all(|part| !part.is_empty() && part != "." && part != "..")
            && Path::new(path)
                .components()
                .all(|part| matches!(part, Component::Normal(_))),
        "Invalid canonical relative path"
    );
    Ok(())
}

// Keep scanner matching, uniqueness, and incomplete scopes on the same identity policy.
pub fn key(path: &str) -> String {
    path.to_lowercase()
}

pub fn inside(path: &str, scope: &str) -> bool {
    let path = key(path);
    let scope = key(scope);
    scope.is_empty() || path == scope || path.starts_with(&format!("{scope}/"))
}
