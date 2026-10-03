import { useState } from "react";
import type { Tag } from "../domain/types";
import { hierarchyRows } from "./hierarchy";
export function TagTree({
  tags,
  query,
  selected = [],
  disabled,
  onToggle,
  onSelect,
}: {
  tags: Tag[];
  query: string;
  selected?: string[];
  disabled: boolean;
  onToggle?: (id: string) => void;
  onSelect?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rows = hierarchyRows(tags, query, expanded);
  return (
    <div role="group" aria-label="All tags" className="tag-tree">
      {rows.map(({ tag, depth, hasChildren }) => (
        <div
          className={`tag-choice tag-tree-row ${selected.includes(tag.id) ? "is-selected" : ""}`}
          key={tag.id}
          style={{ paddingLeft: 4 + depth * 16 }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="tag-expander"
              aria-label={`Expand ${tag.name}`}
              aria-expanded={!!query.trim() || expanded.has(tag.id)}
              disabled={disabled || !!query.trim()}
              onClick={() =>
                setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(tag.id)) next.delete(tag.id);
                  else next.add(tag.id);
                  return next;
                })
              }
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                aria-hidden="true"
                style={{
                  transform:
                    query.trim() || expanded.has(tag.id)
                      ? "rotate(90deg)"
                      : undefined,
                }}
              >
                <path
                  d="m9 5 7 7-7 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </button>
          ) : (
            <span className="tag-expander" />
          )}
          <button
            type="button"
            className="tag-tree-label"
            disabled={disabled}
            title={tag.description || undefined}
            aria-pressed={selected.includes(tag.id)}
            onClick={() => (onSelect ? onSelect(tag.id) : onToggle?.(tag.id))}
          >
            {tag.name}
          </button>
        </div>
      ))}
      {!rows.length && (
        <p>{tags.length ? "No matching tags" : "No tags yet"}</p>
      )}
    </div>
  );
}
