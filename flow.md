# flow.md — Index

**Status: all 12 source documents processed (2026-09-25), plus 2 user-raised "extra" items.** Each
source document has its own flow file under `flow/`, written after being read line by line and
cross-checked against the live codebase wherever a claim was checkable. Execution order is in
`flow/10-remediation-roadmap.md`. **Nothing is authorized for implementation until the user
explicitly assigns it, per `CLAUDE.md` §2 — this review is analysis only, no code has been changed.**

## Per-document flow files

| # | Document | Flow file | Status |
|---|---|---|---|
| 00 | Executive Summary | [`flow/00-executive-summary.md`](flow/00-executive-summary.md) | Read + inspected against live code on 2026-09-23 |
| extra | Slack — one-click OAuth connect + per-organization bot | [`flow/extra-01-slack-oauth-redesign.md`](flow/extra-01-slack-oauth-redesign.md) | Planned, not yet approved to build |
| extra | Usage signal, "what to cancel," forecasting | [`flow/extra-02-usage-signal-and-forecasting.md`](flow/extra-02-usage-signal-and-forecasting.md) | Planned, explicitly deferred to the end of the roadmap |
| 01 | Current Architecture | [`flow/01-current-architecture.md`](flow/01-current-architecture.md) | Read + inspected against live code on 2026-09-23 |
| 02 | Code and Module Audit | [`flow/02-code-and-module-audit.md`](flow/02-code-and-module-audit.md) | Read + inspected against live code on 2026-09-23 |
| 03 | Security Audit | [`flow/03-security-audit.md`](flow/03-security-audit.md) | Read + inspected against live code on 2026-09-23 |
| 04 | AI Agent and Memory Audit | [`flow/04-ai-agent-and-memory-audit.md`](flow/04-ai-agent-and-memory-audit.md) | Read + inspected against live code on 2026-09-25 |
| 05 | Email and Invoice Intelligence | [`flow/05-email-invoice-intelligence.md`](flow/05-email-invoice-intelligence.md) | Read + inspected against live code on 2026-09-25 |
| 06 | Cost and Unit Economics | [`flow/06-cost-and-unit-economics.md`](flow/06-cost-and-unit-economics.md) | Read + inspected against live code on 2026-09-25 |
| 07 | Pricing, Credits and Stripe | [`flow/07-pricing-credits-stripe.md`](flow/07-pricing-credits-stripe.md) | Read + inspected against live code on 2026-09-25 — Stripe findings on hold per user instruction |
| 08 | UI/UX and Product Audit | [`flow/08-ui-ux-product-audit.md`](flow/08-ui-ux-product-audit.md) | Read + inspected against live code on 2026-09-25 |
| 09 | Complete Test Matrix | [`flow/09-complete-test-matrix.md`](flow/09-complete-test-matrix.md) | Read + inspected against live code on 2026-09-25 |
| 10 | Remediation Roadmap | [`flow/10-remediation-roadmap.md`](flow/10-remediation-roadmap.md) | Processed 2026-09-25 — consolidates all prior documents' scattered order-lists into one master sequence |
| 11 | Target Architecture | [`flow/11-target-architecture.md`](flow/11-target-architecture.md) | Processed 2026-09-25 — mostly cross-referential; captures the 3 tables not yet transcribed elsewhere |
| 12 | Launch Readiness | [`flow/12-launch-readiness.md`](flow/12-launch-readiness.md) | Processed 2026-09-25 — **all 12 documents now complete** |

## Execution order

**See [`flow/10-remediation-roadmap.md`](flow/10-remediation-roadmap.md)** — the "next 10 engineering
tasks, in exact required order" section there is the authoritative starting sequence, reconciled
against every other document's findings. Not yet approved for implementation; documents 11 and 12
still to be processed.
