# Frontend — Agentic Billing Manager

Next.js (App Router) frontend built with React, TypeScript, Tailwind CSS, and
shadcn/ui (added on demand).

> **Phase 1:** foundation only. No pages, auth, or features are implemented.

## Tech

- **Next.js 16** (App Router) + **React 19**
- **TypeScript**
- **Tailwind CSS v4**
- **ESLint** + **Prettier**

## Folder Structure

```
frontend/
├── public/                 # Static assets
└── src/
    ├── app/                # App Router (routes, layouts, pages)
    ├── components/         # Reusable UI components (shadcn/ui lives in ui/)
    ├── features/           # Feature modules (grouped by domain)
    ├── hooks/              # Shared custom React hooks
    ├── lib/                # Low-level utils & client setup (e.g. cn())
    ├── services/           # API client layer (talks to the backend)
    ├── types/              # Shared TypeScript types
    └── utils/              # Pure helper functions
```

## Environment

Copy `.env.example` → `.env.local` and set:

| Variable                   | Description                        |
| -------------------------- | ---------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | Base URL of the backend API        |

## Scripts

| Script                 | Description                       |
| ---------------------- | --------------------------------- |
| `npm run dev`          | Start dev server (localhost:3000) |
| `npm run build`        | Production build                  |
| `npm run start`        | Serve the production build        |
| `npm run lint`         | Run ESLint                        |
| `npm run format`       | Prettier-format the project       |
| `npm run type-check`   | TypeScript type-check (no emit)   |

## Adding shadcn/ui components

shadcn/ui is part of the stack. When you need a component:

```bash
npx shadcn@latest init      # one-time setup
npx shadcn@latest add button
```

Components land in `src/components/ui/`.
