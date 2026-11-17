<script setup lang="ts">
const umami = useUmami()

function buy() {
  umami.trackRevenue('checkout', 19.99, 'EUR', { plan: 'pro' })
}

function login() {
  umami.identify('user-42', { plan: 'pro' })
}

function fail() {
  throw new Error('Playground test error')
}
</script>

<template>
  <section>
    <h1>Home</h1>
    <button v-umami="'signup-click'">
      Directive (string)
    </button>
    <button v-umami="{ name: 'cta-click', position: 'hero' }">
      Directive (object)
    </button>
    <button @click="buy">
      Revenue
    </button>
    <button @click="login">
      Identify
    </button>
    <button @click="fail">
      Throw error
    </button>
  </section>
</template>
