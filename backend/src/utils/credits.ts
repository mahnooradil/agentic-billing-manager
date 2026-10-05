/**
 * Credit balance enforcement — the counterpart to the ledger's grant/consume
 * (services/credits/credit-ledger.service.ts). Same idiom as plan-limits.ts:
 * throws an AppError when the ACTIVE workspace is out of credits, called
 * BEFORE starting an action that would cost credits (usage is only known
 * after it runs, so this is what actually stops further use, not the
 * after-the-fact deduction). Credits belong to the organization, not the
 * individual member — see Organization model's docstring.
 */
import type { Types } from "mongoose";

import { AppError } from "@/utils/appError";
import { Organization } from "@/models/organization.model";

/**
 * Throws a 403 if this organization has no credits left to spend.
 *
 * CLAUDE.md §10.3 — this used to take the already-resolved
 * `OrganizationDocument` off `req.organization`, which can be served from
 * `middlewares/auth-cache.ts`'s 5-second in-memory cache. That meant every
 * agent-chat request arriving within the same 5-second window saw the SAME
 * (possibly already-stale) balance and could all pass this gate at once,
 * each then deducting real credits — letting several concurrent turns
 * overdraw a workspace well past the single small overdraft the design
 * already accepts ("the balance can end up slightly below zero... the NEXT
 * turn is what gets blocked" — see credit-ledger.service.ts's own
 * docstring). Reading the balance fresh here, right before the gate,
 * shrinks that window from up to 5 seconds down to one DB round trip —
 * not a full reservation/lock system (deliberately out of scope, a bigger
 * architectural change than this fix), but it closes the actual
 * magnitude-increasing bug: N stale-cached concurrent requests all passing
 * at once, not just one.
 */
export async function assertCreditBalance(organizationId: Types.ObjectId | string): Promise<void> {
  const fresh = await Organization.findById(organizationId).select("creditsBalance");
  if (!fresh || fresh.creditsBalance <= 0) {
    throw new AppError(
      "This workspace has used all its credits. Add more credits to keep chatting with the Billing Advisor.",
      403
    );
  }
}
