# Inventories

Five of the tables requested in the brief. (External service and background job inventories are in `02-ARCHITECTURE-AND-DRIFT.md`; the cost model is in `03`; launch blockers are in `04`.)

---

## 1. Feature inventory

| Feature | Frontend | Backend | DB | External dep | Status | Works? | Tests | Prod ready | Issues |
|---|---|---|---|---|---|---|---|---|---|
| Register / login (OTP) | ✅ | ✅ | `User`, `Otp`, `Session` | Resend | Shipped | Yes | ❌ | **No** | P0-02, P2-01 enumeration |
| Session management | ✅ | ✅ | `Session` | — | Shipped | Yes | ❌ | Partial | No TTL; `req.ip` is proxy IP |
| Sign out everywhere | ✅ | ✅ | `User.tokenVersion` | — | Shipped | Yes | ❌ | Yes | 5s cache lag (documented) |
| Multi-org membership | ✅ | ✅ | `Membership`, `Organization` | — | Shipped | Yes | ❌ | Yes | Well built |
| Org switching | ✅ | ✅ | `User.activeOrganizationId` | — | Shipped | Yes | ❌ | Yes | Correctly resets agent session |
| Invitations | ✅ | ✅ | `Invitation` | Resend | Shipped | Yes | ❌ | Partial | P3-06 unauthenticated preview |
| Roles (owner/admin/member) | ✅ | ✅ | `Membership.role` | — | Shipped | Partial | ❌ | **No** | P2-11: no role gate on billing mutations |
| Manual invoice CRUD | ✅ | ✅ | `Billing`, `Platform` | — | Shipped | Yes | ❌ | Partial | P1-08 unbounded list |
| CSV import / export | ✅ | ✅ | `Billing` | — | Shipped | Yes | ❌ | Partial | Export unbounded, unthrottled |
| Gmail invoice sync | ✅ (settings tab) | ✅ | `Billing`, `PlatformConnection` | Pipedream → Gmail | Shipped | **Partially** | ❌ | **No** | P0-03, P1-05, 90-day cap |
| Outlook invoice sync | ✅ | ✅ | same | Pipedream → Graph | Shipped | **Unverified** | ❌ | **No** | P1-06 ordering assumption |
| Tracked senders | ✅ | ✅ | `PlatformConnection.trackedSenders` | — | Shipped | Yes | ❌ | Yes | Manual config, not learning |
| AI invoice extraction | — | ✅ | `Billing` | Anthropic Haiku | Shipped | Partially | ❌ | **No** | P1-01, P1-04, no confidence |
| Billing-sync adapters (129) | ✅ | ✅ | `Billing`, `PlatformConnection` | Pipedream | Shipped | **Mislabelled** | ❌ | **No** | 124/129 are usage accruals, not invoices |
| Pipedream OAuth connect | ✅ | ✅ | `PlatformConnection` | Pipedream | Shipped | Yes | ❌ | Partial | Rate-limited (only route that is) |
| API-key connections | ✅ | ✅ | `PlatformConnection` | — | Shipped | Yes | ❌ | Partial | P1-07 key derivation |
| Billing Advisor Agent (web) | ✅ | ✅ | `AgentSession`, `Billing` | Anthropic Managed Agents | Shipped | Partially | ❌ | **No** | P1-02 vendor search, P1-10 no caps |
| Billing Advisor Agent (Slack) | — | ✅ | same | Slack + Anthropic | Shipped | Yes | ❌ | **No** | P2-03 link-code brute force, Roman Urdu copy |
| Agent propose/confirm writes | ✅ | ✅ | `Billing` | — | Shipped | Yes | ❌ | Yes | **Correct design** |
| Analytics overview | ✅ | ✅ | `Billing` | — | Shipped | Partially | ❌ | Partial | Primary-currency filtering hides data |
| Advanced analytics | ✅ | ✅ | `Billing` | — | Shipped | Partially | ❌ | Partial | Same + adapter date corruption |
| Dashboard stats | ✅ | ✅ | `Billing` | — | Shipped | **No** | ❌ | **No** | P1-09 mixed-currency sum |
| AI recommendations | ✅ | ✅ | `Recommendation` | Anthropic | Shipped | Partially | ❌ | Partial | No usage signal, no impact field |
| Notifications (in-app) | ✅ | ✅ | `Notification` | — | Shipped | Yes | ❌ | Yes | Signature dedup works well |
| Slack alerts | ✅ | ✅ | `UserSettings` | Slack webhook | Shipped | Yes | ❌ | Yes | — |
| Due-date reminders | — | ✅ | `Billing`, `Notification` | — | Shipped | Yes | ❌ | Partial | No index on `dueDate` |
| Credit metering | ✅ | ✅ | `Organization`, `CreditTransaction` | — | Shipped | Partially | ❌ | **No** | P1-10; 365-day cycle |
| Plans / limits | ✅ | ✅ | `Organization.planTier` | — | Shipped | Yes | ❌ | **No** | Free self-upgrade |
| **Payments / Stripe** | ❌ | ❌ | ❌ | ❌ | **Not built** | — | — | — | Does not exist |
| Support requests | ✅ | ✅ | `SupportRequest` | Resend | Shipped | Yes | ❌ | Yes | — |
| User settings | ✅ | ✅ | `UserSettings` | — | Shipped | Yes | ❌ | Yes | — |
| Account deletion | ✅ | ✅ | cascade across 10 models | — | Shipped | Yes | ❌ | Partial | Not transactional; partial-failure risk |
| **Data export (GDPR)** | ❌ | Partial (CSV only) | — | — | **Not built** | — | — | — | Only billing CSV; no full export |
| **Onboarding** | ❌ | — | — | — | **Not built** | — | — | — | P2-20 |
| **Trust / provenance UI** | ❌ | ❌ | ❌ | — | **Not built** | — | — | — | P1-03, P2-21 |

