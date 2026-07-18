# Backend — Agentic Billing Manager

Express.js REST API written in TypeScript using a clean, modular architecture.

> **Phase 1:** foundation only. Only a `/api/health` endpoint exists. No auth,
> database, or business logic is implemented yet.

## Tech

- **Node.js** + **Express 5**
- **TypeScript 5** (CommonJS output)
- **helmet**, **cors**, **morgan**, **dotenv**
- **ESLint** + **Prettier**
- Dev runtime: **tsx** + **nodemon** · Build: **tsc** + **tsc-alias**

## Folder Structure

```
backend/
└── src/
    ├── config/         # Typed env loading & app configuration
    ├── controllers/    # Request handlers (thin — delegate to services)
    ├── middlewares/    # Express middleware (error handler, 404, ...)
    ├── models/         # Mongoose models (empty in Phase 1)
    ├── routes/         # Route definitions, mounted under /api
    ├── services/       # Business logic (empty in Phase 1)
    ├── types/          # Shared TypeScript types
    ├── utils/          # Pure helpers (empty in Phase 1)
    ├── app.ts          # Express app factory (middleware + routes)
    └── server.ts       # Entry point (bootstraps the server)
```

Path alias `@/*` maps to `src/*` (resolved at build time by `tsc-alias`).

## Environment

Copy `.env.example` → `.env` and set:

| Variable       | Default                 | Description                       |
| -------------- | ----------------------- | --------------------------------- |
| `NODE_ENV`     | `development`           | Runtime environment               |
| `PORT`         | `5000`                  | Server port                       |
| `CORS_ORIGIN`  | `http://localhost:3000` | Allowed frontend origin           |

> `MONGODB_URI`, `JWT_SECRET`, etc. are reserved for later phases.

## Scripts

| Script                | Description                            |
| --------------------- | -------------------------------------- |
| `npm run dev`         | Start dev server with hot reload       |
| `npm run build`       | Compile TS → `dist/` (+ alias rewrite) |
| `npm run start`       | Run the compiled server                |
| `npm run lint`        | Run ESLint                             |
| `npm run format`      | Prettier-format the project            |
| `npm run type-check`  | TypeScript type-check (no emit)        |

## Health check

```bash
curl http://localhost:5000/api/health
# { "success": true, "data": { "status": "ok", ... } }
```
