# Phase 0 — Meter Pulse / OpenCode Reusability & Runtime Reality Audit (READ-ONLY)

- **Date:** 2026-10-14 · **Mode:** read-only (no files/services/flags/credentials changed)
- **Evidence dir:** `E:\MeterPulse_AI\_audit\phase0-reuse-20261014-172216` (pointer `...\_audit\PHASE0-REUSE-LATEST.txt`)
- Labels: **CURRENT-VERIFIED** (observed live now) · **HISTORICAL** (prior report, not re-proven) · **UNKNOWN**.
- Repo: `E:\meter` @ `main` `15dc743e`, dirty **887** (pre-existing + additive governed artifacts; not touched).

## 1. Executive conclusion
**What is real:** Framework gateway, LiteLLM, Ollama, Postgres and the Meter Pulse app services run and are reachable now; the gateway executes a **real governed local mission** (order + manifest + gates) — verified live this session. **What is incomplete:** there is **no shared cross-route task contract** (13B design unimplemented; 13C HOLD/13D/13E BLOCKED), the gateway does **not** use `TASK_PROFILES` (track selection) and **does not write gate-ledger attestations**, there is **no raw-task immutability record** and **no merge/conflict engine**. **What is unknown:** Desktop GUI behavior (not tested), the global OpenCode config contents (deny-protected), and services on `:9000/:9001`.

## 2. Component inventory (exact paths + verified runtime)

