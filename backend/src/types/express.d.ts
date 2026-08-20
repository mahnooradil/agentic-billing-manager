/**
 * Express type augmentation.
 * Adds the authenticated user (set by the auth middleware) to `Request`,
 * so downstream handlers can read `req.user` in a type-safe way.
 */
import type { UserDocument } from "@/models/user.model";
import type { OrganizationDocument } from "@/models/organization.model";
import type { MembershipDocument } from "@/models/membership.model";

declare global {
  namespace Express {
    interface Request {
      /** Present only on routes guarded by the `authenticate` middleware. */
      user?: UserDocument;
      /** The user's ONE organization (v1: no multi-org membership) — every
       *  business-data query must scope by `organization._id`, not `user._id`.
       *  Present only on routes guarded by `authenticate`. */
      organization?: OrganizationDocument;
      /** The user's role within `organization` (owner/admin/member). */
      membership?: MembershipDocument;
      /** The current token's session id (jti), when the token carries one. */
      sessionJti?: string;
    }
  }
}

export {};
