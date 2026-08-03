/**
 * Converts a Mongoose user document into the safe, password-free shape that
 * is returned to API clients. Single source of truth for "what a user looks
 * like on the wire" — reused by register, login, and the protected route.
 */
import type { UserDocument } from "@/models/user.model";
import type { PublicUser } from "@/types";

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user._id.toString(),
    fullName: user.fullName,
    email: user.email,
    profilePicture: user.profilePicture,
    planTier: user.planTier,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
