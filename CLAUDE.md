# CLAUDE.md — Project Context & Working Guide

This file is the single source of truth for how to work on **agentic-billing-manager**.
Read it fully before making any change. It captures the architecture, conventions,
workflow rules, and the exact status of every phase built so far, so work can be
resumed from any machine or a fresh session without losing context.

> Companion docs (do not duplicate — cross-reference):
> - `docs/ARCHITECTURE.md` — locked/frozen target architecture blueprint. **⚠️ Known stale as of
>   a 2026-09-15 external audit (see §10 below): it describes a LangGraph agent on Qwen 3
>   Instruct that was never built. The real stack is Claude Managed Agents + Claude Haiku 4.5.
>   Do not implement LangGraph/Qwen because this doc says to. It has not been rewritten yet —
>   that rewrite is itself part of the audit backlog in §10, not yet actioned.**
> - `docs/DECISIONS.md` — locked technical decisions. Same caveat: D-001 (the LangGraph/Qwen
>   decision) was superseded by the actual Claude-based implementation and no decision entry
>   was ever added to record that. Treat D-001 as stale, not binding.
> - `docs/PRODUCTION-HARDENING.md` — approved-but-deferred hardening backlog. Overlaps
>   significantly with §10 below (§10 is more current and evidence-backed — prefer it).
> - `docs/audit/00` through `07` — the full external founder/CTO/architect audit (15 Sept 2026,
>   commit `e3ad6ad`) archived verbatim. §10 below is a condensed, actionable summary of these;
>   go to the numbered files for full evidence, file:line citations, and the complete test matrix.

---

## 1. What this project is

**agentic-billing-manager** is a phase-based monorepo: a billing/usage manager that pulls
data from Pipedream → 129 billing-sync adapters + Gmail/Outlook email-sync → an analytics
engine → a Claude Managed Agents "Billing Advisor Agent". (`docs/ARCHITECTURE.md` describes
a *different*, never-built LangGraph/Qwen end-state — that document is stale; see the
companion-docs callout above and §10 below. The AI layer that actually exists is Claude,
not LangGraph.)

It is built **strictly one phase at a time**. Each phase has a tightly-scoped brief.

### Monorepo layout
```
agentic-billing-manager/
├── backend/     Node + Express 5 + TypeScript + Mongoose (MongoDB Atlas)
├── frontend/    Next.js 16 (App Router, Turbopack) + React 19 + TS + Tailwind v4
├── docs/        ARCHITECTURE.md, DECISIONS.md, PRODUCTION-HARDENING.md
├── README.md
└── CLAUDE.md    ← this file
```

### Stack specifics (do not "upgrade" casually)
- **Backend**: Express 5, **TypeScript pinned to 5** on purpose (npm pulled TS 7 which
  is unsupported by typescript-eslint/ts-node). Path alias `@/*`; aliases rewritten at
  build via `tsc-alias` (`npm run build` = `tsc && tsc-alias`).
- **Frontend**: Next.js 16 + Turbopack, React 19, Tailwind v4 (`@custom-variant dark`,
  oklch tokens), `--src-dir` with `@/*` alias. shadcn/ui style **`base-nova` = Base UI
  primitives (`@base-ui/react`), NOT Radix**. Class-based dark mode via `next-themes`.
- **Node version**: built on Node 24 — **do NOT change** for now (revisit only at deploy).

---

## 2. Golden workflow rules (MOST IMPORTANT)

1. **One phase at a time.** Implement ONLY the phase the user assigns. Do not start the
   next phase, add "nice to have" features, or refactor unrelated code.
2. **Wait for instruction.** After finishing a phase, stop and wait. Do the next task
   only when the user explicitly assigns it.
3. **Never commit or push until explicitly approved.** Most phase briefs say "Do NOT
   commit. Do NOT push." Honor that. Commit/push only on an explicit "commit and push".
4. **Never update memory unless told**, and never update this file's phase log without
   the change actually being done.
5. **Verify before reporting.** Run TypeScript (`tsc --noEmit`), ESLint, and a build for
   any side touched. Report real results — if something fails, say so.
6. **Respect scope guards.** Briefs often list explicit "No X" rules (no charts, no
   pagination, no backend change, no new packages). Treat those as hard constraints.
7. **Production hardening is deferred** — see `docs/PRODUCTION-HARDENING.md`. Do not
   implement hardening items inside feature phases.

---

## 3. Backend architecture & conventions

**Layering (per feature):** `model → validator (zod) → serializer → controller → routes`.
There is **NO repository/service layer** anywhere — controllers use the Mongoose model
directly. Keep it that way for consistency (auth has none; platforms follow the same).

- **Models** (`src/models/*.model.ts`): Mongoose schemas. Enums exported as a
  `const` tuple + derived type (single source of truth shared with validators). `toJSON`
  transforms strip `__v`. `timestamps: true`. Unique fields use `unique: true` (which
  creates the index — no separate `index: true`).
- **Validators** (`src/validators/*.validator.ts`): zod schemas. `create*Schema` and
  `update*Schema = create*Schema.partial()`. Exported input types via `z.infer`.
- **Serializers** (`src/utils/*.serializer.ts`): `toPublic*(doc)` → the wire shape
  (`id` instead of `_id`, no `__v`). Single source of "what it looks like on the wire".
- **Controllers** (`src/controllers/*.controller.ts`): wrapped in `asyncHandler`; throw
  `AppError(message, status)` for domain errors. `req.params.id as string` cast is needed
  (Express 5 types params as `string | string[]`).
- **Routes** (`src/routes/*.routes.ts`): `router.use(authenticate)` for protected
  routers, then `validate(schema)` middleware on mutating routes. Mounted in
  `src/routes/index.ts`.

**Shared utils:** `AppError`, `asyncHandler`, `sendSuccess(res, status, message, data)`,
serializers. Central `errorHandler` maps `AppError` / Mongoose-validation /
dup-key `11000` / JWT errors → proper status + `errors[]`.

**Response envelope (contract):**
- success → `{ success: true, message?, data }`
- error → `{ success: false, message, errors? }`

**MongoDB:** connection uses **ONLY `process.env.MONGODB_URI`** (via `env.mongoUri`).
No hardcoded URIs anywhere. `autoIndex: !isProduction`. `server.ts` connects to Mongo
FIRST, starts Express only on success, exits(1) on failure, graceful SIGINT/SIGTERM.

