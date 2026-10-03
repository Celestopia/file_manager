import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import appIcon from "../assets/app-icon.svg";
import { sameNote, sameSource, sameTag } from "./drafts";
import { Icon } from "../ui/Icons";
import { InformationDialog } from "../notes/InformationDialog";
import { invoke } from "../native/ipc";
import {
  defaultSourceWidth,
  rightPanelMax,
  sourcePanelMax,
  sourceWidthFor,
} from "./layout";
import { ModalShell } from "../ui/ModalShell";
import { NotesPanel } from "../notes/NotesPanel";
import { Notifications, useNotifications } from "../ui/Notifications";
import { PdfViewer } from "../viewers/PdfViewer";
import { ResizeHandle } from "../ui/ResizeHandle";
import { SourceHeader } from "../sources/SourceHeader";
import { SourceList } from "../sources/SourceList";
import { SourceMetadataPanel } from "../sources/SourceMetadataPanel";
import "../styles/app.css";
import { recordRecentTags, removeRecentTag } from "../tags/tagHistory";
import { TagEditorDialog } from "../tags/TagEditorDialog";
import { TagManagerDialog } from "../tags/TagManagerDialog";
import { TextSourceViewer } from "../viewers/TextSourceViewer";
import {
  compareSources,
  date,
  fileSize,
  extension,
  nextNoteTitle,
  sourceEdit,
  validUrl,
  type NoteDraft,
  type Snapshot,
  type SourceEdit,
  type Tag,
  type TagEdit,
} from "../domain/types";
import { useNativeLifecycle } from "../native/useNativeLifecycle";
import { WindowControls } from "../ui/WindowControls";

