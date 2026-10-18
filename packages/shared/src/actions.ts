import { z } from "zod";

export const MAX_TYPE_TEXT_LENGTH = 2000;

const coord = z.number().int().min(0).max(32767);

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("capture_screen"), displayId: z.string().min(1).max(64).optional() }),
  z.object({ type: z.literal("move_mouse"), x: coord, y: coord }),
  z.object({
    type: z.literal("click_mouse"),
    x: coord,
    y: coord,
    button: z.enum(["left", "right", "middle"]).default("left"),
    double: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("scroll_mouse"),
    x: coord,
    y: coord,
    deltaY: z.number().int().min(-5000).max(5000),
  }),
  z.object({ type: z.literal("press_key"), combo: z.string().min(1).max(64) }),
  z.object({ type: z.literal("type_text"), text: z.string().min(1).max(MAX_TYPE_TEXT_LENGTH) }),
]);

export type Action = z.infer<typeof ActionSchema>;
export type ActionType = Action["type"];

/** Where a proposal came from. Only the executor's trusted path may attach approvals. */
export type ProposalSource = "model" | "user" | "system";

export interface ActionProposal {
  id: string;
  source: ProposalSource;
  /** Model-provided justification. Displayed to the user, never trusted by policy. */
  rationale?: string;
  action: Action;
}

export type ParseResult = { ok: true; action: Action } | { ok: false; error: string };

/** Validate untrusted model output into a typed action. Never throws. */
export function parseAction(raw: unknown): ParseResult {
  const result = ActionSchema.safeParse(raw);
  if (result.success) return { ok: true, action: result.data };
  return {
    ok: false,
    error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
  };
}
