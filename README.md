# @nevercold/nuxt-umami

[![npm version](https://img.shields.io/npm/v/@nevercold/nuxt-umami)](https://npmjs.com/package/@nevercold/nuxt-umami)
[![License](https://img.shields.io/npm/l/@nevercold/nuxt-umami)](./LICENSE)

[Umami](https://umami.is) analytics for Nuxt 4.

The module loads the official Umami tracker instead of reimplementing it, so new
tracker features work as soon as your Umami instance supports them. On top of that it
adds a first-party proxy, a typed composable, consent handling and server-side events.

- Page views, custom events, revenue and distinct IDs
- Session replays and heatmaps
- Error tracking, including errors thrown inside Vue components
- Core Web Vitals
- First-party proxy: the tracker and all requests go through your own domain, so blockers
  don't catch them and the visitor's IP is passed on correctly
- Consent mode: nothing is loaded until you say so
- `sendUmamiEvent()` for tracking from server routes

Requires Nuxt 4. Some features need a recent Umami version; it's noted in the options below.

## Setup

```sh
pnpm add @nevercold/nuxt-umami
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nevercold/nuxt-umami'],
  umami: {
    websiteId: 'b59e9c65-ae32-47f1-8400-119fcf4861c4',
    host: 'https://umami.example.com',
  },
})
```

That's it. Page views, including client-side navigation, are tracked from here on.

Both values can also come from the environment at runtime:

```sh
NUXT_PUBLIC_UMAMI_WEBSITE_ID=b59e9c65-ae32-47f1-8400-119fcf4861c4
NUXT_UMAMI_HOST=https://umami.example.com
```

With `proxy: false` the host is needed in the browser, so use `NUXT_PUBLIC_UMAMI_HOST` instead.

## Usage

### Events

```ts
const umami = useUmami()

umami.track('signup', { plan: 'pro' })
umami.trackRevenue('checkout', 49.9, 'EUR', { items: 3 })
```

Calling `track()` without arguments records a page view for the current URL, which is
useful with `autoTrack: false`. You can also pass a payload object or a function, just
like the [tracker's own `track()`](https://docs.umami.is/docs/tracker-functions).

All functions return a promise and never throw. Calls made before the tracker has loaded
are sent once it's ready.

### Directive

```vue
<button v-umami="'signup-click'">Sign up</button>
<button v-umami="{ name: 'cta-click', position: 'hero' }">Get started</button>
```

Umami's `data-umami-event` attributes keep working as well.

### Identifying visitors

```ts
umami.identify('user-42', { plan: 'pro' })
```

This sets a [distinct ID](https://docs.umami.is/docs/distinct-ids) for the session. It also
shows up in the replay list, which makes finding a specific user's session much easier.

### Consent

```ts
// nuxt.config.ts
umami: { consent: true }
```

With `consent: true`, neither the tracker nor the recorder is loaded until you call
`grantConsent()`. The module does not remember the choice, your consent banner does:

```ts
const umami = useUmami()

if (cookieBanner.analyticsAccepted)
  umami.grantConsent()
```

`revokeConsent()` stops all events right away. A replay recording that is already running
can't be stopped from the outside; it ends with the next page load.

`umami.hasConsent` is a readonly ref if you want to show the current state.

### Changing payloads before they are sent

```ts
const umami = useUmami()

umami.beforeSend((type, payload) => {
  if (typeof payload.url === 'string')
    payload.url = payload.url.replace(/\/orders\/\d+/, '/orders/:id')
  return payload
})
```

Return `null` to drop the request. `beforeSend` returns a function that removes the hook.

### Errors

```ts
umami: {
  errors: true,
  release: '1.4.0',
  environment: 'production',
}
```

Uncaught errors and unhandled promise rejections are captured by the tracker. The module
also reports errors from Vue components and Nuxt plugins, which never reach the global
handlers. Errors created with `createError()` and a 4xx status code are skipped. To report
an error you caught yourself:

```ts
try {
  await save()
}
catch (error) {
  umami.captureException(error, { tags: { feature: 'editor' } })
}
```

Needs Umami 3.5 or later.

### Session replays and heatmaps

```ts
umami: { replay: true }
```

This loads Umami's recorder next to the tracker. Replays also have to be turned on for
the website in Umami (Website settings → Replays & Heatmaps). Sample rate, masking and
maximum duration are configured there, not in Nuxt.

Inputs are masked by default. To keep parts of a page out of recordings completely, set a
block selector in Umami (e.g. `.no-record`) and add the class to those elements.

Needs Umami 3.1 or later.

### Server-side events

```ts
// server/api/subscribe.post.ts
export default defineEventHandler(async (event) => {
  // ...
  await sendUmamiEvent(event, { name: 'newsletter-subscribe', data: { list: 'weekly' } })
})
```

IP, user agent and language are taken from the incoming request, so the event is attributed
to the same visitor. `url` defaults to the request path. Resolves to `false` if Umami could
not be reached.

## Proxy

The proxy is on by default. The browser loads the tracker from `/_ux/script.js` and sends
everything to `/_ux/api/*` on your own domain. The Nuxt server forwards these requests to
Umami together with the visitor's IP and user agent. Cookies and other headers from your
site are not forwarded.

Only the endpoints the tracker and recorder actually use are passed through. Everything
else under the proxy path returns 404, so the proxy can't be used to reach the Umami API
or dashboard.

A few things to know:

- It needs a server. For `nuxt generate` and other static builds the module falls back to
  loading the tracker directly from your Umami host.
- If your Umami instance sits behind a reverse proxy that overwrites `X-Real-IP`, or behind
  Cloudflare, every visitor will appear to come from your Nuxt server. Set
  `CLIENT_IP_HEADER=x-forwarded-for` on Umami to fix that, and `SKIP_LOCATION_HEADERS=1`
  if Cloudflare is in front of Umami.
- You can change the path with `proxyPath`. Pick something that doesn't contain words like
  "umami" or "analytics".

## Options

| Option | Default | Description |
| --- | --- | --- |
| `websiteId` | `''` | Website ID from Umami. |
| `host` | `''` | URL of your Umami instance. |
| `enabled` | `true` | Turn tracking off without removing the module. |
| `proxy` | `true` | Route the tracker and its requests through your Nuxt server. |
| `proxyPath` | `'/_ux'` | Where the proxy is mounted. |
| `scriptPath` | `'/script.js'` | Tracker path on your Umami instance. Change it if you set `TRACKER_SCRIPT_NAME`. |
| `autoTrack` | `true` | Track page views automatically. |
| `ignoreLocalhost` | `true` | Don't track on `localhost`. |
| `domains` | `[]` | Only track on these hostnames. |
| `tag` | `''` | Tag added to all events. |
| `excludeSearch` | `false` | Remove the query string from tracked URLs. |
| `excludeHash` | `false` | Remove the hash from tracked URLs. |
| `doNotTrack` | `false` | Respect the browser's Do Not Track setting. |
| `performance` | `false` | Collect Core Web Vitals. Umami 3.1+. |
| `errors` | `false` | Capture errors. Umami 3.5+. |
| `release` | `''` | Release attached to errors. |
| `environment` | `''` | Environment attached to errors. Umami uses `production` if empty. |
| `salt` | `''` | Extra session salt. Needs `ENABLE_CLIENT_SALT` on the server. Umami 3.5+. |
| `saltRotation` | `''` | `hourly`, `daily`, `weekly` or `monthly`. Umami 3.5+. |
| `replay` | `false` | Load the recorder for replays and heatmaps. Umami 3.1+. |
| `consent` | `false` | Wait for `grantConsent()` before loading anything. |
| `directive` | `true` | Register `v-umami`. |

Every option can be overridden at runtime with `NUXT_PUBLIC_UMAMI_<OPTION>`, e.g.
`NUXT_PUBLIC_UMAMI_ENABLED=false`.

## Coming from `nuxt-umami`

| `nuxt-umami` | here |
| --- | --- |
| `id` | `websiteId` |
| `host` | `host` |
| `proxy: 'cloak'` / `'direct'` | `proxy: true` |
| `urlOptions.excludeSearch` / `excludeHash` | `excludeSearch` / `excludeHash` |
| `useDirective` | `directive` (on by default) |
| `umTrackView()` | `useUmami().track()` |
| `umTrackEvent(name, data)` | `useUmami().track(name, data)` |
| `umIdentify(data)` | `useUmami().identify(data)` |
| `umTrackRevenue(name, value, currency)` | `useUmami().trackRevenue(name, value, currency)` |

`ignoreLocalhost` now defaults to `true`. `urlOptions.trailingSlash` has no direct
replacement; use `beforeSend` if you need it.

## Development

```sh
pnpm install
pnpm dev:prepare
cp playground/.env.example playground/.env   # add your website ID
pnpm dev
```

```sh
pnpm lint
pnpm test
pnpm test:types
```

## License

[MIT](./LICENSE)
