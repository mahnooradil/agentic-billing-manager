# Production Hardening — Deferred Backlog

> Status: **DEFERRED**. These items are intentionally **not** implemented during
> feature-development phases. They are scheduled for a dedicated **Production
> Hardening phase** before deployment. Approved to defer on **2026-07-19** after
> the Phase 1–3 verification review.
>
> Do **not** implement these as part of a feature phase unless explicitly asked.

## Security hardening

- [ ] **Rate limiting** on `POST /api/auth/register` and `POST /api/auth/login`
      (e.g. `express-rate-limit`) — mitigates brute-force / credential stuffing.
- [ ] **Request body size limit** — `express.json({ limit: "10kb" })` in
      `backend/src/app.ts` to prevent large-payload DoS.
- [ ] **Login timing-attack mitigation** — run a dummy `bcrypt.compare` on the
      "user not found" path so response time does not reveal whether an email
      is registered (user enumeration via timing).

## Reliability / configuration

- [ ] **Fail-fast environment validation at startup** — validate required env
      vars (`JWT_SECRET`, `MONGODB_URI`, …) with Zod when the process boots,
      instead of the current lazy validation (which defers failure to first use).
- [ ] **`User.syncIndexes()` on startup (or a migration)** — in production
      `autoIndex` is `false`, so the `email` unique index is not auto-built.
      Uniqueness enforcement depends on that index existing.

## Quality / tooling

- [ ] **Automated test suite** committed to the repo (Vitest/Jest + supertest +
      `mongodb-memory-server`). Port the throwaway Phase 3 e2e checks
      (22 auth assertions) into it and wire into CI.
- [ ] **Dependency cleanup** — remove the vestigial `ts-node` devDependency from
      `backend/package.json` (dev uses `tsx`; `ts-node` is referenced by no
      script or config). Confirm nothing relies on it before removing.
- [ ] **Frontend boilerplate cleanup** — remove default Next.js starter assets
      (`public/*.svg` defaults, starter `page.tsx`) when the real UI lands.

## Verification still owed by the project owner

- [ ] **Live MongoDB Atlas connection** — verified only against an in-memory
      Mongo and failure paths so far. The real Atlas success path must be
      confirmed with real credentials in a local `backend/.env` (gitignored).
