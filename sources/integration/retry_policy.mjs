// Phase 5 — retry policy contract. Max three failed attempts on the same issue,
// including repeated variants that do not change the hypothesis. Escalate after 3.
export const MAX_ATTEMPTS = 3;

export function newAttemptLog(issueId) {
  return { issueId, attempts: [], escalated: false };
}

// hypothesisFingerprint: caller supplies a stable string for the underlying hypothesis.
// A repeat with the SAME fingerprint counts as the same attempt (no progress).
export function recordAttempt(log, { hypothesisFingerprint, change, result }) {
  if (log.attempts.length >= MAX_ATTEMPTS) {
    log.escalated = true;
    return { accepted: false, action: "ESCALATE_OR_STOP", attempts: log.attempts.length };
  }
  log.attempts.push({ n: log.attempts.length + 1, hypothesisFingerprint, change, result });
  if (log.attempts.length >= MAX_ATTEMPTS) {
    return { accepted: true, action: "ESCALATE_OR_STOP", attempts: log.attempts.length };
  }
  return { accepted: true, action: "RETRY", attempts: log.attempts.length };
}

export function sameHypothesisRepeated(log, fingerprint) {
  return log.attempts.filter((a) => a.hypothesisFingerprint === fingerprint).length >= MAX_ATTEMPTS;
}
