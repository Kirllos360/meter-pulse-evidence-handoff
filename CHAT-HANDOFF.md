# CHAT-HANDOFF — Meter Pulse Framework-First Workbench (self-contained)

> For independent review. References are package-relative. Evidence in `reports/` and `sources/`. **This is a proposal, not implementation approval.**

---

## PART 1 — Executive state, architecture, governance, phase history
**Goal:** decide whether the proposed **Stage 0** (a shared, versioned task contract + wiring) is the correct smallest step toward a Framework-first, project-agnostic AI workbench.

**Governance (binding):** Meter Pulse **Framework is the sole control plane**. Ollama = local inference. **LiteLLM = provider transport only** (loopback, key-auth). **Official OpenCode Go is used directly — never through LiteLLM.** OpenCode CLI/Desktop are execution surfaces, not orchestrators. No second orchestrator/router/registry.

**Current state (CURRENTLY_CHECKED, 2026-10-14):** gateway `127.0.0.1:3199` UP; LiteLLM `:4001` UP (loopback); Ollama `:11434` UP (6 models); Postgres `:5433` UP. Feature flags **all OFF** (`…feature_flags.json`, sha `9BD8CBC5…`). Git `main` `15dc743e`, dirty **887** (untouched). OpenCode CLI **1.19.0**. Desktop GUI **NOT TESTED**.

**What is real:** a governed **Local** pipeline executes (package → capsule → context manifest → order → gate compile → GPU-reserved Ollama arm), verified by a live mission (`FW-MV857KHC`, EXECUTED, gates 19). **What is incomplete:** no **shared cross-route task contract** (API arm is out-of-band), no **`TASK_PROFILES` wiring** in the gateway, no **gate-ledger attestation** from the gateway, no **merge/conflict engine**, no **raw-task immutability**. **Unknown:** Desktop GUI, global OpenCode config (deny-protected), `:9000/:9001` owners.

**Phase history (condensed):**
| Phase | Outcome |
|---|---|
| 1–12 (earlier program) | Local, LiteLLM, Go-direct routes verified individually; workbench **PARTIALLY ACCEPTED**; credential blocker open |
| 13A | Local-only contract; API out-of-band; `gates:N` ≠ attestation |
| 13B | `mp.taskcontract/1` design **PROPOSED** |
| 13C | Implementation **HOLD** (no explicit file approval) |
| 13D/13E | **BLOCKED** (prereq unmet) |
| 13F | **INSUFFICIENT EVIDENCE** for cross-route consistency |
| 0 | Reusable Local pipeline + independent API; gaps enumerated |
| 0.1 | CLI verified; Desktop untested; consoles = business UI (0 refs to `:3199`) |
| 1 | Minimal additive design proposed |
| 2 | Reconciliation → canonical Stage 0; **READY FOR EXPLICIT FILE-LEVEL APPROVAL** |

**Architecture (verified routes only):**
```
Operator (OpenCode CLI now; console page later)
        │ submit raw task
        ▼
Framework Gateway :3199 ─ runMission ─ package/capsule/manifest/order ─ GPU controller ─ Ollama :11434
   (no TASK_PROFILES selection · no gate-ledger write · API dispatch absent)
API route: OpenCode Go — OUT-OF-BAND (official client; never via LiteLLM)
LiteLLM :4001 — transport only (loopback, local aliases)
Local FS tools: .ai/control/local-tool-bridge.mjs (read_file/list_dir/grep_count; path-confined; no shell)
```

---

## PART 2 — Evidence index, current vs historical, exact paths/hashes
**Packaged reports** (`reports/`) — *HISTORICAL* claims (verbatim), hashes in `SOURCE-MANIFEST.json`:
`PHASE0-REUSE-AUDIT.md`, `PHASE0.1-UI-SUITABILITY-AUDIT.md`, `PHASE1-MINIMAL-EXECUTION-DESIGN.md`, `PHASE2-EVIDENCE-RECONCILIATION-AND-APPROVAL-PACKAGE.md`, `PHASE13A-DESIGN-ROUTING-AUDIT.md`, `PHASE13B-CANONICAL-CONTRACT-PROPOSAL.md`, `PHASE13C-IMPLEMENTATION-REPORT.md`, `PHASE13D-CONFORMANCE-REPORT.md`, `PHASE13E-INTEGRATION-PILOT-REPORT.md`, `PHASE13F-ACCEPTANCE-REPORT.md`.

