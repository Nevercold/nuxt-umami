import { createError, defineEventHandler, getRouterParam, readRawBody, setResponseHeader, setResponseStatus } from 'h3'
import { joinURL } from 'ufo'
import { useRuntimeConfig } from '#imports'
import { getForwardHeaders } from './forward'

type Route = { method: 'GET' | 'POST', cache?: boolean }

const ROUTES: Record<string, Route> = {
  'script.js': { method: 'GET', cache: true },
  'recorder.js': { method: 'GET', cache: true },
  'api/send': { method: 'POST' },
  'api/record': { method: 'POST' },
}

const RECORDER_CONFIG = /^api\/websites\/[\w-]+\/recorder$/

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const host = config.umami.host
  const path = getRouterParam(event, '_') ?? ''
  const scriptPath = config.public.umami.scriptPath.slice(1)

  const route = path === scriptPath
    ? ROUTES['script.js']
    : ROUTES[path] ?? (RECORDER_CONFIG.test(path) ? { method: 'GET' } as Route : undefined)

  if (!host || !route)
    throw createError({ statusCode: 404 })

  if (event.method !== route.method)
    throw createError({ statusCode: 405 })

  const headers = getForwardHeaders(event)
  const body = route.method === 'POST' ? await readRawBody(event, false) : undefined
  let response: Response
  try {
    response = await fetch(joinURL(host, path), {
      method: route.method,
      headers,
      body: body ? new Uint8Array(body) : undefined,
    })
  }
  catch {
    throw createError({ statusCode: 502 })
  }

  setResponseStatus(event, response.status)
  const type = response.headers.get('content-type')
  if (type)
    setResponseHeader(event, 'content-type', type)
  setResponseHeader(event, 'cache-control', route.cache && response.ok ? 'public, max-age=3600' : 'no-store')

  return response.text()
})
