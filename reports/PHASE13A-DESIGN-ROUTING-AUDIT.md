# Phase 13A — Canonical Task-Design & Routing Audit (READ-ONLY)

- **Phase:** 13A · **Date:** 2026-10-14 · **Role:** Framework Governance Auditor / Architecture Compatibility Engineer
- **Evidence dir:** `E:\MeterPulse_AI\_audit\phase13a-20261014-161208` (pointer `...\_audit\PHASE13A-LATEST.txt`)
- **Mode:** read-only. No files modified, no services started/stopped, no flags changed, no secrets printed.
- Current state: gateway `:3199` UP, Ollama `:11434` UP, LiteLLM `:4001` UP · feature flags `9BD8CBC5…` (all false) · dirty tree 885 (branch `main`).

## 1. Current architecture & verified entry points

| Layer | Entry point | Implementation |
|---|---|---|
| Framework gateway (OpenAI-compatible) | `POST http://127.0.0.1:3199/v1/chat/completions` (model `meter-pulse-framework`) | `scripts/framework-gateway.mjs` (`createServer`, `runMission`, `handleRequest`) |
| Mission intake / package | called inside `runMission` | `scripts/mission.mjs::buildExecutionPackage` |
| Local execution capsule | called inside `runMission` | `scripts/context-bridge.mjs::createLocalExecutionCapsule` |
| Context budget manifest | called inside `runMission` | `scripts/context.mjs::newManifest/addItem/saveManifest` |
| Governed order ticket | `orders.mjs new/run` | `scripts/orders.mjs` |
| Gates / capability ledger | library | `scripts/gates.mjs` (`compilePath`, `issueCapability`, `validateTransition`, `ledgerAppend`, `attestGate`, `certify`) |
| GPU reservation/telemetry | library | `scripts/enforce.mjs` (`reserveGpu`, `recordGpu`, `releaseGpu`) |
| Local model | `http://localhost:11434` | Ollama (`OLLAMA_HOST` in `framework-gateway.mjs`, `orders.mjs`) |
| API route | **out-of-band** `opencode run --model opencode-go/…` | OpenCode CLI (no Framework module) |
| Integration adapters | `.ai/control/integration/**` | contract docs + `route_selector.mjs`, `prompt_contract.mjs`, `reliability/*` (flags OFF) |

Verified: the live gateway is `scripts/framework-gateway.mjs` (sha256 `66DFC5AA…`); its imports are `mission.mjs`, `gates.mjs`, `enforce.mjs`, `context.mjs`, `context-bridge.mjs`.

## 2. File-and-symbol references

| Concern | Reference |
|---|---|
| Package created | `scripts/mission.mjs:119 buildExecutionPackage` (fields: taskId,title,kind,matchedPlanTask,gatePath,skills,mcps,evidenceRequired,certificationRequired) |
| Capsule created | `scripts/context-bridge.mjs:48 createLocalExecutionCapsule` (taskId,missionId,mode,lifecycleMethod,gate,gateHash,dependencies,objective,acceptanceCriteria,expectedResult,selectedResources,evidenceRequirements,hash) |
| Critical-field check | `scripts/context-bridge.mjs:43 CRITICAL_FIELDS`, `:118 verifyCriticalFields` |
| Context budget | `scripts/context.mjs:38 addItem` (BLOCKS on mandatory over-budget), `:74 saveManifest` |
| Order ticket | `scripts/orders.mjs:142` (`new`), `:100 buildPrompt`, `:169-182` arm-validator gate |
| Gate compile | `scripts/gates.mjs:compilePath`; ledger `ledgerAppend`, `attestGate`, `certify`, `validateOrder` |
| GPU evidence | `scripts/enforce.mjs:reserveGpu/recordGpu/releaseGpu` |
| Routing registry | `.ai/registry/CLOUD_LOCAL_ROUTING.json` (task_type_to_route), `.ai/registry/CAPABILITY_ROUTING.json`, `.ai/registry/MODES.json`, `.ai/registry/TASK_PROFILES.json` (`modes.hybrid=[LEADER]`) |
| Integration contracts | `.ai/control/integration/INTEGRATION_CONTRACT.md`, `RESPONSIBILITY_MATRIX.md`, `route_selector.mjs`, `prompt_contract.mjs`, `feature_flags.json` |

## 3. Local vs API vs Hybrid — stage matrix

