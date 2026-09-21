import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const stack: HTMLElement[] = [];
const isolation = new WeakMap<
  HTMLElement,
  { count: number; previous: boolean }
>();
const focusable =
  'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]';

// Each modal is a body-level sibling. Nested confirmations isolate the previous modal too.
export function ModalShell({
  children,
  label,
  role = "dialog",
  className = "",
  shadeClass = "",
  onDismiss,
}: {
  children: ReactNode;
  label: string;
  role?: "dialog" | "alertdialog";
  className?: string;
  shadeClass?: string;
  onDismiss?: () => void;
}) {
  const shade = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = shade.current!;
    const previous = document.activeElement as HTMLElement | null;
    const isolated = Array.from(document.body.children).filter(
      (node): node is HTMLElement =>
        node instanceof HTMLElement && node !== element,
    );
    isolated.forEach((node) => {
      const entry = isolation.get(node) || { count: 0, previous: node.inert };
      entry.count++;
      isolation.set(node, entry);
      node.inert = true;
    });
    stack.push(element);
    const focus = () =>
      (
        panel.current?.querySelector<HTMLElement>(focusable) || panel.current
      )?.focus();
    const contain = (event: FocusEvent) => {
      if (stack.at(-1) === element && !element.contains(event.target as Node))
        focus();
    };
    document.addEventListener("focusin", contain);
    if (role === "alertdialog") {
      const buttons =
        panel.current?.querySelectorAll<HTMLButtonElement>("button");
      buttons?.[buttons.length - 1]?.focus();
    } else if (!element.contains(document.activeElement)) focus();
    return () => {
      document.removeEventListener("focusin", contain);
      stack.splice(stack.indexOf(element), 1);
      isolated.forEach((node) => {
        const entry = isolation.get(node)!;
        if (--entry.count === 0) {
          node.inert = entry.previous;
          isolation.delete(node);
        }
      });
      if (previous?.isConnected) previous.focus();
    };
  }, [role]);
  return createPortal(
    <div
      ref={shade}
      className={`modal-shade ${shadeClass}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onDismiss?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onDismiss?.();
        }
        if (e.key === "Tab") {
          const items = Array.from(
            panel.current!.querySelectorAll<HTMLElement>(focusable),
          );
          const first = items[0],
            last = items.at(-1);
          if (
            !first ||
            (e.shiftKey && document.activeElement === first) ||
            (!e.shiftKey && document.activeElement === last)
          ) {
            e.preventDefault();
            (e.shiftKey ? last : first)?.focus();
          }
        }
      }}
    >
      <section
        ref={panel}
        tabIndex={-1}
        className={`modal ${className}`}
        role={role}
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}
