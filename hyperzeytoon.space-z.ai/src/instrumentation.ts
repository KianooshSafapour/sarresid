/**
 * Next.js instrumentation hook (runs once per server boot).
 *
 * Boots the realtime chat bus mini-service (mini-services/chat-service —
 * socket.io, fixed port 3003) alongside the Next server. The Node-only logic
 * lives in `src/lib/chat-bus.ts` and is imported only when
 * NEXT_RUNTIME === 'nodejs', so the Edge bundler never traces Node built-ins.
 *
 * The same guard also runs lazily from the chat API routes (`ensureChatBus`),
 * which covers dev servers that were already running when the bus was added.
 * The service keeps its own lockfile/package.json and can still be started
 * standalone: cd mini-services/chat-service && bun run dev
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureChatBus } = await import('@/lib/chat-bus')
    await ensureChatBus()
  }
}
