/** Connection health / latency helpers for tree badges. */

export type HealthTone = 'good' | 'warn' | 'bad' | 'unknown' | 'unsupported'

export type ConnHealth = {
  ok: boolean
  latencyMs: number
  tone: HealthTone
  checkedAt: string
  error?: string
  unsupported?: boolean
}

/** Green &lt; 80ms, amber &lt; 250ms, else red (when ok). */
export function toneForLatency(latencyMs: number, ok: boolean, unsupported?: boolean): HealthTone {
  if (unsupported) return 'unsupported'
  if (!ok) return 'bad'
  if (latencyMs < 80) return 'good'
  if (latencyMs < 250) return 'warn'
  return 'bad'
}

export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 10) return `${Math.round(ms)}ms`
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function buildConnHealth(input: {
  ok: boolean
  latencyMs: number
  error?: string
  unsupported?: boolean
}): ConnHealth {
  return {
    ok: input.ok,
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
    tone: toneForLatency(input.latencyMs, input.ok, input.unsupported),
    checkedAt: new Date().toISOString(),
    error: input.error,
    unsupported: input.unsupported,
  }
}

export type HealthProbeSummary = {
  total: number
  ok: number
  bad: number
  unsupported: number
}

/** Aggregate results from a batch probe (null entries ignored). */
export function summarizeHealthProbes(
  rows: readonly (ConnHealth | null | undefined)[],
): HealthProbeSummary {
  let ok = 0
  let bad = 0
  let unsupported = 0
  let total = 0
  for (const row of rows) {
    if (!row) continue
    total += 1
    if (row.unsupported) unsupported += 1
    else if (row.ok) ok += 1
    else bad += 1
  }
  return { total, ok, bad, unsupported }
}