| Stage | LOCAL | API (OpenCode Go) | HYBRID |
|---|---|---|---|
| Task creation | `buildExecutionPackage` + `createLocalExecutionCapsule` (gateway `runMission`) | **none** — raw CLI prompt | **none** — no Framework engine |
| Input packaging | `mission-prompt` + CHECKPOINT in a context manifest (`context.addItem`); `draftPrompt` | ad-hoc CLI string | n/a |
| Execution | `defaultDispatchArm` → Ollama `/api/generate` under `reserveGpu` | `opencode run` (out-of-band) | n/a |
| Output validation | **none on gateway path** (order+manifest+GPU only) | **none** | **none** |
| Dependency handoff | `capsule.dependencies` field exists but unused by the gateway | none | none |
| Final reconciliation | single response footer `[Framework package … EXECUTED \| order … \| gates: N]` | none | **no merge engine** |

## 4. Duplicated / missing / conflicting contracts

**Duplicated (divergent task representations):**
- Package (`mission.buildExecutionPackage`) vs Capsule (`context-bridge.createLocalExecutionCapsule`) vs Order ticket (`orders.mjs`) vs `draftPrompt` (`framework-gateway.mjs:133`) — four structures for the same task.
- Three prompt builders: `framework-gateway draftPrompt`, `orders.mjs buildPrompt`, `context-bridge capsule` (stringified).

**Missing:**
- **No API-side contract**: no Framework module builds a package/capsule for the Go route (grep for `opencode|cloud|api|litellm` in `scripts/*.mjs` → none).
- **No dependency/merge engine** for hybrid (only `TASK_PROFILES.modes.hybrid=[LEADER]` is documented).
- **No output-schema validation** on the live gateway path (arm-validator exists only on the `orders.mjs run` path).
- **`verifyCriticalFields` is computed but never enforced** — `framework-gateway.mjs` computes `criticalCheck` and does not block on it.

**Conflicting:**
- **Stale model defaults**: `context-bridge.mjs:63` default `selectedResources.llms=['qwen2.5-coder:7b']` and `orders.mjs:22 DEFAULT_MODEL='qwen2.5-coder:14b'` — both are in `CLOUD_LOCAL_ROUTING.model_set.retired`. A step built from these defaults targets a non-existent local model.
- IDs: gateway passes `taskId:'FW-…'` to the package, but `createLocalExecutionCapsule` independently defaults `taskId:'TASK-…'`/`missionId:'M-…'` if omitted (two ID namespaces for one task).

## 5. Three concrete design-incompatibility examples

1. **API steps cannot produce the Framework contract (grounded).** The gateway only dispatches local arms; there is no API dispatcher. An OpenCode Go step receives a raw CLI prompt with no `taskId/gate/acceptanceCriteria`, so its output cannot be validated/merged against the capsule contract. *Consequence:* a hybrid task cannot prove "the same Framework-designed task" reached the API arm.
2. **Stale model defaults (grounded).** `context-bridge.mjs` and `orders.mjs` default to retired `qwen2.5-coder:*` models absent from `CLOUD_LOCAL_ROUTING.model_set`; a contract-driven dispatch using defaults yields a **provider failure masquerading as a contract/route decision**.
3. **Unenforced critical-field gate (grounded).** `framework-gateway.mjs` computes `verifyCriticalFields(compressedCapsule)` but never acts on it; the capsule constructed in `runMission` omits `gate`/`acceptanceCriteria`, which are silently back-filled by defaults — so a semantically incomplete task passes.
4. *(Hypothetical, labelled)* **Hybrid schema drift.** With `TASK_PROFILES.modes.hybrid=[LEADER]` documented but no merge validator, an API step could return a differently-shaped artifact than the local step with **no detection**; the merged result would be unverifiable.

## 6. Gate/ledger evidence reality check

- The gateway response `gates: 19` = **compiled gate-path length** from `gates.compilePath`, i.e., *which* gates apply — **not** proof any gate was attested.
- `framework-gateway.mjs` contains **no ledger write** (grep for `LEDGER` → none). `GATE_LEDGER.jsonl`'s latest rows are dated **2026-09-29** (e.g., `TEST-002`), while gateway requests are **2026-10-14** → **the gateway does not record route/gate attestations in the ledger.**
- Actual evidence for gateway requests: `.ai/orders/*.order.json`, `.ai/context/*.manifest.json`, `GPU_TELEMETRY.jsonl`, `workers/WORK_LEDGER.jsonl` (from `orders.mjs`). Gate attestation (`gates.attestGate`) is available but **not wired into the gateway**.

