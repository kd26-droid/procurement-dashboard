'use client'

/**
 * Clarity session recording for the procurement strategy dashboard.
 *
 * Loads Microsoft Clarity's tracker in the iframe context so user
 * activity on this dashboard is actually captured. Without this, the
 * parent Factwise app records fine but sees the iframe as an opaque
 * black box (browser same-origin policy blocks cross-origin DOM
 * access), so any Retry Pricing, cell edit, or auto-assign flow that
 * happens here would be invisible in playback.
 *
 * Uses the same Clarity project id as Factwise ('gkms7gyphq') so both
 * sides land in the same Clarity workspace. Sessions from the iframe
 * and the parent are attributed to different origins, but the
 * `session_id` custom tag we set here lets you filter Clarity by that
 * tag to reunite them.
 *
 * User identity is decoded from the JWT the iframe URL already carries
 * (see App.tsx StrategyIframeRoute in factwise-integrated), so we don't
 * add any new plumbing to the parent. We only read the payload for the
 * `oid` / `name` claims — never verify the signature (this is
 * client-side attribution, not authorization).
 */

import { useEffect } from 'react'

const CLARITY_PROJECT_ID = 'gkms7gyphq'
const CLARITY_UPLOAD_URL = 'https://m.clarity.ms/collect'
const FRONTEND_SESSION_KEY = 'app_session_id'

type JwtPayload = {
  oid?: string
  sub?: string
  name?: string
  extension_EnterpriseUserId?: string
  extension_EnterpriseId?: string
}

// Base64URL decode a JWT payload. Never validates the signature — we only
// need identity claims for Clarity attribution, and the JWT is already
// trusted by the API on every request.
function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const raw = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = raw + '='.repeat((4 - (raw.length % 4)) % 4)
    return JSON.parse(atob(padded)) as JwtPayload
  } catch {
    return null
  }
}

function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(FRONTEND_SESSION_KEY)
    if (existing) return existing
    const fresh = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    sessionStorage.setItem(FRONTEND_SESSION_KEY, fresh)
    return fresh
  } catch {
    // sessionStorage can throw in some sandboxed iframe contexts.
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
}

function readSessionIdFromUrl(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('session_id')
  } catch {
    return null
  }
}

// Injects the standard Clarity bootstrap snippet. Sits in a fixed slot on
// window.clarity as a queueing function until the real script (from
// clarity.ms/tag/<projectId>) loads and drains the queue. This is exactly
// the same snippet Clarity's dashboard hands you when you set up a new
// project — we just do it once from React instead of pasting into <head>.
function installClarityScript(projectId: string) {
  if (typeof window === 'undefined') return
  if ((window as any).clarity) return
  ;(function (c: any, l: Document, a: string, r: string, i: string) {
    c[a] =
      c[a] ||
      function () {
        // eslint-disable-next-line prefer-rest-params
        ;(c[a].q = c[a].q || []).push(arguments)
      }
    const t = l.createElement(r) as HTMLScriptElement
    t.async = true
    t.src = 'https://www.clarity.ms/tag/' + i
    const y = l.getElementsByTagName(r)[0]
    y.parentNode?.insertBefore(t, y)
  })(window as any, document, 'clarity', 'script', projectId)
}

export function ClarityProvider() {
  useEffect(() => {
    // Bail if a Clarity opt-out is in effect (e.g. dev servers, local test).
    if (process.env.NEXT_PUBLIC_DISABLE_CLARITY === '1') return
    if (typeof window === 'undefined') return

    installClarityScript(CLARITY_PROJECT_ID)

    // Prefer a session_id passed explicitly from the parent Factwise
    // shell (correlates iframe + parent sessions in Clarity). Fall back
    // to our own sessionStorage-scoped id if we weren't handed one.
    const sessionId = readSessionIdFromUrl() ?? getOrCreateSessionId()

    // Custom tag lets you filter Clarity by session_id to find the
    // matching parent-page recording, the Bugsink error, and the
    // backend health-monitor row for the same user journey.
    ;(window as any).clarity?.('set', 'session_id', sessionId)
    ;(window as any).clarity?.('set', 'surface', 'procurement-strategy-dashboard')
    ;(window as any).clarity?.('set', 'upload', CLARITY_UPLOAD_URL)

    // Try to identify the user from the JWT in the URL. Factwise passes
    // ?token=<jwt> when it mounts the iframe; the payload has an `oid`
    // (Azure AD B2C user id) and a `name` claim we can use.
    try {
      const token = new URLSearchParams(window.location.search).get('token')
      if (token) {
        const payload = decodeJwtPayload(token)
        const userId = payload?.oid ?? payload?.sub
        const displayName = payload?.name
        if (userId) {
          ;(window as any).clarity?.(
            'identify',
            userId,
            sessionId,
            undefined,
            displayName
          )
          if (payload?.extension_EnterpriseId) {
            ;(window as any).clarity?.(
              'set',
              'enterprise_id',
              payload.extension_EnterpriseId
            )
          }
        }
      }
    } catch {
      // Never let observability break rendering.
    }
  }, [])

  return null
}
