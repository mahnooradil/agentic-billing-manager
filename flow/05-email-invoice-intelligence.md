# Flow for Document 05 — Email and Invoice Intelligence

**Read:** in full, line by line (all 10 sections). **Inspected against live code:** yes, on
2026-09-25.

---

## Cross-reference — already tracked, not repeated

| This doc's finding | Already tracked in |
|---|---|
| §3 re-extraction loop (`MAX_MESSAGES_PER_RUN=200`, `OVERLAP_DAYS=1`, watermark never advances) | `flow/00-executive-summary.md` #3 |
| §3 reconnect wipes watermark (S-11) | `flow/02-code-and-module-audit.md` #6, verified with full code |
| §6 129-adapter census (124 Pending, 122 `billingDate:now`, 101 usage-not-invoice) | `flow/00-executive-summary.md`, `flow/01-current-architecture.md` |

---

## New findings — verified with fresh code evidence

### §1 — Discovery pipeline, confirmed exactly

`INVOICE_KEYWORDS` in `gmail-provider.ts` confirmed to match the document's list precisely
(`invoice`, `receipt`, `"payment receipt"`, `"billing statement"`, `"your invoice"`, `"amount due"`,
`statement`, etc.) — every candidate still reaches the LLM, no cheap pre-filter layer exists yet.
**The "tracked Netflix.com pulled in marketing mail" incident the document describes is genuinely
documented in the code's own comments** — confirms this wasn't a hypothetical, it's a real
production incident already reflected in a deliberate design decision (keeping the keyword filter
even for tracked senders).

### §3 — the 90-day lookback, confirmed and previously untracked

**`FIRST_SYNC_LOOKBACK_DAYS = 90`, confirmed present** in `gmail-provider.ts:20`, used to build
`newer_than:90d` for a connection's first sync — **and there is no backfill path anywhere.** Any
invoice older than 90 days at connection time is permanently invisible unless a user manually adds
it. This is a **total** failure mode for any "what did we spend last year" question, independent of
and additional to the 200-message-per-run cap already tracked. **This was not yet in any flow file —
adding it now.**

### §4 — Extraction quality, all defects confirmed individually

- **`max_tokens: 512`** confirmed.
- **`MODEL = "claude-haiku-4-5-20251001"`** confirmed as a hardcoded string constant — not read from
  an environment variable, matching the document's "not configurable" claim exactly (it's a named
  constant rather than an inline literal, which is a minor style difference, not a functional one).
- **No confidence field anywhere in the extraction tool schema** — confirmed, no match for any
  confidence-related field.
- **No prompt caching (`cache_control`)** — confirmed zero matches anywhere in
  `ai-invoice-extractor.ts`. The ~430-token schema/preamble is paid in full on every single call.
- **No vendor priors** — confirmed; each extraction call has no access to the organization's prior
  vendor history (ties directly to the target memory architecture already tracked in
  `flow/04-ai-agent-and-memory-audit.md` §7 — this is the same missing capability, described from the
  extraction side here and the agent side there).
- **No Batch API usage** — confirmed (a synchronous call per email, no batch submission path exists).
- **No retry/backoff on the Anthropic call itself** — confirmed no retry logic wraps the extraction
  call (distinct from the Gmail/Outlook-side retry logic, which does exist per §10 below).

### §5 — Deduplication, mostly confirmed, one detail needs a closer look later

`openInvoiceLookup` confirmed to exist exactly as described — it matches an existing open
(`status != "Paid"`) record by a vendor+amount-derived `externalId` prefix, sorted to the most recent
match. **One detail not fully confirmed:** the document claims this lookup is "bounded to 45 days" —
the specific date-range bound was not visible in the portion of `sync-engine.ts` read during this
pass. Not disputing the claim, just flagging it as worth a precise re-check when this code is
actually touched during implementation, rather than asserting it either way now.

