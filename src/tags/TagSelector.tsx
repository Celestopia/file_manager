import { TagTree } from "./TagTree";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icons";
import { useRecentTags } from "./tagHistory";
import type { Tag } from "../domain/types";

export function TagSelector({
  vault,
  tags,
  selected,
  disabled,
  onChange,
}: {
  vault: string;
  tags: Tag[];
  selected: string[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const recent = useRecentTags(vault);
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((v) => v !== id));
    else {
      onChange([...selected, id]);
    }
  };
  const matches = (tag: Tag) =>
    [tag.name, tag.description].some((value) =>
      value.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    );
  const recentTags = recent
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is Tag => !!t && matches(t));
  const options = (items: Tag[], group: string) => (
    <div role="group" aria-label={group}>
      {items.map((tag) => (
        <button
          key={tag.id}
          aria-pressed={selected.includes(tag.id)}
          disabled={disabled}
          onClick={() => toggle(tag.id)}
          title={tag.description}
        >
          <span>{tag.name}</span>
        </button>
      ))}
    </div>
  );
  return (
    <div
      className="tag-picker"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
        if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
          e.preventDefault();
          const items = Array.from(
            root.current!.querySelectorAll<HTMLElement>(
              ".tag-dropdown input, .tag-options button:not(:disabled), .tag-options input:not(:disabled)",
            ),
          );
          const index = items.indexOf(document.activeElement as HTMLElement);
          items[
            (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
              items.length
          ]?.focus();
        }
      }}
    >
      <div
        className="tag-selection"
        ref={trigger}
        role="button"
        aria-label="Select tags"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (
            e.target === e.currentTarget &&
            (e.key === "Enter" || e.key === " ")
          ) {
            e.preventDefault();
            if (!disabled) {
              setQuery("");
              setOpen((v) => !v);
            }
          }
        }}
        onClick={() => {
          if (!disabled) {
            setQuery("");
            setOpen((v) => !v);
          }
        }}
      >
        <Icon name="tag" />
        {selected.map((id) => {
          const tag = tags.find((t) => t.id === id);
          return (
            <span
              className="tag"
              key={id}
              title={tag?.description || undefined}
            >
              {tag?.name}
              <button
                aria-label={`Remove tag ${tag?.name}`}
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(selected.filter((v) => v !== id));
                }}
              >
                <Icon name="close" width="12" height="12" />
              </button>
            </span>
          );
        })}
        <span className="tag-select">Select tags</span>
      </div>
      {open && (
        <div className="tag-dropdown" role="dialog" aria-label="Select tags">
          <input
            ref={search}
            aria-label="Search tags"
            placeholder="Search tags"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="tag-options">
            {recentTags.length > 0 && (
              <>
                <h4>Recent</h4>
                {options(recentTags, "Recent tags")}
              </>
            )}
            <h4>All tags</h4>
            <TagTree
              tags={tags}
              query={query}
              selected={selected}
              disabled={disabled}
              onToggle={toggle}
            />
          </div>
        </div>
      )}
    </div>
  );
}
