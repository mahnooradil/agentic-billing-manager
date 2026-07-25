/**
 * User settings controllers — per-user application preferences (Phase F7).
 *
 * All routes are protected by `authenticate`, so `req.user` is present. Each
 * user has at most one settings document. GET always returns a COMPLETE settings
 * object (defaults merged), even before anything is saved. PUT deep-merges the
 * provided groups over the user's current effective settings and upserts, so a
 * partial save never wipes untouched groups.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { toPublicUserSettings } from "@/utils/user-settings.serializer";
import {
  UserSettings,
  DEFAULT_USER_SETTINGS,
  type IUserSettings,
} from "@/models/user-settings.model";
import type { UpdateUserSettingsInput } from "@/validators/user-settings.validator";

type SettingsGroups = Omit<IUserSettings, "user" | "createdAt" | "updatedAt">;

/** GET /api/settings — the current user's preferences (defaults when unset). */
export const getMySettings = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  const settings = await UserSettings.findOne({ user: user._id });
  sendSuccess(res, 200, "Settings retrieved", {
    settings: toPublicUserSettings(settings),
  });
});

/** PUT /api/settings — deep-merge the provided groups and upsert. */
export const updateMySettings = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  const body = req.body as UpdateUserSettingsInput;
  const existing = await UserSettings.findOne({ user: user._id });
  // Plain object so subdocument field values (not Mongoose getters) merge cleanly.
  const existingPlain = existing
    ? (existing.toObject() as Partial<SettingsGroups>)
    : null;

  // Current effective settings: stored values over defaults. Only the groups
  // present in the request are rebuilt (merged field-by-field) and written, so
  // omitted groups keep their stored values and untouched fields within a
  // touched group are preserved.
  const update: Record<string, Record<string, unknown>> = {};
  for (const key of Object.keys(body) as (keyof SettingsGroups)[]) {
    const incoming = body[key];
    if (!incoming) continue;
    const current = {
      ...DEFAULT_USER_SETTINGS[key],
      ...((existingPlain?.[key] as object | undefined) ?? {}),
    };
    update[key] = { ...current, ...incoming };
  }

  const settings = await UserSettings.findOneAndUpdate(
    { user: user._id },
    { $set: update, $setOnInsert: { user: user._id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  sendSuccess(res, existing ? 200 : 201, "Settings saved", {
    settings: toPublicUserSettings(settings),
  });
});
