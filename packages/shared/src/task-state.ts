export const TASK_STATES = [
  "idle",
  "planning",
  "awaiting_approval",
  "executing",
  "verifying",
  "paused",
  "user_controlled",
  "completed",
  "failed",
  "cancelled",
] as const;

export type TaskState = (typeof TASK_STATES)[number];

const TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
  idle: ["planning", "cancelled"],
  planning: [
    "awaiting_approval",
    "executing",
    "paused",
    "user_controlled",
    "completed",
    "failed",
    "cancelled",
  ],
  awaiting_approval: ["planning", "executing", "paused", "user_controlled", "failed", "cancelled"],
  executing: ["verifying", "paused", "user_controlled", "failed", "cancelled"],
  verifying: [
    "planning",
    "executing",
    "completed",
    "paused",
    "user_controlled",
    "failed",
    "cancelled",
  ],
  paused: ["planning", "user_controlled", "cancelled"],
  user_controlled: ["planning", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: TaskState,
    public readonly to: TaskState,
  ) {
    super(`Invalid task transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(from: TaskState, to: TaskState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: TaskState, to: TaskState): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export function isTerminal(state: TaskState): boolean {
  return TRANSITIONS[state].length === 0;
}
