# Phase 13B — Canonical Task Contract Proposal (DESIGN ONLY — NOT IMPLEMENTED)

- **Phase:** 13B · **Date:** 2026-10-14 · **Role:** Framework Architect / Independent Contract Reviewer
- **Evidence dir:** `E:\MeterPulse_AI\_audit\phase13b-20261014-161401` (pointer `...\_audit\PHASE13B-LATEST.txt`)
- **Mode:** design only. No files modified, no flags changed, no tools installed, no external calls, no secrets.

## 0. Prerequisite verification (Phase 13A)
- `phase13a-20261014-161208\PHASE13A-DESIGN-ROUTING-AUDIT.md` exists.
- All cited implementation files exist; re-hashed against 13A → **MATCH** (no drift): `framework-gateway.mjs`, `mission.mjs`, `context-bridge.mjs`, `context.mjs`, `orders.mjs`, `gates.mjs`, `enforce.mjs`.
- Registries present (`CLOUD_LOCAL_ROUTING.json`, `CAPABILITY_ROUTING.json`, `MODES.json`, `TASK_PROFILES.json`); integration flags **OFF**.
- **No discrepancy found.** Proceeding.

---

## 1. Existing structures to reuse (no second registry, no parallel router)

| Existing structure | Reused for |
|---|---|
| `context-bridge.mjs::createLocalExecutionCapsule` | base task/step capsule (extend with v1 fields) |
| `context-bridge.mjs::CRITICAL_FIELDS / verifyCriticalFields / detectStaleContext` | field + staleness validation |
| `mission.mjs::buildExecutionPackage / classifyIntent / routeSkillsMcps` | package + capability/skill routing |
| `context.mjs::newManifest / addItem / saveManifest` | context manifest + budget (Block-on-overflow) |
| `orders.mjs` ticket (`read/do/output/grep/model`) + arm-validator | local execution ticket + output gate |
| `gates.mjs::validateOrder / attestGate / ledgerAppend / certify` | gate attestation + hash ledger |
| `enforce.mjs::reserveGpu/recordGpu + validateResultPack` | GPU evidence + result validation |
| `.ai/registry/MODES.json`, `CLOUD_LOCAL_ROUTING.json`, `CAPABILITY_ROUTING.json`, `TASK_PROFILES.json` | provider classes, capability→model, route rules |
| `.ai/control/integration/*` (`route_selector.mjs`, `prompt_contract.mjs`, `reliability/*`) | adapter/validation layer (flags OFF) |

**Design stance:** add a **versioned contract layer that wraps/extends the existing capsule**; persist it in the **existing** `.ai/context/` + `.ai/orders/` artifacts. No new registry, no new router.

---

## 2. Proposed schema (v1) and illustrative synthetic example

`schemaVersion: "mp.taskcontract/1"` (immutable; rejects unknown versions).

```
TaskContract v1 (extends the existing capsule)
  contractVersion      : "mp.taskcontract/1"
  parentTaskId         : "FW-…"            # existing gateway id
  missionId            : "M-…"             # existing capsule id
  objective            : string
  scope                : { in: [], out: [] }
  nonGoals             : []
  privacy              : "local-only" | "cloud-ok"
  approval             : { approvedBy, approvedAt, immutableAfter: true }
  steps[]:
    stepId             : "FW-…-S1"
    dependsOn          : ["FW-…-S0"]
    capabilities       : [ …CAPABILITY_ROUTING keys… ]
    permittedTools     : [ allowlisted tool names ]
    route              : { allowed:["LOCAL","API"], preferred, localOnly:bool }
    inputs[]           : { name, schemaRef, sourceRef, freshnessSec, required }
    context            : { manifestId, checkpointId, budgetTokens, safetyMargin }
    output             : { schemaRef, artifactRef, hash, provenance }
    acceptance[]       : { id, check, evidence }
    execution          : { timeoutSec, maxAttempts, idempotencyKey, escalation }
    compatibility[]    : { on:"input"|"output", from, expect }
  merge                : { rule, conflictPolicy:"surface|block|prefer", requireAllRequired, finalVerifier }
  statuses             : { step:["PASS","FAIL","BLOCKED","UNKNOWN","NOT_TESTED"], task:[…] }
  evidence             : { ledgerRef, gateRef }
  executionBinding     : { providerClass, endpoint, modelId, contextLimitTokens, promptCapTokens, adapter }
```

