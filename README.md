# Agentic AI-Based Intelligent Billing Manager

An **AI-powered billing/usage manager** that pulls billing and usage data
from 129 named platform adapters plus a Gmail/Outlook email-sync fallback,
normalizes it into one Billing collection, runs it through a rule-based
Analytics/Recommendation/Notification engine, and surfaces a **Billing
Advisor Agent** (Claude Managed Agents) that can answer questions about real
spend data and propose — never silently apply — status changes.

> **Status:** actively built, phase by phase — see
> [`CLAUDE.md`](./CLAUDE.md) §8 for the complete, current phase log. **Not
> yet production-ready**: there are zero automated tests covering the
> frontend, no CI gate beyond typecheck/lint/build, and a documented
> external audit backlog (`CLAUDE.md` §10) of P0/P1 findings — several
> already remediated (see the audit-remediation task log in that same
> section), several still open. Don't take this claim on faith either —
> read §10 yourself before relying on it for anything with real money or
> real customer data beyond what's already explicitly covered there.

---

## 🧱 Tech Stack

| Layer               | Technology                                            |
| ------------------- | ----------------------------------------------------- |
| **Frontend**        | Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 · shadcn/ui (`base-nova` — Base UI primitives, not Radix) |
| **Backend**         | Node.js 24 · Express 5 · TypeScript (pinned to 5) · Mongoose |
| **Database**        | MongoDB Atlas                                          |
| **Authentication**  | Passwordless OTP (no password field anywhere) + Google Sign-In |
| **AI**              | Claude Managed Agents (Billing Advisor Agent) · Claude Haiku 4.5 (email invoice extraction) — see [`docs/DECISIONS.md`](./docs/DECISIONS.md)'s D-004 |
| **Integration**     | Pipedream (129 billing-sync adapters + Gmail/Outlook OAuth) |
| **Payments**        | Stripe (one-time credit top-ups + recurring Pro/Business subscriptions) |
| **Tooling**         | Git · GitHub Actions CI · ESLint · Prettier · Vitest + mongodb-memory-server (backend) |
| **Deployment**      | Vercel (frontend) · Render (backend) · MongoDB Atlas  |

---

## 📁 Repository Structure

```
agentic-billing-manager/
├── frontend/          # Next.js app (React + TS + Tailwind + shadcn/ui)
├── backend/           # Express API (Node + TS, Mongoose, 100+ backend tests)
├── docs/               # ARCHITECTURE.md, DECISIONS.md, PRODUCTION-HARDENING.md, docs/audit/
├── flow/               # Working notes from the 2026-09-15 external audit's remediation
├── package.json        # Root convenience scripts (runs frontend/backend)
├── .gitignore
└── README.md
```

See [`frontend/README.md`](./frontend/README.md) and
[`backend/README.md`](./backend/README.md) for per-app details,
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the system architecture,
and [`CLAUDE.md`](./CLAUDE.md) for the actual single source of truth on how
this project is built and conventioned.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 24 (the project is built and pinned on this version — see
  `CLAUDE.md` §1, do not change it)
- **npm** ≥ 9
- **Git**

### 1. Install dependencies

```bash
# from the repo root — installs both apps
npm run install:all
```

Or install each app separately:

```bash
cd frontend && npm install
cd backend  && npm install
```

### 2. Configure environment variables

```bash
# frontend
cp frontend/.env.example frontend/.env.local

# backend
cp backend/.env.example backend/.env
```

Fill in the values (see each `.env.example` for the variables, and
`CLAUDE.md` §7 for which secrets are required vs. optional-with-graceful-
degradation). **Never commit real secrets.**

### 3. Run in development

Open two terminals (or use the root scripts):

```bash
npm run dev:backend    # http://localhost:5000
npm run dev:frontend   # http://localhost:3000
```

Verify the backend is up:

```bash
curl http://localhost:5000/api/health
```

### 4. Run tests (backend)

```bash
cd backend && npm test
```

Tests run against an isolated in-memory MongoDB (`mongodb-memory-server`) —
they never touch the real Atlas database and need no real secrets.

### 5. Production build

```bash
npm run build          # builds frontend + backend
```

---

## 🧰 Useful Root Scripts

| Script                  | Description                          |
| ----------------------- | ------------------------------------ |
| `npm run install:all`   | Install deps for both apps           |
| `npm run dev:frontend`  | Start the Next.js dev server         |
| `npm run dev:backend`   | Start the Express dev server         |
| `npm run build`         | Build both apps                      |
| `npm run lint`          | Lint both apps                       |
| `npm run format`        | Prettier-format both apps            |

---

## 🗺️ Roadmap

This project is built strictly one phase at a time against a running phase
log, not a fixed up-front roadmap. For the complete, current, accurate
picture — every phase actually shipped, what's in progress, and the full
external-audit remediation backlog with what's done vs. still open — see
[`CLAUDE.md`](./CLAUDE.md) §8 ("Phase status log") and §10 ("External
founder/CTO/architect audit"). This README intentionally does not duplicate
that list, to avoid it going stale the way this file itself previously did.
