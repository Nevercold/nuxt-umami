<script setup lang="ts">
const umami = useUmami()
</script>

<template>
  <main>
    <nav>
      <NuxtLink to="/">
        Home
      </NuxtLink>
      <NuxtLink to="/about">
        About
      </NuxtLink>
    </nav>

    <p>Consent: {{ umami.hasConsent.value ? 'granted' : 'pending' }}</p>
    <button @click="umami.grantConsent()">
      Accept
    </button>
    <button @click="umami.revokeConsent()">
      Decline
    </button>

    <NuxtPage />
  </main>
</template>
