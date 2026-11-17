import {
  addImports,
  addPlugin,
  addServerHandler,
  addServerImports,
  createResolver,
  defineNuxtModule,
  useLogger,
} from '@nuxt/kit'
import { defu } from 'defu'
import { withLeadingSlash, withoutTrailingSlash } from 'ufo'

export interface ModuleOptions {
  /**
   * Turns tracking on or off without removing the module.
   * @default true
   */
  enabled: boolean
  /** Website ID from the Umami dashboard. */
  websiteId: string
  /** Base URL of your Umami instance, e.g. `https://umami.example.com` or `https://cloud.umami.is`. */
  host: string
  /**
   * Serve the tracker and forward all requests through your own Nuxt server.
   * Keeps the Umami host out of the client and gets past most blockers.
   * Requires a server, so it is turned off for fully static builds.
   * @default true
   */
  proxy: boolean
  /**
   * Path the proxy is mounted on. Avoid anything that contains "umami" or "analytics".
   * @default '/_ux'
   */
  proxyPath: string
  /**
   * Path of the tracker script on your Umami instance. Change it if you set `TRACKER_SCRIPT_NAME`.
   * @default '/script.js'
   */
  scriptPath: string
  /**
   * Track page views automatically, including client-side navigation.
   * @default true
   */
  autoTrack: boolean
  /**
   * Skip tracking on localhost.
   * @default true
   */
  ignoreLocalhost: boolean
  /** Only track on these hostnames. */
  domains: string[]
  /** Tag all events, e.g. for A/B tests. */
  tag: string
  /** Drop the query string from tracked URLs. */
  excludeSearch: boolean
  /** Drop the hash from tracked URLs. */
  excludeHash: boolean
  /** Respect the browser's Do Not Track setting. */
  doNotTrack: boolean
  /** Collect Core Web Vitals. Umami 3.1+. */
  performance: boolean
  /** Report uncaught errors and Vue errors. Umami 3.5+. */
  errors: boolean
  /** Release attached to captured errors. */
  release: string
  /** Environment attached to captured errors. */
  environment: string
  /** Extra session salt. Needs `ENABLE_CLIENT_SALT` on the server. Umami 3.5+. */
  salt: string
  /** Rotate the session salt automatically. Ignored when `salt` is set. Umami 3.5+. */
  saltRotation: '' | 'hourly' | 'daily' | 'weekly' | 'monthly'
  /**
   * Load the recorder for session replays and heatmaps. Turn replays on per website
   * in Umami as well; sample rate and masking are configured there. Umami 3.1+.
   * @default false
   */
  replay: boolean
  /**
   * Load nothing until `useUmami().grantConsent()` is called.
   * @default false
   */
  consent: boolean
  /**
   * Register the `v-umami` directive.
   * @default true
   */
  directive: boolean
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-umami-plugin',
    configKey: 'umami',
    compatibility: {
      nuxt: '>=4.0.0',
    },
  },
  defaults: {
    enabled: true,
    websiteId: '',
    host: '',
    proxy: true,
    proxyPath: '/_ux',
    scriptPath: '/script.js',
    autoTrack: true,
    ignoreLocalhost: true,
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
  },
  setup(options, nuxt) {
    const logger = useLogger('umami')
    const { resolve } = createResolver(import.meta.url)

    const host = withoutTrailingSlash(options.host)
    const proxyPath = withoutTrailingSlash(withLeadingSlash(options.proxyPath))
    let proxy = options.proxy

    const isStatic = nuxt.options.nitro.static || (nuxt.options as { _generate?: boolean })._generate
    if (proxy && isStatic) {
      logger.warn('The proxy needs a server and is disabled for static builds.')
      proxy = false
    }

    nuxt.options.runtimeConfig.umami = defu(nuxt.options.runtimeConfig.umami, { host })
    nuxt.options.runtimeConfig.public.umami = defu(nuxt.options.runtimeConfig.public.umami, {
      enabled: options.enabled,
      websiteId: options.websiteId,
      host: proxy ? '' : host,
      proxy,
      proxyPath,
      scriptPath: withLeadingSlash(options.scriptPath),
      autoTrack: options.autoTrack,
      ignoreLocalhost: options.ignoreLocalhost,
      domains: options.domains,
      tag: options.tag,
      excludeSearch: options.excludeSearch,
      excludeHash: options.excludeHash,
      doNotTrack: options.doNotTrack,
      performance: options.performance,
      errors: options.errors,
      release: options.release,
      environment: options.environment,
      salt: options.salt,
      saltRotation: options.saltRotation,
      replay: options.replay,
      consent: options.consent,
      directive: options.directive,
    })

    addPlugin(resolve('./runtime/plugin'))
    addImports({ name: 'useUmami', from: resolve('./runtime/composables') })
    addServerImports([{ name: 'sendUmamiEvent', from: resolve('./runtime/server/utils') }])

    if (proxy) {
      addServerHandler({
        route: `${proxyPath}/**`,
        handler: resolve('./runtime/server/proxy'),
      })
    }
  },
})

declare module '@nuxt/schema' {
  interface RuntimeConfig {
    umami: { host: string }
  }
  interface PublicRuntimeConfig {
    umami: ModuleOptions
  }
}
