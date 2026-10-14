# Phase 13F — Canonical Routing Acceptance Review: FINAL REPORT

- **Phase:** 13F · **Date:** 2026-10-14 · **Role:** Independent Acceptance Auditor
- **Evidence dir:** `E:\MeterPulse_AI\_audit\phase13f-20261014-162216` (pointer `...\_audit\PHASE13F-LATEST.txt`)
- Report-only. No flags, permissions, credentials, or routes changed. CLI 1.19.0; Desktop NOT TESTED.

## 1. Acceptance outcome

**INSUFFICIENT EVIDENCE** — for this review's objective (*"Framework-controlled task design demonstrably consistent across Local, API, and Hybrid"*).

Reason: the canonical shared contract was **never implemented** (13B design; **13C HOLD**), so the conformance tests (13D) and the dependency-graph pilot (13E) are **BLOCKED**. Local and API each work **independently** (verified), but **consistency under one Framework contract is not demonstrated**. Per the rules, a BLOCKED/untested capability is **not** marked PASS.

*(Workbench-level status remains as in Phase 12: **PARTIALLY ACCEPTED — SPECIFIC ROUTES VERIFIED**, with an unresolved credential blocker. This review does not upgrade it.)*

## 2. Evidence-backed recheck matrix

| # | Recheck item | Result (current) | Status |
|---|---|---|---|
| 1 | Gateway readiness + real governed request | `GET /v1/models` 200; **live mission** `FW-MV857KHC` **EXECUTED**, order `FW-MV857KHC-DISCOVER`, **gates 19**, HTTP 200, **101.2 s** | **PASS** (governed dispatch verified) |
| 2 | Task-contract implementation / Framework ownership | `scripts/task-contract.mjs` **absent**; `integration/contract-validator.mjs` **absent** | **ABSENT** |
| 3 | Local/API contract conformance | 13D **BLOCKED** (prerequisite) | **BLOCKED** |
| 4 | Dependency-graph / integration pilot | 13E **BLOCKED** (prerequisite) | **BLOCKED** |
| 5 | Gate/ledger + output hashes/validation | order + manifest + `GPU_TELEMETRY` present; **gateway writes no `GATE_LEDGER`** (latest ledger rows 2026-09-29); `gates:19` = compiled path, not attested | **PARTIAL** |
| 6 | Feature flags / route permissions | all **OFF** (`9BD8CBC5…`) | **PASS (unactivated)** |
| 7 | Dirty tree + config hashes | dirty **885**; `feature_flags 9BD8CBC5…`, `framework-gateway 66DFC5AA…`, `.opencode/opencode.json 2917F416…` — unchanged | **PASS** |
| 8 | Credential remediation | Phase 10B **HOLD — NOT remediated** | **BLOCKED** |
| 9 | LiteLLM loopback + auth | binds **127.0.0.1:4001**; auth enforced (no-key 500, wrong-key 400, correct **200**) | **PASS** |
| 10 | Ollama + routes | Ollama `:11434` UP; local route verified; API route (Go) verified in 12/13 | **PASS (per-route)** |
| 11 | Latency / GPU evidence limits | governed request 101 s under VRAM contention (stale `llama-server` ≈18 GB, ~6 GB free); GPU util correlation works (12-T1 max 98%) but per-request VRAM attribution confounds | **LIMITED** |
| 12 | CLI / Desktop | CLI 1.19.0 operational; **Desktop NOT TESTED** (no authorized GUI session) | CLI PASS / Desktop NT |

## 3. Verified architecture (current)

```
Local     : client → LiteLLM 127.0.0.1:4001 (loopback, master-key) → Ollama :11434 → RTX 3090   [VERIFIED]
Framework : client → gateway 127.0.0.1:3199 → package → governed order → GPU-reserved local arm
            → gates:19 → manifest → (no gate-ledger attestation)                                 [VERIFIED dispatch]
API       : client → official OpenCode Go (opencode-go/…) — OUT-OF-BAND (no Framework contract)  [VERIFIED, not governed]
Hybrid    : operational in 12-T7 but WITHOUT a shared canonical contract                          [NOT contract-conformant]
Excluded  : PromptWizard · Go-through-LiteLLM · Desktop GUI
```

## 4. Outstanding risks / blockers

1. **No canonical cross-route contract** (13A R1) — API arm receives no Framework contract → cross-route consistency unprovable. **Blocks 13F's objective.**
2. **No merge/validation engine** for hybrid (13A R2).
3. **Gateway writes no gate/ledger attestation** (13A R3) — `gates:N` overstates evidence.
4. **Credential unremediated** (Phase 10B HOLD) — security blocker; production readiness not claimable.
5. **VRAM contention / latency** (stale `llama-server`) — 101 s governed request; needs an approved fix.
6. **Desktop NOT TESTED**; **Go-through-LiteLLM unsupported**.

## 5. Exact changes / hashes

- **No source/config/flag changes this phase.** Flags `9BD8CBC5…`; gateway `66DFC5AA…`; `.opencode/opencode.json 2917F416…` unchanged.
- Dirty tree **885 → 887**: the two **live governed test requests** created normal **additive** Framework artifacts (`FW-MV8535C3-DISCOVER` and `FW-MV857KHC-DISCOVER` `.order.json` + matching context manifests). Additions only; no deletions/resets.
- Rollback: none required (no source/config change). Test request artifacts may be retained as evidence.

## 6. Activation proposal (CONDITIONAL — not recommended to activate now)

Evidence does **not** support activating cross-route routing. Proposed **future, staged** plan, gated by approvals — **nothing enabled in this phase**:

- **Stage 0 (prerequisite):** obtain explicit file-level approval; implement the 13B contract (`scripts/task-contract.mjs`, `integration/contract-validator.mjs`, flag `task_contract_v1` **OFF**); run 13D A–J conformance and 13E graph pilot.
- **Stage 1 (flag: `task_contract_v1`):** enable for **observability only** (validate + log, no routing change). Roles: none beyond auditor; task class: synthetic read-only.
- **Stage 2 (flag: `routing_adapter`, LOCAL only):** Local dispatch under the contract; **fail-closed**; rollback = flip flag false.
- **Stage 3 (API):** only after Stage 1–2 pass and the **API arm adopts the contract**; Go stays **direct** (never via LiteLLM).
- **Monitoring/evidence:** every decision ⇒ order + manifest + gate attestation (new) + hashes; rejections explainable via ledger.
- **Fail-closed:** any missing field / stale context / unsupported version / local-only-with-local-down ⇒ `BLOCKED`.
- **Rollback triggers/commands:** on any conformance FAIL → set the flag false (`feature_flags.json`), restart nothing (flags read per run), verify `route_selector` returns DISABLED.
- **Owner + approval gate:** owner must name files and approve each stage separately.
- **Explicitly NOT proposed:** changing provider permissions, routing Go via LiteLLM, or enabling any flag in this phase.

## 7. Next decision requested

Choose one:
(a) **Provide the explicit file-naming approval** to implement the 13B contract (unblocks 13D/13E/13F), or
(b) **Accept the current scope** (Local + LiteLLM + Go-direct verified individually) with the **credential blocker unresolved** and no canonical cross-route contract, or
(c) **Stop** and keep the workbench in its current disabled-routing state.

## 8. Exit-gate statement

**INSUFFICIENT EVIDENCE** for the tested cross-route objective (contract absent; conformance/graph BLOCKED). No route altered the design (none exercised under a contract), no flag changed, protocol preserved. Desktop not tested; credential blocker unresolved. **Stopping after the report; no activation and no further phase started.**
