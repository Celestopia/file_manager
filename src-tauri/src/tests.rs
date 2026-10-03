use crate::{
    model::*,
    scanner::refresh,
    vault::{Vault, safe_path, valid_url},
};
use std::{fs, path::Path};
fn setup() -> (tempfile::TempDir, Vault) {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("paper.pdf"), b"original bytes").unwrap();
    let mut vault = Vault::open(dir.path(), true).unwrap();
    refresh(&mut vault, |_, _| {}).unwrap();
    (dir, vault)
}
fn edit(v: &Vault) -> SourceEdit {
    let s = &v.catalog.sources[0];
    SourceEdit {
        id: s.id.clone(),
        title: s.title.clone(),
        description: s.description.clone(),
        source_url: s.source_url.clone(),
        tag_ids: s.tag_ids.clone(),
    }
}
fn create_note(v: &mut Vault) -> String {
    v.save_note(NoteEdit {
        id: None,
        source_id: v.catalog.sources[0].id.clone(),
        title: "Reading note 1".into(),
        description: "Background".into(),
        body: "# Thoughts\nUseful insight".into(),
        body_changed: true,
    })
    .unwrap()
}
fn original(path: &Path) -> Vec<u8> {
    fs::read(path.join("paper.pdf")).unwrap()
}

#[test]
fn metadata_and_notes_roundtrip_preserves_original() {
    let (dir, mut v) = setup();
    let before = original(dir.path());
    let mut e = edit(&v);
    e.title = "My paper".into();
    e.description = "Background".into();
    e.source_url = "https://example.org/paper".into();
    v.edit_source(e).unwrap();
    let stamp = v.catalog.sources[0].modified_at.clone();
    let id = create_note(&mut v);
    assert_eq!(v.catalog.sources[0].modified_at, stamp);
    drop(v);
    let v = Vault::open(dir.path(), false).unwrap();
    assert_eq!(v.catalog.sources[0].title, "My paper");
    assert_eq!(v.read_note(&id).unwrap(), "# Thoughts\nUseful insight");
    assert_eq!(original(dir.path()), before);
}

#[test]
fn same_path_replacement_retains_knowledge_and_creation() {
    let (dir, mut v) = setup();
    let id = create_note(&mut v);
    let before = v.catalog.sources[0].clone();
    fs::write(dir.path().join("paper.pdf"), b"replacement bytes").unwrap();
    refresh(&mut v, |_, _| {}).unwrap();
    let after = &v.catalog.sources[0];
    assert_eq!(before.id, after.id);
    assert_eq!(before.created_at, after.created_at);
    assert_eq!(before.modified_at, after.modified_at);
    assert_ne!(
        before.observation.content_hash,
        after.observation.content_hash
    );
    assert!(v.read_note(&id).is_ok());
}

#[test]
fn every_refresh_hashes_even_if_length_unchanged() {
    let (dir, mut v) = setup();
    let hash = v.catalog.sources[0].observation.content_hash.clone();
    fs::write(dir.path().join("paper.pdf"), b"changed! bytes").unwrap();
    refresh(&mut v, |_, _| {}).unwrap();
    assert_ne!(hash, v.catalog.sources[0].observation.content_hash);
}

#[test]
fn move_preserves_identity_but_move_plus_edit_does_not() {
    let (dir, mut v) = setup();
    let id = v.catalog.sources[0].id.clone();
    create_note(&mut v);
    fs::rename(dir.path().join("paper.pdf"), dir.path().join("renamed.pdf")).unwrap();
    let r = refresh(&mut v, |_, _| {}).unwrap();
    assert_eq!(r.moved, 1);
    assert_eq!(v.catalog.sources[0].id, id);
    fs::rename(
        dir.path().join("renamed.pdf"),
        dir.path().join("edited.pdf"),
    )
    .unwrap();
    fs::write(dir.path().join("edited.pdf"), b"new body").unwrap();
    refresh(&mut v, |_, _| {}).unwrap();
    assert_eq!(v.catalog.sources.len(), 2);
    assert_eq!(
        v.catalog
            .sources
            .iter()
            .find(|s| s.id == id)
            .unwrap()
            .observation
            .availability,
        Availability::Missing
    );
    assert_eq!(v.catalog.notes[0].source_id, id);
}

