/**
 * Express type augmentation.
 * Adds the authenticated user (set by the auth middleware) to `Request`,
 * so downstream handlers can read `req.user` in a type-safe way.
 */
import type { UserDocument } from "@/models/user.model";

declare global {
  namespace Express {
    interface Request {
      /** Present only on routes guarded by the `authenticate` middleware. */
      user?: UserDocument;
    }
  }
}

export {};
