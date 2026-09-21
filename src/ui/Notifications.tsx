import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icons";
export const NOTIFICATION_TIMEOUT_MS = 5000;
type Notice = { channel: "status" | "error"; text: string };
export function useNotifications() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const dismiss = useCallback(
    (channel: Notice["channel"]) =>
      setNotices((current) =>
        current.filter((item) => item.channel !== channel),
      ),
    [],
  );
  const update = useCallback((channel: Notice["channel"], text: string) => {
    setNotices((current) => [
      ...current.filter((item) => item.channel !== channel),
      ...(text ? [{ channel, text }] : []),
    ]);
  }, []);
  const setStatus = useCallback(
    (text: string) => update("status", text),
    [update],
  );
  const setError = useCallback(
    (text: string) => update("error", text),
    [update],
  );
  return { notices, dismiss, setStatus, setError };
}
function Banner({
  notice,
  dismiss,
}: {
  notice: Notice;
  dismiss: (channel: Notice["channel"]) => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(
      () => dismiss(notice.channel),
      NOTIFICATION_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [notice, dismiss]);
  return (
    <div
      className={`notification notification-${notice.channel}`}
      role={notice.channel === "error" ? "alert" : "status"}
      aria-atomic="true"
    >
      <div className="notification-text">{notice.text}</div>
      <button
        className="icon-button"
        aria-label={
          notice.channel === "error" ? "Dismiss error" : "Dismiss notification"
        }
        title="Dismiss"
        onClick={() => dismiss(notice.channel)}
      >
        <Icon name="close" />
      </button>
    </div>
  );
}
export function Notifications({
  notices,
  dismiss,
}: Pick<ReturnType<typeof useNotifications>, "notices" | "dismiss">) {
  return (
    <div className="notifications" aria-label="Notifications">
      {notices.map((notice) => (
        <Banner key={notice.channel} notice={notice} dismiss={dismiss} />
      ))}
    </div>
  );
}