#[test]
fn copies_have_independent_metadata() {
    let (dir, mut v) = setup();
    let mut e = edit(&v);
    e.description = "Only original".into();
    v.edit_source(e).unwrap();
    fs::copy(dir.path().join("paper.pdf"), dir.path().join("copy.pdf")).unwrap();
    refresh(&mut v, |_, _| {}).unwrap();
    assert_eq!(v.catalog.sources.len(), 2);
    assert_eq!(
        v.catalog
            .sources
            .iter()
            .find(|s| s.path == "copy.pdf")
            .unwrap()
            .description,
        ""
    );
}

#[test]
fn ambiguous_moves_do_not_reassign_notes() {
    let (dir, mut v) = setup();
    let old_id = v.catalog.sources[0].id.clone();
    let note = create_note(&mut v);
    fs::rename(dir.path().join("paper.pdf"), dir.path().join("one.pdf")).unwrap();
    fs::copy(dir.path().join("one.pdf"), dir.path().join("two.pdf")).unwrap();
    let r = refresh(&mut v, |_, _| {}).unwrap();
    assert_eq!(r.moved, 0);
    assert_eq!(r.added, 2);
    assert_eq!(r.missing, 1);
    assert_eq!(
        v.catalog
            .notes
            .iter()
            .find(|n| n.id == note)
            .unwrap()
            .source_id,
        old_id
    );
}

#[test]
fn missing_source_retains_notes() {
    let (dir, mut v) = setup();
    let id = create_note(&mut v);
    fs::remove_file(dir.path().join("paper.pdf")).unwrap();
    refresh(&mut v, |_, _| {}).unwrap();
    assert_eq!(
        v.catalog.sources[0].observation.availability,
        Availability::Missing
    );
    assert!(v.read_note(&id).is_ok());
}

#[test]
fn external_note_edit_does_not_touch_timestamps_or_block_app_save() {
    let (_dir, mut v) = setup();
    let id = create_note(&mut v);
    let n = v.catalog.notes[0].clone();
    let source_stamp = v.catalog.sources[0].modified_at.clone();
    fs::write(v.dir().join(format!("notes/{id}.md")), "external").unwrap();
    assert_eq!(v.read_note(&id).unwrap(), "external");
    assert_eq!(v.catalog.notes[0].modified_at, n.modified_at);
    std::thread::sleep(std::time::Duration::from_millis(3));
    v.save_note(NoteEdit {
        id: Some(id.clone()),
        source_id: n.source_id,
        title: n.title,
        description: n.description,
        body: "application draft".into(),
        body_changed: true,
    })
    .unwrap();
    assert_eq!(v.read_note(&id).unwrap(), "application draft");
    assert_ne!(v.catalog.notes[0].modified_at, n.modified_at);
    assert_eq!(v.catalog.sources[0].modified_at, source_stamp);
}

#[test]
fn metadata_only_note_save_preserves_external_body() {
    let (_dir, mut v) = setup();
    let id = create_note(&mut v);
    let n = v.catalog.notes[0].clone();
    fs::write(v.dir().join(format!("notes/{id}.md")), "external").unwrap();
    v.save_note(NoteEdit {
        id: Some(id.clone()),
        source_id: n.source_id,
        title: "new title".into(),
        description: n.description,
        body: "stale editor text".into(),
        body_changed: false,
    })
    .unwrap();
    assert_eq!(v.read_note(&id).unwrap(), "external");
}

#[test]
fn unchanged_save_does_not_advance_time() {
    let (_dir, mut v) = setup();
    let before = v.catalog.sources[0].modified_at.clone();
    v.edit_source(edit(&v)).unwrap();
    assert_eq!(v.catalog.sources[0].modified_at, before);
    let id = create_note(&mut v);
    let n = v.catalog.notes[0].clone();
    v.save_note(NoteEdit {
        id: Some(id),
        source_id: n.source_id,
        title: n.title,
        description: n.description,
        body: "ignored stale buffer".into(),
        body_changed: false,
    })
    .unwrap();
    assert_eq!(v.catalog.notes[0].modified_at, n.modified_at);
}

#[test]
fn note_deletion_affects_only_selected_note() {
    let (dir, mut v) = setup();
    let a = create_note(&mut v);
    let b = create_note(&mut v);
    let stamp = v.catalog.sources[0].modified_at.clone();
    v.delete_note(&a).unwrap();
    assert!(!v.dir().join(format!("notes/{a}.md")).exists());
    assert!(v.read_note(&b).is_ok());
    assert_eq!(v.catalog.sources[0].modified_at, stamp);
    assert_eq!(original(dir.path()), b"original bytes");
    drop(v);
    let v = Vault::open(dir.path(), false).unwrap();
    assert_eq!(v.catalog.notes.len(), 1);
}

