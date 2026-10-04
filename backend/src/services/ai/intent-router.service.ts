/**
 * Intent router — WP-7 (flow/04 §8's "intent-router + narrowed-Managed-
 * Agents design"). A deterministic, 0-credit, no-Claude-call layer in front
 * of the Billing Advisor Agent: a STRICT, narrow pattern match against the
 * user's message resolves common questions (spend totals, "invoices from
 * X", "why is invoice Y marked Z") directly from the database, reusing the
 * exact same underlying logic the agent's own tools already use —
 * `runAnalyticsSummary`/`runBillingSearch` — so a deterministic answer is
 * never a second, divergent implementation of the same question.
 *
 * Deliberately conservative: every pattern requires an UNAMBIGUOUS trigger
 * phrase; anything that doesn't match confidently returns `null` and falls
 * through to the real agent unchanged. A wrong deterministic answer (a
 * silently-misread financial number) is a worse failure mode than simply
 * spending 5 credits on a normal agent turn, so this never guesses.
 *
 * Only `aggregate`/`lookup`/`explain` are deterministically handled in this
 * pass — flow/04's full target also names `action`/`rule`, but those need
 * safe deterministic ENTITY RESOLUTION (which exact invoice "mark it paid"
 * means) that's a materially bigger, riskier scope on its own; both still
 * route to the real agent today (which already handles them via its
 * propose_* tools), not silently dropped.
 */
import { Billing } from "@/models/billing.model";
import { runAnalyticsSummary } from "@/services/ai/tools/analytics.tool";
import { runBillingSearch } from "@/services/ai/tools/billing-search.tool";

export type RouterIntent = "aggregate" | "lookup" | "explain";

export interface RouterReply {
  intent: RouterIntent;
  reply: string;
}

interface CalendarRange {
  label: string;
  from?: Date;
  to?: Date;
}

/** Resolves one of a small, fixed set of calendar phrases to an explicit
 *  from/to window. Absence of any recognized phrase means all-time —
 *  deliberately not a fallback guess, just "no range qualifier found". */
function resolveCalendarRange(message: string, now: Date): CalendarRange | null {
  const lower = message.toLowerCase();
  const startOfMonth = (y: number, m: number) => new Date(y, m, 1);
  const endOfMonth = (y: number, m: number) => new Date(y, m + 1, 0, 23, 59, 59, 999);
  const startOfQuarter = (y: number, q: number) => new Date(y, q * 3, 1);
  const endOfQuarter = (y: number, q: number) => new Date(y, q * 3 + 3, 0, 23, 59, 59, 999);

  if (/\bthis month\b/.test(lower)) {
    return { label: "this month", from: startOfMonth(now.getFullYear(), now.getMonth()), to: now };
  }
  if (/\blast month\b/.test(lower)) {
    const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    return { label: "last month", from: startOfMonth(y, m), to: endOfMonth(y, m) };
  }
  if (/\bthis quarter\b/.test(lower)) {
    const q = Math.floor(now.getMonth() / 3);
    return { label: "this quarter", from: startOfQuarter(now.getFullYear(), q), to: now };
  }
  if (/\blast quarter\b/.test(lower)) {
    const thisQ = Math.floor(now.getMonth() / 3);
    const y = thisQ === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const q = thisQ === 0 ? 3 : thisQ - 1;
    return { label: "last quarter", from: startOfQuarter(y, q), to: endOfQuarter(y, q) };
  }
  if (/\bthis year\b/.test(lower)) {
    return { label: "this year", from: new Date(now.getFullYear(), 0, 1), to: now };
  }
  if (/\blast year\b/.test(lower)) {
    const y = now.getFullYear() - 1;
    return { label: "last year", from: new Date(y, 0, 1), to: new Date(y, 11, 31, 23, 59, 59, 999) };
  }
  if (/\b(all time|overall|in total)\b/.test(lower)) {
    return { label: "all time" };
  }
  return null;
}

