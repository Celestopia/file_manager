// @vitest-environment jsdom
import { listen } from "@tauri-apps/api/event";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { Snapshot } from "../domain/types";
import { StrictMode } from "react";
const { call, destroyWindow, windowEvents } = vi.hoisted(() => ({
  call: vi.fn(),
  destroyWindow: vi.fn(),
  windowEvents: {
    close: null as
      null | ((event: { preventDefault: () => void }) => Promise<void>),
  },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: call }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async (handler: typeof windowEvents.close) => {
      windowEvents.close = handler;
      return () => {
        windowEvents.close = null;
      };
    },
    isMaximized: async () => false,
    onResized: async () => () => {},
    close: async () => {
      await windowEvents.close?.({ preventDefault: vi.fn() });
    },
    destroy: destroyWindow,
  }),
}));
vi.mock("../viewers/PdfViewer", () => ({
  PdfViewer: () => <div>PDF preview</div>,
}));
let database: Snapshot;
const time = "2026-09-21T01:00:00Z";
beforeEach(() => {
  window.__INITIAL_SCAN__ = false;
  database = {
    note_sizes: {},
    root: "F:/Fixture",
    catalog: {
      sources: [
        {
          id: "s1",
          path: "a.pdf",
          title: "Alpha",
          description: "",
          source_url: "",
          tag_ids: [],
          created_at: time,
          modified_at: time,
          observation: {
            availability: "present",
            size_bytes: 100,
            file_modified_at: time,
            content_hash: null,
          },
        },
        {
          id: "s2",
          path: "b.pdf",
          title: "Beta",
          description: "",
          source_url: "",
          tag_ids: [],
          created_at: time,
          modified_at: time,
          observation: {
            availability: "present",
            size_bytes: 100,
            file_modified_at: time,
            content_hash: null,
          },
        },
      ],
      notes: [],
      tags: [],
    },
  };
  destroyWindow.mockReset();
  destroyWindow.mockResolvedValue(undefined);
  call.mockReset();
  call.mockImplementation(async (command: string, args: any) => {
    if (command === "snapshot") return structuredClone(database);
    if (command === "renderer_ready") return;
    if (command === "choose_folder") return null;
    if (command === "refresh")
      return [
        structuredClone(database),
        {
          scanned: 2,
          added: 0,
          moved: 0,
          missing: 0,
          unavailable: 0,
          warnings: [],
        },
      ];
    if (command === "edit_source") {
      Object.assign(
        database.catalog.sources.find((s) => s.id === args.edit.id)!,
        args.edit,
      );
      return structuredClone(database);
    }
    if (command === "save_note") {
      const id = args.edit.id || "n1";
      database.catalog.notes = [
        {
          id,
          source_id: args.edit.source_id,
          title: args.edit.title,
          description: args.edit.description,
          created_at: time,
          modified_at: time,
        },
      ];
      database.note_sizes[id] = new TextEncoder().encode(args.edit.body).length;
      return [structuredClone(database), id];
    }
    if (command === "edit_tag") {
      const existing = database.catalog.tags.find(
        (tag) => tag.id === args.edit.id,
      );
      if (existing) Object.assign(existing, args.edit);
      else
        database.catalog.tags.push({
          ...args.edit,
          id: "tag-new",
          created_at: time,
          modified_at: time,
        });
      return structuredClone(database);
    }
    if (command === "delete_note") {
      database.catalog.notes = database.catalog.notes.filter(
        (n) => n.id !== args.id,
      );
      return structuredClone(database);
    }
    if (command === "read_note") return "# Existing";
    throw Error(`Unexpected command ${command}`);
  });
});
afterEach(cleanup);
it("loads successfully when React replays the mount lifecycle", async () => {
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  await screen.findByRole("heading", { name: "Alpha" });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Details" })).toBeEnabled(),
  );
});
async function start() {
  render(<App />);
  await screen.findByRole("heading", { name: "Alpha" });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Details" })).toBeEnabled(),
  );
}
function openNotes() {
  if (!screen.queryByRole("region", { name: "Notes panel" }))
    fireEvent.click(screen.getByRole("button", { name: "Notes" }));
}
describe("core interactions", () => {
  it("opens saved notes in Preview and keeps information edits when the dialog closes", async () => {
    database.catalog.notes = [
      {
        id: "existing",
        source_id: "s1",
        title: "Saved note",
        description: "",
        created_at: time,
        modified_at: time,
      },
    ];
    database.note_sizes.existing = 10;
    await start();
    openNotes();
    await screen.findByRole("heading", { name: "Existing" });
    expect(screen.getByRole("button", { name: "Preview" })).toHaveClass(
      "active",
    );
    expect(
      screen.queryByRole("textbox", { name: "Markdown note body" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("File size")).not.toBeInTheDocument();
    screen.getByRole("button", { name: "Information" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "Information" }));
    const dialog = screen.getByRole("dialog", { name: "Information" });
    expect(within(dialog).getByText("10 B")).toBeInTheDocument();
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "Note description" }),
      { target: { value: "A useful context" } },
    );
    fireEvent.keyDown(
      within(dialog).getByRole("textbox", { name: "Note description" }),
      { key: "Escape" },
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Information" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Information" }));
    expect(
      screen.getByRole("textbox", { name: "Note description" }),
    ).toHaveValue("A useful context");
  });
  it("collapses source file information initially", async () => {
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    const disclosure = screen.getByText("File information").closest("details");
    expect(disclosure).not.toHaveAttribute("open");
    expect(within(disclosure!).getByText("Relative path")).toBeInTheDocument();
  });
  it("finishes a clean close instead of requesting close again", async () => {
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Close window" }));
    await waitFor(() => expect(destroyWindow).toHaveBeenCalledTimes(1));
  });
  it("keeps the window on Stay and destroys it after Discard", async () => {
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Title" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "Draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close window" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Stay",
      }),
    );
    expect(destroyWindow).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close window" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Discard",
      }),
    );
    await waitFor(() => expect(destroyWindow).toHaveBeenCalledTimes(1));
    expect(database.catalog.sources[0].title).toBe("Alpha");
  });
  it("keeps a failed save open and closes only after a successful retry", async () => {
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Source URL" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Source URL" }), {
      target: { value: "invalid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close window" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Save changes",
      }),
    );
    await screen.findByRole("alert");
    expect(destroyWindow).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Source URL" }), {
      target: { value: "https://example.org" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close window" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Save changes",
      }),
    );
    await waitFor(() => expect(destroyWindow).toHaveBeenCalledTimes(1));
    expect(database.catalog.sources[0].source_url).toBe("https://example.org");
  });
  it("shows read-only metadata in the right panel and preserves edits across panel switches", async () => {
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    const panel = screen.getByRole("region", { name: "Metadata panel" });
    expect(panel.parentElement).toHaveClass("workspace");
    expect(within(panel).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(panel).getByText("Created")).toBeInTheDocument();
    expect(within(panel).getByText("Modified")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Title" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "Draft title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit Title" }));
    expect(
      screen.queryByRole("textbox", { name: "Title" }),
    ).not.toBeInTheDocument();
    expect(within(panel).getByText("Draft title")).toBeInTheDocument();
    expect(database.catalog.sources[0].title).toBe("Alpha");
    fireEvent.click(screen.getByRole("button", { name: "Edit Title" }));
    openNotes();
    expect(
      screen.queryByRole("region", { name: "Metadata panel" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(
      screen.queryByRole("region", { name: "Notes panel" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
      "Draft title",
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: "Title" }),
      ).not.toBeInTheDocument(),
    );
    expect(database.catalog.sources[0].title).toBe("Draft title");
  });
  it("has the two-panel reading workflow without search or filters", async () => {
    await start();
    expect(screen.getByText("PDF preview")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Reconnect")).not.toBeInTheDocument();
  });
  it("saves a new note, then deletes it only after confirmation", async () => {
    await start();
    openNotes();
    fireEvent.click(screen.getByRole("button", { name: "New note" }));
    await screen.findByDisplayValue("Reading note 1");
    fireEvent.change(
      screen.getByRole("textbox", { name: "Markdown note body" }),
      { target: { value: "# Reading" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete note" })).toBeEnabled(),
    );
    expect(call).toHaveBeenCalledWith("save_note", {
      edit: expect.objectContaining({ body: "# Reading", body_changed: true }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(call.mock.calls.some((c) => c[0] === "delete_note")).toBe(false);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete permanently" }),
    );
    await waitFor(() => expect(database.catalog.notes).toHaveLength(0));
  });
  it("offers Stay and Discard for unsaved source metadata", async () => {
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Title" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "Unsaved" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Beta/ }));
    let dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Stay" }));
    expect(screen.getByDisplayValue("Unsaved")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.click(screen.getByRole("button", { name: /Beta/ }));
    dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
    await screen.findByRole("heading", { name: "Beta" });
    expect(database.catalog.sources[0].title).toBe("Alpha");
  });
  it("does not resurrect stale metadata after Save then New note", async () => {
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Title" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "Saved title" },
    });
    openNotes();
    fireEvent.click(screen.getByRole("button", { name: "New note" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await screen.findByDisplayValue("Reading note 1");
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(
      within(screen.getByRole("region", { name: "Metadata panel" })).getByText(
        "Saved title",
      ),
    ).toBeInTheDocument();
    expect(database.catalog.sources[0].title).toBe("Saved title");
  });
  it("rejects incomplete URLs before sending a save", async () => {
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Source URL" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Source URL" }), {
      target: { value: "doi:10.1000/example" },
    });
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(call.mock.calls.some((c) => c[0] === "edit_source")).toBe(false);
  });
  it("preserves note draft when save fails", async () => {
    await start();
    openNotes();
    fireEvent.click(screen.getByRole("button", { name: "New note" }));
    await screen.findByDisplayValue("Reading note 1");
    const body = screen.getByRole("textbox", { name: "Markdown note body" });
    fireEvent.change(body, { target: { value: "Keep this draft" } });
    call.mockImplementationOnce(async () => {
      throw Error("Disk full");
    });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Disk full");
    expect(body).toHaveValue("Keep this draft");
  });
  it("moves vault operations behind Settings and dismisses the menu with Escape", async () => {
    await start();
    expect(screen.queryByText("F:/Fixture")).not.toBeInTheDocument();
    expect(screen.queryByText("LOCAL VAULT")).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open folder" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(
      screen.getByRole("menuitem", { name: "Open folder" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Refresh" }));
    await waitFor(() => expect(call).toHaveBeenCalledWith("refresh"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Details" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toHaveFocus();
  });
  it("keeps the note draft when the right column is closed and reopened", async () => {
    await start();
    openNotes();
    fireEvent.click(screen.getByRole("button", { name: "New note" }));
    const body = await screen.findByRole("textbox", {
      name: "Markdown note body",
    });
    fireEvent.change(body, { target: { value: "Keep my thinking" } });
    fireEvent.click(screen.getByRole("button", { name: "Close notes" }));
    expect(
      screen.queryByRole("region", { name: "Notes panel" }),
    ).not.toBeInTheDocument();
    openNotes();
    expect(
      screen.getByRole("textbox", { name: "Markdown note body" }),
    ).toHaveValue("Keep my thinking");
    expect(
      screen
        .getByRole("button", { name: "Details" })
        .querySelector("svg circle"),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Open file" }).querySelector("svg"),
    ).not.toBeNull();
    expect(call.mock.calls.some((c) => c[0] === "save_note")).toBe(false);
  });
});

it("tag assignments restored to the same set do not create an unsaved draft", async () => {
  database.catalog.tags = ["a", "b"].map((id) => ({
    id,
    name: id,
    parent_id: null,
    description: "",
    created_at: time,
    modified_at: time,
  }));
  database.catalog.sources[0].tag_ids = ["a", "b"];
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Details" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove tag a" }));
  fireEvent.click(screen.getByRole("button", { name: "Select tags" }));
  fireEvent.click(
    within(screen.getByRole("group", { name: "All tags" })).getByRole(
      "button",
      { name: "a" },
    ),
  );
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Search tags" }), {
    key: "Escape",
  });
  expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
});
it("saved source URL stays a link while unrelated description is in draft", async () => {
  database.catalog.sources[0].source_url = "https://example.org";
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Details" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit Description" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Description" }), {
    target: { value: "Draft description" },
  });
  expect(
    screen.queryByRole("link", { name: "https://example.org" }),
  ).toBeInTheDocument();
});
it("source type badge for an extensionless file does not expose a directory fragment", async () => {
  database.catalog.sources[0].path = "folder/README";
  await start();
  expect(document.querySelector(".source-header .eyebrow")).toBeNull();
});

it("late event subscriptions are disposed when the app has already unmounted", async () => {
  const unsubscribe = vi.fn();
  let finish!: (value: () => void) => void;
  vi.mocked(listen).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<App />);
  view.unmount();
  finish(unsubscribe);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it("switching to saved notes preserves source draft and pencil mode", async () => {
  database.catalog.notes = [
    {
      id: "n1",
      source_id: "s1",
      title: "Saved",
      description: "",
      created_at: time,
      modified_at: time,
    },
  ];
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Details" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit Title" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
    target: { value: "Draft" },
  });
  openNotes();
  await screen.findByRole("heading", { name: "Existing" });
  fireEvent.click(screen.getByRole("button", { name: "Details" }));
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Draft");
  expect(database.catalog.sources[0].title).toBe("Alpha");
});
it("tag modal isolates background focus and confirmation keeps its owner", async () => {
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Details" }));
  const close = screen.getByRole("button", { name: "Close window" });
  fireEvent.click(screen.getByRole("button", { name: "Create tag" }));
  const dialog = await screen.findByRole("dialog", { name: "Create Tag" });
  close.focus();
  expect(dialog.contains(document.activeElement)).toBe(true);
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Tag name" }), {
    target: { value: "draft" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await screen.findByRole("alertdialog");
  await windowEvents.close?.({ preventDefault: vi.fn() });
  expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Stay" }));
  expect(within(dialog).getByRole("textbox", { name: "Tag name" })).toHaveValue(
    "draft",
  );
  expect(destroyWindow).not.toHaveBeenCalled();
});

it("right-panel collapse preserves the source draft and reopens from Details", async () => {
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Details" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit Title" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
    target: { value: "Unsaved title" },
  });
  for (let n = 0; n < 7; n++) {
    const divider = screen.queryByRole("separator", {
      name: "Resize metadata",
    });
    if (divider) fireEvent.keyDown(divider, { key: "ArrowRight" });
  }
  expect(
    screen.queryByRole("separator", { name: "Resize metadata" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Details" }));
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
    "Unsaved title",
  );
  expect(database.catalog.sources[0].title).toBe("Alpha");
});

it("global tag deletion preserves other source draft edits and removes stale assignments", async () => {
  database.catalog.tags = ["parent", "other"].map((id) => ({
    id,
    name: id,
    parent_id: null,
    description: "",
    created_at: time,
    modified_at: time,
  }));
  database.catalog.sources[0].tag_ids = ["parent"];
  const original = call.getMockImplementation()!;
  call.mockImplementation(async (command, args) => {
    if (command === "preview_tag_deletion")
      return { path: "parent", affected_sources: 1, detached_children: 0 };
    if (command === "delete_tag") {
      database.catalog.tags = database.catalog.tags.filter(
        (t) => t.id !== args.id,
      );
      database.catalog.sources[0].tag_ids = [];
      return structuredClone(database);
    }
    return original(command, args);
  });
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Details" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit Title" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
    target: { value: "Keep my draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Select tags" }));
  fireEvent.click(screen.getByRole("button", { name: "other" }));
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Search tags" }), {
    key: "Escape",
  });
  fireEvent.click(screen.getByRole("button", { name: "Edit tags" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Delete tag parent globally" }),
  );
  const confirm = await screen.findByRole("alertdialog");
  fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Edit tag parent" }),
    ).toBeNull(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Close tag manager" }));
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
    "Keep my draft",
  );
  expect(
    screen.queryByRole("button", { name: "Remove tag parent" }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Remove tag other" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  await waitFor(() =>
    expect(database.catalog.sources[0].title).toBe("Keep my draft"),
  );
  expect(database.catalog.sources[0].tag_ids).toEqual(["other"]);
});

