/**
 * Chat bus keeper — makes sure the realtime socket.io mini-service
 * (mini-services/chat-service, fixed port 3003) is running.
 *
 * Why here: the bus is a separate bun process; the Next API stays the single
 * writer (SQLite) and only forwards fresh messages to the bus via POST /emit.
 * If the bus is not up (fresh boot, crash), the first chat API touch boots it
 * as a child of this server process. All callers are fire-and-forget — this
 * helper can never break or slow an API response.
 */
const PORT = 3003
const SERVICE_DIR = '/home/z/my-project/mini-services/chat-service'

const g = globalThis as { __hzChatBusBooted?: boolean }

async function portAlive(): Promise<boolean> {
  try {
    const net = await import('net')
    return await new Promise<boolean>((resolve) => {
      const s = net.connect(PORT, '127.0.0.1')
      const done = (v: boolean) => {
        s.destroy()
        resolve(v)
      }
      s.once('connect', () => done(true))
      s.once('error', () => done(false))
      setTimeout(() => done(false), 900)
    })
  } catch {
    return false
  }
}

/** Idempotent, never throws. Boots the chat bus at most once per process. */
export async function ensureChatBus(): Promise<void> {
  try {
    if (g.__hzChatBusBooted) return
    g.__hzChatBusBooted = true

    if (await portAlive()) {
      console.log('[hz-chat-bus] already listening on :3003 — not spawning')
      return
    }

    const { spawn } = await import('child_process')
    const fs = await import('fs')
    const out = fs.openSync(`${SERVICE_DIR}/chat.log`, 'a')
    const child = spawn('bun', ['--hot', 'index.ts'], {
      cwd: SERVICE_DIR,
      stdio: ['ignore', out, out],
      env: process.env,
    })
    child.unref()
    child.on('error', (e) => console.error('[hz-chat-bus] spawn failed:', e.message))
    console.log(`[hz-chat-bus] spawned (pid ${child.pid}) on :${PORT}`)
  } catch (e) {
    console.error('[hz-chat-bus] boot failed:', e instanceof Error ? e.message : e)
  }
}
