# Flow for Document 02 — Code and Module Audit

**Read:** in full, line by line (all 18 module sections). **Inspected against live code:** yes, on
2026-09-23. Most of this document's findings on `auth.controller.ts`, `sync-engine.ts`,
`managed-agent.service.ts`, the notification engine, `credits.ts`, `billing.model.ts`'s vendor
inversion, the 129 adapters, and the build/verification table were **already verified** in
`flow/00-executive-summary.md` and `flow/01-current-architecture.md` — **not repeated here.** Only
genuinely new findings from this document are below.

---

## Confirmed still present — new items, verified with exact code evidence

### §1 Middlewares — security boundary gaps

1. **`rateLimit` is mounted on exactly one route file** — confirmed: only
   `platform-connection.routes.ts` uses it, out of every route file in the backend. 51+ of 52
   endpoints have zero throttling.
2. **No `app.set('trust proxy', ...)` anywhere in `app.ts`** — confirmed, zero matches. `req.ip`
   resolves to the hosting platform's proxy, not the real client, so the one rate limiter that
   exists is both ineffective and collapses all unauthenticated traffic into a single bucket.

### §3 `billing.controller.ts` — three confirmed bugs

3. **Mixed-currency sum, confirmed exactly.** `getBillingStats`:
   ```
   { $group: { _id: null, revenue: { $sum: "$amount" } } }
   const totalRevenue = revenueRows[0]?.revenue ?? 0;
   ```
   USD + EUR + PKR still added as one bare number and returned as `totalRevenue`.
4. **`listBillingRecords`/`exportBillingRecords` still fully unbounded** — confirmed
   `Billing.find({organization: organization._id})` with no `.limit()`/`.skip()` anywhere in either
   function. Every record returns on every call.
5. **No role check on billing mutations, confirmed** — zero `role ===`/`membership.role` checks
   anywhere in `billing.controller.ts`. Any `member` (not just owner/admin) can create, edit, or
   delete any financial record in the organization.

### §4 `platform-connection.controller.ts` — both bugs confirmed with full context

6. **Watermark-destruction bug, confirmed precisely.** Read the full `connectViaPipedream` function:
   ```js
   const set: Record<string, unknown> = {
     ...,
     metadata: { pipedreamAccountId: account.id, pipedreamApp: account.app },
   };
   await PlatformConnection.findOneAndUpdate(
     { organization: organization._id, platform, accountIdentifier },
     { $set: set, $setOnInsert: {...} },
     { new: true, upsert: true, ... }
   );
   ```
   This is a genuine `upsert: true` — the **same code path runs for both first-connect and
   reconnect.** `$set: { metadata: {...} }` replaces the *entire* `metadata` subdocument each time,
   including any `metadata.emailSync.lastSyncedAt` a prior sync had already written there.
   **Reconnecting a Gmail/Outlook account confirmed to silently reset its sync watermark**, forcing
   a full re-scan from the 90-day lookback and a fresh round of extraction credit charges. Fix:
   dotted-path `$set` (`"metadata.pipedreamAccountId"`, `"metadata.pipedreamApp"`) instead of
   replacing the whole subdocument.
7. **Identity-drift bug, confirmed.** `accountIdentifier = isEmailSyncPlatform(platform) ?
   account.name ?? account.id : ""` — still prefers Pipedream's user-editable `account.name` over
   the stable `account.id`. Renaming a connected account in Pipedream creates a second connection
   record for the same inbox. Fix: use `account.id` only.

### §6 Email parsing — sender verification genuinely absent

8. **Zero SPF/DKIM/DMARC anywhere in the backend** — searched the entire `backend/src` tree for
   `spf`, `dkim`, `dmarc`, `authResults`; no matches at all. Sender authentication results are never
   captured, stored, or checked. A spoofed `From: billing@aws.amazon.com` is accepted as genuine with
   no way to detect it.

### §8 `billing.model.ts` — confirmed precisely

9. **`dueDate` has no index; `billingDate` and `status` each have single-field indexes only** —
   read the schema directly: `billingDate` and `status` both carry `index: true`; `dueDate` has no
   index property at all. No compound indexes exist anywhere in the schema. Confirms both:
   `autoMarkOverdue`'s global scan has nothing to use, and any analytics query filtering on
   `{organization, billingDate range}` can only use one index at a time.

