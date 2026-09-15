"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "cibiti:local-storage";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

/**
 * A per-browser preference (column visibility, density). Renders the fallback on the server and
 * during hydration, then the stored value, so markup never mismatches.
 */
export function useLocalStorage<T>(key: string, fallback: T): [T, (value: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );

  let value = fallback;
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = fallback;
    }
  }

  const setValue = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(next));
        window.dispatchEvent(new Event(EVENT));
      } catch {
        // Storage blocked; the preference just won't persist.
      }
    },
    [key],
  );

  return [value, setValue];
}
