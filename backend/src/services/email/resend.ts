/**
 * Resend transactional email — the ONLY channel this app ever emails a user
 * through (verification codes, support request notifications/confirmations).
 * No SDK — a single `fetch` call, matching the project's convention (see
 * `services/integrations/pipedream.ts`) of avoiding a dependency for a single
 * documented REST endpoint.
 *
 * Requires a verified sending domain (or Resend's shared onboarding domain
 * for testing) — otherwise Resend itself rejects the send, which surfaces
 * here as a clean 502.
 */
import { env } from "@/config/env";
import { AppError } from "@/utils/appError";
import { OTP_TTL_MINUTES } from "@/models/otp.model";

const RESEND_API = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

export function isResendConfigured(): boolean {
  return Boolean(env.resendApiKey && env.resendFromEmail);
}

/** Sends one plain transactional email. Throws a clean AppError on any failure. */
async function sendEmail(input: {
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
}): Promise<void> {
  if (!isResendConfigured()) {
    throw new AppError(
      "Email sending isn't configured on this server yet.",
      503
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(RESEND_API, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.resendApiKey}`,
      },
      body: JSON.stringify({
        from: env.resendFromEmail,
        to: [input.to],
        subject: input.subject,
        text: input.textBody,
        html: input.htmlBody,
      }),
    });
  } catch (err) {
    console.error(`[resend] fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    throw new AppError("Could not reach the email service. Please try again.", 502);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // Diagnostic only — never forwarded to the client (could contain account details).
    const body = await res.text().catch(() => "");
    console.error(`[resend] send failed (${res.status}): ${body}`);
    throw new AppError("Could not send the verification email. Please try again.", 502);
  }
}

/** Sends a 6-digit verification code for login or signup. */
export async function sendOtpEmail(to: string, code: string): Promise<void> {
  await sendEmail({
    to,
    subject: `${code} is your verification code`,
    textBody: `Your verification code is ${code}.\n\nIt expires in ${OTP_TTL_MINUTES} minutes. If you didn't request this, you can safely ignore this email.`,
    htmlBody: `<p>Your verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;">${code}</p><p>It expires in ${OTP_TTL_MINUTES} minutes. If you didn't request this, you can safely ignore this email.</p>`,
  });
}

/** Notifies the support inbox of a new request — `[PRIORITY]` for Pro/Business
 *  requesters, so a human triage can actually act on the plan's promise. */
export async function sendSupportRequestEmail(input: {
  inbox: string;
  fromUserEmail: string;
  fromUserName: string;
  isPriority: boolean;
  category: string;
  subject: string;
  message: string;
}): Promise<void> {
  const tag = input.isPriority ? "[PRIORITY]" : "[Support]";
  await sendEmail({
    to: input.inbox,
    subject: `${tag} ${input.subject}`,
    textBody: `From: ${input.fromUserName} <${input.fromUserEmail}>\nCategory: ${input.category}\nPriority: ${input.isPriority ? "Priority (Pro/Business)" : "Standard (Free)"}\n\n${input.message}`,
    htmlBody: `<p><strong>From:</strong> ${input.fromUserName} &lt;${input.fromUserEmail}&gt;</p><p><strong>Category:</strong> ${input.category}</p><p><strong>Priority:</strong> ${input.isPriority ? "Priority (Pro/Business)" : "Standard (Free)"}</p><p>${input.message.replace(/\n/g, "<br/>")}</p>`,
  });
}

/** Confirms receipt to the REQUESTER (not the support inbox) — so submitting
 *  a request doesn't feel like it vanished into a form with no acknowledgment. */
export async function sendSupportRequestConfirmationEmail(input: {
  to: string;
  subject: string;
  isPriority: boolean;
}): Promise<void> {
  const eta = input.isPriority
    ? "Your plan includes priority support, so we'll get back to you as soon as possible."
    : "We'll get back to you as soon as we can.";
  await sendEmail({
    to: input.to,
    subject: `We received your request: ${input.subject}`,
    textBody: `Thanks for reaching out — we've received your support request:\n\n"${input.subject}"\n\n${eta}\n\nYou can check its status any time under Settings > Support.`,
    htmlBody: `<p>Thanks for reaching out — we've received your support request:</p><p style="font-weight:600;">"${input.subject}"</p><p>${eta}</p><p>You can check its status any time under Settings &gt; Support.</p>`,
  });
}
