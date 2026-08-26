"use client";

import { useEffect, useRef, useState } from "react";

export function useExamLockdown(onViolation: (reason: string) => void) {
  const [fullscreen, setFullscreen] = useState(false);
  const violationsRef = useRef(0);

  useEffect(() => {
    const report = (reason: string) => {
      violationsRef.current += 1;
      onViolation(reason);
    };

    const onVisibility = () => {
      if (document.hidden) report("Tab switch detected");
    };
    const onBlur = () => report("Window focus lost");
    const onCopy = (e: ClipboardEvent) => { e.preventDefault(); report("Copy attempted"); };
    const onPaste = (e: ClipboardEvent) => { e.preventDefault(); report("Paste attempted"); };
    const onContextMenu = (e: MouseEvent) => { e.preventDefault(); report("Right-click attempted"); };
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [onViolation]);

  async function enterFullscreen() {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      onViolation("Fullscreen unavailable");
    }
  }

  return { fullscreen, enterFullscreen, violations: violationsRef.current };
}
