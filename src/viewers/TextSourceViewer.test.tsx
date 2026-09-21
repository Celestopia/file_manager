// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TextSourceViewer } from "./TextSourceViewer";
const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: read }));
beforeEach(() => {
  read.mockReset();
});
afterEach(cleanup);
it("renders Markdown without editable or embedded active content", async () => {
  read.mockResolvedValue(
    "# Read-only source\n\n**Bold**\n\n<script>alert(1)</script>\n\n![remote](https://example.org/a.png)",
  );
  const { container } = render(
    <TextSourceViewer id="source" revision={0} markdown onError={() => {}} />,
  );
  await screen.findByRole("heading", { name: "Read-only source" });
  expect(screen.getByText("Bold").tagName).toBe("STRONG");
  expect(
    container.querySelector("script,img,textarea,input,[contenteditable]"),
  ).toBeNull();
  expect(read).toHaveBeenCalledWith("read_source_text", { id: "source" });
});
it("renders TXT markup literally and handles empty files", async () => {
  read.mockResolvedValue("<b>你好</b>\n  indentation");
  const { rerender, container } = render(
    <TextSourceViewer
      id="text"
      revision={0}
      markdown={false}
      onError={() => {}}
    />,
  );
  await screen.findByText("<b>你好</b> indentation");
  expect(container.querySelector("b")).toBeNull();
  read.mockResolvedValue("");
  rerender(
    <TextSourceViewer
      id="empty"
      revision={0}
      markdown={false}
      onError={() => {}}
    />,
  );
  await screen.findByText("This file is empty.");
});
it("reports a failed source read through notifications", async () => {
  read.mockRejectedValue("Unreadable source");
  const error = vi.fn();
  render(
    <TextSourceViewer id="bad" revision={0} markdown={false} onError={error} />,
  );
  await screen.findByText("Text preview unavailable");
  expect(error).toHaveBeenCalledWith("Unreadable source");
});
