import type { Dispatch, SetStateAction } from "react";
import { Icon } from "../ui/Icons";
import { ResizeHandle } from "../ui/ResizeHandle";
import { TagSelector } from "../tags/TagSelector";
import {
  date,
  fileSize,
  stem,
  validUrl,
  type Tag,
  type Source,
  type SourceEdit,
} from "../domain/types";
export function SourceMetadataPanel({
  source,
  draft,
  busy,
  sourceDirty,
  editingFields,
  setEditingFields,
  setDraft,
  panelWidth,
  onResize,
  onClose,
  vault,
  tags,
  onOpenUrl,
  onAssignTags,
  onCreateTag,
  onManageTags,
  onReset,
  onApply,
}: {
  source: Source;
  draft: SourceEdit;
  busy: boolean;
  sourceDirty: boolean;
  editingFields: string[];
  setEditingFields: Dispatch<SetStateAction<string[]>>;
  setDraft: (value: SourceEdit) => void;
  panelWidth: number;
  onResize: (width: number) => void;
  onClose: () => void;
  vault: string;
  tags: Tag[];
  onOpenUrl: () => void;
  onAssignTags: (ids: string[]) => void;
  onCreateTag: () => void;
  onManageTags: () => void;
  onReset: () => void;
  onApply: () => void;
}) {
  return (
    <section
      className="notes-section metadata-panel"
      aria-label="Metadata panel"
      style={{ width: panelWidth }}
    >
      <ResizeHandle
        label="Resize metadata"
        width={panelWidth}
        onResize={onResize}
      />
      <div className="notes-bar">
        <div className="notes-panel-title">
          <span className="eyebrow">METADATA</span>
          <span className="spacer" />
          <button
            className="icon-button"
            aria-label="Close metadata"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
      </div>
      <div className="metadata-body">
        {(
          [
            ["title", "Title"],
            ["description", "Description"],
            ["source_url", "Source URL"],
          ] as const
        ).map(([key, label]) => (
          <div className="metadata-field" key={key}>
            <div className="metadata-label">
              <span>{label}</span>
              <button
                disabled={busy}
                className="icon-button"
                title={`Edit ${label}`}
                aria-label={`Edit ${label}`}
                aria-pressed={editingFields.includes(key)}
                onClick={() =>
                  setEditingFields((fields) =>
                    fields.includes(key)
                      ? fields.filter((field) => field !== key)
                      : [...fields, key],
                  )
                }
              >
                <Icon name="pencil" />
              </button>
            </div>
            {editingFields.includes(key) ? (
              key === "description" ? (
                <textarea
                  aria-label={label}
                  rows={3}
                  disabled={busy}
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value })
                  }
                />
              ) : (
                <input
                  aria-label={label}
                  placeholder={
                    key === "title" ? stem(source.path) : "https://…"
                  }
                  disabled={busy}
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value })
                  }
                />
              )
            ) : (
              <div className="metadata-value">
                {key === "source_url" &&
                draft[key] &&
                draft[key].trim() === source.source_url ? (
                  <a
                    href={draft[key]}
                    onClick={(e) => {
                      e.preventDefault();
                      if (!busy) onOpenUrl();
                    }}
                  >
                    {draft[key]}
                  </a>
                ) : (
                  draft[key] ||
                  (key === "title" ? stem(source.path) : "Not set")
                )}
              </div>
            )}
            {key === "source_url" && !validUrl(draft.source_url) && (
              <span className="invalid">Use a complete HTTP(S) link.</span>
            )}
          </div>
        ))}
        <div className="metadata-field">
          <div className="metadata-label">Tags</div>
          <div className="tag-controls">
            <TagSelector
              key={vault + source.id}
              vault={vault}
              tags={tags}
              selected={draft.tag_ids}
              disabled={busy}
              onChange={onAssignTags}
            />
            <button
              className="icon-button tag-action"
              aria-label="Create tag"
              title="Create tag"
              disabled={busy}
              onClick={onCreateTag}
            >
              <Icon name="plus" />
            </button>
            <button
              className="icon-button tag-action"
              aria-label="Edit tags"
              title="Manage tags"
              disabled={busy}
              onClick={onManageTags}
            >
              <Icon name="settings" />
            </button>
          </div>
        </div>
        <details className="file-information" key={source.id}>
          <summary>File information</summary>
          <div className="metadata-field">
            <div className="metadata-label">Relative path</div>
            <div className="metadata-value">{source.path}</div>
          </div>
          <div className="metadata-field">
            <div className="metadata-label">
              File size
              {source.observation.availability !== "present" &&
              source.observation.size_bytes != null
                ? " (last known)"
                : ""}
            </div>
            <div
              className="metadata-value"
              title={
                source.observation.size_bytes == null
                  ? undefined
                  : source.observation.size_bytes + " bytes"
              }
            >
              {fileSize(source.observation.size_bytes)}
            </div>
          </div>
          <div className="metadata-field">
            <div className="metadata-label">Created</div>
            <div className="metadata-value">{date(source.created_at)}</div>
          </div>
          <div className="metadata-field">
            <div className="metadata-label">Modified</div>
            <div className="metadata-value">{date(source.modified_at)}</div>
          </div>
        </details>
        <div className="form-footer">
          <span className="spacer" />
          <button disabled={busy || !sourceDirty} onClick={onReset}>
            Reset
          </button>
          <button
            className="primary"
            disabled={busy || !sourceDirty || !validUrl(draft.source_url)}
            onClick={onApply}
          >
            Apply
          </button>
        </div>
      </div>
    </section>
  );
}