---

## 2. API inventory

All routes under `/api`. `authenticate` = JWT + Session + Membership + Organization resolution.

| Endpoint | Method | Auth | Role | Org-scoped | Validator | Rate limit | Risk |
|---|---|---|---|---|---|---|---|
| `/health` | GET | ❌ | — | — | — | ❌ | Low |
| `/auth/register/request-otp` | POST | ❌ | — | — | ✅ | ❌ | **P0** — OTP spam, Resend cost |
| `/auth/login/request-otp` | POST | ❌ | — | — | ✅ | ❌ | **P0** — enumeration + spam |
| `/auth/verify-otp` | POST | ❌ | — | — | ✅ | ❌ | **P0** — brute force |
| `/auth/me` | GET | ✅ | any | ✅ | — | ❌ | Low |
| `/auth/profile` | PATCH | ✅ | any | — | ✅ | ❌ | Low |
| `/auth/account` | DELETE | ✅ | owner-guard | ✅ | — | ❌ | **P1** — non-transactional cascade |
| `/auth/sign-out-everywhere` | POST | ✅ | any | — | — | ❌ | Low |
| `/auth/email/request-otp` | POST | ✅ | any | — | ✅ | ❌ | **P1** — unthrottled |
| `/auth/email/verify-otp` | POST | ✅ | any | — | ✅ | ❌ | **P1** — same brute-force shape |
| `/auth/sessions` | GET | ✅ | any | — | — | ❌ | Unbounded (no TTL) |
| `/auth/sessions/:id` | DELETE | ✅ | any | — | — | ❌ | Low — scoped to user |
| `/auth/organizations` | GET | ✅ | any | — | — | ❌ | Low |
| `/auth/switch-organization` | POST | ✅ | any | membership-checked | ✅ | ❌ | Low — **correctly verified** |
| `/billing` | GET | ✅ | any | ✅ | — | ❌ | **P1** — unbounded, no pagination |
| `/billing/stats` | GET | ✅ | any | ✅ | — | ❌ | **P1** — mixed-currency sum |
| `/billing/export` | GET | ✅ | any | ✅ | — | ❌ | **P1** — unbounded, exfil convenience |
| `/billing/import` | POST | ✅ | any | ✅ | ✅ | ❌ | P2 — no size cap beyond body limit |
| `/billing` | POST | ✅ | **any member** | ✅ | ✅ | ❌ | P2 — no role gate |
| `/billing/:id` | GET | ✅ | any | ✅ | — | ❌ | Low — `findBillingOr404` |
| `/billing/:id` | PUT | ✅ | **any member** | ✅ | ✅ | ❌ | P2 — no role gate |
| `/billing/:id` | DELETE | ✅ | **any member** | ✅ | — | ❌ | **P2** — any member deletes financial records |
| `/platforms` (5 routes) | all | ✅ | any | ✅ | ✅ | ❌ | Low |
| `/platform-connections` | GET | ✅ | any | ✅ | — | ❌ | Low |
| `/platform-connections/catalog` | GET | ✅ | any | n/a | — | ❌ | P3 — Pipedream catalog, cached |
| `/platform-connections/connect-token` | POST | ✅ | any | ✅ | ✅ | **✅ 20/min** | Low — the only limited route |
| `/platform-connections/:id` | DELETE | ✅ | any | ✅ | — | ❌ | P2 — no role gate |
| `/analytics/overview` | GET | ✅ | any | ✅ | ✅ | ❌ | P2 — uncached aggregation |
| `/analytics/advanced` | GET | ✅ | any | ✅ | ✅ | ❌ | P2 — heaviest query in the app |
| `/dashboard/stats` | GET | ✅ | any | ✅ | — | ❌ | P2 |
| `/agent/chat` | POST | ✅ | any | ✅ (credits) | ✅ | ❌ | **P1** — unbounded AI spend per user |
| `/agent/chat` | DELETE | ✅ | any | — | — | ❌ | Low |
| `/recommendations` | GET | ✅ | any | ✅ | ✅ | ❌ | Low |
| `/recommendations/refresh` | POST | ✅ | any | ✅ | — | ❌ | **P1** — triggers a Claude run, unthrottled |
| `/recommendations/:id/status` | PATCH | ✅ | any | ✅ | ✅ | ❌ | Low |
| `/notifications` (5 routes) | all | ✅ | any | ✅ | ✅ | ❌ | Low |
| `/settings` | GET/PUT | ✅ | any | user-scoped | ✅ | ❌ | Low |
| `/plan` | GET | ✅ | any | ✅ | — | ❌ | Low |
| `/plan` | PUT | ✅ | owner/admin | ✅ | ✅ | ❌ | **P0** — free self-upgrade to Business |
| `/credits` | GET | ✅ | any | ✅ | — | ❌ | Low |
| `/organization` | GET/PATCH | ✅ | owner/admin for write | ✅ | ✅ | ❌ | Low |
| `/organization/members` | GET | ✅ | any | ✅ | — | ❌ | Low |
| `/organization/members/:id` | PATCH | ✅ | **owner only** | ✅ | ✅ | ❌ | Low — correctly gated |
| `/organization/members/:id` | DELETE | ✅ | owner/admin | ✅ | — | ❌ | Low — correctly gated |
| `/organization/invitations` | POST | ✅ | owner/admin | ✅ | ✅ | ❌ | P2 — unthrottled email send |
| `/organization/invitations/:id` | DELETE | ✅ | owner/admin | ✅ | — | ❌ | Low |
| `/invitations/:token` | GET | **❌** | — | — | — | ❌ | **P3** — enumeration surface |
| `/invitations/:token/accept` | POST | ✅ | — | joins org | — | ❌ | P2 — unthrottled |
| `/support` | GET/POST | ✅ | any | user-scoped | ✅ | ❌ | P2 — unthrottled email |
| `/slack/link-code` | POST | ✅ | any | — | — | ❌ | P2 — unthrottled code minting |
| `/slack/events` | POST | HMAC | — | resolved from Slack ID | — | ❌ | **P1** — unthrottled agent invocation |

