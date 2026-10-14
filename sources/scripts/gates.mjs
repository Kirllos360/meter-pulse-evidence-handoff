#!/usr/bin/env node
// Meter Pulse — SIMPLIFIED GATE ENGINE (secret key based, no HMAC complexity)
//
// Simplified gate system using secret keys instead of HMAC-SHA256 complexity.
// Uses a simple secret key per roadmap for gate verification.
//
// CLI:
//   node scripts/gates.mjs compile --title "..." --files a.js --domain UI,DB --risk HIGH
//   node scripts/gates.mjs issue --task T --execution E --gate G01 --method M --input <file|-> [--worker W] [--model Mdl] [--ttl 3600]
//   node scripts/gates.mjs transition --cap <capability.json> --expect <gateId> [--evidence <file>] [--output <file>]
//   node scripts/gates.mjs certify --execution E
//   node scripts/gates.mjs ledger-verify
import fs from "fs"
import path from "path"
import crypto from "crypto"
import { fileURLToPath } from "url"

const ROOT = process.cwd()
function detectRoot(start = ROOT) {
  let dir = path.resolve(start)
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, ".ai", "governance", "GATE_MANIFEST.json"))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.resolve(start)
}
const REPO = detectRoot()
const MANIFEST = path.join(REPO, ".ai", "governance", "GATE_MANIFEST.json")
const CAP_DIR = path.join(REPO, ".ai", "control", "capabilities")
const LEDGER = path.join(REPO, ".ai", "control", "GATE_LEDGER.jsonl")
const ROADMAP_KEY_DIR = path.join(REPO, ".ai", "control", "roadmap-keys")

export function loadManifest(root = REPO) {
  return JSON.parse(fs.readFileSync(path.join(root, ".ai", "governance", "GATE_MANIFEST.json"), "utf8"))
}
export function gateById(manifest, id) {
  return (manifest.gates || []).find((g) => g.id === id) || null
}

const CORE_PATH = ["G01", "G02", "G05", "G06", "G11", "G13", "G24", "G25", "G26", "G45", "G46", "G59", "G60", "G64", "G66", "G67", "G68", "G69"]
const DOMAIN_GATES = {
  UI: ["G51", "G52", "G53", "G54", "G55", "G56"],
  DB: ["G29", "G30", "G31"],
  SECURITY: ["G32", "G33", "G34"],
  FINANCE: ["G47"],
  UPLOAD: ["G32"],
  MIGRATION: ["G17", "G30"],
  INTEGRATION: ["G17", "G27"],
}
const RISK_GATES = { HIGH: ["G63", "G58"], MEDIUM: ["G57"], LOW: ["G57"] }
export function compilePath(manifest, { title = "", files = [], domains = [], risk = "MEDIUM" } = {}) {
  const ids = [...CORE_PATH]
  const doms = new Set(domains.map((d) => String(d).toUpperCase()))
  const text = `${title} ${files.join(" ")}`.toLowerCase()
  if (/\.tsx$|\.jsx$|page\.|component|ui\b/.test(text)) doms.add("UI")
  if (/prisma|migration|schema/.test(text)) doms.add("DB")
  if (/auth|security|permission|scope/.test(text)) doms.add("SECURITY")
  if (/invoice|payment|billing|ledger|collection/.test(text)) doms.add("FINANCE")
  if (/upload|import/.test(text)) doms.add("UPLOAD")
  for (const d of doms) for (const g of DOMAIN_GATES[d] || []) if (!ids.includes(g)) ids.push(g)
  for (const g of RISK_GATES[String(risk).toUpperCase()] || RISK_GATES.MEDIUM) if (!ids.includes(g)) ids.push(g)
  const order = new Map((manifest.gates || []).map((g, i) => [g.id, i]))
  const missing = ids.filter((id) => !order.has(id))
  if (missing.length) throw new Error(`path references unknown gates: ${missing.join(",")}`)
  return { domains: [...doms], risk, path: ids.sort((a, b) => order.get(a) - order.get(b)) }
}

