#!/usr/bin/env node
// Meter Pulse — FRAMEWORK GATEWAY (OpenCode-selectable Framework entry)
//
// A minimal OpenAI-compatible HTTP provider that makes "Framework" a genuine,
// selectable model in OpenCode Desktop (provider discovery = same `opencode
// models` mechanism the selector uses). It is NOT a decorative alias: every
// chat request runs the real Framework pipeline (mission intake -> package ->
// LAOS order -> GPU-reserved local-arm dispatch -> gated result).
//
// Safety rails: only read-only analysis missions auto-execute. Anything that
// would mutate the repo pauses at the leader gate with an explicit package.
// Binds 127.0.0.1 only. No auth (localhost, same trust model as Ollama).
//
//   node scripts/framework-gateway.mjs [--port 3199]
// Backend unit tests import the pure parts; the HTTP surface is covered by
// live protocol tests in backend/tests/unit/framework-gateway.test.mjs.
import http from "http"
import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"
import { fileURLToPath } from "url"
import { classifyIntent, buildExecutionPackage, routeSkillsMcps } from "./mission.mjs"
import { loadManifest } from "./gates.mjs"
import { readPhaseTasks, readSequences, nextAuthorizedWork } from "./enforce.mjs"
import { reserveGpu, releaseGpu, recordGpu } from "./enforce.mjs"
import { newManifest, addItem, manifestTotals, saveManifest } from "./context.mjs"
import { createLocalExecutionCapsule, compressCapsule, verifyCriticalFields } from "./context-bridge.mjs"

// Live-path context bounds: the gateway response feeds a cloud session, so
// both the outbound prompt context and the inbound result are capped. Overrun
// BLOCKS with an explicit overflow report — never silent truncation.
export const MISSION_CONTEXT_BUDGET = 32 * 1024
export const PROMPT_CAP = 12 * 1024
export const RESPONSE_CAP = 6 * 1024

export const GATEWAY_MODEL_ID = "meter-pulse-framework"
export const GATEWAY_MODEL_NAME = "Framework — LAOS"
const MAX_BODY = 256 * 1024
const MAX_TEXT = 8000
const OLLAMA = process.env.OLLAMA_HOST || "http://localhost:11434"
const DEFAULT_ARM = "qwen2.5vl:7b"

const READONLY_HINTS = ["status", "checkpoint", "list", "review", "explain", "summariz", "summarise", "check", "report", "what is", "show", "describe"]
const MUTATING_HINTS = ["build", "implement", "fix", "delete", "remove", "create", "update", "deploy", "migrate", "commit", "push", "write", "edit", "refactor"]
export function isReadOnlyMission(text) {
  const t = String(text || "").toLowerCase()
  if (MUTATING_HINTS.some((k) => new RegExp(`\\b${k}\\b`).test(t))) return false
  return READONLY_HINTS.some((k) => t.includes(k))
}

function orderNew({ id, title, read, taskDo, model }) {
  const r = spawnSync("node", [path.join(SCRIPT_DIR, "orders.mjs"), "new", "--id", id, "--title", title, "--read", read || "", "--do", taskDo, "--model", model || DEFAULT_ARM], { encoding: "utf8" })
  if (r.status !== 0) throw new Error(`order creation failed: ${(r.stderr || "").slice(0, 200)}`)
  return JSON.parse(r.stdout).id
}

