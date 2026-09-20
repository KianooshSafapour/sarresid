/**
 * E2E check for the realtime chat bus (run: bun e2e.ts from this folder).
 *
 * 1. logs in two real staff users (cookie hz_session each)
 * 2. finds (or creates) a DM conversation between them via the Next API
 * 3. opens two authenticated socket.io clients, both join the conversation room
 * 4. user A sends a message through the Next HTTP API (the persistence path)
 * 5. asserts client B receives 'message' (and 'conversation-activity') within 3s,
 *    and that A's typing event reaches B
 * 6. asserts an unauthenticated socket is rejected
 */
import { io, type Socket } from 'socket.io-client'

const NEXT = 'http://localhost:3000'
const BUS = 'http://localhost:3003'
const PIN = '1234'

let failures = 0
const ok = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!cond) failures++
}

async function login(username: string): Promise<{ cookie: string; id: string; name: string }> {
  const res = await fetch(`${NEXT}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, pin: PIN }),
  })
  if (!res.ok) throw new Error(`login ${username} failed: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { user: { id: string; name: string } }
  const setCookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? '']
  const sc = setCookies.find((c) => c.startsWith('hz_session='))
  if (!sc) throw new Error(`no hz_session cookie for ${username}`)
  return { cookie: sc.split(';')[0], id: body.user.id, name: body.user.name }
}

async function api<T>(cookie: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${NEXT}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', cookie, ...(init?.headers ?? {}) },
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text}`)
  return data as T
}

function connect(cookie: string, label: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(BUS, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 2,
      timeout: 6000,
      extraHeaders: { cookie },
    })
    const t = setTimeout(() => { s.close(); reject(new Error(`${label}: connect timeout`)) }, 7000)
    s.on('connect', () => { clearTimeout(t); resolve(s) })
    s.on('connect_error', (e) => { clearTimeout(t); s.close(); reject(new Error(`${label}: ${e.message}`)) })
  })
}

/** listener attached immediately, buffers early events, deadline armed later */
function makeWaiter<T>(attach: (fn: (v: T) => void) => void) {
  let resolver: ((v: T) => void) | null = null
  const buffer: T[] = []
  attach((v: T) => {
    if (resolver) {
      const r = resolver
      resolver = null
      r(v)
    } else {
      buffer.push(v) // event raced ahead of the armed deadline — keep it
    }
  })
  return (ms: number): Promise<T | null> =>
    new Promise((resolve) => {
      if (buffer.length > 0) return resolve(buffer.shift()!)
      let done = false
      resolver = (v) => { if (!done) { done = true; resolve(v) } }
      setTimeout(() => { if (!done) { done = true; resolve(null) } }, ms)
    })
}

async function main() {
  console.log('— login two staff users —')
  const a = await login('z.lotfi')
  const b = await login('f.mohammadi')
  console.log(`  A = ${a.name} (${a.id.slice(0, 8)}…)  B = ${b.name} (${b.id.slice(0, 8)}…)`)

  console.log('— find or create a DM conversation A↔B via Next API —')
  const listA = await api<{ conversations: { id: string; participants: { id: string }[] }[] }>(a.cookie, '/api/chat')
  let convId = listA.conversations.find((c) => c.participants.some((p) => p.id === b.id))?.id
  if (!convId) {
    const created = await api<{ id: string }>(a.cookie, '/api/chat', {
      method: 'POST',
      body: JSON.stringify({ userId: b.id }),
    })
    convId = created.id
    console.log('  (created new DM)', convId)
  } else {
    console.log('  (existing)', convId)
  }

  console.log('— open two authenticated sockets and join the room —')
  const sockA = await connect(a.cookie, 'A')
  const sockB = await connect(b.cookie, 'B')
  ok('socket A authenticated + connected', sockA.connected)
  ok('socket B authenticated + connected', sockB.connected)

  // listeners attach now; their 3s assertion deadline starts AFTER the HTTP
  // response returns (persist → emit → deliver), excluding any first-hit
  // route compilation time
  const waitBMessage = makeWaiter<{ id: string; content: string; userName: string }>((fn) => sockB.on('message', fn))
  const waitBActivity = makeWaiter<{ conversationId: string }>((fn) => sockB.on('conversation-activity', fn))
  const waitBTyping = makeWaiter<{ conversationId: string; name: string }>((fn) => sockB.on('typing', fn))
  const waitOwnMessage = makeWaiter<{ id: string }>((fn) => sockA.on('message', fn))

  sockA.emit('join', { conversationId: convId })
  sockB.emit('join', { conversationId: convId })
  await new Promise((r) => setTimeout(r, 900)) // allow server-side membership validation + join

  // warm the dynamic route so compile time never pollutes the 3s measure
  await api(a.cookie, `/api/chat/${convId}`)

  console.log('— A emits typing, then posts a message via the HTTP API (persistence path) —')
  sockA.emit('typing', { conversationId: convId, name: a.name })
  const content = `پیام آزمایش تحویل لحظه‌ای — ${Date.now()}`
  const t0 = Date.now()
  const sent = await api<{ message: { id: string } }>(a.cookie, `/api/chat/${convId}`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
  console.log(`  POST /api/chat/${convId.slice(0, 8)}… → id ${sent.message.id.slice(0, 8)}…`)

  const received = await waitBMessage(3000)
  const dt = Date.now() - t0
  ok(`B received 'message' within 3s (${dt}ms)`, !!received && received.content === content && dt <= 3000,
    received ? `"${received.content.slice(0, 30)}" از ${received.userName}` : 'NO EVENT')
  ok('message id matches the persisted row', !!received && received.id === sent.message.id)

  const activity = await waitBActivity(3000)
  ok(`B received 'conversation-activity' for ${convId.slice(0, 8)}…`, !!activity && activity.conversationId === convId,
    activity ? JSON.stringify(activity) : 'NO EVENT')

  const typing = await waitBTyping(3000)
  ok('B received typing from A', !!typing && typing.conversationId === convId,
    typing ? `${typing.name} — «در حال نوشتن…»` : 'NO EVENT')

  const own = await waitOwnMessage(3000)
  ok("A's own socket also got 'message' (client dedupes by id)", !!own && own.id === sent.message.id)

  console.log('— unauthenticated socket must be rejected —')
  const rejected = await new Promise<boolean>((resolve) => {
    const s = io(BUS, { transports: ['websocket', 'polling'], reconnectionAttempts: 1, timeout: 4000 })
    s.on('connect', () => { s.close(); resolve(false) })
    s.on('connect_error', () => { s.close(); resolve(true) })
    setTimeout(() => { s.close(); resolve(false) }, 5000)
  })
  ok('socket without hz_session cookie rejected', rejected)

  sockA.close()
  sockB.close()
  console.log(failures === 0 ? '\n🎉 E2E PASS — realtime bus verified end-to-end' : `\n💥 E2E FAIL — ${failures} assertion(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('💥 e2e crashed:', e)
  process.exit(1)
})