**Auth:** JWT (generate/verify, secret+expiry from env), `jti` claim tied to a `Session`
document for per-device revoke. `authenticate` middleware attaches `req.user` from the
Bearer token. **Passwordless** — this went passwordless at some point after the phase-3
foundation below was written; there is no password field on `User`, no bcrypt anywhere.
Every session starts the same way: request a 6-digit OTP by email
(`POST /auth/{register,login}/request-otp`), then verify it (`POST /auth/verify-otp`) —
verifying an unknown email creates the account (register flow), a known one logs in.
**Known issue (P0-02, §10):** the OTP is generated with `Math.random()` (not a CSPRNG),
the 5-attempt counter is a non-atomic read-modify-write, and none of the three OTP routes
are rate-limited — this is a real, unfixed vulnerability, not yet remediated.

---

## 4. Frontend architecture & conventions

**Page → View split:** dashboard pages are server components that keep `metadata` and
render a `"use client"` **view** component which does the data fetching and holds state
(e.g. `overview/page.tsx → OverviewView`, `platforms/page.tsx → PlatformsView`).

**Service layer** (`src/services/`):
- `api/config.ts` — reads `NEXT_PUBLIC_API_BASE_URL` (fallback `http://localhost:5000/api`).
- `api/client.ts` — `apiRequest<T>` + `ApiError` + `api.{get,post,put,patch,delete}`
  helpers. `auth: true` (the `api.*` helpers) auto-attaches `Authorization: Bearer <JWT>`
  from the session store and enables central 401 handling. **Components must never attach
  tokens themselves.** All failures surface as `ApiError` with a safe message — never a
  raw stack trace.
- `api/unauthorized-handler.ts` — `notifyUnauthorized()`; a 401 on an authed request runs
  clear-session → logout → redirect exactly once.
- `services/<domain>/*.service.ts` — thin typed wrappers over `api.*`.
- `services/types/*.ts` — domain + envelope types (`ApiSuccess<T>`, `ApiErrorBody`).

**Auth session** (Phase 5B): external store + `useSyncExternalStore` (no extra package).
`session-storage.ts` persists ONLY the JWT + basic user in localStorage
(`billing.auth.token`, `billing.auth.user`); defensive reads decode JWT `exp` client-side
and clear on expiry/corruption. `AuthProvider` mounts inside `ThemeProvider`.
`ProtectedRoute` guards `/dashboard/*`; `GuestRoute` bounces authed users off
`/login`/`/register`. **Client-side route protection is UX-only, NOT a security boundary**
— the frontend does not verify the JWT signature; the backend is the real gate.

**Validation:** react-hook-form + zodResolver; `lib/validations/*.ts` mirror backend rules.

**Reusable UI:** `components/common/*` (PageWrapper, PageHeader, SectionHeader, StatCard,
EmptyState, ErrorState, LoadingSpinner, FormAlert, Pagination, Container) and
`components/ui/*` (shadcn Base UI primitives). **Reuse these; match existing design.**
`hooks/use-alert-state.ts` — shared success/error alert state that auto-clears success
messages after 2s (errors stay put); used across all settings tabs, Billing, and the
OTP resend confirmation — reuse it instead of a local `useState` + `setTimeout`.

### Frontend gotchas (these have bitten us — remember them)
- **`react-hooks/set-state-in-effect` (Next 16) fails the build gate.** Do NOT call a
  setState-containing function synchronously inside `useEffect`. Patterns we use instead:
  - Data fetch: a `reloadKey` state bumped to re-run the effect; the effect body is an
    async IIFE with an `ignore` guard (setState only in the async continuation).
  - Derived/clamped values (e.g. pagination `currentPage = Math.min(page, totalPages)`):
    compute with `useMemo`/inline, never sync into state via an effect.
  - Theme toggle: render both icons and swap via CSS `dark:` variants (no state).
- **Base UI ≠ Radix.** Use the `render` prop, not `asChild`. Menu/Dialog/Tooltip triggers
  render a `<button>` by default. Dialog/AlertDialog/Select are controlled via
  `open`/`onOpenChange` and `value`/`onValueChange`. `DropdownMenuLabel` needs a
  surrounding `DropdownMenuGroup` (missing-group context error otherwise).
- **No `<img>`** (lint `no-img-element`) — platform logos render as a monogram, not an image.
- Verify lucide icon names exist before using (`node -e "require('lucide-react')..."`).

---

## 5. Verification pattern

- Backend: `cd backend && npx tsc --noEmit && npm run lint && npm run build`.
- Frontend: `cd frontend && npx tsc --noEmit && npm run lint && npm run build`.
- Live API checks: temp `.cjs` script in the scratchpad hitting the running backend
  (register/login → exercise endpoints), then **delete the temp script**. Never leave test
  artifacts in the repo or in git status.
- Browser click-through and browser-console checks are the **user's** manual step — there
  is no browser automation available here. Verify the layers underneath (API live, build,
  lint, serve) and say plainly that the visual pass is deferred to the user.

---

## 6. Commit / git conventions

- Branch: `main`. Remote: `github.com/mahnooradil/agentic-billing-manager`.
- Conventional-commit style subjects, e.g. `feat: … (Phase 6C)`. Body describes
  backend/frontend changes. End with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Windows shell note:** the Bash tool here does NOT understand PowerShell `@'…'@`
  here-strings — use `-m` flags (repeat `-m` for multiple paragraphs) or a real heredoc.
  (A stray `@` once leaked into a commit subject this way; it was fixed with `--amend`.)

---

## 7. Secrets & safety

- `backend/.env` is **gitignored** and holds `MONGODB_URI` (Atlas connection string with
  credentials), `PORT`, `CORS_ORIGIN`, `JWT_SECRET`, `JWT_EXPIRES_IN`. **Never commit it,
  never print the connection string / password, never hardcode the Atlas URI.**
- Atlas cluster is live; the `platforms` and `users` collections exist in DB
  `agentic_billing_manager`.

---

## 8. Phase status log (keep this updated as phases land)

