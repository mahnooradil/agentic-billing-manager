/**
 * Converts a user settings document into the wire shape. A stored document may
 * be missing groups/fields (older document, partial write), so every group is
 * merged over `DEFAULT_USER_SETTINGS` — the response is ALWAYS complete. When no
 * document exists yet, the pure defaults are returned with null id/timestamps.
 */
import {
  DEFAULT_USER_SETTINGS,
  type IUserSettings,
  type UserSettingsDocument,
} from "@/models/user-settings.model";

type SettingsGroups = Omit<IUserSettings, "user" | "createdAt" | "updatedAt">;

export interface PublicUserSettings extends SettingsGroups {
  id: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** Builds the complete settings groups from an optional PLAIN settings object. */
function toGroups(plain: Partial<SettingsGroups> | null): SettingsGroups {
  const key = <K extends keyof SettingsGroups>(k: K): SettingsGroups[K] => ({
    ...DEFAULT_USER_SETTINGS[k],
    ...((plain?.[k] as object | undefined) ?? {}),
  });
  return {
    general: key("general"),
    notifications: key("notifications"),
    analytics: key("analytics"),
    automation: key("automation"),
    memory: key("memory"),
    recommendations: key("recommendations"),
    workspace: key("workspace"),
    appearance: key("appearance"),
  };
}

export function toPublicUserSettings(
  doc: UserSettingsDocument | null
): PublicUserSettings {
  // `toObject()` turns Mongoose subdocuments into plain objects so their real
  // field values (not internal getters) merge over the defaults.
  const plain = doc ? (doc.toObject() as Partial<SettingsGroups>) : null;
  return {
    id: doc ? doc._id.toString() : null,
    ...toGroups(plain),
    createdAt: doc ? doc.createdAt : null,
    updatedAt: doc ? doc.updatedAt : null,
  };
}
