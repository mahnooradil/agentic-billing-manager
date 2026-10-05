import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type { SenderProfileListData, SenderProfileData } from "@/services/types/sender-profile";

/** GET /sender-profiles — senders the pipeline has an opinion about
 *  (trusted/suppressed only — neutral ones aren't worth showing). */
export function listSenderProfiles(): Promise<ApiSuccess<SenderProfileListData>> {
  return api.get<ApiSuccess<SenderProfileListData>>("/sender-profiles");
}

/** POST /sender-profiles/:id/suppress — manually mute a sender. */
export function suppressSenderProfile(id: string): Promise<ApiSuccess<SenderProfileData>> {
  return api.post<ApiSuccess<SenderProfileData>>(`/sender-profiles/${id}/suppress`);
}

/** POST /sender-profiles/:id/restore — undo a suppression (auto-learned or manual). */
export function restoreSenderProfile(id: string): Promise<ApiSuccess<SenderProfileData>> {
  return api.post<ApiSuccess<SenderProfileData>>(`/sender-profiles/${id}/restore`);
}
