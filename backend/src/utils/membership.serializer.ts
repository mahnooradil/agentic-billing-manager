/**
 * Converts a Membership document (populated with its User) into the wire
 * shape for the Team/Members list.
 */
import type { MembershipDocument } from "@/models/membership.model";
import type { UserDocument } from "@/models/user.model";

export interface PublicMember {
  id: string;
  role: MembershipDocument["role"];
  user: {
    id: string;
    fullName: string;
    email: string;
  };
  createdAt: Date;
}

/** `user` is passed separately (rather than read off `membership.user`)
 *  because Mongoose's `.populate()` doesn't change the static field type, so
 *  callers pass the already-hydrated User document explicitly instead of
 *  fighting that with a cast. */
export function toPublicMember(
  membership: MembershipDocument,
  user: UserDocument
): PublicMember {
  return {
    id: membership._id.toString(),
    role: membership.role,
    user: {
      id: user._id.toString(),
      fullName: user.fullName,
      email: user.email,
    },
    createdAt: membership.createdAt,
  };
}
