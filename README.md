# File Manager

A small, offline Windows desktop application for reading existing source documents and keeping metadata and Markdown reading notes alongside them.

## Run

Open `dist/File Manager/File Manager.exe` and choose a resource folder. Confirm **Create vault** for a new folder; initial discovery reads and hashes its files. Existing vaults open without an automatic scan. This portable, unsigned build requires Microsoft Edge WebView2 Runtime and has no installer.

## Use

- **Source Files** lists originals in the left panel. PDF, Markdown (`.md`, `.markdown`), and UTF-8 TXT files have read-only previews. PDF pages scroll continuously and embedded text can be selected and copied (image-only scans need OCR, which is not included). The external-arrow icon opens a source in its default application.
- **Details** (circled exclamation mark) opens source metadata on the right. Pencil icons toggle editing; **Apply** saves the title, description, complete HTTP(S) URL, and case-sensitive flat tags. File path, size, and timestamps are under collapsed **File information**.
- **Notes** opens the right reading-note panel. Choose a saved note to preview it, or **+** to create a note. **Save note** saves its title, description, and Markdown body. The **Information** icon opens description, timestamps, and saved-file size. The red bin permanently deletes only that note after confirmation.
- Click the tag box to search all tags or choose from three recent selections. Assignments remain drafts until **Apply**. The adjacent plus and gear create and manage tag definitions.
- Use **Ctrl + scroll** over a PDF, Markdown, or TXT preview to zoom its content. PDF zoom supports 25–400%; text previews support 50–250% with a reset control. Zoom resets when opening another source. New windows start maximized; Restore returns to the normal window size.
- Drag panel dividers to resize them. The source list can grow to half the window width, subject to space needed by the document and any open right panel. Drag the source divider near the left edge to collapse the list; the chevron restores it. Drag a right divider near the right edge to close that panel; its toolbar button reopens it. Closing or switching between right panels preserves drafts.
- The bottom-left gear opens **Settings → Open folder / Refresh**. Refresh hashes every source file. Unambiguous unchanged-content moves retain knowledge; moving and editing together creates a new source and leaves the old record **Missing**, with notes intact.
- Drag the centered header to move the window. Custom buttons minimize, maximize/restore, and close it. Notifications float at the top and disappear after five seconds.

Navigation that replaces drafts offers **Save changes / Discard / Stay**. Source metadata and notes save independently. Switching folders keeps the current window until the replacement renderer is ready.

## Your data

Original files are read-only to File Manager. Metadata, UUID-named note Markdown files, recovery data, and the WebView profile live inside `.file_manager`. Back up or move the entire resource folder with the application closed. Different vaults can be opened in separate processes; only one writer can open a particular vault.

External editors may change existing note bodies. Such changes do not update application timestamps. There are no external-Markdown conflict checks: saving an edited body can overwrite external edits made since loading it. Do not edit JSONL registries while the vault is open. The persistent `write.lock` filename does not mean a stale lock; Windows releases the actual lock when the process exits.

Text previews and note bodies accept UTF-8 up to 8 MiB. Markdown HTML, images, and navigation are disabled. Other formats remain available through their default applications. Search/filtering of sources, reconnect, automatic watching, source editing, cloud sync, trash, and history are outside this version.

## Develop, check, and build

Use Windows 11, Node.js 22.12 or newer, npm, Rust stable with the MSVC target, Visual Studio C++ build tools/Windows SDK, and WebView2. Keep both lockfiles.

```powershell
npm ci
npm run desktop:dev
```

```powershell
npm run check
./scripts/build-portable.ps1
./scripts/smoke-portable.ps1
node scripts/inspect-native.mjs "dist/File Manager/File Manager.exe" clean
```

See [Development and verification](docs/development.md) for prerequisites, check coverage, example-vault generation, packaging, and native verification. If the existing executable is running, close it before rebuilding; the packaging script preserves the previous package on failure.

See [PROJECT.md](PROJECT.md) for the architecture overview and detailed technical contracts.
