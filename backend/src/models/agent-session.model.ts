/**
 * Agent Session model.
 *
 * Maps one (user, organization) pair to their active Claude Managed Agents
 * session ID, so repeat messages continue the same conversation (the
 * agent's own event history) instead of starting a fresh session per
 * request. One active session per (user, organization) — not per user
 * alone (WP-7 fix): a user can belong to multiple organizations and the
 * active one can change mid-session (see auth.middleware.ts's
 * `resolveActiveOrganization`), so keying this by user only meant a single
 * session row could end up serving more than one workspace's conversation.
 * Before this fix, the only thing preventing that was an imperative
 * best-effort reset call on org-switch (see managed-agent.service.ts's
 * `resetAgentSession` and its callers) — a convention, not a guarantee; if
 * that call ever silently failed (it's wrapped in a swallowed `.catch`) or
 * a future code path forgot to call it, one organization's billing
 * conversation could carry on into another's context. Keying by
 * `(user, organization)` closes that structurally: each organization
 * simply has its own row, so there is nothing to "carry on" across a
 * switch regardless of whether any reset call ran. A new session is
 * created if the stored one has gone `terminated`.
 */
import {
  Schema,
  model,
  type HydratedDocument,
  type Model,
  type Types,
} from "mongoose";

export interface IAgentSession {
  user: Types.ObjectId;
  organization: Types.ObjectId;
  /** Managed Agents session ID (`sesn_...`). */
  sessionId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AgentSessionDocument = HydratedDocument<IAgentSession>;
type AgentSessionModel = Model<IAgentSession>;

const agentSessionSchema = new Schema<IAgentSession, AgentSessionModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization is required"],
    },
    sessionId: {
      type: String,
      required: [true, "Session ID is required"],
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// One active agent session per (user, organization) — see the model's own
// docstring for why this replaced a user-only unique index.
agentSessionSchema.index({ user: 1, organization: 1 }, { unique: true });

export const AgentSession = model<IAgentSession, AgentSessionModel>(
  "AgentSession",
  agentSessionSchema
);
