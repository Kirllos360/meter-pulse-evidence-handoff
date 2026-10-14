# CURRENT-STATE — live observations (Phase 2.1, read-only)

Timestamp: 2026-10-14 ~18:01 (+03:00). All items below were **CURRENTLY_CHECKED** in this phase unless marked otherwise. Nothing was modified.

| Item | Observation | Method | Classification |
|---|---|---|---|
| Framework Gateway | `127.0.0.1:3199` **UP** (node) | TCP probe + `/v1/models` | CURRENTLY_CHECKED |
| LiteLLM | `127.0.0.1:4001` **UP** (python, loopback) | TCP probe / listener | CURRENTLY_CHECKED |
| Ollama | `127.0.0.1:11434` **UP** (6 models) | TCP + `/api/tags` | CURRENTLY_CHECKED |
| Postgres | `127.0.0.1:5433` UP | TCP | CURRENTLY_CHECKED |
| OpenCode CLI | **1.19.0** | `opencode --version` | CURRENTLY_CHECKED |
| Feature flags | all **false** (`routing_adapter, litellm_alias_gateway, dspy_structured_bridge, promptwizard_optimizer, opencode_go_gateway`); sha `9BD8CBC5…` | file read | CURRENTLY_CHECKED |
| `scripts/task-contract.mjs` | **absent** | Test-Path | CURRENTLY_CHECKED |
| `integration/contract-validator.mjs` | **absent** | Test-Path | CURRENTLY_CHECKED |
| `integration/opencode-adapter.mjs` | **absent** | Test-Path | CURRENTLY_CHECKED |
| `.ai/project-profile.json` | **absent** | Test-Path | CURRENTLY_CHECKED |
| `integration/contract.test.mjs` | present, 9 tests; sha `4B19A51C…` | read | CURRENTLY_CHECKED |
| `gates.attestGate`/`ledgerAppend`/`certify` | exist (`scripts/gates.mjs`) | source read | CURRENTLY_CHECKED |
| Gateway imports | mission/gates/enforce/context/context-bridge only — **no TASK_PROFILES, no attestGate** | source read | CURRENTLY_CHECKED |
| `TASK_PROFILES.json` usage | referenced only by `forge.mjs` + `random-audit-canary.ps1`; **not wired into gateway** | grep | CURRENTLY_CHECKED |
| Git | branch `main`, HEAD `15dc743e`, **dirty 887** (not modified) | `git status` | CURRENTLY_CHECKED |
| Desktop GUI | **NOT TESTED** | n/a | UNKNOWN |

**Distinction:** service UP + file contents = fresh checks taken now. Latency figures, credential audit details, and DSPy/PromptWizard results inside `reports/` are **HISTORICAL** (prior phases), not re-run here.
