# Flow for Document 08 — UI/UX and Product Audit

**Read:** in full, line by line. **Inspected against live code:** yes, on 2026-09-25.

---

## Cross-reference — already tracked, not repeated

| This doc's finding | Already tracked in |
|---|---|
| P1-FE-01 (search box can't find "Netflix") | `flow/00-executive-summary.md`, `flow/04-ai-agent-and-memory-audit.md` |
| P2-FE-02 (entire billing list client-side) | `flow/02-code-and-module-audit.md` #13 |
| FE-07 (JWT in localStorage, no CSP) | `flow/03-security-audit.md` (S-20) |
| FE-13 (invite-token route unauthenticated) | `flow/03-security-audit.md` (S-19) |
| Notification preferences from triggering user + full aggregation every event | `flow/01-current-architecture.md` #7, #8 |

---

## Good news — one finding is already substantially fixed, verified against the live nav config

**P2-FE-03 (information architecture buries the core action) — largely resolved.** Read
`frontend/src/config/nav.ts` directly:
```js
export const dashboardNav: NavItem[] = [
  { title: "Dashboard", ... }, { title: "Platforms", ... }, { title: "Invoices", ... },
  { title: "Analytics", ... }, { title: "Automation", ... }, { title: "Billing", ... },
  { title: "Chat", ... }, { title: "Settings", ... },
];
```
The file's own comment confirms this was a deliberate redesign: **"Billing" (this workspace's own
plan + AI credits) was promoted out of Settings to a top-level item, and "Invoices" (bills received)
stays distinct** — this is exactly the naming-collision fix the document itself proposes ("rename the
settings tab"), just done with the opposite naming choice (Invoices/Billing rather than
Billing/Subscription) and achieving the same disambiguation. **Email/inbox connection is no longer
nested in Settings either** — it now lives on the Platforms page (a first-class top-level nav item),
confirmed via this project's own history. The document's literal suggestion (a dedicated "Inboxes" nav
item) wasn't done exactly as written, but the underlying complaint — the core action buried several
clicks deep in Settings — is resolved by a different, reasonable route. **No action item remains
here**, just recording that this was already handled before this document was processed.

---

## Confirmed still present — new bugs, verified with fresh code evidence

1. **P2-FE-06's mixed-currency dashboard headline, confirmed exactly.** `overview-view.tsx:158`:
   `const primaryTotals = analytics?.totalsByCurrency[0] ?? null;` — still the largest-currency-only
   figure with no indication other currencies exist, feeding the "Total spend," "Paid," and
   "Outstanding" stat cards directly.
2. **FE-09, `analytics-view.tsx` is now 870 lines** (the document measured 858 — it's grown slightly
   since the audit, still by far the largest component in the frontend).
3. **FE-08, confirmed as the document characterizes it — genuinely low priority.** Read
   `markdown-message.tsx` in full: the `a` component renders `href` directly with
   `target="_blank" rel="noopener noreferrer"`, no explicit protocol allowlist of its own — relying
   entirely on `react-markdown`'s default sanitization, exactly as the document describes ("not
   exploitable today, worth an allowlist" — correctly scored P3, not urgent).

## One finding needs a correction/nuance, not a flat confirmation

**FE-10 — `page-data-cache` is not as bare as the document implies.** Read `page-data-cache.ts` in
full: an `invalidatePageCache(key?)` function **does exist**, specifically documented as being
"call[ed] on logout/login so a same-tab account switch can never show the previous account's data."
So invalidation isn't entirely absent — it exists for the account-switch case. What's **not confirmed
either way** is whether it's actually called after ordinary data mutations (editing/deleting a
billing record, editing a platform, etc.) — that would require tracing every mutation's call sites,
which wasn't done in this pass. **Correct framing going forward: the mechanism exists; whether it's
exercised at every mutation site is still an open question, not a settled "no" or "yes."** Worth a
real check (or just wiring it in explicitly) whenever the billing/platform mutation flows are touched.