| Component | Location | Runtime (CURRENT-VERIFIED) | Evidence |
|---|---|---|---|
| Framework Gateway | `E:\meter\scripts\framework-gateway.mjs`; launcher `C:\Users\kirll.SFROT\mw\services\framework-gateway.cmd` | **UP** `127.0.0.1:3199` (node) | `GET /v1/models` 200; live mission `FW-MV857KHC` EXECUTED, gates 19 |
| LiteLLM | `E:\MeterPulse_AI\litellm\` (venv, `config.yaml`) | **UP** `127.0.0.1:4001` (python), **loopback** | binds 127.0.0.1; auth enforced (no-key 500 / wrong 400 / correct 200) |
| Ollama | `...\Programs\Ollama`; models `E:\MeterPulse_AI\ollama-models` | **UP** `:11434`, 6 models | `/api/tags`: qwen3-coder:30b, deepseek-r1:32b, qwen2.5vl:32b/7b, gemma4:12b, deepseek-coder-v2:16b |
| Ollama→OpenAI proxy | `C:\Users\kirll.SFROT\ollama-proxy\proxy.js` | not re-verified this phase | HISTORICAL (Phase 1) |
| OpenCode Go (API) | official client | **credential present** (`opencode auth list` → "OpenCode Go") | API task verified in Phases 6/12/13F |
| OpenCode CLI | `C:\Users\kirll.SFROT\mw\node\opencode.ps1` | **1.19.0** | `opencode --version` |
| OpenCode Desktop | `...\AppData\Local\Programs\@opencode-aidesktop\OpenCode.exe` | **installed**; **GUI NOT TESTED** | exe present |
| Meter Pulse app (APIs) | `MeterPulseAdminAPI/PortalAPI` (NSSM) | **Running** `:3131/:3003` | `Get-Service` Running |
| Meter Pulse app (consoles/UI) | `MeterPulse{Admin,Portal}Console` (web) | **Running** `:3535/:3030` | `Get-Service` Running; node listeners |
| MeterVerse tasks | Scheduled tasks `MeterVerse-*` | **Ready** | `Get-ScheduledTask` |
| Postgres | `:5433` | **UP** | 8 established connections |
| Other node listeners | `:9000/:9001` (node) | UP, **owner/purpose UNKNOWN** | `Get-NetTCPConnection` |
| MCP (per-session) | `E:\meter\.opencode\opencode.json` | 17 entries, **12 enabled** | names only (playwright, serena, chrome-devtools, codebase-memory, deepseek-eyes, sequential-thinking, memory, git, filesystem, lighthouse, graphify, context7) |
| Filesystem/process tool | `.ai\control\local-tool-bridge.mjs` | implemented; **allowlist = read_file, list_dir, grep_count only**; no shell; path-traversal blocked | source |
| Task/context/evidence stores | `.ai\context` (49), `.ai\orders` (148), `.ai\workers` (19), `.ai\control` (179 incl. `GATE_LEDGER.jsonl`, `GPU_TELEMETRY.jsonl`, `CHECKPOINT.json`), `.ai\registry` (32, incl. `DATA_CATALOG.json`), `.ai\governance` (30) | present | file counts |
| Global OpenCode config | `C:\Users\kirll.SFROT\.config\opencode\opencode.jsonc` (5180 B) | **deny-protected → NOT READ (UNKNOWN)** | permission rule |
| Skills/toolkit | `C:\Users\kirll.SFROT\.opencode\` | present (HISTORICAL) | Phase 1 |

## 3. Reusability classification

| Class | Items | State | Evidence |
|---|---|---|---|
| **FRAMEWORK_CORE** | `scripts/{framework-gateway,mission,context,context-bridge,gates,enforce,orders}.mjs`; `.ai/control/{AGENT_REGISTRY,local-tool-bridge,gpu-lease,supervisor*}`, `.ai/registry/{MODES,CAPABILITY_ROUTING,CLOUD_LOCAL_ROUTING,TASK_PROFILES,AI_ROSTER,…}`, `.ai/governance/*` | **implemented** (project-agnostic in intent; template-ready) | source read |
| **PROJECT_PROFILE** | `E:\meter\{backend,Frontend,apps,packages,prisma,docker-compose.yml,configs}`, `.opencode/opencode.json` provider/model pins, `DEFAULT_ARM` | **implemented, project-specific** | files |
| **OPENCODE_ADAPTER** | `E:\meter\.opencode\{agents (43),plugins/graphify.js,commands}`, MCP catalog, CLI/Desktop surfaces | **implemented** | dirs |
| **PROVIDER_TRANSPORT** | LiteLLM (`E:\MeterPulse_AI\litellm`), ollama-proxy | LiteLLM **verified**; proxy **HISTORICAL** | live/port |
| **EXECUTION_BRIDGE** | `.ai/control/local-tool-bridge.mjs`, `.ai/control/integration/*` (route_selector, prompt_contract, reliability/*) | bridge implemented; integration adapters **implemented but flags OFF / not wired** | source + flags |
| **UI** | Meter Pulse Admin/Portal consoles (`:3030/:3535`), OpenCode Desktop | web consoles Running; **Desktop UNTESTED** | services/exe |
| **KNOWLEDGE_STORAGE** | `.ai/context` manifests, `.ai/memory`, `.ai/registry/DATA_CATALOG.json`, `GATE_LEDGER.jsonl`, `WORK_LEDGER.jsonl`, `E:\MeterPulse_AI\ollama-models` | implemented | files |
| **LEGACY_OR_DUPLICATE** | `ollama-proxy` (vs LiteLLM); `MeterVerse-*` tasks (vs `MeterPulse*` services); retired models `qwen2.5-coder:*` in defaults | present | source/registries |
| **UNKNOWN** | global `opencode.jsonc`; `:9000/:9001` services; Desktop GUI | — | — |

## 4. Current architecture & dependency map (verified routes only)

```
UI(installed)────────────────────────────────────────────────────────────┐
                                                                          ▼
Meter Pulse app (APIs :3003/:3131, consoles :3030/:3535)  [PROJECT_PROFILE]
        │ Prisma/Postgres :5433
Framework Gateway :3199 ──→ scripts/* (package+capsule+manifest+order)  [FRAMEWORK_CORE]
        │                        │
        │                        └─→ GPU controller (enforce) ─→ Ollama :11434 [PROVIDER]
        └─ (no gate-ledger write; no TASK_PROFILES selection; no API dispatch)
API route (OpenCode Go) — OUT-OF-BAND (official CLI; no Framework contract)
LiteLLM :4001 (loopback) ──→ Ollama :11434   [PROVIDER_TRANSPORT, flag OFF for routing]
MCP/tools via OpenCode adapter (12 enabled)  [OPENCODE_ADAPTER]
```

## 5. Missing links — raw-task → evaluate → select → retrieve-prompt → execute → validate → merge → certify

| Capability | Status | Evidence |
|---|---|---|
| 1. Preserve immutable raw-task reference | **MISSING** | gateway truncates `title` to 120 chars; no raw-task artifact |
| 2. Evaluate Local/API/Hybrid plans vs original + criteria | **MISSING** | no evaluator; gateway picks route by `isReadOnlyMission` only |
| 3. Select a track before prompt retrieval | **MISSING** | `TASK_PROFILES.json` exists but is **not used** by `runMission` |
| 4. Retrieve only track-relevant role/prompt/tools/profile | **PARTIAL** | profiles defined; gateway hardcodes `DEFAULT_ARM`, no profile load |
| 5. Validate selected prompt vs objective | **MISSING** | `prompt_contract.mjs` exists (flag OFF), not enforced |
| 6. Record why a track was selected | **MISSING** | order stores `read/do/model`, not a route rationale |
| 7. Link results to original task/step IDs/provenance/evidence | **PARTIAL** | `taskId`→order+manifest+GPU telemetry; no original-task ref, no step graph |
| 8. Validate artifacts/conflicts before merge | **MISSING** | no merge engine (13A R2) |

## 6. Existing reusable components to preserve
`scripts/{mission,context,context-bridge,gates,enforce,orders}.mjs` (package/capsule/manifest/order/gate/ledger semantics), `local-tool-bridge.mjs` (allowlisted, path-confined tools), `.ai/registry/*` (routing/capability/mode/profile catalogs), `.ai/{context,memory,workers}` stores, `integration/*` contracts (route_selector, prompt_contract, reliability guards) — all additive/reusable; keep flags OFF until approved.

## 7. Duplicates / obsolete defaults / inconsistencies (not changed)
- `ollama-proxy` duplicates LiteLLM's role (port 4000 vs 4001).
- `MeterVerse-*` scheduled tasks duplicate the NSSM `MeterPulse*` services.
- Stale model defaults: `context-bridge.mjs` (`qwen2.5-coder:7b`), `orders.mjs` (`qwen2.5-coder:14b`) — retired per `CLOUD_LOCAL_ROUTING`.
- Two ID namespaces (`FW-…` vs `TASK-…`/`M-…`).
- Four divergent task representations (package/capsule/order/draftPrompt).

## 8. Security / permissions / privacy / context risks
- **BLOCKER:** plaintext `DATABASE_URI` in `E:\meter\.opencode\opencode.json` (Phase 10A); remediation **HOLD** (not rotated).
- Gateway `gates:N` is a compiled count, not attested; `GATE_LEDGER` not written by the gateway (13A R3).
- Context budget: `context.mjs` uses **byte** budget (100 KB default) with block-on-overflow; the 15–20% **safety margin** exists only in `integration/context_budget.mjs` (flag OFF) → PARTIAL.
- Tool bridge is read-only allowlist (good); no shell.
- No local→cloud fallback in guard layer (Phase 7/12); NOT enforced in the gateway dispatch itself.

## 9. Smallest proposed next implementation scope (do NOT implement now)
**One additive module that makes the raw-task → select → prompt flow explicit and governs API+Local identically:**
1. `E:\meter\scripts\task-contract.mjs` — immutable raw-task ref + parent/step IDs + contract v1 (from Phase 13B).
2. `E:\meter\.ai\control\integration\contract-validator.mjs` — pre-dispatch/post-step/pre-merge validation bridge.
3. Wire **`TASK_PROFILES`** selection into `mission.mjs` package build (profile id recorded in the package).
4. Add a gateway **gate-ledger write** (reuse `gates.attestGate`) so routing/validation is evidenced.
5. Flag `task_contract_v1` (**OFF**) + tests.
*Why each:* 1–2 supply the missing contract; 3 supplies track selection; 4 supplies evidence; 5 keeps it inert.

## 10. Test plan & acceptance criteria for that scope
- Unit: contract create/validate (missing field, unsupported version, stale context, bad tool, invalid output) → correct statuses.
- Conformance A–J (13B): Local vs API same contract; schema-incompatible rejected; dependency order immutable; conflicts surfaced.
- Evidence: order + manifest + **new** gate attestation rows + hashes; no chat-history reliance.
- Acceptance: Local and API receive the same immutable contract; every rejection explainable; flags OFF by default; no credential/GPU/Desktop change.

## 11. Current evidence vs historical vs assumptions
- **CURRENT-VERIFIED (this phase):** ports/services/auth/models; gateway governed mission `FW-MV857KHC`; MCP enabled-list; tool allowlist; store counts; dirty 887; flags OFF; contract files **absent**.
- **HISTORICAL:** Phases 1–13F reports (latency figures, credential audit, PromptWizard/DSPy results) — not re-proven here.
- **ASSUMPTIONS/UNKNOWN:** global `opencode.jsonc` contents; `:9000/:9001` owners; Desktop GUI; whether any external component attests gates.

## 12. Rollback & preservation (for the proposed scope)
Additive only: two new files + a flag key + tests. Rollback = delete the new files, remove the flag key, revert test/doc edits. No Framework/config/service/model/credential changes. Preserve the dirty tree, orphan `llama-server`, and Desktop config.

---
**Single most important finding:** the Framework has a governed **Local** task pipeline (package/capsule/manifest/order/gates) but **no raw-task immutability, no track/prompt selection wiring, no shared API contract, and no merge engine**; the API arm remains out-of-band. The workbench is **not** a reusable cross-route workbench yet — it is a verified Local pipeline plus independently-verified API access, with the credential blocker unresolved.

**GO / NO-GO on the proposed scope:** **GO (review only)** — the §9 scope is small, additive, reuses existing Framework authority, and is safe to *review*; **NO-GO to implement or activate** until the specific files are explicitly approved (13C gate) and the credential blocker is separately addressed.
