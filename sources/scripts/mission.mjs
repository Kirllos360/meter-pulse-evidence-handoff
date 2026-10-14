#!/usr/bin/env node
// Meter Pulse — MISSION INTAKE & EXECUTION PACKAGES (Framework intake layer)
//
// Turns a simple user request into a governed engineering mission WITHOUT
// duplicating LAOS/gates/enforce (it calls them):
//   intake --text "..."  -> classification (PLANNED vs UNPLANNED) + plan match
//   evaluate             -> impact analysis (graph slice, schema check, replans)
//   package              -> Framework Development Execution Package (JSON)
//   report               -> §16 human-readable final report (markdown)
// Replan assessment and next-action derivation reuse enforce.mjs + gates.mjs.
//
// Import-safe (CLI guard); unit-tested in backend/tests/unit/mission.test.mjs.
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { compilePath, loadManifest } from "./gates.mjs"
import { readPhaseTasks, readSequences, nextAuthorizedWork } from "./enforce.mjs"

const STOP = new Set(("the,a,an,to,in,on,for,of,and,or,build,make,fix,with,from,into,please,should,could,would,new,all,any,our,your,add,update,create,remove,delete,check,verify,using,use,via").split(","))
export function tokens(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter((t) => t.length > 2 && !STOP.has(t))
}

// ─── intent classification ───────────────────────────────────────────────────
export function classifyIntent(text, tasks) {
  const toks = new Set(tokens(text))
  if (!toks.size) return { kind: "UNKNOWN", match: null, score: 0 }
  let best = null
  for (const t of tasks || []) {
    const hay = new Set(tokens(`${t.task} ${t.title} ${t.phase}`))
    let score = 0
    for (const tok of toks) if (hay.has(tok)) score++
    // strong signals: exact task id or distinctive title words
    if (new RegExp(`\\b${t.task}\\b`, "i").test(text)) score += 5
    if (!best || score > best.score) best = { task: t, score }
  }
  if (best && (best.score >= 3 || /TASK-\d+/.test(text))) return { kind: "PLANNED", match: best.task, score: best.score };
  return { kind: "UNPLANNED", match: null, score: best ? best.score : 0 }
}

// ─── graph slice (affected nodes via .dot grep, capped) ─────────────────────
export function graphSlice(keywords, root = process.cwd(), max = 30) {
  const dir = path.join(root, "plans", "graphy", "architecture-graph")
  let files = []
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".dot")) } catch { return [] }
  const out = []
  for (const f of files) {
    let lines = []
    try { lines = fs.readFileSync(path.join(dir, f), "utf8").split("\n") } catch { continue }
    lines.forEach((line, i) => {
      for (const kw of keywords) {
        if (kw && line.toLowerCase().includes(String(kw).toLowerCase())) {
          out.push(`${f}:${i + 1}: ${line.trim().slice(0, 140)}`)
          break
        }
      }
    })
    if (out.length >= max) break
  }
  return out.slice(0, max)
}

// ─── database structure validation (read-only schema parse) ─────────────────
export function parseSchemaModels(schemaText) {
  const models = {}
  const re = /model\s+(\w+)\s*\{([^}]*)\}/g
  let m
  while ((m = re.exec(schemaText)) !== null) {
    const attrs = {}
    for (const line of m[2].split("\n")) {
      const am = /^\s*(\w+)\s+([\w\[\]?]+)(.*)$/.exec(line.trim())
      if (am) attrs[am[1]] = { type: am[2], rest: am[3].trim().slice(0, 120) }
    }
    models[m[1]] = attrs
  }
  return models
}
export function validateDbImpact({ models = [], attributes = {} } = {}, schemaText = "") {
  const parsed = parseSchemaModels(schemaText)
  const missing = []
  for (const model of models) {
    if (!parsed[model]) { missing.push(`model missing: ${model}`); continue }
    for (const attr of attributes[model] || []) {
      if (!parsed[model][attr]) missing.push(`attribute missing: ${model}.${attr}`)
    }
  }
  return { ok: missing.length === 0, missing }
}

// ─── skill / MCP routing (references, not copies) ───────────────────────────
const SKILL_MAP = {
  UI: ["skills/meter-pulse/browser-verification.md", "skills/meter-pulse/portal-guardian.md"],
  DB: [],
  SECURITY: [],
  SOLAR: ["skills/meter-pulse/solar-billing.md"],
  DOCS: [],
  TEST: [],
}
const MCP_MAP = {
  UI: ["playwright", "chrome-devtools", "deepseek-eyes", "graphify"],
  DB: ["postgres", "codebase-memory", "graphify"],
  SECURITY: ["postgres", "graphify"],
  DOCS: ["context7", "graphify"],
  TEST: ["playwright", "graphify"],
  CODE: ["serena", "codebase-memory", "ast-grep", "graphify"],
}
export function routeSkillsMcps(domains) {
  const skills = new Set()
  const mcps = new Set(["git", "filesystem"])
  for (const d of domains || []) {
    for (const s of SKILL_MAP[d] || []) skills.add(s)
    for (const m of MCP_MAP[d] || []) mcps.add(m)
    for (const m of MCP_MAP.CODE) mcps.add(m)
  }
  return { skills: [...skills], mcps: [...mcps] }
}

