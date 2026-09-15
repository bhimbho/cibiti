"use client";

import { ArrowDown, ArrowUp, Pin, Plus, Trash2 } from "lucide-react";
import { newOptionId } from "@/items/defaults";
import { optionKey } from "@/items/player-types";

type Option = { id: string; text: string; assetId?: string; pinned?: boolean };
type Bag = Record<string, unknown>;
type FieldsProps = { interaction: Bag; scoring: Bag; onChange: (interaction: Bag, scoring: Bag) => void };

function OptionList({ interaction, scoring, onChange, multiple }: FieldsProps & { multiple: boolean }) {
  const options = (interaction.options as Option[]) ?? [];
  const correct = multiple ? ((scoring.correctOptionIds as string[]) ?? []) : [scoring.correctOptionId as string];

  const setOptions = (next: Option[], nextScoring: Bag = scoring) => onChange({ ...interaction, options: next }, nextScoring);

  const toggleCorrect = (id: string) => {
    if (!multiple) return onChange(interaction, { ...scoring, correctOptionId: id });
    const ids = correct.includes(id) ? correct.filter((c) => c !== id) : [...correct, id];
    onChange(interaction, { ...scoring, correctOptionIds: ids });
  };

  const remove = (id: string) => {
    const next = options.filter((o) => o.id !== id);
    if (multiple) setOptions(next, { ...scoring, correctOptionIds: correct.filter((c) => c !== id) });
    else setOptions(next, scoring.correctOptionId === id ? { ...scoring, correctOptionId: next[0]?.id ?? "" } : scoring);
  };

  const move = (index: number, delta: number) => {
    const next = [...options];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOptions(next);
  };

  return (
    <fieldset className="editor-fieldset">
      <legend>Options <span className="field-hint">{multiple ? "Tick every correct option" : "Choose the correct option"}</span></legend>
      {options.map((option, index) => (
        <div className={`option-row ${correct.includes(option.id) ? "correct" : ""}`} key={option.id}>
          <label className="option-correct" title="Correct answer">
            <input
              type={multiple ? "checkbox" : "radio"}
              name="correct-option"
              checked={correct.includes(option.id)}
              onChange={() => toggleCorrect(option.id)}
              aria-label={`Mark option ${optionKey(index)} correct`}
            />
            <span className="option-key">{optionKey(index)}</span>
          </label>
          <input
            className="option-input"
            value={option.text}
            placeholder={`Option ${optionKey(index)}`}
            onChange={(e) => setOptions(options.map((o) => (o.id === option.id ? { ...o, text: e.target.value } : o)))}
          />
          <button type="button" className={`icon-btn ${option.pinned ? "pinned" : ""}`} aria-pressed={Boolean(option.pinned)} aria-label="Keep position when shuffled" title="Keep position when shuffled (e.g. None of the above)" onClick={() => setOptions(options.map((o) => (o.id === option.id ? { ...o, pinned: !o.pinned } : o)))}>
            <Pin size={14} />
          </button>
          <button type="button" className="icon-btn" aria-label="Move up" onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp size={14} /></button>
          <button type="button" className="icon-btn" aria-label="Move down" onClick={() => move(index, 1)} disabled={index === options.length - 1}><ArrowDown size={14} /></button>
          <button type="button" className="icon-btn icon-btn--danger" aria-label="Remove option" onClick={() => remove(option.id)} disabled={options.length <= 2}><Trash2 size={14} /></button>
        </div>
      ))}
      <button type="button" className="outline-button add-row" onClick={() => setOptions([...options, { id: newOptionId(), text: "" }])} disabled={options.length >= 12}>
        <Plus size={14} /> Add option
      </button>
    </fieldset>
  );
}

export function SingleChoiceFields(props: FieldsProps) {
  return (
    <>
      <OptionList {...props} multiple={false} />
      <label>
        Negative marking penalty <span className="field-hint">Fraction of marks deducted for a wrong answer, when the exam uses negative marking</span>
        <select value={String(props.scoring.penalty ?? 0.25)} onChange={(e) => props.onChange(props.interaction, { ...props.scoring, penalty: Number(e.target.value) })}>
          <option value="0">None</option>
          <option value="0.25">¼ of the marks</option>
          <option value="0.333">⅓ of the marks</option>
          <option value="0.5">½ of the marks</option>
          <option value="1">All of the marks</option>
        </select>
      </label>
    </>
  );
}

