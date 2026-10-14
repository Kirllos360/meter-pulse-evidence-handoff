# Phase 2 — Evidence Reconciliation & Bounded Approval Package (PROPOSAL ONLY)

- **Date:** 2026-10-14 · **Run from:** `E:\meter` · **Mode:** read-only; one report written
- **Report dir:** `E:\MeterPulse_AI\_audit\phase2-reconcile-20261014-175517` (pointer `...\_audit\PHASE2-RECONCILE-LATEST.txt`)
- Framework remains the sole control plane. No implementation, no flag change, no route dispatch, no certification claimed.

## 1. Executive recommendation
Implement **one canonical contract module** (`scripts/task-contract.mjs`) as the single shared schema+validator, **one project-profile** (`.ai/project-profile.json`), and **two additive wirings** (`mission.mjs`, `framework-gateway.mjs`) behind a new **OFF** flag `task_contract_v1`. **Do not** create a second validator (`integration/contract-validator.mjs`) — fold validation into the contract module and **reuse** the existing integration guards (`prompt_contract.mjs`, `context_budget.mjs`, `retry_policy.mjs`). **Defer** the OpenCode Go adapter to Stage 1 (only needed when API routing is enabled). This is the smallest coherent scope that adds no second registry, no second router, and no duplicate implementation.

## 2. Evidence index & classifications

| # | Claim / finding | Source (report · section) | Class | Recheck? |
|---|---|---|---|---|
| E1 | Gateway `:3199`, LiteLLM `:4001`, Ollama `:11434` reachable | Phase 0 §2; Phase 1 §"Verified" | **VERIFIED** | no (checked live) |
| E2 | Gateway imports only mission/gates/enforce/context/context-bridge; **no `TASK_PROFILES`, no `attestGate`** | Phase 1 §Verified; re-grepped now | **VERIFIED** | no |
| E3 | `TASK_PROFILES.json` used only by `forge.mjs`/`random-audit-canary.ps1`, **not** by gateway | Phase 1; re-grepped | **VERIFIED** | no |
| E4 | `gates.attestGate`, `ledgerAppend`, `ledgerVerify`, `certify`, `validateOrder` exist | `scripts/gates.mjs` (read) | **VERIFIED** | no |
| E5 | `scripts/task-contract.mjs`, `integration/contract-validator.mjs`, `integration/opencode-adapter.mjs`, `.ai/project-profile.json` **do not exist** | Phase 2 check | **VERIFIED** | no |
| E6 | Feature flags = `routing_adapter, litellm_alias_gateway, dspy_structured_bridge, promptwizard_optimizer, opencode_go_gateway` (all false) | `feature_flags.json` (read) | **VERIFIED** | no |
| E7 | `contract.test.mjs` has 9 tests (flags/policy/route/prompt/budget/retry/aliases/non-bypass) | `contract.test.mjs` (read) | **VERIFIED** | no |
| E8 | Gateway `gates:N` is compiled path length, not attestation; gateway writes no gate ledger | Phase 13A §6; consistent now | **VERIFIED** | no |
| E9 | Live governed mission `FW-MV857KHC` EXECUTED (order+manifest) | Phase 13F §2 | **VERIFIED** | no |
| E10 | CLI 1.19.0 calls providers directly, not the gateway | Phase 0.1 §B | **VERIFIED** | no |
| E11 | Desktop GUI not testable here | Phase 0.1 §A | **UNKNOWN/NOT TESTED** | no |
| E12 | Console is business UI; 0 references to `:3199` | Phase 0.1 §C | **VERIFIED** | no |
| E13 | Plaintext `DATABASE_URI` unresolved (Phase 10B HOLD) | Phase 10A/10B | **HISTORICAL (blocker)** | no |
| E14 | 13B contract schema v1 (immutability, statuses, merge) | Phase 13B | **PROPOSED** | no |
| E15 | 13A: API arm out-of-band; no merge engine | Phase 13A | **VERIFIED (then)** | no |

All source report dirs located exactly (Phase 0/0.1/1 and 13A–13F); none missing.

## 3. Resolved Phase 13 vs Phase 1 discrepancies
| Concept | Phase 13 | Phase 1 | **Canonical decision + rationale** |
|---|---|---|---|
| Contract module | `scripts/task-contract.mjs` | `scripts/task-contract.mjs` | **Keep** — same path; the one canonical schema/validator (Framework-owned, project-agnostic) |
| Validator location | `integration/contract-validator.mjs` (new) | validators inside contract | **DROP the separate validator** — fold into `task-contract.mjs`; reuse existing `prompt_contract.mjs`/`context_budget.mjs`/`retry_policy.mjs`. Avoids a duplicate validator |
| Project profile | (absent) | `.ai/project-profile.json` | **Keep** — required to separate generic core from project-specific rules |
| OpenCode adapter | (absent; Go direct implied) | `integration/opencode-adapter.mjs` | **Defer to Stage 1** — only needed when API routing is enabled (Stage 0 does not dispatch API) |
| Gateway/mission edits | (none explicit) | additive edits | **Keep (additive, flag-gated)** — required to wire contract+profile+attestation |
| Flag | `task_contract_v1` | (implied) | **Canonical name `task_contract_v1`, default false** |
| Tests/docs | `contract.test.mjs` + docs | tests | **Keep** — extend `contract.test.mjs`; doc addenda optional |

