import { Icon } from "../ui/Icons";
import { filename, title, type Source } from "../domain/types";

export function SourceHeader({
  source,
  busy,
  notesOpen,
  details,
  noteDirty,
  sourceDirty,
  onOpenSource,
  onNotes,
  onDetails,
}: {
  source: Source;
  busy: boolean;
  notesOpen: boolean;
  details: boolean;
  noteDirty: boolean;
  sourceDirty: boolean;
  onOpenSource: () => void;
  onNotes: () => void;
  onDetails: () => void;
}) {
  return (
    <header className="source-header">
      <div>
        <h1>{title(source)}</h1>
        <p>{filename(source.path)}</p>
      </div>
      <div className="header-actions">
        <button
          className="icon-button"
          aria-label="Open file"
          title="Open file in default application"
          disabled={busy || source.observation.availability === "missing"}
          onClick={onOpenSource}
        >
          <Icon name="open" />
        </button>
        <button
          className={`icon-button ${notesOpen ? "active" : ""}`}
          aria-label="Notes"
          title="Notes"
          aria-expanded={notesOpen}
          disabled={busy}
          onClick={onNotes}
        >
          <Icon name="notes" />
          {noteDirty && <span className="icon-dot" />}
        </button>
        <button
          className={`icon-button ${details ? "active" : ""}`}
          aria-label="Details"
          title="Details"
          aria-expanded={details}
          disabled={busy}
          onClick={onDetails}
        >
          <Icon name="details" />
          {sourceDirty && <span className="icon-dot" />}
        </button>
      </div>
    </header>
  );
}
