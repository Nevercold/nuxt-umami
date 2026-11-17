// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModuleOptions } from '../src/module'
import { createUmami } from '../src/runtime/umami'
import type { BeforeSend, Payload } from '../src/runtime/types'

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
  track: vi.fn(async (..._args: unknown[]) => {}),
  identify: vi.fn(async (..._args: unknown[]) => {}),
  captureException: vi.fn(async (..._args: unknown[]) => {}),
  getSession: () => ({ cache: undefined, website: 'site' }),
}

let loaded: string[] = []
// set to keep the script "loading" until finishLoading() is called
let holdLoad = false
let finishLoading: (() => void) | undefined

beforeEach(() => {
  loaded = []
  holdLoad = false
  finishLoading = undefined
  vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T) => {
    const script = node as unknown as HTMLScriptElement
    loaded.push(new URL(script.src).pathname)
    const done = () => {
      window.umami = tracker
      script.onload?.(new Event('load'))
    }
    if (holdLoad)
      finishLoading = done
    else
      queueMicrotask(done)
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

describe('trackView', () => {
  const sent: Payload[] = []
  const defaults = { website: 'site', url: 'https://example.com/current?q=1#top', referrer: '/before' }

  // behaves like the real tracker: builds the default payload and runs beforeSend
  beforeEach(() => {
    sent.length = 0
    tracker.track.mockImplementation(async (...args: unknown[]) => {
      const [event] = args
      const payload = typeof event === 'function' ? event({ ...defaults }) : { ...defaults }
      const result = await beforeSend()('event', payload)
      if (result)
        sent.push(result)
    })
  })

  afterEach(() => {
    tracker.track.mockImplementation(async () => {})
  })

  it('tracks the current url without arguments', async () => {
    const umami = createUmami(options, '/')
    await umami.trackView()
    expect(sent).toEqual([defaults])
  })

  it('replaces the url', async () => {
    const umami = createUmami(options, '/')
    await umami.trackView('/servers/123')
    expect(sent).toEqual([{ ...defaults, url: '/servers/123' }])
  })

  it('replaces url and referrer', async () => {
    const umami = createUmami(options, '/')
    await umami.trackView('/servers/123', '/servers')
    expect(sent).toEqual([{ ...defaults, url: '/servers/123', referrer: '/servers' }])
  })

  it('applies excludeSearch and excludeHash to the given url', async () => {
    const umami = createUmami({ ...options, excludeSearch: true, excludeHash: true }, '/')
    await umami.trackView('/servers/123?tab=logs#bottom')
    expect(sent[0]?.url).toBe('/servers/123')

    const onlyHash = createUmami({ ...options, excludeHash: true }, '/')
    await onlyHash.trackView('/servers/123?tab=logs#bottom')
    expect(sent[1]?.url).toBe('/servers/123?tab=logs')
  })

  it('waits for the tracker when called before it has loaded', async () => {
    holdLoad = true
    const umami = createUmami(options, '/')
    const pending = umami.trackView('/early')

    await Promise.resolve()
    expect(finishLoading).toBeDefined()
    expect(tracker.track).not.toHaveBeenCalled()

    finishLoading!()
    await pending
    expect(sent).toEqual([{ ...defaults, url: '/early' }])
  })

  it('sends nothing without consent', async () => {
    const umami = createUmami({ ...options, consent: true }, '/')
    await umami.trackView('/servers/123')

    expect(loaded).toEqual([])
    expect(sent).toEqual([])
  })

  it('passes the replaced url to beforeSend', async () => {
    const umami = createUmami(options, '/')
    const seen: unknown[] = []
    umami.beforeSend((_type, payload) => {
      seen.push(payload.url)
      return payload
    })

    await umami.trackView('/servers/123')
    expect(seen).toEqual(['/servers/123'])
  })
})