const AGGREGATE_TRIGGER =
  /\b(how much (?:did|have) i spen[dt]|total spend|what(?:'|’)?s my total|total outstanding|how much do i owe)\b/i;

const LOOKUP_TRIGGER =
  /\b(?:show|find|list)(?: me)?(?: the)? invoices? from ([a-z0-9][a-z0-9 .&'-]{0,60})|invoices? from ([a-z0-9][a-z0-9 .&'-]{0,60})/i;

const EXPLAIN_TRIGGER =
  /\b(?:why is|why'?s|explain|what(?:'|’)?s the status of)\b.*?\binvoice\s+([a-z0-9][a-z0-9._-]{0,40})/i;

async function handleAggregate(organizationId: string, message: string): Promise<RouterReply> {
  const range = resolveCalendarRange(message, new Date());
  const summary = await runAnalyticsSummary(
    organizationId,
    range?.from ? { from: range.from.toISOString(), to: range.to?.toISOString() } : undefined
  );
  const windowLabel = range?.label ?? "all time";

  if (summary.totalsByCurrency.length === 0) {
    return { intent: "aggregate", reply: `No billing records found for ${windowLabel}.` };
  }

  const lines = summary.totalsByCurrency.map(
    (c) =>
      `${c.currency} ${c.total.toFixed(2)} total (${c.currency} ${c.paid.toFixed(2)} paid, ${c.currency} ${c.outstanding.toFixed(2)} outstanding) across ${c.count} invoice${c.count === 1 ? "" : "s"}`
  );
  const prefix = summary.totalsByCurrency.length > 1 ? "By currency:\n- " : "";
  const body = summary.totalsByCurrency.length > 1 ? lines.join("\n- ") : lines[0];
  return { intent: "aggregate", reply: `For ${windowLabel}: ${prefix}${body}` };
}

async function handleLookup(organizationId: string, vendorName: string): Promise<RouterReply> {
  const result = await runBillingSearch(organizationId, { customerName: vendorName, limit: 10 });
  if (result.matchCount === 0) {
    return { intent: "lookup", reply: `No invoices found from "${vendorName}".` };
  }
  const lines = result.records.map(
    (r) => `- ${r.invoiceNumber}: ${r.currency} ${r.amount.toFixed(2)}, ${r.status}, ${r.billingDate}`
  );
  const truncatedNote = result.truncated
    ? `\n(showing the ${result.records.length} most recent of ${result.matchCount} — ask me for more detail to narrow it down)`
    : "";
  return {
    intent: "lookup",
    reply: `Found ${result.matchCount} invoice${result.matchCount === 1 ? "" : "s"} from "${vendorName}":\n${lines.join("\n")}${truncatedNote}`,
  };
}

async function handleExplain(organizationId: string, invoiceToken: string): Promise<RouterReply> {
  const record = await Billing.findOne({
    organization: organizationId,
    invoiceNumber: new RegExp(`^${invoiceToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  }).select("invoiceNumber status derivedStatusExplanation manuallyEditedAt");

  if (!record) {
    return {
      intent: "explain",
      reply: `I couldn't find an invoice matching "${invoiceToken}" — try searching by its exact invoice number.`,
    };
  }

  if (record.manuallyEditedAt) {
    return {
      intent: "explain",
      reply: `Invoice ${record.invoiceNumber} is marked ${record.status} — this was set manually by a human edit, so it's authoritative and won't be changed by a future sync.`,
    };
  }
  if (record.derivedStatusExplanation) {
    return {
      intent: "explain",
      reply: `Invoice ${record.invoiceNumber} is marked ${record.status}. ${record.derivedStatusExplanation}`,
    };
  }
  return {
    intent: "explain",
    reply: `Invoice ${record.invoiceNumber} is marked ${record.status} — no further detail is recorded for how that was determined.`,
  };
}

/**
 * Tries to answer `message` deterministically, scoped to `organizationId`.
 * Returns `null` when nothing matches confidently — the caller must then
 * fall through to the real agent turn unchanged (credit check included).
 */
export async function tryRouteDeterministically(
  organizationId: string,
  message: string
): Promise<RouterReply | null> {
  const explainMatch = message.match(EXPLAIN_TRIGGER);
  if (explainMatch?.[1]) {
    return handleExplain(organizationId, explainMatch[1]);
  }

  const lookupMatch = message.match(LOOKUP_TRIGGER);
  const vendorName = (lookupMatch?.[1] ?? lookupMatch?.[2])?.trim();
  if (vendorName) {
    return handleLookup(organizationId, vendorName);
  }

  if (AGGREGATE_TRIGGER.test(message)) {
    return handleAggregate(organizationId, message);
  }

  return null;
}
