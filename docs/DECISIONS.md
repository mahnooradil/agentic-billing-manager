# Decision Log

Records locked decisions for the **Agentic AI-Based Intelligent Billing Manager**.
Nothing here changes without an explicit new entry.

---

## D-001 — Architecture is frozen (Phase 1)

**Status:** ⚠️ **Superseded by D-004 (2026-10-01).** Kept verbatim below for
history — this decision's actual architecture (LangGraph on Qwen 3 Instruct)
was never built. Do not treat anything below this line as current; see D-004.

**Decision:** The system architecture in [`ARCHITECTURE.md`](./ARCHITECTURE.md)
is the official blueprint and is frozen. The full flow is fixed:

```
User → Next.js → Express Backend → Pipedream → Third-Party APIs →
Adapter Layer → Analytics Engine → MongoDB Atlas → LangGraph → Qwen 3 Instruct → Dashboard
```

Including the internal modules:
- **Adapter Layer:** API Response Mapping · Data Validation · Error Handling · Common Billing Format
- **Analytics Engine:** Spending Calculator · Usage Analyzer · Forecast Engine · Cost Optimizer · Recommendation Generator
- **LangGraph Agent:** Planner → Memory → Tool Calling → Reasoning → Response Generator

Any change requires a new decision entry here.

---

## D-002 — Node.js version stays as-is

**Status:** 🔒 Locked (for now)
**Decision:** Do **not** change the Node.js version at this stage. Development
continues on the current environment (Node 24). Pinning an LTS for deployment
will be revisited only when we reach the deployment phase.

---

## D-003 — shadcn/ui postponed to the Dashboard phase

**Status:** ✅ Actioned (Phase 4). shadcn/ui was initialized when the
Dashboard UI phase began, using the `base-nova` style — **Base UI primitives
(`@base-ui/react`), not Radix**, per the style's own component contract. See
`CLAUDE.md` §1/§4 for the current frontend conventions this produced.

**Original decision (for history):** shadcn/ui remains part of the official
stack but is **not** initialized yet. It will be set up (`npx shadcn@latest
init`) when the Dashboard UI phase begins. Until then, `src/components/ui/`
stays empty.

---

## D-004 — Supersedes D-001: the real AI stack is Claude, not LangGraph/Qwen

**Status:** 🔒 Locked
**Date:** 2026-10-01 (recorded during the documentation-drift cleanup that is
itself one item in the 2026-09-15 external audit's backlog — see
[`../CLAUDE.md`](../CLAUDE.md) §10.7).

**Decision:** D-001's architecture (a LangGraph agent orchestrating a
self-hosted Qwen 3 Instruct model) was never implemented and is not the plan
going forward. The actual, shipped AI layer is:

- **Billing Advisor Agent** — Claude Managed Agents (a persisted agent +
  environment in the Anthropic Console), one session per user, driving
  read-only and propose-only custom tools against real billing/platform
  data. Reachable from both the web chat UI and Slack DMs.
- **Email invoice extraction** — plain (non-agentic) Claude Haiku 4.5 calls,
  one per scanned email, forced through a single tool call for structured
  output, with system-prompt + delimiter framing against prompt injection.

No self-hosted model, no LangGraph graph/node orchestration, and no Qwen
model exist anywhere in this codebase. `ARCHITECTURE.md` has been rewritten
to describe this real architecture instead of the frozen D-001 blueprint.
Why Claude Managed Agents specifically (vs. a self-hosted API-based agent)
was the subject of a separate architecture-comparison analysis done earlier
in this project's life and is not re-litigated here — this entry only
records that the decision was made and the old doc no longer reflects
reality.

Any future change to the AI layer (e.g. adopting a deterministic
intent-router ahead of the agent, per the audit backlog) gets its own new
decision entry — this one only closes out the D-001/reality gap.