#[test]
fn missing_note_is_not_recreated_by_save() {
    let (_dir, mut v) = setup();
    let id = create_note(&mut v);
    let n = v.catalog.notes[0].clone();
    fs::remove_file(v.dir().join(format!("notes/{id}.md"))).unwrap();
    assert!(
        v.save_note(NoteEdit {
            id: Some(id.clone()),
            source_id: n.source_id,
            title: n.title,
            description: n.description,
            body: "changed".into(),
            body_changed: true
        })
        .is_err()
    );
    assert!(!v.dir().join(format!("notes/{id}.md")).exists());
    v.delete_note(&id).unwrap();
}

#[test]
fn tags_are_case_sensitive_and_rename_preserves_source_time() {
    let (_dir, mut v) = setup();
    for name in ["Research", "research"] {
        v.edit_tag(TagEdit {
            parent_id: None,
            id: None,
            name: name.into(),
            description: String::new(),
        })
        .unwrap();
    }
    assert_eq!(v.catalog.tags.len(), 2);
    assert!(
        v.edit_tag(TagEdit {
            parent_id: None,
            id: None,
            name: "Research".into(),
            description: String::new()
        })
        .is_err()
    );
    let tag = v.catalog.tags[0].clone();
    let mut e = edit(&v);
    e.tag_ids.push(tag.id.clone());
    v.edit_source(e).unwrap();
    let source_time = v.catalog.sources[0].modified_at.clone();
    v.edit_tag(TagEdit {
        parent_id: None,
        id: Some(tag.id),
        name: "Renamed".into(),
        description: "tag context".into(),
    })
    .unwrap();
    assert_eq!(v.catalog.sources[0].modified_at, source_time);
}

#[test]
fn invalid_edit_leaves_catalog_unchanged() {
    let (_dir, mut v) = setup();
    let before = serde_json::to_string(&v.catalog).unwrap();
    let mut e = edit(&v);
    e.tag_ids = vec![id()];
    assert!(v.edit_source(e).is_err());
    assert_eq!(serde_json::to_string(&v.catalog).unwrap(), before);
}

#[test]
fn catalog_external_changes_are_not_silently_overwritten() {
    let (_dir, mut v) = setup();
    fs::write(v.dir().join("tags.jsonl"), "external invalid file").unwrap();
    let mut e = edit(&v);
    e.title = "draft".into();
    assert!(v.edit_source(e).is_err());
    assert_eq!(v.catalog.sources[0].title, "");
}

#[test]
fn interrupted_note_delete_recovers_on_reopen() {
    let (dir, mut v) = setup();
    let id = create_note(&mut v);
    let notes = String::new();
    let journal = serde_json::json!([{"path":"notes.jsonl","body":notes},{"path":format!("notes/{id}.md"),"body":null}]);
    fs::write(v.dir().join("pending.json"), journal.to_string()).unwrap();
    drop(v);
    let v = Vault::open(dir.path(), false).unwrap();
    assert!(v.catalog.notes.is_empty());
    assert!(!v.dir().join(format!("notes/{id}.md")).exists());
    assert!(!v.dir().join("pending.json").exists());
}

#[test]
fn malicious_journal_cannot_write_sources() {
    let (dir, v) = setup();
    fs::write(
        v.dir().join("pending.json"),
        r#"[{"path":"../paper.pdf","body":"overwritten"}]"#,
    )
    .unwrap();
    drop(v);
    assert!(Vault::open(dir.path(), false).is_err());
    assert_eq!(original(dir.path()), b"original bytes");
}

#[test]
fn second_writer_is_rejected() {
    let (dir, _v) = setup();
    assert!(Vault::open(dir.path(), false).is_err());
}

#[test]
fn validation_rejects_traversal_and_incomplete_urls() {
    let dir = tempfile::tempdir().unwrap();
    for path in [
        "../outside",
        "/absolute",
        "notes/../../source",
        "C:/absolute",
    ] {
        assert!(safe_path(dir.path(), path).is_err());
    }
    for url in [
        "doi:10.1/a",
        "example.org",
        "https:example.org",
        "file:///x",
        "https://a b",
    ] {
        assert!(!valid_url(url), "{url}");
    }
    assert!(valid_url("https://doi.org/10.1/paper"));
    assert!(valid_url(""));
}

