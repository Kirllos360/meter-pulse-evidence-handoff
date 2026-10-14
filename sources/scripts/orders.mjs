#!/usr/bin/env node
// Meter Pulse — ORDER DESK (leader -> local-agent dispatch, FRESH context per order)
//
// The LEADER (DeepSeek / main AI) issues an ORDER ticket; the LOCAL LLM executes it
// as ONE self-contained prompt. Every run builds a fresh context from the ticket's
// READ files + DO + OUTPUT + RULES — no chat history, so the local model never
// "loses" or "re-generates" session context. The LEADER then verifies the result.
//
// Usage:
//   node scripts/orders.mjs new --id MP-AI-1042 --title "..." --read "a.js,b.js" --do "..." [--output "path"] [--grep "<pattern>"] [--model qwen2.5-coder:14b]
//   node scripts/orders.mjs run MP-AI-1042 [--model qwen2.5-coder:14b] [--free "<prompt>"]
//   node scripts/orders.mjs show MP-AI-1042
//   node scripts/orders.mjs list
//   node scripts/orders.mjs done MP-AI-1042
//   node scripts/orders.mjs reject MP-AI-1042 --reason "..."
// Options: --json
import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"

const CODING = process.env.OLLAMA_HOST || "http://localhost:11434"
const DEFAULT_MODEL = "qwen2.5-coder:14b"
const ORDERS_DIR = path.join(process.cwd(), ".ai", "orders")
const LEDGER = path.join(process.cwd(), ".ai", "workers", "WORK_LEDGER.jsonl")
const MAX_BYTES_PER_FILE = 60000
const SKIP = /[\\/](node_modules|\.git|\.next|coverage|dist|build|mcp|Meter|\.venv|plans|planning|\.playwright-mcp|logs|tmp|reports|screenshots|\.opencode|\.ai|docs|backups|uploads)[\\/]/

function walk(dir, out = []) {
  let e; try { e = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const x of e) {
    const p = path.join(dir, x.name)
    if (SKIP.test(p + path.sep)) continue
    if (x.isDirectory()) walk(p, out); else out.push(p)
  }
  return out
}

// Deterministic grep — returns REAL file:line hits. The local model quotes these
// instead of guessing line numbers (C-001 failure mode). When `files` is given,
// grep is scoped to those exact paths (avoids flooding the cap with other files).
function grep(pattern, files, max = 40) {
  const re = new RegExp(pattern, "i"); const root = process.cwd(); const hits = []
  const targets = files && files.length
    ? files.map((f) => path.resolve(root, f)).filter((f) => { try { return fs.statSync(f).isFile() } catch { return false } })
    : walk(root)
  for (const f of targets) {
    let s; try { s = fs.readFileSync(f, "utf8") } catch { continue }
    s.split("\n").forEach((line, i) => { if (re.test(line)) hits.push(`${f.replace(root + path.sep, "")}:${i + 1}: ${line.trim().slice(0, 160)}`) })
  }
  return hits.slice(0, max).join("\n") || "(no matches)"
}

function ledger(entry) {
  try { fs.mkdirSync(path.dirname(LEDGER), { recursive: true }); fs.appendFileSync(LEDGER, JSON.stringify({ ts: new Date().toISOString(), src: "orders", ...entry }) + "\n") } catch {}
}

function orderPath(id) { return path.join(ORDERS_DIR, `${id}.order.json`) }
function resultPath(id) { return path.join(ORDERS_DIR, `${id}.result.md`) }

function statusOf(id) {
  const op = orderPath(id)
  if (!fs.existsSync(op)) return "MISSING"
  const t = JSON.parse(fs.readFileSync(op, "utf8"))
  if (t.status === "done" || t.status === "rejected") return t.status
  return fs.existsSync(resultPath(id)) ? "RUN" : "OPEN"
}

