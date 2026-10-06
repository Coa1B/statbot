export type FinalAnswer = {
  answer: string;
  subject?: { name: string; subtitle?: string; image?: string };
  table?: { title?: string; columns: string[]; rows: (string | number)[][] };
  followups?: string[];
};

export type AgentEvent =
  | { type: "step"; label: string }
  | { type: "answer"; data: FinalAnswer }
  | { type: "error"; message: string };
