#!/usr/bin/env node
// Meter Pulse — ENFORCEMENT ENGINE (mechanical gates for LAOS/automation)
//
// Pure, import-safe functions used by scripts/automate.mjs (and any future
// runner) so the framework ENFORCES its workflow instead of documenting it:
//   - parseVitestSummary: TEST/RETEST/REGRESSION steps cannot silently pass —
//     unparseable or failing output is a hard failure (fail-closed).
//   - validateResultPack: RESULT PACKs are schema- and evidence-checked before
//     acceptance; worker claims alone never pass.
//   - readPhaseTasks / readSequences / nextAuthorizedWork: a simple
//     "Continue Meter Pulse implementation" resolves to exactly one next task
//     (or an explicit PAUSE with reasons) from plan + sequence + checkpoint.
//   - groupStatus / scanPauseTriggers / buildConsultationPack: 10 completed
//     phases = 1 CONSULTATION GROUP; boundary or trigger => automatic pause.
//   - withGpu: every local-model call reserves/releases/records through the
//     GPU controller; direct Ollama bypass is centralized here.
//
// CLI (only when executed directly; safe to import from tests):
//   node scripts/enforce.mjs check-pack --file <result-pack.json> [--root .]
//   node scripts/enforce.mjs next [--dry-run]
//   node scripts/enforce.mjs group-status
//   node scripts/enforce.mjs consult-pack --group <n> --out <file>
import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"
import { fileURLToPath } from "url"

export const GROUP_SIZE = 10
export const RESULT_STATUSES = ["PASS", "FAIL", "BLOCKED", "PARTIAL"]
const PAUSE_MARKERS = [
  "OWNER DECISION REQUIRED",
  "QUARANTIN",
  "CERTIFICATION BLOCKER",
  "IRREVERSIBLE",
  "SECURITY ISSUE",
  "INTEGRATION DECISION",
]

// ─── test-output gate (fail-closed) ──────────────────────────────────────────
export function parseVitestSummary(text) {
  const t = String(text || "")
  const filesLine = t.split("\n").find((l) => l.includes("Test Files"))
  const testsLine = t.split("\n").find((l) => /(^|\s)Tests\s/.test(l) && l.includes("passed"))
  if (!filesLine || !testsLine) {
    return { ok: false, reason: "no vitest summary lines found (fail-closed)", files: null, tests: null }
  }
  const grab = (line) => {
    const failed = (/(\d+)\s+failed/.exec(line) || [])[1]
    const passed = (/(\d+)\s+passed/.exec(line) || [])[1]
    const skipped = (/(\d+)\s+skipped/.exec(line) || [])[1]
    return { failed: failed ? Number(failed) : 0, passed: passed ? Number(passed) : 0, skipped: skipped ? Number(skipped) : 0 }
  }
  const files = grab(filesLine)
  const tests = grab(testsLine)
  const ok = files.failed === 0 && tests.failed === 0 && (files.passed > 0 || tests.passed > 0)
  return { ok, files, tests, reason: ok ? null : `failures present (files failed=${files.failed}, tests failed=${tests.failed})` }
}

// ─── Result Pack validation ──────────────────────────────────────────────────
const REQUIRED_PACK_FIELDS = ["context_id", "task_id", "arm", "agent", "model", "status", "summary", "confidence"]
export function validateResultPack(pack, root = process.cwd()) {
  const errors = []
  if (!pack || typeof pack !== "object") return { ok: false, errors: ["pack is not an object"] }
  for (const f of REQUIRED_PACK_FIELDS) {
    if (pack[f] === undefined || pack[f] === null || pack[f] === "") errors.push(`missing required field: ${f}`)
  }
  if (pack.status && !RESULT_STATUSES.includes(pack.status)) errors.push(`invalid status: ${pack.status}`)
  if (typeof pack.confidence === "number" && (pack.confidence < 0 || pack.confidence > 1)) errors.push("confidence out of range [0,1]")
  const evFiles = Array.isArray(pack.evidence_files) ? pack.evidence_files : []
  for (const f of evFiles) {
    const abs = path.resolve(String(root), String(f))
    if (!fs.existsSync(abs)) errors.push(`evidence file missing: ${f}`)
  }
  const hasTests = Array.isArray(pack.tests_run) && pack.tests_run.length > 0
  const hasBrowser = Array.isArray(pack.browser_evidence) && pack.browser_evidence.length > 0
  if (pack.status === "PASS" && !hasTests && !hasBrowser && evFiles.length === 0) {
    errors.push("PASS with no tests_run, browser_evidence, or evidence_files (worker claim alone is not proof)")
  }
  return { ok: errors.length === 0, errors }
}

