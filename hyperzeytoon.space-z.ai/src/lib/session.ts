'use client'

/**
 * Session token fallback storage.
 *
 * Why: inside preview iframes / in-app webviews (Telegram, Instagram, some
 * Android browsers) cookies with SameSite=Lax are dropped or not sent, which
 * made mobile users see «ابتدا وارد شوید» right after a successful login.
 * The signed session token is therefore ALSO kept in localStorage and sent
 * via the `x-session-token` header; middleware injects it as the session
 * cookie server-side so every API route keeps working unchanged.
 */
const KEY = 'hz_session_token'

export function setSessionToken(token: string): void {
  try {
    localStorage.setItem(KEY, token)
  } catch {
    /* storage unavailable — cookie path still works in normal contexts */
  }
}

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearSessionToken(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
}