export function MultipleResponseFields(props: FieldsProps) {
  const { interaction, scoring, onChange } = props;
  return (
    <>
      <OptionList {...props} multiple />
      <div className="form-row">
        <label>
          Scoring
          <select value={String(scoring.mode ?? "partial")} onChange={(e) => onChange(interaction, { ...scoring, mode: e.target.value })}>
            <option value="all-or-nothing">All or nothing</option>
            <option value="partial">Partial credit</option>
            <option value="right-minus-wrong">Right minus wrong</option>
          </select>
        </label>
        <label>
          Maximum selections <span className="field-hint">Optional</span>
          <input
            type="number"
            min={1}
            max={12}
            value={(interaction.maxSelections as number | undefined) ?? ""}
            onChange={(e) => onChange({ ...interaction, maxSelections: e.target.value ? Number(e.target.value) : undefined }, scoring)}
          />
        </label>
      </div>
    </>
  );
}

export function TrueFalseFields({ interaction, scoring, onChange }: FieldsProps) {
  return (
    <>
      <fieldset className="editor-fieldset">
        <legend>Correct answer</legend>
        <div className="segmented">
          {(["true", "false"] as const).map((value) => (
            <label key={value} className={scoring.correct === value ? "on" : ""}>
              <input type="radio" name="tf-correct" checked={scoring.correct === value} onChange={() => onChange(interaction, { ...scoring, correct: value })} />
              {value === "true" ? String(interaction.trueLabel || "True") : String(interaction.falseLabel || "False")}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="form-row">
        <label>
          Label for true
          <input value={String(interaction.trueLabel ?? "")} maxLength={40} onChange={(e) => onChange({ ...interaction, trueLabel: e.target.value }, scoring)} />
        </label>
        <label>
          Label for false
          <input value={String(interaction.falseLabel ?? "")} maxLength={40} onChange={(e) => onChange({ ...interaction, falseLabel: e.target.value }, scoring)} />
        </label>
      </div>
    </>
  );
}

export function ShortAnswerFields({ interaction, scoring, onChange }: FieldsProps) {
  const answers = (scoring.acceptedAnswers as string[]) ?? [""];
  const setAnswers = (next: string[]) => onChange(interaction, { ...scoring, acceptedAnswers: next });

  return (
    <>
      <fieldset className="editor-fieldset">
        <legend>Accepted answers <span className="field-hint">Any of these is marked correct</span></legend>
        {answers.map((answer, index) => (
          <div className="option-row" key={index}>
            <input className="option-input" value={answer} placeholder="e.g. photosynthesis" onChange={(e) => setAnswers(answers.map((a, i) => (i === index ? e.target.value : a)))} />
            <button type="button" className="icon-btn icon-btn--danger" aria-label="Remove answer" onClick={() => setAnswers(answers.filter((_, i) => i !== index))} disabled={answers.length <= 1}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button type="button" className="outline-button add-row" onClick={() => setAnswers([...answers, ""])}>
          <Plus size={14} /> Add accepted answer
        </button>
      </fieldset>
      <div className="form-row">
        <label>
          Typos allowed
          <select value={String(scoring.maxTypos ?? 0)} onChange={(e) => onChange(interaction, { ...scoring, maxTypos: Number(e.target.value) })}>
            <option value="0">None (exact)</option>
            <option value="1">1 letter</option>
            <option value="2">2 letters</option>
          </select>
        </label>
        <label>
          Maximum length
          <input type="number" min={1} max={2000} value={Number(interaction.maxLength ?? 200)} onChange={(e) => onChange({ ...interaction, maxLength: Number(e.target.value) || 1 }, scoring)} />
        </label>
      </div>
      <div className="settings-list">
        <label className="check-label">
          <input type="checkbox" checked={Boolean(scoring.caseSensitive)} onChange={(e) => onChange(interaction, { ...scoring, caseSensitive: e.target.checked })} /> Case sensitive (e.g. chemical symbols)
        </label>
        <label className="check-label">
          <input type="checkbox" checked={Boolean(scoring.manualReviewUnmatched)} onChange={(e) => onChange(interaction, { ...scoring, manualReviewUnmatched: e.target.checked })} /> Send unmatched answers to a grader instead of marking them wrong
        </label>
      </div>
    </>
  );
}

export const typeFields: Record<string, (props: FieldsProps) => React.ReactNode> = {
  "single-choice": SingleChoiceFields,
  "multiple-response": MultipleResponseFields,
  "true-false": TrueFalseFields,
  "short-answer": ShortAnswerFields,
};