// ─── execution package ───────────────────────────────────────────────────────
export function buildExecutionPackage({ taskId, title, kind, match, domains, risk = "MEDIUM", manifest, dbImpact = null, graphNodes = [], skills = [], mcps = [], planRef = null }) {
  const compiled = compilePath(manifest, { title: title || taskId, files: [], domains, risk })
  return {
    taskId, title, kind,
    matchedPlanTask: match ? `${match.phase}/${match.task}` : null,
    planRef, domains, risk,
    gatePath: compiled.path,
    dbImpact, graphNodes,
    skills, mcps,
    evidenceRequired: ["implementation diff", "test output", "browser/visual (if UI)", "regression", "ledger rows", "certificate"],
    certificationRequired: true,
    createdAt: new Date().toISOString(),
  }
}

// ─── replan assessment ───────────────────────────────────────────────────────
export function replanAssessment(pkg, changes = {}) {
  const reasons = []
  if (changes.architecture) reasons.push("architecture impact → graph/graphify realignment + gate recompilation")
  if (changes.schema) reasons.push("schema impact → database validation + migration assessment")
  if (changes.requirements) reasons.push("requirement change → plan/roadmap update")
  if (changes.failedRegression) reasons.push("regression failure → root cause → new capability branch")
  return { replanRequired: reasons.length > 0, reasons }
}

// ─── next action + final report ──────────────────────────────────────────────
export function determineNextAction(root = process.cwd()) {
  const tasks = readPhaseTasks(root)
  let sequences = {}
  try { sequences = readSequences(root) } catch { /* none */ }
  let checkpoint = {}
  try { checkpoint = JSON.parse(fs.readFileSync(path.join(root, ".ai", "control", "CHECKPOINT.json"), "utf8")) } catch { /* none */ }
  return nextAuthorizedWork({ tasks, sequences, checkpoint })
}
export function missionReport(d = {}) {
  const L = []
  L.push(`# MISSION REPORT — ${d.taskId || "unknown"}`)
  L.push(`- WHAT WAS REQUESTED: ${d.requested || "—"}`)
  L.push(`- WHAT WAS PLANNED: ${d.planned || "—"}`)
  L.push(`- WHAT WAS ACTUALLY CHANGED: ${(d.filesChanged || []).join(", ") || "nothing"}`)
  L.push(`- DATABASE CHANGES: ${(d.dbChanges || []).join(", ") || "none"}`)
  L.push(`- API CHANGES: ${(d.apiChanges || []).join(", ") || "none"}`)
  L.push(`- UI CHANGES: ${(d.uiChanges || []).join(", ") || "none"}`)
  L.push(`- TESTS PASSED: ${(d.testsPassed || []).join(", ") || "none"}`)
  L.push(`- BROWSER TESTS: ${d.browser || "N/A"}`)
  L.push(`- VISUALLY VERIFIED: ${d.visual || "N/A"}`)
  L.push(`- CERTIFICATE: ${d.certificate || "none"}`)
  L.push(`- LOCAL MASTER VERIFIED: ${d.museVerified || "pending"}`)
  L.push(`- WHAT REMAINS OPEN: ${(d.open || []).join("; ") || "none recorded"}`)
  L.push(`- NEXT RECOMMENDED ACTION: ${d.next || "owner to confirm"}`)
  return L.join("\n")
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
const isMain = (() => { try { return path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url) } catch { return false } })()
if (isMain) {
  const args = process.argv.slice(2)
  const cmd = args[0]
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
  const root = process.cwd()
  try {
    if (cmd === "intake") {
      const text = get("--text") || ""
      const tasks = readPhaseTasks(root)
      const c = classifyIntent(text, tasks)
      console.log(JSON.stringify({ text: text.slice(0, 200), ...c, match: c.match ? `${c.match.phase}/${c.match.task}: ${c.match.title}` : null }, null, 2))
    } else if (cmd === "package") {
      const file = get("--file")
      if (!file) throw new Error("package requires --file <intake-json>")
      const intake = JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"))
      const manifest = loadManifest(root)
      const planTasks = readPhaseTasks(root)
      const cls = classifyIntent(intake.text || "", planTasks)
      const kind = intake.kind || cls.kind
      const match = intake.match || cls.match
      let schemaText = ""
      try { schemaText = fs.readFileSync(path.join(root, "backend", "prisma", "schema.prisma"), "utf8") } catch { /* no schema */ }
      const dbImpact = intake.models ? validateDbImpact({ models: intake.models, attributes: intake.attributes || {} }, schemaText) : null
      const graphNodes = graphSlice(tokens(intake.text || ""), root)
      const routed = routeSkillsMcps(intake.domains || [])
      const pkg = buildExecutionPackage({ ...intake, kind, match, manifest, dbImpact, graphNodes, skills: routed.skills, mcps: routed.mcps })
      const out = get("--out")
      if (out) fs.writeFileSync(path.resolve(root, out), JSON.stringify(pkg, null, 2))
      else console.log(JSON.stringify(pkg, null, 2))
    } else if (cmd === "report") {
      const file = get("--file")
      if (!file) throw new Error("report requires --file <report-input-json>")
      const data = JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"))
      const md = missionReport(data)
      const out = get("--out")
      if (out) fs.writeFileSync(path.resolve(root, out), md)
      else console.log(md)
    } else if (cmd === "next-action") {
      console.log(JSON.stringify(determineNextAction(root), null, 2))
    } else throw new Error("usage: mission.mjs <intake|package|report|next-action> ...")
  } catch (e) { console.error("MISSION ERROR:", e.message); process.exit(1) }
}

