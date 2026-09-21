# Frontend architecture and state

[Architecture overview](../PROJECT.md) · [User guide](../README.md)

This document owns frontend module boundaries, IPC integration, drafts, and guarded transitions. Presentation details live in [interface](interface.md); storage behavior lives in [persistence](persistence.md).

## Module ownership

The frontend uses shallow responsibility-based folders. `src/boot.tsx` mounts `app/App.tsx`; `app/` owns workspace orchestration, drafts, and layout rules; `domain/` contains shared models and helpers; `native/` contains IPC and native lifecycle integration. `sources/`, `notes/`, and `tags/` own feature presentation; `viewers/` owns document previews and preview zoom; `ui/` contains shared controls and dialogs. Assets remain in `assets/`, and the shared stylesheet is `styles/app.css`. Tests live beside their modules. App orchestration composes features, which depend on domain, native, and shared UI modules; shared modules do not import the app coordinator. Rust modules remain in `src-tauri/src/`.

| Module                                                                                | Responsibility                                                                                            |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/app/App.tsx`                                                                     | Workspace selection, entity drafts, independent saves, guarded transitions, and persistence callbacks.    |
| `SourceList`, `SourceHeader`, `SourceMetadataPanel`, `NotesPanel`, `TagManagerDialog` | Presentation and UI callbacks; no independent persistence or global navigation ownership.                 |
| `drafts.ts`                                                                           | Entity-specific meaningful equality; source tag sets/trimmed URLs, exact note content, trimmed tag names. |
| `useNativeLifecycle.ts`                                                               | Committed callback bindings, startup lifecycle, native subscriptions and symmetric disposal.              |
| `ModalShell`, `InformationDialog`                                                     | Shared dialog isolation, keyboard focus, dismissal policies, and note-information presentation.           |
| `ResizeHandle`, `layout.ts`                                                           | Shared pointer/keyboard resizing and pure layout limits.                                                  |
| `TagSelector`, `tagHistory.ts`                                                        | Searchable multiselect UI and optional per-vault recent-selection history.                                |
| `MarkdownPreview`, `TextSourceViewer`, `PdfViewer`, `usePreviewZoom`                  | One sanitized Markdown policy, bounded read-only text loading, and PDF.js ranged canvas rendering.        |
| `WindowControls`, `SettingsMenu`, `Notifications`, `Icons`                            | Native window controls, vault operations menu, timed feedback, accessible SVG actions.                    |
| `types.ts`, `ipc.ts`                                                                  | Frontend entity types/helpers and command names, arguments, and return types.                             |

## IPC boundary

[`src/native/ipc.ts`](../src/native/ipc.ts) enumerates command names, arguments, and results using the shared models in [`src/domain/types.ts`](../src/domain/types.ts). React consumes UUID-identified snapshots; native commands own persisted mutations. [Contract verification](development.md#checks-and-contract-verification) compares frontend shapes with actual Rust serialization.

## Workspace and draft lifecycle

One `activePanel` value selects Notes, Metadata, or neither. Opening/closing same-source panels preserves both drafts and source pencil modes. Auto-opening the first saved note does not reset source metadata. A navigation that replaces drafts (source/note selection, New note, Refresh, folder switching, close) obtains a single Save/Discard/Stay decision before changing state. Explicit note selection/creation retains the established all-drafts guard. Apply/Reset and actual selection replacement reset source pencil modes. New notes are explicit `id: null` drafts; saved notes have a base value. A note body is compared exactly, with no whitespace normalization.

Source equality ignores assignment order and URL-edge whitespace, matching backend save normalization. Tag-definition equality trims the name but preserves description exactly. Source Apply and note Save remain independent backend transactions. A combined Save changes decision saves source then note; a partial failure keeps the window/drafts so the remaining save can be retried. Reads refresh observations; no latest-request cancellation is used for writes that might already have committed.

A synchronous transition latch covers guard plus navigation; a separate operation latch prevents overlapping persistence. A pending confirmation cannot replace another resolver. Native callbacks read the latest committed handlers. Startup reads are ignored after cleanup, and late-resolving listener registrations immediately unsubscribe, including React lifecycle replay. Long-running writes are not cancelled on a newer request.

All modal dialogs share a body-level portal shell. Background content and underlying dialogs are inert, keyboard focus is contained in the top modal, and focus returns when it closes. Information permits Escape/backdrop dismissal and retains draft changes. Tag management and destructive/unsaved confirmations require their explicit choices. Native close first prevents Tauri's default close, applies the guard, then calls permitted `Window.destroy`; requesting close again would recurse. Failed saves or destruction errors leave it retryable.