// ─── plan / sequence reading ─────────────────────────────────────────────────
function normStatus(s) {
  const t = String(s || "").toUpperCase()
  if (/CERTIFIED|DONE/.test(t)) return "DONE"
  if (/BLOCKED/.test(t)) return "BLOCKED"
  if (/IN[_ ]PROGRESS/.test(t)) return "IN_PROGRESS"
  return "PENDING"
}
export function readPhaseTasks(root = process.cwd()) {
  const planDir = path.join(root, "plan")
  let dirs = []
  try { dirs = fs.readdirSync(planDir).filter((d) => d.startsWith("phase-")).sort() } catch { return [] }
  const out = []
  for (const dir of dirs) {
    const phaseFile = path.join(planDir, dir, "PHASE.md")
    let md = ""
    try { md = fs.readFileSync(phaseFile, "utf8") } catch { continue }
    const lines = md.split("\n")
    // Some phases use an Owner column instead of Deps — detect from the header.
    const headerIdx = lines.findIndex((l) => /^\|\s*Task\s*\|/.test(l.trim()))
    const fourthIsDeps = headerIdx >= 0 && /\|\s*Deps\s*\|/.test(lines[headerIdx])
    for (const line of lines) {
      const m = /^\|\s*(TASK-\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/.exec(line.trim())
      if (!m) continue
      out.push({ phase: dir, task: m[1], title: m[2].trim(), status: normStatus(m[3]), rawStatus: m[3].trim(), deps: fourthIsDeps ? m[4].trim() : "—" })
    }
  }
  return out
}
export function readSequences(root = process.cwd()) {
  const dir = path.join(root, ".ai", "sequences")
  let files = []
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")) } catch { return {} }
  const map = {}
  for (const f of files) {
    try {
      const st = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))
      const steps = Object.values(st.steps || {})
      const done = steps.length > 0 && steps.every((s) => s.status === "DONE")
      map[`${st.phase}/${st.task}`] = { done, file: f }
    } catch { /* ignore corrupt sequence files; they are evidence of a gap, not status */ }
  }
  return map
}
function depSatisfied(dep, tasks, phaseComplete) {
  const d = String(dep || "").trim()
  if (!d || d === "—" || d === "-") return { ok: true }
  const tm = /^TASK-(\d+)$/.exec(d)
  if (tm) return { ok: true, taskRef: d } // resolved against same phase by caller
  const pm = /^Phase (\d+)$/.exec(d)
  if (pm) {
    const key = Object.keys(phaseComplete).find((k) => k.startsWith(`phase-${pm[1].padStart(2, "0")}`) || k.includes(`phase-${Number(pm[1])}`))
    return key ? { ok: !!phaseComplete[key], phaseRef: key } : { ok: false, reason: `unknown phase ref ${d}` }
  }
  if (/^all$/i.test(d)) return { ok: Object.values(phaseComplete).every(Boolean), allRef: true }
  return { ok: false, external: true, reason: `external/owner dep: ${d}` }
}
export function nextAuthorizedWork({ tasks, sequences = {}, checkpoint = {} } = {}) {
  const eff = (t) => {
    const seq = sequences[`${t.phase}/${t.task}`]
    if (seq && seq.done) return "DONE"
    return t.status
  }
  const phaseComplete = {}
  for (const t of tasks) {
    const s = eff(t)
    const doneish = s === "DONE" || s === "BLOCKED"
    phaseComplete[t.phase] = phaseComplete[t.phase] === false ? false : doneish && (phaseComplete[t.phase] !== false)
    if (!doneish && phaseComplete[t.phase] === undefined) phaseComplete[t.phase] = false
  }
  for (const t of tasks) {
    if (phaseComplete[t.phase] === undefined) phaseComplete[t.phase] = true
  }
  const blockedNotes = []
  for (const t of tasks) {
    const status = eff(t)
    if (status === "DONE") continue
    if (status === "BLOCKED") { blockedNotes.push(`${t.phase}/${t.task} is BLOCKED (${t.rawStatus})`); continue }
    // same-phase TASK-XX dep
    const tm = /^TASK-(\d+)$/.exec(String(t.deps || "").trim())
    if (tm) {
      const depTask = tasks.find((x) => x.phase === t.phase && x.task === `TASK-${tm[1]}`)
      if (depTask && eff(depTask) !== "DONE") continue // dep unmet: skip silently, keep scanning
      if (!depTask) { blockedNotes.push(`${t.phase}/${t.task} references unknown ${t.deps}`); continue }
    } else {
      const dep = depSatisfied(t.deps, tasks, phaseComplete)
      if (!dep.ok) {
        if (dep.external) { blockedNotes.push(`${t.phase}/${t.task} waits on external dep (${t.deps})`); continue }
        continue
      }
    }
    const cps = JSON.stringify(checkpoint.blockers || [])
    if (cps.includes(t.task) || cps.includes(t.phase)) { blockedNotes.push(`${t.phase}/${t.task} mentioned in checkpoint blockers`); continue }
    return { decision: "EXECUTE", phase: t.phase, task: t.task, title: t.title, reason: `first non-done task with satisfied deps (effective status ${status})`, blockedNotes }
  }
  const t0702 = tasks.find((t) => t.phase === "phase-07-audit" && t.task === "TASK-02")
  const t0702Done = t0702 && eff(t0702) === "DONE"
  if (t0702Done) {
    return { decision: "CONSULTATION_READY", reason: "07-02 DONE is consultation boundary, not global stop; Framework control-plane work is executable", blockedNotes, consultation: { group: "GROUP-1", phasesDone: Object.keys(phaseComplete).filter((k) => phaseComplete[k]).length, next: "GROUP-1 pack / roadmap reconciliation / audit prep" } }
  }
  return { decision: "PAUSE", reason: "no executable task: all done, blocked, or waiting on external deps", blockedNotes }
}

