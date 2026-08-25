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

  // Logged so a "the email never arrived" report can be checked against
  // Resend's own delivery status (accepted-by-Resend is not the same as
  // delivered-to-inbox — spam filtering/greylisting on the recipient's mail
  // server happens after this point and is invisible to us).
  const data = (await res.json().catch(() => null)) as { id?: string } | null;
  if (data?.id) console.log(`[resend] sent to ${input.to} — id ${data.id}`);
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

/** Escapes text dropped into the HTML body — org/inviter names are
 *  user-supplied (an org's display name, another user's full name). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

/**
 * Invites someone to join an organization — links to the accept page with
 * the invite's token. Uses the first configured CORS origin as the
 * frontend's base URL (there's no dedicated FRONTEND_URL env var).
 *
 * The HTML body is a self-contained, table-based layout with every style
 * inlined (email clients strip <style> blocks and don't support flex/grid),
 * matching this app's brand blue/indigo rather than the plain-paragraph
 * template the other transactional emails use.
 */
export async function sendOrganizationInviteEmail(input: {
  to: string;
  organizationName: string;
  inviterName: string;
  role: string;
  token: string;
}): Promise<void> {
  const baseUrl = env.corsOrigin.split(",")[0]?.trim() ?? "";
  const acceptUrl = `${baseUrl}/invite/${input.token}`;
  const org = escapeHtml(input.organizationName);
  const inviter = escapeHtml(input.inviterName);
  const roleLabel = ROLE_LABEL[input.role] ?? input.role;
  // A trailing date keeps a resend to the same person for the same org from
  // Gmail-threading into one conversation as an identical-subject repeat —
  // deleting that thread would otherwise silently swallow a genuinely new
  // invite arriving into the same (now-deleted) thread.
  const dateSuffix = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  await sendEmail({
    to: input.to,
    subject: `${input.inviterName} invited you to join ${input.organizationName} (${dateSuffix})`,
    textBody: `${input.inviterName} invited you to join "${input.organizationName}" on Billing Manager as ${roleLabel}.\n\nAccept the invite: ${acceptUrl}\n\nThis link expires in 7 days. If you weren't expecting this, you can ignore this email.`,
    htmlBody: `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background:linear-gradient(135deg,#4f6fea 0%,#3d4fc4 100%);background-color:#4f6fea;padding:28px 32px;">
            <span style="color:#ffffff;font-size:15px;font-weight:600;letter-spacing:0.02em;">Billing Manager</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111827;">You're invited to join a workspace</p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">
              <strong style="color:#111827;">${inviter}</strong> invited you to join
              <strong style="color:#111827;">${org}</strong> on Billing Manager as
              <strong style="color:#111827;">${escapeHtml(roleLabel)}</strong>.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:10px;background-color:#4f6fea;">
                  <a href="${acceptUrl}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Accept the invite</a>
                </td>
              </tr>
            </table>
            <p style="margin:28px 0 0;font-size:13px;line-height:1.5;color:#9ca3af;">
              This link expires in 7 days. If you weren't expecting this, you can safely ignore this email.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim(),
  });
}

/**
 * Alerts the user by email that a tracked invoice is due soon/overdue — the
 * same signal already shown in-app (Notifications), sent to the inbox too
 * since an in-app badge is easy to miss until the user opens the app.
 *
 * Same branded table-based layout as `sendOrganizationInviteEmail` (every
 * style inlined — email clients strip <style> blocks and ignore flex/grid),
 * with an accent color that shifts red for "due today/tomorrow" vs amber
 * for the earlier heads-up, so the urgency is visible at a glance.
 */
export async function sendDueDateReminderEmail(input: {
  to: string;
  platformName: string | null;
  customerName: string;
  amount: number;
  currency: string;
  dueDate: Date;
  dueLabel: string;
  isUrgent: boolean;
}): Promise<void> {
  const baseUrl = env.corsOrigin.split(",")[0]?.trim() ?? "";
  const billingUrl = `${baseUrl}/dashboard/billing`;
  const platformName = input.platformName ? escapeHtml(input.platformName) : null;
  const monogram = escapeHtml((input.platformName ?? "?").charAt(0).toUpperCase());
  const customerName = escapeHtml(input.customerName);
  const amount = `${escapeHtml(input.currency)} ${input.amount.toFixed(2)}`;
  const dueDateLabel = input.dueDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const accent = input.isUrgent
    ? { bg: "#fef2f2", text: "#b91c1c" }
    : { bg: "#fffbeb", text: "#92400e" };
  const headline = platformName ? `${platformName} payment due ${input.dueLabel}` : `Payment due ${input.dueLabel}`;
  const subtitle = `${customerName}'s invoice`;

  await sendEmail({
    to: input.to,
    subject: `${amount} — ${headline}`,
    textBody: `${platformName ? `${platformName} — ` : ""}${customerName}'s ${amount} invoice is due ${input.dueLabel} (${dueDateLabel}).\n\nOpen your Billing page to review or mark it paid: ${billingUrl}`,
    htmlBody: `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <tr>
          <td style="background:linear-gradient(135deg,#4f6fea 0%,#3d4fc4 100%);background-color:#4f6fea;padding:24px 32px;">
            <span style="color:#ffffff;font-size:14px;font-weight:600;letter-spacing:0.02em;">Billing Manager</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
              <tr>
                <td style="width:48px;height:48px;min-width:48px;border-radius:12px;background-color:#eef1fd;text-align:center;vertical-align:middle;font-size:20px;font-weight:700;color:#4f6fea;">
                  ${monogram}
                </td>
                <td style="width:12px;">&nbsp;</td>
                <td style="vertical-align:middle;">
                  <p style="margin:0;font-size:17px;font-weight:600;color:#111827;">${platformName ?? "Invoice"}</p>
                  <p style="margin:2px 0 0;font-size:13px;color:#6b7280;">${subtitle}</p>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 8px;font-size:32px;font-weight:700;color:#111827;letter-spacing:-0.01em;">${amount}</p>
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:999px;background-color:${accent.bg};padding:5px 12px;font-size:13px;font-weight:600;color:${accent.text};">Due ${escapeHtml(input.dueLabel)} &middot; ${dueDateLabel}</td>
              </tr>
            </table>

            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
              <tr>
                <td style="border-radius:10px;background-color:#4f6fea;">
                  <a href="${billingUrl}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Review on the Billing page</a>
                </td>
              </tr>
            </table>

            <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#9ca3af;">
              You're getting this because billing alerts are enabled in your notification settings.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim(),
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