The day-keyed fallback (`{provider}-day-{vendorSlug}-{amount}-{date}`) is confirmed as the current
dedup key when no invoice number is present — same trade-off already understood (collapses genuinely
distinct same-day charges, a documented and deliberate choice per the code's own comments).

### §6 — `openai.adapter.ts`, read in full, matches the document's census claim precisely

Confirmed line-for-line: `externalId: openai-${period}` (one row per month, mutated in place),
`billingDate: now` (the sync time, not a real billing date), `status: "Pending"` (hardcoded,
unconditional). This is exactly the "month-to-date accrual, not an invoice" pattern the census
describes — verified on the actual adapter file, not just taken from the document's own excerpt.

### §10 — Provider handling gaps, new items not yet tracked

- **`threadId` is fetched (confirmed present in `gmail-client.ts`) but never stored anywhere else** —
  confirmed via a search across the whole `email-sync` directory; no other file references it. Data
  is fetched and then discarded.
- **Revocation is detected (`account.healthy`) but the user is never notified** — ties to the
  broader "sync is broken and nobody is told" gap already noted conceptually via the missing
  `lastSyncError` surfacing (tracked since `flow/00-executive-summary.md`'s roadmap-order list),
  but this is the specific case of a *revoked* OAuth grant rather than a generic sync failure — worth
  keeping as its own named case when that work happens, since the fix (a specific "reconnect needed"
  notification) is more actionable than a generic error banner.
- **Deleted/modified emails are not handled at all** — a deleted email's derived invoice record
  persists forever with no mechanism to reconcile it. Net-new finding, no existing tracked item
  covers this.
- **Aliases and shared inboxes are explicitly untested** — not a known bug, a known gap in test
  coverage/verification, lower priority.
- **Timezones are UTC throughout, no per-org timezone setting** — net-new, low urgency, but worth
  remembering when the state machine (below) starts comparing dates across events.

---

## Target design this document specifies (net-new content, nothing built yet)

### The target `Billing` field additions (§7) — first full appearance in this file structure

Since the earlier consolidated draft of `flow.md` was cleared and rebuilt per-document, this is the
first place in the current structure the exact target schema fields are written out. Recording them
here in full since `flow/00-executive-summary.md`'s reference to "provenance fields" was only a
pointer, not the actual field list.

**Provenance fields to add** (unblocks trust UX, dedup, the state machine, and the learning loop
simultaneously — the audit's own highest-leverage single change):
`sourceMessageId` · `sourceThreadId` · `senderEmail` · `senderDomain` · `receivedAt` · `subject` ·
`authResults{spf,dkim,dmarc}` · `extractionConfidence` · `extractionModel` · `extractedAt` ·
`evidence[]` (≤300-char sanitized snippets)

**Domain-correctness fields to add:**
`vendor` (ObjectId → the same `Vendor` model already noted in document 04's flow file) · `billedTo`
(display only — the org's own name) · `fingerprint` · `statusConfidence` · `statusBasis`
(`ai|user|rule|adapter`) · `statusExplanation` · `paymentDate` · `duplicateOf` · `supersedes` ·
`manuallyEditedBy`

**Modest financial detail to add:** `subtotal` · `tax` · `servicePeriod{start,end}`

**Explicitly rejected, with reasons** — worth keeping so nobody re-proposes these later without
re-deriving the same reasoning: line items (no user has asked, large schema cost) · purchase order
(enterprise concern, not SMB) · `exchangeRate`/reporting-currency conversion (needs an FX provider +
staleness policy — per-currency reporting first) · `invoiceUrl` (the source message link covers it)
· `attachmentReference` (only relevant once attachments are stored, and the recommendation is *not*
to store them, only a short evidence snippet) · a separate `discount` field (fold into
subtotal/total).

`invoiceNumber` should become **optional** — it's currently effectively required, which is what
forces today's synthetic `EMAIL-XXXX` placeholders.

### The target status state machine (§8) — first full appearance in this file structure

`deriveStatus(events) → {status, confidence, basis, explanation}` — a pure, unit-testable function,
never a direct write to `Billing.status`:

```
1. Any user_correction event → its status wins. confidence 1.0.
2. Sort remaining events by occurredAt.
3. Terminal events (refunded, cancelled, credit_note) are absorbing — a later reminder
   does NOT reopen them.
4. payment_confirmed is absorbing against reminder/final_reminder — a stale reminder
   arriving after a receipt cannot revert Paid.
5. payment_failed after payment_confirmed DOES reopen → payment_processing.
6. No payment event: dueDate past → overdue; within 7 days → due_soon; else pending.
7. Conflicting amount_changed: latest occurredAt wins; confidence −0.2 per conflict.
8. confidence = min(confidences of the events that determined the outcome).
```

Full status vocabulary: `issued → pending → due_soon → overdue → payment_processing → paid`, with
side branches to `partially_paid`, `refunded`/`partially_refunded`, `cancelled`, `disputed`. This
directly fixes the confirmed-real bug already understood conceptually (a stale reminder flipping a
Paid invoice back to Pending) with an actual mechanism, not just a description of the problem.

### Email provider strategy (§9) — a strategic decision, not a bug fix

Comparison table confirms direct Gmail/Microsoft Graph OAuth beats Pipedream on every axis except
"already built" — recommendation: **move Gmail and Outlook to direct OAuth, keep the 129 adapters on
Pipedream** (low call volume there, not worth rebuilding). This is the same "direct OAuth beats a
shared proxy for volume-heavy, two-provider integrations" reasoning already applied to the Slack
redesign discussed separately (`flow/extra-01-slack-oauth-redesign.md`) — consistent logic in both
places.

**Scheduling note carried over verbatim because it's a hard external dependency, not an engineering
estimate:** `gmail.readonly` is a Google **restricted scope** requiring a third-party security
assessment — budget 4–8 weeks of calendar time, and start that process as early as possible since it
cannot be compressed by working faster internally.

---

## Updated combined suggested order (adds to the running list)

34. Add the 90-day-lookback finding to whatever covers the domain-model/provenance work — no fix
    needed on its own beyond making the lookback configurable and eventually adding a backfill path;
    bundle with the provenance schema work already in the list.
35. Extraction-quality fixes (confidence field, vendor priors, prompt caching, Batch API,
    retry/backoff) — bundle together since they're all in the same file (`ai-invoice-extractor.ts`)
    and several depend on the provenance/vendor work landing first (vendor priors specifically).
36. Store `threadId` on the `Billing` record (or its provenance block) — trivial, data is already
    being fetched, just needs to be persisted.
37. Notify the user specifically on OAuth revocation (not just generic sync failure) — small,
    depends on the general sync-observability work already noted.
38. Direct Gmail/Outlook OAuth migration — large, has a hard external dependency (Google's security
    assessment), **should be started early in calendar time even though the engineering work itself
    comes later** — this is a scheduling note, not an implementation-order note.

**Not yet approved for implementation — still awaiting the user's go-ahead on where to start.**
