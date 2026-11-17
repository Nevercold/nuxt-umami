export default defineNuxtConfig({
  modules: ['../src/module'],
  devtools: { enabled: true },
  compatibilityDate: '2026-11-01',
  umami: {
    // set NUXT_PUBLIC_UMAMI_WEBSITE_ID and NUXT_UMAMI_HOST in playground/.env
    ignoreLocalhost: false,
    errors: true,
    performance: true,
    replay: true,
    consent: true,
  },
})
