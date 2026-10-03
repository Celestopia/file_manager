import type { Tag } from "../domain/types";
export function descendantIds(tags: Tag[], id: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const tag of tags)
    if (tag.parent_id)
      children.set(tag.parent_id, [
        ...(children.get(tag.parent_id) || []),
        tag.id,
      ]);
  const result = new Set<string>(),
    stack = [...(children.get(id) || [])];
  while (stack.length) {
    const current = stack.pop()!;
    result.add(current);
    stack.push(...(children.get(current) || []));
  }
  return result;
}
export function hierarchyRows(
  tags: Tag[],
  query: string,
  expanded: Set<string>,
) {
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  const children = new Map<string | null, Tag[]>();
  for (const tag of tags)
    children.set(tag.parent_id, [...(children.get(tag.parent_id) || []), tag]);
  for (const list of children.values())
    list.sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
  const search = query.trim().toLocaleLowerCase(),
    visible = new Set<string>();
  if (search)
    for (const tag of tags) {
      if (
        ![tag.name, tag.description].some((value) =>
          value.toLocaleLowerCase().includes(search),
        )
      )
        continue;
      let current: Tag | undefined = tag;
      while (current && !visible.has(current.id)) {
        visible.add(current.id);
        current = current.parent_id ? byId.get(current.parent_id) : undefined;
      }
    }
  const rows: { tag: Tag; depth: number; hasChildren: boolean }[] = [];
  const stack = (children.get(null) || [])
    .map((tag) => ({ tag, depth: 0 }))
    .reverse();
  while (stack.length) {
    const row = stack.pop()!;
    if (search && !visible.has(row.tag.id)) continue;
    const nested = children.get(row.tag.id) || [];
    rows.push({ ...row, hasChildren: nested.length > 0 });
    if (search || expanded.has(row.tag.id))
      stack.push(
        ...nested.map((tag) => ({ tag, depth: row.depth + 1 })).reverse(),
      );
  }
  return rows;
}
