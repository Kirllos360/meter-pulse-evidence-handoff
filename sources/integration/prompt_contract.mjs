// Phase 5 — worker prompt contract. Validates that generated worker prompts are
// self-contained and bounded. Does NOT generate prompts (Framework owns planning).
export const REQUIRED_PROMPT_FIELDS = [
  "task_id",
  "role",
  "required_capabilities",
  "permitted_tools",
  "input_files",
  "expected_artifacts",
  "validation_commands",
  "context_budget_tokens",
  "checkpoint",
  "stop_conditions",
];

export function validateWorkerPrompt(prompt) {
  const errors = [];
  for (const f of REQUIRED_PROMPT_FIELDS) {
    if (!(f in prompt)) errors.push(`missing:${f}`);
  }
  if (Array.isArray(prompt.stop_conditions) && prompt.stop_conditions.length === 0)
    errors.push("stop_conditions:empty");
  if (typeof prompt.context_budget_tokens !== "number" || prompt.context_budget_tokens <= 0)
    errors.push("context_budget_tokens:invalid");
  if (typeof prompt.role !== "string" || !/^[@a-z0-9_-]+$/i.test(prompt.role))
    errors.push("role:invalid");
  const blob = JSON.stringify(prompt);
  if (/read the (previous|entire) chat/i.test(blob)) errors.push("forbidden:read-previous-chat");
  return { ok: errors.length === 0, errors };
}
