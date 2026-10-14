// Phase 5 — context budget contract. Explicit budget + safety margin; reference
// artifacts by path instead of duplicating giant content.
export const DEFAULT_SAFETY_MARGIN = 0.15; // 15% headroom

// Measured local limits (Phase 2/3): qwen3-coder:30b context 32768 (OLLAMA_CONTEXT_LENGTH).
export const VERIFIED_LOCAL_LIMITS = {
  "qwen3-coder:30b": { context: 32768, output: 8192 },
  "deepseek-r1:32b": { context: 32768, output: 8192 },
  "qwen2.5vl:7b": { context: 8192, output: 2048 },
  "qwen2.5vl:32b": { context: 4096, output: 1024 },
};

export function usableBudget(model, safetyMargin = DEFAULT_SAFETY_MARGIN) {
  const lim = VERIFIED_LOCAL_LIMITS[model];
  if (!lim) throw new Error(`CONTEXT_LIMIT_UNVERIFIED: ${model}`);
  return Math.floor(lim.context * (1 - safetyMargin));
}

export function enforceBudget(model, estimatedTokens) {
  const cap = usableBudget(model);
  const ok = estimatedTokens <= cap;
  return { ok, model, cap, estimatedTokens, action: ok ? "PROCEED" : "SUMMARIZE_OR_REFERENCE_ARTIFACTS" };
}

// Reference-by-path rule: never inline artifacts larger than this many chars.
export const INLINE_ARTIFACT_MAX_CHARS = 4000;
export function shouldReferenceOnly(text) {
  return typeof text === "string" && text.length > INLINE_ARTIFACT_MAX_CHARS;
}
