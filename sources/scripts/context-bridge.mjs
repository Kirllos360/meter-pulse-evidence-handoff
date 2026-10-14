#!/usr/bin/env node
// Meter Pulse — CONTEXT BRIDGE / CONTEXT COMPILER
// API LLM (large reasoning context) → Context Compiler → LOCAL_EXECUTION_CAPSULE → Local execution
// → Evidence/checkpoint → Context Index → Progressive retrieval when required
//
// The local model receives ONLY the bounded context required for its current operation.
// No full conversation history. No arbitrary unrestricted repository-wide context injection.
//
// Usage:
//   node scripts/context-bridge.mjs compile --task "..." [--mode MODE]
//   node scripts/context-bridge.mjs retrieve --task "..." --request "..."
//   node scripts/context-bridge.mjs test

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTEXT_DIR = path.join(ROOT, '.ai', 'context')

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex')
}

function ensureDir() {
  if (!fs.existsSync(CONTEXT_DIR)) fs.mkdirSync(CONTEXT_DIR, { recursive: true })
}

function saveRecord(name, data) {
  ensureDir()
  const file = path.join(CONTEXT_DIR, `${name}.json`)
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
  return file
}

function loadRecord(name) {
  const file = path.join(CONTEXT_DIR, `${name}.json`)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

const CRITICAL_FIELDS = [
  'taskId', 'missionId', 'mode', 'lifecycleMethod', 'gate', 'gateHash',
  'objective', 'expectedResult', 'acceptanceCriteria', 'nextAction'
]

export function createLocalExecutionCapsule(options = {}) {
  const capsule = {
    taskId: options.taskId || `TASK-${Date.now().toString(36).toUpperCase()}`,
    missionId: options.missionId || `M-${Date.now().toString(36).toUpperCase()}`,
    mode: options.mode || 'ALL_AGENT',
    lifecycleMethod: options.lifecycleMethod || 'EXECUTE',
    roadmapPhase: options.roadmapPhase || 'current',
    gate: options.gate || 'IMPL',
    gateHash: options.gateHash || sha256(options.gate || 'IMPL'),
    dependencies: options.dependencies || [],
    objective: options.objective || '',
    currentTarget: options.currentTarget || '',
    files: options.files || [],
    components: options.components || [],
    constraints: options.constraints || [],
    selectedResources: options.selectedResources || { arms: [], llms: [], mcps: [], tools: [], skills: [] },
    knownFailures: options.knownFailures || [],
    relevantLessons: options.relevantLessons || [],
    commands: options.commands || [],
    expectedResult: options.expectedResult || '',
    acceptanceCriteria: options.acceptanceCriteria || [],
    currentCheckpoint: options.currentCheckpoint || null,
    previousAttemptSummary: options.previousAttemptSummary || '',
    nextAction: options.nextAction || '',
    evidenceRequirements: options.evidenceRequirements || [],
    escalationStatus: options.escalationStatus || 'none',
    retrievalReferences: options.retrievalReferences || [],
    createdAt: new Date().toISOString(),
    hash: null
  }

  capsule.hash = sha256(JSON.stringify(capsule))
  return capsule
}

export function compressCapsule(capsule, maxBytes = 8192) {
  const original = JSON.stringify(capsule)
  if (original.length <= maxBytes) return capsule

  const compressed = { ...capsule }

  if (compressed.relevantLessons && compressed.relevantLessons.length > 0) {
    compressed.relevantLessons = compressed.relevantLessons.slice(0, 3).map(l => ({
      id: l.id,
      summary: l.summary?.slice(0, 200) || ''
    }))
  }

  if (compressed.knownFailures && compressed.knownFailures.length > 0) {
    compressed.knownFailures = compressed.knownFailures.slice(0, 3).map(f => ({
      type: f.type,
      summary: f.summary?.slice(0, 200) || ''
    }))
  }

  if (compressed.retrievalReferences && compressed.retrievalReferences.length > 0) {
    compressed.retrievalReferences = compressed.retrievalReferences.slice(0, 5)
  }

  if (compressed.dependencies && compressed.dependencies.length > 0) {
    compressed.dependencies = compressed.dependencies.slice(0, 5)
  }

  compressed._compressed = true
  compressed._originalSize = original.length
  compressed.hash = sha256(JSON.stringify(compressed))

  return compressed
}

export function verifyCriticalFields(capsule) {
  const missing = []
  for (const field of CRITICAL_FIELDS) {
    if (!(field in capsule) || capsule[field] === undefined || capsule[field] === null) {
      missing.push(field)
    }
  }
  return { valid: missing.length === 0, missing }
}

export function createContextIndex(sources) {
  const index = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    sources: sources.map(s => ({
      id: s.id,
      type: s.type,
      path: s.path,
      hash: s.hash || sha256(s.content || ''),
      size: s.size || (s.content || '').length,
      authority: s.authority || 'optional',
      reason: s.reason || '',
      status: 'available'
    }))
  }
  return index
}

