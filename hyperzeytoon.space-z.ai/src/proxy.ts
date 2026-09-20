import { NextRequest, NextResponse } from 'next/server'

/**
 * Session-token fallback for cookie-hostile contexts (preview iframes,
 * in-app webviews). If the client sent `x-session-token` but no session
 * cookie reached us (SameSite restrictions), we inject the cookie header
 * server-side so all API routes using `req.headers.get('cookie')` keep
 * working without any per-file changes.
 *
 * Next.js 16 convention: this file is `proxy.ts` exporting `proxy`
 * (the old `middleware.ts`/`middleware` naming is deprecated).
 */
export function proxy(req: NextRequest) {
  const token = req.headers.get('x-session-token')
  const hasCookie = Boolean(req.cookies.get('hz_session')?.value)

  if (token && !hasCookie) {
    const headers = new Headers(req.headers)
    const existing = headers.get('cookie')
    // Token value is `userId.hmac` — safe charset, no encoding needed
    headers.set(
      'cookie',
      existing ? `${existing}; hz_session=${token}` : `hz_session=${token}`
    )
    return NextResponse.next({ request: { headers } })
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
