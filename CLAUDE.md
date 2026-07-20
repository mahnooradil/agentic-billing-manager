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
| 8A | AI Integration Foundation — per-user AI provider config only (no AI calls); API key encrypted at rest | ✅ done, pushed | `d74a3be` |
| 8B | AI Assistant chat — POST /api/ai/chat relays to OpenAI/OpenRouter/Gemini; in-memory chat UI; Gemini header-auth + per-reason errors + deprecated-model fallback to gemini-3.5-flash | ✅ done, pushed | `27db33e` |

**Next phase: NOT yet assigned — wait for the user's brief before building anything.**

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
- **Billing stats** (7B): `GET /api/billing/stats` (authed, registered before `/:id`) →
  `data.stats.{totalRecords, paidRecords, pendingRecords, overdueRecords, totalRevenue}`.
  `totalRevenue` is the raw sum of Paid amounts across all currencies (no symbol shown) —
  a currency-aware breakdown is a future concern. Billing list has client-side search
  (customer + invoice), status filter, and 10/page pagination (same pattern as Platforms).
- **Referential integrity** (7B): deleting a Platform is blocked with a 409 while any
  Billing record references it (`Billing.exists({platform})`) — no cascade, no orphans.
- **AI provider settings** (8A, config only — NO AI calls yet): one config per user
  (`AiSettings`, `user` ref unique). Endpoints (authed, scoped to `req.user`):
  `GET/PUT/DELETE /api/ai/settings` — GET returns the user's config or `null`, PUT upserts
  (blank `apiKey` on edit keeps the stored key; create 201 / edit 200), DELETE removes.
  API key is **encrypted at rest** (AES-256-GCM, `utils/crypto.ts`, key derived from
  `AI_ENCRYPTION_KEY` or JWT_SECRET) and **never returned** — only `maskedApiKey`
  (`••••••••<last4>`) + `hasApiKey`. UI is an "AI Provider" section on `/dashboard/settings`;
  Test Connection is a placeholder (no network). Providers: OpenAI / Gemini / OpenRouter.
  Note: the schema field `model` is safe (runtime-verified); Mongoose uses `doc.$model`.
- **AI Assistant chat** (8B): `POST /api/ai/chat` (authed) — body `{messages:[{role,content}]}` (in-memory
  only, no persistence). Reads the user's AiSettings, decrypts the key in memory, and calls the provider
  via built-in `fetch`. OpenAI/OpenRouter use `Authorization: Bearer`; Gemini uses the `x-goog-api-key`
  header at `v1beta/models/<model>:generateContent`. Provider failures → clean **502** (never 401 —
  that would trip the frontend auto-logout); the key is never logged/returned. Gemini extras (in
  `utils/ai-provider.ts`, Gemini-only): per-reason error mapping + masked diagnostics, and
  `resolveGeminiModel` which remaps deprecated/empty model ids to `gemini-3.5-flash` (current Google
  default, verified live) while passing custom models through. UI: `components/ai/ai-chat.tsx` on
  `/dashboard/ai`.
- **6C search/filter/pagination** is entirely **client-side** over the loaded list
  (no backend change): search matches name+slug, status filter All/Active/Inactive,
  `PAGE_SIZE=10`, page resets to 1 on search/filter change, distinct "no matching
  platforms" empty state with a Clear-filters action.

---

## 9. Standing recommendations (logged for later, do NOT implement unprompted)

- Fail-fast env validation for `JWT_SECRET` at startup.
- Rate-limit login/register.
- Fold the ad-hoc live `.cjs` checks into a real Jest/Vitest CI suite.
- Cross-tab logout sync; 401 refresh-token flow; Playwright e2e.
- Remove leftover Next.js `public/*.svg` boilerplate.

See `docs/PRODUCTION-HARDENING.md` for the full deferred backlog.
