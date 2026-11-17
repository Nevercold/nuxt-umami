import { readonly, ref } from 'vue'
import { joinURL } from 'ufo'
import type { ModuleOptions } from '../module'
import type { BeforeSend, Payload, Umami, UmamiTracker } from './types'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(script)
  })
}

// The tracker only applies excludeSearch/excludeHash to URLs it reads itself
function trimUrl(url: string, options: Pick<ModuleOptions, 'excludeSearch' | 'excludeHash'>) {
  if (options.excludeHash)
    url = url.replace(/#.*$/, '')
  if (options.excludeSearch)
    url = url.replace(/\?[^#]*/, '')
  return url
}

export function createNoopUmami(consent = false): Umami {
  const noop = async () => {}
  return {
    track: noop,
    trackView: noop,
    identify: noop,
    trackRevenue: noop,
    captureException: noop,
    beforeSend: () => () => {},
    grantConsent: noop,
    revokeConsent: () => {},
    hasConsent: readonly(ref(consent)),
  }
}

export function createUmami(options: ModuleOptions, baseURL: string): Umami {
  const active = options.enabled
    && !!options.websiteId
    && !(options.ignoreLocalhost && LOCAL_HOSTS.has(location.hostname))

  if (!active) {
    if (import.meta.dev && !options.websiteId)
      console.warn('[umami] `websiteId` is not set, nothing will be tracked.')
    return createNoopUmami(!options.consent)
  }

  const consent = ref(!options.consent)
  const filters = new Set<BeforeSend>()
  const base = options.proxy ? joinURL(baseURL, options.proxyPath) : options.host
  let tracker: Promise<UmamiTracker | undefined> | undefined

  const beforeSend: BeforeSend = async (type, payload) => {
    if (!consent.value)
      return null
    let result: Awaited<ReturnType<BeforeSend>> = payload
    for (const filter of filters) {
      result = await filter(type, result)
      if (!result)
        return null
    }
    return result
  }

  function load() {
    tracker ||= (async () => {
      window.umamiConfig = {
        websiteId: options.websiteId,
        hostUrl: options.proxy ? base : undefined,
        autoPageview: options.autoTrack,
        domains: options.domains.length ? options.domains : undefined,
        tag: options.tag || undefined,
        excludeSearch: options.excludeSearch,
        excludeHash: options.excludeHash,
        doNotTrack: options.doNotTrack,
        performance: options.performance,
        errors: options.errors,
        release: options.release || undefined,
        environment: options.environment || undefined,
        salt: options.salt || undefined,
        saltRotation: options.saltRotation || undefined,
        beforeSend,
      }

      try {
        await loadScript(joinURL(base, options.scriptPath))
      }
      catch (error) {
        if (import.meta.dev)
          console.warn('[umami]', error)
        return undefined
      }

      if (options.replay)
        loadScript(joinURL(base, '/recorder.js')).catch(() => {})

      return window.umami
    })()
    return tracker
  }

  async function call(fn: (tracker: UmamiTracker) => Promise<void>) {
    if (!consent.value)
      return
    const instance = await load()
    if (instance)
      await fn(instance)
  }

  if (consent.value)
    load()

  return {
    track: (...args: unknown[]) => call(t => t.track(...args)),
    trackView: (url, referrer) =>
      call(t => t.track((payload: Payload) => ({
        ...payload,
        ...(url && { url: trimUrl(url, options) }),
        ...(referrer !== undefined && { referrer }),
      }))),
    identify: (...args: unknown[]) => call(t => t.identify(...args)),
    trackRevenue: (name, revenue, currency = 'USD', data) =>
      call(t => t.track(name, { ...data, revenue, currency: currency.toUpperCase() })),
    captureException: (error, captureOptions) =>
      call(t => t.captureException(error, captureOptions)),
    beforeSend(fn) {
      filters.add(fn)
      return () => filters.delete(fn)
    },
    async grantConsent() {
      consent.value = true
      await load()
    },
    revokeConsent() {
      consent.value = false
    },
    hasConsent: readonly(consent),
  }
}
