import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useLayoutEffect, useRef } from "react";

export function useNativeLifecycle(callbacks: {
  onProgress: (count: number, path: string) => void;
  onClose: () => Promise<void>;
  onStart: (active: () => boolean) => Promise<void>;
  onError: (error: string) => void;
}) {
  const latest = useRef(callbacks);
  useLayoutEffect(() => {
    latest.current = callbacks;
  });
  useEffect(() => {
    let disposed = false;
    const subscriptions: (() => void)[] = [];
    const fail = (error: unknown) => {
      if (!disposed) latest.current.onError(String(error));
    };
    const register = (promise: Promise<() => void>) => {
      void promise
        .then((fn) => {
          if (disposed) fn();
          else subscriptions.push(fn);
        })
        .catch(fail);
    };
    register(
      listen<[number, string]>("refresh-progress", (event) => {
        if (!disposed) latest.current.onProgress(...event.payload);
      }),
    );
    register(
      getCurrentWindow().onCloseRequested((event) => {
        event.preventDefault();
        if (!disposed) void latest.current.onClose().catch(fail);
      }),
    );
    void latest.current.onStart(() => !disposed).catch(fail);
    return () => {
      disposed = true;
      subscriptions.forEach((unsubscribe) => unsubscribe());
    };
  }, []);
}
