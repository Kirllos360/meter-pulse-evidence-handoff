#!/usr/bin/env node
// Meter Pulse — CONTEXT MANIFEST + BUDGET GOVERNOR (progressive disclosure)
//
// Every task gets a manifest recording WHAT was loaded, WHY, and what was
// deliberately deferred/cached — so no session must dump the constitution,
// and no mandatory governance can silently vanish. Budget overflow BLOCKS
// (fail-closed) instead of silently discarding.
//
// Manifest item: {id, source, hash, bytes, authority, reason, status, loadedAt}
//   authority: mandatory | required | optional
//   status: loaded | deferred | cached | historical
// Import-safe (CLI guard); tested in backend/tests/unit/context.test.mjs.
import fs from "fs"
import path from "path"
import crypto from "crypto"
import { fileURLToPath } from "url"

export const DEFAULT_BUDGET = 100 * 1024; // 100KB per task context

export function sha256text(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex")
}
export function newManifest(taskId, budgetBytes = DEFAULT_BUDGET) {
  return { taskId, createdAt: new Date().toISOString(), budgetBytes, items: [] }
}
export function manifestTotals(m) {
  const loaded = m.items.filter((i) => i.status === "loaded");
  return {
    items: m.items.length,
    loadedBytes: loaded.reduce((s, i) => s + (i.bytes || 0), 0),
    deferred: m.items.filter((i) => i.status === "deferred").length,
    cached: m.items.filter((i) => i.status === "cached").length,
    mandatory: m.items.filter((i) => i.authority === "mandatory").length,
  };
}
// Add an item. Returns {added, reason}. NEVER silently drops mandatory items:
// over-budget mandatory load is an explicit BLOCK, not a truncation.
export function addItem(m, item) {
  if (!item || !item.source) return { added: false, reason: "missing source" };
  // Identity is content bytes: identical content adds no information,
  // regardless of which path it came from.
  const hash = item.hash || sha256text(item.content || "");
  if (m.items.some((i) => i.hash === hash)) return { added: false, reason: "duplicate (hash already manifested)" };
  const bytes = item.bytes ?? Buffer.byteLength(item.content || "", "utf8");
  const t = manifestTotals(m);
  if (t.loadedBytes + bytes > m.budgetBytes && item.status !== "deferred" && item.status !== "historical") {
    if (item.authority === "mandatory") {
      return { added: false, reason: "BLOCKED: mandatory item exceeds remaining budget — raise budget explicitly, never drop mandatory governance" };
    }
    return { added: false, reason: "budget-exceeded: defer explicitly or raise budget" };
  }
  m.items.push({
    id: item.id || path.basename(String(item.source)),
    source: item.source, hash, bytes,
    authority: item.authority || "optional",
    reason: item.reason || "",
    status: item.status || "loaded",
    loadedAt: new Date().toISOString(),
  });
  return { added: true, reason: "ok" };
}
export function summarizeManifest(m, maxItems = 40) {
  const t = manifestTotals(m);
  const lines = [`task=${m.taskId} budget=${t.loadedBytes}/${m.budgetBytes}B items=${t.items} deferred=${t.deferred} cached=${t.cached} mandatory=${t.mandatory}`];
  for (const i of m.items.slice(0, maxItems)) {
    lines.push(`- [${i.status}/${i.authority}] ${i.source} (${i.bytes}B) :: ${i.reason} :: ${i.hash.slice(0, 12)}`);
  }
  if (m.items.length > maxItems) lines.push(`… ${m.items.length - maxItems} more items (see manifest file)`);
  return lines.join("\n");
}
export function manifestPath(root, taskId) {
  return path.join(root, ".ai", "context", `${taskId}.manifest.json`);
}
export function saveManifest(root, m) {
  const f = manifestPath(root, m.taskId);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(m, null, 2));
  return f;
}
export function loadManifestFile(root, taskId) {
  const f = manifestPath(root, taskId);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

const isMain = (() => { try { return path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url) } catch { return false } })();
if (isMain) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const root = process.cwd();
  try {
    if (cmd === "init") {
      const task = get("--task");
      if (!task) throw new Error("init requires --task");
      const m = newManifest(task, Number(get("--budget") || DEFAULT_BUDGET));
      console.log(saveManifest(root, m));
    } else if (cmd === "add") {
      const task = get("--task");
      const file = get("--file");
      if (!task || !file) throw new Error("add requires --task --file");
      let m = loadManifestFile(root, task) || newManifest(task);
      const abs = path.resolve(root, file);
      if (!fs.existsSync(abs)) throw new Error(`file not found: ${file}`);
      const content = fs.readFileSync(abs, "utf8");
      const r = addItem(m, { source: file, content, authority: get("--authority") || "optional", reason: get("--reason") || "", status: get("--status") || "loaded" });
      if (!r.added) { console.error(`BLOCKED: ${r.reason}`); process.exit(2); }
      saveManifest(root, m);
      console.log(JSON.stringify({ ok: true, totals: manifestTotals(m) }));
    } else if (cmd === "show") {
      const task = get("--task");
      if (!task) throw new Error("show requires --task");
      const m = loadManifestFile(root, task);
      if (!m) throw new Error(`no manifest for ${task}`);
      console.log(summarizeManifest(m));
    } else throw new Error("usage: context.mjs <init|add|show> --task T [--file F ...]");
  } catch (e) { console.error("CONTEXT ERROR:", e.message); process.exit(1); }
}
