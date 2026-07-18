# Agentic AI-Based Intelligent Billing Manager

A production-ready **AI-powered SaaS platform** that collects billing and usage
data from multiple third-party platforms (OpenAI/ChatGPT, Google Ads, Facebook
Ads, Canva, GitHub, etc.) through secure APIs, and — in later phases — uses an
AI Agent to analyze spending, detect unused subscriptions, forecast costs, and
act as an **AI Financial Copilot**.

> **Status:** Phase 1 — Project foundation only. No business features, auth, AI,
> or database logic are implemented yet.

---

## 🧱 Tech Stack

| Layer               | Technology                                            |
| ------------------- | ----------------------------------------------------- |
| **Frontend**        | Next.js (App Router) · React · TypeScript · Tailwind CSS · shadcn/ui |
| **Backend**         | Node.js · Express.js · TypeScript                     |
| **Database**        | MongoDB Atlas · Mongoose *(later phase)*              |
| **Authentication**  | JWT · bcrypt *(later phase)*                          |
| **AI Agent**        | LangGraph *(later phase)*                             |
| **AI Brain**        | Qwen 3 Instruct *(later phase)*                       |
| **Integration**     | Pipedream *(later phase)*                             |
| **Tooling**         | Git · GitHub · Postman · ESLint · Prettier            |
| **Deployment**      | Vercel (frontend) · Render (backend) · MongoDB Atlas  |

---

## 📁 Repository Structure

```
agentic-billing-manager/
├── frontend/          # Next.js app (React + TS + Tailwind + shadcn/ui)
├── backend/           # Express API (Node + TS, clean architecture)
├── docs/              # Shared project documentation
├── package.json       # Root convenience scripts (runs frontend/backend)
├── .gitignore
└── README.md
```

See [`frontend/README.md`](./frontend/README.md) and
[`backend/README.md`](./backend/README.md) for per-app details, and
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the system architecture.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18 (developed on v24)
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

Fill in the values (see each `.env.example` for the variables). **Never commit
real secrets.**

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

### 4. Production build

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

## 🗺️ Roadmap (high level)

- **Phase 1 — Foundation** ✅ *(this phase)* — project scaffolding, tooling, structure
- **Phase 2+** — Authentication, database models, dashboard, third-party
  integrations, Adapter Layer, Analytics Engine, LangGraph AI Agent

> Future features are intentionally **not** implemented yet.