type Decision = {
  heading: string;
  text: string;
  choices: string[];
  resolve: (v: string) => void;
};
export function App() {
  const [informationOpen, setInformationOpen] = useState(false);
  const { notices, dismiss, setStatus, setError } = useNotifications();
  const [data, setData] = useState<Snapshot | null>(null),
    [selected, setSelected] = useState(""),
    [draft, setDraft] = useState<SourceEdit | null>(null),
    [baseSource, setBaseSource] = useState<SourceEdit | null>(null);
  const [note, setNote] = useState<NoteDraft | null>(null),
    [baseNote, setBaseNote] = useState<NoteDraft | null>(null),
    [bodyError, setBodyError] = useState("");
  const [sourceWidth, setSourceWidth] = useState(
    defaultSourceWidth(window.innerWidth),
  );
  const [noteWidth, setNoteWidth] = useState(380);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const [activePanel, setActivePanel] = useState<"metadata" | "notes" | null>(
    null,
  );
  const visibleSourceWidth =
    sourceWidth === 0
      ? 0
      : Math.min(
          sourceWidth,
          sourcePanelMax(viewportWidth, activePanel !== null),
        );
  const panelMax = rightPanelMax(viewportWidth, visibleSourceWidth);
  const panelWidth = Math.min(noteWidth, panelMax);
  const resizeSource = (width: number) =>
    setSourceWidth(sourceWidthFor(width, viewportWidth, activePanel !== null));
  const [editingFields, setEditingFields] = useState<string[]>([]);
  const resizeRight = (width: number) => {
    if (width < 100) setActivePanel(null);
    else setNoteWidth(Math.max(280, Math.min(panelMax, width)));
  };
  const details = activePanel === "metadata",
    notesOpen = activePanel === "notes";
  const [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [decision, setDecision] = useState<Decision | null>(null),
    [tagsOpen, setTagsOpen] = useState(false),
    [tagCreateTarget, setTagCreateTarget] = useState<"source" | "manager">(
      "manager",
    ),
    [tagEdit, setTagEdit] = useState<TagEdit | null>(null),
    [tagBase, setTagBase] = useState<TagEdit | null>(null);
  const taskRunning = useRef(false),
    transitionRunning = useRef(false);
  const pendingDecision = useRef(false);
  async function transition(action: () => Promise<void>) {
    if (
      transitionRunning.current ||
      taskRunning.current ||
      pendingDecision.current
    )
      return;
    transitionRunning.current = true;
    try {
      await action();
    } finally {
      transitionRunning.current = false;
    }
  }
  const source = data?.catalog.sources.find((s) => s.id === selected),
    sourceNotes =
      data?.catalog.notes.filter((n) => n.source_id === selected) || [];
  const sourceDirty = !!draft && !!baseSource && !sameSource(draft, baseSource);
  const noteDirty =
    !!note && (note.id === null || !baseNote || !sameNote(note, baseNote));
  const tagDirty = !!tagEdit && !!tagBase && !sameTag(tagEdit, tagBase);
  function ask(heading: string, text: string, choices: string[]) {
    if (pendingDecision.current)
      return Promise.resolve(choices[choices.length - 1]);
    pendingDecision.current = true;
    return new Promise<string>((resolve) =>
      setDecision({
        heading,
        text,
        choices,
        resolve: (value) => {
          pendingDecision.current = false;
          setDecision(null);
          resolve(value);
        },
      }),
    );
  }
  async function task<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (taskRunning.current) return undefined;
    taskRunning.current = true;
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(String(e));
      return undefined;
    } finally {
      taskRunning.current = false;
      setBusy(false);
    }
  }
  async function applySource() {
    if (!draft || !sourceDirty) return;
    if (!validUrl(draft.source_url))
      throw Error("Enter a complete http:// or https:// URL.");
    const next = await invoke("edit_source", { edit: draft });
    setData(next);
    const saved = sourceEdit(
      next.catalog.sources.find((s) => s.id === draft.id)!,
    );
    setDraft(saved);
    setBaseSource(saved);
    setEditingFields([]);
    setStatus("Source metadata saved");
  }
  async function saveNote() {
    if (!note || !noteDirty) return;
    if (bodyError) throw Error(bodyError);
    const [next, id] = await invoke("save_note", {
      edit: { ...note, body_changed: !baseNote || note.body !== baseNote.body },
    });
    setData(next);
    const saved = { ...note, id };
    setNote(saved);
    setBaseNote(saved);
    setStatus("Note saved");
  }
  async function guard() {
    if (taskRunning.current || pendingDecision.current) return false;
    if (tagDirty) {
      const choice = await ask(
        "Unsaved tag changes",
        "Discard the changes in the tag editor?",
        ["Discard", "Stay"],
      );
      if (choice !== "Discard") return false;
      setTagEdit(null);
      setTagBase(null);
    }
    if (!sourceDirty && !noteDirty) return true;
    const names = [
      sourceDirty ? "source metadata" : "",
      noteDirty ? "note" : "",
    ]
      .filter(Boolean)
      .join(" and ");
    const choice = await ask(
      "Unsaved changes",
      `Save changes to ${names} before continuing?`,
      ["Save changes", "Discard", "Stay"],
    );
    if (choice === "Stay") return false;
    if (choice === "Discard") return true;
    const result = await task(async () => {
      await applySource();
      await saveNote();
      return true;
    });
    return result === true;
  }
  function firstSource(next: Snapshot) {
    return [...next.catalog.sources].sort(compareSources)[0]?.id || "";
  }
  function resetSource(next: Snapshot, id: string) {
    const s = next.catalog.sources.find((s) => s.id === id);
    setInformationOpen(false);
    setSelected(s?.id || "");
    setEditingFields([]);
    const d = s ? sourceEdit(s) : null;
    setDraft(d);
    setBaseSource(d);
    setNote(null);
    setBaseNote(null);
    setBodyError("");
    setPreview(false);
    setActivePanel((panel) => (panel === "metadata" ? panel : null));
  }
  async function selectSource(id: string) {
    if (id === selected || !data || !(await guard())) return;
    await task(async () => {
      const next = await invoke("snapshot");
      setData(next);
      resetSource(next, id);
      setTagsOpen(false);
      setTagEdit(null);
    });
  }
  async function selectNote(id: string, showingPanel = false) {
    if (!id || (!showingPanel && !(await guard()))) return;
    await task(async () => {
      const next = await invoke("snapshot");
      const n = next.catalog.notes.find((n) => n.id === id);
      if (!n) return;
      setData(next);
      const s = next.catalog.sources.find((s) => s.id === selected);
      if (s && !showingPanel) {
        setEditingFields([]);
        const d = sourceEdit(s);
        setDraft(d);
        setBaseSource(d);
      }
      setPreview(true);
      setActivePanel("notes");
      setBodyError("");
      let body = "";
      try {
        body = await invoke("read_note", { id });
      } catch (e) {
        setBodyError(String(e));
        setError(String(e));
      }
      const d = {
        id: n.id,
        source_id: n.source_id,
        title: n.title,
        description: n.description,
        body,
      };
      setNote(d);
      setBaseNote(d);
    });
  }
  async function newNote() {
    if (!source || !(await guard())) return;
    await task(async () => {
      const next = await invoke("snapshot");
      setData(next);
      const s = next.catalog.sources.find((s) => s.id === selected)!;
      const d = sourceEdit(s);
      setDraft(d);
      setBaseSource(d);
      setEditingFields([]);
      setNote({
        id: null,
        source_id: selected,
        title: nextNoteTitle(
          next.catalog.notes.filter((n) => n.source_id === selected),
        ),
        description: "",
        body: "",
      });
      setBaseNote(null);
      setBodyError("");
      setActivePanel("notes");
      setPreview(false);
    });
  }
  async function removeNote() {
    if (!note) return;
    const choice = await ask(
      note.id ? "Delete note permanently?" : "Discard new note?",
      note.id
        ? `“${note.title || note.id}” and its Markdown body will be permanently deleted, including unsaved edits. The source file will not change.`
        : "This unsaved note will be discarded.",
      [note.id ? "Delete permanently" : "Discard", "Cancel"],
    );
    if (choice === "Cancel") return;
    await task(async () => {
      if (note.id) {
        const next = await invoke("delete_note", { id: note.id });
        setData(next);
      }
      setNote(null);
      setBaseNote(null);
      setBodyError("");
      setStatus("Note removed");
    });
  }
  async function runRefresh() {
    if (!(await guard())) return;
    await task(async () => {
      setStatus("Reading and hashing source files…");
      const [next, result] = await invoke("refresh");
      setData(next);
      resetSource(
        next,
        next.catalog.sources.some((s) => s.id === selected)
          ? selected
          : firstSource(next),
      );
      setRevision((v) => v + 1);
      setStatus(refreshMessage(result));
    });
  }
  useNativeLifecycle({
    onError: setError,
    onProgress: (count, path) => setStatus(`Hashing ${count} · ${path}`),
    onClose: async () => {
      await transition(async () => {
        if (await guard()) await getCurrentWindow().destroy();
      });
    },
    onStart: async (active) => {
      taskRunning.current = true;
      setBusy(true);
      try {
        let next = await invoke("snapshot");
        if (!active()) return;
        if (window.__INITIAL_SCAN__) {
          const result = await invoke("refresh");
          if (!active()) return;
          next = result[0];
          setStatus(refreshMessage(result[1]));
        }
        setData(next);
        resetSource(next, firstSource(next));
        await invoke("renderer_ready");
      } finally {
        if (active()) {
          taskRunning.current = false;
          setBusy(false);
        }
      }
    },
  });
  async function openFolder() {
    if (!(await guard())) return;
    await task(async () => {
      const path = await invoke("choose_folder");
      if (path) await invoke("switch_folder", { path });
    });
  }
  async function editTagChoice(
    tag?: Tag,
    target: "source" | "manager" = "manager",
  ) {
    if (
      tagDirty &&
      (await ask("Unsaved tag changes", "Discard this tag draft?", [
        "Discard",
        "Stay",
      ])) !== "Discard"
    )
      return;
    if (!tag) setTagCreateTarget(target);
    const d = {
      id: tag?.id || null,
      name: tag?.name || "",
      parent_id: tag?.parent_id ?? null,
      description: tag?.description || "",
    };
    setTagEdit(d);
    setTagBase(d);
  }
  async function cancelTagEdit(): Promise<boolean> {
    if (
      !tagDirty ||
      (await ask("Unsaved tag changes", "Discard this tag draft?", [
        "Discard",
        "Stay",
      ])) === "Discard"
    ) {
      setTagEdit(null);
      setTagBase(null);
      return true;
    }
    return false;
  }
  async function closeTags() {
    if (await cancelTagEdit()) setTagsOpen(false);
  }
  async function deleteTag(tag: Tag) {
    const id = tag.id;
    const impact = await task(() => invoke("preview_tag_deletion", { id }));
    if (!impact) return;
    if (
      (await ask(
        "Delete tag globally?",
        `Delete “${tag.name}”? Remove assignments from ${impact.affected_sources} source(s) and move ${impact.detached_children} direct child tag(s) to the root. Descendants and their assignments remain.${tagDirty && tagEdit?.id === id ? " Unsaved edits to this tag will be discarded." : ""}`,
        ["Delete", "Cancel"],
      )) !== "Delete"
    )
      return;
    await task(async () => {
      const next = await invoke("delete_tag", { id });
      setData(next);
      setDraft((current) =>
        current
          ? { ...current, tag_ids: current.tag_ids.filter((t) => t !== id) }
          : current,
      );
      setBaseSource((current) =>
        current
          ? { ...current, tag_ids: current.tag_ids.filter((t) => t !== id) }
          : current,
      );
      removeRecentTag(next.root, id);
      const reconcileTag = (current: TagEdit | null) =>
        current?.id === id
          ? null
          : current
            ? {
                ...current,
                parent_id: current.parent_id === id ? null : current.parent_id,
              }
            : null;
      setTagEdit(reconcileTag);
      setTagBase(reconcileTag);
      setStatus("Tag deleted");
    });
  }
  async function saveTag() {
    if (!tagEdit) return;
    await task(async () => {
      const next = await invoke("edit_tag", { edit: tagEdit });
      setData(next);
      if (!tagEdit.id && tagCreateTarget === "source" && draft) {
        const created = next.catalog.tags.find(
          (tag) => !data!.catalog.tags.some((old) => old.id === tag.id),
        );
        if (created) {
          assignTags([...draft.tag_ids, created.id]);
        }
      }
      setTagEdit(null);
      setTagBase(null);
      setStatus("Tag saved");
    });
  }
  function assignTags(ids: string[]) {
    if (!draft || !data) return;
    const next = [...new Set(ids)];
    recordRecentTags(
      data.root,
      next.filter((id) => !draft.tag_ids.includes(id)),
    );
    setDraft({ ...draft, tag_ids: next });
  }
  const ordered = [...(data?.catalog.sources || [])].sort(compareSources);
  return (
    <div className="app">
      <header className="appbar" data-tauri-drag-region>
        <div className="app-brand" data-tauri-drag-region>
          <img
            data-tauri-drag-region
            className="brand-mark"
            src={appIcon}
            alt=""
          />
          <strong className="app-title" data-tauri-drag-region>
            File Manager
          </strong>
        </div>
        <span className="spacer" data-tauri-drag-region />
        <WindowControls onError={setError} />
      </header>
      <Notifications notices={notices} dismiss={dismiss} />
      <div className="workspace">
        <SourceList
          ordered={ordered}
          selected={selected}
          busy={busy}
          visibleSourceWidth={visibleSourceWidth}
          sourceWidth={sourceWidth}
          hasVault={!!data}
          onSelect={(id) => void transition(() => selectSource(id))}
          onOpen={() => void transition(openFolder)}
          onRefresh={() => void transition(runRefresh)}
          onManageTags={() => setTagsOpen(true)}
        />
        <ResizeHandle
          label="Resize source files"
          className={`source-resize-handle ${sourceWidth === 0 ? "collapsed" : ""}`}
          width={visibleSourceWidth}
          direction={1}
          onResize={resizeSource}
          collapsed={sourceWidth === 0}
        />

        {sourceWidth === 0 && (
          <button
            className="expand-sources"
            aria-label="Expand source files"
            title="Expand source files"
            onClick={() =>
              setSourceWidth(defaultSourceWidth(window.innerWidth))
            }
          >
            <Icon name="chevron" />
          </button>
        )}
        <main className="content">
          {source ? (
            <>
              <SourceHeader
                source={source}
                busy={busy}
                notesOpen={notesOpen}
                details={details}
                noteDirty={noteDirty}
                sourceDirty={sourceDirty}
                onOpenSource={() =>
                  void task(() => invoke("open_source", { id: selected }))
                }
                onNotes={() => {
                  if (notesOpen) setActivePanel(null);
                  else if (!note && sourceNotes.length)
                    void transition(() => selectNote(sourceNotes[0].id, true));
                  else setActivePanel("notes");
                }}
                onDetails={() => setActivePanel(details ? null : "metadata")}
              />
              <div className="document-space">
                {source.observation.availability !== "present" ? (
                  <div className="empty-content">
                    <span className="empty-symbol">◇</span>
                    <h2>Source {source.observation.availability}</h2>
                    <p>Your metadata and notes are still here.</p>
                    <p>Restore the original file in Explorer, then refresh.</p>
                  </div>
                ) : extension(source.path) === "pdf" ? (
                  <PdfViewer
                    id={source.id}
                    revision={revision}
                    onError={setError}
                  />
                ) : ["md", "markdown", "txt"].includes(
                    extension(source.path),
                  ) ? (
                  <TextSourceViewer
                    key={source.id}
                    id={source.id}
                    revision={revision}
                    markdown={extension(source.path) !== "txt"}
                    onError={setError}
                  />
                ) : (
                  <div className="empty-content">
                    <span className="empty-symbol">▤</span>
                    <h2>No embedded preview</h2>
                    <p>
                      Use Open file to view this source in its default
                      application.
                    </p>
                    <p>You can still add metadata and reading notes here.</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="empty-content">
              <span className="empty-symbol">▤</span>
              <h1>A place for your understanding.</h1>
              <p>Select a source file to start reading and taking notes.</p>
            </div>
          )}
        </main>
        {source && details && draft && (
          <SourceMetadataPanel
            source={source}
            draft={draft}
            busy={busy}
            sourceDirty={sourceDirty}
            editingFields={editingFields}
            setEditingFields={setEditingFields}
            setDraft={setDraft}
            panelWidth={panelWidth}
            onResize={resizeRight}
            onClose={() => setActivePanel(null)}
            vault={data!.root}
            tags={data!.catalog.tags}
            onOpenUrl={() =>
              void task(() => invoke("open_url", { id: selected }))
            }
            onAssignTags={assignTags}
            onCreateTag={() =>
              void transition(() => editTagChoice(undefined, "source"))
            }
            onManageTags={() => setTagsOpen(true)}
            onReset={() => {
              const d = sourceEdit(source);
              setDraft(d);
              setBaseSource(d);
              setEditingFields([]);
            }}
            onApply={() => void task(applySource)}
          />
        )}
        {source && notesOpen && (
          <NotesPanel
            note={note}
            sourceNotes={sourceNotes}
            busy={busy}
            noteDirty={noteDirty}
            bodyError={bodyError}
            preview={preview}
            setPreview={setPreview}
            setNote={setNote}
            panelWidth={panelWidth}
            onResize={resizeRight}
            onClose={() => setActivePanel(null)}
            onSelectNote={(id) => void transition(() => selectNote(id))}
            onNewNote={() => void transition(newNote)}
            onRemoveNote={() => void transition(removeNote)}
            onInformation={() => setInformationOpen(true)}
            onSaveNote={() => void task(saveNote)}
          />
        )}
      </div>
      {informationOpen && note && (
        <InformationDialog onClose={() => setInformationOpen(false)}>
          <div className="information-fields">
            <label>
              <strong className="metadata-label">Description</strong>
              <textarea
                aria-label="Note description"
                rows={2}
                value={note.description}
                disabled={busy}
                onChange={(e) =>
                  setNote({ ...note, description: e.target.value })
                }
              />
            </label>
            {(
              [
                ["created_at", "Created"],
                ["modified_at", "Modified"],
              ] as const
            ).map(([field, label]) => (
              <div className="metadata-field" key={field}>
                <strong className="metadata-label">{label}</strong>
                <div className="metadata-value">
                  {note.id
                    ? date(
                        sourceNotes.find((n) => n.id === note.id)?.[field] ||
                          "",
                      )
                    : "Not saved"}
                </div>
              </div>
            ))}
          </div>
          <div className="note-file-size">
            <strong className="metadata-label">File size</strong>
            <span
              title={
                note.id && data?.note_sizes[note.id] != null
                  ? data.note_sizes[note.id] + " bytes"
                  : undefined
              }
            >
              {note.id ? fileSize(data?.note_sizes[note.id]) : "Not saved"}
            </span>
            {noteDirty && note.id && <span> (saved file)</span>}
          </div>
          <p className="information-hint">
            Description changes are kept in your draft. Use Save note to save
            them.
          </p>
        </InformationDialog>
      )}
      {tagsOpen && data && (
        <TagManagerDialog
          busy={busy}
          tags={data.catalog.tags}
          sources={data.catalog.sources}
          closeTags={() => void transition(closeTags)}
          editTagChoice={(tag) => void transition(() => editTagChoice(tag))}
          deleteTag={(tag) => void transition(() => deleteTag(tag))}
        />
      )}
      {tagEdit && data && (
        <TagEditorDialog
          key={tagEdit.id || "new"}
          draft={tagEdit}
          tags={data.catalog.tags}
          busy={busy}
          dirty={tagDirty}
          setDraft={setTagEdit}
          addToSource={tagCreateTarget === "source"}
          onSave={() => void saveTag()}
          onClose={() =>
            void transition(async () => {
              await cancelTagEdit();
            })
          }
        />
      )}
      {decision && (
        <ModalShell
          shadeClass="decision-shade"
          role="alertdialog"
          label={decision.heading}
        >
          <h2>{decision.heading}</h2>
          <p>{decision.text}</p>
          <div className="dialog-actions">
            {decision.choices.map((choice, i) => (
              <button
                key={choice}
                className={i === 0 ? "primary" : ""}
                onClick={() => {
                  setDecision(null);
                  decision.resolve(choice);
                }}
              >
                {choice}
              </button>
            ))}
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function refreshMessage(result: import("../domain/types").Summary) {
  return `Refresh complete · ${result.added} added · ${result.moved} moved · ${result.missing} missing${result.warnings.length ? "\n" + result.warnings.join("\n") : ""}`;
}