async function generate(model, prompt) {
  const r = await fetch(`${CODING}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false, options: { num_ctx: 32768 } }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const d = await r.json()
  return { text: d.response || d.error || "(no response)", evalCount: d.eval_count || 0 }
}

const MAX_TOTAL_READ_BYTES = 100000 // ~25k tokens — keeps the prompt inside the 32k ctx

function readForPrompt(readList) {
  let budget = MAX_TOTAL_READ_BYTES
  const parts = []
  for (const f of readList || []) {
    if (budget <= 0) { parts.push(`\n===== ${f} ===== SKIPPED (total prompt budget reached)`); continue }
    try {
      const full = path.resolve(process.cwd(), f)
      const s = fs.readFileSync(full, "utf8")
      const slice = s.length > MAX_BYTES_PER_FILE ? s.slice(0, MAX_BYTES_PER_FILE) + "\n…[FILE TRUNCATED]" : s
      const used = Math.min(budget, slice.length)
      budget -= used
      parts.push(`\n===== ${f} (${s.length}B) =====\n${slice.slice(0, used)}`)
    } catch (e) {
      parts.push(`\n===== ${f} ===== NOT FOUND: ${e.message}`)
    }
  }
  return parts.join("")
}

function buildPrompt(t, freePrompt) {
  if (freePrompt) return freePrompt
  return [
    "You are the LOCAL AGENT. Execute this work order EXACTLY. This is a fresh, self-contained context.",
    `TASK: ${t.title}`,
    t.grep ? `GROUND-TRUTH HITS (REAL file:line \u2014 quote ONLY these, NEVER invent a line number):\n${grep(t.grep, t.read)}` : null,
    `READ (real file content follows):${readForPrompt(t.read)}`,
    `DO: ${t.do}`,
    `OUTPUT: ${t.output || "(return concise answer)"}`,
    "RULES:",
    "  - quote file:line for every fact; do NOT paraphrase",
    "  - use ONLY the GROUND-TRUTH HITS above for any file:line reference; if a hit is absent, write NOT FOUND",
    "  - NEVER invent a line number",
    "  - if a file/line is not found, write exactly: NOT FOUND",
    "  - do NOT invent; do NOT summarize beyond what you read",
    "  - if unsure, write UNKNOWN",
    "  - do NOT call tools; do NOT emit JSON tool-calls; answer in plain text",
  ].filter(Boolean).join("\n")
}

function parseArgs(args) {
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
  const has = (k) => args.includes(k)
  return {
    id: get("--id"), title: get("--title"), read: (get("--read") || "").split(",").map((s) => s.trim()).filter(Boolean),
    do: get("--do"), output: get("--output"), model: get("--model") || DEFAULT_MODEL, grep: get("--grep"),
    reason: get("--reason"), free: get("--free"), json: has("--json"),
  }
}

;(async () => {
  const args = process.argv.slice(2)
  const cmd = args[0]
  if (!cmd) { console.error("usage: node scripts/orders.mjs <new|run|show|list|done|reject> ..."); process.exit(1) }
  try {
    fs.mkdirSync(ORDERS_DIR, { recursive: true })
    if (cmd === "new") {
      const o = parseArgs(args)
      if (!o.id || !o.title || !o.do) throw new Error("new requires --id --title --do")
      if (fs.existsSync(orderPath(o.id)) && !args.includes("--force")) {
        throw new Error(`order ${o.id} already exists; pass --force to overwrite (refusing silent overwrite)`)
      }
      const ticket = { id: o.id, title: o.title, read: o.read, do: o.do, output: o.output || null, grep: o.grep || null, model: o.model, status: "open", createdAt: new Date().toISOString() }
      fs.writeFileSync(orderPath(o.id), JSON.stringify(ticket, null, 2))
      ledger({ cmd: "new", id: o.id, title: o.title, read: o.read })
      console.log(JSON.stringify({ ok: true, id: o.id, ticket: orderPath(o.id), status: "open" }, null, 2))
    } else if (cmd === "run") {
      const id = args[1]
      if (!id) throw new Error("run requires <orderId>")
      const op = orderPath(id)
      if (!fs.existsSync(op)) throw new Error(`order not found: ${id}`)
      const o = parseArgs(args)
      const t = JSON.parse(fs.readFileSync(op, "utf8"))
      t.status = "running"; t.startedAt = new Date().toISOString(); t.model = o.model
      fs.writeFileSync(op, JSON.stringify(t, null, 2))
      // GPU RESERVATION REQUIRED: no local model may run outside the GPU controller (MAX_GPU=1).
      try {
        const lock = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".ai", "control", "GPU_LOCK.json"), "utf8"))
        if (!lock || !lock.lockId) throw new Error("no reservation")
      } catch {
        console.error("ORDER REFUSED: GPU RESERVATION REQUIRED - reserve via scripts/gpu-controller.mjs first")
        process.exit(2)
      }
      const prompt = buildPrompt(t, o.free)
      const t0 = Date.now()
      const { text, evalCount } = await generate(o.model, prompt)
      const ms = Date.now() - t0
      const out = `# ORDER ${id} — RESULT\n\n**title:** ${t.title}\n**model:** ${o.model}\n**duration:** ${ms}ms\n**tokens:** ${evalCount}\n\n---\n\n${text}\n`
      fs.writeFileSync(resultPath(id), out)
      // ARM VALIDATOR gate: reject malformed diffs BEFORE any implementation.
      // LLM output must never reach blind-apply. (L-PORTAL-04)
      let validation = null
      try {
        const vr = spawnSync(process.execPath, ["scripts/arm-validator.mjs", id], { encoding: "utf8" })
        validation = { ok: vr.status === 0, code: vr.status, report: (vr.stdout || "").trim().slice(0, 800), at: new Date().toISOString() }
      } catch (e) { validation = { ok: false, error: e.message } }
      t.status = "run"; t.finishedAt = new Date().toISOString(); t.ms = ms; t.tokens = evalCount
      t.validation = validation
      if (validation && validation.ok === false) t.applicable = false
      fs.writeFileSync(op, JSON.stringify(t, null, 2))
      ledger({ cmd: "run", id, model: o.model, ms, tokens: evalCount, bytes: out.length, armValid: validation?.ok === true })
      console.log(out)
      console.log(`\n[ARM-VALIDATOR] ok=${validation?.ok} ${validation?.ok ? "" : "<< REJECTED: output must NOT be blind-applied >>"}`)
    } else if (cmd === "show") {
      const id = args[1]
      if (!id) throw new Error("show requires <orderId>")
      const op = orderPath(id)
      if (!fs.existsSync(op)) throw new Error(`order not found: ${id}`)
      const t = JSON.parse(fs.readFileSync(op, "utf8"))
      console.log(JSON.stringify({ ...t, status: statusOf(id), resultPath: fs.existsSync(resultPath(id)) ? resultPath(id) : null }, null, 2))
    } else if (cmd === "list") {
      const rows = fs.readdirSync(ORDERS_DIR).filter((f) => f.endsWith(".order.json")).map((f) => {
        const t = JSON.parse(fs.readFileSync(path.join(ORDERS_DIR, f), "utf8"))
        return { id: t.id, status: statusOf(t.id), title: t.title, model: t.model, updated: t.finishedAt || t.createdAt }
      })
      console.log(JSON.stringify(rows, null, 2))
    } else if (cmd === "done" || cmd === "reject") {
      const id = args[1]
      if (!id) throw new Error(`${cmd} requires <orderId>`)
      const op = orderPath(id)
      if (!fs.existsSync(op)) throw new Error(`order not found: ${id}`)
      const o = parseArgs(args)
      const t = JSON.parse(fs.readFileSync(op, "utf8"))
      t.status = cmd === "done" ? "done" : "rejected"
      t.verdictAt = new Date().toISOString()
      if (o.reason) t.reason = o.reason
      fs.writeFileSync(op, JSON.stringify(t, null, 2))
      ledger({ cmd, id, reason: o.reason || null })
      console.log(JSON.stringify({ ok: true, id, status: t.status }, null, 2))
    } else {
      throw new Error(`unknown command: ${cmd}`)
    }
  } catch (e) { ledger({ cmd, error: e.message }); console.error("ORDER DESK ERROR:", e.message); process.exit(1) }
})()