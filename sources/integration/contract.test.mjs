// Phase 5 — automated contract tests. Pure assertions; no Framework mutation.
// Run: node E:/meter/.ai/control/integration/contract.test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { FLAGS, PROVIDER_POLICY, isDenied, assertProviderAllowed } from "./provider_policy.mjs";
import { loadAgentRegistry, validateAgentRegistry } from "./role_contracts.mjs";
import { selectRoute } from "./route_selector.mjs";
import { validateWorkerPrompt } from "./prompt_contract.mjs";
import { usableBudget, enforceBudget, shouldReferenceOnly } from "./context_budget.mjs";
import { newAttemptLog, recordAttempt, sameHypothesisRepeated, MAX_ATTEMPTS } from "./retry_policy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (e) { fail++; console.log(`  FAIL  ${name} -> ${e.message}`); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || "eq"}: ${a} !== ${b}`); };
const ok = (c, m) => { if (!c) throw new Error(m || "expected true"); };
const throws = (fn, m) => { let threw = false; try { fn(); } catch { threw = true; } if (!threw) throw new Error(m || "expected throw"); };

console.log("Phase 5 contract tests");

t("feature flags exist and are all OFF by default", () => {
  const names = Object.keys(FLAGS);
  ok(names.length >= 5, "expected >=5 flags");
  for (const [k, v] of Object.entries(FLAGS)) eq(v, false, `flag ${k} must be false`);
});

t("provider policy: promptwizard denied, ollama allowed, unknown rejected", () => {
  ok(isDenied("promptwizard"), "promptwizard must be denied");
  ok(assertProviderAllowed("ollama").kind === "local", "ollama allowed");
  throws(() => assertProviderAllowed("promptwizard"), "denied provider must throw");
  throws(() => assertProviderAllowed("some-cloud"), "unknown provider must throw");
});

t("live AGENT_REGISTRY.json satisfies role contract schema", () => {
  const reg = loadAgentRegistry();
  const results = validateAgentRegistry(reg);
  const bad = Object.entries(results).filter(([, r]) => !r.ok);
  eq(bad.length, 0, `invalid roles: ${bad.map((b) => b[0]).join(",")}`);
});

t("route selector is DISABLED while flag off (no silent routing)", () => {
  const d = selectRoute({ taskId: "demo-1", taskKind: "coding" });
  eq(d.status, "DISABLED");
});

t("worker prompt contract accepts a complete prompt and rejects gaps", () => {
  const good = {
    task_id: "MP-001", role: "@coding", required_capabilities: ["code-generation"],
    permitted_tools: ["read_file", "list_dir"], input_files: ["E:/meter/src/a.ts"],
    expected_artifacts: ["E:/meter/out/diff.patch"], validation_commands: ["node --test"],
    context_budget_tokens: 20000, checkpoint: "after-plan", stop_conditions: ["3 failed attempts"],
  };
  eq(validateWorkerPrompt(good).ok, true);
  const missing = { ...good }; delete missing.expected_artifacts;
  eq(validateWorkerPrompt(missing).ok, false);
  const bad = { ...good, context_budget_tokens: 0 };
  eq(validateWorkerPrompt(bad).ok, false);
  const chatty = { ...good, input_files: ["read the previous chat"] };
  eq(validateWorkerPrompt(chatty).ok, false);
});

t("context budget: verified models have a usable cap; unverified rejected", () => {
  const cap = usableBudget("qwen3-coder:30b");
  ok(cap > 0 && cap < 32768, "cap must be within measured context");
  eq(enforceBudget("qwen3-coder:30b", cap).ok, true);
  eq(enforceBudget("qwen3-coder:30b", cap + 1).ok, false);
  throws(() => usableBudget("made-up:999b"), "unverified model must throw");
  eq(shouldReferenceOnly("x".repeat(5000)), true);
});

t("retry policy: max 3 attempts then escalate; repeats counted", () => {
  const log = newAttemptLog("ISSUE-1");
  const fp = "hyp-A";
  eq(recordAttempt(log, { hypothesisFingerprint: fp, change: "c1", result: "r1" }).action, "RETRY");
  eq(recordAttempt(log, { hypothesisFingerprint: fp, change: "c2", result: "r2" }).action, "RETRY");
  eq(recordAttempt(log, { hypothesisFingerprint: fp, change: "c3", result: "r3" }).action, "ESCALATE_OR_STOP");
  eq(log.attempts.length, MAX_ATTEMPTS);
  const over = recordAttempt(log, { hypothesisFingerprint: fp, change: "c4", result: "r4" });
  eq(over.accepted, false);
  eq(sameHypothesisRepeated(log, fp), true);
});

t("litellm aliases are local-only on loopback with no fallbacks", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "litellm_aliases.json"), "utf8"));
  eq(cfg.enabled, false, "must be disabled by default");
  eq(cfg.policy.no_fallbacks, true);
  eq(cfg.policy.deny_cloud_aliases, true);
  for (const a of cfg.aliases) {
    ok(a.local_only === true, `${a.alias} must be local_only`);
    ok(/^http:\/\/127\.0\.0\.1(:|$)/.test(a.api_base), `${a.alias} api_base must be loopback`);
  }
});

t("governance non-bypass: denied/failed component cannot route around policy", () => {
  // Simulates a component failing and attempting to escalate to a denied provider.
  throws(() => assertProviderAllowed("promptwizard"), "must stay blocked");
  ok(PROVIDER_POLICY.rules.some((r) => /bypass/i.test(r)), "policy must state no-bypass rule");
});

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