async function defaultDispatchArm({ model, prompt, taskLabel, timeoutMs = 300000 }) {
  const lock = reserveGpu(model, taskLabel, 180)
  const t0 = Date.now()
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    let r
    try {
      r = await fetch(`${OLLAMA}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, prompt, stream: false }), signal: ctrl.signal })
    } finally { clearTimeout(timer) }
    if (!r.ok) throw new Error(`arm HTTP ${r.status}`)
    const d = await r.json()
    recordGpu({ model, task: taskLabel, ms: Date.now() - t0, tokens: d.eval_count || 0, status: "ok" })
    return { text: d.response || "(no response)", tokens: d.eval_count || 0, ms: Date.now() - t0 }
  } catch (e) {
    recordGpu({ model, task: taskLabel, ms: Date.now() - t0, tokens: 0, status: "fail", notes: String(e.message || e).slice(0, 160) })
    throw e
  } finally {
    releaseGpu(lock.lockId)
  }
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..')

function resolveRoot(start) {
  let dir = path.resolve(start || PROJECT_ROOT)
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, ".ai", "governance", "GATE_MANIFEST.json"))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return PROJECT_ROOT
}

// ─── mission pipeline (pure orchestration; model I/O injectable for tests) ───
export async function runMission(userText, { root = null, tasks = null, manifest = null, dispatchArm = defaultDispatchArm, armModel = DEFAULT_ARM, createOrder = orderNew, budgetBytes = MISSION_CONTEXT_BUDGET, promptCap = PROMPT_CAP, responseCap = RESPONSE_CAP } = {}) {
  const r = root || resolveRoot()
  const text = String(userText || "").slice(0, MAX_TEXT)
  if (!text.trim()) throw Object.assign(new Error("empty message"), { code: 400 })
  const planTasks = tasks || readPhaseTasks(r)
  const cls = classifyIntent(text, planTasks)
  const man = manifest || loadManifest(r)
  const routed = routeSkillsMcps([])
  const pkg = buildExecutionPackage({
    taskId: `FW-${Date.now().toString(36).toUpperCase()}`, title: text.slice(0, 120),
    kind: cls.kind, match: cls.match, manifest: man,
    domains: [], risk: "LOW", skills: routed.skills, mcps: routed.mcps,
  })
  // LIVE-PATH CONTEXT GOVERNOR: every mission gets a manifest; the outbound
  // prompt context is budgeted and the inbound result is capped with spillover
  // to an evidence file. Overrun BLOCKS explicitly — never silent truncation.
  const ctxManifest = newManifest(pkg.taskId, budgetBytes)
  let ctx = ""
  try {
    const cp = JSON.parse(fs.readFileSync(path.join(r, ".ai", "control", "CHECKPOINT.json"), "utf8"))
    ctx = `CHECKPOINT task_id=${cp.task_id} phase=${cp.current_phase} certification=${cp.certification_status} next_action=${cp.next_action} timestamp=${cp.timestamp}`
  } catch { ctx = "checkpoint unreadable" }
  const capsule = createLocalExecutionCapsule({
    taskId: pkg.taskId,
    missionId: pkg.missionId,
    mode: pkg.mode || 'ALL_AGENT',
    lifecycleMethod: pkg.lifecycleMethod || 'EXECUTE',
    objective: text.slice(0, 500),
    expectedResult: pkg.expectedResult || 'Task completed with evidence',
    constraints: pkg.constraints || ['No execution authority', 'Framework governance required'],
    selectedResources: pkg.selectedResources || { arms: ['coding'], llms: ['qwen2.5-coder:7b'], mcps: ['serena'], tools: ['bash', 'file'], skills: [] },
    knownFailures: pkg.knownFailures || [],
    relevantLessons: pkg.relevantLessons || [],
    nextAction: 'Execute task with evidence collection'
  })

  const compressedCapsule = compressCapsule(capsule, 12000)
  const criticalCheck = verifyCriticalFields(compressedCapsule)

  const draftPrompt = `You are a Meter Pulse local analysis arm. Use ONLY the context below plus the task. Be concise (3-6 sentences).\nCONTEXT: ${ctx}\nGATES: ${pkg.gatePath.length} compiled (${pkg.gatePath.slice(0, 8).join(",")}...)\nCAPSULE: ${JSON.stringify(compressedCapsule).slice(0, 2000)}\nTASK: ${text.slice(0, 1500)}\nRULES: answer in plain text; ground every claim in the context above; write UNKNOWN only for facts absent from the context.`
  const addCp = addItem(ctxManifest, { source: ".ai/control/CHECKPOINT.json", content: ctx, authority: "required", reason: "live continuity state for grounding" })
  const addPr = addItem(ctxManifest, { source: "mission-prompt", content: draftPrompt, authority: "required", reason: "bounded arm prompt" })
  for (const a of [addCp, addPr]) {
    if (!a.added) {
      return { mode: "BLOCKED_OVERFLOW", package: pkg, orderId: null, manifest: saveManifest(r, ctxManifest), message: `Context budget exceeded (${a.reason}). Mission blocked, nothing dispatched. Raise the budget explicitly or narrow the request.` }
    }
  }
  const prompt = draftPrompt.length > promptCap
    ? draftPrompt.slice(0, promptCap) + "\n[PROMPT TRUNCATED AT CAP — see manifest]"
    : draftPrompt
  saveManifest(r, ctxManifest)
  if (!isReadOnlyMission(text)) {
    const orderId = createOrder({ id: `${pkg.taskId}-INTAKE`, title: `Framework intake: ${pkg.title}`, read: "", taskDo: `Evaluate this request under the canonical 13-method lifecycle: ${text.slice(0, 500)}`, model: armModel })
    return { mode: "PAUSED_AT_LEADER_GATE", package: pkg, orderId, manifest: manifestPathOf(r, pkg.taskId), message: `Mutation-class request held at the leader gate. Governed order ${orderId} created; package compiled with ${pkg.gatePath.length} gates. A leader must approve execution.` }
  }
  const orderId = createOrder({ id: `${pkg.taskId}-DISCOVER`, title: `Framework mission: ${pkg.title}`, read: ".ai/control/CHECKPOINT.json,.ai/governance/GATE_MANIFEST.json", taskDo: `Answer ONLY from the provided context. Task: ${text.slice(0, 800)}`, model: armModel })
  const arm = await dispatchArm({ model: armModel, taskLabel: orderId, prompt })
  let message = arm.text
  let spillover = null
  if (message.length > responseCap) {
    spillover = `.ai/missions/${pkg.taskId}/arm-result.md`
    fs.mkdirSync(path.join(r, ".ai", "missions", pkg.taskId), { recursive: true })
    fs.writeFileSync(path.join(r, spillover), `# ARM RESULT (full, spilled over cap)\n\ntask: ${pkg.taskId}\norder: ${orderId}\nmodel: ${armModel}\n\n${message}`)
    message = message.slice(0, responseCap) + `\n[RESULT TRUNCATED AT ${responseCap} CHARS — full text in ${spillover}]`
  }
  return { mode: "EXECUTED", package: pkg, orderId, manifest: manifestPathOf(r, pkg.taskId), spillover, arm: { model: armModel, tokens: arm.tokens, ms: arm.ms }, message }
}
function manifestPathOf(r, taskId) {
  return `.ai/context/${taskId}.manifest.json`
}

function openAiError(message, code = 400) {
  return { status: code, body: { error: { message, type: "invalid_request_error" } } }
}

export function handleRequest(method, urlPath, bodyText) {
  if (method === "GET" && urlPath === "/v1/models") {
    return { status: 200, body: { object: "list", data: [{ id: GATEWAY_MODEL_ID, object: "model", created: 0, owned_by: "meter-pulse", displayName: GATEWAY_MODEL_NAME }] } }
  }
  if (method === "POST" && urlPath === "/v1/chat/completions") {
    let body = null
    try { body = JSON.parse(bodyText || "{}") } catch { return openAiError("malformed JSON body") }
    if (body.model !== GATEWAY_MODEL_ID) return openAiError(`unknown model '${body.model || ""}': this provider serves only '${GATEWAY_MODEL_ID}'`, 404)
    const msgs = Array.isArray(body.messages) ? body.messages : []
    const lastUser = [...msgs].reverse().find((m) => m && m.role === "user" && typeof m.content === "string")
    if (!lastUser) return openAiError("no user message found")
    return { status: 202, deferred: { text: lastUser.content, stream: body.stream === true } }
  }
  return openAiError("not found", 404)
}

export function toCompletion(id, model, content) {
  return { id, object: "chat.completion", created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }
}
export function toSseChunks(id, model, content) {
  const chunks = []
  for (let i = 0; i < content.length; i += 600) {
    chunks.push(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta: { content: content.slice(i, i + 600) }, finish_reason: null }] })}\n\n`)
  }
  chunks.push(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`)
  chunks.push("data: [DONE]\n\n")
  return chunks.join("")
}

