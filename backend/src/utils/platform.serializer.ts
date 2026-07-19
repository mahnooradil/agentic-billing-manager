/**
 * Converts a Mongoose platform document into the shape returned to API clients.
 * Single source of truth for "what a platform looks like on the wire".
 */
import type { PlatformDocument, PlatformStatus } from "@/models/platform.model";

export interface PublicPlatform {
  id: string;
  name: string;
  slug: string;
  description?: string;
  website?: string;
  logo?: string;
  status: PlatformStatus;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicPlatform(platform: PlatformDocument): PublicPlatform {
  return {
    id: platform._id.toString(),
    name: platform.name,
    slug: platform.slug,
    description: platform.description,
    website: platform.website,
    logo: platform.logo,
    status: platform.status,
    createdAt: platform.createdAt,
    updatedAt: platform.updatedAt,
  };
}