### Synthetic example (non-sensitive)
```json
{
  "contractVersion": "mp.taskcontract/1",
  "parentTaskId": "FW-DEMO123",
  "missionId": "M-DEMO123",
  "objective": "Produce a 3-bullet factual summary of a synthetic test document.",
  "scope": { "in": ["summarize provided file"], "out": ["no code changes"] },
  "nonGoals": ["implementation", "deployment"],
  "privacy": "local-only",
  "approval": { "approvedBy": "owner", "approvedAt": "2026-10-14T00:00:00Z", "immutableAfter": true },
  "steps": [
    {
      "stepId": "FW-DEMO123-S1",
      "dependsOn": [],
      "capabilities": ["text-generation"],
      "permittedTools": ["read_file"],
      "route": { "allowed": ["LOCAL"], "preferred": "LOCAL", "localOnly": true },
      "inputs": [{ "name": "doc", "schemaRef": "text/plain", "sourceRef": ".ai/context/fixture.txt", "freshnessSec": 3600, "required": true }],
      "context": { "manifestId": "FW-DEMO123", "checkpointId": null, "budgetTokens": 8192, "safetyMargin": 0.15 },
      "output": { "schemaRef": "schema:bullets3", "artifactRef": ".ai/missions/FW-DEMO123/s1.md", "hash": null, "provenance": "ollama/qwen2.5vl:7b" },
      "acceptance": [{ "id": "A1", "check": "exactly 3 bullet lines", "evidence": "output artifact hash + line count" }],
      "execution": { "timeoutSec": 120, "maxAttempts": 3, "idempotencyKey": "FW-DEMO123-S1", "escalation": "BLOCKED" },
      "compatibility": []
    }
  ],
  "merge": { "rule": "single-step", "conflictPolicy": "block", "requireAllRequired": true, "finalVerifier": "framework" },
  "statuses": { "step": ["PASS","FAIL","BLOCKED","UNKNOWN","NOT_TESTED"], "task": ["PASS","FAIL","BLOCKED","PARTIAL","UNKNOWN","NOT_TESTED"] },
  "evidence": { "ledgerRef": ".ai/control/GATE_LEDGER.jsonl", "gateRef": "GATE_MANIFEST:v1" },
  "executionBinding": { "providerClass": "local", "endpoint": "http://localhost:11434", "modelId": "qwen2.5vl:7b", "contextLimitTokens": 8192, "promptCapTokens": 12288, "adapter": "capsule->local-prompt/v1" }
}
```

---

## 3. Immutable vs provider-variable fields

**Immutable after Framework approval** (`approval.immutableAfter: true`): `contractVersion`, `parentTaskId`, `missionId`, `objective`, `scope`, `nonGoals`, `privacy`, `steps[].stepId`, `steps[].dependsOn`, `steps[].capabilities`, `steps[].inputs[].schemaRef`, `steps[].output.schemaRef`, `steps[].acceptance[]`, `steps[].compatibility[]`, `steps[].route.localOnly`, `steps[].execution.idempotencyKey`, `merge{}`.

**May vary by provider without changing semantics:** `executionBinding.{providerClass,endpoint,modelId,contextLimitTokens,promptCapTokens,adapter}`; `steps[].output.provenance`; observed `latency/cost`; `steps[].context.budgetTokens` within the declared `safetyMargin`; prompt rendering produced by the adapter.

**Rule:** any change to an immutable field requires **re-approval** (new `approval` block + version bump if the schema changes); provider variability must never mutate immutable fields.

---

## 4. Validation & compatibility rules

**Before dispatch (Framework):** (1) `contractVersion` ∈ supported set; (2) schema validate + `verifyCriticalFields`; (3) every `dependsOn` step is `PASS`/`SUCCEEDED`; (4) `privacy`/`localOnly` consistent with `route.allowed`; (5) `permittedTools` ⊆ allowlist (reuse `local-tool-bridge` allowlist); (6) `context.budgetTokens` fits the binding limit with margin; (7) inputs exist and are fresh (`freshnessSec`).

**After every step:** (1) output conforms to `output.schemaRef`; (2) required acceptance checks executed; (3) artifact hash recorded; (4) status ∈ {PASS,FAIL,BLOCKED,UNKNOWN,NOT_TESTED}; (5) idempotency key reconciled (no duplicate side effects).

**Before merge:** (1) all `requireAllRequired` steps `PASS`; (2) `compatibility[]` declarations satisfied upstream→downstream; (3) `conflictPolicy` applied; (4) **integration/group test run even if each step passed** (see §5 rule 14).

**Local vs API equivalence:** both arms receive the **same contract object**; only `executionBinding` differs. The API adapter renders the contract to the provider's prompt (`adapter: capsule->api-prompt/v1`) within `promptCapTokens`; if required fields cannot fit → **BLOCKED_OVERFLOW** (never silent truncation — reuse `context.addItem` block semantics).

**Output adapters:** must map provider representation → the declared `output.schemaRef`; `additionalProperties:false` forbids invented fields; missing required fields → `FAIL_INVALID_OUTPUT`; unknown extras → recorded, not shipped. No invention, no silent drop.

---

## 5. Failure behavior and test matrix

