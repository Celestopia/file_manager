import { useState } from "react";
import { ModalShell } from "../ui/ModalShell";
import { Icon } from "../ui/Icons";
import { hierarchyRows } from "./hierarchy";
import type { Tag, Source } from "../domain/types";
export function TagManagerDialog({
  busy,
  tags,
  sources,
  closeTags,
  editTagChoice,
  deleteTag,
}: {
  busy: boolean;
  tags: Tag[];
  sources: Source[];
  closeTags: () => void;
  editTagChoice: (tag?: Tag) => void;
  deleteTag: (tag: Tag) => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(
    () => new Set(tags.filter((tag) => !tag.parent_id).map((tag) => tag.id)),
  );
  const search = !!query.trim();
  const rows = hierarchyRows(tags, query, expanded);
  const counts = new Map<string, number>();
  for (const source of sources)
    for (const id of source.tag_ids) counts.set(id, (counts.get(id) || 0) + 1);
  return (
    <ModalShell
      className="tag-manager-dialog"
      label="Manage Tags"
      onDismiss={busy ? undefined : closeTags}
    >
      <header>
        <h2>Manage Tags</h2>
        <div className="tag-manager-header-actions">
          <button
            className="icon-button"
            aria-label="Create tag"
            title="Create tag"
            disabled={busy}
            onClick={() => editTagChoice()}
          >
            <Icon name="plus" />
          </button>
          <button
            className="icon-button"
            aria-label="Close tag manager"
            title="Close"
            disabled={busy}
            onClick={closeTags}
          >
            <Icon name="close" />
          </button>
        </div>
      </header>
      <input
        aria-label="Search managed tags"
        placeholder="Search tags or descriptions"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="tag-manager-fold-actions">
        <button
          disabled={busy || search || !tags.length}
          onClick={() => setExpanded(new Set(tags.map((tag) => tag.id)))}
        >
          Expand all
        </button>
        <button
          disabled={busy || search || !tags.length}
          onClick={() => setExpanded(new Set())}
        >
          Collapse all
        </button>
      </div>
      <div className="tag-manager-list">
        {rows.map(({ tag, depth, hasChildren }) => (
          <article
            className="tag-manager-item"
            key={tag.id}
            data-tag-id={tag.id}
            style={{ marginLeft: depth * 18 }}
          >
            {hasChildren ? (
              <button
                className="tag-manager-toggle"
                aria-label={`${expanded.has(tag.id) || search ? "Collapse" : "Expand"} ${tag.name}`}
                aria-expanded={search || expanded.has(tag.id)}
                disabled={busy || search}
                onClick={() =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(tag.id)) next.delete(tag.id);
                    else next.add(tag.id);
                    return next;
                  })
                }
              >
                <Icon name="chevron" />
              </button>
            ) : (
              <span className="tag-manager-toggle" aria-hidden="true" />
            )}
            <div className="tag-manager-item-main">
              <div className="tag-manager-item-heading">
                <strong>{tag.name}</strong>
                <span title="Direct assignments only">
                  {counts.get(tag.id) || 0} source files
                </span>
              </div>
              {tag.description && (
                <p className="tag-description">{tag.description}</p>
              )}
            </div>
            <div className="tag-manager-actions">
              <button
                disabled={busy}
                aria-label={`Edit tag ${tag.name}`}
                onClick={() => editTagChoice(tag)}
              >
                Edit
              </button>
              <button
                className="danger"
                disabled={busy}
                aria-label={`Delete tag ${tag.name} globally`}
                onClick={() => deleteTag(tag)}
              >
                Delete Globally
              </button>
            </div>
          </article>
        ))}
        {!rows.length && (
          <p className="muted">
            {tags.length ? "No matching tags" : "No tags yet"}
          </p>
        )}
      </div>
    </ModalShell>
  );
}
