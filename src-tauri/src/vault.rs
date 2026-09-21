use crate::{
    model::*,
    paths::{self, STORAGE_DIR},
};
use anyhow::{Context, Result, bail, ensure};
use serde::{Serialize, de::DeserializeOwned};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};

pub const NOTE_LIMIT: usize = 8 * 1024 * 1024;
pub enum NoteBodyChange {
    Write { id: String, body: String },
    Delete { id: String },
}

pub struct Vault {
    pub root: PathBuf,
    pub catalog: Catalog,
    _lock: File,
    signature: String,
}

pub fn is_link(path: &Path) -> Result<bool> {
    let meta = fs::symlink_metadata(path)?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        Ok(meta.file_attributes() & 0x400 != 0)
    }
    #[cfg(not(windows))]
    {
        Ok(meta.file_type().is_symlink())
    }
}
pub fn safe_path(root: &Path, relative: &str) -> Result<PathBuf> {
    paths::validate_relative(relative)?;
    let mut out = root.to_path_buf();
    for part in Path::new(relative).components() {
        let Component::Normal(name) = part else {
            bail!("Path must stay inside the vault")
        };
        out.push(name);
        if out.exists() || fs::symlink_metadata(&out).is_ok() {
            ensure!(
                !is_link(&out)?,
                "Links/reparse points are not supported: {}",
                out.display()
            );
        }
    }
    Ok(out)
}
fn valid_id(s: &str) -> bool {
    uuid::Uuid::parse_str(s).is_ok_and(|v| v.get_version_num() == 4 && v.to_string() == s)
}
pub fn valid_url(value: &str) -> bool {
    value.is_empty()
        || ((!value.chars().any(char::is_whitespace))
            && (value.starts_with("https://") || value.starts_with("http://"))
            && url::Url::parse(value)
                .is_ok_and(|u| matches!(u.scheme(), "http" | "https") && u.host_str().is_some()))
}
fn stamp(s: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(s).is_ok()
}
pub fn validate(c: &Catalog) -> Result<()> {
    let mut ids = HashSet::new();
    let mut paths = HashSet::new();
    for s in &c.sources {
        ensure!(
            valid_id(&s.id) && ids.insert(s.id.as_str()),
            "Invalid or duplicate source ID"
        );
        paths::validate_relative(&s.path)?;
        ensure!(paths.insert(paths::key(&s.path)), "Duplicate source path");
        ensure!(
            !s.path
                .split('/')
                .next()
                .unwrap_or_default()
                .eq_ignore_ascii_case(STORAGE_DIR),
            "Invalid source path"
        );
        ensure!(
            valid_url(&s.source_url),
            "Source URL must be a complete HTTP(S) link"
        );
        ensure!(
            stamp(&s.created_at) && stamp(&s.modified_at),
            "Invalid source timestamp"
        );
        if let Some(hash) = &s.observation.content_hash {
            ensure!(
                hash.starts_with("blake3:")
                    && hash.len() == 71
                    && hash[7..].bytes().all(|b| b.is_ascii_hexdigit()),
                "Invalid hash"
            );
        }
        let assigned: HashSet<_> = s.tag_ids.iter().collect();
        ensure!(
            assigned.len() == s.tag_ids.len()
                && s.tag_ids
                    .iter()
                    .all(|id| c.tags.iter().any(|t| &t.id == id)),
            "Unknown or duplicate tag assignment"
        );
    }
    let mut note_ids = HashSet::new();
    for n in &c.notes {
        ensure!(
            valid_id(&n.id)
                && note_ids.insert(&n.id)
                && ids.contains(n.source_id.as_str())
                && stamp(&n.created_at)
                && stamp(&n.modified_at),
            "Invalid note record or owner"
        );
    }
    let mut tag_ids = HashSet::new();
    let mut names = HashSet::new();
    for t in &c.tags {
        ensure!(
            valid_id(&t.id)
                && tag_ids.insert(&t.id)
                && !t.name.is_empty()
                && t.name.trim() == t.name
                && names.insert(&t.name)
                && stamp(&t.created_at)
                && stamp(&t.modified_at),
            "Invalid or duplicate tag"
        );
    }
    Ok(())
}
fn read_lines<T: DeserializeOwned>(path: &Path) -> Result<Vec<T>> {
    let text =
        fs::read_to_string(path).with_context(|| format!("Cannot read {}", path.display()))?;
    text.lines()
        .enumerate()
        .map(|(i, line)| {
            serde_json::from_str(line)
                .with_context(|| format!("Invalid {} at line {}", path.display(), i + 1))
        })
        .collect()
}
fn lines<T: Serialize>(items: &[T]) -> Result<String> {
    let mut result = String::new();
    for item in items {
        result.push_str(&serde_json::to_string(item)?);
        result.push('\n');
    }
    Ok(result)
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let temp = path.with_file_name(format!(".write-{}", id()));
    let mut f = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)?;
    f.write_all(bytes)?;
    f.sync_all()?;
    drop(f);
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
        };
        let a: Vec<u16> = temp.as_os_str().encode_wide().chain(Some(0)).collect();
        let b: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        if unsafe {
            MoveFileExW(
                a.as_ptr(),
                b.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        } == 0
        {
            let err = std::io::Error::last_os_error();
            let _ = fs::remove_file(&temp);
            return Err(err.into());
        }
    }
    #[cfg(not(windows))]
    fs::rename(&temp, path)?;
    Ok(())
}

