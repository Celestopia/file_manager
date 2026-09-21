import { useSyncExternalStore } from "react";

const changed = "file-manager:tag-history";
function read(vault: string) {
  try {
    return localStorage.getItem(`recent-tags:${vault}`) || "[]";
  } catch {
    return "[]";
  }
}
function decode(value: string): string[] {
  try {
    const ids: unknown = JSON.parse(value);
    return Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === "string").slice(0, 3)
      : [];
  } catch {
    return [];
  }
}
export function recordRecentTags(vault: string, added: string[]) {
  if (!added.length) return;
  const ids = [
    ...new Set([...added].reverse().concat(decode(read(vault)))),
  ].slice(0, 3);
  try {
    localStorage.setItem(`recent-tags:${vault}`, JSON.stringify(ids));
  } catch {
    /* Optional UI history; saving metadata does not depend on it. */
  }
  window.dispatchEvent(new Event(changed));
}
function subscribe(notify: () => void) {
  window.addEventListener(changed, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(changed, notify);
    window.removeEventListener("storage", notify);
  };
}
export function useRecentTags(vault: string) {
  return decode(useSyncExternalStore(subscribe, () => read(vault)));
}
