# Flow for Document 03 — Security Audit

**Read:** in full, line by line (S-01…S-22 table + all 8 sections). **Inspected against live code:**
yes, on 2026-09-23. This document is a compiled security findings list (S-01…S-22); most individual
IDs map onto bugs **already verified and tracked** in the first three flow files. Cross-reference
table below, then only the genuinely new findings with fresh evidence.

---

## Cross-reference — where each finding is already tracked (no duplicate action items)

| ID | Already tracked in |
|---|---|
| S-01 (indexes) | `flow/00-executive-summary.md` #1 |
| S-02, S-03, S-04 (OTP) | `flow/00-executive-summary.md` #2 |
| S-05 (free plan upgrade) | `flow/00-executive-summary.md` #4 |
| S-07 (raw JSON.stringify into agent context) | `flow/01-current-architecture.md` #3 |
| S-08 (sender spoofing, no SPF/DKIM/DMARC) | `flow/02-code-and-module-audit.md` #8 |
| S-09 (crypto.ts key reuse) | `flow/02-code-and-module-audit.md` #22 |
| S-10 (unbounded AI spend, no `MAX_ITERATIONS`, stale-cache) | `flow/01-current-architecture.md` #1–#2, `flow/02-code-and-module-audit.md` #10 |
| S-11 (watermark reset) | `flow/02-code-and-module-audit.md` #6, verified with full code |
| S-12 (Slack) | `flow/02-code-and-module-audit.md` #12 — **already corrected: org-scoped, not global** |
| S-14 (RBAC billing) | `flow/02-code-and-module-audit.md` #5 |
| S-15 (trust proxy) | `flow/02-code-and-module-audit.md` #2 |
| S-16 (unbounded export) | `flow/02-code-and-module-audit.md` #4, same fix as the general unbounded-query item |
| S-17 (silent `catch{}`) | `flow/01-current-architecture.md`, `flow/02-code-and-module-audit.md` (informational) |
| S-21 (dependency advisories) | `flow/00-executive-summary.md` — backend 2 moderate confirmed; **frontend now shows 14, 1 critical, found during that inspection** |
| S-22 (agent config only in Console) | `flow/01-current-architecture.md` #4/#3 area, conceptually the same "config not in repo" finding |

---

## Genuinely new items — verified with fresh code evidence

### S-06 — Indirect prompt injection on extraction, confirmed exactly

Read `ai-invoice-extractor.ts` directly:
```js
const MAX_BODY_CHARS = 6000;                              // confirmed — this part IS mitigated
const body = input.bodyText.slice(0, MAX_BODY_CHARS);
content: `Today's date is ${today}. Extract billing details from this email...
From: ${input.fromHeader}\nSubject: ${input.subject}\n\n${body}`
```
**No system prompt at all, no `<email>` delimiter, no "treat this as untrusted data" framing** —
confirmed exactly as the document describes. The body-length cap is real and already working
(genuine partial mitigation). Fix: add the system prompt + delimiter framing given in the document's
"Required defense" block, plus output sanitization on every extracted string field.

### S-13 — Enumeration message, confirmed verbatim

`auth.controller.ts:186` — `"No account found with this email. Please sign up first."` still present
exactly as quoted. Fix: return the same generic response on both the registered and unregistered
paths (send a code either way; only branch internally).

### S-18 — `deleteAccount` cascade, confirmed still non-transactional

Confirmed two separate `Promise.all([...])` blocks in `auth.controller.ts` (around the account
deletion cascade), and **zero occurrences** of `session.startTransaction` or `withTransaction`
anywhere in the file. A partial failure mid-cascade still orphans billing/connection/credit rows
pointing at a deleted organization. **This was in document 02's original text but was missed as its
own tracked item in that flow file — added here instead.**

### S-19 — Invite-preview route, confirmed exactly

Read `invitation.routes.ts` in full:
```js
router.get("/:token", previewInvitation);              // public — no authenticate, no rate limit
router.post("/:token/accept", authenticate, acceptInvitation);  // this one IS authenticated
```
The **preview** route (`GET /:token`) is confirmed public and unthrottled exactly as the document
says — an attacker can enumerate invite tokens to discover organization names. The **accept** route
already requires authentication, so this is narrower than "the invitation flow is unauthenticated" —
only the preview step is exposed, which matches the document's own actual claim (it specifically
cites the preview route). No correction needed, evidence confirmed precisely.

