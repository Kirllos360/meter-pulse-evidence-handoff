// Phase 5 — route selector (adapter). Grounded in the Framework's own registries.
// Reads: .ai/registry/MODES.json, .ai/registry/CLOUD_LOCAL_ROUTING.json
// Behavior: returns a DECISION object ONLY. Never executes. DISABLED unless flag is on.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FLAGS } from "./provider_policy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REG = path.resolve(__dirname, "..", "..", "registry");

const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

export function loadFrameworkRouting() {
  return {
    modes: readJSON(path.join(REG, "MODES.json")),
    cloudLocal: readJSON(path.join(REG, "CLOUD_LOCAL_ROUTING.json")),
  };
}

// task kind -> Framework mode (from MODES.routing_rules), first match wins
function modeFor(taskKind, modes) {
  const rules = modes.routing_rules || {};
  return rules[taskKind] || "ALL_AGENT";
}

export function selectRoute({ taskId, taskKind, needs = {} }) {
  if (!FLAGS.routing_adapter) {
    return { status: "DISABLED", taskId: taskId ?? null, reason: "routing_adapter flag is off" };
  }
  const { modes, cloudLocal } = loadFrameworkRouting();
  const mode = modeFor(taskKind, modes);
  const modeDef = modes.modes[mode];
  let path_ = modeDef?.routing?.default === "API" ? "API" : "LOCAL";
  // HYBRID only when explicitly declared by subtasks
  if (Array.isArray(needs.subtasks) && needs.subtasks.length > 1 &&
      new Set(needs.subtasks.map((s) => s.path)).size > 1) {
    path_ = "HYBRID";
  }
  return {
    status: "OK",
    taskId: taskId ?? null,
    mode,
    path: path_,
    escalation: modes.escalation ?? { max_local_attempts: 3, after_max_attempts: "API" },
    reason: `Framework mode=${mode} default=${modeDef?.routing?.default}`,
    cloudLocalRef: cloudLocal.model_set?.models ?? [],
  };
}
