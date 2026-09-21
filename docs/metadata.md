# Metadata and storage contract

[Architecture overview](../PROJECT.md) · [User guide](../README.md)

This document owns the canonical entity schema, identity fields, application timestamps, and derived file facts. See [persistence](persistence.md) for refresh matching and write guarantees.

## Canonical storage

```text
.file_manager/
  vault.json
  sources.jsonl
  notes.jsonl
  tags.jsonl
  notes/<note-uuid>.md
  write.lock
  pending.json                 # only during an incomplete transaction
  runtime/webview2/             # disposable webview data
```

`vault.json` contains `schema_version: 1` and a lowercase UUID v4 `id`. Source, note, and tag IDs are also lowercase UUID v4 values. Registries are UTF-8 JSONL, sorted by UUID on writes, with one homogeneous record per line and a trailing newline. Empty registries are valid. Unknown fields, malformed records, duplicate IDs/paths, unknown tag assignments, broken note ownership, invalid timestamps, and unsupported manifest versions are rejected. Errors from malformed JSONL identify the file and line.

### Source

`id`, vault-relative `path` with `/` separators, `title`, `description`, `source_url`, `tag_ids`, `created_at`, `modified_at`, and `observation`.

- Empty title falls back to filename without the final suffix.
- Description is plain text and defaults to empty.
- Source URL is empty or a complete absolute HTTP(S) URL with a host. Whitespace around an edited URL is trimmed; bare DOIs, missing schemes, whitespace within the URL, local paths, and custom schemes are rejected. No fetch is used to validate it.
- Tag IDs form a set. Tag names are not duplicated here.
- Observation contains `availability` (`present`, `missing`, `unavailable`), nullable `size_bytes`, nullable filesystem `file_modified_at`, and nullable `content_hash` encoded as `blake3:<64 hexadecimal characters>`.
- Observations reflect the latest scan, not live state. Missing/unavailable entries retain last-known facts.

### Note

`id`, `source_id`, `title`, `description`, `created_at`, `modified_at`. Exactly one owning source exists, including when that source is missing. Body path is derived as `notes/<id>.md`, with no duplicated path or body field in the record and no required YAML front matter.

New drafts pre-fill the smallest unused `Reading note N` title among that source's notes. The first successful save creates metadata and body together; discarding an unsaved note creates no record. Title edits do not rename the body. Clearing a title displays the UUID filename stem. Titles need not be unique. Notes have no independent tags, URL, or cross-source links.

The body editor has an 8 MiB UTF-8 limit and bounded reads. Missing bodies are errors, never silently replaced by empty content. External body editing is supported; external renaming, moving, and note import are not.

### Tag

`id`, `name`, `description`, `created_at`, `modified_at`. Names are trimmed, nonempty, case-sensitive, and unique per vault. `Research` and `research` are distinct. Tags are flat. Only unused tags can be deleted; source unassignment is explicit. The UI also blocks deletion while the active draft assigns that tag.

### Timestamp semantics

Application times are UTC RFC 3339 with millisecond precision, displayed locally. Creation initializes both timestamps. A successful meaningful application edit updates the edited entity's modification time; opening, refresh, no-op saves, and failed saves do not. These times are not conflict tokens or filesystem times.

- Source title/description/URL/tag assignments update the source time.
- Observations, external source moves/replacements, tag renames, and all note operations do not update source time.
- Note title/description/body application edits update note time.
- Reading externally edited Markdown does not update note time. No body signatures or external conflict checks are used.
- A metadata-only note save does not rewrite the body; a changed body draft writes the current editor text even if another editor changed the file since load.
- Tag name/description edits update tag time. Assigning a tag does not.

## Runtime file facts

`Snapshot` contains `root`, `catalog`, and `note_sizes`. The absolute root is not rendered on the main page. `note_sizes` is a runtime map from note UUID to observed body byte count or null, derived through safe filesystem metadata on every snapshot. It is never persisted in `notes.jsonl`. Zero means empty; null means unknown/unavailable. Unsaved drafts display Not saved. Editing a draft does not alter displayed saved-file size or observation timestamps.

Source size/path belong to source metadata/observation; note storage paths are derived from UUID and neither stored nor exposed as a separate metadata field. Display units are decimal B/KB/MB/GB/TB with exact-byte tooltips. Missing/unavailable sources retain last-known size facts.
