# Phase 1 — Minimal Framework-First Execution Design (DESIGN ONLY — NOT IMPLEMENTED)

- **Date:** 2026-10-14 · **Mode:** design only (no files created/edited, no flags, no Desktop, no installs, no processes touched)
- **Evidence dir:** `E:\MeterPulse_AI\_audit\phase1-design-20261014-174730` (pointer `...\_audit\PHASE1-DESIGN-LATEST.txt`)
- Labels: **VERIFIED** (observed live/files now) · **HISTORICAL** (prior reports) · **PROPOSED** · **UNKNOWN**.

## Verified facts used by this design (current)
- Gateway `:3199` UP, LiteLLM `:4001` UP, Ollama `:11434` UP. Feature flags **all OFF** (`9BD8CBC5…`).
- `framework-gateway.mjs` imports **only** `mission.mjs`, `gates.mjs`, `enforce.mjs`, `context.mjs`, `context-bridge.mjs` — **no `TASK_PROFILES`, no `attestGate`**.
- `TASK_PROFILES.json` is referenced only by `.ai/control/forge.mjs` and `random-audit-canary.ps1` — **not wired into gateway dispatch**.
- `gates.attestGate` / `ledgerAppend` exist and are used by `scripts/automate.mjs` — **not** by the gateway.
- No `.ai/project-profile.json`. No `scripts/task-contract.mjs`. CLI 1.19.0 calls providers directly (not the gateway). Desktop GUI **UNKNOWN/NOT TESTED**.

---

## 1. Recommended minimal architecture

Keep **Framework Gateway `:3199`** as the sole control plane. Add **one contract module**, **one project profile**, **one OpenCode adapter**, and **wire three existing-but-unused pieces** into `runMission`. Nothing new orchestrates; nothing duplicates routing.

```
UI/operator (OpenCode CLI now; optional console page later)
        │  submit RAW TASK  (HTTP/CLI)
        ▼
Framework Gateway :3199  ── runMission ─────────────────────────────────────────────┐
  1 recordRawTask()            → immutable raw-task reference (id + sha256)          │
  2 selectProfile()            → TASK_PROFILES nature → mode/role/mcps/skills/gates  │  [NEW wiring]
  3 buildExecutionPackage()    → existing package                                     │
  4 createTaskContract()       → contract v1 (steps/schemas/acceptance/merge)         │  [NEW module]
  5 validateContract(pre-dispatch) → fail-closed checks                               │  [NEW]
  6 dispatch per step          → LOCAL: enforce.reserveGpu → Ollama                    │
     │                           API: opencode-adapter (direct Go; never via LiteLLM) │  [NEW adapter]
  7 validateStepOutput(post)   → schema + acceptance + artifact hash                  │  [NEW]
  8 mergeContracts()/conflict  → no silent merge                                      │  [NEW]
  9 gates.attestGate + ledgerAppend → recorded routing/validation evidence            │  [NEW wiring]
 10 certify (gates.certify)    → only if all required steps PASS                     │
        │
  LiteLLM :4001  = transport only (local aliases, loopback)      Ollama :11434 = inference
  .ai/control/local-tool-bridge.mjs = allowlisted FS tools       .ai/context = manifests/checkpoints
```

Single responsibility split: **planning/contract = task-contract.mjs** · **provider transport = LiteLLM** · **model inference = Ollama** · **filesystem/tools = local-tool-bridge** · **execution routing/authority = Framework gateway** · **OpenCode = adapter/invocation boundary only**.

## 2. Data-flow (ordered)
`RAW TASK → recordRawTask(immutable ref+hash) → classifyIntent → selectProfile(TASK_PROFILES) → buildExecutionPackage → createTaskContract(steps/deps/schemas/acceptance) → validateContract(pre-dispatch) → dispatch step (LOCAL | API via adapter) → context manifest + checkpoint → validateStepOutput → attestGate+ledgerAppend → (all required PASS?) → mergeContracts/conflictPolicy → acceptance tests → certify → evidence/artifacts indexed`.
Loop guards: per-step `maxAttempts≤3` on a hypothesis fingerprint; fail-closed (`BLOCKED`) on missing field/schema/stale-context/bad-tool/unsupported-version/local-only-unavailable.

