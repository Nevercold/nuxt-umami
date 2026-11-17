import { defineEventHandler, sendUmamiEvent } from '#imports'

export default defineEventHandler(async (event) => {
  const ok = await sendUmamiEvent(event, { name: 'order', data: { total: 42 } })
  return { ok }
})
