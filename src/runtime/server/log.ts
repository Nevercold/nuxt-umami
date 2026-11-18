/** A hanging connection to Umami should not hold up the visitor's request for long. */
export const UPSTREAM_TIMEOUT = 10_000

const PREFIX = '[nuxt-umami-plugin]'
const INTERVAL = 60_000

// key -> time of the last message, so an outage logs once per minute instead of once per request
const lastLogged = new Map<string, number>()

export function warnOnce(key: string, message: string) {
  const now = Date.now()
  const last = lastLogged.get(key)
  if (last !== undefined && now - last < INTERVAL)
    return
  // keys come from a small set of routes and reasons, the limit is only a safety net
  if (lastLogged.size >= 100)
    lastLogged.clear()
  lastLogged.set(key, now)
  console.warn(`${PREFIX} ${message}`)
}

export function isTimeout(error: unknown) {
  const name = (error as { name?: string } | null)?.name
  return name === 'TimeoutError' || name === 'AbortError'
}

/** Short reason for a failed fetch, e.g. ENOTFOUND or UND_ERR_CONNECT_TIMEOUT. */
export function describeError(error: unknown): string {
  if (isTimeout(error))
    return 'timeout'
  const { message, cause } = (error ?? {}) as { message?: string, cause?: { code?: string, message?: string } }
  return cause?.code || cause?.message || message || String(error)
}

/** Response headers that tell a block by Cloudflare or another proxy apart from an Umami error. */
export function describeResponse(response: Response): string {
  return ['server', 'cf-ray', 'cf-mitigated']
    .map(name => [name, response.headers.get(name)])
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}=${value}`)
    .join(' ')
}
