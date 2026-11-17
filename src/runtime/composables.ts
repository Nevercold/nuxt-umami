import { useNuxtApp } from '#imports'
import type { Umami } from './types'

export function useUmami(): Umami {
  return useNuxtApp().$umami
}
