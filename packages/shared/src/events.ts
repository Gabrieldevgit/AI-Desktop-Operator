import type { TaskState } from "./task-state";

export type TaskEvent =
  | { kind: "state_changed"; taskId: string; from: TaskState; to: TaskState; at: number }
  | { kind: "action_proposed"; taskId: string; proposalId: string; at: number }
  | { kind: "action_decided"; taskId: string; proposalId: string; decision: string; at: number }
  | { kind: "action_executed"; taskId: string; proposalId: string; at: number }
  | { kind: "approval_requested"; taskId: string; proposalId: string; at: number }
  | { kind: "error"; taskId: string; code: string; at: number };

export type TaskEventListener = (event: TaskEvent) => void;

export class TypedEventBus {
  private listeners = new Set<TaskEventListener>();
  subscribe(listener: TaskEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(event: TaskEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        /* a failing listener must never break execution */
      }
    }
  }
}
