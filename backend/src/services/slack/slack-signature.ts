/**
 * Verifies that an inbound request to the Slack Events endpoint genuinely
 * came from Slack — the exact scheme Slack documents: HMAC-SHA256 over
 * `v0:{timestamp}:{raw body}`, keyed by the app's signing secret, compared
 * (constant-time) against the `X-Slack-Signature` header. The timestamp is
 * also bounds-checked so a captured request can't be replayed later.
 *
 * Needs the RAW, unparsed request body — see app.ts, where this route is
 * mounted ahead of the global `express.json()` for exactly this reason.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/config/env";

const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

export function verifySlackSignature(input: {
  signature: string | undefined;
  timestamp: string | undefined;
  rawBody: Buffer;
}): boolean {
  const { signature, timestamp, rawBody } = input;
  if (!env.slackSigningSecret || !signature || !timestamp) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > MAX_TIMESTAMP_SKEW_SECONDS) return false;

  const base = `v0:${timestamp}:${rawBody.toString("utf8")}`;
  const expected = `v0=${createHmac("sha256", env.slackSigningSecret).update(base).digest("hex")}`;

  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;

  return timingSafeEqual(expectedBuf, actualBuf);
}