#[derive(Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct Change {
    path: String,
    body: Option<String>,
}
fn allowed_change(p: &str) -> bool {
    matches!(
        p,
        "vault.json" | "sources.jsonl" | "notes.jsonl" | "tags.jsonl"
    ) || p
        .strip_prefix("notes/")
        .and_then(|s| s.strip_suffix(".md"))
        .is_some_and(valid_id)
}
fn apply_journal(dir: &Path) -> Result<()> {
    let journal = safe_path(dir, "pending.json")?;
    if !journal.exists() {
        return Ok(());
    }
    let changes: Vec<Change> = serde_json::from_slice(&fs::read(&journal)?)?;
    for change in &changes {
        ensure!(allowed_change(&change.path), "Invalid transaction target");
        safe_path(dir, &change.path)?;
    }
    for change in changes {
        let path = safe_path(dir, &change.path)?;
        match change.body {
            Some(body) => atomic_write(&path, body.as_bytes())?,
            None => {
                if path.exists() {
                    fs::remove_file(path)?;
                }
            }
        }
    }
    fs::remove_file(journal)?;
    Ok(())
}
impl Vault {
    pub fn open(path: &Path, create: bool) -> Result<Self> {
        ensure!(
            path.is_dir() && !is_link(path)?,
            "Select an ordinary folder"
        );
        let root = fs::canonicalize(path)?;
        let dir = safe_path(&root, STORAGE_DIR)?;
        if !dir.exists() {
            ensure!(create, "This folder has no vault");
            fs::create_dir(&dir)?;
        }
        let lock_path = safe_path(&dir, "write.lock")?;
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            options.share_mode(0);
        }
        let lock = options
            .open(lock_path)
            .context("This vault is already open, or is not writable")?;
        let notes_dir = safe_path(&dir, "notes")?;
        fs::create_dir_all(notes_dir)?;
        apply_journal(&dir).context("Pending save could not be recovered")?;
        let manifest_path = safe_path(&dir, "vault.json")?;
        if !manifest_path.exists() {
            ensure!(create, "Missing vault manifest");
            ensure!(
                !dir.join("sources.jsonl").exists()
                    && !dir.join("notes.jsonl").exists()
                    && !dir.join("tags.jsonl").exists(),
                "Existing metadata without a manifest; refusing to overwrite"
            );
            let changes = vec![
                Change {
                    path: "vault.json".into(),
                    body: Some(serde_json::to_string_pretty(&Manifest {
                        schema_version: 1,
                        id: id(),
                    })?),
                },
                Change {
                    path: "sources.jsonl".into(),
                    body: Some(String::new()),
                },
                Change {
                    path: "notes.jsonl".into(),
                    body: Some(String::new()),
                },
                Change {
                    path: "tags.jsonl".into(),
                    body: Some(String::new()),
                },
            ];
            atomic_write(
                &safe_path(&dir, "pending.json")?,
                &serde_json::to_vec(&changes)?,
            )?;
            apply_journal(&dir)?;
        }
        let manifest: Manifest = serde_json::from_slice(&fs::read(manifest_path)?)?;
        ensure!(
            manifest.schema_version == 1 && valid_id(&manifest.id),
            "Unsupported or invalid vault manifest"
        );
        let catalog = Catalog {
            sources: read_lines(&safe_path(&dir, "sources.jsonl")?)?,
            notes: read_lines(&safe_path(&dir, "notes.jsonl")?)?,
            tags: read_lines(&safe_path(&dir, "tags.jsonl")?)?,
        };
        validate(&catalog)?;
        let mut vault = Self {
            root,
            catalog,
            _lock: lock,
            signature: String::new(),
        };
        vault.signature = vault.disk_signature()?;
        Ok(vault)
    }
    pub fn dir(&self) -> PathBuf {
        self.root.join(STORAGE_DIR)
    }
    fn disk_signature(&self) -> Result<String> {
        let mut hash = blake3::Hasher::new();
        for name in ["vault.json", "sources.jsonl", "notes.jsonl", "tags.jsonl"] {
            hash.update(&fs::read(safe_path(&self.dir(), name)?)?);
        }
        Ok(hash.finalize().to_hex().to_string())
    }
    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            note_sizes: self
                .catalog
                .notes
                .iter()
                .map(|note| {
                    let size = safe_path(&self.dir(), &format!("notes/{}.md", note.id))
                        .ok()
                        .and_then(|path| fs::metadata(path).ok())
                        .filter(|metadata| metadata.is_file())
                        .map(|metadata| metadata.len());
                    (note.id.clone(), size)
                })
                .collect(),
            root: self
                .root
                .to_string_lossy()
                .trim_start_matches("\\\\?\\")
                .into(),
            catalog: self.catalog.clone(),
        }
    }
    pub fn commit(&mut self, mut candidate: Catalog, body: Option<NoteBodyChange>) -> Result<()> {
        ensure!(
            !self.dir().join("pending.json").exists(),
            "A save is pending recovery. Close and reopen this vault"
        );
        ensure!(
            self.disk_signature()? == self.signature,
            "Catalog files changed externally. Close and reopen the vault before editing"
        );
        validate(&candidate)?;
        candidate.sources.sort_by(|a, b| a.id.cmp(&b.id));
        candidate.notes.sort_by(|a, b| a.id.cmp(&b.id));
        candidate.tags.sort_by(|a, b| a.id.cmp(&b.id));
        let mut changes = vec![
            Change {
                path: "sources.jsonl".into(),
                body: Some(lines(&candidate.sources)?),
            },
            Change {
                path: "notes.jsonl".into(),
                body: Some(lines(&candidate.notes)?),
            },
            Change {
                path: "tags.jsonl".into(),
                body: Some(lines(&candidate.tags)?),
            },
        ];
        if let Some(operation) = body {
            let (note_id, body) = match operation {
                NoteBodyChange::Write { id, body } => (id, Some(body)),
                NoteBodyChange::Delete { id } => (id, None),
            };
            ensure!(valid_id(&note_id), "Invalid note ID");
            changes.push(Change {
                path: format!("notes/{note_id}.md"),
                body,
            });
        }
        for change in &changes {
            safe_path(&self.dir(), &change.path)?;
        }
        atomic_write(
            &safe_path(&self.dir(), "pending.json")?,
            &serde_json::to_vec(&changes)?,
        )?;
        apply_journal(&self.dir())
            .context("Save interrupted. Reopen the vault to recover this operation")?;
        self.catalog = candidate;
        self.signature = self.disk_signature()?;
        Ok(())
    }
    pub fn source_path(&self, source_id: &str) -> Result<PathBuf> {
        let s = self
            .catalog
            .sources
            .iter()
            .find(|s| s.id == source_id)
            .context("Unknown source")?;
        safe_path(&self.root, &s.path)
    }
    pub fn read_source_text(&self, source_id: &str) -> Result<String> {
        let path = self.source_path(source_id)?;
        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        ensure!(
            matches!(extension.as_str(), "md" | "markdown" | "txt"),
            "Not a supported text source"
        );
        let file = File::open(path).context("The source file is missing or unreadable")?;
        let mut bytes = Vec::new();
        file.take((NOTE_LIMIT + 1) as u64).read_to_end(&mut bytes)?;
        ensure!(
            bytes.len() <= NOTE_LIMIT,
            "Text preview is limited to 8 MiB. Open the file in its default application."
        );
        let text = String::from_utf8(bytes)
            .context("Text preview requires UTF-8. Open the file in its default application.")?;
        Ok(text.strip_prefix('\u{feff}').unwrap_or(&text).to_owned())
    }
    pub fn read_note(&self, note_id: &str) -> Result<String> {
        ensure!(
            self.catalog.notes.iter().any(|n| n.id == note_id),
            "Unknown note"
        );
        let path = safe_path(&self.dir(), &format!("notes/{note_id}.md"))?;
        let f = File::open(path).context("The note body is missing or unreadable")?;
        let mut bytes = Vec::new();
        f.take((NOTE_LIMIT + 1) as u64).read_to_end(&mut bytes)?;
        ensure!(
            bytes.len() <= NOTE_LIMIT,
            "Note exceeds the 8 MiB editor limit"
        );
        Ok(String::from_utf8(bytes)?)
    }
    pub fn edit_source(&mut self, edit: SourceEdit) -> Result<()> {
        let mut next = self.catalog.clone();
        let s = next
            .sources
            .iter_mut()
            .find(|s| s.id == edit.id)
            .context("Unknown source")?;
        let url = edit.source_url.trim().to_string();
        ensure!(valid_url(&url), "Enter a complete http:// or https:// URL");
        let mut tags = edit.tag_ids;
        tags.sort();
        tags.dedup();
        let mut existing = s.tag_ids.clone();
        existing.sort();
        if s.title == edit.title
            && s.description == edit.description
            && s.source_url == url
            && existing == tags
        {
            return Ok(());
        }
        s.title = edit.title;
        s.description = edit.description;
        s.source_url = url;
        s.tag_ids = tags;
        s.modified_at = now();
        self.commit(next, None)
    }
    pub fn save_note(&mut self, edit: NoteEdit) -> Result<String> {
        ensure!(
            edit.body.len() <= NOTE_LIMIT,
            "Note exceeds the 8 MiB editor limit"
        );
        let mut next = self.catalog.clone();
        ensure!(
            next.sources.iter().any(|s| s.id == edit.source_id),
            "Unknown owning source"
        );
        let (note_id, write_body) = if let Some(note_id) = edit.id {
            let n = next
                .notes
                .iter_mut()
                .find(|n| n.id == note_id && n.source_id == edit.source_id)
                .context("Unknown note")?;
            if n.title == edit.title && n.description == edit.description && !edit.body_changed {
                return Ok(note_id);
            }
            // No comparison with current disk body: external changes are intentionally not conflicts.
            ensure!(
                safe_path(&self.dir(), &format!("notes/{note_id}.md"))?.is_file(),
                "Note body is missing; it will not be silently recreated"
            );
            n.title = edit.title;
            n.description = edit.description;
            n.modified_at = now();
            (note_id, edit.body_changed)
        } else {
            let note_id = id();
            let timestamp = now();
            next.notes.push(Note {
                id: note_id.clone(),
                source_id: edit.source_id,
                title: edit.title,
                description: edit.description,
                created_at: timestamp.clone(),
                modified_at: timestamp,
            });
            (note_id, true)
        };
        self.commit(
            next,
            write_body.then(|| NoteBodyChange::Write {
                id: note_id.clone(),
                body: edit.body,
            }),
        )?;
        Ok(note_id)
    }
    pub fn delete_note(&mut self, note_id: &str) -> Result<()> {
        let mut next = self.catalog.clone();
        ensure!(next.notes.iter().any(|n| n.id == note_id), "Unknown note");
        next.notes.retain(|n| n.id != note_id);
        self.commit(next, Some(NoteBodyChange::Delete { id: note_id.into() }))
    }
    pub fn edit_tag(&mut self, edit: TagEdit) -> Result<()> {
        let name = edit.name.trim().to_string();
        ensure!(!name.is_empty(), "Tag name is required");
        let mut next = self.catalog.clone();
        ensure!(
            !next
                .tags
                .iter()
                .any(|t| t.name == name && Some(&t.id) != edit.id.as_ref()),
            "This case-sensitive tag name already exists"
        );
        if let Some(tag_id) = edit.id {
            let t = next
                .tags
                .iter_mut()
                .find(|t| t.id == tag_id)
                .context("Unknown tag")?;
            if t.name == name && t.description == edit.description {
                return Ok(());
            }
            t.name = name;
            t.description = edit.description;
            t.modified_at = now();
        } else {
            let timestamp = now();
            next.tags.push(Tag {
                id: id(),
                name,
                description: edit.description,
                created_at: timestamp.clone(),
                modified_at: timestamp,
            });
        }
        self.commit(next, None)
    }
    pub fn delete_tag(&mut self, tag_id: &str) -> Result<()> {
        ensure!(
            !self
                .catalog
                .sources
                .iter()
                .any(|s| s.tag_ids.iter().any(|t| t == tag_id)),
            "Unassign this tag from its sources first"
        );
        let mut next = self.catalog.clone();
        ensure!(next.tags.iter().any(|t| t.id == tag_id), "Unknown tag");
        next.tags.retain(|t| t.id != tag_id);
        self.commit(next, None)
    }
}
