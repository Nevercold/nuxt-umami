// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModuleOptions } from '../src/module'
import { createUmami } from '../src/runtime/umami'
import type { BeforeSend } from '../src/runtime/types'

const options: ModuleOptions = {
  enabled: true,
  websiteId: 'site',
  host: '',
  proxy: true,
  proxyPath: '/_ux',
  scriptPath: '/script.js',
  autoTrack: true,
  ignoreLocalhost: false,
  domains: [],
  tag: '',
  excludeSearch: false,
  excludeHash: false,
  doNotTrack: false,
  performance: false,
  errors: false,
  release: '',
  environment: '',
  salt: '',
  saltRotation: '',
  replay: false,
  consent: false,
  directive: true,
}

const tracker = {
  track: vi.fn(async () => {}),
  identify: vi.fn(async () => {}),
  captureException: vi.fn(async () => {}),
  getSession: () => ({ cache: undefined, website: 'site' }),
}

let loaded: string[] = []

beforeEach(() => {
  loaded = []
  vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T) => {
    const script = node as unknown as HTMLScriptElement
    loaded.push(new URL(script.src).pathname)
    window.umami = tracker
    queueMicrotask(() => script.onload?.(new Event('load')))
    return node
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  delete window.umami
  delete window.umamiConfig
})

const beforeSend = () => window.umamiConfig!.beforeSend as BeforeSend

describe('createUmami', () => {
  it('loads the tracker through the proxy and passes the config', async () => {
    const umami = createUmami({ ...options, tag: 'beta', performance: true }, '/')
    await umami.track('signup', { plan: 'pro' })

    expect(loaded).toEqual(['/_ux/script.js'])
    expect(window.umamiConfig).toMatchObject({ websiteId: 'site', hostUrl: '/_ux', tag: 'beta', performance: true })
    expect(tracker.track).toHaveBeenCalledWith('signup', { plan: 'pro' })
  })

  it('respects the app base URL', async () => {
    const umami = createUmami(options, '/app/')
    await umami.track()
    expect(loaded).toEqual(['/app/_ux/script.js'])
  })

  it('loads the recorder after the tracker when replays are on', async () => {
    const umami = createUmami({ ...options, replay: true }, '/')
    await umami.track()
    expect(loaded).toEqual(['/_ux/script.js', '/_ux/recorder.js'])
  })

  it('loads nothing before consent', async () => {
    const umami = createUmami({ ...options, consent: true }, '/')
    await umami.track('ignored')

    expect(loaded).toEqual([])
    expect(umami.hasConsent.value).toBe(false)

    await umami.grantConsent()
    expect(loaded).toEqual(['/_ux/script.js'])
    expect(tracker.track).not.toHaveBeenCalled()
  })

  it('drops payloads after consent is revoked', async () => {
    const umami = createUmami(options, '/')
    await umami.track()

    expect(await beforeSend()('event', { a: 1 })).toEqual({ a: 1 })
    umami.revokeConsent()
    expect(await beforeSend()('event', { a: 1 })).toBeNull()
  })

  it('runs beforeSend hooks in order and can remove them', async () => {
    const umami = createUmami(options, '/')
    await umami.track()

    const remove = umami.beforeSend((_type, payload) => ({ ...payload, url: '/masked' }))
    umami.beforeSend((type, payload) => (type === 'error' ? null : payload))

    expect(await beforeSend()('event', { url: '/secret' })).toEqual({ url: '/masked' })
    expect(await beforeSend()('error', { url: '/secret' })).toBeNull()

    remove()
    expect(await beforeSend()('event', { url: '/secret' })).toEqual({ url: '/secret' })
  })

  it('sends revenue as event data', async () => {
    const umami = createUmami(options, '/')
    await umami.trackRevenue('checkout', 19.99, 'eur', { plan: 'pro' })
    expect(tracker.track).toHaveBeenCalledWith('checkout', { plan: 'pro', revenue: 19.99, currency: 'EUR' })
  })

  it('does nothing on localhost when ignoreLocalhost is set', async () => {
    const umami = createUmami({ ...options, ignoreLocalhost: true }, '/')
    await umami.track()
    expect(loaded).toEqual([])
  })
})