## 3. Exact candidate files and responsibilities (PROPOSED)

| File | New/Extend | Responsibility |
|---|---|---|
| `E:\meter\scripts\task-contract.mjs` | **NEW** | `createTaskContract`, `validateContract`, `validateStepOutput`, `renderExecutionBinding`, `mergeContracts` (contract v1) |
| `E:\meter\.ai\project-profile.json` | **NEW** | Project-specific profile (model pins, allowed routes, privacy defaults, paths) so Framework core stays generic |
| `E:\meter\.ai\control\integration\opencode-adapter.mjs` | **NEW** | OpenCode CLI/Go invocation boundary; maps a step → CLI call; returns artifact+provenance; **no workflow control** |
| `E:\meter\scripts\mission.mjs` | EXTEND (additive fns only) | `selectProfile(task, TASK_PROFILES)`, `recordRawTask(task)`; keep existing exports intact |
| `E:\meter\scripts\framework-gateway.mjs` | EXTEND (additive in `runMission`) | call 1–10 above; write attestation; **guard behind `task_contract_v1` flag** |
| `E:\meter\.ai\control\integration\contract.test.mjs` | EXTEND | contract unit + A–J conformance tests |
| `E:\meter\.ai\control\integration\feature_flags.json` | EXTEND | add `task_contract_v1: false` |

Reused unchanged: `context.mjs`, `context-bridge.mjs`, `gates.mjs`, `enforce.mjs`, `orders.mjs`, `local-tool-bridge.mjs`, the integration `route_selector.mjs`/`prompt_contract.mjs`/`reliability/*`.

## 4. Smallest shared task-contract schema (v1)
```
contractVersion:"mp.taskcontract/1"   parentTaskId  missionId
rawTask:{ ref, sha256 }                # immutable original
objective  scope{in,out}  nonGoals  privacy:"local-only"|"cloud-ok"
approval:{approvedBy,approvedAt,immutableAfter:true}
steps[]:
   stepId  dependsOn[]
   capabilities[]  permittedTools[]
   route:{allowed[],preferred,localOnly}
   inputs[]:{name,schemaRef,sourceRef,freshnessSec,required}
   context:{manifestId,checkpointId,budgetTokens,safetyMargin}
   output:{schemaRef,artifactRef,hash,provenance}
   acceptance[]:{id,check,evidence}
   execution:{timeoutSec<=..., maxAttempts<=3, idempotencyKey, escalation:"BLOCKED"}
   compatibility[]:{on,from,expect}
merge:{rule,conflictPolicy:"surface|block|prefer",requireAllRequired,finalVerifier}
statuses:{step:[PASS,FAIL,BLOCKED,UNKNOWN,NOT_TESTED], task:[...]}
evidence:{ledgerRef,gateRef}     executionBinding:{providerClass,endpoint,modelId,contextLimitTokens,promptCapTokens,adapter}
```
**Immutable after approval:** version, ids, rawTask.sha256, objective/scope/nonGoals, privacy, `dependsOn`, schemas, acceptance, compatibility, merge, `localOnly`.
**Provider-variable:** `executionBinding.*`, provenance, latency/cost, budget within margin, adapter prompt rendering.

## 5. `TASK_PROFILES` selection + track-specific prompt retrieval (PROPOSED)
1. `selectProfile(rawTask)`: tokenize (`mission.tokens`) + `classifyIntent`, then match `.ai/registry/TASK_PROFILES.json.profiles[*]` by keyword/nature (CODE_IMPL, BUGFIX, SECURITY_AUDIT, PLANNING, UI_DESIGN, …); record `profileId` + rationale in the contract (this satisfies "record why a track was selected").
2. From the chosen profile read **only** its `{mode, model_role, mcps, skills, tools, agents, gates, steps}` → build the step's `capabilities`, `permittedTools`, `role`, and gate subset.
3. **Retrieve the track prompt after selection**: role/prompt text resolved from the profile's `agents`/`skills` and the existing OpenCode agents (`E:\meter\.opencode\agents`) — never load the whole catalog; only the profile's set (context control).
4. Validate the selected prompt against `objective`+`acceptance` (`integration/prompt_contract.mjs`) **before** dispatch; reject on mismatch.

