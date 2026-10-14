# PHASE-SUMMARY — condensed findings (Phases 0, 0.1, 1, 2, 13A–13F)

Full reports are in `reports/`. This is a navigation summary, not a re-audit.

## Phase 13A — Canonical Task-Design & Routing Audit
- **Finding:** canonical task design exists **only for the LOCAL arm** (package `mission.buildExecutionPackage` + capsule `context-bridge.createLocalExecutionCapsule` + manifest `context.mjs` + order `orders.mjs`).
- **API arm is out-of-band** (no Framework dispatcher). **No merge engine.** Gateway `gates:N` = compiled path length, **not** attestation; gateway writes **no** gate ledger.
- Classifications: LOCAL implemented; HYBRID documented-only; API missing.

## Phase 13B — Canonical Contract Proposal (design only)
- Versioned `mp.taskcontract/1` extending the capsule: IDs, objective/scope, deps, typed I/O, context, capabilities/tools, privacy, output+hash+provenance, acceptance, execution limits, compatibility, statuses, merge, per-arm `executionBinding`. Immutable vs provider-variable field sets; A–J conformance tests. **PROPOSED.**

## Phase 13C — Implementation attempt: **HOLD**
- Mandatory gate not satisfied (no explicit file-naming approval) → **not implemented**.

## Phase 13D — Conformance: **BLOCKED** (prerequisite: contract not implemented).
## Phase 13E — Dependency-graph pilot: **BLOCKED** (same prerequisite).
## Phase 13F — Acceptance review: **INSUFFICIENT EVIDENCE** for cross-route consistency; workbench = **PARTIALLY ACCEPTED — SPECIFIC ROUTES VERIFIED**; live governed mission verified; **credential blocker unresolved**.

## Phase 0 — Reusability & Runtime Reality
- Verified: gateway/LiteLLM/Ollama/Postgres up; metered app + web consoles running; MCP 12/17 enabled; tool bridge read-only allowlist.
- Missing: raw-task immutability, `TASK_PROFILES` wiring, shared API contract, merge engine.
- Duplicates/obsolete: `ollama-proxy` vs LiteLLM; `MeterVerse-*` tasks vs `MeterPulse*` services; retired `qwen2.5-coder:*` defaults.

## Phase 0.1 — UI & Execution-Surface Suitability
- **CLI** verified (CLI evidence only); **Desktop NOT TESTED**; **Open WebUI not installed**; **Meter Pulse consoles are business UI** with **0 references to `:3199`** → not Framework-integrated.
- Recommendation: use **CLI** as the operator surface; add a **small additive Framework-integrated submit surface** later.
- LiteLLM = transport only (loopback, auth enforced); never carry Go.

## Phase 1 — Minimal Framework-First Execution Design
- Proposed additive: `scripts/task-contract.mjs`, `.ai/project-profile.json`, `integration/opencode-adapter.mjs`, additive edits to `mission.mjs` + `framework-gateway.mjs`; contract+profile+attestation behind an OFF flag.

## Phase 2 — Evidence Reconciliation & Approval Package
- Reconciled Phase 13 vs Phase 1 → **canonical Stage 0** (see `STAGE-0-REVIEW-PACKET.md`): keep one contract module, **drop** the duplicate validator, **defer** the OpenCode adapter, flag `task_contract_v1:false`. Status: **READY FOR EXPLICIT FILE-LEVEL APPROVAL**.

## Decisions already resolved
1. One contract module (`scripts/task-contract.mjs`); no second validator.
2. Framework stays generic; project specifics in `.ai/project-profile.json`.
3. API/OpenCode stays an adapter (direct Go; never via LiteLLM).
4. Flags stay OFF; nothing activated.

## Open questions / approval gates
- **Gate A:** explicit file-level approval of Stage 0 (Phase 13C gate).
- **Gate B:** credential remediation for the plaintext `DATABASE_URI` (separate).
- **Gate C:** Desktop GUI test (separate, needs an observed session).
- **UNKNOWN:** global OpenCode config contents; `:9000/:9001` owners.
