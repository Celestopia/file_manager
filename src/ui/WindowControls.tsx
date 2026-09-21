import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { Icon } from "./Icons";
export function WindowControls({
  onError,
}: {
  onError: (error: string) => void;
}) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const update = () =>
      getCurrentWindow()
        .isMaximized()
        .then((value) => {
          if (!disposed) setMaximized(value);
        })
        .catch((error) => {
          if (!disposed) onError(String(error));
        });
    void update();
    void getCurrentWindow()
      .onResized(() => void update())
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((error) => {
        if (!disposed) onError(String(error));
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onError]);
  const run = (action: () => Promise<void>) =>
    void action().catch((error) => onError(String(error)));
  return (
    <div className="window-controls">
      <button
        aria-label="Minimize window"
        title="Minimize"
        onClick={() => run(() => getCurrentWindow().minimize())}
      >
        <Icon name="minimize" />
      </button>
      <button
        aria-label={maximized ? "Restore window" : "Maximize window"}
        title={maximized ? "Restore" : "Maximize"}
        onClick={() => run(() => getCurrentWindow().toggleMaximize())}
      >
        <Icon name={maximized ? "restore" : "maximize"} />
      </button>
      <button
        className="window-close"
        aria-label="Close window"
        title="Close"
        onClick={() => run(() => getCurrentWindow().close())}
      >
        <Icon name="close" />
      </button>
    </div>
  );
}
