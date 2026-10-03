import { useEffect, useRef, useState } from "react";
import type { Tag } from "../domain/types";
import { descendantIds } from "./hierarchy";
import { TagTree } from "./TagTree";
export function TagParentPicker({
  tags,
  id,
  value,
  disabled,
  onChange,
}: {
  tags: Tag[];
  id: string | null;
  value: string | null;
  disabled: boolean;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    search = useRef<HTMLInputElement>(null);
  const excluded = id
    ? new Set([id, ...descendantIds(tags, id)])
    : new Set<string>();
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const select = (id: string | null) => {
    onChange(id);
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div
      className="tag-parent-picker"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (open && e.key === "Escape") {
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <span>Parent</span>
      <button
        ref={trigger}
        type="button"
        aria-label="Parent tag"
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => {
          setQuery("");
          setOpen(!open);
        }}
      >
        {value ? tags.find((tag) => tag.id === value)?.name : "No parent"}
      </button>
      {open && (
        <div
          className="tag-parent-menu"
          role="dialog"
          aria-label="Choose parent tag"
        >
          <input
            ref={search}
            aria-label="Search parent tags"
            placeholder="Search tags"
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => select(null)}
          >
            No parent
          </button>
          <TagTree
            tags={tags.filter((tag) => !excluded.has(tag.id))}
            query={query}
            selected={value ? [value] : []}
            disabled={disabled}
            onSelect={select}
          />
        </div>
      )}
    </div>
  );
}