| Condition | Status | Behavior |
|---|---|---|
| Missing contract field | **BLOCKED** `MISSING_CONTRACT_FIELD` | no dispatch |
| Schema mismatch (upstream→downstream) | **BLOCKED** `INCOMPATIBLE_SCHEMA` | stop dependent step |
| Stale/missing context manifest | **BLOCKED** `STALE_CONTEXT` (or refresh via bounded retrieval) | no dispatch until fresh |
| Unsupported tool | **BLOCKED** `TOOL_NOT_PERMITTED` | no dispatch |
| Invalid output | **FAIL** `INVALID_OUTPUT` | retry ≤3 → escalate |
| Unavailable required dependency | **BLOCKED** `DEPENDENCY_NOT_COMPLETE` | defer optional deps only |
| Provider failure | **FAIL** `PROVIDER_ERROR` (distinct from schema) | retry ≤3 → escalate |
| localOnly + local unavailable | **BLOCKED** `NO_FALLBACK` | never call cloud |
| Unknown schema version | **REJECTED** `UNSUPPORTED_CONTRACT_VERSION` | refuse |
| Component passes alone, group integration fails | **FAIL** `INTEGRATION_CONTRACT_FAILED` | overrides step PASS |

### Test-matrix design (A–J)
| ID | Scenario | Expected |
|---|---|---|
| A | Same task dispatched locally and via API | identical immutable fields; only `executionBinding` differs; both outputs validate to `output.schemaRef` |
| B | Equivalent logical input, different transport representation | adapters normalize to same canonical form; hashes of canonical output comparable |
| C | Upstream output incompatible with downstream schema | `BLOCKED INCOMPATIBLE_SCHEMA`; dependent step not run |
| D | Stale/missing context manifest | `BLOCKED STALE_CONTEXT` (or bounded refresh), never silent proceed |
| E | Provider attempts to change acceptance criteria | rejected; acceptance immutable → `BLOCKED IMMUTABLE_VIOLATION` |
| F | Hybrid merge with contradictory facts | `conflictPolicy:block` → `FAIL`; conflicts surfaced in artifact |
| G | Local-only when local provider unavailable | `BLOCKED NO_FALLBACK`; no API/cloud attempt |
| H | Unknown schema version | `REJECTED UNSUPPORTED_CONTRACT_VERSION` |
| I | Provider proposes different execution order | ignored; Framework order authoritative (immutable `dependsOn`) |
| J | Component passes alone, fails environment/group integration | `FAIL INTEGRATION_CONTRACT_FAILED` overrides step PASS |

Rule 14 (explicit): **a successful isolated test does not override a failed integration/environment contract.**

---

## 6. Exact proposed file changes and migration strategy

**Additive (proposal, not applied):**
| File | Change | Nature |
|---|---|---|
| `E:\meter\scripts\task-contract.mjs` | NEW — `createTaskContract`, `validateContract`, `renderExecutionBinding`, `validateOutput`, `mergeContracts` | additive module (no new registry) |
| `E:\meter\.ai\control\integration\contract-validator.mjs` | NEW — Framework↔integration bridge (pre-dispatch/post-step/pre-merge checks) | additive |
| `E:\meter\.ai\control\integration\feature_flags.json` | add `"task_contract_v1": false` | additive key |
| `E:\meter\.ai\control\integration\contract.test.mjs` | add conformance tests A–J | extend existing |
| `.ai/control/integration/RESPONSIBILITY_MATRIX.md` + `INTEGRATION_CONTRACT.md` | addendum: API must adopt the same capsule | doc |

**No changes** to `framework-gateway.mjs`, `mission.mjs`, `orders.mjs`, `gates.mjs`, registries, or flags until a later, separately approved phase.

**Migration (backward-compatible):**
1. `contractVersion` **absent ⇒ legacy capsule path unchanged** (no behavior change).
2. v1 contract is **optional**; arms read the contract if present, else fall back to the capsule.
3. Single source of truth: the contract is stored once (under `.ai/context/<taskId>.contract.json`); `executionBinding` is per-arm and derived, never a second task record.
4. Reject unknown `contractVersion` (§5).

---

## 7. Risks, open questions, and rollback

**Risks:** (a) API arm must adopt the contract or hybrid stays unprovable (R1 from 13A); (b) contract adds a validation surface not yet wired to the live gateway; (c) risk of drifting into a "second registry" if not stored as a single artifact; (d) provider prompt caps may force `BLOCKED_OVERFLOW` for large steps.

**Open questions:** who signs `approval`; whether `runtime` group/integration tests exist to satisfy rule 14; whether the API arm is permitted to read `.ai/context` at all; retention policy for contract artifacts.

**Rollback:** delete `scripts/task-contract.mjs` + `integration/contract-validator.mjs`; remove the `task_contract_v1` flag key; revert test/doc additions. No Framework/config/service/model changes → nothing else to restore.

---

## 8. Implementation approval checklist
- [ ] Approve schema `mp.taskcontract/1` (fields, immutability set, statuses).
- [ ] Approve the two new additive files and the exact paths above.
- [ ] Approve adding flag `task_contract_v1:false` (stays OFF until a later phase).
- [ ] Approve the A–J conformance tests (incl. rule 14 and version rejection).
- [ ] Approve the backward-compatible migration (absent ⇒ legacy path).
- [ ] Confirm the API arm will consume the same contract (closes 13A R1) — or accept it remains out of scope.
- [ ] Confirm no routing flags are enabled in this phase.

**Status:** DESIGN ONLY. Nothing implemented; no flags changed; awaiting explicit approval of these specific files and plan.
