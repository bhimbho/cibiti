"use client";

import type { ComponentType } from "react";
import type { PlayerProps } from "./player-types";
import { SingleChoicePlayer } from "./single-choice/player";
import { MultipleResponsePlayer } from "./multiple-response/player";
import { ShortAnswerPlayer } from "./short-answer/player";

// True/false candidate views have the same shape as single choice.
const players: Record<string, ComponentType<PlayerProps>> = {
  "single-choice": SingleChoicePlayer,
  "true-false": SingleChoicePlayer,
  "multiple-response": MultipleResponsePlayer,
  "short-answer": ShortAnswerPlayer,
};

export function ItemPlayer({ type, ...props }: PlayerProps & { type: string }) {
  const Player = players[type];
  if (!Player) return <p className="take-error">This question type cannot be displayed. Please tell the invigilator.</p>;
  return <Player {...props} />;
}

/** Whether a stored response counts as answered, for the question palette. */
export function hasAnswer(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== "object") return true;
  const v = value as { optionId?: string; optionIds?: string[]; text?: string };
  if ("optionIds" in v) return Boolean(v.optionIds?.length);
  if ("text" in v) return Boolean(v.text?.trim());
  if ("optionId" in v) return Boolean(v.optionId);
  return true;
}