## 6. Framework gate attestations & evidence (PROPOSED)
- At dispatch and at step completion/rejection call **`gates.attestGate({gate, decision, taskId, executionId})`** and **`gates.ledgerAppend(...)`** → rows land in `.ai/control/GATE_LEDGER.jsonl` (hash-chained), so routing decisions and validation are evidenced (fixes 13A R3).
- Per-step artifacts written under `.ai/missions/<taskId>/` with sha256; context manifests under `.ai/context/<taskId>.manifest.json`; GPU usage via `enforce.recordGpu`.
- Rejections carry a sanitized reason + status (`MISSING_CONTRACT_FIELD`, `INCOMPATIBLE_SCHEMA`, `STALE_CONTEXT`, `TOOL_NOT_PERMITTED`, `UNSUPPORTED_CONTRACT_VERSION`, `NO_FALLBACK`).

## 7. Tests required before any activation (PROPOSED)
- **Unit:** `createTaskContract`/`validateContract`/`validateStepOutput`/`mergeContracts` (missing field, unsupported version, stale context, bad tool, invalid output, conflict→block).
- **Conformance A–J** (13B): Local vs API same contract; schema-incompatible rejected; dependency order immutable; provider cannot change acceptance; conflicts surfaced; local-only fails closed.
- **Gateway integration (synthetic):** dispatch one LOCAL step under `task_contract_v1`; assert order+manifest+**new GATE_LEDGER rows**+artifact hash; repeat with an API step via the adapter.
- **No-fallback:** local-only + local-down ⇒ `BLOCKED`, zero remote calls.
- **Regression:** existing `contract.test.mjs` (Phase 5) still passes; `node --check` on changed files.
- Acceptance = all of the above PASS with flags **OFF**; then a separate approval to enable.

## 8. Security & rollback
- Flags stay **OFF** (`task_contract_v1` new, default false); no route change until separately approved.
- No secrets in contract/logs; `DATABASE_URI` blocker untouched; Go stays **direct** (never via LiteLLM); no Desktop change; no new dependency.
- Context: budget from `context.mjs` + 15–20% margin via `integration/context_budget.mjs`; reject if unverifiable model limit.
- **Rollback:** delete the 3 new files, remove the one flag key, revert the additive gateway/mission edits (kept behind the flag), revert test/doc edits. No config/service/model/credential changes to restore.

## 9. Explicitly OUT OF SCOPE
- Enabling any feature flag or production route; changing provider permissions.
- Building a new UI/framework (a console page may come later separately).
- Rotating/purging the credential or Git history; killing the orphan `llama-server`.
- Re-introducing PromptWizard; promoting DSPy to production.
- Routing Go through LiteLLM; modifying OpenCode Desktop; new orchestrator/router.
- Modifying the dirty tree destructively.

## 10. Bounded implementation proposal (reviewable file-by-file)
**Stage 0 (this proposal, to approve):**
1. `scripts/task-contract.mjs` (new) — contract v1 + validators + merge.
2. `.ai/project-profile.json` (new) — project-specific settings.
3. `scripts/mission.mjs` — add `selectProfile` + `recordRawTask` (additive).
4. `.ai/control/integration/opencode-adapter.mjs` (new) — CLI/Go invocation boundary.
5. `scripts/framework-gateway.mjs` — wire 1–10 behind `task_contract_v1` (OFF).
6. `.ai/control/integration/contract.test.mjs` — unit + A–J tests.
7. `.ai/control/integration/feature_flags.json` — add `task_contract_v1:false`.
**Stage 1 (separate approval):** enable `task_contract_v1` for observability only (validate+attest, no route change).
**Stage 2+ (separate approvals):** route steps under the contract; API adoption; console page.

**Evidence status:** items 1–4 are file reads/current checks (VERIFIED); the flow and 13B schema are PROPOSED; Desktop GUI and the global OpenCode config remain UNKNOWN.
