import { createApp, createRouter, defineEventHandler, toWebHandler } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let request: (path: string, init?: RequestInit) => Promise<Response>
let warn: ReturnType<typeof vi.spyOn>
const upstream = vi.fn<typeof fetch>()

// fresh modules per test, so the once-per-minute log state starts empty
beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('fetch', upstream)
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  const { default: proxy } = await import('../src/runtime/server/proxy')
  const { sendUmamiEvent } = await import('../src/runtime/server/utils')

  const router = createRouter()
    .use('/_ux/**', proxy)
    .post('/api/order', defineEventHandler(async event => ({ ok: await sendUmamiEvent(event, { name: 'order' }) })))
  const handler = toWebHandler(createApp().use(router))
  request = (path, init) => handler(new Request(`http://localhost${path}`, init))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  upstream.mockReset()
})

function connectionError(code: string) {
  return new TypeError('fetch failed', { cause: Object.assign(new Error(code), { code }) })
}

describe('proxy errors', () => {
  it('answers 502 and logs the reason when umami is unreachable', async () => {
    upstream.mockRejectedValue(connectionError('ECONNREFUSED'))

    const res = await request('/_ux/script.js')

    expect(res.status).toBe(502)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toBe(
      '[nuxt-umami-plugin] Could not reach https://umami.test for /script.js: ECONNREFUSED',
    )
  })

  it('answers 504 on a timeout', async () => {
    upstream.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))

    const res = await request('/_ux/script.js')

    expect(res.status).toBe(504)
    expect(warn.mock.calls[0]![0]).toContain(': timeout')
  })

  it('passes an error status through and logs who answered', async () => {
    upstream.mockResolvedValue(new Response('error code: 1020', {
      status: 403,
      headers: { 'server': 'cloudflare', 'cf-ray': 'abc123-FRA', 'cf-mitigated': 'challenge' },
    }))

    const res = await request('/_ux/api/send', { method: 'POST', body: '{}' })

    expect(res.status).toBe(403)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toBe(
      '[nuxt-umami-plugin] https://umami.test answered /api/send with 403 (server=cloudflare cf-ray=abc123-FRA cf-mitigated=challenge)',
    )
  })

  it('logs the same failure only once per minute', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      upstream.mockRejectedValue(connectionError('ENOTFOUND'))

      await request('/_ux/script.js')
      await request('/_ux/script.js')
      expect(warn).toHaveBeenCalledTimes(1)

      // a different path is a different message
      await request('/_ux/api/send', { method: 'POST', body: '{}' })
      expect(warn).toHaveBeenCalledTimes(2)

      vi.advanceTimersByTime(61_000)
      await request('/_ux/script.js')
      expect(warn).toHaveBeenCalledTimes(3)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('keeps the website id out of the log', async () => {
    upstream.mockResolvedValue(new Response('', { status: 500 }))

    await request('/_ux/api/websites/secret-id/recorder')

    expect(warn.mock.calls[0]![0]).toContain('/api/websites/:id/recorder with 500')
    expect(warn.mock.calls[0]![0]).not.toContain('secret-id')
  })
})

describe('sendUmamiEvent errors', () => {
  it('returns false and logs when umami is unreachable', async () => {
    upstream.mockRejectedValue(connectionError('UND_ERR_CONNECT_TIMEOUT'))

    const res = await request('/api/order', { method: 'POST' })

    expect(await res.json()).toEqual({ ok: false })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toBe(
      '[nuxt-umami-plugin] sendUmamiEvent could not reach https://umami.test: UND_ERR_CONNECT_TIMEOUT',
    )
  })

  it('returns false and logs an error status', async () => {
    upstream.mockResolvedValue(new Response('', { status: 403, headers: { server: 'cloudflare' } }))

    const res = await request('/api/order', { method: 'POST' })

    expect(await res.json()).toEqual({ ok: false })
    expect(warn.mock.calls[0]![0]).toBe(
      '[nuxt-umami-plugin] sendUmamiEvent: https://umami.test answered with 403 (server=cloudflare)',
    )
  })
})
