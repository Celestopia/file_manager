import { SettingsMenu } from "../ui/SettingsMenu";
import { extension, title, type Source } from "../domain/types";
export function SourceList({
  ordered,
  selected,
  busy,
  visibleSourceWidth,
  sourceWidth,
  hasVault,
  onSelect,
  onOpen,
  onRefresh,
  onManageTags,
}: {
  ordered: Source[];
  selected: string;
  busy: boolean;
  visibleSourceWidth: number;
  sourceWidth: number;
  hasVault: boolean;
  onSelect: (id: string) => void;
  onOpen: () => void;
  onRefresh: () => void;
  onManageTags: () => void;
}) {
  return (
    <aside
      className="source-list"
      style={{
        width: visibleSourceWidth,
        display: sourceWidth === 0 ? "none" : undefined,
      }}
    >
      <div className="list-heading">
        <span className="eyebrow">SOURCE FILES</span>
        <span className="count">{ordered.length}</span>
      </div>
      <div className="list-scroll">
        {ordered.map((s) => (
          <button
            className={`source-row ${s.id === selected ? "selected" : ""}`}
            key={s.id}
            onClick={() => onSelect(s.id)}
            disabled={busy}
          >
            <span className="file-icon">
              {(extension(s.path) || "FILE").slice(0, 4).toUpperCase()}
            </span>
            <span className="source-label">
              <strong>{title(s)}</strong>
              {s.observation.availability !== "present" && (
                <em>
                  {s.observation.availability === "missing"
                    ? "Missing"
                    : "Unavailable"}
                </em>
              )}
            </span>
          </button>
        ))}
        {!ordered.length && (
          <div className="empty-list">
            No sources yet.
            <p>Add files in Explorer, then choose Refresh.</p>
          </div>
        )}
      </div>
      <div className="sidebar-footer">
        <SettingsMenu
          busy={busy}
          hasVault={hasVault}
          onOpen={onOpen}
          onRefresh={onRefresh}
          onManageTags={onManageTags}
        />
      </div>
    </aside>
  );
}
