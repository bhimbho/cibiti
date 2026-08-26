"use client";

import { useEffect, useRef, useState } from "react";

export function useCountdown(seconds: number | null, onExpire: () => void) {
  const [remaining, setRemaining] = useState<number | null>(seconds);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (seconds == null) { setRemaining(null); return; }
    setRemaining(seconds);
    const interval = setInterval(() => {
      setRemaining((current) => {
        if (current == null) return current;
        if (current <= 1) {
          clearInterval(interval);
          onExpireRef.current();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [seconds]);

  return remaining;
}

export function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