**Packaged sources** (`sources/`) — curated, **non-sensitive**, hash-verified (`SOURCE-MANIFEST.json` / `INDEX.md`):
- `scripts/`: `mission.mjs` `50145FCC…`, `framework-gateway.mjs` `66DFC5AA…`, `gates.mjs` `09188…`, `context.mjs` `B31A8EDE…`, `context-bridge.mjs` `923A595C…`, `enforce.mjs` `6A0DA122…`, `orders.mjs` `3A24B11A…`
- `local-tool-bridge.mjs` `5E057A80…`
- `registry/`: `TASK_PROFILES.json` `EB5B4EE8…`, `CAPABILITY_ROUTING.json` `868B9D56…`, `MODES.json` `22BE026B…`, `CLOUD_LOCAL_ROUTING.json` `193AA073…`
- `integration/`: `feature_flags.json` `9BD8CBC5…`, `contract.test.mjs` `4B19A51C…`, `prompt_contract.mjs` `0ACDA680…`, `context_budget.mjs` `4B5DE631…`, `retry_policy.mjs` `AFF5CE22…`, `route_selector.mjs` `F7BA0E91…`

**CURRENTLY_CHECKED vs HISTORICAL:**
- CURRENT: ports/services, flags OFF, file existence, gateway imports (no `TASK_PROFILES`/`attestGate`), `TASK_PROFILES` only referenced by `forge.mjs`/`random-audit-canary.ps1`, `gates.attestGate/ledgerAppend/certify` exist, 9 existing integration tests, dirty 887.
- HISTORICAL: latency figures, credential audit, DSPy/PromptWizard results, per-route acceptance in Phases 1–12.
- CONTRADICTED: none identified.
- UNKNOWN: Desktop GUI; global OpenCode config; `:9000/:9001` owners; whether any external component attests gates.

**Not copied (by safety rule):** `.opencode/opencode.json` (contains the plaintext `DATABASE_URI`), any `.env`, credentials, keys, DB dumps, unrelated app code.

---

## PART 3 — Stage 0 six-file proposal, tests, rollback, approval boundary
**PROPOSED (not approved, not implemented).** Initial flag state: **`task_contract_v1: false`**.

| # | Path | Change | Why |
|---|---|---|---|
| 1 | `scripts/task-contract.mjs` | CREATE | single shared contract v1 + validators + merge |
| 2 | `.ai/project-profile.json` | CREATE | project-specific settings; keep Framework generic |
| 3 | `scripts/mission.mjs` | APPEND `selectProfile`, `recordRawTask` | track selection + immutable raw-task ref |
| 4 | `scripts/framework-gateway.mjs` | APPEND flag-gated block in `runMission` | contract→validate→attest on the live path |
| 5 | `.ai/control/integration/contract.test.mjs` | APPEND unit + A–J | prove before activation |
| 6 | `.ai/control/integration/feature_flags.json` | ADD `task_contract_v1:false` | keep inert |

**Reconciliation decided:** keep ONE contract module; **drop** the separate `contract-validator.mjs` (duplicate) — fold checks into the contract + reuse existing guards; **defer** `integration/opencode-adapter.mjs` to Stage 1.

**Tests (PROPOSED):** T1 schema/version reject · T2 raw-task hash preserved · T3 dependency/order · T4 profile+prompt retrieval · T5 scope/unauthorized rejection · T6 pre/post validation · T7 dispatch/completion/rejection evidence · T8 ledger integrity · T9 local-only no-fallback · T10 direct Go (DEFERRED) · T11 artifact schema/hash · T12 merge/conflict · T13 regression (flags OFF, incl. 9 existing) · T14 rollback. **Acceptance:** T1–T9, T11–T14 PASS with flags OFF.

**Rollback (preserve-first):** delete files 1–2; remove the flag key; remove appended functions/tests; revert doc addendum. No reset/stash/clean; dirty tree untouched.

**Approval boundary:** nothing is authorized by Phase 2/2.1. Implementation proceeds only after **explicit file-level approval** naming files 1–6. Flags stay OFF.

---

## PART 4 — Unresolved issues, security boundaries, next action
**Security boundaries (must hold):**
- Flags stay **OFF**; no route activation; no certification claims.
- **Go stays direct** (never via LiteLLM); local-only **fails closed** (no silent cloud).
- No secrets in prompts/logs/reports/artifacts; no credential rotation or history purge; no Desktop change; no new installs; no process termination; context margin 15–20%.

**Unresolved blockers:**
1. **Plaintext `DATABASE_URI`** in `E:\meter\.opencode\opencode.json` — **high severity, separate approved remediation** (not addressed here; value never copied).
2. **No shared cross-route contract** → cross-route consistency cannot be claimed.
3. **Gateway writes no gate-ledger attestation**; `gates:N` is a compiled count.
4. **Desktop GUI untested**; **Go-via-LiteLLM** unsupported; **orphan `llama-server`** VRAM contention (do not terminate) causes ~100 s governed-request latency.
5. **Global OpenCode config** deny-protected (UNKNOWN).

**Next safe action (one):** review `STAGE-0-REVIEW-PACKET.md`; if acceptable, grant **explicit file-level approval** for the six files (flag remains `false`). Do **not** implement, dispatch new routes, or activate flags until then.

**Status:** `READY FOR EXPLICIT FILE-LEVEL APPROVAL` — proposal only.
