/**
 * Agent Session model.
 *
 * Maps one user to their active Claude Managed Agents session ID, so repeat
 * messages continue the same conversation (the agent's own event history)
 * instead of starting a fresh session per request. One active session per
 * user; a new one is created if the stored session has gone `terminated`.
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
      unique: true, // one active agent session per user
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

export const AgentSession = model<IAgentSession, AgentSessionModel>(
  "AgentSession",
  agentSessionSchema
);
