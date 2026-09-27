/**
 * Slack "Add to Slack" OAuth install — lets each customer ORGANIZATION
 * connect its own Slack workspace, instead of the app having a single
 * global bot (see organization.model.ts's `slackWorkspace` docstring for
 * why: this app is sold to separate companies, each needing their own
 * workspace, never sharing one another's).
 *
 * Flow: `getInstallUrl` builds Slack's own authorize link (called from an
 * authenticated request, so the organization initiating this is already
 * known); the `state` param carries that organization id, signed so the
 * callback can trust it without needing the original request's auth header
 * (Slack's own redirect back to us carries none). `handleOAuthCallback`
 * verifies that state, exchanges Slack's one-time `code` for a real bot
 * token via `oauth.v2.access`, and persists it (encrypted) on the
 * organization.
 */
import jwt from "jsonwebtoken";

import { env } from "@/config/env";
import { AppError } from "@/utils/appError";
import { encryptSecret } from "@/utils/crypto";
import { Organization } from "@/models/organization.model";

const SLACK_API_BASE = "https://slack.com/api";
const STATE_TTL = "10m";
/** `chat:write` to reply, `im:history`/`im:read` to receive DM content —
 *  same scopes this app's single-workspace setup already used manually. */
const BOT_SCOPES = "chat:write,im:history,im:read";

interface OAuthState {
  organizationId: string;
}

export function isSlackAppConfigured(): boolean {
  return Boolean(
    env.slackClientId &&
      env.slackClientSecret &&
      env.slackOauthRedirectUri &&
      env.slackSigningSecret
  );
}

function getStateSecret(): string {
  if (!env.jwtSecret) {
    throw new AppError("Slack install isn't configured on this server yet.", 503);
  }
  return env.jwtSecret;
}

/** Builds the URL to send a browser to for Slack's own consent screen. */
export function getInstallUrl(organizationId: string): string {
  if (!isSlackAppConfigured()) {
    throw new AppError("Slack isn't configured on this server yet.", 503);
  }
  const state = jwt.sign({ organizationId } satisfies OAuthState, getStateSecret(), {
    expiresIn: STATE_TTL,
  });
  const params = new URLSearchParams({
    client_id: env.slackClientId,
    scope: BOT_SCOPES,
    redirect_uri: env.slackOauthRedirectUri,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

interface SlackOAuthAccessResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  bot_user_id?: string;
  team?: { id?: string; name?: string };
}

/** Verifies the `code`, exchanges it for a bot token, and saves it (encrypted)
 *  onto the organization the `state` param identified. Returns the connected
 *  team's name for a friendly confirmation message. */
export async function handleOAuthCallback(
  code: string,
  state: string
): Promise<{ organizationId: string; teamName: string }> {
  let decoded: OAuthState;
  try {
    decoded = jwt.verify(state, getStateSecret()) as OAuthState;
  } catch {
    throw new AppError("This Slack install link has expired — please try again.", 400);
  }

  const res = await fetch(`${SLACK_API_BASE}/oauth.v2.access`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.slackClientId,
      client_secret: env.slackClientSecret,
      code,
      redirect_uri: env.slackOauthRedirectUri,
    }),
  });
  const data = (await res.json().catch(() => null)) as SlackOAuthAccessResponse | null;
  if (!res.ok || !data?.ok || !data.access_token || !data.team?.id) {
    throw new AppError(`Slack install failed: ${data?.error ?? res.status}`, 502);
  }

  const organization = await Organization.findById(decoded.organizationId);
  if (!organization) {
    throw new AppError("That workspace no longer exists.", 404);
  }

  organization.slackWorkspace = {
    teamId: data.team.id,
    teamName: data.team.name,
    botToken: encryptSecret(data.access_token),
    botUserId: data.bot_user_id,
    connectedAt: new Date(),
  };
  await organization.save();

  return { organizationId: organization._id.toString(), teamName: data.team.name ?? "Slack" };
}
