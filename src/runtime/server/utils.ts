import type { H3Event } from 'h3'
import { getRequestHeader, getRequestHost, getRequestURL } from 'h3'
import { joinURL } from 'ufo'
import { useRuntimeConfig } from '#imports'
import type { EventData } from '../types'
import { getForwardHeaders } from './forward'
import { UPSTREAM_TIMEOUT, describeError, describeResponse, warnOnce } from './log'

export interface ServerEvent {
  /** Event name. Leave empty to track a page view. */
  name?: string
  data?: EventData
  /** Defaults to the path of the current request. */
  url?: string
  title?: string
  referrer?: string
}

/**
 * Send an event to Umami from a server route. Visitor details (IP, user agent,
 * language) are taken from the incoming request. Resolves to `false` if the
 * event could not be delivered; it never throws.
 */
export async function sendUmamiEvent(event: H3Event, input: ServerEvent = {}): Promise<boolean> {
  const config = useRuntimeConfig(event)
  const { enabled, websiteId } = config.public.umami
  const host = config.umami.host || config.public.umami.host

  if (!enabled || !websiteId || !host)
    return false

  const headers = getForwardHeaders(event)
  headers.set('content-type', 'application/json')

  const payload = {
    website: websiteId,
    hostname: getRequestHost(event, { xForwardedHost: true }).split(':')[0],
    language: getRequestHeader(event, 'accept-language')?.split(',')[0],
    url: input.url ?? getRequestURL(event).pathname,
    referrer: input.referrer,
    title: input.title,
    name: input.name,
    data: input.data,
  }

  let response: Response
  try {
    response = await fetch(joinURL(host, '/api/send'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ type: 'event', payload }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT),
    })
  }
  catch (error) {
    const reason = describeError(error)
    warnOnce(`send:${reason}`, `sendUmamiEvent could not reach ${host}: ${reason}`)
    return false
  }

  if (!response.ok) {
    const details = describeResponse(response)
    warnOnce(
      `send:${response.status}`,
      `sendUmamiEvent: ${host} answered with ${response.status}${details ? ` (${details})` : ''}`,
    )
  }
  return response.ok
}
