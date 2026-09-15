"use client";

import { optionKey, type CandidateOption, type PlayerProps } from "../player-types";

export function SingleChoicePlayer({ view, value, onChange, name, labelledBy, disabled }: PlayerProps) {
  const { options } = view as { options: CandidateOption[] };
  const selected = (value as { optionId?: string } | null)?.optionId;

  return (
    <div className="take-options" role="radiogroup" aria-labelledby={labelledBy}>
      {options.map((option, index) => (
        <label className="take-option" key={option.id} data-option-index={index}>
          <input
            type="radio"
            name={name}
            value={option.id}
            checked={selected === option.id}
            disabled={disabled}
            onChange={() => onChange({ optionId: option.id })}
          />
          <span className="option-key" aria-hidden="true">{optionKey(index)}</span>
          <span className="option-text">{option.text}</span>
        </label>
      ))}
      {selected && !disabled && (
        <button type="button" className="clear-answer" onClick={() => onChange(null)}>
          Clear answer
        </button>
      )}
    </div>
  );
}
