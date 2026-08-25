/**
 * AI-based invoice field extraction — replaces the old regex parser
 * (parser.ts's removed `parseInvoiceFields`) for the exact reason it existed:
 * real invoice/receipt emails vary far too much in wording for a fixed set of
 * regexes to reliably catch. A live test surfaced both failure modes at once —
 * genuinely paid invoices were saved as "Pending" (the regex only recognized
 * 4 exact payment-confirmation phrases), and many invoices were silently
 * skipped entirely (amount/currency regex didn't match their format).
 *
 * One plain (non-Agent, non-session) Messages API call per candidate email,
 * forced through a single tool call so the response is always structured
 * JSON — no free-text parsing on our side. Uses Haiku (cheap, fast) since
 * this runs on every scanned email, not a handful of chat turns.
 */
import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/config/env";
import { AppError } from "@/utils/appError";
import type { BillingStatus } from "@/models/billing.model";

const MODEL = "claude-haiku-4-5-20251001";
/** Bounds tokens/cost — real invoice emails are short; this is generous. */
const MAX_BODY_CHARS = 6000;

export interface ExtractedInvoice {
  /** False when the email matched the search keywords but isn't actually a
   *  billing email (e.g. a promo that happens to mention "receipt"). */
  isBillingEmail: boolean;
  amount: number | null;
  currency: string | null;
  invoiceNumber: string | null;
  /** The vendor/company that sent the invoice — not the recipient. */
  customerName: string | null;
  billingDate: string | null;
  dueDate: string | null;
  status: BillingStatus | null;
}

export interface InvoiceExtractionResult {
  fields: ExtractedInvoice;
  inputTokens: number;
  outputTokens: number;
}

const EXTRACT_TOOL: Anthropic.Tool = {
  name: "extract_invoice",
  description:
    "Report whether this email is a genuine invoice/receipt/billing notice, and extract its billing fields if so.",
  input_schema: {
    type: "object",
    properties: {
      isBillingEmail: {
        type: "boolean",
        description:
          "True only if this is genuinely an invoice, receipt, or billing statement from a THIRD-PARTY SERVICE/SUBSCRIPTION the recipient pays for (e.g. Netflix, AWS, a SaaS tool). False for: promotions/newsletters that merely mention billing words; personal banking or mobile-wallet transaction/balance alerts (e.g. a bank or Easypaisa/JazzCash notification) — those are the recipient's own money movement, not a bill FROM a vendor; and anything else not an actual vendor invoice.",
      },
      amount: {
        type: "number",
        description: "The total amount charged or due, as a plain number with no currency symbol or thousands separators.",
      },
      currency: {
        type: "string",
        description: "3-letter ISO currency code (e.g. USD, EUR, GBP, INR, PKR). Infer from a symbol if no code is stated.",
      },
      invoiceNumber: { type: "string", description: "The invoice/receipt/order number, if stated." },
      customerName: {
        type: "string",
        description: "The vendor/company name that sent this invoice (who is being paid), not the recipient's name.",
      },
      billingDate: { type: "string", description: "The invoice or billing date, in YYYY-MM-DD format." },
      dueDate: {
        type: "string",
        description:
          "The payment due date, in YYYY-MM-DD format, only if the email states one (an explicit date, or a relative phrase like 'due in 2 days' resolved against the current date given in the prompt).",
      },
      status: {
        type: "string",
        enum: ["Paid", "Pending", "Overdue"],
        description:
          "Paid if the email confirms payment was received/successful/charged. Overdue if it says payment failed, declined, or is past due. Pending for a plain invoice/bill with no payment confirmation yet.",
      },
    },
    required: ["isBillingEmail"],
  },
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!env.anthropicApiKey) {
    throw new AppError("AI email parsing isn't configured on this server yet.", 503);
  }
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

/** True when the API key needed for AI email parsing is present. */
export function isAiExtractionConfigured(): boolean {
  return Boolean(env.anthropicApiKey);
}

/**
 * Extracts invoice fields from one email via a single forced tool call.
 * Throws on a hard API failure (network/auth/rate-limit) — the caller
 * decides how to handle that per-message, same as any other tool failure in
 * this pipeline; never silently fabricates a result.
 */
export async function extractInvoiceFields(input: {
  subject?: string | null;
  fromHeader?: string | null;
  bodyText: string;
}): Promise<InvoiceExtractionResult> {
  const anthropic = getClient();
  const body = input.bodyText.slice(0, MAX_BODY_CHARS);
  // Without this, a relative phrase like "due in 2 days" has no anchor and
  // the model falls back to its own (wrong) notion of "today" — a live test
  // produced a due date almost two years off for exactly this reason.
  const today = new Date().toISOString().slice(0, 10);

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: EXTRACT_TOOL.name },
    messages: [
      {
        role: "user",
        content: `Today's date is ${today}. Extract billing details from this email — resolve any relative date phrase ("due in 2 days", "due tomorrow") against today's date above, not your own assumption of the current date.\n\nFrom: ${input.fromHeader ?? "unknown"}\nSubject: ${input.subject ?? "(none)"}\n\n${body}`,
      },
    ],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  const raw = (toolUse?.input ?? {}) as Partial<ExtractedInvoice>;

  return {
    fields: {
      isBillingEmail: raw.isBillingEmail === true,
      amount: typeof raw.amount === "number" ? raw.amount : null,
      currency: typeof raw.currency === "string" ? raw.currency.toUpperCase() : null,
      invoiceNumber: typeof raw.invoiceNumber === "string" ? raw.invoiceNumber : null,
      customerName: typeof raw.customerName === "string" ? raw.customerName : null,
      billingDate: typeof raw.billingDate === "string" ? raw.billingDate : null,
      dueDate: typeof raw.dueDate === "string" ? raw.dueDate : null,
      status:
        raw.status === "Paid" || raw.status === "Pending" || raw.status === "Overdue"
          ? raw.status
          : null,
    },
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}
