"use client";

import { optionKey, type CandidateOption, type PlayerProps } from "../player-types";

export function MultipleResponsePlayer({ view, value, onChange, name, labelledBy, disabled }: PlayerProps) {
  const { options, maxSelections } = view as { options: CandidateOption[]; minSelections?: number; maxSelections?: number };
  const selected = (value as { optionIds?: string[] } | null)?.optionIds ?? [];
  const atLimit = maxSelections !== undefined && selected.length >= maxSelections;

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
    onChange(next.length ? { optionIds: next } : null);
  }

  return (
    <div className="take-options" role="group" aria-labelledby={labelledBy}>
      <p className="take-hint">
        Select all that apply{maxSelections ? ` (up to ${maxSelections})` : ""}.
      </p>
      {options.map((option, index) => {
        const checked = selected.includes(option.id);
        return (
          <label className="take-option" key={option.id} data-option-index={index}>
            <input
              type="checkbox"
              name={name}
              value={option.id}
              checked={checked}
              disabled={disabled || (!checked && atLimit)}
              onChange={() => toggle(option.id)}
            />
            <span className="option-key" aria-hidden="true">{optionKey(index)}</span>
            <span className="option-text">{option.text}</span>
          </label>
        );
      })}
    </div>
  );
}