function sha256(data) {
  return crypto.createHash("sha256").update(typeof data === "string" ? data : JSON.stringify(data)).digest("hex")
}
function fileHash(root, file) {
  const abs = path.resolve(root, file)
  if (!fs.existsSync(abs)) throw new Error(`evidence file missing: ${file}`)
  return sha256(fs.readFileSync(abs))
}

function getRoadmapKey(roadmapId, root = REPO) {
  const keyFile = path.join(root, ".ai", "control", "roadmap-keys", `${roadmapId}.key`)
  try { return fs.readFileSync(keyFile, "utf8").trim() } catch { return null }
}
export function getOrCreateRoadmapKey(roadmapId, root = REPO) {
  const keyDir = path.join(root, ".ai", "control", "roadmap-keys")
  fs.mkdirSync(keyDir, { recursive: true })
  const keyFile = path.join(keyDir, `${roadmapId}.key`)
  let key
  try { key = fs.readFileSync(keyFile, "utf8").trim() } catch { 
    key = crypto.randomBytes(16).toString("hex")
    fs.writeFileSync(keyFile, key + "\n", { mode: 0o600 })
  }
  return key
}
function signWithKey(data, key) {
  return crypto.createHash("sha256").update(key + "|" + JSON.stringify(data)).digest("hex")
}

export function issueCapability({ taskId, executionId, gateId, methodId = "", attempt = 1, inputRef = null, parentHash = "GENESIS", workerId = "", modelId = "", toolSet = [], ttlSec = 3600, root = REPO, roadmapId = null } = {}) {
  if (!taskId || !executionId || !gateId) throw new Error("issue requires taskId, executionId, gateId")
  const roadmapKey = roadmapId ? getOrCreateRoadmapKey(roadmapId) : crypto.randomBytes(16).toString("hex")
  const now = new Date().toISOString()
  const cap = {
    taskId, executionId, gateId, methodId, attempt,
    seq: Date.now(),
    parentHash,
    inputRef, outputHash: null,
    workerId, modelId, toolSet: toolSet || [],
    timestamp: now,
    expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(),
    state: "ISSUED",
  }
  cap.secret = signWithKey({ taskId, executionId, gateId, attempt, timestamp: now }, roadmapKey)
  return cap
}
export function completeCapability(cap, { outputRef = null, evidenceRefs = [], root = REPO, roadmapId = null } = {}) {
  const roadmapKey = roadmapId ? getRoadmapKey(roadmapId) : (cap._roadmapKey || "")
  const next = { ...cap, state: "COMPLETED", outputRef, evidenceRefs: evidenceRefs || [] }
  if (roadmapKey) {
    next.secret = signWithKey({ taskId: cap.taskId, executionId: cap.executionId, gateId: cap.gateId, attempt: cap.attempt, state: "COMPLETED", timestamp: new Date().toISOString() }, roadmapKey)
  }
  return next
}
export function validateTransition(cap, { expectGate = null, root = REPO, roadmapId = null } = {}) {
  const errors = []
  if (!cap || typeof cap !== "object") return { ok: false, errors: ["capability is not an object"] }
  if (expectGate && cap.gateId !== expectGate) errors.push(`wrong gate: expected ${expectGate}, got ${cap.gateId}`)
  if (cap.expiresAt && new Date(cap.expiresAt).getTime() < Date.now()) errors.push("EXPIRED capability")
  const roadmapKey = roadmapId ? getRoadmapKey(roadmapId) : ""
  if (roadmapKey && cap.secret) {
    const expected = signWithKey({ taskId: cap.taskId, executionId: cap.executionId, gateId: cap.gateId, attempt: cap.attempt, timestamp: cap.timestamp }, roadmapKey)
    if (cap.secret !== expected) errors.push("INVALID SECRET (tampered or wrong roadmap)")
  }
  return { ok: errors.length === 0, errors }
}
export function validateOrder(caps, expectedPath) {
  const errors = []
  const ids = caps.map((c) => c.gateId)
  for (const g of expectedPath) {
    const count = ids.filter((x) => x === g).length
    if (count === 0) errors.push(`SKIPPED required gate ${g}`)
    if (count > 1) errors.push(`DUPLICATE gate ${g} without new attempt branch`)
  }
  const pos = new Map()
  ids.forEach((g, i) => { if (!pos.has(g)) pos.set(g, i) })
  for (let i = 1; i < expectedPath.length; i++) {
    const a = expectedPath[i - 1], b = expectedPath[i]
    if (pos.has(a) && pos.has(b) && pos.get(a) > pos.get(b)) errors.push(`WRONG ORDER: ${a} executed after ${b}`)
  }
  for (const c of caps) {
    if (c.state === "FAILED") errors.push(`FAILED gate in active branch: ${c.gateId} (supersede with a new attempt, never continue the failed branch)`)
  }
  return { ok: errors.length === 0, errors }
}

