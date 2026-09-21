import { ModalShell } from "../ui/ModalShell";
import { type Source, type Tag, type TagEdit } from "../domain/types";
export function TagManagerDialog({
  tagEdit,
  setTagEdit,
  tagDirty,
  busy,
  tags,
  sources,
  selectedTags,
  closeTags,
  editTagChoice,
  deleteTag,
  saveTag,
  onAssignTags,
}: {
  tagEdit: TagEdit | null;
  setTagEdit: (value: TagEdit) => void;
  tagDirty: boolean;
  busy: boolean;
  tags: Tag[];
  sources: Source[];
  selectedTags: string[];
  closeTags: () => Promise<void>;
  editTagChoice: (tag?: Tag) => Promise<void>;
  deleteTag: () => Promise<void>;
  saveTag: () => Promise<void>;
  onAssignTags: (ids: string[]) => void;
}) {
  return (
    <ModalShell
      className={`tags-modal ${tagEdit && !tagEdit.id ? "tag-create-modal" : ""}`}
      label={tagEdit && !tagEdit.id ? "Create tag" : "Tags"}
    >
      <header>
        <h2>{tagEdit && !tagEdit.id ? "Create tag" : "Tags"}</h2>
        <button disabled={busy} onClick={() => void closeTags()}>
          Done
        </button>
      </header>
      {(!tagEdit || tagEdit.id) && (
        <p className="muted">
          Assignments are saved with source metadata using Apply.
        </p>
      )}
      <div className="tag-manager">
        {(!tagEdit || tagEdit.id) && (
          <div>
            {[...tags]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((t) => (
                <div className="tag-choice" key={t.id}>
                  <label>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={selectedTags.includes(t.id)}
                      onChange={(e) =>
                        onAssignTags(
                          e.target.checked
                            ? [...selectedTags, t.id]
                            : selectedTags.filter((id) => id !== t.id),
                        )
                      }
                    />
                    <span title={t.description}>{t.name}</span>
                  </label>
                  <button disabled={busy} onClick={() => void editTagChoice(t)}>
                    Edit
                  </button>
                </div>
              ))}
            <button disabled={busy} onClick={() => void editTagChoice()}>
              + Create tag
            </button>
          </div>
        )}
        {tagEdit && (
          <div className="tag-form">
            <label>
              Name
              <input
                value={tagEdit.name}
                disabled={busy}
                onChange={(e) =>
                  setTagEdit({ ...tagEdit, name: e.target.value })
                }
              />
            </label>
            <label>
              Description
              <textarea
                value={tagEdit.description}
                disabled={busy}
                onChange={(e) =>
                  setTagEdit({ ...tagEdit, description: e.target.value })
                }
              />
            </label>
            <small>Names are case-sensitive.</small>
            <div className="form-footer">
              {tagEdit.id && (
                <button
                  className="danger"
                  disabled={
                    busy ||
                    sources.some((s) => s.tag_ids.includes(tagEdit.id!)) ||
                    selectedTags.includes(tagEdit.id)
                  }
                  title="Only unused tags can be deleted"
                  onClick={() => void deleteTag()}
                >
                  Delete
                </button>
              )}
              <button
                className="primary"
                disabled={
                  busy || !tagEdit.name.trim() || (!tagDirty && !!tagEdit.id)
                }
                onClick={() => void saveTag()}
              >
                Apply tag
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
