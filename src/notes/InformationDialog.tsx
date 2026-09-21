import type { ReactNode } from "react";
import { Icon } from "../ui/Icons";
import { ModalShell } from "../ui/ModalShell";
export function InformationDialog({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <ModalShell
      label="Information"
      className="information-modal"
      shadeClass="information-shade"
      onDismiss={onClose}
    >
      <header>
        <h2>Information</h2>
        <button
          className="icon-button"
          aria-label="Close information"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      {children}
    </ModalShell>
  );
}
