export type PlayerProps = {
  /** Candidate-safe view produced by the item type's candidateView(). */
  view: unknown;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Unique per delivered item; used for input names. */
  name: string;
  labelledBy: string;
  disabled?: boolean;
};

export type CandidateOption = { id: string; text: string; assetId?: string };

export const optionKey = (index: number) => String.fromCharCode(65 + index);
