import type { Ref } from 'vue'

export type EventDataValue = boolean | number | string | null | EventData | EventDataValue[]

export interface EventData {
  [key: string]: EventDataValue | undefined
}

export type Payload = Record<string, unknown>

export type BeforeSend = (
  type: string,
  payload: Payload,
) => Payload | null | undefined | Promise<Payload | null | undefined>

export interface ErrorCaptureOptions {
  release?: string
  environment?: string
  tags?: Record<string, string>
  fingerprint?: string | string[]
}

export interface UmamiTracker {
  track: (...args: unknown[]) => Promise<void>
  identify: (...args: unknown[]) => Promise<void>
  captureException: (error: unknown, options?: ErrorCaptureOptions) => Promise<void>
  getSession: () => { cache: string | undefined, website: string }
}

export interface Umami {
  /**
   * Without arguments, tracks a page view for the current URL.
   * With a name, tracks a custom event (Umami cuts names off after 50 characters).
   * With an object or function, sends a custom payload or changes the default one.
   */
  track: (event?: string | Payload | ((payload: Payload) => Payload), data?: EventData) => Promise<void>
  /**
   * Track a page view. Without arguments it uses the current URL, like `track()`.
   * Pass `url` to record a different path, and `referrer` to replace the referrer as well.
   * `excludeSearch` and `excludeHash` apply to the given URL too.
   */
  trackView: (url?: string, referrer?: string) => Promise<void>
  /** Attach a distinct ID and optional session data to the current session. */
  identify(id: string, data?: EventData): Promise<void>
  /** Save session data. An `id` field is used as the distinct ID. */
  identify(data: EventData & { id?: string }): Promise<void>
  /** Track an event with revenue. Currency is an ISO 4217 code. */
  trackRevenue: (name: string, revenue: number, currency?: string, data?: EventData) => Promise<void>
  /** Report a caught error. Needs `errors: true`. */
  captureException: (error: unknown, options?: ErrorCaptureOptions) => Promise<void>
  /** Change or drop payloads before they are sent. Returns a function that removes the hook. */
  beforeSend: (fn: BeforeSend) => () => void
  /** Start tracking when `consent: true` is set. */
  grantConsent: () => Promise<void>
  /** Stop sending events. A running replay recording stops on the next page load. */
  revokeConsent: () => void
  /** Whether events are currently allowed to be sent. */
  hasConsent: Readonly<Ref<boolean>>
}

declare global {
  interface Window {
    umami?: UmamiTracker
    umamiConfig?: Record<string, unknown>
  }
}
