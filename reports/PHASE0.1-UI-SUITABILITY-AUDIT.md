# Phase 0.1 — UI & Execution-Surface Suitability Audit (READ-ONLY)

- **Date:** 2026-10-14 · **Mode:** read-only (no files/settings/services/flags/processes changed)
- **Evidence dir:** `E:\MeterPulse_AI\_audit\phase0.1-ui-20261014-173429` (pointer `...\_audit\PHASE0.1-UI-LATEST.txt`)
- Historical context: `phase0-reuse-20261014-172216\PHASE0-REUSE-AUDIT.md` (treated as HISTORICAL; current state re-checked).

## 1. Capability comparison

| Capability | OpenCode Desktop | OpenCode CLI 1.19.0 | Open WebUI | Meter Pulse console(s) | LiteLLM :4001 |
|---|---|---|---|---|---|
| Present/installed | **yes** (exe + 7 processes) | **yes** | **NO** (no dir/CLI/port) | **yes** (`:3535/:3030`, Next.js) | yes |
| Actually testable here | **NO — GUI not observable** | **yes (CLI evidence)** | n/a | pages reachable; Framework-integration **absent** | yes (transport) |
| Framework gateway integration (`:3199`) | unknown (no GUI test) | indirect (calls providers, not the gateway) | n/a | **NONE** (0 references) | n/a (must not) |
| Task submission to Framework | untested | not present | n/a | not present (business CRUD only) | no |
| Dependency/step visualization | untested | no | n/a | no | no |
| Local/API/Hybrid selection | untested | no | n/a | no | no (not its role) |
| Progress/execution status | untested | CLI stdout only | n/a | business dashboards only | no |
| Evidence/artifact viewing | untested | no | n/a | no | no |
| Approval/checkpoint controls | untested | no | n/a | no | no |
| Certification status | untested | no | n/a | no | no |
| Tool/FS permission boundary | untested | inherits session perms | n/a | app auth (business) | n/a |
| One canonical control plane | — | yes (calls providers) | — | no (separate app) | no |

## 2. Exact evidence and limitations per surface

**A. OpenCode Desktop — `NOT TESTED`.**
`OpenCode.exe` installed and **7 processes running** (pids 6420/11936/16244/19928/23856/25092/27784) — but **process presence is not a GUI test**. This execution session is headless (no observable GUI session), so I cannot open the workspace, invoke the Framework entry, submit a task, or observe output. **No PASS claimed.**

**B. OpenCode CLI — verified CLI evidence only.**
`opencode --version` → **1.19.0**. Safe non-destructive tasks were executed in prior phases (`opencode run --model opencode-go/… "Reply with exactly…"` → exit 0, observable output) — **CLI evidence; cannot certify Desktop.**
*Limitation:* the CLI calls providers directly; it does **not** submit to the Framework gateway `:3199`.

**C. Web interfaces.**
- **Open WebUI: NOT INSTALLED / NOT REACHABLE** (no install dir, no `open-webui` command, ports `3000/8080/8000` closed). Not a candidate (install forbidden).
- **Meter Pulse consoles**: Next.js `E:\meter\Frontend` — admin `:3535` (API `:3131`), portal `:3030` (API `:3003`); launched by `mw\services\admin-fe.cmd` / `portal-fe.cmd`. It is a **business/utility billing admin**. AI pages exist — `admin/ai`, `ai-command-center`, `ai-diagnostics`, `ai-operations`, `financial-ai` — but they serve **domain AI** (Meter RCA, Email Intel, Supplier RCA, Audit Timeline, financial AI) via the app's own backend (`/api/incidents`, `/api/intelligence`, `/api/knowledge`). Backend `tasks.js` is a **human task CRUD** (todo/in_progress/review/done, assignee). **No references to `:3199` / `meter-pulse-framework` anywhere in Frontend or backend** → **not Framework-integrated.**

**D. Routing / execution boundaries (health verified).**

| Component | Endpoint | Role | Health (now) |
|---|---|---|---|
| Framework Gateway | `127.0.0.1:3199` | planning, package/capsule/order, route decision, Local dispatch, governance | **UP** (`/v1/models` 200; live mission earlier) |
| LiteLLM | `127.0.0.1:4001` | **provider transport/router only** (loopback, key-auth) | **UP** |
| Ollama | `127.0.0.1:11434` | model inference (6 models) | **UP** |
| Filesystem execution | `.ai/control/local-tool-bridge.mjs` | allowlisted read-only tools, path-confined | implemented |
*(No credentials printed; no secrets sent.)*

## 3. Recommended current execution surface
**OpenCode CLI 1.19.0**, with **Meter Pulse Framework Gateway `:3199` as the control plane.** The CLI is the only surface whose operation is **verified** in this environment and which can carry a bounded, observable, non-destructive task today. Any Framework-governed task should be **submitted to `:3199`** (the CLI is the operator console, not the orchestrator).

**Desktop:** *NOT TESTED* — cannot be recommended or certified without an observed GUI session.
**Open WebUI:** absent — out.

## 4. Can an existing Meter Pulse console become the eventual workbench UI?
**Possibly — but not today.** It is a viable *host* (Next.js admin, auth, design system, role-gated pages) and the natural place for a future “Framework Workbench” page. However, it currently has **zero integration** with `:3199` and its AI pages are business-domain. Becoming the workbench UI requires **new additive page(s)** that call the Framework gateway and render route decisions, step/dependency graph, evidence/artifacts, checkpoints, and certification. That is **new code**, not reuse.

## 5. What LiteLLM should and should not do
- **Should:** provider transport/routing on **loopback** with explicit local aliases + key auth; keep local-only aliases local.
- **Should NOT:** be a UI; plan, decompose, or route **tasks**; act as a control plane; be a merge engine; carry **OpenCode Go** traffic (Go stays direct per governance).

## 6. Minimum missing integration for a complete task workflow
1. **A Framework-integrated submit surface** — smallest: a thin CLI/HTTP client that POSTs a task to `:3199`; later: one admin page in `E:\meter\Frontend` (`admin/framework-workbench`) calling `:3199`.
2. **Canonical task contract** (`scripts/task-contract.mjs`, Phase 13B) to carry IDs/deps/schemas/acceptance once, for Local and API.
3. **Track/prompt selection wiring** — make the gateway actually use `.ai/registry/TASK_PROFILES.json` (currently unused) to pick role/prompt/tools/profile.
4. **Gate/ledger attestation** — gateway should call `gates.attestGate` so routing/validation is evidenced (today it writes no gate ledger).
5. **Evidence/checkpoint viewer** — minimal read-only render of `.ai/orders`, `.ai/context`, `GATE_LEDGER`, `GPU_TELEMETRY`.

## 7. GO / NO-GO for the next bounded implementation phase
**GO (review only)** for a *minimal Framework-integrated surface + the Phase 0/13B additive contract/track/attestation items*. Reuse the CLI now; reuse the existing console as the eventual host only via a new additive page.

**NO-GO to implement or activate** until: (a) specific candidate files are explicitly approved (13C gate), (b) LiteLLM stays transport-only with flags OFF, (c) the plaintext `DATABASE_URI` blocker is separately addressed, (d) Desktop is **not** modified and remains NOT TESTED.

---
**Single most important finding:** of the existing surfaces, only **OpenCode CLI** is operationally verified, and **none of the GUIs is Framework-integrated**; **OpenCode Desktop is NOT TESTED**, **Open WebUI is absent**, and the **Meter Pulse console is a business UI** (0 references to `:3199`). The workbench needs a **small additive Framework-integrated submit surface**, not a new UI framework.