#[test]
fn nested_vault_aborts_refresh_without_catalog_changes() {
    let (dir, mut v) = setup();
    let before = serde_json::to_string(&v.catalog).unwrap();
    fs::create_dir_all(dir.path().join("nested/.file_manager")).unwrap();
    fs::write(dir.path().join("nested/.file_manager/vault.json"), "{}").unwrap();
    assert!(refresh(&mut v, |_, _| {}).is_err());
    assert_eq!(serde_json::to_string(&v.catalog).unwrap(), before);
}

#[test]
fn note_sizes_are_runtime_bytes_without_metadata_mutation() {
    let (dir, mut vault) = setup();
    let id = create_note(&mut vault);
    let path = dir
        .path()
        .join(".file_manager/notes")
        .join(format!("{id}.md"));
    let registry = dir.path().join(".file_manager/notes.jsonl");
    let before = fs::read(&registry).unwrap();
    fs::write(&path, "你好\n").unwrap();
    assert_eq!(vault.snapshot().note_sizes[&id], Some(7));
    assert_eq!(fs::read(&registry).unwrap(), before);
    fs::write(&path, "").unwrap();
    assert_eq!(vault.snapshot().note_sizes[&id], Some(0));
    fs::remove_file(&path).unwrap();
    assert_eq!(vault.snapshot().note_sizes[&id], None);
    assert_eq!(fs::read(&registry).unwrap(), before);
    let persisted: serde_json::Value = serde_json::from_slice(&before).unwrap();
    assert!(persisted.get("path").is_none());
    assert!(persisted.get("size_bytes").is_none());
}

#[test]
fn source_text_preview_is_bounded_and_read_only() {
    let (dir, mut vault) = setup();
    let text = "\u{feff}# 标题\n\nExample body";
    fs::write(dir.path().join("example.MD"), text).unwrap();
    fs::write(dir.path().join("empty.txt"), "").unwrap();
    fs::write(dir.path().join("invalid.txt"), [0xff, 0xfe, 0xff]).unwrap();
    fs::write(
        dir.path().join("large.txt"),
        vec![b'a'; crate::vault::NOTE_LIMIT + 1],
    )
    .unwrap();
    refresh(&mut vault, |_, _| {}).unwrap();
    let id = |path: &str| {
        vault
            .catalog
            .sources
            .iter()
            .find(|s| s.path == path)
            .unwrap()
            .id
            .clone()
    };
    let before = fs::read(dir.path().join(".file_manager/sources.jsonl")).unwrap();
    assert_eq!(
        vault.read_source_text(&id("example.MD")).unwrap(),
        "# 标题\n\nExample body"
    );
    assert_eq!(vault.read_source_text(&id("empty.txt")).unwrap(), "");
    assert!(vault.read_source_text(&id("invalid.txt")).is_err());
    assert!(vault.read_source_text(&id("large.txt")).is_err());
    assert!(vault.read_source_text(&id("paper.pdf")).is_err());
    assert!(vault.read_source_text("unknown").is_err());
    assert_eq!(
        fs::read_to_string(dir.path().join("example.MD")).unwrap(),
        text
    );
    assert_eq!(
        fs::read(dir.path().join(".file_manager/sources.jsonl")).unwrap(),
        before
    );
}

#[test]
fn case_changed_unreadable_scope_is_unavailable_not_missing() {
    use std::os::windows::fs::OpenOptionsExt;
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir(dir.path().join("Group")).unwrap();
    fs::write(dir.path().join("Group/paper.pdf"), "unchanged original").unwrap();
    let mut v = Vault::open(dir.path(), true).unwrap();
    crate::scanner::refresh(&mut v, |_, _| {}).unwrap();
    fs::rename(dir.path().join("Group"), dir.path().join("Temporary")).unwrap();
    fs::rename(dir.path().join("Temporary"), dir.path().join("group")).unwrap();
    let _locked = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(dir.path().join("group/paper.pdf"))
        .unwrap();
    let summary = crate::scanner::refresh(&mut v, |_, _| {}).unwrap();
    assert!(!summary.warnings.is_empty());
    assert_eq!(
        v.catalog.sources[0].observation.availability,
        Availability::Unavailable
    );
}
#[test]
fn source_path_aliases_do_not_bypass_duplicate_validation() {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir(dir.path().join("folder")).unwrap();
    fs::write(dir.path().join("folder/file.txt"), "original").unwrap();
    let mut v = Vault::open(dir.path(), true).unwrap();
    crate::scanner::refresh(&mut v, |_, _| {}).unwrap();
    let mut candidate = v.catalog.clone();
    let mut alias = candidate.sources[0].clone();
    alias.id = id();
    alias.path = "folder/./file.txt".into();
    candidate.sources.push(alias);
    assert!(
        crate::vault::validate(&candidate).is_err(),
        "Two source records may resolve to the same actual file"
    );
}

