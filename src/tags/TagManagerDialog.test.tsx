// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TagManagerDialog } from "./TagManagerDialog";
const tags = [
  { id: "root", name: "Research", parent_id: null },
  { id: "child", name: "Models", parent_id: "root" },
  { id: "leaf", name: "Agents", parent_id: "child" },
].map((tag) => ({ ...tag, description: "", created_at: "", modified_at: "" }));
afterEach(cleanup);
it("renders nested management rows, expands branches, and restores folding after search", () => {
  const edit = vi.fn();
  render(
    <TagManagerDialog
      tags={tags}
      sources={[]}
      busy={false}
      closeTags={vi.fn()}
      editTagChoice={edit}
      deleteTag={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Edit tag Models" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Edit tag Agents" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
  expect(
    screen.getByRole("button", { name: "Edit tag Agents" }).closest("article"),
  ).toHaveStyle({ marginLeft: "36px" });
  fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
  expect(screen.queryByRole("button", { name: "Edit tag Models" })).toBeNull();
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Agents" },
  });
  expect(
    screen.getByRole("button", { name: "Edit tag Research" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Collapse all" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Edit tag Agents" }));
  expect(edit).toHaveBeenCalledWith(tags[2]);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
  expect(screen.queryByRole("button", { name: "Edit tag Agents" })).toBeNull();
});
