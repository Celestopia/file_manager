import { invoke as nativeInvoke } from "@tauri-apps/api/core";
import type {
  NoteDraft,
  Snapshot,
  SourceEdit,
  Summary,
  TagEdit,
} from "../domain/types";

type Commands = {
  snapshot: [undefined, Snapshot];
  refresh: [undefined, [Snapshot, Summary]];
  edit_source: [{ edit: SourceEdit }, Snapshot];
  read_source_text: [{ id: string }, string];
  read_note: [{ id: string }, string];
  save_note: [
    { edit: NoteDraft & { body_changed: boolean } },
    [Snapshot, string],
  ];
  delete_note: [{ id: string }, Snapshot];
  edit_tag: [{ edit: TagEdit }, Snapshot];
  delete_tag: [{ id: string }, Snapshot];
  open_source: [{ id: string }, void];
  open_url: [{ id: string }, void];
  pdf_size: [{ id: string }, number];
  pdf_range: [{ id: string; begin: number; end: number }, ArrayBuffer];
  choose_folder: [undefined, string | null];
  switch_folder: [{ path: string }, void];
  renderer_ready: [undefined, void];
  smoke_result: [{ success: boolean; detail: string }, void];
};

export function invoke<C extends keyof Commands>(
  command: C,
  ...args: Commands[C][0] extends undefined ? [] : [Commands[C][0]]
): Promise<Commands[C][1]> {
  return args.length ? nativeInvoke(command, args[0]) : nativeInvoke(command);
}
