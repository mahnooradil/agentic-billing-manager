# System Architecture

> Reference document for the **Agentic AI-Based Intelligent Billing Manager**.
> This describes the **target architecture**. Only the project foundation is
> implemented in Phase 1 — the layers below are built incrementally in later phases.

## High-Level Data Flow

```
                    User
                     │
                     ▼
              Next.js (Frontend)
        React · TypeScript · Tailwind · shadcn/ui
                     │
                     ▼
             Node.js + Express Backend
        (Auth · Background Workers/Cron · REST APIs)
                     │
                     ▼
                 Pipedream                ← Integration / automation layer
                     │
                     ▼
              Third-Party APIs
     (OpenAI · Google Ads · Facebook Ads · Canva · GitHub · …)
                     │
                     ▼
                Adapter Layer
                     │
                     ▼
              Analytics Engine
                     │
                     ▼
                MongoDB Atlas
                     │
                     ▼
             LangGraph AI Agent
                     │
                     ▼
             Qwen 3 Instruct (AI Brain)
                     │
                     ▼
      AI Recommendations · AI Chat · Alerts
                     │
                     ▼
               Next.js Dashboard UI
```

## Layer Responsibilities

### Pipedream (Integration Layer)
Sits between the backend and third-party providers. Handles secure connections,
OAuth flows, scheduled data pulls, and event triggers so the backend does not
talk to each provider directly.

### Adapter Layer
Normalizes heterogeneous provider data into one consistent shape.

- **API Response Mapping** — map each provider's response into a shared model
- **Data Validation** — validate and clean incoming data
- **Error Handling** — gracefully handle API failures and malformed data
- **Common Billing Format** — output one standardized billing format

### Analytics Engine
Turns standardized billing/usage data into insights.

- **Spending Calculator** — totals and cost breakdowns
- **Usage Analyzer** — usage patterns and trends
- **Forecast Engine** — predict future costs
- **Cost Optimizer** — find savings / optimization opportunities
- **Recommendation Generator** — produce actionable recommendations

### LangGraph AI Agent
Orchestrates agentic reasoning over the analytics output.

```
Planner → Memory → Tool Calling → Reasoning → Response Generator
```

- **Planner** — break a goal into steps
- **Memory** — retain each customer's historical billing behavior
- **Tool Calling** — call Analytics Engine / DB / APIs as tools
- **Reasoning** — reason over data to derive insights
- **Response Generator** — produce the final recommendation / chat reply

### Qwen 3 Instruct (AI Brain)
The underlying LLM powering the agent's reasoning and natural-language output.

## Deployment Targets

| Component | Platform       |
| --------- | -------------- |
| Frontend  | Vercel         |
| Backend   | Render         |
| Database  | MongoDB Atlas  |

---

**Note:** This is the architectural blueprint. Implementation happens phase by
phase; nothing beyond the project scaffold exists yet.