## 4. Exact proposed Stage 0 file list (repository-relative)
**Mandatory (Stage 0):**
1. `scripts/task-contract.mjs` — **NEW**
2. `.ai/project-profile.json` — **NEW**
3. `scripts/mission.mjs` — **ADDITIVE** (append functions; no edits to existing exports)
4. `scripts/framework-gateway.mjs` — **ADDITIVE** inside `runMission`, guarded by `task_contract_v1`
5. `.ai/control/integration/contract.test.mjs` — **EXTEND** (append tests)
6. `.ai/control/integration/feature_flags.json` — **ADD ONE KEY** `task_contract_v1:false`
**Documentation (optional, non-blocking):**
7. `.ai/control/integration/RESPONSIBILITY_MATRIX.md`, `INTEGRATION_CONTRACT.md` — append addendum

**Deferred (not Stage 0):** `integration/opencode-adapter.mjs` (Stage 1); any console UI page; hybrid parallel engine.

## 5. Per-file responsibilities & minimal change boundaries

| File | Exists | Current responsibility | Proposed additive change | Why necessary | Depends on | Tests | Rollback | Stage |
|---|---|---|---|---|---|---|---|---|
| `scripts/task-contract.mjs` | no | — | Define `contractVersion`, `createTaskContract`, `recordRawTaskRef`, `validateContract`, `validateStepOutput`, `renderExecutionBinding`, `mergeContracts` | Single shared contract for Local/API/Hybrid | `context.mjs`, `gates.mjs` (types only) | unit + A–J | delete file | 0 |
| `.ai/project-profile.json` | no | — | Project-specific: model pins, allowed routes, privacy default, workspace roots | Keep Framework generic | — | schema check in tests | delete file | 0 |
| `scripts/mission.mjs` | yes | intake/package | **Append** `selectProfile(task, profiles)` + `recordRawTask(task)`; keep existing exports unchanged | Track selection + immutable raw-task ref | `TASK_PROFILES.json` | unit (`selectProfile`) | remove appended fns | 0 |
| `scripts/framework-gateway.mjs` | yes | `runMission` local dispatch | **Add** contract create→validate→(LOCAL dispatch)→validateOutput→`gates.attestGate`+`ledgerAppend`; whole block behind `task_contract_v1` | Governance evidence for the live path | `task-contract.mjs`, `mission.mjs`, `gates.mjs` | integration test | revert additive block | 0 |
| `.ai/control/integration/contract.test.mjs` | yes (9 tests) | integration contract tests | **Append** unit + A–J conformance | Prove contract before activation | `task-contract.mjs` | self | remove appended tests | 0 |
| `.ai/control/integration/feature_flags.json` | yes | flags (5) | **Add** `task_contract_v1:false` | Keep inert until approved | — | flag-off test | remove key | 0 |

Boundaries: additive only; **no** edits to `gates.mjs`, `context.mjs`, `context-bridge.mjs`, `enforce.mjs`, `orders.mjs`, `local-tool-bridge.mjs`, or any registry.

## 6. Canonical task-contract outline + field rules
```
contractVersion:"mp.taskcontract/1"  parentTaskId  missionId
rawTask:{ ref, sha256 }               # IMMUTABLE original
objective  scope{in,out}  nonGoals  privacy  approval{...}
steps[]:{ stepId, dependsOn[], capabilities[], permittedTools[], route{allowed[],preferred,localOnly},
          inputs[]{name,schemaRef,sourceRef,freshnessSec,required},
          context{manifestId,checkpointId,budgetTokens,safetyMargin},
          output{schemaRef,artifactRef,hash,provenance},
          acceptance[]{id,check,evidence},
          execution{timeoutSec,maxAttempts<=3,idempotencyKey,escalation},
          compatibility[]{on,from,expect} }
merge:{rule,conflictPolicy,requireAllRequired,finalVerifier}
statuses:{step:[PASS,FAIL,BLOCKED,UNKNOWN,NOT_TESTED],task:[...]}
evidence:{ledgerRef,gateRef}  executionBinding:{providerClass,endpoint,modelId,contextLimitTokens,promptCapTokens,adapter}
```
**Immutable after approval:** version, ids, `rawTask.sha256`, objective/scope/nonGoals, privacy, `dependsOn`, schemaRefs, acceptance, compatibility, merge, `localOnly`.
**Provider-variable:** `executionBinding.*`, provenance, latency/cost, context budget within margin, adapter prompt rendering. Unknown `contractVersion` ⇒ **REJECT** (`UNSUPPORTED_CONTRACT_VERSION`).

