# Meter Pulse — Evidence Handoff Package (Phase 2.1)

**Purpose.** A self-contained, reviewable bundle of the evidence needed to evaluate the **Phase 1/2 Stage 0 proposal** for a Framework-first, project-agnostic AI workbench — without loading the whole repository or all prior reports into one conversation.

**Scope.** Read-only packaging. This package **contains no secrets**, no `.env`, no credentials, no database dumps, no private keys. Source code included is a **curated subset** chosen to let a reviewer verify the Stage 0 proposal.

> ⚠️ **This package is NOT implementation approval.** Stage 0 is **PROPOSED**, not approved and not implemented. Production/routing feature flags remain **OFF**. No routing was activated.

## Contents / navigation
| File | What it is |
|---|---|
| `README.md` | This file |
| `INDEX.md` | Ordered evidence index with source paths + SHA-256 + classifications |
| `CURRENT-STATE.md` | Live, read-only observations taken during Phase 2.1 |
| `PHASE-SUMMARY.md` | Condensed findings of Phases 0, 0.1, 1, 2, 13A–13F |
| `STAGE-0-REVIEW-PACKET.md` | The proposed six-file Stage 0 scope (PROPOSED) |
| `SOURCE-MANIFEST.json` | Every packaged + referenced source with hashes and sensitivity decisions |
| `CHAT-HANDOFF.md` | Self-contained handoff for ChatGPT review (4 parts) |
| `reports/` | Verbatim prior audit reports (11 files) |
| `sources/` | Curated, non-sensitive Framework/registry/integration files (19 files) |
| `_secret-scan.txt` | Secret-scan result (no values shown) |
| `_inventory.txt`, `_inventory-sources.txt` | Raw hash inventories |

## Evidence classification definitions
- **CURRENTLY_CHECKED** — observed live/files in this phase (timestamped).
- **HISTORICAL** — claim from a prior report; not re-proven now.
- **PROPOSED** — design/plan; not implemented.
- **UNKNOWN** — insufficient evidence.
- **CONTRADICTED** — evidence conflicts with a claim.

## Safety statement
No implementation files were modified; no flags changed; no credentials rotated; no Desktop change; no processes terminated; the dirty working tree was not cleaned/reset/stashed.