**Summary:** 52 endpoints. **1 has a rate limit.** 9 trigger AI spend or outbound email with no throttle. Tenancy scoping is correct on every authenticated business endpoint — no IDOR found.

---

## 3. Database inventory

| Model | Purpose | Tenant owner | Indexes declared | Unique constraints | Retention | Risk |
|---|---|---|---|---|---|---|
| `User` | Account | — (global) | `email` unique | `email`, `slackUserId` | Forever | **P0-01**: unique index may not exist in prod |
| `Session` | Device sessions | user | `user` | `jti` | **Never expires** | P2-02 unbounded growth |
| `Otp` | Auth codes | — | — | `email` | **No TTL** | **P0-01 + P0-02** |
| `Organization` | Tenant root | self | — | — | Forever | Holds `creditsBalance` — hot document |
| `Membership` | User↔Org | org | `organization` | `{user, organization}` | Forever | Correct |
| `Invitation` | Pending invites | org | `organization`, `email` | `token`, partial `{org,email}` pending | `expiresAt`, **no TTL** | P3 |
| `Billing` | **Invoices + usage accruals** | org | `organization`, `platform`, `platformConnection`, `billingDate`, `status` | partial `{org, connection, externalId}` | Forever | **P1-03** no provenance; **no compound indexes**; no `dueDate` index; two record types conflated |
| `Platform` | Manual categories | org | `organization` | `{organization, slug}` | Forever | Low |
| `PlatformConnection` | Connected accounts | org | `organization` | compound (line 245) | Forever | Holds encrypted keys + `metadata.emailSync` watermark |
| `Recommendation` | AI suggestions | org | `organization`, `status` | `{organization, signature}` non-unique | Forever | No `estimatedImpact` field |
| `Notification` | In-app alerts | org | `organization`, `category`, `read`, `archived` | `{organization, signature}` non-unique | **Forever** | Unbounded; over-indexed (5 single-field) |
| `CreditTransaction` | Immutable ledger | org | `{organization, createdAt:-1}` | — | Forever | Good design; unbounded |
| `AgentSession` | Managed Agents pointer | **user, not org** | — | `user` | Until reset | Seam noted in P2-12 |
| `SlackProcessedEvent` | Webhook dedup | — | — | `eventId` | **TTL ✅** | Only model with a real TTL; useless if index absent |
| `UserSettings` | Prefs + Slack webhook | user | — | `user` | Forever | Stores a webhook URL in plaintext |
| `SupportRequest` | Tickets | user | `user` | — | Forever | Low |