| Phase | Scope | Status | Commit |
|-------|-------|--------|--------|
| 1 | Foundation + scaffolding (no features); `GET /api/health` | ✅ done, pushed | — |
| 2 | MongoDB foundation (connect/disconnect, async server) | ✅ done, pushed | — |
| 3 | Backend auth foundation (User, JWT, register/login/me) | ✅ done, pushed | `11a2bdf` |
| 4 | Frontend UI foundation (shadcn/ui base-nova, sidebar/nav, placeholder pages) | ✅ done, pushed | `1aad5b0` |
| 5A | Connect Login/Register forms to backend APIs | ✅ done, pushed | `e025c12` |
| 5B | Frontend auth session mgmt (JWT storage, AuthContext, protected/guest routes, logout) | ✅ done, pushed | `d92470b` |
| 5C | Authenticated API foundation (auto Bearer, central 401 logout, `api.*` helpers) | ✅ done, pushed | `8fa4ce4` |
| — | user-menu logout bugfix (Base UI dropdown group context) | ✅ done, pushed | `6a2958f` |
| 6A | Platform Management CRUD (first business module, full stack) | ✅ done, pushed | `172b616` |
| 6B | Dashboard integration & statistics (live platform counts from Atlas) | ✅ done, pushed | `45e216c` |
| 6C | Platform search, status filter, client-side pagination (10/page) | ✅ done, pushed | `6149658` |
| 7A | Billing Records CRUD (second business module; each record belongs to one Platform) | ✅ done, pushed | `73527b6` |
| 7B | Billing dashboard stats, search, status filter, pagination + platform-delete guard (409 when billing records reference it) | ✅ done, pushed | `ae6ae74` |
| 7C | Billing polish: sorting (date/amount), total-results counter, page info; composes with search/filter/pagination | ✅ done, pushed | `e8e04c9` |
| 8A | AI Integration Foundation — per-user AI provider config only (no AI calls); API key encrypted at rest | ⚠️ removed in `0c8782d` — `AiSettings` model/controller/routes deleted, superseded by per-user encrypted settings folded into other flows | `d74a3be` |
| 8B | AI Assistant chat — POST /api/ai/chat relays to OpenAI/OpenRouter/Gemini; in-memory chat UI; Gemini header-auth + per-reason errors + deprecated-model fallback to gemini-3.5-flash | ⚠️ removed in `0c8782d` — superseded by Phase 12's Billing Advisor Agent | `27db33e` |
| 8C | Pipedream webhook ingestion (`POST /api/webhooks/billing`, shared-secret header) + Claude (Anthropic) added as 4th AI provider + Analytics Engine foundation (`GET /api/analytics/overview`; `/dashboard/usage` repurposed as Analytics) | ⚠️ webhook route later removed entirely in `0c8782d` (no per-user design, no frontend caller); Claude provider + Analytics Engine still live | `76a505a` |
| 10 | AI-powered recommendations — ephemeral `POST /api/ai/recommendations`, analytics snapshot → AI reasoning → structured recs | ✅ done, pushed — superseded by F1's persistent engine below | `cd954ed` |
| 11 | Data-aware AI Assistant — read-only tool registry grounds plain AI chat replies with aggregated billing data | ⚠️ removed in `0c8782d` along with 8B's AI chat (superseded by Phase 12 agent) | `ae92674` |
| F1 | Autonomous AI Recommendation Engine — persistent workspace data, lifecycle (active/dismissed/completed), event-bus driven regeneration, `/api/recommendations` (list/PATCH/refresh) | ✅ done, pushed | `ae92674` |
| F2 | Notification Engine — rule-based alerts (overdue billing, high-spend concentration, recommendation changes) via the event bus, signature-based dedup | ✅ done, pushed | `c2d3714` |
| F6 | Advanced Analytics — deeper billing intelligence endpoint on top of the Phase 9 analytics engine | ✅ done, pushed | `c2d3714` |
| F7 | User Settings — one preferences doc per user (general/notifications/analytics/automation/memory/recommendations/workspace/appearance) | ✅ done, pushed | `c2d3714` |
| — | Platform Connections + Pipedream integration — connect platforms via verified API key or Pipedream-managed OAuth, encrypted credentials at rest, per-user rate limiting | ✅ done, pushed | `c2d3714` |
| 12 | Billing Advisor Agent — Claude Managed Agents session per user (`/api/agent/chat`), reads real billing/platform data via tools, connect-platform deep links into Platforms page | ✅ done, pushed — paused 2026-07-27, **pause lifted 2026-08-26** (see the write-adjacent-tools/Slack-chat row below) | `e160171` |
| — | Billing-sync adapter layer (129 adapters pulling connected platforms' own billing/usage/balance data via Pipedream Connect Proxy → normalized into Billing, `source: auto_sync`), support requests module, session/OTP security hardening (Session model, JWT `jti`, per-device session list + revoke, email-change OTP), plan tiers (`config/plans.ts`), Postmark → Resend email migration | ✅ done, pushed | `0c8782d` |
| — | Docs sync — phase log/module notes brought up to date through the billing-sync adapter commit (no code changes) | ✅ done, pushed | `f075ee6` |
| — | Gmail invoice email-sync (fallback channel via Pipedream OAuth, `services/email-sync/`), credit-based usage tracker (`creditsBalance`, `CreditTransaction` ledger, real Claude token metering + blocking on the Billing Advisor Agent), Agent tool enrichment (connected-integrations, top-customers), Multi-user Organizations foundation (Organization/Membership/Invitation models, Resend email invites, owner/admin/member roles, Team management, Platform/Billing/PlatformConnection/Recommendation/Notification scoped by organization instead of user, existing accounts backfilled into a personal org) | ✅ done, pushed | `343ebb9` |
| — | Auto-accept org invites after login (redirect preserved, no need to reopen the invite link) + in-app notification to owner/admin on member join | ✅ done, pushed | `13a7a24` |
| — | Fix: self-heal missing organization — a user with no Membership (e.g. removed from an org) now gets a fresh personal org bootstrapped instead of being permanently 401-locked out | ✅ done, pushed | `f9ea876` |
| — | Fix: vary invite email subject by date so repeated invites don't collapse into one Gmail thread (a deleted thread could otherwise swallow a genuinely new invite) | ✅ done, pushed | `e8224f4` |
| — | UI polish: flattened sidebar seam (single border, no shadow/blur), shared `useAlertState` hook so success banners auto-dismiss after 2s across settings tabs/Billing/OTP | ✅ done, pushed | `75dc098` |
| — | Outlook email-sync alongside Gmail (`EmailSyncProvider` abstraction keeps `sync-engine.ts` provider-agnostic; incremental sync relies on newest-first results since Graph API can't combine `$search` + date filter) + multiple email accounts per org (`accountIdentifier` added to the platform-connection uniqueness key for email-sync platforms only) + Settings > Email Accounts tab + extracted reusable `usePipedreamConnect` hook | ✅ done, pushed | `b82aa35` |
| — | Multi-organization membership (a user can own a personal workspace AND belong to other orgs as a member; workspace switcher; active-org self-heal), credits ownership moved from User to Organization (active workspace pays for AI usage), agent chat sessions reset on workspace switch, email-sync bug fixes (oldest-to-newest staged commit to fix payment-confirmation-before-invoice ordering; vendorName/customerName swap fix; tightened invoice detection), Slack Incoming Webhook due-date alerts (`services/notifications/slack.ts`, gated by a validated webhook URL in user settings), fixed Team tab always showing "Admin" | ✅ done, pushed | `3333630` |
| — | Billing Advisor Agent gains write-adjacent tools: `search_billing_records` (find one invoice by customer/invoice number/status) + propose-only `propose_update_billing_status`/`propose_delete_billing_record` (agent never mutates directly — chat UI renders a confirm button that calls the existing `PUT`/`DELETE /api/billing/:id`). Recommendations panel gets a "Discuss with Agent" action that hands a recommendation to the Chat tab as a prefilled prompt. Analytics gains a `custom` date-range option (`from`/`to`) end-to-end — backend engine, `get_analytics_summary` agent tool, and the frontend range picker. Notification Engine batches several recommendations changing in one refresh into a single summary notification instead of one row each. Email-sync hardening: a `manuallyEditedAt` timestamp on Billing stops a later sync pass from reverting a human's correction (Billing page edit or an agent-confirmed change) using a stale/older email; a one-time in-app + Slack notification now fires when sync pauses because the workspace is out of credits (previously silent). Platforms page drops the manual "Your platforms" add/edit/delete panel (platform creation is still reachable via the Billing form's inline "add platform") since platforms are primarily managed by connecting them now. **Slack Billing Advisor chat**: link a Slack account via a short-lived code (Settings > Notifications), then DM the bot to run the same Billing Advisor Agent turns as the in-app chat — Events API webhook with HMAC request-signature verification (`services/slack/`), per-event dedup (`SlackProcessedEvent` model), credit-gated same as the web UI | ✅ done, pushed | `775fdb1` |

**Next phase: NOT yet assigned — wait for the user's brief before building anything.**
**Note:** Phase 12 (Billing Advisor Agent)'s original 2026-07-27 pause was lifted 2026-08-26 — the user explicitly asked for the tool/Slack-chat extension above. No standing pause anymore; treat it like any other module.

### Module notes
- **Platform** = a third-party service the user is billed on. Fields: `name` (2–100),
  `slug` (unique, lowercase, 2–100), `description` (≤500), `website`, `logo`,
  `status` (`Active`/`Inactive`, default `Active`), timestamps. Endpoints:
  `GET/POST /api/platforms`, `GET/PUT/DELETE /api/platforms/:id` (all authed). Dup slug → 409.
- **Dashboard stats**: `GET /api/dashboard/stats` (authed) → `data.stats.{totalPlatforms,
  activePlatforms, inactivePlatforms}` via `Platform.countDocuments`.
- **Billing record** = one invoice that belongs to one Platform (`platform` ObjectId ref,
  required). Fields: `customerName`, `invoiceNumber`, `amount` (≥0), `currency` (3-letter
  code), `billingDate` (Date), `status` (`Pending`/`Paid`/`Overdue`, default `Pending`),
  `notes` (optional). Endpoints: `GET/POST /api/billing`, `GET/PUT/DELETE /api/billing/:id`
  (all authed). Reads populate the platform → serialized as minimal `{id,name,slug}`;
  create/update verify the platform exists (400 on bad ref). Frontend billing module
  mirrors the platform module; `BillingView` also loads platforms for the required
  Platform select. Billing CRUD in 7A; search/filter/pagination + stats in 7B; sorting
  (date/amount) + results counter + page info in 7C. Pipeline: search → filter → sort → paginate.
  `manuallyEditedAt` (added 2026-08-26) is stamped on every `PUT /api/billing/:id` — a
  human correction (Billing page edit, or an agent-confirmed status change/delete) that a
  later email-sync pass must never silently overwrite with an older email; see
  `services/email-sync/sync-engine.ts`'s commit step.
- **Billing stats** (7B): `GET /api/billing/stats` (authed, registered before `/:id`) →
  `data.stats.{totalRecords, paidRecords, pendingRecords, overdueRecords, totalRevenue}`.
  `totalRevenue` is the raw sum of Paid amounts across all currencies (no symbol shown) —
  a currency-aware breakdown is a future concern. Billing list has client-side search
  (customer + invoice), status filter, and 10/page pagination (same pattern as Platforms).
- **Referential integrity** (7B): deleting a Platform is blocked with a 409 while any
  Billing record references it (`Billing.exists({platform})`) — no cascade, no orphans.
- **AI provider settings** (8A) and **AI Assistant chat** (8B, 11) — ⚠️ **removed in
  `0c8782d`** (`AiSettings`/`ai-chat` models, controllers, routes, validators all deleted).
  Superseded by the **Billing Advisor Agent** (Phase 12, below), which is the current
  AI surface in the app. Do not re-add the old `/api/ai/settings` or `/api/ai/chat`
  endpoints — the replacement is `/api/agent/chat`.
- **6C search/filter/pagination** (client-side search/status-filter/`PAGE_SIZE=10` over
  the manual Platform list) — ⚠️ **its UI is gone from `platforms-view.tsx` as of
  2026-08-26**: the whole "Your platforms" add/edit/delete panel was removed from the
  Platforms page (see the write-adjacent-tools/Slack-chat phase row). `GET /api/platforms`
  and manual creation still exist and still work — `platform-form-dialog.tsx` is reused
  by the Billing form's inline "add platform" flow — there's just no standalone manual
  CRUD panel on the Platforms page anymore, since platforms are primarily managed by
  connecting them (catalog/connections UI) now.
- **Analytics Engine** (9, extracted to `services/analytics/analytics.engine.ts` in
  Phase 10): `GET /api/analytics/overview` (authed) — read-only aggregations over
  Billing (per-currency totals, spend-by-platform, monthly trend in a primary currency,
  status breakdown, rule-based insights, no AI). Reused by both the analytics endpoint
  and the recommendation engine. Advanced Analytics (F6) adds a deeper endpoint on top
  of the same range semantics. Frontend: `/dashboard/usage` was repurposed as Analytics
  (CSS/flex visuals, no chart package). `range` also accepts `custom` (added 2026-08-26)
  with `from`/`to` query params — either edge optional for an open-ended window; used by
  the frontend range picker and by the `get_analytics_summary` agent tool (e.g. "last
  month", "this quarter").
- **Autonomous AI Recommendation Engine** (F1, `services/ai/recommendation-engine.ts`):
  persistent recs (`Recommendation` model) with a lifecycle (active/dismissed/completed).
  A typed event bus (`services/events`) — billing/platform controllers emit
  `business.data.changed` — triggers background regeneration (single-flight + trailing
  debounce). Reconciliation dedups by signature, auto-completes recs the AI stops
  returning (`resolvedBy: ai`), reactivates on recurrence, never resurrects a user
  dismissal. `GET/PATCH /api/recommendations`, ops-only `POST /refresh`.
- **Notification Engine** (F2): rule-based alerts (overdue billing, high-spend
  concentration, recommendation changes) subscribed to the same event bus,
  signature-based dedup. `Notification` model + `/api/notifications`. Recommendation
  alerts (added 2026-08-26) batch everything that changed within one refresh's ~2-minute
  window into a single summary notification (e.g. "3 new recommendations") instead of
  one row per recommendation — see `notifyRecommendationBatch`.
- **User Settings** (F7): one `UserSettings` doc per user covering general,
  notifications, analytics, automation, memory, recommendations, workspace, and
  appearance preferences. `/api/settings`.
- **Platform Connections + Pipedream integration**: connect a third-party platform via
  a verified API key or Pipedream-managed OAuth; credentials encrypted at rest; per-user
  rate limiting on connection endpoints. `PlatformConnection` model, `/api/platform-connections`.
- **Billing Advisor Agent** (Phase 12, extended 2026-08-26 — pause lifted, see the phase
  table note): `POST /api/agent/chat` backed by a Claude Managed Agents session per user
  (`services/agent/`, `AgentSession` model) — separate from the old plain AI chat. Reads
  real billing/platform data via custom tools, helps connect new platforms through the
  existing capability resolver (native adapters + Pipedream) but never handles
  credentials itself; returns a `connect_platform` action the frontend renders as a
  one-click deep link into the Platforms page's Connect flow. Frontend: standalone
  Billing Agent page/nav item with voice input/output and persistent local chat history.
  Write-adjacent tools (2026-08-26): `search_billing_records` (`services/ai/tools/
  billing-search.tool.ts`) finds one invoice by customer/invoice number/status;
  `propose_update_billing_status`/`propose_delete_billing_record`
  (`services/ai/tools/billing-actions.tool.ts`) resolve a request to an exact
  `billingId` and return it for confirmation — **neither ever writes to the database**,
  the chat UI's confirm button calls the same authenticated `PUT`/`DELETE
  /api/billing/:id` the Billing page's own edit/delete UI uses. The Recommendations
  panel's "Discuss with Agent" button hands a recommendation to the Chat tab as a
  prefilled prompt so the agent can act on it with these tools.
- **Slack Billing Advisor chat** (`services/slack/`, added 2026-08-26): a user links
  their Slack account from Settings > Notifications (`POST /api/slack/link-code` issues
  a 10-minute code; DM-ing it to the bot completes the link, storing `slackUserId` on
  `User`), then DMs the bot anytime to run the exact same `sendAgentMessage` turn the
  in-app chat uses — same tools, same organization scoping, same credit gate
  (`assertCreditBalance`). `POST /api/slack/events` is the Events API webhook, mounted
  in `app.ts` **ahead of** the global `express.json()` with its own `express.raw()`
  because Slack signs the exact raw body bytes (`slack-signature.ts` verifies
  `X-Slack-Signature`/`X-Slack-Request-Timestamp` via `SLACK_SIGNING_SECRET`); it ACKs
  Slack's retry-on-no-200-in-a-few-seconds requirement immediately, then handles the
  agent turn fire-and-forget. `SlackProcessedEvent` (unique `eventId`) dedupes Slack's
  at-least-once delivery. Requires `SLACK_BOT_TOKEN` + `SLACK_SIGNING_SECRET` (one bot
  for the whole deployment, like the Anthropic/Resend keys) — unset reports "not
  configured" rather than failing.
- **Billing-sync adapter layer** (`services/billing-sync/`): 129 platform adapters
  (`adapters/*.adapter.ts`) + `registry.ts` + `sync-engine.ts` + `scheduler.ts`. Each
  adapter pulls a connected platform's own billing/usage/balance data automatically via
  Pipedream's Connect Proxy, normalized into the Billing collection with `source:
  auto_sync`. `server.ts` starts the scheduler; `platform-connection.controller.ts`
  calls `syncConnectionBilling` on connect.
- **Support requests**: `SupportRequest` model — category, `priority` snapshotted from
  the requester's plan tier at submission (`standard`/`priority`), `status`
  (`open`/`resolved`). No admin/reply UI exists — see production-hardening backlog.
  Dual email notification (support inbox + requester confirmation) on submit.
  `/api/support`. Frontend: dedicated Support tab on `/dashboard/settings`.
- **Session/security hardening**: `Session` model + JWT `jti` claim enable a per-device
  session list with revoke; OTP-based flows (`Otp` model) cover auth steps and
  email-change confirmation. Frontend Security tab (session list) on `/dashboard/settings`.
- **Plan tiers**: `config/plans.ts` + `plan-limits.ts` define tier limits/features;
  `plan.controller.ts` + `/api/plan` expose them. Support-request priority and other
  tier-gated behavior read from here.
- **Email**: transactional email migrated from Postmark to Resend (`services/email/`).
- **Multi-user Organizations**: `Organization`/`Membership`/`Invitation` models. Every user
  owns a personal `Organization` and can additionally be a `Membership` member of others
  (compound `user`+`organization` unique index). Auth resolves an **active organization**
  per request (self-heals by bootstrapping a fresh personal org if a user's membership was
  removed — never a permanent lockout). `Platform`, `Billing`, `PlatformConnection`,
  `Recommendation`, and `Notification` are all scoped by organization, not user. Roles:
  owner/admin/member. Invites are emailed via Resend, auto-accept on login if the invitee
  already has an account (redirect preserved through login), and notify the owner/admin on
  join. Frontend: workspace switcher, Settings > Team tab. A redundant fallback personal
  workspace is auto-cleaned up when a member is removed and the owner is solo again.
- **Credits**: usage-based metering for the Billing Advisor Agent, config in
  `config/credits.ts` (plan-tier-keyed allowance/cycle, decoupled from `config/plans.ts`).
  Ownership lives on **Organization**, not User — whichever workspace is active pays for AI
  usage. `CreditTransaction` ledger records every debit; agent chat sessions reset on
  workspace switch to keep history isolated per organization. Frontend: Settings > Credits
  tab (balance, history, pace) + credit badge/blocking in Agent chat.
- **Email-sync (Gmail + Outlook)** (`services/email-sync/`): a fallback invoice-sync channel
  alongside the billing-sync adapters, connected the same way (Pipedream OAuth) but reading
  invoice emails instead of a platform API. `EmailSyncProvider` abstracts Gmail vs Outlook
  search-query syntax and message normalization; `sync-engine.ts`'s loop (pagination, safety
  cap, watermark, dedupe/upsert) is provider-agnostic. Messages are staged and committed
  **oldest-to-newest per run** (Gmail search order isn't chronological — processing a
  Paid-confirmation before its own invoice email could otherwise clobber status back to
  Pending). An organization can connect **more than one** Gmail/Outlook inbox — the
  `PlatformConnection` uniqueness key includes `accountIdentifier` for email-sync platforms
  specifically (every other platform stays one-per-org). Frontend: Settings > Email Accounts
  tab (list, last-synced time, disconnect, connect another) via the shared
  `usePipedreamConnect` hook.
- **Slack alerts**: `services/notifications/slack.ts` posts due-date reminders to a Slack
  Incoming Webhook alongside the existing email notification, gated by a validated
  `https://hooks.slack.com/services/...` URL stored in user settings. Note: as of
  2026-08-26 there is **uncommitted, unpushed** work in progress on a broader Slack
  integration (`slack.controller.ts`, `slack.routes.ts`, `services/slack/`,
  `services/types/slack.ts`) — do not treat that as documented/shipped until it's actually
  committed and pushed.

---

## 9. Standing recommendations (logged for later, do NOT implement unprompted)

- Fail-fast env validation for `JWT_SECRET` at startup.
- Rate-limit login/register.
- Fold the ad-hoc live `.cjs` checks into a real Jest/Vitest CI suite.
- Cross-tab logout sync; 401 refresh-token flow; Playwright e2e.
- Remove leftover Next.js `public/*.svg` boilerplate.

See `docs/PRODUCTION-HARDENING.md` for the full deferred backlog. **Largely superseded by
the more current, evidence-backed backlog in §10 below** — prefer §10 when the two overlap.

---

## 10. External founder/CTO/architect audit (15 Sept 2026) — reference backlog, NOT yet actioned

An external audit was run against commit `e3ad6ad` (full repo read: ~21k LOC backend,
~107 frontend TSX; static verification; no code modified). The user shared all 7 source
documents in full on 2026-09-21 and asked that they be understood and recorded — **not**
implemented yet. **This whole section is a reference backlog. Nothing in it is authorized
for implementation until the user explicitly assigns a phase from it, per §2's golden
rules ("one phase at a time", "wait for instruction").**

**Full source, archived verbatim:** `docs/audit/00-EXECUTIVE-SUMMARY.md` through
`docs/audit/07-TEST-MATRIX.md`. This section is a condensed index into those — go there
for exact file:line evidence, the full P2/P3 lists, the complete 300+-row test matrix, the
adversarial-AI test list, and the mermaid architecture/flow diagrams. Do not re-derive
findings from memory; re-read the actual file before acting on any of this.

### 10.1 — One-paragraph verdict (`00`)

A competently built, genuinely thoughtful CRUD SaaS with an AI chat feature bolted on —
not yet an AI financial agent. Engineering craft (HTTP-layer tenancy, org-switch/agent
interaction, Slack signature verification, incident-driven code comments) is well above
average. But the product needs three things it does not have: a domain model that can
represent an invoice's *life* (not just a snapshot), a provenance trail that lets a user
verify anything, and an ingestion pipeline that finds invoices reliably and affordably.
All three are **absent, not partial**. Would not launch today, accept payments today, or
trust it with real invoices today — but the backbone is sound and the gaps are fixable
without a rewrite. None of the P0s below are architectural; they're four bugs and a
missing migration. The expensive work is the domain model (one collection, not the system).

### 10.2 — P0 blockers (launch-blocking; fix first, in this order)

1. **Indexes never build in production** — `autoIndex: !isProduction`
   (`backend/src/config/database.ts:40`), no `syncIndexes()`/migration anywhere in the
   repo. Every uniqueness guarantee the code relies on is fictional in prod: duplicate
   `User.email` accounts, duplicate OTPs (defeats the attempt limiter), the entire
   email-sync dedup key, `SlackProcessedEvent` dedup (Slack retries re-bill). **Do this
   first** — half a day, unblocks/derisks everything else.
2. **Auth OTPs are predictable and brute-forceable** — three compounding defects in
   `backend/src/controllers/auth.controller.ts`: `Math.random()` (not a CSPRNG) generates
   the code (`:67`); the 5-attempt counter is a non-atomic read-modify-write, bypassable by
   concurrency (`:104`); none of the three OTP routes are rate-limited. The OTP *is* the
   only credential in this passwordless app. Fix: `crypto.randomInt`, atomic
   `findOneAndUpdate` with `$inc`+`$lt`, mount the existing `rateLimit()` middleware on all
   three auth routes, `app.set('trust proxy', 1)`.
3. **Email sync can loop forever, re-billing the same 200 emails** —
   `backend/src/services/email-sync/sync-engine.ts`: `MAX_MESSAGES_PER_RUN = 200` (`:44`);
   if a mailbox has more candidates, the watermark never advances (`:329`), so every hourly
   run re-fetches and re-extracts the identical first 200 messages, forever, burning
   credits and never completing backfill. Separately, `OVERLAP_DAYS = 1` (`:46`) means even
   steady-state re-extracts every last-24h message on every hourly run — **~24× the
   necessary AI spend, permanently** (§10.5). Fix: a `ProcessedEmailMessage
   {connection, messageId, processedAt}` collection with a unique index; skip anything
   already processed; let the watermark advance on cap once per-message idempotency covers
   you.
4. **No revenue path exists** — zero Stripe integration. `PUT /api/plan` lets any
   owner/admin self-assign their org to Business tier for free
   (`backend/src/controllers/plan.controller.ts:66`). Monetization is 0% built.

### 10.3 — P1 findings (serious correctness/security/cost — fix before beta/payments/public launch)

- **No provenance — nothing is verifiable** (`backend/src/models/billing.model.ts`). A
  `Billing` record stores no source message id, thread id, sender address/domain,
  extraction confidence, or evidence. "Where did this invoice come from?" and "why is this
  Pending?" are unanswerable by construction. **This is called out as the single
  highest-leverage fix in the whole audit** — one schema addition unlocks trust UX,
  dedup, the state machine, and a future learning loop simultaneously. Minimum fields:
  `sourceMessageId`, `sourceThreadId`, `senderEmail`, `senderDomain`, `receivedAt`,
  `subject`, `extractionConfidence`, `extractionModel`, `extractedAt`, `evidence[]`,
  `statusConfidence`, `statusSetBy`, `paymentDate`, `supersedes`/`duplicateOf`.
- **"Show invoices from AWS" does not work** — the domain model is inverted (modelled as
  receivable, not payable). `Billing.customerName` is required and for email-derived
  records is set to **the user's own org name** (`sync-engine.ts:505`); the real vendor
  only lives in optional `vendorName`. The agent's `search_billing_records` tool has no
  vendor parameter at all (`billing-search.tool.ts`) — the single most important query in
  the product vision fails silently. Same root cause independently breaks the Billing
  page's own search box (typing "Netflix" on a row labelled "Netflix" returns zero
  results — `billing-view.tsx:110-121`, since it only searches `customerName`/
  `invoiceNumber`, never the vendor). Fix: rename to `vendor`/`vendorDomain`/`billedTo`,
  add a real `Vendor` collection, add vendor params to the search tool and the frontend
  search box — sequence with the provenance migration.
- **Status is a single-email LLM guess with no confidence or event history**
  (`ai-invoice-extractor.ts:75-82`, `sync-engine.ts:280-320`). Chronological
  oldest-to-newest commit *within one run* is genuinely well done, but a stale reminder
  arriving in a later run after a real payment confirmation still flips a Paid invoice back
  to Pending — no representation for out-of-order evidence across runs. Fix: an append-only
  `BillingEvent` log (one row per email-derived observation, with provenance); derive
  `Billing.status` as a projection via a deterministic state machine, not a direct write.
- **Indirect prompt injection** — email body is concatenated into the Haiku extraction
  call with no system prompt, no delimiters, no "treat as untrusted data" framing
  (`ai-invoice-extractor.ts:118-127`). Forced tool-call output is a real partial
  mitigation, but every *field value* is attacker-controlled: no SPF/DKIM/DMARC check, no
  `Reply-To` vs `From` comparison — a spoofed "AWS" invoice for $48,000 normalizes straight
  into the trusted dataset. Extracted `vendorName`/`invoiceNumber` are stored unsanitized
  and later `JSON.stringify`'d raw into the agent's context
  (`managed-agent.service.ts:259`) — a second-order injection surface.
- **129 billing-sync adapters are mostly not invoices** (full census in
  `docs/audit/05`, Part A) — of 129 adapters, **124 hardcode `status: "Pending"` forever**,
  **122 stamp `billingDate: now`** (the sync time, not a real billing date), and 101 model
  usage/balance/quota rather than a discrete invoice. Only 5 adapters
  (`gocardless`, `heroku`, `mongodb`, `northflank`, `snapchat-marketing`) derive a real
  status. Consequence: "outstanding" accumulates permanently-pending accrual rows that
  never clear; monthly trend is misdated; a platform connected via both billing-sync *and*
  email-sync double-counts (different `platformConnection`, so the unique index can't
  catch it) — and double-counting is exactly the scenario this product is built to prevent,
  not an edge case. Fix (do not patch 129 adapters individually): split into `Billing`
  (discrete obligations) vs. a new `UsageAccrual` (month-to-date metered spend, explicitly
  labelled, excluded from outstanding/overdue).
- **No PDF/attachment parsing** (`email-sync/parser.ts`) — only walks `text/plain` →
  `text/html` → snippet; attachments are never touched, so a near-empty email with a PDF
  invoice attached is invisible. Hard recall ceiling no prompt tuning fixes. Compounding:
  `gmail-client.ts:76` already fetches `format=full` (pulling attachment bytes through the
  Pipedream proxy) and then discards them unused.
- **Outlook sync may silently skip mail (unverified)** — Graph `$search` can't combine
  with `$filter`; the workaround assumes results arrive newest-first and advances the
  watermark on early-stop (`outlook-provider.ts:46`, `sync-engine.ts:329`). Graph
  `$search` is actually relevance-ranked. **Explicitly flagged as unverified from the audit
  sandbox — must be tested against a real mailbox before Outlook is offered to customers.**
- **Encryption key falls back to the JWT secret, no rotation possible**
  (`backend/src/utils/crypto.ts:23`) — if `AI_ENCRYPTION_KEY` is unset (defaults to `""`),
  stored third-party API keys are encrypted with the same secret that signs JWTs; bare
  SHA-256 with no salt/stretching; no key version in the stored payload, so rotation
  requires a full re-encryption migration.
- **Unbounded list/export endpoints** — `GET /api/billing` and `/billing/export` both
  `.find()` with two `.populate()`s, no limit/pagination/projection
  (`billing.controller.ts:74,90`); no compound indexes on `Billing` at all; `autoMarkOverdue`
  full-scans across all tenants with no index on `dueDate`
  (`notification-engine.ts:442`).
- **Mixed-currency sums presented as one number** — `getBillingStats`
  (`billing.controller.ts:266-276`) sums Paid amounts across whatever currencies exist as a
  bare scalar (USD+EUR+PKR added together), acknowledged in its own code comment.
  `analytics.engine.ts:80-107` does currency grouping *correctly* elsewhere in the same
  codebase, then silently filters platform-breakdown/trend to the primary currency only
  (`:110`) — two different correctness standards in one app. `overview-view.tsx`'s headline
  number is `totalsByCurrency[0]` with no UI indication other currencies are excluded.
- **Credit accounting under-recovers and can be outrun** — `consumeCredits` is fire-and-forget
  (`void`, not awaited) *after* the work completes (`managed-agent.service.ts:337`);
  `assertCreditBalance` reads from a 5-second in-memory auth cache with no reservation, so
  concurrent requests can drive a balance arbitrarily negative; no `MAX_ITERATIONS` on the
  agent's tool loop; `tokensToCredits` (`config/credits.ts:70`) ignores cache tokens and
  Managed Agents' `$0.08/session-hour` runtime dimension entirely.

### 10.4 — Cost/economics findings (`03`) — the most commercially dangerous finding in the audit

- **Verified rates:** Haiku 4.5 $1/$5 per MTok in/out; Sonnet 5 $2/$10; Managed Agents
  session runtime **$0.08/session-hour** (billed only while `running`, idle is free) — this
  dimension is **not metered anywhere in the credit ledger**. Batch API (−50%) and Fast
  Mode discounts **do not apply inside Managed Agents** at all.
- **The 24× bug, quantified:** with `OVERLAP_DAYS=1` and no processed-message store, a
  normal 2-inbox/60-new-invoices-per-month customer generates **2,880 extractions/month
  instead of 120** — 8,640 credits consumed against a Pro allowance of 4,000.
- **The credit-cycle bug compounds it:** `CREDIT_CYCLE_DAYS_BY_PLAN` in
  `config/credits.ts:52` gives Pro/Business their AI allowance **once per year, not
  monthly**. Combined with the 24× bug, a normal paying customer **exhausts their entire
  annual allowance in ~13 days**, then has a dead product for 11.5 months, with **no
  purchase/top-up flow to buy more**. A large mailbox (>200 candidates) dies in under 7
  hours. **Fix both together**: processed-message table + monthly cycles for every tier.
- Fixing just the two ingestion bugs is estimated to be worth **~48 points of gross margin**
  at scale (74% vs 26% at 1,000 customers) — the highest-ROI engineering work in the repo.
- Recommended credit redefinition: stop pricing in "1,000 blended tokens" (meaningless to a
  customer); price in customer-visible units (1 credit = one invoice extracted, 5 = one AI
  agent answer, 0 = any deterministic/non-LLM query, which should never touch Claude at all).
- Verdict on Pipedream: **keep for the 129 billing-sync adapters** (right tool, huge
  provider surface), **but consider moving Gmail/Outlook to direct OAuth** — email sync is
  ~99% of proxy volume and both providers have real incremental-sync primitives
  (`history.list`, Graph delta queries) Pipedream's generic proxy can't expose; also
  removes the Outlook ordering risk in 10.3 properly. Not yet decided/actioned.

### 10.5 — Frontend/UX findings (`05`) not already covered above

- **Information architecture buries the core action** — connecting Gmail/Outlook (the
  action that makes the whole product work) lived in Settings → a sub-tab, several clicks
  deep, with no dashboard path to first value. **Note: this was independently identified
  and already fixed in this session's own work** — Email Accounts management was removed
  from Settings and folded directly into the Platforms page with inline "Connect
  Gmail"/"Connect Outlook" actions (see the phase-status-log entries after 2026-09-20).
  Re-verify this against the audit's P2-19/UX-001 framing rather than assuming it's fully
  resolved — the audit's ask was broader (≤3 clicks from register to connected inbox,
  privacy explanation before OAuth consent, sync-progress indicator — those are still
  outstanding).
- **No onboarding / first-run guidance at all** — no "connect your first inbox" step, no
  explanation of what's read before OAuth consent, no sync-progress state
  ("scanning… 340/1,200"), no "confirm these 8 detected vendors" verification step. The
  audit's proposed customer journey (`05`, Part C) sequences: register → explain what's
  read → connect first inbox → live scan progress → **user confirms detected vendors**
  (does not exist today, but is cheap once provenance lands and is high-value: it's the
  "wow" moment, the trust-building step, and the first learning-loop training signal all
  at once) → populated workspace → set one alert → invite a teammate.
- **No trust UX** — no way for a user to tell a row apart as "I typed this" / "AI found
  this in an email" / "this is a usage accrual, not an invoice." Blocked on provenance
  (10.3) landing first.
- **Dashboard answers "how much did I spend" not "what do I need to do"** — no
  needs-attention section (overdue, due ≤7 days, failed syncs, unhealthy integrations,
  records awaiting confirmation).
- Recommendations engine: **structurally well-designed** (signature-based lifecycle,
  correct reconciliation, never resurrects a user dismissal) but **the inputs can't support
  useful output** — no usage/seat/login-frequency signal anywhere in the system, so it can
  produce "AWS spend rose 22%" but never the brief's target example ("usage dropped 70%,
  cancel this"). No `estimatedImpact` field exists on the model either. Recommendation:
  narrow scope to what current data supports (anomalies, price increases, duplicates) and
  add a required dollar-impact field; don't promise usage-based suggestions until a usage
  signal actually exists.
- Smaller items (P3, full list in `docs/audit/05`): no CSP header (`helmet()` defaults
  only — meaningful since JWT lives in `localStorage`), no accessibility pass, unauthenticated
  + unthrottled invite-token preview route, 858-line `analytics-view.tsx` as a
  decomposition candidate, `page-data-cache` never invalidates on mutation.

### 10.6 — Security findings summary (`06` §5, full 20-item table with file:line + exploit + fix in that file)

Ranked P0→P3, S-01 through S-20. The P0/P1 ones not already covered in 10.2/10.3 above:
Slack link-code brute force with no rate limit on the DM path (global match across all
users — a successful guess binds an attacker's Slack id to a victim account, S-11); explicit
user-enumeration message on login (`"No account found with this email..."`, S-12); no RBAC
on billing mutations — any `member` role can delete any org's financial records (S-13); no
`trust proxy` so the one existing rate limiter buckets by the proxy's IP, not the client's
(S-14). **Cross-tenant/IDOR verdict: none found** — every business-collection query traced
scopes correctly by `organization`, `findBillingOr404` returns 404 not 403 (no existence
leak). The two seams to watch, not yet broken: `AgentSession` keyed by user not
`(user, org)`, and a dual org-resolution path between `req.organization` (HTTP) and
`getOrganizationIdForUser()` (agent tools) that credits/data could theoretically diverge on
under a concurrent org-switch race.

### 10.7 — Documentation drift (`02` §8) — separate from, but related to, the companion-docs callout above

11 specific drift findings (D1–D11) — full table in `docs/audit/02-ARCHITECTURE-AND-DRIFT.md`
§8. Highlights beyond the LangGraph/Qwen issue already flagged above: `README.md` claims
"production-ready" (zero tests, zero CI, no payments, indexes never built in prod — should
be struck); `PRODUCTION-HARDENING.md` still references pre-passwordless auth endpoints that
no longer exist; `ARCHITECTURE.md` claims a "Forecast Engine"/"Cost Optimizer" that were
never built (the real analytics engine does totals/status-splits/trend/duplicate-detection,
no forecasting). Recommended sequencing (not yet done): rewrite `ARCHITECTURE.md` against
the diagrams in `docs/audit/02`, add a `DECISIONS.md` D-004 entry superseding D-001, strike
the "production-ready" claim, rewrite `PRODUCTION-HARDENING.md` against the current
passwordless flow.

### 10.8 — Test matrix & inventories (`06`, `07`) — reference only

`docs/audit/07-TEST-MATRIX.md` has ~300 specific test cases (AUTH/ORG/GM/OL/AI/ADV/CR/AN/INF/UX,
each numbered) the audit recommends building, with a suggested stack (Vitest +
`mongodb-memory-server` + supertest, Playwright, an AI eval corpus of ≥500 anonymized
real emails, `autocannon`). `docs/audit/06-INVENTORIES.md` has the full feature/API/DB/
AI-call inventory tables (52 API endpoints, only 1 currently rate-limited). Repo currently
has **zero tests, zero CI** — this is itself one of the "must fix before public launch"
items.

### 10.9 — Sequencing (`04`) — the audit's own recommended order, NOT a commitment

The audit's own 30/60/90-day roadmap (full detail + acceptance criteria + file lists for
each of the "next 10 engineering tasks" in `docs/audit/04-ROADMAP-AND-LAUNCH-READINESS.md`
§5): (1) build indexes in prod, (2) harden OTP flow, (3) processed-message store, (4) CI +
first tests, (5) sync observability (`lastSyncError`/`lastSyncAt` surfaced in the UI),
(6) provenance schema + backfill, (7) vendor domain model, (8) `BillingEvent` log + status
state machine, (9) prompt-injection defense + sender verification, (10) Stripe
minimum-production-grade. This ordering is the audit's own recommendation, not something
already agreed with the user — **wait for the user to actually assign a phase from this
list** (or a different order) before starting any of it, per §2's golden rules.
