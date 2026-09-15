export type AttemptItemState = {
  id: string;
  order: number;
  sectionId: string | null;
  type: string;
  content: { text?: string; assetIds?: string[] };
  view: unknown;
  points: number;
  response: { value: unknown; revision: number; flagged: boolean; timeSpentMs: number } | null;
};

export type InProgressAttempt = {
  id: string;
  status: "IN_PROGRESS";
  examId: string;
  examTitle: string;
  serverNow: string;
  instructions: string | null;
  navigation: "FREE" | "LINEAR";
  deadlineAt: string | null;
  integrityLevel: number;
  sections: { id: string; title: string; instructions: string | null }[];
  items: AttemptItemState[];
};

export type ClosedAttempt = {
  id: string;
  status: "SUBMITTED" | "GRADED" | "VOIDED";
  examId: string;
  examTitle: string;
  serverNow: string;
  submittedAt: string | null;
  submissionType: "CANDIDATE" | "TIME_EXPIRED" | "INVIGILATOR" | null;
  result: { score: number | null; maxScore: number; percent: number | null; passed: boolean | null } | null;
  awaitingGrading: boolean;
};

export type AttemptState = InProgressAttempt | ClosedAttempt;

export type ApiError = { error?: string; details?: { code?: string } };