## 7. Answers A–J (summary)

- **A.** Canonical design is created in `framework-gateway.mjs::runMission` via `mission.buildExecutionPackage` + `context-bridge.createLocalExecutionCapsule` (+ `context` manifest, `orders` ticket).
- **B.** Stable IDs exist but are **split** (FW vs TASK/M namespaces); dependencies/acceptance exist **only** in the capsule (unenforced); no explicit input/output schema or validation rules on the live path.
- **C.** **No** — API does not receive the same contract; only local does.
- **D.** **Yes risk** — three divergent prompt shapes and inconsistent tool rules (gateway arm no-tools; `orders` "do NOT call tools"; `local-tool-bridge` allowlisted tools) can change semantics per route.
- **E.** Partially — capability/`validateResultPack`/arm-validator exist in the gate layer but are **not used by the gateway** path; no cross-step handoff.
- **F.** Only **budget** compatibility before dispatch; **no** post-step validation and **no** pre-merge validation on the live path.
- **G.** **Yes** for local — manifests/checkpoints are explicit artifacts; no reliance on chat history (`orders` "fresh, self-contained").
- **H.** Weak — network errors are classified, but there is **no** explicit provider-failure vs contract-incompatibility discriminator.
- **I.** **Only HTTP + order/manifest/GPU evidence**; the ledger does **not** prove gateway routing/validation.
- **J.** *Implemented:* local package/capsule/manifest/order, GPU reserve/telemetry, order-path arm-validator, gate compile. *Documented only:* hybrid (LEADER), 13-step lifecycle enforcement, cloud/local routing. *Unknown:* whether any external driver attests gates for gateway requests; whether the API arm is expected to consume packages.

## 8. Risk-ranked gap list

| Rank | Gap | Risk |
|---|---|---|
| R1 | No API-side Framework contract (API steps out-of-band) | **Critical** — hybrid/API cannot be governed as one task |
| R2 | No merge/validation engine for hybrid | **Critical** — no proof of compatible handoff |
| R3 | Gateway does not write gate attestations/ledger | **High** — "gates:N" overstates evidence |
| R4 | `verifyCriticalFields` unenforced | **High** — incomplete contracts pass |
| R5 | Stale default models (retired names) | **High** — false provider failures |
| R6 | Divergent prompt shapes / tool rules | **Medium** — semantic drift per route |
| R7 | Split task ID namespaces (FW vs TASK/M) | **Medium** — traceability |
| R8 | No output-schema validation on gateway path | **Medium** — malformed outputs propagate |

## 9. Smallest additive next step (proposal only — NOT implemented)

Add a **read-only task-contract validator** (adapter) that compares the canonical package + capsule + order for a given task id and returns a verdict (`COMPATIBLE` / `MISSING_FIELDS` / `STALE_MODEL` / `NO_API_CONTRACT`), plus a **contract-compat check** that flags when an API arm lacks the capsule. Feature-flagged **OFF**; it changes no routing and uses existing Framework authority.

**Files that would be touched (proposal):**
- `E:\meter\.ai\control\integration\task-contract-validator.mjs` (new, additive)
- `E:\meter\.ai\control\integration\contract.test.mjs` (extend with new assertions)
- `E:\meter\.ai\control\integration\feature_flags.json` (add `task_contract_validator: false`)
- Doc: `RESPONSIBILITY_MATRIX.md` (note API must adopt the capsule contract)
**Rollback:** delete the new file(s); set the new flag back to `false`; no Framework/config/service edits, no model moves.

## 10. Most important finding

**There is no single canonical task contract shared by all arms.** Meter Pulse Framework builds a governed task design (package + capsule + manifest + order) **only for the local arm**; the **API (OpenCode Go) arm is entirely out-of-band** and receives a raw prompt, and there is **no hybrid merge/validation engine**. The gateway's `gates: N` is a *compiled applicability count*, not an attested/ledgered result. Therefore the workbench **does not yet prove that every execution arm receives and returns compatible pieces of the same Framework-designed task** — this is implemented for LOCAL, documented-but-absent for HYBRID, and **missing for API**.

**Insufficient evidence (stated explicitly):** whether any external component attests gates for gateway requests, and whether the API arm is intended to consume the capsule, are **UNKNOWN** and would require reviewing components outside `E:\meter\scripts` and `.ai`.
