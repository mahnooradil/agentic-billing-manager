/**
 * Session model — one document per issued login token (Security tab).
 *
 * `jti` is embedded in the signed JWT and is the link back to this document —
 * `authenticate` rejects any token whose session is missing or revoked, which
 * is what makes "revoke this device" actually work (independent of the
 * blanket `tokenVersion` bump used by "sign out everywhere").
 */
import {
  Schema,
  model,
  type HydratedDocument,
  type Model,
  type Types,
} from "mongoose";

export interface ISession {
  user: Types.ObjectId;
  jti: string;
  userAgent?: string;
  ip?: string;
  lastSeenAt: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type SessionDocument = HydratedDocument<ISession>;
type SessionModel = Model<ISession>;

const sessionSchema = new Schema<ISession, SessionModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    jti: { type: String, required: true, unique: true },
    userAgent: { type: String, trim: true, maxlength: 300 },
    ip: { type: String, trim: true, maxlength: 64 },
    lastSeenAt: { type: Date, required: true, default: Date.now },
    revokedAt: { type: Date },
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

export const Session = model<ISession, SessionModel>("Session", sessionSchema);
