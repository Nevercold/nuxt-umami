import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

interface Received {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  body: string
}

const received: Received[] = []

const upstream = createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => {
    body += chunk
  })
  req.on('end', () => {
    received.push({ method: req.method, url: req.url, headers: req.headers, body })
    if (req.url === '/script.js') {
      res.setHeader('content-type', 'application/javascript')
      res.end('/* tracker */')
      return
    }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ cache: 'token' }))
  })
})

await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve))
process.env.UMAMI_TEST_HOST = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`

afterAll(() => {
  upstream.close()
})

describe('proxy', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)),
  })

  beforeEach(() => {
    received.length = 0
  })

  it('renders the directive without errors', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('basic')
  })

  it('serves the tracker script from the upstream host', async () => {
    const res = await fetch('/_ux/script.js')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('max-age')
    expect(await res.text()).toBe('/* tracker */')
  })

  it('forwards events with the visitor ip and without cookies', async () => {
    const res = await fetch('/_ux/api/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '203.0.113.7',
        'cookie': 'session=secret',
        'authorization': 'Bearer secret',
        'user-agent': 'Mozilla/5.0 Test',
        'x-umami-cache': 'abc',
      },
      body: JSON.stringify({ type: 'event', payload: { website: 'test-website' } }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ cache: 'token' })

    const [request] = received
    expect(request?.url).toBe('/api/send')
    expect(request?.headers['x-forwarded-for']).toBe('203.0.113.7')
    expect(request?.headers['user-agent']).toBe('Mozilla/5.0 Test')
    expect(request?.headers['x-umami-cache']).toBe('abc')
    expect(request?.headers.cookie).toBeUndefined()
    expect(request?.headers.authorization).toBeUndefined()
    expect(JSON.parse(request!.body)).toEqual({ type: 'event', payload: { website: 'test-website' } })
  })

  it('forwards the recorder config request', async () => {
    const res = await fetch('/_ux/api/websites/test-website/recorder')
    expect(res.status).toBe(200)
    expect(received[0]?.url).toBe('/api/websites/test-website/recorder')
  })

  it('rejects anything that is not a tracker endpoint', async () => {
    expect((await fetch('/_ux/api/auth/login', { method: 'POST' })).status).toBe(404)
    expect((await fetch('/_ux/api/send')).status).toBe(405)
    expect(received).toHaveLength(0)
  })

  it('sends server-side events', async () => {
    const res = await $fetch<{ ok: boolean }>('/api/order', {
      method: 'POST',
      headers: { 'user-agent': 'Mozilla/5.0 Test', 'x-forwarded-for': '198.51.100.4' },
    })

    expect(res.ok).toBe(true)
    const body = JSON.parse(received[0]!.body)
    expect(body.payload).toMatchObject({ website: 'test-website', name: 'order', data: { total: 42 }, url: '/api/order' })
    expect(received[0]?.headers['x-forwarded-for']).toBe('198.51.100.4')
  })
})
