import { TagParentPicker } from "./TagParentPicker";
import type { Tag, TagEdit } from "../domain/types";
export function TagFields({
  draft,
  tags,
  busy,
  onChange,
}: {
  draft: TagEdit;
  tags: Tag[];
  busy: boolean;
  onChange: (draft: TagEdit) => void;
}) {
  return (
    <div className="tag-definition-fields">
      <label>
        <span>Tag name</span>
        <input
          autoFocus
          value={draft.name}
          disabled={busy}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
      </label>
      <TagParentPicker
        tags={tags}
        id={draft.id}
        value={draft.parent_id}
        disabled={busy}
        onChange={(parent_id) => onChange({ ...draft, parent_id })}
      />
      <label>
        <span>
          Description <small>(optional)</small>
        </span>
        <textarea
          rows={3}
          value={draft.description}
          disabled={busy}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
        />
      </label>
      <small className="tag-naming-hint">
        Names are case-sensitive and unique within the same parent.
      </small>
    </div>
  );
}