// ─── consultation groups (10 phases = 1 group) ───────────────────────────────
export function groupStatus(completedPhaseCount) {
  const n = Number(completedPhaseCount) || 0
  return {
    completed: n,
    groupSize: GROUP_SIZE,
    inGroup: n % GROUP_SIZE,
    boundaryHit: n > 0 && n % GROUP_SIZE === 0,
  }
}
export function scanPauseTriggers(root = process.cwd()) {
  const hits = []
  const scanFile = (file) => {
    let s = ""
    try { s = fs.readFileSync(file, "utf8") } catch { return }
    s.split("\n").forEach((line, i) => {
      for (const m of PAUSE_MARKERS) {
        if (line.toUpperCase().includes(m)) { hits.push(`${path.relative(root, file)}:${i + 1}: ${m}`); break }
      }
    })
  }
  const walk = (dir) => {
    let e = []
    try { e = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const x of e) {
      const p = path.join(dir, x.name)
      if (x.isDirectory()) { if (!/node_modules|\.git|dist|build|coverage/.test(p)) walk(p) }
      else if (/\.(md|json|jsonl)$/.test(p)) scanFile(p)
    }
  }
  walk(path.join(root, "plan"))
  const cp = path.join(root, ".ai", "control", "CHECKPOINT.json")
  scanFile(cp)
  return [...new Set(hits)]
}
export function buildConsultationPack({ groupNo, phases, totals = {}, defects = [], deferred = [], decisions = [], risks = [], evidence = [], next = "" }) {
  const L = []
  L.push(`# CONSULTATION PACK — GROUP ${groupNo}`)
  L.push("")
  L.push(`- phases completed: ${(phases || []).join(", ") || "none listed"}`)
  L.push(`- functionality delivered: ${totals.functionality || "see phase certificates"}`)
  L.push(`- tests and regression status: ${totals.tests || "unknown"}`)
  L.push(`- browser/visual status: ${totals.browser || "unknown"}`)
  L.push(`- security status: ${totals.security || "unknown"}`)
  L.push(`- compatibility status: ${totals.compatibility || "unknown"}`)
  L.push(`- known defects: ${(defects || []).join("; ") || "none recorded"}`)
  L.push(`- deferred items: ${(deferred || []).join("; ") || "none recorded"}`)
  L.push(`- architecture decisions: ${(decisions || []).join("; ") || "none recorded"}`)
  L.push(`- owner decisions required: ${(totals.ownerDecisions && totals.ownerDecisions.join("; ")) || "none recorded"}`)
  L.push(`- risks: ${(risks || []).join("; ") || "none recorded"}`)
  L.push(`- evidence references: ${(evidence || []).join("; ") || "none recorded"}`)
  L.push(`- recommended next group: ${next || "owner to confirm"}`)
  L.push("")
  L.push("SYSTEM PAUSED AT CONSULTATION BOUNDARY — awaiting owner review before the next group.")
  return L.join("\n")
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const GPU_CONTROLLER = path.join(SCRIPT_DIR, "gpu-controller.mjs")

// ─── GPU wrapper (no direct Ollama bypass in governed runners) ──────────────
export function reserveGpu(model, task, waitSec = 120, runner = spawnSync) {
  const r = runner("node", [GPU_CONTROLLER, "reserve", "--model", model, "--task", task, "--wait", String(waitSec)], { encoding: "utf8" })
  if (r.status !== 0) throw new Error(`GPU reserve failed: ${(r.stderr || r.stdout || "").slice(0, 200)}`)
  const lock = JSON.parse(r.stdout)
  if (!lock.ok) throw new Error(`GPU reserve rejected: ${r.stdout.slice(0, 200)}`)
  return lock.lock
}
export function releaseGpu(lockId, runner = spawnSync) {
  const r = runner("node", [GPU_CONTROLLER, "release", "--id", lockId], { encoding: "utf8" })
  return r.status === 0
}
export function recordGpu({ model, task, ms, tokens, status, quality, notes }, runner = spawnSync) {
  const args = [GPU_CONTROLLER, "record", "--model", model, "--task", task, "--ms", String(ms), "--tokens", String(tokens || 0), "--status", status]
  if (quality !== undefined) args.push("--quality", String(quality))
  if (notes) args.push("--notes", String(notes))
  const r = runner("node", args, { encoding: "utf8" })
  return r.status === 0
}
export async function withGpu(model, task, fn, runner = spawnSync) {
  const lock = reserveGpu(model, task, 120, runner)
  const t0 = Date.now()
  try {
    const out = await fn()
    recordGpu({ model, task, ms: Date.now() - t0, tokens: 0, status: "ok" }, runner)
    return out
  } catch (e) {
    recordGpu({ model, task, ms: Date.now() - t0, tokens: 0, status: "fail", notes: String(e.message || e).slice(0, 160) }, runner)
    throw e
  } finally {
    releaseGpu(lock.lockId, runner)
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
const isMain = (() => { try { return path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url) } catch { return false } })()
if (isMain) {
  const args = process.argv.slice(2)
  const cmd = args[0]
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
  const root = process.cwd()
  try {
    if (cmd === "check-pack") {
      const file = get("--file")
      if (!file) throw new Error("check-pack requires --file")
      const pack = JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"))
      const r = validateResultPack(pack, get("--root") || root)
      console.log(JSON.stringify(r, null, 2))
      process.exit(r.ok ? 0 : 1)
    } else if (cmd === "tasks") {
      const tasks = readPhaseTasks(root)
      const sequences = readSequences(root)
      const out = tasks.map((t) => {
        const seq = sequences[`${t.phase}/${t.task}`]
        const effective = seq && seq.done ? "DONE" : t.status
        return { ...t, effectiveStatus: effective, hasSequence: !!seq }
      })
      console.log(JSON.stringify({ tasks: out }, null, 2))
    } else if (cmd === "next") {      const tasks = readPhaseTasks(root)
      const sequences = readSequences(root)
      let checkpoint = {}
      try { checkpoint = JSON.parse(fs.readFileSync(path.join(root, ".ai", "control", "CHECKPOINT.json"), "utf8")) } catch { /* no checkpoint yet */ }
      const r = nextAuthorizedWork({ tasks, sequences, checkpoint })
      console.log(JSON.stringify(r, null, 2))
      process.exit(r.decision === "EXECUTE" ? 0 : 2)
    } else if (cmd === "group-status") {
      const tasks = readPhaseTasks(root)
      const phases = [...new Set(tasks.map((t) => t.phase))]
      const done = phases.filter((p) => tasks.filter((t) => t.phase === p).every((t) => /DONE|CERTIFIED/.test(t.rawStatus)))
      console.log(JSON.stringify({ ...groupStatus(done.length), completedPhases: done, totalPhases: phases.length }, null, 2))
    } else if (cmd === "consult-pack") {
      const group = get("--group") || "1"
      const out = get("--out")
      const pack = buildConsultationPack({ groupNo: group, phases: [], totals: {}, defects: [], deferred: [], decisions: [], risks: [], evidence: [], next: "" })
      if (out) fs.writeFileSync(path.resolve(root, out), pack)
      else console.log(pack)
    } else {
      throw new Error("usage: enforce.mjs <check-pack|next|group-status|consult-pack> ...")
    }
  } catch (e) { console.error("ENFORCE ERROR:", e.message); process.exit(1) }
}
