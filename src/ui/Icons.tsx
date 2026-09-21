import type { SVGProps } from "react";
export type IconName =
  | "chevron"
  | "trash"
  | "pencil"
  | "tag"
  | "plus"
  | "minimize"
  | "maximize"
  | "restore"
  | "details"
  | "open"
  | "notes"
  | "settings"
  | "folder"
  | "refresh"
  | "close";
export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {name === "details" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6" />
          <circle cx="12" cy="16.5" r=".8" fill="currentColor" stroke="none" />
        </>
      )}
      {name === "open" && (
        <>
          <path d="M14 3h7v7M21 3l-11 11" />
          <path d="M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
        </>
      )}
      {name === "notes" && (
        <>
          <rect x="5" y="3" width="15" height="18" rx="2" />
          <path d="M3 7h4M3 12h4M3 17h4M10 8h6M10 12h6M10 16h4" />
        </>
      )}
      {name === "settings" && (
        <>
          <path d="m10 3-.6 2.2-1.6.9-2.2-.6-2 3.5 1.6 1.6v1.8L3.6 14l2 3.5 2.2-.6 1.6.9.6 2.2h4l.6-2.2 1.6-.9 2.2.6 2-3.5-1.6-1.6v-1.8L20.4 9l-2-3.5-2.2.6-1.6-.9L14 3Z" />
          <circle cx="12" cy="11.5" r="3" />
        </>
      )}
      {name === "folder" && (
        <path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      )}
      {name === "refresh" && (
        <>
          <path d="M20 7v5h-5M4 17v-5h5" />
          <path d="M6.2 6.2A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.8 5.8" />
        </>
      )}
      {name === "pencil" && <path d="m4 16-1 5 5-1L20 8l-4-4ZM14 6l4 4" />}
      {name === "tag" && (
        <>
          <path d="M3 3h8l10 10-8 8L3 11Z" />
          <circle cx="7.5" cy="7.5" r=".8" />
        </>
      )}
      {name === "chevron" && <path d="m9 6 6 6-6 6" />}
      {name === "plus" && <path d="M5 12h14M12 5v14" />}
      {name === "minimize" && <path d="M5 12h14" />}
      {name === "maximize" && (
        <rect x="5" y="5" width="14" height="14" rx="1" />
      )}
      {name === "restore" && (
        <>
          <path d="M8 5V3h13v13h-2" />
          <rect x="4" y="7" width="13" height="13" rx="1" />
        </>
      )}
      {name === "trash" && (
        <>
          <path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />
        </>
      )}
      {name === "close" && <path d="m6 6 12 12M18 6 6 18" />}
    </svg>
  );
}
