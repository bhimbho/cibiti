"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiError } from "./types";

export type ItemState = { value: unknown; flagged: boolean; revision: number; timeSpentMs: number };
export type SaveStatus = "idle" | "saving" | "saved" | "offline" | "locked" | "error";

type Options = {
  attemptId: string;
  deviceId: string;
  initial: Record<string, ItemState>;
  onClosed: () => void;
  onServerTime: (deadlineAt: string | null, serverNow: string) => void;
};

const storageKey = (attemptId: string) => `cibiti:attempt:${attemptId}:pending`;
const headers = { "Content-Type": "application/json" };

function readPending(attemptId: string): Record<string, ItemState> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(attemptId)) ?? "{}");
  } catch {
    return {};
  }
}

export function clearPendingAnswers(attemptId: string) {
  try {
    localStorage.removeItem(storageKey(attemptId));
  } catch {
    // Storage unavailable; nothing to clear.
  }
}

/**
 * Saves every answer change to the server within about a second. Unsaved changes survive a
 * network drop or page reload in local storage and are replayed with their revision numbers;
 * the server keeps whichever copy has the higher revision.
 */
export function useAutosave({ attemptId, deviceId, initial, onClosed, onServerTime }: Options) {
  const [boot] = useState(() => {
    const pending = readPending(attemptId);
    const items = { ...initial };
    const dirty: string[] = [];
    for (const [id, saved] of Object.entries(pending)) {
      if (items[id] && saved.revision > items[id].revision) {
        items[id] = saved;
        dirty.push(id);
      }
    }
    return { items, dirty };
  });

  const [items, setItems] = useState(boot.items);
  const [status, setStatus] = useState<SaveStatus>(boot.dirty.length ? "saving" : "idle");
  const itemsRef = useRef(boot.items);
  const dirty = useRef(new Set(boot.dirty));
  const inflight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retryDelay = useRef(2000);
  const callbacks = useRef({ onClosed, onServerTime });
  const flushRef = useRef<() => Promise<boolean>>(async () => true);

  useEffect(() => {
    callbacks.current = { onClosed, onServerTime };
  });

  const persist = useCallback(() => {
    try {
      const pending = Object.fromEntries([...dirty.current].map((id) => [id, itemsRef.current[id]]));
      if (Object.keys(pending).length) localStorage.setItem(storageKey(attemptId), JSON.stringify(pending));
      else localStorage.removeItem(storageKey(attemptId));
    } catch {
      // Storage full or blocked: answers still live in memory and on the server.
    }
  }, [attemptId]);

  useEffect(() => {
    itemsRef.current = items;
    persist();
  }, [items, persist]);

  const schedule = useCallback((ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), ms);
  }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    if (inflight.current) await inflight.current;
    if (dirty.current.size === 0) return true;

    const snapshot = [...dirty.current].map((itemId) => {
      const item = itemsRef.current[itemId];
      return { itemId, value: item.value, flagged: item.flagged, revision: item.revision, timeSpentMs: item.timeSpentMs };
    });

    const run = (async () => {
      setStatus("saving");
      try {
        const res = await fetch(`/api/attempts/${attemptId}/responses`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ deviceId, responses: snapshot }),
        });
        const data = (await res.json().catch(() => ({}))) as ApiError & {
          rejected?: { itemId: string }[];
          deadlineAt?: string | null;
          serverNow?: string;
        };

        if (res.ok) {
          for (const sent of snapshot) {
            if ((itemsRef.current[sent.itemId]?.revision ?? 0) <= sent.revision) dirty.current.delete(sent.itemId);
          }
          for (const rejected of data.rejected ?? []) dirty.current.delete(rejected.itemId);
          persist();
          retryDelay.current = 2000;
          if (data.serverNow) callbacks.current.onServerTime(data.deadlineAt ?? null, data.serverNow);
          setStatus(dirty.current.size ? "saving" : "saved");
          if (dirty.current.size) schedule(300);
          return true;
        }

        if (res.status === 409 && data.details?.code === "ATTEMPT_CLOSED") {
          dirty.current.clear();
          clearPendingAnswers(attemptId);
          callbacks.current.onClosed();
          return false;
        }
        if (res.status === 409 && data.details?.code === "DEVICE_LOCKED") {
          setStatus("locked");
          return false;
        }
        setStatus("error");
      } catch {
        setStatus("offline");
      }
      schedule(retryDelay.current);
      retryDelay.current = Math.min(retryDelay.current * 2, 15_000);
      return false;
    })();

    inflight.current = run;
    const ok = await run;
    inflight.current = null;
    return ok;
  }, [attemptId, deviceId, persist, schedule]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    const onOnline = () => void flushRef.current();
    window.addEventListener("online", onOnline);
    if (dirty.current.size) schedule(500);
    return () => {
      window.removeEventListener("online", onOnline);
      clearTimeout(timer.current);
    };
  }, [schedule]);

  const update = useCallback(
    (itemId: string, patch: Partial<Pick<ItemState, "value" | "flagged">>) => {
      setItems((prev) => {
        const current = prev[itemId];
        if (!current) return prev;
        dirty.current.add(itemId);
        return { ...prev, [itemId]: { ...current, ...patch, revision: current.revision + 1 } };
      });
      schedule(700);
    },
    [schedule],
  );

  /** Adds time spent on a question; synced lazily with the next save. */
  const addTime = useCallback(
    (itemId: string, ms: number) => {
      if (ms < 1000) return;
      setItems((prev) => {
        const current = prev[itemId];
        if (!current) return prev;
        dirty.current.add(itemId);
        return { ...prev, [itemId]: { ...current, timeSpentMs: current.timeSpentMs + ms, revision: current.revision + 1 } };
      });
      schedule(3000);
    },
    [schedule],
  );

  return { items, status, update, addTime, flush };
}
