# CLAUDE.md — Project Context & Working Guide

This file is the single source of truth for how to work on **agentic-billing-manager**.
Read it fully before making any change. It captures the architecture, conventions,
workflow rules, and the exact status of every phase built so far, so work can be
resumed from any machine or a fresh session without losing context.

> Companion docs (do not duplicate — cross-reference):
> - `docs/ARCHITECTURE.md` — locked/frozen target architecture blueprint
> - `docs/DECISIONS.md` — locked technical decisions
> - `docs/PRODUCTION-HARDENING.md` — approved-but-deferred hardening backlog

---

## 1. What this project is

**agentic-billing-manager** is a phase-based monorepo: a billing/usage manager that
will eventually pull data from Pipedream → an adapter layer → an analytics engine →
LangGraph AI modules (that end-state is a **blueprint only** in `docs/ARCHITECTURE.md`;
nothing of it is implemented yet).

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

**Auth:** JWT (generate/verify, secret+expiry from env). `authenticate` middleware
attaches `req.user` from the Bearer token. Passwords bcrypt cost 12, `select: false`,
pre-save hash. Login returns one generic "Invalid email or password" (no user
enumeration).

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

See `docs/PRODUCTION-HARDENING.md` for the full deferred backlog.