### §11 Credits — the check, confirmed

10. **`assertCreditBalance(organization)` takes the already-resolved `organization` object** —
    confirmed it's called with the object coming from `req.organization`, which per the auth
    middleware (document 01) is populated from a 5-second in-memory cache. Concurrent requests in
    that window see the same stale balance. No reservation mechanism exists.

### §14 Slack — one finding confirmed, one finding **corrected** (better than the document claims)

11. **No rate limit on the Slack events path, confirmed** — `/api/slack/events` is mounted directly
    in `app.ts` with only `express.raw()`, no `rateLimit()` wrapping it.
12. **Correction to this document's claim:** the document says `tryLinkByCode` "looks up the code
    **globally across all users**." Reading the actual function with full context shows this is
    **not accurate as currently written** — the query is
    `User.findOne({ slackLinkCode: code, slackLinkCodeExpiresAt: {$gt: new Date()},
    slackLinkOrganizationId: organization._id })`, and the function's own comment states the code is
    "valid only when it was generated FOR this exact organization (the one whose Slack workspace this
    DM arrived in)." **This is already scoped to the specific organization the Slack workspace
    belongs to, not global.** The membership is also re-verified (`Membership.exists(...)`) before
    the link is accepted. The remaining real gap is narrower than described: no rate limit or attempt
    counter on repeated guesses *within* one organization's active codes — worth fixing, but this is
    not the same severity as a global cross-tenant brute-force. Downgrade this from the document's
    implied P1/P2 framing; still worth a small fix (a rate limit + attempt counter on the DM path),
    just not urgent.

---

## Confirmed via the frontend — matches the document exactly

13. `billing-view.tsx` — confirmed `PAGE_SIZE = 10` combined with `records.filter(...)` operating on
    a `records` array that is the full, already-loaded list (client-side search/filter/pagination
    entirely). No server-side query parameters used at all.

---

## Informational only — no separate action item, already covered structurally

- §9 analytics primary-currency-only filtering with no UI signal — will be handled together with the
  mixed-currency fix (#3 above) and the vendor/domain-model rebuild; not a standalone task.
- §12 `Notification`'s five single-field indexes, no retention policy — low priority, note for later.
- §15 `crypto.ts` — confirmed exactly (`env.aiEncryptionKey || env.jwtSecret`, bare `sha256`) — no
  new detail beyond what was already implicitly known; add as its own small fix (require the key,
  proper KDF, versioned payload) whenever the security-hardening batch happens.
- §17 code quality notes (17× bare `catch{}`, dead `/webhooks` route reference, unused `ts-node`
  devDependency) — cleanup-level, no urgency, batch into whichever PR touches those files anyway.
- §18 architecture assessment (extract a `billing-domain` service layer, enforce module boundaries
  with `no-restricted-imports`) — this is a structural recommendation for when the domain-model
  rebuild happens, not a separate fix of its own. Keep in mind when that work starts.

---

## Updated combined suggested order (adds to doc 00 + doc 01's list, no duplicates)

New items from this document, slotted by dependency/risk (all independent of each other and of the
larger domain-model work, so any can be picked up early):

15. `app.set('trust proxy', 1)` — trivial, one line, pairs naturally with the OTP rate-limiting work
    already planned.
16. Fix the watermark-destruction bug (dotted `$set` paths) — small, isolated, high value (this is
    actively wasting credits on every reconnect right now).
17. Fix the identity-drift bug (`account.id` not `account.name`) — small, isolated, same file as #16.
18. Add role checks (owner/admin only) to billing mutations — small, isolated.
19. Fix the mixed-currency `totalRevenue` sum — small, isolated, high visibility (dashboard-facing).
20. Add `.limit()`/pagination to `listBillingRecords`/`exportBillingRecords` — small, pairs with the
    frontend server-side-pagination work already noted in doc 01's list.
21. Add `dueDate` index (and the other compound indexes) to `billing.model.ts` — bundle with the
    index-migration work already at position 2 in doc 00's order.
22. `crypto.ts` key hardening (require `AI_ENCRYPTION_KEY`, real KDF, versioned payload) — isolated,
    no dependency, but do before any real customer credentials are stored.
23. Rate limit + attempt counter on the Slack DM link-code path — small, low urgency per the
    correction above.

**Not yet approved for implementation — still awaiting the user's go-ahead on where to start.**
