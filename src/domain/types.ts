export interface Observation {
  availability: "present" | "missing" | "unavailable";
  size_bytes: number | null;
  file_modified_at: string | null;
  content_hash: string | null;
}
export interface Source {
  id: string;
  path: string;
  title: string;
  description: string;
  source_url: string;
  tag_ids: string[];
  created_at: string;
  modified_at: string;
  observation: Observation;
}
export interface Note {
  id: string;
  source_id: string;
  title: string;
  description: string;
  created_at: string;
  modified_at: string;
}
export interface Tag {
  parent_id: string | null;
  id: string;
  name: string;
  description: string;
  created_at: string;
  modified_at: string;
}
export interface Snapshot {
  note_sizes: Record<string, number | null>;
  root: string;
  catalog: { sources: Source[]; notes: Note[]; tags: Tag[] };
}
export interface SourceEdit {
  id: string;
  title: string;
  description: string;
  source_url: string;
  tag_ids: string[];
}
export interface NoteDraft {
  id: string | null;
  source_id: string;
  title: string;
  description: string;
  body: string;
}
export interface Summary {
  scanned: number;
  added: number;
  moved: number;
  missing: number;
  unavailable: number;
  warnings: string[];
}
export function stem(path: string) {
  const name = filename(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}
export function title(source: Source) {
  return source.title || stem(source.path);
}
export function sourceEdit(s: Source): SourceEdit {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    source_url: s.source_url,
    tag_ids: [...s.tag_ids],
  };
}
export function validUrl(value: string) {
  const v = value.trim();
  if (!v) return true;
  if (!/^https?:\/\//.test(v) || /\s/.test(v)) return false;
  try {
    const u = new URL(v);
    return !!u.hostname;
  } catch {
    return false;
  }
}
export function nextNoteTitle(notes: Note[]) {
  let i = 1;
  while (notes.some((n) => n.title === `Reading note ${i}`)) i++;
  return `Reading note ${i}`;
}
export function date(value: string) {
  return new Date(value).toLocaleString();
}
export function fileSize(bytes: number | null | undefined): string {
  if (bytes == null) return "Unknown";
  if (bytes < 1000) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1000;
  let index = 0;
  while (value >= 1000 && index < units.length - 1) {
    value /= 1000;
    index++;
  }
  return `${Number(value.toFixed(2))} ${units[index]}`;
}

export interface TagEdit {
  parent_id: string | null;
  id: string | null;
  name: string;
  description: string;
}
export function filename(path: string) {
  return path.split(/[\\/]/).pop() || path;
}
export function extension(path: string) {
  const name = filename(path),
    dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}
export function compareSources(a: Source, b: Source) {
  return title(a).localeCompare(title(b)) || a.path.localeCompare(b.path);
}
