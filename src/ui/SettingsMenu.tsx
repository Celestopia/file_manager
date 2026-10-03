import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
export function SettingsMenu({
  busy,
  hasVault,
  onOpen,
  onRefresh,
  onManageTags,
}: {
  busy: boolean;
  hasVault: boolean;
  onOpen: () => void;
  onRefresh: () => void;
  onManageTags: () => void;
}) {
  const [open, setOpen] = useState(false),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
      ?.focus();
    function outside(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const items = Array.from(
          root.current?.querySelectorAll<HTMLButtonElement>(
            '[role="menuitem"]:not(:disabled)',
          ) || [],
        );
        if (!items.length) return;
        const index = items.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
                items.length;
        items[next].focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  function action(fn: () => void) {
    setOpen(false);
    trigger.current?.focus();
    fn();
  }
  return (
    <div
      className="settings-entry"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className="icon-button"
        aria-label="Settings"
        title="Settings"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="settings-menu"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="settings" />
      </button>
      {open && (
        <div
          id="settings-menu"
          className="settings-menu"
          style={{
            left: Math.max(
              12,
              (trigger.current?.getBoundingClientRect().right || 236) - 224,
            ),
            bottom:
              window.innerHeight -
              (trigger.current?.getBoundingClientRect().top || 0) +
              8,
          }}
          role="menu"
          aria-label="Settings"
        >
          <span className="eyebrow menu-heading">VAULT OPERATIONS</span>
          <button
            role="menuitem"
            disabled={busy}
            onClick={() => action(onOpen)}
          >
            <Icon name="folder" />
            Open folder
          </button>
          <button
            role="menuitem"
            disabled={busy || !hasVault}
            onClick={() => action(onRefresh)}
          >
            <Icon name="refresh" />
            {busy ? "Working…" : "Refresh"}
          </button>
          <button
            role="menuitem"
            disabled={busy || !hasVault}
            onClick={() => action(onManageTags)}
          >
            <Icon name="tag" />
            Manage Tags
          </button>
        </div>
      )}
    </div>
  );
}
