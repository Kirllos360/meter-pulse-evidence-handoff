import fs from "fs"
import path from "path"

const ROOT = "E:/meter"
const OUT = `${ROOT}/.ai/evidence/toolcall`
fs.mkdirSync(OUT, { recursive: true })
const AUDIT = `${OUT}/bridge-audit.jsonl`

// ---- args
const argv = process.argv.slice(2)
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
const AGENT = arg("--agent", "local-agent")
const MODEL = arg("--model", "qwen3-coder:30b")
let TASK = arg("--task", "Read E:/meter/.ai/registry/AGENT_REGISTRY.json and report the array length of 'present'.")
const MAX_STEPS = Number(arg("--steps", "4"))
const OUT_FILE = arg("--out", null)
const CTX_FILE = arg("--context", null)
const ALLOW_ROOTS = argv.map((v, i) => v === "--allow-root" ? argv[i + 1] : null).filter(Boolean).map(p => path.resolve(p).toLowerCase())
if (CTX_FILE && fs.existsSync(CTX_FILE)) TASK = `CONTEXT ARTIFACT (${CTX_FILE}):\n${fs.readFileSync(CTX_FILE, "utf8").slice(0, 3000)}\n\nTASK: ${TASK}`

// ---- controlled tool registry (allowlist, workspace-constrained, no arbitrary shell)
const insideWorkspace = (p) => { const abs = path.resolve(p).toLowerCase(); if (abs.startsWith(path.resolve(ROOT).toLowerCase())) return true; return ALLOW_ROOTS.some(r => abs.startsWith(r)) }
const TOOLS = {
  read_file: { desc: "Read a text file inside the project.", args: ["path"], run: ({ path: p }) => { if (!insideWorkspace(p)) throw new Error("PATH_TRAVERSAL_BLOCKED"); return fs.readFileSync(p, "utf8").slice(0, 6000) } },
  list_dir: { desc: "List entries of a directory inside the project.", args: ["path"], run: ({ path: p }) => { if (!insideWorkspace(p)) throw new Error("PATH_TRAVERSAL_BLOCKED"); return fs.readdirSync(p).join("\n") } },
  grep_count: { desc: "Count occurrences of a literal string in a file inside the project.", args: ["path", "needle"], run: ({ path: p, needle }) => { if (!insideWorkspace(p)) throw new Error("PATH_TRAVERSAL_BLOCKED"); const t = fs.readFileSync(p, "utf8"); return String(t.split(needle).length - 1) } },
}

const localChat = async (messages) => {
  const t0 = Date.now()
  const r = await fetch("http://localhost:11434/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, messages, temperature: 0.1, stream: false }) })
  const d = await r.json()
  return { content: d.choices?.[0]?.message?.content ?? "", ms: Date.now() - t0, error: d.error || null }
}
const tryParse = (s) => { try { const o = JSON.parse(s); const tool = o.tool || o.name; if (!tool) return null; return { tool, args: o.arguments || o.args || {} } } catch { return null } }
const parseIntent = (text) => {
  for (const line of text.split("\n")) { const o = tryParse(line.trim()); if (o) return o }
  const start = text.indexOf("{"); if (start < 0) return null
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false }
    else { if (c === '"') inStr = true; else if (c === "{") depth++; else if (c === "}") { depth--; if (depth === 0) { const o = tryParse(text.slice(start, i + 1)); if (o) return o } } }
  }
  return null
}
const audit = (o) => fs.appendFileSync(AUDIT, JSON.stringify({ ts: new Date().toISOString(), agent: AGENT, model: MODEL, ...o }) + "\n")

const SYS = `You are a LOCAL tool-using agent. You may call ONE tool at a time by replying with ONLY a JSON object on a single line:
{"tool":"<name>","args":{...}}
Available tools:
${Object.entries(TOOLS).map(([k, v]) => `- ${k}(${v.args.join(", ")}): ${v.desc}`).join("\n")}
After you receive a RESULT, either call another tool or give your FINAL ANSWER as plain text beginning with "FINAL:".
Never use any tool not listed. Never output shell commands.`

const messages = [{ role: "system", content: SYS }, { role: "user", content: TASK }]
const trace = [{ ts: new Date().toISOString(), agent: AGENT, model: MODEL, task: TASK, steps: [] }]
let final = null
for (let i = 0; i < MAX_STEPS; i++) {
  const r = await localChat(messages)
  audit({ step: i, kind: "model", latency_ms: r.ms, raw: r.content.slice(0, 400) })
  messages.push({ role: "assistant", content: r.content })
  const intent = parseIntent(r.content)
  if (intent && intent.tool) {
    const spec = TOOLS[intent.tool]
    if (!spec) { messages.push({ role: "user", content: `RESULT: ERROR unknown tool '${intent.tool}'` }); audit({ step: i, kind: "tool", tool: intent.tool, executed: false, error: "UNKNOWN_TOOL" }); trace[0].steps.push({ step: i, tool: intent.tool, executed: false, error: "UNKNOWN_TOOL" }); continue }
    let result, executed = true, err = null
    try { result = String(spec.run(intent.args || {})) } catch (e) { result = `ERROR ${e.message}`; executed = false; err = e.message }
    audit({ step: i, kind: "tool", tool: intent.tool, args: intent.args, executed, error: err })
    trace[0].steps.push({ step: i, tool: intent.tool, args: intent.args, executed, error: err, result_preview: result.slice(0, 200) })
    messages.push({ role: "user", content: `RESULT: ${result}` })
    continue
  }
  final = (r.content.match(/FINAL:\s*([\s\S]*)/)?.[1] || r.content).trim()
  break
}
const out = { ...trace[0], final, steps: trace[0].steps }
if (OUT_FILE) { fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true }); fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2)) }
fs.writeFileSync(`${OUT}/bridge-run-${Date.now()}.json`, JSON.stringify(out, null, 2))
console.log("AGENT:", AGENT, "| MODEL:", MODEL)
console.log("TASK:", TASK)
for (const s of out.steps) console.log(`  step ${s.step}: ${s.tool} executed=${s.executed} -> ${JSON.stringify(s.result_preview).slice(0, 90)}`)
console.log("FINAL:", final)
