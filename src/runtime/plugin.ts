import type { Plugin } from '#app'
import { defineNuxtPlugin, useRuntimeConfig } from '#imports'
import { createDirective } from './directive'
import type { UmamiDirective } from './directive'
import type { Umami } from './types'
import { createNoopUmami, createUmami } from './umami'

const plugin: Plugin<{ umami: Umami }> = defineNuxtPlugin({
  name: 'umami',
  enforce: 'pre',
  setup(nuxtApp): { provide: { umami: Umami } } {
    const options = useRuntimeConfig().public.umami
    const umami: Umami = import.meta.client
      ? createUmami(options, nuxtApp.$config.app.baseURL)
      : createNoopUmami(!options.consent)

    if (options.directive)
      nuxtApp.vueApp.directive('umami', createDirective(umami))

    if (import.meta.client && options.errors) {
      // 4xx errors thrown with createError are expected (e.g. 404 pages), not bugs
      const capture = (error: unknown) => {
        const status = (error as { statusCode?: number } | null)?.statusCode
        if (!status || status >= 500)
          umami.captureException(error)
      }
      nuxtApp.hook('vue:error', capture)
      nuxtApp.hook('app:error', capture)
    }

    return {
      provide: { umami },
    }
  },
})

export default plugin

declare module 'vue' {
  interface GlobalDirectives {
    vUmami: UmamiDirective
  }
}