#[test]
fn noncanonical_relative_paths_are_rejected() {
    for path in [
        "folder//file.txt",
        "folder/./file.txt",
        "/file.txt",
        "folder/../file.txt",
        "file.txt/",
        "C:/file.txt",
    ] {
        assert!(crate::paths::validate_relative(path).is_err(), "{path}");
    }
    assert!(crate::paths::validate_relative("folder/资料.txt").is_ok());
}

#[test]
#[ignore = "Generated explicitly for frontend contract verification"]
fn export_frontend_contract() {
    let (_dir, mut vault) = setup();
    create_note(&mut vault);
    vault
        .edit_tag(TagEdit {
            parent_id: None,
            id: None,
            name: "Research".into(),
            description: "Context".into(),
        })
        .unwrap();
    let summary = refresh(&mut vault, |_, _| {}).unwrap();
    let value = serde_json::json!({
        "snapshot": vault.snapshot(),
        "summary": summary,
        "availabilities": [Availability::Present, Availability::Missing, Availability::Unavailable],
    });
    fs::write(
        std::env::var("FILE_MANAGER_CONTRACT").expect("contract destination"),
        serde_json::to_vec_pretty(&value).unwrap(),
    )
    .unwrap();
}

fn add_tag(v: &mut Vault, name: &str, parent: Option<&str>) -> String {
    v.edit_tag(TagEdit {
        id: None,
        name: name.into(),
        parent_id: parent.map(str::to_owned),
        description: String::new(),
    })
    .unwrap();
    v.catalog
        .tags
        .iter()
        .find(|t| t.name == name && t.parent_id.as_deref() == parent)
        .unwrap()
        .id
        .clone()
}

#[test]
fn hierarchy_validates_siblings_cycles_and_preserves_subtree_identity() {
    let (_dir, mut v) = setup();
    let a = add_tag(&mut v, "A", None);
    let b = add_tag(&mut v, "B", None);
    let child = add_tag(&mut v, "Child", Some(&a));
    let other = add_tag(&mut v, "Child", Some(&b));
    add_tag(&mut v, "child", Some(&a));
    let leaf = add_tag(&mut v, "Leaf", Some(&child));
    let leaf_before =
        serde_json::to_value(v.catalog.tags.iter().find(|t| t.id == leaf).unwrap()).unwrap();
    let before = serde_json::to_value(&v.catalog).unwrap();
    for (id, name, parent) in [
        (None, "Child", Some(a.clone())),
        (Some(a.clone()), "A", Some(leaf.clone())),
        (Some(a.clone()), "A", Some(a.clone())),
        (Some(a.clone()), "A", Some(uuid::Uuid::new_v4().to_string())),
        (Some(child.clone()), "Child", Some(b.clone())),
    ] {
        assert!(
            v.edit_tag(TagEdit {
                id,
                name: name.into(),
                parent_id: parent,
                description: String::new()
            })
            .is_err()
        );
        assert_eq!(serde_json::to_value(&v.catalog).unwrap(), before);
    }
    let mut source = edit(&v);
    source.tag_ids = vec![leaf.clone()];
    v.edit_source(source).unwrap();
    let source_before = serde_json::to_value(&v.catalog.sources).unwrap();
    v.edit_tag(TagEdit {
        id: Some(child.clone()),
        name: "Moved".into(),
        parent_id: Some(b),
        description: String::new(),
    })
    .unwrap();
    assert_eq!(
        crate::tag_hierarchy::path(&v.catalog.tags, &leaf),
        "B → Moved → Leaf"
    );
    assert_eq!(
        serde_json::to_value(v.catalog.tags.iter().find(|t| t.id == leaf).unwrap()).unwrap(),
        leaf_before
    );
    assert_eq!(
        serde_json::to_value(&v.catalog.sources).unwrap(),
        source_before
    );
    assert!(v.catalog.tags.iter().any(|t| t.id == other));
}