**Query behaviour at scale** (estimates, no load test run):

| Records | `GET /billing` | Analytics overview | `autoMarkOverdue` |
|---|---|---|---|
| 10k | ~200ms, ~5MB payload | ~50ms | Fine |
| 1M | **Timeout / OOM** | ~2–5s (single-field index only) | Full collection scan, no `dueDate` index |
| 100M | Impossible | Needs pre-aggregation | Unusable |

**Required index additions:** `{organization:1, billingDate:-1}`, `{organization:1, status:1, dueDate:1}`, `{organization:1, vendorDomain:1}` (after P1-02), `{dueDate:1, status:1}` for the overdue job, TTL on `Session` and `Otp`.

---

## 4. AI call inventory

| Location | Trigger | Model | Input context | Tools | Turns | Metered? | Credits | Cacheable? | Avoidable? |
|---|---|---|---|---|---|---|---|---|---|
| `ai-invoice-extractor.ts:118` | Per candidate email | `claude-haiku-4-5-20251001` (hardcoded) | ~1,950 tok: preamble + From/Subject + 6k chars body + tool schema | 1 forced | 1 | ✅ tokens only | 3 | **Yes — ~430 tok schema+preamble identical every call, unused** | **Partially** — deterministic pre-filter could resolve known senders without AI |
| `managed-agent.service.ts:246` | `POST /api/agent/chat` | Console-configured, **not in repo** | System + tools + full growing history + tool results | 6 (read/propose only) | **Unbounded — no max** | ✅ tokens only, ✗ session-hours | ~9 | Managed Agents handles internally; not controllable from code | **Yes — ~70% of queries are deterministic lookups** |
| `managed-agent.service.ts:246` (Slack) | Slack DM | same | same | same | unbounded | ✅ | ~9 | same | same |
| `recommendation-engine.ts` → `runAgentPrompt` | `business.data.changed` event | same | Analytics overview serialized | Declined | 1 | ✅ | ~9 | **Yes — analytics rarely changes materially** | **Yes** — could be a scheduled batch job |
| `recommendation.controller.ts` `/refresh` | Manual POST | same | same | Declined | 1 | ✅ | ~9 | Yes | Yes |

**Unmetered cost dimensions:** Managed Agents session runtime ($0.08/session-hour), prompt cache reads/writes. Neither appears in `tokensToCredits`.

**Hidden multiplier:** one user question = 1 + N tool round-trips, each re-sending full context. A 3-tool question is ~3 model requests, not one.

---

## 5. Security findings

