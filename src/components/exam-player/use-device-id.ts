"use client";

import { useSyncExternalStore } from "react";

const KEY = "cibiti:device-id";
let memoryId: string | null = null;

function randomId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// A per-browser identifier. It is not a security boundary; it lets the server notice when an
// attempt suddenly continues on a different computer and ask an invigilator to approve the move.
function getSnapshot(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    memoryId ??= randomId();
    return memoryId;
  }
}

const subscribe = () => () => {};

export function useDeviceId(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