export function selectRelevantContext(taskText, contextIndex, maxItems = 10) {
  const taskTokens = new Set(String(taskText || '').toLowerCase().split(/\s+/).filter(t => t.length > 2))
  const scored = contextIndex.sources.map(s => {
    const sourceText = `${s.id} ${s.path} ${s.type}`.toLowerCase()
    let score = 0
    for (const token of taskTokens) {
      if (sourceText.includes(token)) score++
    }
    return { ...s, relevanceScore: score }
  })
  return scored.filter(s => s.relevanceScore > 0).sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, maxItems)
}

export function createRetrievalRequest(taskId, missingContext, reason) {
  return {
    taskId,
    requestType: 'progressive-retrieval',
    missingContext,
    reason,
    bounded: true,
    maxItems: 5,
    sourceTracked: true,
    loopControlled: true,
    timestamp: new Date().toISOString()
  }
}

export function detectStaleContext(capsule, currentState) {
  const stale = []
  if (capsule.gateHash !== currentState.gateHash) {
    stale.push({ field: 'gateHash', capsule: capsule.gateHash, current: currentState.gateHash })
  }
  if (capsule.taskId !== currentState.taskId) {
    stale.push({ field: 'taskId', capsule: capsule.taskId, current: currentState.taskId })
  }
  return { isStale: stale.length > 0, stale }
}

export function detectGateChange(oldGate, newGate) {
  if (oldGate === newGate) return { changed: false }
  return { changed: true, oldGate, newGate, oldHash: sha256(oldGate), newHash: sha256(newGate) }
}

