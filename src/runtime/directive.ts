import type { ObjectDirective } from 'vue'
import type { EventData, Umami } from './types'

export type UmamiDirectiveValue = string | ({ name: string } & EventData)

export type UmamiDirective = ObjectDirective<HTMLElement, UmamiDirectiveValue>

interface State {
  value: UmamiDirectiveValue
  onClick: () => void
}

export function createDirective(umami: Umami): UmamiDirective {
  const states = new WeakMap<HTMLElement, State>()

  return {
    mounted(el, binding) {
      const state: State = {
        value: binding.value,
        onClick() {
          const value = state.value
          if (typeof value === 'string') {
            umami.track(value)
          }
          else if (value?.name) {
            const { name, ...data } = value
            umami.track(name, data)
          }
        },
      }
      states.set(el, state)
      el.addEventListener('click', state.onClick)
    },
    updated(el, binding) {
      const state = states.get(el)
      if (state)
        state.value = binding.value
    },
    beforeUnmount(el) {
      const state = states.get(el)
      if (state) {
        el.removeEventListener('click', state.onClick)
        states.delete(el)
      }
    },
    getSSRProps: () => ({}),
  }
}