### S-20 — No CSP, confirmed

`app.ts:22` — `app.use(helmet())` with no options object — confirmed defaults-only, no explicit CSP
directive set anywhere.

### §5 table — three specific auth/session gaps not previously tracked

1. **No JWT algorithm pinning** — `utils/jwt.ts:36`: `jwt.verify(token, getSecret())` with no
   `{ algorithms: ['HS256'] }` option. Confirmed. Low risk with a symmetric secret (as the document
   itself notes) but should be pinned defensively.
2. **No issuer/audience claims** — confirmed absent from the same `jwt.verify` call.
3. **`Session` has no TTL index** — confirmed zero matches for `expireAfterSeconds`/TTL patterns in
   `session.model.ts`. Sessions accumulate in the database forever with no expiry mechanism.
4. **`Otp` has an `expiresAt` field but no TTL index** — confirmed: the field exists and is used for
   *application-level* expiry checks (the code compares it against `now`), but MongoDB itself has no
   `expireAfterSeconds` index to actually delete expired OTP documents. They accumulate forever even
   though they're logically unusable after 10 minutes.

---

## Confirmed as already correctly mitigated — no action needed, verified not assumed

- **`escapeRegex` in `billing-search.tool.ts`** — confirmed present and used on both `customerName`
  and `invoiceNumber` search inputs (lines 60, 81, 86). Regex injection is genuinely prevented.
- **`utils/redact.ts` exists** — confirmed present in the repo, used in connection logging per the
  document's claim.
- **`MAX_BODY_CHARS = 6000`** on the extraction call — confirmed present and applied before the
  string is built, preventing oversized-body cost/context blowout.

## Multi-tenancy audit (§2) — reassuring conclusion, not a new bug

The document's own conclusion — **"no IDOR or BOLA vulnerability found"** across every business
collection and every agent tool — is consistent with everything found in documents 00–02's
inspection so far (every query traced in `billing.controller.ts` does scope by `organization`, 404
not 403 on cross-tenant reads). The two "weak seams" it calls out (dual tenancy resolution via
`getOrganizationIdForUser`, and `AgentSession` keyed by user not `(user, org)`) are **already
tracked** as `flow/01-current-architecture.md` items #4 and #5 — not new here, just re-confirmed
from a security angle rather than an architecture angle.

## Agent action security (§4) — confirms the propose-then-confirm design is sound, no new item

Re-confirms what documents 01/02 already established: the write-adjacent tools never mutate data
directly, and the only real write path is the existing authenticated REST endpoint. No new bug; this
section is validation that the current design doesn't need to change, only the gaps *around* it
(iteration cap, tool-result escaping, citation enforcement — all already tracked).

## §7 Privacy and retention — informational, lower priority, no code bug to fix yet

No retention policy, no full data export (CSV-only), no audit log on financial mutations/exports, no
privacy copy at the OAuth consent moment. These are **product/scope gaps, not bugs** — nothing is
currently broken, these features simply don't exist yet. Correctly sequenced late in the roadmap
(tied to the eventual domain-model work) rather than urgent — noted for later, not added to the
near-term order below.

---

## Updated combined suggested order (adds to the running list, no duplicates)

New items from this document, all small and independent:

24. Uniform response on both the registered/unregistered login-code paths (fixes S-13) — trivial,
    pairs naturally with the OTP hardening work already in the list.
25. Wrap `deleteAccount`'s cascade in a Mongo transaction (or add compensating cleanup) — small,
    isolated, high value given it's a destructive, irreversible operation.
26. Rate-limit + throttle the invite-preview route (`GET /invitations/:token`) — trivial, pairs with
    the general rate-limiting work.
27. Set a real CSP header via `helmet()`'s options — trivial, one config change.
28. Pin JWT `algorithms: ['HS256']`, add issuer/audience claims — trivial, one line each.
29. Add a TTL index to `Session` and a real `expireAfterSeconds` TTL index to `Otp` — small, bundles
    naturally with the index-migration work already at position 2 in the overall order.

**Not yet approved for implementation — still awaiting the user's go-ahead on where to start.**
