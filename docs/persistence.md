# Persistence, refresh, and native lifecycle

[Architecture overview](../PROJECT.md) · [User guide](../README.md)

This document owns vault opening, source reconciliation, concurrency, and recovery. Entity fields are defined in the [metadata contract](metadata.md).

## Native module ownership

| Module                                 | Responsibility                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/model.rs`               | Serde models, availability enum, edits, snapshots, IDs, timestamps.                                      |
| `paths.rs`                             | Storage-directory constant, canonical relative paths and Windows identity policy.                        |
| `vault.rs`                             | Validation, safe filesystem resolution, lock, registries, journal execution, source/note/tag operations. |
| `scanner.rs`                           | Recursive full hashing, conservative reconciliation, progress and summaries.                             |
| `main.rs`                              | Thin Tauri commands, worker scheduling, startup and WebView construction.                                |
| `startup.rs`, `handoff.rs`, `smoke.rs` | Parsed startup options, replacement readiness, and runtime-gated exact-artifact verification.            |

## Vault opening and switching

A native folder chooser runs before creating a webview. New vaults require confirmation and initial full discovery; existing vaults do not scan automatically. Each process owns one vault and one profile. Independent vaults can run concurrently. Open folder validates in a replacement process and keeps the original window until `renderer_ready` acknowledges successful startup. A token-authenticated loopback readiness connection carries success or an error, uses bounded reads/timeouts, and writes no extra files. Cancellation, startup failure, or timeout preserves the original window; a timeout does not forcibly kill a replacement that may still be starting. Normal app content has no network access. Startup flags are parsed once.

## Execution boundary

React receives snapshots identified by UUID; Rust owns every mutation. No general filesystem plugin, global state framework, generic repository layer, or generated API framework is used. All potentially blocking vault commands run through `spawn_blocking`, retaining one mutex and one serialized consistency boundary. PDF reads can wait behind a refresh; they do not block native window-control dispatch while waiting. Lock splitting is deliberately deferred.

## Manual refresh and identity

Every manual refresh reads and fully hashes each accessible regular source using a heap buffer. No size/time hash reuse is implemented. Files that change size or filesystem modification time during hashing are reported unavailable. Source hard links are read as independent paths; the application does not write through them.

The root `.file_manager` is excluded. Reparse points are skipped and never deliberately followed for file access. Nested vaults abort refresh without applying changes. Inaccessible scopes are recorded so an access failure does not imply confirmed deletion.

Reconciliation order:

1. Existing relative paths (case-insensitive for Windows) retain IDs and authored metadata even when contents change.
2. Among unmatched paths, a unique one-to-one full-hash match to a confirmed missing record retains its ID and knowledge. Move matching is conservatively disabled during an incomplete scan.
3. Copies whose originals remain receive independent IDs and empty authored fields.
4. A simultaneous move and edit becomes a new source and a missing old record. Old notes stay attached to the missing record. There is no reconnect or merge feature.
5. Ambiguous matches create independent new records and leave old records missing; the refresh summary reports the ambiguity without transferring knowledge.
6. Unreadable old scopes remain unavailable. Potential matches to known missing records can be deferred until a complete scan.

No refresh removes a source record or note. No source-record deletion UI is included. A restored old path retains its earlier identity under the same-path rule. These rules intentionally favor preserved knowledge over guessing.

## Writes, concurrency, and recovery

Windows holds `write.lock` open with sharing disabled for the vault lifetime. This excludes another writer and is automatically released by the OS on exit or crash; the empty lock file may remain. There is no stale-lock workflow.

Before a canonical mutation, the backend compares a signature of the manifest and three registries with the last loaded/committed state. This prevents silently overwriting externally edited JSONL. It intentionally does not cover note bodies, per the agreed no-conflict-check behavior.

Mutations work on a cloned candidate catalog and validate it before touching canonical files. A redo journal `pending.json` stores complete replacement registry text and an optional note-body replacement or deletion. Only fixed metadata filenames and UUID note-body paths are permitted journal targets. Lexical paths use canonical nonempty slash-separated components: absolute paths, backslashes, colons, NUL, dot/dot-dot components, and repeated/trailing separators are rejected. `paths.rs` shares validation and lowercase identity keys across scanning and catalog uniqueness. Filesystem reparse checks remain separate. Incomplete-scan scopes use that same case-insensitive identity policy.

Journal and replacements are written to temporary files beside their targets, flushed, and atomically replaced using Windows `MoveFileExW` with replacement/write-through flags. After all operations succeed, the journal is removed and the in-memory catalog/signature are updated. A pending operation is replayed idempotently on next open before loading registries. A write failure leaves the draft in the GUI and directs the user to reopen for recovery when necessary. Further commits are refused while a journal is pending. Temporary `.write-*` remnants can exist after a crash; they are not canonical.

This is recovery after a partial multi-file operation, not an instantaneous atomic filesystem transaction. Once a journal has been persisted, reopening completes the intended operation, including a previously confirmed deletion. Backups must therefore be taken while the application is closed. The design does not claim resistance to malicious concurrent filesystem replacement or hardware failure that ignores durability requests.

Note deletion is permanent after confirmation naming the note, including any unsaved draft. It removes only that note's registry entry and body. The same journal ensures consistent completion. Deletion of an already missing body removes the record. There is no trash, restore, or metadata history.