## 7. Framework dispatch & gate-evidence sequence
`intake → recordRawTask(ref+sha256) → classifyIntent → selectProfile(TASK_PROFILES) → buildExecutionPackage → createTaskContract → validateContract (PRE-DISPATCH: version, critical fields, deps COMPLETE, privacy↔route, tools allowlist, budget+margin, freshness) → dispatch step [LOCAL: enforce.reserveGpu→Ollama; API: DEFERRED] → context manifest + checkpoint → validateStepOutput (schema+acceptance+artifact hash) → gates.attestGate + ledgerAppend (dispatch/completion/rejection) → mergeContracts/conflictPolicy (no silent merge) → acceptance tests → gates.certify`.
**Explicit:** compiled `gates:N` ≠ runtime attestation; until implementation + tests pass, ledger writes/routing/certification are **not** claimed functional.

## 8. Required tests & acceptance criteria (all PROPOSED until run)
| # | Test | Expected | PASS evidence |
|---|---|---|---|
| T1 | Contract schema validity + version rejection | valid passes; unknown version REJECTED | unit output |
| T2 | Raw-task immutability | `rawTask.sha256` preserved across steps | unit + artifact |
| T3 | Dependency/order validation | incomplete/cyclic deps ⇒ BLOCKED | unit |
| T4 | Profile selection + prompt retrieval | correct profileId + only its role/tools | unit |
| T5 | Scope expansion / unauthorized capability | REJECTED (IMMUTABLE_VIOLATION / TOOL_NOT_PERMITTED) | unit |
| T6 | Pre-dispatch + post-exec validation | missing field/stale/incompatible ⇒ BLOCKED | unit |
| T7 | Dispatch/completion/rejection evidence | rows in GATE_LEDGER | integration |
| T8 | Gate-ledger integrity | `ledgerVerify` ok (hash chain) | integration |
| T9 | Local-only no-fallback | local-down ⇒ BLOCKED, zero remote | integration |
| T10 | Direct Go routing (Stage 1) | CLI/Go adapter; never via LiteLLM | DEFERRED |
| T11 | Artifact schema + hash | hash matches; schema valid | unit/integration |
| T12 | Merge/conflict | conflictPolicy=block ⇒ FAIL, conflicts surfaced | unit |
| T13 | Regression, flags OFF (incl. 9 existing tests) | all pass; `task_contract_v1` false | test run |
| T14 | Rollback verification | delete new files + key ⇒ pre-state hashes | manual/script |
Acceptance = T1–T9, T11–T14 PASS with flags **OFF**; T10 deferred.

## 9. Security constraints, rollback, unresolved blockers
- Flags **all OFF**; `task_contract_v1` false; no route dispatch; no certification claimed.
- Local-only fails closed; no silent cloud; **Go stays direct** (never LiteLLM); no secrets in logs/artifacts; no Desktop change; no new install; no process termination.
- Context: budget via `context.mjs` + **15–20% margin** via `integration/context_budget.mjs`; targeted retrieval + compact capsules + checkpoints.
- **Rollback (preserve-first):** delete `scripts/task-contract.mjs`, `.ai/project-profile.json`; remove the `task_contract_v1` key; remove appended `mission.mjs`/`framework-gateway.mjs` functions and appended tests. **No** destructive Git ops, no clean/stash/reset; existing dirty tree (887) untouched.
- **Unresolved blocker:** plaintext `DATABASE_URI` — separate high-severity remediation, out of scope here.

## 10. Deferred stages & why
- **Stage 1:** `integration/opencode-adapter.mjs` + enable `task_contract_v1` **observability-only** (validate+attest, no route change). *Deferred:* needs Stage 0 tests to pass first.
- **Stage 2:** route LOCAL steps under the contract.
- **Stage 3:** API-arm contract adoption + adapter routing.
- **Stage 4:** console workbench page + hybrid parallel engine. *Deferred:* new code, needs a separate design/approval.
- **Dropped:** separate `integration/contract-validator.mjs` (duplicate) — folded into `task-contract.mjs` + existing guards.

## 11. FINAL APPROVAL REQUEST (permitted change per file)
1. `scripts/task-contract.mjs` — **CREATE** (contract v1 schema + validators + merge).
2. `.ai/project-profile.json` — **CREATE** (project-specific settings).
3. `scripts/mission.mjs` — **APPEND** `selectProfile`, `recordRawTask` (no edits to existing exports).
4. `scripts/framework-gateway.mjs` — **APPEND** contract/profile/validate/attest block in `runMission`, behind `task_contract_v1`.
5. `.ai/control/integration/contract.test.mjs` — **APPEND** unit + A–J tests.
6. `.ai/control/integration/feature_flags.json` — **ADD KEY** `task_contract_v1: false`.
7. *(optional)* `.ai/control/integration/RESPONSIBILITY_MATRIX.md`, `INTEGRATION_CONTRACT.md` — append doc addendum.

No flags are enabled; no routes dispatched; nothing above is authorized by Phase 2.

---
## STATUS
`READY FOR EXPLICIT FILE-LEVEL APPROVAL`