export function createServer({ port = 3199 } = {}) {
  const server = http.createServer((req, res) => {
    const urlPath = (req.url || "").split("?")[0]
    if ((req.method === "GET" && urlPath === "/v1/models") || (req.method === "POST" && urlPath === "/v1/chat/completions")) {
      if (req.method === "GET") {
        const r = handleRequest("GET", urlPath, "")
        res.writeHead(r.status, { "Content-Type": "application/json" })
        res.end(JSON.stringify(r.body))
        return
      }
      let size = 0
      const chunks = []
      req.on("data", (c) => { size += c.length; chunks.push(c); if (size > MAX_BODY) { res.writeHead(413, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: { message: "body too large" } })); req.destroy() } })
      req.on("end", async () => {
        const routed = handleRequest("POST", urlPath, Buffer.concat(chunks).toString("utf8"))
        if (routed.status !== 202) {
          res.writeHead(routed.status, { "Content-Type": "application/json" })
          res.end(JSON.stringify(routed.body))
          return
        }
        const id = `fw-${Date.now().toString(36)}`
        try {
          const result = await runMission(routed.deferred.text)
          const content = `${result.message}\n\n[Framework package ${result.package.taskId} (${result.mode}) | order ${result.orderId} | gates: ${result.package.gatePath.length}]`;
          if (routed.deferred.stream) {
            res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" })
            res.end(toSseChunks(id, GATEWAY_MODEL_ID, content))
          } else {
            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(JSON.stringify(toCompletion(id, GATEWAY_MODEL_ID, content)))
          }
        } catch (e) {
          const code = e.code === 400 ? 400 : 500
          res.writeHead(code, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: { message: String(e.message || e).slice(0, 300) } }))
        }
      })
      return
    }
    res.writeHead(404, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: { message: "not found" } }))
  })
  return server
}

const isMain = (() => { try { return path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url) } catch { return false } })()
if (isMain) {
  const port = Number(process.argv[process.argv.indexOf("--port") + 1] || 3199)
  const server = createServer({ port })
  server.listen(port, "127.0.0.1", () => console.log(`Framework gateway listening on 127.0.0.1:${port} (model: ${GATEWAY_MODEL_ID})`))
}
