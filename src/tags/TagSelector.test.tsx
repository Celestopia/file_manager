// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { recordRecentTags } from "./tagHistory";
import { TagSelector } from "./TagSelector";
const tags = ["Alpha", "alpha", "Beta", "Gamma"].map((name) => ({
  id: name,
  name,
  description: "",
  created_at: "",
  modified_at: "",
}));
function Fixture({ vault = "vault" }: { vault?: string }) {
  const [selected, change] = useState<string[]>([]);
  return (
    <TagSelector
      vault={vault}
      tags={tags}
      selected={selected}
      disabled={false}
      onChange={(ids) => {
        recordRecentTags(
          vault,
          ids.filter((id) => !selected.includes(id)),
        );
        change(ids);
      }}
    />
  );
}
beforeEach(() => localStorage.clear());
afterEach(cleanup);
it("searches tags without merging case-sensitive names and toggles draft assignments", () => {
  render(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Select tags" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Search tags" }), {
    target: { value: "ALP" },
  });
  const all = within(screen.getByRole("group", { name: "All tags" }));
  expect(all.getAllByRole("checkbox")).toHaveLength(2);
  fireEvent.click(all.getByRole("checkbox", { name: "Alpha" }));
  expect(all.getByRole("checkbox", { name: "Alpha" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(all.getByRole("checkbox", { name: "alpha" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Select tags" })).toHaveFocus();
});
it("remembers only the last three selected tags and isolates vault history", () => {
  const view = render(<Fixture />);
  fireEvent.click(screen.getByRole("button", { name: "Select tags" }));
  const all = within(screen.getByRole("group", { name: "All tags" }));
  for (const tag of tags)
    fireEvent.click(all.getByRole("checkbox", { name: tag.name }));
  expect(JSON.parse(localStorage.getItem("recent-tags:vault")!)).toEqual([
    "Gamma",
    "Beta",
    "alpha",
  ]);
  view.unmount();
  render(<Fixture vault="other" />);
  fireEvent.click(screen.getByRole("button", { name: "Select tags" }));
  expect(
    screen.queryByRole("group", { name: "Recent tags" }),
  ).not.toBeInTheDocument();
});
