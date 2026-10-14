# STAGE-0 REVIEW PACKET (PROPOSED — NOT APPROVED, NOT IMPLEMENTED)

Source: `reports/PHASE2-EVIDENCE-RECONCILIATION-AND-APPROVAL-PACKAGE.md` §4–§11.
Production/routing flags remain **OFF**. Intended initial state of the new flag: **`task_contract_v1: false`**.

## Proposed six-file Stage 0 scope

| # | Repository-relative path | Exists | Proposed change (additive) | Responsibility | Depends on | Required tests | Rollback |
|---|---|---|---|---|---|---|---|
| 1 | `scripts/task-contract.mjs` | **no** | **CREATE** | Contract v1: `createTaskContract`, `recordRawTaskRef`, `validateContract`, `validateStepOutput`, `renderExecutionBinding`, `mergeContracts` | `context.mjs`, `gates.mjs` | unit + A–J | delete file |
| 2 | `.ai/project-profile.json` | **no** | **CREATE** | Project-specific settings (model pins, allowed routes, privacy default, workspace roots) so Framework core stays generic | — | schema check | delete file |
| 3 | `scripts/mission.mjs` | yes | **APPEND** `selectProfile`, `recordRawTask` (no edits to existing exports) | Track selection + immutable raw-task ref | `TASK_PROFILES.json` | unit | remove appended fns |
| 4 | `scripts/framework-gateway.mjs` | yes | **APPEND** contract/profile/validate/attest block inside `runMission`, behind `task_contract_v1` | Governance evidence on the live path | 1,3,`gates.mjs` | integration | revert appended block |
| 5 | `.ai/control/integration/contract.test.mjs` | yes (9 tests) | **APPEND** unit + A–J conformance | Prove contract before activation | 1 | self | remove appended tests |
| 6 | `.ai/control/integration/feature_flags.json` | yes | **ADD KEY** `task_contract_v1: false` | Keep inert until approved | — | flag-off test | remove key |
| (opt) | `.ai/control/integration/RESPONSIBILITY_MATRIX.md`, `INTEGRATION_CONTRACT.md` | yes | **APPEND** doc addendum | Documentation | — | — | revert |

## Change boundaries
Additive only. **No** edits to `gates.mjs`, `context.mjs`, `context-bridge.mjs`, `enforce.mjs`, `orders.mjs`, `local-tool-bridge.mjs`, or any registry. No second registry, no second router, no duplicate validator.

## Contract outline (canonical, v1)
`contractVersion:"mp.taskcontract/1"` · `parentTaskId` · `missionId` · `rawTask{ref,sha256}` · `objective/scope/nonGoals/privacy/approval` · `steps[]{stepId,dependsOn,capabilities,permittedTools,route,inputs,context,output,acceptance,execution,compatibility}` · `merge` · `statuses` · `evidence` · `executionBinding`.
**Immutable after approval:** version, IDs, `rawTask.sha256`, objective/scope/nonGoals, privacy, `dependsOn`, schemaRefs, acceptance, compatibility, merge, `localOnly`.
**Provider-variable:** `executionBinding.*`, provenance, latency/cost, budget within margin, adapter prompt rendering. Unknown version ⇒ **REJECT**.

## Dispatch & gate-evidence sequence
intake → `recordRawTask` (ref+sha256) → classify → **selectProfile (TASK_PROFILES)** → package → **contract** → validate (pre-dispatch) → dispatch step (LOCAL now; API deferred) → manifest + checkpoint → validate step output → **`gates.attestGate` + `ledgerAppend`** → merge/conflict → acceptance → **`gates.certify`**.
*Compiled `gates:N` ≠ attestation.*

## Test plan (all PROPOSED)
T1 version/schema · T2 raw-task immutability · T3 dependency/order · T4 profile+prompt retrieval · T5 scope/unauthorized rejection · T6 pre/post validation · T7 dispatch/completion/rejection evidence · T8 ledger integrity · T9 local-only no-fallback · T10 direct Go (DEFERRED) · T11 artifact schema/hash · T12 merge/conflict · T13 regression flags OFF · T14 rollback.
**Acceptance:** T1–T9, T11–T14 PASS with flags OFF; T10 deferred.

## Explicitly deferred
`integration/opencode-adapter.mjs` (Stage 1) · route activation (Stage 2) · API adoption (Stage 3) · console UI page + hybrid parallel engine (Stage 4). **Dropped:** duplicate `contract-validator.mjs`.

## Rollback (preserve-first)
Delete files 1–2; remove the `task_contract_v1` key; remove appended functions/tests. **No** reset/stash/clean; dirty tree untouched. No config/service/model/credential changes to restore.
