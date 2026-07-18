# Decision Log

Records locked decisions for the **Agentic AI-Based Intelligent Billing Manager**.
Nothing here changes without an explicit new entry.

---

## D-001 — Architecture is frozen (Phase 1)

**Status:** 🔒 Locked
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

**Status:** 🔒 Locked
**Decision:** shadcn/ui remains part of the official stack but is **not**
initialized yet. It will be set up (`npx shadcn@latest init`) when the Dashboard
UI phase begins. Until then, `src/components/ui/` stays empty.
