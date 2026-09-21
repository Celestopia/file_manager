import { Icon } from "../ui/Icons";
import { MarkdownPreview } from "../viewers/MarkdownPreview";
import { ResizeHandle } from "../ui/ResizeHandle";
import { type Note, type NoteDraft } from "../domain/types";
export function NotesPanel({
  note,
  sourceNotes,
  busy,
  noteDirty,
  bodyError,
  preview,
  setPreview,
  setNote,
  panelWidth,
  onResize,
  onClose,
  onSelectNote,
  onNewNote,
  onRemoveNote,
  onInformation,
  onSaveNote,
}: {
  note: NoteDraft | null;
  sourceNotes: Note[];
  busy: boolean;
  noteDirty: boolean;
  bodyError: string;
  preview: boolean;
  setPreview: (value: boolean) => void;
  setNote: (value: NoteDraft) => void;
  panelWidth: number;
  onResize: (width: number) => void;
  onClose: () => void;
  onSelectNote: (id: string) => void;
  onNewNote: () => void;
  onRemoveNote: () => void;
  onInformation: () => void;
  onSaveNote: () => void;
}) {
  return (
    <section
      className="notes-section"
      aria-label="Notes panel"
      style={{ width: panelWidth }}
    >
      <ResizeHandle
        label="Resize notes"
        width={panelWidth}
        onResize={onResize}
      />
      <div className="notes-bar">
        <div className="notes-panel-title">
          <span className="eyebrow">NOTES</span>
          <span className="count">{sourceNotes.length}</span>
          {noteDirty && <span className="dirty-dot">•</span>}
          <span className="spacer" />
          <button
            className="icon-button"
            aria-label="Close notes"
            title="Close notes (keeps your draft)"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <select
          aria-label="Choose note"
          disabled={busy}
          value={note?.id || ""}
          onChange={(e) => onSelectNote(e.target.value)}
        >
          <option value="" disabled>
            {note && !note.id ? "New note (unsaved)" : "Select a note"}
          </option>
          {sourceNotes.map((n) => (
            <option value={n.id} key={n.id}>
              {n.title || n.id}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <button
          className="icon-button"
          aria-label="New note"
          title="New note"
          disabled={busy}
          onClick={onNewNote}
        >
          <Icon name="plus" />
        </button>
      </div>
      {note ? (
        <div className="note-editor">
          <div className="note-heading">
            <input
              aria-label="Note title"
              value={note.title}
              placeholder={note.id || "Note title"}
              disabled={busy}
              onChange={(e) => setNote({ ...note, title: e.target.value })}
            />
            <button
              className="danger delete-note icon-button"
              aria-label={note.id ? "Delete note" : "Discard draft"}
              title={note.id ? "Delete note" : "Discard draft"}
              disabled={busy}
              onClick={onRemoveNote}
            >
              <Icon name="trash" />
            </button>
          </div>
          <div className="note-mode">
            <button
              className={preview ? "active" : ""}
              onClick={() => setPreview(true)}
            >
              Preview
            </button>
            <button
              className={!preview ? "active" : ""}
              onClick={() => setPreview(false)}
            >
              Edit
            </button>
            <button
              className="icon-button"
              aria-label="Information"
              title="Information"
              onClick={onInformation}
            >
              <Icon name="details" />
            </button>
            <span className="spacer" />
            {noteDirty && <small>Unsaved</small>}
            <button
              className="primary"
              disabled={busy || !noteDirty || !!bodyError}
              onClick={onSaveNote}
            >
              Save note
            </button>
          </div>
          {bodyError ? (
            <div className="empty-content">
              Note content is unavailable. Reopen the note to retry.
            </div>
          ) : preview ? (
            <MarkdownPreview body={note.body} />
          ) : (
            <textarea
              className="markdown-input"
              aria-label="Markdown note body"
              placeholder="Write what matters to you…"
              value={note.body}
              disabled={busy}
              onChange={(e) => setNote({ ...note, body: e.target.value })}
            />
          )}
        </div>
      ) : (
        <div className="notes-empty">
          {sourceNotes.length
            ? "Choose a note above to read or edit it."
            : "Build on this source. Create your first reading note."}
        </div>
      )}
    </section>
  );
}
