// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TagTree } from "./TagTree";
import { TagParentPicker } from "./TagParentPicker";
import { hierarchyRows, descendantIds } from "./hierarchy";
const tags = [
  { id: "a", name: "Research", parent_id: null },
  { id: "b", name: "Reading", parent_id: null },
  { id: "c", name: "Ideas", parent_id: "a" },
  { id: "d", name: "Ideas", parent_id: "b" },
  { id: "e", name: "Models", parent_id: "c" },
].map((t) => ({
  ...t,
  description: t.id === "e" ? "Neural networks" : "",
  created_at: "",
  modified_at: "",
}));
afterEach(cleanup);
it("derives paths and exposes search ancestors without unrelated branches", () => {
  expect([...descendantIds(tags, "a")]).toEqual(["c", "e"]);
  expect(
    hierarchyRows(tags, "neural", new Set()).map((r) => [r.tag.id, r.depth]),
  ).toEqual([
    ["a", 0],
    ["c", 1],
    ["e", 2],
  ]);
  expect(hierarchyRows(tags, "", new Set()).map((r) => r.tag.id)).toEqual([
    "b",
    "a",
  ]);
});
it("expansion does not assign a parent and clearing search restores expansion", () => {
  const toggle = vi.fn();
  const view = render(
    <TagTree
      tags={tags}
      query=""
      selected={["e"]}
      disabled={false}
      onToggle={toggle}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Expand Research" }));
  expect(toggle).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Ideas" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  view.rerender(
    <TagTree
      tags={tags}
      query="neural"
      selected={["e"]}
      disabled={false}
      onToggle={toggle}
    />,
  );
  expect(screen.getByRole("button", { name: "Models" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  view.rerender(
    <TagTree
      tags={tags}
      query=""
      selected={["e"]}
      disabled={false}
      onToggle={toggle}
    />,
  );
  expect(screen.queryByRole("button", { name: "Models" })).toBeNull();
  expect(screen.getByRole("button", { name: "Ideas" })).toBeInTheDocument();
});
it("parent picker excludes self and descendants, permits root, and returns focus", () => {
  const change = vi.fn();
  render(
    <TagParentPicker
      tags={tags}
      id="c"
      value="a"
      disabled={false}
      onChange={change}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Parent tag" }));
  const menu = within(
    screen.getByRole("dialog", { name: "Choose parent tag" }),
  );
  fireEvent.change(menu.getByRole("textbox"), { target: { value: "Models" } });
  expect(menu.queryByRole("button", { name: /Models/ })).toBeNull();
  fireEvent.click(menu.getByRole("button", { name: "No parent" }));
  expect(change).toHaveBeenCalledWith(null);
  expect(screen.getByRole("button", { name: "Parent tag" })).toHaveFocus();
});
