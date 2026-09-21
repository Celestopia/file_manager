use crate::{
    model::*,
    paths::{STORAGE_DIR, inside, key},
    vault::{Vault, is_link, safe_path},
};
use anyhow::{Result, ensure};
use std::{
    collections::{HashMap, HashSet},
    fs::File,
    io::Read,
    path::Path,
};

fn hash_file(path: &Path) -> Result<String> {
    let mut file = File::open(path)?;
    let mut hash = blake3::Hasher::new();
    let mut buf = vec![0; 128 * 1024];
    loop {
        let len = file.read(&mut buf)?;
        if len == 0 {
            break;
        }
        hash.update(&buf[..len]);
    }
    Ok(format!("blake3:{}", hash.finalize().to_hex()))
}
fn relative(root: &Path, path: &Path) -> Result<String> {
    Ok(path
        .strip_prefix(root)?
        .to_string_lossy()
        .replace('\\', "/"))
}
pub fn refresh(vault: &mut Vault, mut progress: impl FnMut(usize, &str)) -> Result<RefreshSummary> {
    let mut summary = RefreshSummary::default();
    let mut scanned = Vec::new();
    let mut incomplete = Vec::new();
    let walker = walkdir::WalkDir::new(&vault.root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            e.depth() == 0
                || !(e.depth() == 1
                    && e.file_name()
                        .to_string_lossy()
                        .eq_ignore_ascii_case(STORAGE_DIR))
        });
    for entry in walker {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                incomplete.push(
                    e.path()
                        .map(|p| relative(&vault.root, p))
                        .transpose()?
                        .unwrap_or_default(),
                );
                summary.warnings.push(format!(
                    "Could not inspect {}",
                    e.path()
                        .map(|p| relative(&vault.root, p))
                        .transpose()?
                        .unwrap_or_else(|| "vault".into())
                ));
                continue;
            }
        };
        if entry.depth() == 0 {
            continue;
        }
        let rel = relative(&vault.root, entry.path())?;
        if is_link(entry.path()).unwrap_or(true) {
            incomplete.push(rel.clone());
            summary.warnings.push(format!("Skipped linked path: {rel}"));
            continue;
        }
        if entry.file_type().is_dir() {
            ensure!(
                !entry.path().join(STORAGE_DIR).join("vault.json").exists(),
                "Nested vault found at {rel}; refresh was not applied"
            );
            continue;
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let observed = (|| -> Result<Observation> {
            let path = safe_path(&vault.root, &rel)?;
            let before = std::fs::metadata(&path)?;
            let digest = hash_file(&path)?;
            let after = std::fs::metadata(&path)?;
            ensure!(
                before.len() == after.len() && before.modified()? == after.modified()?,
                "File changed while hashing"
            );
            Ok(Observation {
                availability: Availability::Present,
                size_bytes: Some(after.len()),
                file_modified_at: Some(
                    chrono::DateTime::<chrono::Utc>::from(after.modified()?).to_rfc3339(),
                ),
                content_hash: Some(digest),
            })
        })();
        match observed {
            Ok(obs) => scanned.push((rel.clone(), obs)),
            Err(err) => {
                incomplete.push(rel.clone());
                summary
                    .warnings
                    .push(format!("Could not read {rel}: {err}"));
            }
        }
        summary.scanned += 1;
        progress(summary.scanned, &rel);
    }
    let mut next = vault.catalog.clone();
    let mut matched = HashSet::new();
    let mut new_entries = Vec::new();
    let paths: HashMap<String, usize> = next
        .sources
        .iter()
        .enumerate()
        .map(|(i, s)| (key(&s.path), i))
        .collect();
    for (path, obs) in scanned {
        if let Some(&index) = paths.get(&key(&path)) {
            next.sources[index].path = path;
            next.sources[index].observation = obs;
            matched.insert(index);
        } else {
            new_entries.push((path, obs));
        }
    }
    let mut old_hashes: HashMap<String, Vec<usize>> = HashMap::new();
    for (i, s) in next.sources.iter_mut().enumerate() {
        if matched.contains(&i) {
            continue;
        }
        if incomplete.iter().any(|scope| inside(&s.path, scope)) {
            s.observation.availability = Availability::Unavailable;
        } else {
            s.observation.availability = Availability::Missing;
            if let Some(hash) = &s.observation.content_hash {
                old_hashes.entry(hash.clone()).or_default().push(i);
            }
        }
    }
    let mut counts: HashMap<String, usize> = HashMap::new();
    for (_, obs) in &new_entries {
        if let Some(hash) = &obs.content_hash {
            *counts.entry(hash.clone()).or_default() += 1;
        }
    }
    for (path, obs) in new_entries {
        let hash = obs.content_hash.as_ref().unwrap();
        let candidates = old_hashes.get(hash);
        if incomplete.is_empty()
            && candidates.is_some_and(|c| c.len() == 1)
            && counts.get(hash) == Some(&1)
        {
            let s = &mut next.sources[candidates.unwrap()[0]];
            s.path = path;
            s.observation = obs;
            summary.moved += 1;
        } else {
            if !incomplete.is_empty() && candidates.is_some() {
                summary.warnings.push(format!(
                    "Deferred possible moved source until a complete refresh: {path}"
                ));
                continue;
            }
            if candidates.is_some() {
                summary.warnings.push(format!(
                    "Ambiguous content match; added independently: {path}"
                ));
            }
            let timestamp = now();
            next.sources.push(Source {
                id: id(),
                path,
                title: String::new(),
                description: String::new(),
                source_url: String::new(),
                tag_ids: Vec::new(),
                created_at: timestamp.clone(),
                modified_at: timestamp,
                observation: obs,
            });
            summary.added += 1;
        }
    }
    summary.missing = next
        .sources
        .iter()
        .filter(|s| s.observation.availability == Availability::Missing)
        .count();
    summary.unavailable = next
        .sources
        .iter()
        .filter(|s| s.observation.availability == Availability::Unavailable)
        .count();
    vault.commit(next, None)?;
    Ok(summary)
}
