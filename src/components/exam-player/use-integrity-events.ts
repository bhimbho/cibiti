"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ClientEvent = { type: string; clientAt: string; payload?: Record<string, unknown> };

/**
 * Integrity events are always recorded for later review (level 0 = passive logging).
 * Only when the exam runs at level 1 or above are actions blocked and the candidate warned.
 */
export function useIntegrityEvents({ attemptId, deviceId, level }: { attemptId: string; deviceId: string; level: number }) {
  const queue = useRef<ClientEvent[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const enforce = level >= 1;

  useEffect(() => {
    const push = (type: string, payload?: Record<string, unknown>, message?: string) => {
      queue.current.push({ type, clientAt: new Date().toISOString(), payload });
      if (enforce && message) setWarning(message);
    };

    const flush = (keepalive = false) => {
      if (queue.current.length === 0) return;
      const events = queue.current.splice(0, 50);
      fetch(`/api/attempts/${attemptId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, events }),
        keepalive,
      })
        .then((res) => {
          // Closed attempts and device conflicts cannot accept events; drop them.
          if (!res.ok && res.status >= 500) queue.current.unshift(...events);
        })
        .catch(() => queue.current.unshift(...events));
    };

    let blurredAt: number | null = null;
    const onBlur = () => {
      blurredAt = Date.now();
      push("focus.lost", undefined, "You left the exam window. This has been recorded.");
    };
    const onFocus = () => {
      if (blurredAt) push("focus.returned", { awayMs: Date.now() - blurredAt });
      blurredAt = null;
    };
    const onVisibility = () => push(document.hidden ? "visibility.hidden" : "visibility.visible");
    const onFullscreen = () => {
      const active = Boolean(document.fullscreenElement);
      setFullscreen(active);
      push(active ? "fullscreen.entered" : "fullscreen.exited", undefined, active ? undefined : "You left fullscreen. Return to fullscreen to continue.");
    };
    const clipboard = (type: "copy" | "paste" | "cut") => (event: ClipboardEvent) => {
      if (enforce) event.preventDefault();
      push(`clipboard.${type}`, undefined, `${type[0].toUpperCase()}${type.slice(1)} is not allowed during this exam.`);
    };
    const onCopy = clipboard("copy");
    const onPaste = clipboard("paste");
    const onCut = clipboard("cut");
    const onContextMenu = (event: MouseEvent) => {
      if (enforce) event.preventDefault();
      push("contextmenu.opened");
    };
    const onOffline = () => push("network.offline");
    const onOnline = () => {
      push("network.online");
      flush();
    };
    const onBeforePrint = () => push("print.attempted", undefined, "Printing is not allowed during this exam.");
    const onPageHide = () => flush(true);

    if ((window.screen as Screen & { isExtended?: boolean }).isExtended) push("screen.extended");

    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("cut", onCut);
    document.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("pagehide", onPageHide);
    const interval = setInterval(flush, 5000);

    return () => {
      flush(true);
      clearInterval(interval);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [attemptId, deviceId, enforce]);

  const requestFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      setWarning("This browser could not enter fullscreen. Please tell the invigilator.");
    }
  }, []);

  return { warning, dismissWarning: () => setWarning(null), fullscreen, requestFullscreen, enforce };
}
