// Stand-in for Nuxt's #imports when server runtime files are tested without a Nuxt build
export const runtimeConfig = {
  umami: { host: 'https://umami.test' },
  public: {
    umami: { enabled: true, websiteId: 'site', host: '', scriptPath: '/script.js' },
  },
}

export const useRuntimeConfig = () => runtimeConfig
