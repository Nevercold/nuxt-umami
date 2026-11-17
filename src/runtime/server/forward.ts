import type { H3Event } from 'h3'
import { getRequestHeader, getRequestHeaders } from 'h3'

const IP_HEADERS = [
  'cf-connecting-ip',
  'x-nf-client-connection-ip',
  'fly-client-ip',
  'true-client-ip',
  'x-real-ip',
  'x-forwarded-for',
]

const PASS_HEADERS = new Set(['user-agent', 'accept-language', 'content-type'])
const PASS_PREFIXES = ['x-umami-', 'cf-ip', 'x-vercel-ip-']

export function getClientIp(event: H3Event): string | undefined {
  for (const name of IP_HEADERS) {
    const value = getRequestHeader(event, name)?.split(',')[0]?.trim()
    if (value)
      return value
  }
  return event.node.req.socket?.remoteAddress
}

/**
 * Builds the headers Umami needs to attribute a request to the visitor.
 * Cookies and auth headers of your own site are never forwarded.
 */
export function getForwardHeaders(event: H3Event): Headers {
  const headers = new Headers()

  for (const [name, value] of Object.entries(getRequestHeaders(event))) {
    if (value && (PASS_HEADERS.has(name) || PASS_PREFIXES.some(prefix => name.startsWith(prefix))))
      headers.set(name, value)
  }

  const ip = getClientIp(event)
  if (ip) {
    headers.set('x-forwarded-for', ip)
    headers.set('x-real-ip', ip)
  }

  return headers
}
