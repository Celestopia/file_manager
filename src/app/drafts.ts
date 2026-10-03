import type { NoteDraft, SourceEdit, TagEdit } from "../domain/types";

export function sameSource(a: SourceEdit, b: SourceEdit) {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.description === b.description &&
    a.source_url.trim() === b.source_url.trim() &&
    [...new Set(a.tag_ids)].sort().join("\0") ===
      [...new Set(b.tag_ids)].sort().join("\0")
  );
}
export function sameNote(a: NoteDraft, b: NoteDraft) {
  return (
    a.id === b.id &&
    a.source_id === b.source_id &&
    a.title === b.title &&
    a.description === b.description &&
    a.body === b.body
  );
}
export function sameTag(a: TagEdit, b: TagEdit) {
  return (
    a.id === b.id &&
    a.parent_id === b.parent_id &&
    a.name.trim() === b.name.trim() &&
    a.description === b.description
  );
}
