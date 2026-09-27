# Flow — Extra Item: Slack One-Click Connect + Per-Organization Bot

**Not from the 12 audit documents** — raised directly by the user on 2026-09-23 after observing the
current Slack setup is awkward. Recorded here as its own tracked item so it isn't lost while the
12-document review continues.

## The problem, as the user described it

1. **Alerts (due-date reminders):** the user must manually create a Slack "Incoming Webhook" inside
   their own Slack workspace, copy its URL, and paste it into our Settings page. Too many manual
   steps compared to how every other platform in this app connects (one click).
2. **Chatbot (DM-based agent chat):** the app currently uses **one single Slack bot token for the
   entire deployment** (`SLACK_BOT_TOKEN` + `SLACK_SIGNING_SECRET` in our own `.env`, shared across
   every organization — confirmed in `CLAUDE.md`'s own module notes). This does not work correctly
   for genuinely separate customers, each with their own Slack workspace — every organization should
   have its own, separate bot connection.

## Proposed fix — matches the app's existing "Connect" pattern (Gmail/Outlook/Pipedream)

1. **Register one real Slack App** in Slack's developer console (a one-time setup step, done by the
   user, the same shape as the earlier Google Cloud Console OAuth setup for Google Sign-In) —
   requesting both the `incoming-webhook` scope (for alerts) and bot scopes (`chat:write`,
   `im:history`, etc., for DM chat) in one app.
2. **Replace both manual flows with a single OAuth "Connect Slack" button** in Settings. Slack's
   OAuth v2 flow, on approval, returns *both* an `incoming_webhook.url` (no more copy-paste) *and* a
   bot token scoped to that specific installing workspace — in one click.
3. **Store the result per organization**, not in `.env` — a new model (working name
   `SlackWorkspaceInstall`): `organization`, `teamId`, `botToken` (encrypted at rest, same pattern as
   `PlatformConnection`'s API keys), `incomingWebhookUrl`, `botUserId`.
4. **The Events API webhook** (`/api/slack/events`) resolves which organization an incoming DM/event
   belongs to by looking up the event's `teamId` against `SlackWorkspaceInstall`, instead of assuming
   a single global bot.
5. **Alerts** (`services/notifications/slack.ts`) read the organization's own stored
   `incomingWebhookUrl` instead of a value the user pasted manually.

## What this requires from the user (cannot be done by code alone)

A one-time Slack App registration in Slack's own developer console — same category of task as the
earlier Google Cloud Console setup for "Continue with Google." Client ID/secret from that app go into
our `.env`; everything else is code.

## Status

**Plan proposed, not yet approved for implementation.** Confirmed by the user as the right direction
in principle (2026-09-23). Waiting to be sequenced against the 12-document work before starting — not
yet assigned as an active phase.
