"use client";

import type { PlayerProps } from "../player-types";

export function ShortAnswerPlayer({ view, value, onChange, name, labelledBy, disabled }: PlayerProps) {
  const { maxLength, placeholder } = view as { maxLength: number; placeholder?: string };
  const text = (value as { text?: string } | null)?.text ?? "";

  return (
    <div className="take-short-answer">
      <input
        className="take-text-input"
        name={name}
        aria-labelledby={labelledBy}
        value={text}
        maxLength={maxLength}
        placeholder={placeholder ?? "Type your answer"}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value ? { text: event.target.value } : null)}
      />
      <span className="take-hint">{text.length} / {maxLength}</span>
    </div>
  );
}
