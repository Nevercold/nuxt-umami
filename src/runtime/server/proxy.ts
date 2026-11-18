import { createError, defineEventHandler, getRouterParam, readRawBody, setResponseHeader, setResponseStatus } from 'h3'
import { joinURL } from 'ufo'
import { useRuntimeConfig } from '#imports'
import { getForwardHeaders } from './forward'
import { UPSTREAM_TIMEOUT, describeError, describeResponse, isTimeout, warnOnce } from './log'

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

  const isRecorderConfig = RECORDER_CONFIG.test(path)
  const route = path === scriptPath
    ? ROUTES['script.js']
    : ROUTES[path] ?? (isRecorderConfig ? { method: 'GET' } as Route : undefined)

  if (!host || !route)
    throw createError({ statusCode: 404 })

  if (event.method !== route.method)
    throw createError({ statusCode: 405 })

  // the website ID is part of the recorder config path, keep it out of the log keys
  const logPath = isRecorderConfig ? 'api/websites/:id/recorder' : path
  const headers = getForwardHeaders(event)
  const body = route.method === 'POST' ? await readRawBody(event, false) : undefined
  let response: Response
  try {
    response = await fetch(joinURL(host, path), {
      method: route.method,
      headers,
      body: body ? new Uint8Array(body) : undefined,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
    })
  }
  catch (error) {
    const reason = describeError(error)
    warnOnce(`proxy:${logPath}:${reason}`, `Could not reach ${host} for /${logPath}: ${reason}`)
    throw createError({ statusCode: isTimeout(error) ? 504 : 502 })
  }

  if (!response.ok) {
    const details = describeResponse(response)
    warnOnce(
      `proxy:${logPath}:${response.status}`,
      `${host} answered /${logPath} with ${response.status}${details ? ` (${details})` : ''}`,
    )
  }

  setResponseStatus(event, response.status)
  const type = response.headers.get('content-type')
  if (type)
    setResponseHeader(event, 'content-type', type)
  setResponseHeader(event, 'cache-control', route.cache && response.ok ? 'public, max-age=3600' : 'no-store')

  return response.text()
})