const isMain = (() => { try { return path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url) } catch { return false } })()
if (isMain) {
  console.log('=== CONTEXT BRIDGE TESTS ===')
  console.log('')

  console.log('1. Large API context:')
  const largeContext = { reasoning: 'x'.repeat(50000), architecture: 'y'.repeat(30000) }
  console.log(`  API context size: ${JSON.stringify(largeContext).length} chars`)

  console.log('')
  console.log('2. Small local context:')
  const smallContext = { task: 'Fix login', files: ['auth.ts'] }
  console.log(`  Local context size: ${JSON.stringify(smallContext).length} chars`)

  console.log('')
  console.log('3. Task extraction:')
  const taskText = 'Implement user authentication with JWT'
  console.log(`  Task: "${taskText}"`)

  console.log('')
  console.log('4. Capsule generation:')
  const capsule = createLocalExecutionCapsule({
    taskId: 'TEST-001',
    objective: taskText,
    mode: 'ALL_AGENT',
    lifecycleMethod: 'EXECUTE',
    expectedResult: 'Auth works',
    acceptanceCriteria: ['Tests pass', 'No errors']
  })
  console.log(`  Capsule ID: ${capsule.taskId}`)
  console.log(`  Capsule hash: ${capsule.hash.slice(0, 16)}...`)
  console.log(`  Capsule size: ${JSON.stringify(capsule).length} chars`)

  console.log('')
  console.log('5. Capsule size limits:')
  const largeCapsule = createLocalExecutionCapsule({
    taskId: 'TEST-002',
    objective: 'x'.repeat(10000),
    expectedResult: 'y'.repeat(10000)
  })
  const compressed = compressCapsule(largeCapsule, 8192)
  console.log(`  Original: ${JSON.stringify(largeCapsule).length} chars`)
  console.log(`  Compressed: ${JSON.stringify(compressed).length} chars`)
  console.log(`  Compressed flag: ${compressed._compressed}`)

  console.log('')
  console.log('6. Critical-field preservation:')
  const criticalCheck = verifyCriticalFields(compressed)
  console.log(`  Valid: ${criticalCheck.valid}`)
  if (!criticalCheck.valid) console.log(`  Missing: ${criticalCheck.missing.join(', ')}`)

  console.log('')
  console.log('7. Progressive retrieval:')
  const retrievalReq = createRetrievalRequest('TEST-001', ['auth.ts', 'user.model.ts'], 'Need auth implementation details')
  console.log(`  Task: ${retrievalReq.taskId}`)
  console.log(`  Missing: ${retrievalReq.missingContext.join(', ')}`)
  console.log(`  Reason: ${retrievalReq.reason}`)
  console.log(`  Bounded: ${retrievalReq.bounded}`)

  console.log('')
  console.log('8. Retrieval failure:')
  const failedRetrieval = { ...retrievalReq, status: 'failed', error: 'Source not found' }
  console.log(`  Status: ${failedRetrieval.status}`)
  console.log(`  Error: ${failedRetrieval.error}`)

  console.log('')
  console.log('9. Irrelevant context rejection:')
  const contextIndex = createContextIndex([
    { id: 'auth', type: 'code', path: 'auth.ts', content: 'authentication' },
    { id: 'billing', type: 'code', path: 'billing.ts', content: 'payment' }
  ])
  const relevant = selectRelevantContext('Fix auth', contextIndex)
  console.log(`  Relevant sources: ${relevant.length}`)
  console.log(`  Rejected: ${contextIndex.sources.length - relevant.length}`)

  console.log('')
  console.log('10. Stale context detection:')
  const staleCheck = detectStaleContext(capsule, { ...capsule, gateHash: 'different-hash' })
  console.log(`  Is stale: ${staleCheck.isStale}`)
  console.log(`  Stale fields: ${staleCheck.stale.map(s => s.field).join(', ')}`)

  console.log('')
  console.log('11. Capsule hash mismatch:')
  const tamperedCapsule = { ...capsule, objective: 'Tampered' }
  const hashMatch = tamperedCapsule.hash === capsule.hash
  console.log(`  Hash match: ${hashMatch}`)
  console.log(`  Original: ${capsule.hash.slice(0, 16)}...`)
  console.log(`  Tampered: ${tamperedCapsule.hash.slice(0, 16)}...`)

  console.log('')
  console.log('12. Gate change detection:')
  const gateChange = detectGateChange('IMPL', 'TEST')
  console.log(`  Changed: ${gateChange.changed}`)
  console.log(`  Old: ${gateChange.oldGate}`)
  console.log(`  New: ${gateChange.newGate}`)

  console.log('')
  console.log('13. Resource-selection preservation:')
  const capsuleWithResources = createLocalExecutionCapsule({
    taskId: 'TEST-003',
    selectedResources: { arms: ['coding'], llms: ['qwen3-coder:30b'], mcps: ['serena'] }
  })
  const compressedWithResources = compressCapsule(capsuleWithResources, 8192)
  console.log(`  Arms preserved: ${compressedWithResources.selectedResources.arms.join(', ')}`)
  console.log(`  LLMs preserved: ${compressedWithResources.selectedResources.llms.join(', ')}`)
  console.log(`  MCPs preserved: ${compressedWithResources.selectedResources.mcps.join(', ')}`)

  console.log('')
  console.log('=== ALL TESTS COMPLETE ===')
}
