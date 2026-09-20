/**
 * Gateway check — the BROWSER path: socket.io through the Caddy gateway using
 * the exact client form the platform mandates (relative URL + XTransformPort).
 * From inside the sandbox the gateway is on :81, so this verifies Caddy's
 * XTransformPort forwarding (polling + websocket upgrade) end-to-end.
 * Run: bun gw-check.ts
 */
import { io } from 'socket.io-client'

const GATEWAY = 'http://localhost:81' // Caddy entry inside the sandbox

async function login(username: string): Promise<string> {
  const res = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, pin: '1234' }),
  })
  if (!res.ok) throw new Error(`login failed: ${res.status}`)
  const sc = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('hz_session='))
  if (!sc) throw new Error('no hz_session cookie')
  return sc.split(';')[0]
}

const cookie = await login('z.lotfi')

const result = await new Promise<string>((resolve) => {
  // exact browser form (gateway-relative): path '/', XTransformPort query
  const s = io(`${GATEWAY}/?XTransformPort=3003`, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 2,
    timeout: 8000,
    extraHeaders: { cookie }, // browser would attach it automatically
  })
  const timer = setTimeout(() => { s.close(); resolve('TIMEOUT') }, 9000)
  s.on('connect', () => { clearTimeout(timer); const t = s.io.engine.transport.name; s.close(); resolve(`CONNECTED via ${t}`) })
  s.on('connect_error', (e) => { clearTimeout(timer); s.close(); resolve(`ERROR: ${e.message}`) })
})

console.log(`gateway socket (XTransformPort=3003): ${result}`)
process.exit(result.startsWith('CONNECTED') ? 0 : 1)
