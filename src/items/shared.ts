import { z } from "zod";
import type { Random, ScoreResult } from "./types";

export const optionSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().trim().max(2000),
  assetId: z.string().min(1).optional(),
  // Pinned options keep their position when options are shuffled ("None of the above").
  pinned: z.boolean().optional(),
});

export type ChoiceOption = z.infer<typeof optionSchema>;

export const optionListSchema = z
  .array(optionSchema)
  .min(2)
  .max(12)
  .refine((options) => new Set(options.map((o) => o.id)).size === options.length, "Option ids must be unique.")
  .refine((options) => options.every((o) => o.text.length > 0 || o.assetId), "Every option needs text or an image.");

export const optionOrderLayoutSchema = z.object({ optionOrder: z.array(z.string()) });
export type OptionOrderLayout = z.infer<typeof optionOrderLayoutSchema>;

export function shuffleInPlace<T>(items: T[], random: Random): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Shuffle option ids while keeping pinned options at their authored index. */
export function orderOptions(options: ChoiceOption[], shuffle: boolean, random: Random): string[] {
  if (!shuffle) return options.map((o) => o.id);
  const movable = shuffleInPlace(options.filter((o) => !o.pinned).map((o) => o.id), random);
  let next = 0;
  return options.map((o) => (o.pinned ? o.id : movable[next++]));
}

/** Options in delivered order, stripped to candidate-safe fields. Unknown ids are dropped. */
export function presentOptions(options: ChoiceOption[], order: string[]) {
  const byId = new Map(options.map((o) => [o.id, o]));
  return order.flatMap((id) => {
    const option = byId.get(id);
    return option ? [{ id: option.id, text: option.text, assetId: option.assetId }] : [];
  });
}

export function normalizeText(value: string, caseSensitive: boolean): string {
  const collapsed = value.trim().replace(/\s+/g, " ");
  return caseSensitive ? collapsed : collapsed.toLocaleLowerCase();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

export function roundPoints(points: number): number {
  return Math.round(points * 1000) / 1000;
}

export function unanswered(maxPoints: number): ScoreResult {
  return { points: 0, maxPoints, isCorrect: false, needsManualGrading: false, detail: { answered: false } };
}
