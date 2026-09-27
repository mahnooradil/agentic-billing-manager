# Flow for Document 04 — AI Agent and Memory Audit

**Read:** in full, line by line. **Inspected against live code:** yes, on 2026-09-25. This document
is different in character from 00–03 — most of it is **target design** (the memory architecture and
the agent router), not a bug list. The bug list it does contain (D1–D9) is almost entirely **already
tracked** from document 01's inspection of `managed-agent.service.ts`. Cross-reference first, then
only the one genuinely new bug, then the target design content this document actually contributes.

---

## Cross-reference — bugs already tracked, not repeated

| This doc's ID | Already tracked in |
|---|---|
| D1 (no `MAX_ITERATIONS`/timeout) | `flow/01-current-architecture.md` #1 |
| D2 (dual tenancy resolution) | `flow/01-current-architecture.md` #5 |
| D3 (unbounded context growth) | Same root cause as D1 — no summarization; bundled with the router/agent-hardening work |
| D4 (raw `JSON.stringify` into context) | `flow/01-current-architecture.md` #3 |
| D5 (no vendor search on `search_billing_records`) | Same root cause as the "AWS invoices" bug already tracked since `flow/00-executive-summary.md` #9 — depends on the vendor domain-model fix, not an agent-code fix by itself |
| D7 (`AgentSession` keyed by user) | `flow/01-current-architecture.md` #4 |
| D8 (`void consumeCredits` fire-and-forget) | `flow/01-current-architecture.md` #2 |
| D9 (agent config only in Console) | Noted since `flow/01-current-architecture.md`; **confirmed below that the sync tooling for this already exists** |

## Genuinely new bug — confirmed

**D6 — no citation enforcement, confirmed absent.** Searched `managed-agent.service.ts` for any
citation/verification logic tying a named invoice in a reply back to what a tool actually returned —
zero matches. The agent can currently name an invoice id or amount that no tool call produced, and
nothing catches it. Fix (from this document's own "Invariants to enforce," §8): every answer naming
an invoice must include its record id, and no invoice may be named that a tool did not return — this
needs to be enforced in the router/template layer being built, not just hoped for from the prompt.

## Confirmed good design — no action needed, verified not assumed

- **`RESULT_LIMIT`/`MAX_RESULT_LIMIT` clamping** — confirmed present in `billing-search.tool.ts`
  (matches the document's claim of `Math.min(Math.max(1, …), 20)`-style clamping). Tools correctly
  never dump unbounded rows into context.
- **Propose-then-confirm** — already re-confirmed twice (documents 02, 03); no new evidence needed,
  still correct.
- **`scripts/sync-agent-config.ts` exists**, confirmed on disk. This document's D9 note — "the config
  it syncs is not checked in" — means the *tooling* to pull the system prompt/tool schemas out of the
  Anthropic Console and into the repo already exists; it's just never been run/committed. **This
  meaningfully lowers the effort for the "config in repo" part of the eventual agent-router work** —
  it's a matter of running existing tooling, not building new tooling.

---

## The actual content of this document — target design, not a bug list

### §6 — Memory/learning classification (confirmed accurate against the live code already reviewed)

Classification: **"a stateless, data-grounded assistant with transient conversational memory."**
Confirmed consistent with everything already found: `manuallyEditedAt` is written but nothing reads
it to change future classification (confirmed absent in every model file inspected so far — no
`SenderProfile`, `ClassificationFeedback`, `Vendor`, or `UserRule` model exists anywhere in
`backend/src/models/`, checked directly). **Action: stop describing this product as "the agent
learns your business" anywhere in marketing/UI copy** until §7 below is actually built — this is a
copy/claims fix, not a code fix, and it's cheap to do immediately regardless of when the real
learning loop gets built.

### §7 — Target memory architecture (net-new work, nothing here exists yet)

Three tiers, confirmed nothing built yet for any of them:

1. **Global** — a curated vendor registry (domain → canonical name/category), maintained by us, never
   derived from customer data.
2. **Organization** (net-new models, none exist today):
   - `SenderProfile` — `{domain, trust, confirmedInvoiceCount, falsePositiveCount,
     typicalAmountRange, typicalCadenceDays}`
   - `Vendor` — `{aliases, domains, category, billingCadence, confirmedByUser}` — this is the
     **same** `Vendor` model already specified for the domain-model rebuild (tracked since
     `flow/00-executive-summary.md`'s vendor-fix item) — not a separate build, one model serving
     both purposes.
   - `ClassificationFeedback` — `{messageId, aiVerdict, userVerdict, at}`
   - `UserRule` — user-defined rules ("ignore domain X", "remind 3 days before Z")
3. **Conversation** — the Managed Agents session, kept ephemeral, reset on org switch (already
   correct behavior per document 03's tenancy audit).

**The feedback loop that has to exist** (this is the actual mechanism, not just data storage):
user marks "not an invoice" → write `ClassificationFeedback` → a nightly job increments
`SenderProfile.falsePositiveCount` → at `≥3` false positives and 0 confirmed invoices, the sender is
marked `trust:"suppressed"` — the pipeline skips it **and tells the user it did**, with an undo →
conversely, 3 user-confirmed invoices from a sender flips it to `trust:"trusted"`, which then gets
injected as a prior into the extraction prompt and raises the confidence floor.

**Dependency note:** this entire tier is explicitly gated on the provenance/domain-model work landing
first (same dependency already noted in `flow/00-executive-summary.md`'s suggested order) — there is
no point building `ClassificationFeedback` before there's a reliable `messageId`/provenance trail for
it to reference.

### §8 — Target agent architecture (reinforces the decision already agreed with the user in this conversation)

This is the same intent-router + narrowed-Managed-Agents design already discussed and agreed as the
recommended path (keep Managed Agents, add a deterministic router in front, ~70% of questions
resolved at 0 credits). This document adds two concrete specifics not previously pinned down:

- **The exact intent categories and their credit cost:** aggregate/lookup/explain/action/rule → all
  0 credits, deterministic; reasoning/ambiguous → Managed Agents, 5 credits.
- **The exact invariants to enforce when building it** — most already itemized across documents
  00–03's flow files individually; this document is the first place they're listed together as a
  single checklist for the router work specifically: citation enforcement (D6 above),
  `req.organization` as the single resolution path (`getOrganizationIdForUser` deleted),
  `AgentSession` keyed `(user, organization)`, `MAX_ITERATIONS = 8`, 60s stream timeout, summarize at
  10 turns, tool results escaped not raw-stringified, agent config checked into the repo (via the
  existing `scripts/sync-agent-config.ts`, per the finding above).

### §9 — Adversarial test requirements

Pointer only, to `document 09` / the eventual test-matrix flow file — not duplicated here, consistent
with how `flow/00-executive-summary.md` already treats the test matrix as a reference rather than
inline content.

---

## Updated combined suggested order (adds to the running list)

30. Retire "the agent learns your business" from any UI/marketing copy — trivial, zero code risk,
    can happen independently of everything else, today if wanted.
31. Run `scripts/sync-agent-config.ts` and commit the resulting system prompt/tool schemas into the
    repo — small, mechanical, unblocks reviewing the agent's actual instructions for the first time.
32. Add citation enforcement (D6) — groups with the agent-router work already slotted earlier in the
    combined order (doc 00's items 8/10, doc 01's items 12/13).
33. Build the `SenderProfile`/`ClassificationFeedback`/`UserRule` models + the nightly feedback job —
    large, explicitly gated on the provenance/domain-model work landing first. Not a near-term item.

**Not yet approved for implementation — still awaiting the user's go-ahead on where to start.**
