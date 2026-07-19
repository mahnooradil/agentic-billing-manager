/**
 * Platform CRUD controllers.
 *
 * Input is validated by the `validate` middleware and all routes are protected
 * by `authenticate`, so these handlers focus on business logic. Errors are
 * thrown as `AppError`s and formatted centrally; async rejections are forwarded
 * via `asyncHandler`. Follows the same model→controller pattern as auth.
 */
import { isValidObjectId } from "mongoose";

import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { toPublicPlatform } from "@/utils/platform.serializer";
import { Platform, type PlatformDocument } from "@/models/platform.model";
import type {
  CreatePlatformInput,
  UpdatePlatformInput,
} from "@/validators/platform.validator";

/** Loads a platform by id or throws a 404 (also for malformed ids). */
async function findPlatformOr404(id: string): Promise<PlatformDocument> {
  if (!isValidObjectId(id)) {
    throw new AppError("Platform not found", 404);
  }
  const platform = await Platform.findById(id);
  if (!platform) {
    throw new AppError("Platform not found", 404);
  }
  return platform;
}

/** GET /api/platforms — list all platforms (newest first). */
export const listPlatforms = asyncHandler(async (_req, res) => {
  const platforms = await Platform.find().sort({ createdAt: -1 });
  sendSuccess(res, 200, "Platforms retrieved", {
    platforms: platforms.map(toPublicPlatform),
  });
});

/** GET /api/platforms/:id — fetch a single platform. */
export const getPlatform = asyncHandler(async (req, res) => {
  const platform = await findPlatformOr404(req.params.id as string);
  sendSuccess(res, 200, "Platform retrieved", {
    platform: toPublicPlatform(platform),
  });
});

/** POST /api/platforms — create a platform. */
export const createPlatform = asyncHandler(async (req, res) => {
  const body = req.body as CreatePlatformInput;

  const existing = await Platform.findOne({ slug: body.slug });
  if (existing) {
    throw new AppError("A platform with this slug already exists", 409);
  }

  const platform = await Platform.create(body);
  sendSuccess(res, 201, "Platform created", {
    platform: toPublicPlatform(platform),
  });
});

/** PUT /api/platforms/:id — update a platform. */
export const updatePlatform = asyncHandler(async (req, res) => {
  const body = req.body as UpdatePlatformInput;
  const platform = await findPlatformOr404(req.params.id as string);

  // Guard slug uniqueness only when the slug is actually changing.
  if (body.slug && body.slug !== platform.slug) {
    const duplicate = await Platform.findOne({
      slug: body.slug,
      _id: { $ne: platform._id },
    });
    if (duplicate) {
      throw new AppError("A platform with this slug already exists", 409);
    }
  }

  Object.assign(platform, body);
  await platform.save();

  sendSuccess(res, 200, "Platform updated", {
    platform: toPublicPlatform(platform),
  });
});

/** DELETE /api/platforms/:id — remove a platform. */
export const deletePlatform = asyncHandler(async (req, res) => {
  const platform = await findPlatformOr404(req.params.id as string);
  await platform.deleteOne();
  sendSuccess(res, 200, "Platform deleted", { id: platform._id.toString() });
});
