/**
 * Hyper Zeytoon — realtime chat bus (socket.io mini-service)
 * ----------------------------------------------------------
 * Instant-delivery layer for the internal chat. Persistence stays in the
 * Next.js API (single writer, SQLite at :3000); this service is only the bus:
 *
 *   client → 'join' {conversationId}   (validated against Next API membership, 60s cache)
 *   client → 'leave' {conversationId}
 *   client → 'typing' {conversationId, name, userId}  → broadcast to room except sender
 *   Next API POST :3003/emit  (localhost + x-hz-internal: 1)
 *        → io.to(conversationId).emit('message', message)
 *        → io.to(`user:{participantId}`).emit('conversation-activity', …) for every
 *          other participant (unread badge refresh for closed threads)
 *
 * Auth: the browser connects with `io('/?XTransformPort=3003', { withCredentials: true })`
 * through the Caddy gateway; the hz_session cookie (HMAC `userId.sig`, see src/lib/auth.ts)
 * is verified by calling the Next API GET /api/auth/me with the forwarded cookie.
 * Cookie-hostile contexts (preview iframes) may pass the same signed token via
 * handshake.auth.token — it is synthesized into the cookie header server-side.
 *
 * Platform rule: socket.io path stays '/' (the gateway forwards by XTransformPort
 * query, the client keeps its default request path /socket.io).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { Server, type Socket } from 'socket.io'

const PORT = 3003 // fixed by platform convention (gateway XTransformPort=3003)
const NEXT_ORIGIN = 'http://localhost:3000'
const AUTH_TIMEOUT_MS = 3000
const MEMBERSHIP_TTL_MS = 60_000
const BODY_LIMIT = 64 * 1024

// ---------- typed contracts ----------
interface ServerToClientEvents {
  message: (payload: SocketMessage) => void
  typing: (payload: TypingPayload) => void
  'conversation-activity': (payload: ActivityPayload) => void
}

interface ClientToServerEvents {
  join: (payload: { conversationId?: string }) => void
  leave: (payload: { conversationId?: string }) => void
  typing: (payload: { conversationId?: string; name?: string; userId?: string }) => void
}

interface InterServerEvents {
  ping: () => void
}

interface SocketData {
  userId: string
  name: string
  username: string
  cookie: string | null
}

interface SocketMessage {
  id: string
  conversationId?: string
  userId: string
  userName: string
  userColor?: string
  content: string
  createdAt: string
}

interface TypingPayload {
  conversationId: string
  name: string
  userId?: string
}

interface ActivityPayload {
  conversationId: string
  message?: Pick<SocketMessage, 'id' | 'userId' | 'userName' | 'userColor' | 'content' | 'createdAt'>
}

interface AuthedUser {
  id: string
  name: string
  username: string
}

// ---------- tiny timestamped logger ----------
const ts = () => new Date().toISOString()
const log = (...args: unknown[]) => console.log(`[${ts()}]`, ...args)
const logErr = (...args: unknown[]) => console.error(`[${ts()}]`, ...args)

// ---------- helpers ----------
function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms)
}

/** Call the Next API to verify an hz_session cookie (or synthesized one). */
async function fetchAuthUser(cookie: string | null): Promise<AuthedUser | null> {
  try {
    const res = await fetch(`${NEXT_ORIGIN}/api/auth/me`, {
      headers: cookie ? { cookie } : {},
      signal: timeoutSignal(AUTH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { user?: AuthedUser | null }
    const user = data.user
    if (!user || typeof user.id !== 'string' || !user.id) return null
    return { id: user.id, name: user.name ?? user.username, username: user.username ?? '' }
  } catch (e) {
    logErr('auth check failed:', e instanceof Error ? e.message : e)
    return null
  }
}

/** Per-user membership cache — avoids hitting the Next API on every join. */
const membershipCache = new Map<string, { ids: Set<string>; expires: number }>()

async function fetchConversationIds(userId: string, cookie: string | null): Promise<Set<string>> {
  const cached = membershipCache.get(userId)
  if (cached && cached.expires > Date.now()) return cached.ids
  const res = await fetch(`${NEXT_ORIGIN}/api/chat`, {
    headers: { cookie: cookie ?? '' },
    signal: timeoutSignal(AUTH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`membership lookup ${res.status}`)
  const data = (await res.json()) as { conversations?: { id: string }[] }
  const ids = new Set((data.conversations ?? []).map((c) => c.id))
  membershipCache.set(userId, { ids, expires: Date.now() + MEMBERSHIP_TTL_MS })
  return ids
}

// ---------- servers ----------
const httpServer = createServer()

const io = new Server<ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData>(httpServer, {
  // DO NOT change the path — used by the Caddy gateway (XTransformPort forwarding)
  path: '/',
  cors: {
    origin: true, // reflect any origin — internal intranet only
    credentials: true,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

/**
 * engine.io was attached with path '/' — its request handler swallows every
 * URL, so POST /emit would never reach a plain listener. Re-route: keep
 * '/socket.io*' on engine.io (client default path) and serve our HTTP API
 * (POST /emit) from everything else.
 */
const engineHandlers = httpServer.listeners('request').slice()
httpServer.removeAllListeners('request')
httpServer.on('request', (req, res) => {
  const url = req.url ?? ''
  if (url.startsWith('/socket.io')) {
    for (const h of engineHandlers) h.call(httpServer, req, res)
    return
  }
  if (url === '/emit' || url.startsWith('/emit?')) {
    void handleEmit(req, res)
    return
  }
  res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ error: 'not found' }))
})

const isLocalAddress = (addr: string | undefined | null) =>
  addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'

/** POST /emit — internal bus for the Next API (localhost + x-hz-internal only). */
async function handleEmit(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const reply = (code: number, body: object) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
  }
  try {
    if (req.method !== 'POST') return reply(405, { error: 'POST only' })
    const ip = req.socket.remoteAddress
    if (!isLocalAddress(ip)) {
      log(`emit rejected — non-local remote ${ip}`)
      return reply(403, { error: 'forbidden' })
    }
    if (req.headers['x-hz-internal'] !== '1') {
      log(`emit rejected — missing x-hz-internal header`)
      return reply(403, { error: 'forbidden' })
    }

    let raw = ''
    for await (const chunk of req) {
      raw += chunk
      if (raw.length > BODY_LIMIT) return reply(413, { error: 'payload too large' })
    }
    const body = JSON.parse(raw || '{}') as {
      conversationId?: string
      message?: SocketMessage
      participantIds?: string[]
    }
    const { conversationId, message, participantIds } = body
    if (!conversationId || !message?.id || !message.userId || !message.content) {
      return reply(400, { error: 'conversationId and message {id, userId, content} are required' })
    }

    io.to(conversationId).emit('message', message)

    // unread-badge refresh for every OTHER participant (personal rooms)
    const others = Array.isArray(participantIds)
      ? participantIds.filter((id) => typeof id === 'string' && id && id !== message.userId)
      : []
    const activity: ActivityPayload = { conversationId, message }
    for (const pid of others) io.to(`user:${pid}`).emit('conversation-activity', activity)

    log(`message ${message.id} → room ${conversationId} + activity → ${others.length} participant(s)`)
    return reply(200, { ok: true, messageRoom: conversationId, activityRooms: others.length })
  } catch (e) {
    logErr('emit failed:', e instanceof Error ? e.message : e)
    return reply(400, { error: 'bad request' })
  }
}

// ---------- auth middleware ----------
io.use(async (socket, next) => {
  try {
    const hs = socket.handshake
    let cookie: string | null = hs.headers.cookie ?? null
    // Cookie-hostile contexts (preview iframes): signed token via handshake auth
    const token = typeof hs.auth?.token === 'string' ? hs.auth.token : null
    if (!cookie && token) cookie = `hz_session=${token}`

    const user = await fetchAuthUser(cookie)
    if (!user) {
      log(`handshake rejected — unauthenticated socket ${socket.id}`)
      return next(new Error('unauthorized'))
    }
    socket.data.userId = user.id
    socket.data.name = user.name
    socket.data.username = user.username
    socket.data.cookie = cookie
    // personal room — target of conversation-activity (unread badge refresh)
    socket.join(`user:${user.id}`)
    log(`socket ${socket.id} connected — user ${user.id} (${user.name})`)
    next()
  } catch (e) {
    logErr('auth middleware error:', e instanceof Error ? e.message : e)
    next(new Error('auth failed'))
  }
})

// ---------- socket events ----------
io.on('connection', (socket: Socket<ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData>) => {
  socket.on('join', ({ conversationId }) => {
    if (typeof conversationId !== 'string' || !conversationId) return
    void (async () => {
      try {
        const ids = await fetchConversationIds(socket.data.userId, socket.data.cookie)
        if (!ids.has(conversationId)) {
          log(`join denied — user ${socket.data.userId} is not a participant of ${conversationId}`)
          return
        }
        socket.join(conversationId)
        log(`socket ${socket.id} (${socket.data.name}) joined room ${conversationId}`)
      } catch (e) {
        logErr(`join failed for ${socket.data.userId}:`, e instanceof Error ? e.message : e)
      }
    })()
  })

  socket.on('leave', ({ conversationId }) => {
    if (typeof conversationId !== 'string' || !conversationId) return
    socket.leave(conversationId)
    log(`socket ${socket.id} (${socket.data.name}) left room ${conversationId}`)
  })

  socket.on('typing', ({ conversationId, name }) => {
    if (typeof conversationId !== 'string' || !conversationId) return
    // only honor typing for rooms the socket actually joined
    if (!socket.rooms.has(conversationId)) return
    const payload: TypingPayload = {
      conversationId,
      name: socket.data.name || (typeof name === 'string' ? name : ''),
      userId: socket.data.userId,
    }
    socket.to(conversationId).emit('typing', payload)
  })

  socket.on('disconnect', (reason) => {
    log(`socket ${socket.id} (${socket.data.name}) disconnected — ${reason}`)
  })

  socket.on('error', (e) => {
    logErr(`socket ${socket.id} error:`, e instanceof Error ? e.message : e)
  })
})

httpServer.listen(PORT, () => {
  log(`chat-service (socket.io) listening on :${PORT} — bus only, persistence lives in Next API :3000`)
})

// ---------- graceful shutdown ----------
function shutdown(signal: string) {
  log(`received ${signal} — shutting down…`)
  io.close(() => {
    log('chat-service closed')
    process.exit(0)
  })
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
