import UmamiModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [UmamiModule],
  umami: {
    websiteId: 'test-website',
    host: process.env.UMAMI_TEST_HOST,
  },
})
