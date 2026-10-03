import { ModalShell } from "../ui/ModalShell";
import { Icon } from "../ui/Icons";
import { TagFields } from "./TagFields";
import type { Tag, TagEdit } from "../domain/types";
export function TagEditorDialog({
  draft,
  tags,
  busy,
  setDraft,
  addToSource,
  dirty,
  onClose,
  onSave,
}: {
  draft: TagEdit;
  tags: Tag[];
  busy: boolean;
  setDraft: (draft: TagEdit) => void;
  addToSource: boolean;
  dirty: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const editing = !!draft.id;
  const title = editing ? "Edit Tag" : "Create Tag";
  const canSave = !busy && !!draft.name.trim() && (!editing || dirty);
  return (
    <ModalShell
      className="tag-editor-dialog"
      label={title}
      onDismiss={busy ? undefined : onClose}
    >
      <header>
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label={editing ? "Close tag editor" : "Close creation"}
          title="Close"
          disabled={busy}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <form
        className="tag-definition-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) onSave();
        }}
      >
        <TagFields draft={draft} tags={tags} busy={busy} onChange={setDraft} />
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!canSave}>
            {editing ? "Save" : addToSource ? "Create and Add" : "Create"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