export function ledgerAppend(entry, root = REPO, ledgerFile = path.join(REPO, ".ai", "control", "GATE_LEDGER.jsonl")) {
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true })
  let prev = "GENESIS"
  try {
    const lines = fs.readFileSync(ledgerFile, "utf8").trim().split("\n").filter(Boolean)
    if (lines.length) prev = JSON.parse(lines[lines.length - 1]).hash
  } catch { /* new ledger */ }
  const row = { seq: Date.now(), ts: new Date().toISOString(), prevHash: prev, ...entry }
  row.hash = sha256({ ...row, hash: undefined })
  fs.appendFileSync(ledgerFile, JSON.stringify(row) + "\n")
  return row
}
export function ledgerVerify(root = REPO, ledgerFile = path.join(REPO, ".ai", "control", "GATE_LEDGER.jsonl")) {
  let lines = []
  try { lines = fs.readFileSync(ledgerFile, "utf8").trim().split("\n").filter(Boolean) } catch { return { ok: true, rows: 0, errors: [] } }
  const errors = []
  let prev = "GENESIS"
  lines.forEach((ln, i) => {
    let row = null
    try { row = JSON.parse(ln) } catch { errors.push(`row ${i}: unparseable`); return }
    const { hash, ...rest } = row
    if (sha256({ ...rest, hash: undefined }) !== hash) errors.push(`row ${i}: content hash mismatch (tampered)`)
    prev = hash
  })
  return { ok: errors.length === 0, rows: lines.length, errors }
}

export function certify({ taskId, executionId, caps = [], expectedPath = [], evidenceRoot = REPO, key = null } = {}) {
  const failures = []
  if (!taskId || !executionId) failures.push("missing TASK_ID/EXECUTION_ID")
  if (!Array.isArray(expectedPath) || expectedPath.length === 0) {
    failures.push("empty expected path: direct certification without a required gate path is refused")
  }
  const seen = new Set()
  for (const c of caps) {
    if (c.taskId !== taskId) failures.push(`capability from wrong task: ${c.taskId}`)
    if (c.executionId !== executionId) failures.push(`capability from wrong execution: ${c.executionId}`)
    const v = validateTransition(c, { root: evidenceRoot })
    if (!v.ok) failures.push(...v.errors.map((e) => `${c.gateId}: ${e}`))
  }
  const ord = validateOrder(caps.filter((c) => c.state !== "FAILED"), expectedPath)
  if (!ord.ok) failures.push(...ord.errors)
  const cert = {
    taskId, executionId, at: new Date().toISOString(),
    gatesRequired: expectedPath.length, gatesPassed: caps.filter((c) => c.state === "COMPLETED").length,
    status: failures.length === 0 ? "CERTIFIED" : "NOT CERTIFIED",
    failures,
  }
  cert.hash = sha256(cert)
  return cert
}