#[test]
fn deleting_assigned_parent_detaches_only_direct_children_and_roundtrips() {
    let (dir, mut v) = setup();
    let parent = add_tag(&mut v, "Parent", None);
    let child = add_tag(&mut v, "Child", Some(&parent));
    let leaf = add_tag(&mut v, "Leaf", Some(&child));
    let note = create_note(&mut v);
    let mut source = edit(&v);
    source.tag_ids = vec![parent.clone(), child.clone(), leaf.clone()];
    v.edit_source(source).unwrap();
    fs::remove_file(dir.path().join("paper.pdf")).unwrap();
    refresh(&mut v, |_, _| {}).unwrap();
    let source_before = v.catalog.sources[0].clone();
    let child_before = v
        .catalog
        .tags
        .iter()
        .find(|t| t.id == child)
        .unwrap()
        .clone();
    let leaf_before =
        serde_json::to_value(v.catalog.tags.iter().find(|t| t.id == leaf).unwrap()).unwrap();
    let before = serde_json::to_value(&v.catalog).unwrap();
    let impact = v.preview_tag_deletion(&parent).unwrap();
    assert_eq!(impact.affected_sources, 1);
    assert_eq!(impact.detached_children, 1);
    assert_eq!(impact.path, "Parent");
    assert_eq!(serde_json::to_value(&v.catalog).unwrap(), before);
    std::thread::sleep(std::time::Duration::from_millis(5));
    v.delete_tag(&parent).unwrap();
    drop(v);
    let v = Vault::open(dir.path(), false).unwrap();
    let mut expected = vec![child.clone(), leaf.clone()];
    expected.sort();
    assert_eq!(v.catalog.sources[0].tag_ids, expected);
    assert_eq!(v.catalog.sources[0].created_at, source_before.created_at);
    assert_ne!(v.catalog.sources[0].modified_at, source_before.modified_at);
    let detached = v.catalog.tags.iter().find(|t| t.id == child).unwrap();
    assert!(detached.parent_id.is_none());
    assert_eq!(detached.created_at, child_before.created_at);
    assert_ne!(detached.modified_at, child_before.modified_at);
    assert_eq!(
        serde_json::to_value(v.catalog.tags.iter().find(|t| t.id == leaf).unwrap()).unwrap(),
        leaf_before
    );
    assert!(v.read_note(&note).unwrap().contains("Thoughts"));
}

#[test]
fn deletion_root_collision_is_atomic_and_parent_field_is_required() {
    let (dir, mut v) = setup();
    let parent = add_tag(&mut v, "Parent", None);
    add_tag(&mut v, "Same", None);
    add_tag(&mut v, "Same", Some(&parent));
    let before = fs::read(dir.path().join(".file_manager/tags.jsonl")).unwrap();
    assert!(v.preview_tag_deletion(&parent).is_err());
    assert!(v.delete_tag(&parent).is_err());
    assert_eq!(
        fs::read(dir.path().join(".file_manager/tags.jsonl")).unwrap(),
        before
    );
    let mut json = serde_json::to_value(&v.catalog.tags[0]).unwrap();
    json.as_object_mut().unwrap().remove("parent_id");
    assert!(serde_json::from_value::<Tag>(json).is_err());
}

#[test]
fn partial_tag_deletion_journal_recovers_both_registries() {
    let (dir, mut v) = setup();
    let parent = add_tag(&mut v, "Parent", None);
    add_tag(&mut v, "Child", Some(&parent));
    let mut source = edit(&v);
    source.tag_ids = vec![parent.clone()];
    v.edit_source(source).unwrap();
    let (next, _) = crate::tag_hierarchy::plan_deletion(&v.catalog, &parent).unwrap();
    let tags = next
        .tags
        .iter()
        .map(|t| serde_json::to_string(t).unwrap() + "\n")
        .collect::<String>();
    let sources = next
        .sources
        .iter()
        .map(|s| serde_json::to_string(s).unwrap() + "\n")
        .collect::<String>();
    let journal = serde_json::json!([{"path":"tags.jsonl","body":tags},{"path":"sources.jsonl","body":sources}]);
    fs::write(v.dir().join("pending.json"), journal.to_string()).unwrap();
    fs::write(v.dir().join("tags.jsonl"), tags).unwrap();
    drop(v);
    let v = Vault::open(dir.path(), false).unwrap();
    assert_eq!(
        serde_json::to_value(&v.catalog).unwrap(),
        serde_json::to_value(next).unwrap()
    );
    assert!(!v.dir().join("pending.json").exists());
    assert_eq!(original(dir.path()), b"original bytes");
}