| ID | Sev | Attack | Area | Evidence | Exploit scenario | Fix |
|---|---|---|---|---|---|---|
| S-01 | **P0** | Missing index → broken invariants | DB | `database.ts:40`, no `syncIndexes` in repo | Duplicate accounts per email; OTP attempt limiter defeated; Slack retries re-run agent turns and re-bill | Migration + `syncIndexes()` at boot |
| S-02 | **P0** | Predictable OTP | Auth | `auth.controller.ts:67` `Math.random()` | Recover PRNG state from self-issued codes, predict a victim's | `crypto.randomInt` |
| S-03 | **P0** | Attempt-limit bypass | Auth | `auth.controller.ts:104` read-modify-write | N concurrent guesses all consume 1 attempt slot | Atomic `findOneAndUpdate` with `$inc` + `$lt` guard |
| S-04 | **P0** | Unthrottled auth | Auth | `auth.routes.ts` — no `rateLimit` | Unlimited OTP guesses; unlimited Resend spend; login DoS | Mount `rateLimit` on all three |
| S-05 | **P0** | Free privilege escalation | Billing | `plan.controller.ts:66` | Any admin sets tier to Business → unlimited limits + 12k credits | Webhook-only tier writes |
| S-06 | **P1** | Indirect prompt injection | AI | `ai-invoice-extractor.ts:118` — no system prompt, raw body | Attacker-controlled `amount`/`vendor`/`status`; fabricated invoices enter the trusted dataset | System prompt + delimiters + DMARC + output sanitization |
| S-07 | **P1** | Second-order injection | AI | `managed-agent.service.ts:259` `JSON.stringify` of stored vendor names into agent context | Vendor name carrying instructions reaches the agent as text | Escape on ingest and on render |
| S-08 | **P1** | Sender spoofing | Email | `parser.ts:97` parses `From` only; no SPF/DKIM/DMARC | Fake AWS invoice filed under the real AWS vendor slug | Capture auth results; downgrade confidence on failure |
| S-09 | **P1** | Key reuse / no rotation | Secrets | `crypto.ts:23` `aiEncryptionKey \|\| jwtSecret`; bare SHA-256; no key version | JWT-secret rotation bricks all stored credentials; low-entropy secret is brute-forceable | Require the key, HKDF, versioned payload |
| S-10 | **P1** | Unbounded AI spend | Cost | `agent-chat.routes.ts` no limit; no `MAX_ITERATIONS`; stale-cache balance check | Authenticated user drives org balance arbitrarily negative | Reserve-then-reconcile + per-route limit + iteration cap |
| S-11 | **P2** | Slack account takeover | Auth | `slack-chat-handler.ts:52` — global code match, no rate limit on the DM path | Brute-force any active link code from a Slack DM → bind attacker's Slack ID to a victim account → full agent access | Scope the lookup, add attempt counter, throttle the DM path |
| S-12 | **P2** | User enumeration | Auth | `auth.controller.ts:151` explicit 404 message | Confirm which emails have accounts | Uniform response for both paths |
| S-13 | **P2** | Missing RBAC on financial data | Billing | `billing.routes.ts` — no role check | Any member deletes any invoice | Gate mutations on owner/admin, or add soft delete + audit log |
| S-14 | **P2** | Proxy-blind rate limiting | Infra | No `trust proxy`; `req.ip` is the Railway proxy | All unauthenticated traffic shares one bucket → the one limiter is both useless and a DoS lever | `app.set('trust proxy', 1)` |
| S-15 | **P2** | Data exfiltration convenience | Billing | `/billing/export` unbounded, unthrottled | A stolen token dumps the entire financial history in one request | Paginate, throttle, audit-log exports |
| S-16 | **P2** | Silent failure | Ops | `sync-engine.ts:352` bare `catch {}` | An attacker degrading a provider gets no alarm raised | Structured logging + `lastSyncError` |
| S-17 | **P3** | Token enumeration | Invites | `/invitations/:token` unauthenticated, unthrottled | Guess invite tokens to discover org names | Throttle; verify token entropy |
| S-18 | **P3** | No CSP | Frontend | `helmet()` defaults only | Any future XSS becomes full account compromise (JWT in `localStorage`) | Set a CSP header |
| S-19 | **P3** | Dependency advisories | Deps | `npm audit` | `morgan` log forging, `qs` DoS | `npm audit fix` |
| S-20 | **P3** | Unversioned security config | AI | Agent system prompt + tool schemas live in the Anthropic Console | Cannot review, diff, test, or roll back the agent's guardrails | Check the config into the repo; make `sync-agent-config.ts` the source of truth |

**Cross-tenant test result:** I traced every query against `Billing`, `Platform`, `PlatformConnection`, `Recommendation`, `Notification`, `CreditTransaction`, and every agent tool. All scope by organization. `findBillingOr404` returns 404 rather than 403, so it doesn't leak existence. **No IDOR or BOLA vulnerability found.** The two seams worth watching are the dual org-resolution path (P2-12) and `AgentSession` being keyed by user rather than `(user, org)` — both currently mitigated, neither structurally guaranteed.