export function attestGate({ gate, decision, note = "", taskId = "", executionId = "", root = REPO, ledgerFile = path.join(REPO, ".ai", "control", "GATE_LEDGER.jsonl") } = {}) {
  if (!gate || !decision) throw new Error("attest requires gate and decision")
  if (!gateById(loadManifest(root), gate)) throw new Error(`unknown gate: ${gate}`)
  if (!String(note).trim()) throw new Error("attest requires note (no empty approvals)")
  if (!["APPROVE", "REJECT", "WAIVE"].includes(decision)) throw new Error(`decision must be APPROVE|REJECT|WAIVE, got ${decision}`)
  return ledgerAppend({ kind: "leader-attestation", taskId, executionId, gateId: gate, decision, note: String(note).slice(0, 300), workerId: "master" }, root, ledgerFile)
}

const isMain = (() => { try { return path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url) } catch { return false } })()
if (isMain) {
  const args = process.argv.slice(2)
  const cmd = args[0]
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
  const list = (k) => (get(k) || "").split(",").map((s) => s.trim()).filter(Boolean)
  try {
    const manifest = loadManifest()
    if (cmd === "compile") {
      const r = compilePath(manifest, { title: get("--title") || "", files: list("--files"), domains: list("--domain"), risk: get("--risk") || "MEDIUM" })
      console.log(JSON.stringify(r, null, 2))
    } else if (cmd === "issue") {
      const cap = issueCapability({ taskId: get("--task"), executionId: get("--execution"), gateId: get("--gate"), methodId: get("--method") || "", inputRef: get("--input") || null, workerId: get("--worker") || "", modelId: get("--model") || "" })
      fs.mkdirSync(path.join(REPO, ".ai", "control", "capabilities"), { recursive: true })
      const f = path.join(REPO, ".ai", "control", "capabilities", `${cap.executionId}-${cap.gateId}-a${cap.attempt}.json`)
      fs.writeFileSync(f, JSON.stringify(cap, null, 2))
      console.log(JSON.stringify({ cap: f, gateId: cap.gateId }, null, 2))
    } else if (cmd === "transition") {
      const capPath = get("--cap")
      const cap = JSON.parse(fs.readFileSync(capPath, "utf8"))
      const done = completeCapability(cap, { outputRef: get("--output") || null, evidenceRefs: list("--evidence") })
      const v = validateTransition(done, { expectGate: get("--expect") || null })
      if (v.ok) {
        fs.writeFileSync(capPath, JSON.stringify(done, null, 2))
        ledgerAppend({ kind: "gate-transition", taskId: done.taskId, executionId: done.executionId, gateId: done.gateId, attempt: done.attempt, state: done.state, outputHash: done.outputHash })
      }
      console.log(JSON.stringify({ ok: v.ok, errors: v.errors, state: done.state }, null, 2))
      process.exit(v.ok ? 0 : 1)
    } else if (cmd === "certify") {
      const exec = get("--execution")
      const dir = path.join(REPO, ".ai", "control", "capabilities")
      const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith(exec) && f.endsWith(".json")) : []
      const caps = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
      const taskId = get("--task") || (caps[0] && caps[0].taskId)
      const pathIds = (get("--path") || "").split(",").map((s) => s.trim()).filter(Boolean)
      const cert = certify({ taskId, executionId: exec, caps, expectedPath: pathIds })
      console.log(JSON.stringify(cert, null, 2))
      process.exit(cert.status === "CERTIFIED" ? 0 : 1)
    } else if (cmd === "ledger-verify") {
      const r = ledgerVerify()
      console.log(JSON.stringify(r, null, 2))
      process.exit(r.ok ? 0 : 1)
    } else if (cmd === "attest") {
      const row = attestGate({ gate: get("--gate"), decision: get("--decision"), note: get("--note") || "", taskId: get("--task") || "", executionId: get("--execution") || "" })
      console.log(JSON.stringify({ ok: true, hash: row.hash, seq: row.seq }, null, 2))
    } else throw new Error("usage: gates.mjs <compile|issue|transition|certify|ledger-verify|attest> ...")
  } catch (e) { console.error("GATES ERROR:", e.message); process.exit(1) }
}