it("opens tag management from vault operations without a selected source", async () => {
  database.catalog.sources = [];
  render(<App />);
  await waitFor(() => expect(call).toHaveBeenCalledWith("renderer_ready"));
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Manage Tags" }));
  const manager = screen.getByRole("dialog", { name: "Manage Tags" });
  expect(within(manager).getByText("No tags yet")).toBeInTheDocument();
  fireEvent.change(within(manager).getByRole("textbox"), {
    target: { value: "New" },
  });
  fireEvent.click(within(manager).getByRole("button", { name: "Create tag" }));
  const create = screen.getByRole("dialog", { name: "Create Tag" });
  fireEvent.change(within(create).getByRole("textbox", { name: "Tag name" }), {
    target: { value: "New tag" },
  });
  fireEvent.click(within(create).getByRole("button", { name: "Create" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Create Tag" })).toBeNull(),
  );
  expect(within(manager).getByRole("textbox")).toHaveValue("New");
  expect(within(manager).getByText("New tag")).toBeInTheDocument();
  expect(within(manager).getByText("0 source files")).toBeInTheDocument();
  expect(call.mock.calls.some((c) => c[0] === "edit_source")).toBe(false);
});

it("creates and adds a tag only to the source draft, and parent selection does not submit", async () => {
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Details" }));
  fireEvent.click(screen.getByRole("button", { name: "Create tag" }));
  const create = screen.getByRole("dialog", { name: "Create Tag" });
  fireEvent.change(within(create).getByRole("textbox", { name: "Tag name" }), {
    target: { value: "New tag" },
  });
  fireEvent.click(within(create).getByRole("button", { name: "Parent tag" }));
  fireEvent.click(within(create).getByRole("button", { name: "No parent" }));
  expect(call.mock.calls.some((c) => c[0] === "edit_tag")).toBe(false);
  fireEvent.click(
    within(create).getByRole("button", { name: "Create and Add" }),
  );
  await screen.findByRole("button", { name: "Remove tag New tag" });
  expect(database.catalog.sources[0].tag_ids).toEqual([]);
  expect(screen.queryByRole("dialog", { name: "Manage Tags" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  await waitFor(() =>
    expect(database.catalog.sources[0].tag_ids).toEqual(["tag-new"]),
  );
});

it("edits tags in a separate dialog and preserves drafts when cancellation is declined", async () => {
  database.catalog.tags = [
    {
      id: "t",
      name: "Old",
      parent_id: null,
      description: "Original description",
      created_at: time,
      modified_at: time,
    },
  ];
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Manage Tags" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit tag Old" }));
  const editor = await screen.findByRole("dialog", { name: "Edit Tag" });
  expect(editor.querySelector("form")).not.toBeNull();
  expect(document.querySelector(".tag-manager-list form")).toBeNull();
  fireEvent.change(await screen.findByRole("textbox", { name: "Tag name" }), {
    target: { value: "New" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(await screen.findByRole("button", { name: "Stay" }));
  expect(screen.getByRole("textbox", { name: "Tag name" })).toHaveValue("New");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("button", { name: "Edit tag New" });
  expect(database.catalog.tags[0].name).toBe("New");
});
