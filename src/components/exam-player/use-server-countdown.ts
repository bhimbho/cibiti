"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Milliseconds left until the server deadline, corrected for the difference between this
 * computer's clock and the server's (lab PCs often have the wrong time).
 */
export function useServerCountdown(deadlineAt: string | null, clockOffsetMs: number, onExpire: () => void): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    if (!deadlineAt) return;
    const deadline = Date.parse(deadlineAt);
    let fired = false;
    const id = setInterval(() => {
      const ms = Math.max(0, deadline - (Date.now() + clockOffsetMs));
      setRemaining(ms);
      if (ms === 0 && !fired) {
        fired = true;
        onExpireRef.current();
      }
    }, 250);
    return () => clearInterval(id);
  }, [deadlineAt, clockOffsetMs]);

  return deadlineAt ? remaining : null;
}

export function formatDuration(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