---

## New target-design content this document contributes (net-new, not built yet)

### §6 — Trust surfaces (gated on provenance, same dependency already noted)

The minimum trust surface once provenance lands: an origin badge (`You added` / `From email` /
`Synced from X`), confidence shown only when low, "View source email" on AI-derived rows, a status
explanation ("Marked Paid from a receipt on 12 Sep" vs "Assumed pending"), per-connection freshness
("Gmail synced 4 minutes ago"), duplicate flags with a merge action, manual-edit attribution, and a
persistent Reconnect banner on failed syncs. None of this exists yet — confirmed nothing in the
Billing table renders any of these signals today. Explicitly blocked on the provenance/domain-model
work already tracked since document 00.

### §7 — Recommended dashboard hierarchy (replaces "how much did I spend" with "what do I need to do")

1. **Needs attention** — overdue, due ≤7 days, failed syncs, low-confidence records awaiting
   confirmation
2. **This month** — spend to date vs last month, per currency, with the delta (fixes the mixed-
   currency bug above as a side effect of being built correctly)
3. **Recurring** — active subscriptions, renewals in the next 30 days, detected price changes
4. **Opportunities** — recommendations with a concrete dollar figure
5. **Health** — per-integration last-sync status

### §9 — Proposed onboarding journey (the "confirm detected vendors" step doesn't exist)

`Register+OTP → explain what's read (read-only, invoices only) → connect first inbox → live scan
progress → user confirms detected vendors (✓ AWS ✓ Netflix ✗ not a vendor) → populated workspace +
first insight → set one alert → invite a teammate.` The vendor-confirmation step is called out as the
single highest-value cheap addition once provenance exists — it's simultaneously the "wow" moment,
the trust-building step, and the first real training signal for the learning loop already tracked in
document 04's flow file. Confirmed nothing resembling this exists today (no onboarding flow found
anywhere in the frontend).

### §11 — Notification scenarios not yet implemented, specific list

Confirmed still missing (no corresponding rule found in `notification-engine.ts` during earlier
inspection passes): large invoice detected, subscription price increase, renewal upcoming, duplicate
invoice suspected. Payment-failed and unusual-spend exist only as partial/indirect coverage (an email
saying so, or a spend-concentration rule) rather than dedicated rules. **"Email sync disconnected" is
called out as the single highest-value missing alert** — the product's entire value proposition is
watching an inbox unattended, so silent failure is the worst possible failure mode; this ties directly
to the `lastSyncError`/sync-observability work already in the running order since document 00.

### §10 — Recommendations engine, cross-reference only

Same conclusion already reached: structurally well-designed lifecycle, but inputs can't support
usage-based advice since no usage signal exists anywhere in the system. No new evidence beyond what's
already tracked; narrowing scope + adding a required `estimatedMonthlyImpact` field remains the
recommendation, unchanged from earlier documents.

---

## Updated combined suggested order (adds to the running list)

42. Fix the dashboard's mixed-currency headline (`primaryTotals`) — small, isolated, high visibility;
    naturally resolved by building the "This month" section of the new dashboard hierarchy correctly
    rather than patched in isolation.
43. Verify/wire `invalidatePageCache` into the actual billing/platform mutation call sites — small,
    should be confirmed rather than assumed either broken or fine.
44. "Email sync disconnected" notification rule — small, high value, pairs with the
    sync-observability work already in the order.
45. The onboarding "confirm detected vendors" flow — larger, explicitly gated on provenance landing
    first (same dependency as the trust-surfaces work).
46. Trust-surface badges on the Billing table — gated on provenance, bundle with #45.
47. New dashboard hierarchy (needs-attention first) — larger, do after the provenance/vendor work so
    "needs attention" can actually be computed correctly (overdue/low-confidence needs real data).

**Not yet approved for implementation — still awaiting the user's go-ahead on where to start.**
