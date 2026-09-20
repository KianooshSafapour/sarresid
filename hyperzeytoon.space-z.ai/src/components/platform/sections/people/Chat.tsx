'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { getSessionToken } from '@/lib/session'
import { io, type Socket } from 'socket.io-client'
import { toast as sonnerToast } from 'sonner'
import { useApp } from '@/store/app'
import { useToast } from '@/hooks/use-toast'
import { SectionHeader, EmptyState, LoadingBlock, UserAvatar } from '@/components/platform/ui/shared'
import { timeAgo, formatTime, toFaDigits } from '@/lib/jalali'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { MessagesSquare, Plus, Send, Loader2, Lock, ArrowRight, Users, Search } from 'lucide-react'

interface ParticipantDTO {
  id: string
  name: string
  color: string
  title: string
}

interface ConversationDTO {
  id: string
  isGroup: boolean
  title: string
  participants: ParticipantDTO[]
  lastMessage?: { content: string; createdAt: string; mine: boolean } | null
  unreadCount: number
  updatedAt: string
}

interface MessageDTO {
  id: string
  content: string
  createdAt: string
  mine: boolean
  userName: string
  userColor: string
}

interface UserLite extends ParticipantDTO {
  active: boolean
}

// ============================================================
// Realtime bus (socket.io mini-service on :3003 through the gateway)
// Persistence stays in the Next API — the socket layer only delivers
// instantly what the API already persisted, plus typing + unread
// badge refresh signals.
// ============================================================

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

type ChatClientToServer = {
  join: (p: { conversationId: string }) => void
  leave: (p: { conversationId: string }) => void
  typing: (p: { conversationId: string; name: string }) => void
}

type ChatServerToClient = {
  message: (p: SocketMessage) => void
  typing: (p: TypingPayload) => void
  'conversation-activity': (p: ActivityPayload) => void
}

type ConnState = 'connecting' | 'online'

// connection state fan-out for the singleton (header dot in every mounted surface)
const connListeners = new Set<(s: ConnState) => void>()
let connState: ConnState = 'connecting'
function setConn(next: ConnState) {
  connState = next
  connListeners.forEach((fn) => fn(next))
}

// One socket per browser tab — module-level singleton, created lazily so SSR
// never touches it. Exact platform form: relative URL + XTransformPort query.
let chatSocket: Socket<ChatServerToClient, ChatClientToServer> | null = null
function getChatSocket(): Socket<ChatServerToClient, ChatClientToServer> {
  if (!chatSocket) {
    chatSocket = io('/?XTransformPort=3003', {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnectionDelay: 2000,
      // cookie-hostile contexts (preview iframes): send the signed token as
      // handshake auth — the bus synthesizes the hz_session cookie from it
      auth: { token: getSessionToken() ?? undefined },
    })
    chatSocket.on('connect', () => setConn('online'))
    chatSocket.on('disconnect', () => setConn('connecting'))
  }
  return chatSocket
}

const TYPING_EMIT_THROTTLE_MS = 1500
const TYPING_HIDE_AFTER_MS = 2500

export function Chat() {
  const { user, isMobile } = useViewport()
  const { toast } = useToast()
  const isManager = !!user?.isManager
  const [convs, setConvs] = React.useState<ConversationDTO[] | null>(null)
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<MessageDTO[]>([])
  const [threadLoading, setThreadLoading] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [groupMode, setGroupMode] = React.useState(false)
  const [groupTitle, setGroupTitle] = React.useState('')
  const [groupSel, setGroupSel] = React.useState<Set<string>>(new Set())
  const [users, setUsers] = React.useState<UserLite[]>([])
  const [query, setQuery] = React.useState('')
  const [conn, setConnState] = React.useState<ConnState>(connState)
  const [typingUser, setTypingUser] = React.useState<string | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const activeIdRef = React.useRef<string | null>(null)
  const typingTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingSent = React.useRef(0)
  const typingHideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const active = convs?.find((c) => c.id === activeId) ?? null

  const loadConvs = React.useCallback(async () => {
    try {
      const d = await api<{ conversations: ConversationDTO[] }>('/api/chat')
      setConvs(d.conversations)
    } catch {
      setConvs([])
    }
  }, [])

  React.useEffect(() => { loadConvs() }, [loadConvs])

  React.useEffect(() => {
    api<{ users: UserLite[] }>('/api/users')
      .then((d) => setUsers(d.users.filter((u) => u.active && u.id !== user?.id)))
      .catch(() => null)
  }, [user?.id])

  // ----- realtime lifecycle: connection dot + join/leave + message/typing/activity -----
  React.useEffect(() => {
    const s = getChatSocket()
    const listener = (st: ConnState) => setConnState(st)
    connListeners.add(listener)
    setConnState(connState)

    const onConnect = () => {
      // (re)join the open thread — covers reconnection and a late bus boot
      if (activeIdRef.current) s.emit('join', { conversationId: activeIdRef.current })
    }

    const toDTO = (m: SocketMessage): MessageDTO => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
      mine: m.userId === user?.id,
      userName: m.userName,
      userColor: m.userColor ?? '#3E7C59',
    })

    const applyActivity = (p: ActivityPayload) => {
      // closed thread → unread badge + toast; open thread → sidebar refresh only
      if (p.conversationId === activeIdRef.current) {
        loadConvs()
        return
      }
      setConvs((prev) => prev ? prev.map((c) => c.id === p.conversationId
        ? {
            ...c,
            unreadCount: c.unreadCount + 1,
            lastMessage: p.message ? { content: p.message.content, createdAt: p.message.createdAt, mine: false } : c.lastMessage,
            updatedAt: p.message?.createdAt ?? c.updatedAt,
          }
        : c) : prev)
      loadConvs()
      if (p.message) {
        sonnerToast(`پیام جدید از ${p.message.userName}`, {
          description: p.message.content.length > 60 ? `${p.message.content.slice(0, 60)}…` : p.message.content,
        })
      }
    }

    const onMessage = (m: SocketMessage) => {
      // delivered for the joined (open) room — a mismatch means an in-flight
      // message raced a conversation switch: treat it as sidebar activity
      if (m.conversationId && m.conversationId !== activeIdRef.current) {
        applyActivity({ conversationId: m.conversationId, message: m })
        return
      }
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, toDTO(m)]))
      if (!lastAt.current || new Date(m.createdAt).getTime() > new Date(lastAt.current).getTime()) {
        lastAt.current = m.createdAt
      }
      loadConvs()
    }

    const onTyping = (p: TypingPayload) => {
      if (p.conversationId !== activeIdRef.current) return
      if (p.userId && p.userId === user?.id) return // echo from own other tab
      setTypingUser(p.name || null)
      if (typingHideTimer.current) clearTimeout(typingHideTimer.current)
      typingHideTimer.current = setTimeout(() => setTypingUser(null), TYPING_HIDE_AFTER_MS)
    }

    const onActivity = (p: ActivityPayload) => applyActivity(p)

    s.on('connect', onConnect)
    s.on('message', onMessage)
    s.on('typing', onTyping)
    s.on('conversation-activity', onActivity)
    if (s.connected) onConnect()

    return () => {
      connListeners.delete(listener)
      s.off('connect', onConnect)
      s.off('message', onMessage)
      s.off('typing', onTyping)
      s.off('conversation-activity', onActivity)
    }
  }, [user?.id, loadConvs])

  // join on open / leave on close-or-switch (server rooms = conversationId)
  React.useEffect(() => {
    activeIdRef.current = activeId
    const s = getChatSocket()
    if (activeId) {
      setTypingUser(null)
      if (s.connected) s.emit('join', { conversationId: activeId })
    }
    return () => {
      if (activeId) s.emit('leave', { conversationId: activeId })
    }
  }, [activeId])

  // thread + 3s polling for new messages (fallback that keeps history honest)
  const lastAt = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!activeId) return
    let alive = true
    setThreadLoading(true)
    lastAt.current = null
    setMessages([])

    const fetchNew = async () => {
      try {
        const after = lastAt.current ? `&after=${encodeURIComponent(lastAt.current)}` : ''
        const d = await api<{ messages: MessageDTO[] }>(`/api/chat/${activeId}?_=${Date.now()}${after}`)
        if (!alive) return
        if (d.messages.length > 0) {
          lastAt.current = d.messages[d.messages.length - 1].createdAt
          setMessages((prev) => {
            if (!after) return d.messages
            const seen = new Set(prev.map((m) => m.id))
            return [...prev, ...d.messages.filter((m) => !seen.has(m.id))]
          })
        } else if (!after) {
          setMessages([])
        }
      } catch {
        /* transient */
      } finally {
        if (alive) setThreadLoading(false)
      }
    }
    fetchNew()
    const t = setInterval(fetchNew, 3000)
    // opening the thread marks it read server-side — sync the sidebar badge
    const r = setTimeout(() => { loadConvs() }, 1200)
    return () => { alive = false; clearInterval(t); clearTimeout(r) }
  }, [activeId, loadConvs])

  // auto-scroll to bottom
  React.useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const send = async () => {
    if (!activeId || !draft.trim()) return
    const content = draft.trim()
    setDraft('')
    try {
      const d = await api<{ message: MessageDTO }>(`/api/chat/${activeId}`, { body: { content } })
      setMessages((prev) => (prev.some((x) => x.id === d.message.id) ? prev : [...prev, d.message]))
      lastAt.current = d.message.createdAt
      loadConvs()
    } catch (e) {
      setDraft(content)
      toast({ title: 'پیام ارسال نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  const onDraftChange = (v: string) => {
    setDraft(v)
    const s = getChatSocket()
    if (!activeId || !v.trim() || !s.connected) return
    const now = Date.now()
    if (now - lastTypingSent.current > TYPING_EMIT_THROTTLE_MS) {
      lastTypingSent.current = now
      s.emit('typing', { conversationId: activeId, name: user?.name ?? '' })
    }
  }

  const connChip = (
    <span
      title={conn === 'online' ? 'ارتباط لحظه‌ای برقرار است' : 'در حال اتصال به سامانهٔ پیام لحظه‌ای…'}
      aria-label={conn === 'online' ? 'متصل' : 'در حال اتصال'}
      className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground rounded-full bg-accent px-3 py-1.5 cursor-default"
    >
      <span className={`h-2 w-2 rounded-full shrink-0 ${conn === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/50'}`} />
      {conn === 'online' ? 'متصل' : 'در حال اتصال…'}
    </span>
  )

  const startDM = async (userId: string) => {
    try {
      const d = await api<{ id: string }>('/api/chat', { body: { userId } })
      setPickerOpen(false)
      await loadConvs()
      setActiveId(d.id)
    } catch (e) {
      toast({ title: 'شروع گفتگو ناموفق بود', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  const createGroup = async () => {
    try {
      const d = await api<{ id: string }>('/api/chat', {
        body: { title: groupTitle, userIds: Array.from(groupSel) },
      })
      setPickerOpen(false)
      setGroupMode(false)
      setGroupSel(new Set())
      setGroupTitle('')
      await loadConvs()
      setActiveId(d.id)
      toast({ title: 'گروه ساخته شد 🎉' })
    } catch (e) {
      toast({ title: 'ساخت گروه ناموفق بود', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  const filteredUsers = users.filter((u) => !query.trim() || u.name.includes(query.trim()) || u.title.includes(query.trim()))

  // ----- mobile: thread full screen -----
  if (isMobile && activeId) {
    return (
      <div className="flex flex-col h-[calc(100dvh-11rem)] -m-3">
        <ThreadHeader conv={active} other={active?.participants.find((p) => p.id !== user?.id)} onBack={() => setActiveId(null)} conn={conn} />
        <MessageList ref={scrollRef} messages={messages} loading={threadLoading} />
        {typingUser && <TypingChip name={typingUser} />}
        <MessageInput draft={draft} setDraft={onDraftChange} send={send} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="پیام‌ها"
        subtitle="با همکارانت هماهنگ بمان — سریع، ساده و امن"
        icon={<MessagesSquare className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            {connChip}
            <span className="hidden lg:flex items-center gap-1 text-[11px] text-muted-foreground rounded-full bg-accent px-3 py-1.5">
              <Lock className="h-3.5 w-3.5 text-primary" /> پیام‌های داخلی و امن 🔐
            </span>
            <Button size="sm" className="gap-1.5" onClick={() => setPickerOpen(true)}>
              <Plus className="h-4 w-4" /> گفتگوی جدید
            </Button>
          </div>
        }
      />

      <div className="grid md:grid-cols-[22rem_1fr] gap-4 items-stretch">
        {/* conversation list */}
        <Card className={`overflow-hidden ${activeId ? 'hidden md:block' : ''}`}>
          <CardContent className="p-2">
            {!convs ? <LoadingBlock rows={4} /> : convs.length === 0 ? (
              <EmptyState
                icon={<MessagesSquare />}
                title="هنوز گفتگویی نداری"
                description="از «گفتگوی جدید» یک همکار را انتخاب کن و سلام کن 👋"
              />
            ) : (
              <div className="space-y-1 max-h-[70vh] overflow-y-auto nice-scroll">
                {convs.map((c) => {
                  const other = c.participants.find((p) => p.id !== user?.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => setActiveId(c.id)}
                      className={`w-full text-right rounded-xl p-3 flex items-center gap-3 transition-colors min-h-16 ${
                        activeId === c.id ? 'bg-accent' : 'hover:bg-accent/60'
                      }`}
                    >
                      {c.isGroup ? (
                        <span className="h-10 w-10 rounded-full bg-copper/20 text-copper flex items-center justify-center shrink-0">
                          <Users className="h-5 w-5" />
                        </span>
                      ) : (
                        <UserAvatar name={other?.name ?? '؟'} color={other?.color ?? '#3E7C59'} size={40} />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold truncate">{c.title}</p>
                          {c.lastMessage && <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(c.lastMessage.createdAt)}</span>}
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <p className="text-xs text-muted-foreground truncate">
                            {c.lastMessage ? `${c.lastMessage.mine ? 'تو: ' : ''}${c.lastMessage.content}` : 'بدون پیام'}
                          </p>
                          {c.unreadCount > 0 && (
                            <span className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center num shrink-0">
                              {toFaDigits(c.unreadCount)}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* thread (desktop) */}
        <Card className="hidden md:flex flex-col overflow-hidden min-h-[70vh]">
          {activeId ? (
            <>
              <ThreadHeader conv={active} other={active?.participants.find((p) => p.id !== user?.id)} conn={conn} />
              <MessageList ref={scrollRef} messages={messages} loading={threadLoading} />
              {typingUser && <TypingChip name={typingUser} />}
              <MessageInput draft={draft} setDraft={onDraftChange} send={send} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6">
              <EmptyState
                icon={<MessagesSquare />}
                title="یک گفتگو را انتخاب کن"
                description="از فهرست سمت راست یک گفتگو را باز کن یا گفتگوی جدیدی شروع کن 💬"
              />
            </div>
          )}
        </Card>
      </div>

      {/* user picker */}
      <Dialog open={pickerOpen} onOpenChange={(o) => { setPickerOpen(o); if (!o) setGroupMode(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{groupMode ? 'گروه کاری جدید' : 'گفتگوی جدید'}</DialogTitle>
            <DialogDescription>
              {groupMode ? 'نام گروه را بنویس و حداقل دو همکار را انتخاب کن.' : 'همکاری که می‌خواهی به او پیام بدهی را انتخاب کن.'}
            </DialogDescription>
          </DialogHeader>
          {isManager && (
            <label className="flex items-center gap-2 text-sm rounded-xl border p-3 cursor-pointer">
              <Checkbox checked={groupMode} onCheckedChange={(v) => setGroupMode(!!v)} />
              <Users className="h-4 w-4 text-copper" /> ساخت گروه (چند نفره)
            </label>
          )}
          {groupMode && (
            <Input value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="نام گروه — مثلاً: هماهنگی صبحگاهی" />
          )}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجوی نام…" className="pr-9" />
          </div>
          <div className="max-h-72 overflow-y-auto nice-scroll space-y-1">
            {filteredUsers.map((u) => {
              const checked = groupSel.has(u.id)
              return (
                <button
                  key={u.id}
                  onClick={() => (groupMode
                    ? setGroupSel((prev) => { const n = new Set(prev); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n })
                    : startDM(u.id))}
                  className="w-full flex items-center gap-3 rounded-xl p-2.5 hover:bg-accent transition-colors text-right min-h-12"
                >
                  {groupMode ? (
                    <Checkbox checked={checked} className="pointer-events-none" />
                  ) : (
                    <UserAvatar name={u.name} color={u.color} size={36} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">{u.name}</p>
                    <p className="text-[11px] text-muted-foreground">{u.title}</p>
                  </div>
                  {!groupMode && <UserAvatar name={u.name} color={u.color} size={32} />}
                </button>
              )
            })}
            {filteredUsers.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">همکاری پیدا نشد</p>}
          </div>
          {groupMode && (
            <Button onClick={createGroup} disabled={groupSel.size < 2} className="gap-1.5">
              <Users className="h-4 w-4" /> ساخت گروه ({toFaDigits(groupSel.size)} نفر)
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// tiny viewport hook (mobile detection)
function useViewport() {
  const [isMobile, setIsMobile] = React.useState(false)
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return { isMobile, user: useApp((s) => s.user) }
}

function ThreadHeader({ conv, other, onBack, conn }: { conv: ConversationDTO | null; other?: ParticipantDTO; onBack?: () => void; conn: ConnState }) {
  return (
    <div className="flex items-center gap-3 p-3 border-b bg-card">
      {onBack && (
        <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={onBack} aria-label="بازگشت">
          <ArrowRight className="h-5 w-5" />
        </Button>
      )}
      {conv?.isGroup ? (
        <span className="h-10 w-10 rounded-full bg-copper/20 text-copper flex items-center justify-center shrink-0">
          <Users className="h-5 w-5" />
        </span>
      ) : (
        <UserAvatar name={conv?.title ?? 'گفتگو'} color={other?.color ?? '#3E7C59'} size={40} />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold truncate">{conv?.title ?? '…'}</p>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Lock className="h-3 w-3" /> پیام‌های داخلی و امن 🔐
        </p>
      </div>
      <span
        title={conn === 'online' ? 'ارتباط لحظه‌ای برقرار است' : 'در حال اتصال به سامانهٔ پیام لحظه‌ای…'}
        aria-label={conn === 'online' ? 'متصل' : 'در حال اتصال'}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0 cursor-default"
      >
        <span className={`h-2 w-2 rounded-full shrink-0 ${conn === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/50'}`} />
        {conn === 'online' ? 'متصل' : 'در حال اتصال…'}
      </span>
    </div>
  )
}

function TypingChip({ name }: { name: string }) {
  return (
    <div className="px-4 pb-1 -mt-1">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-[11px] text-muted-foreground" aria-live="polite">
        <span className="flex gap-0.5">
          <span className="h-1 w-1 rounded-full bg-muted-foreground/70 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="h-1 w-1 rounded-full bg-muted-foreground/70 animate-bounce" style={{ animationDelay: '120ms' }} />
          <span className="h-1 w-1 rounded-full bg-muted-foreground/70 animate-bounce" style={{ animationDelay: '240ms' }} />
        </span>
        {name} در حال نوشتن…
      </span>
    </div>
  )
}

const MessageList = React.forwardRef<HTMLDivElement, { messages: MessageDTO[]; loading: boolean }>(function MessageList(
  { messages, loading }, ref
) {
  return (
    <div ref={ref} className="flex-1 overflow-y-auto nice-scroll p-3 space-y-2 bg-background/50">
      {loading && messages.length === 0 && (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      )}
      {!loading && messages.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-8">هنوز پیامی نیست — اولین سلام را تو بفرست 👋</p>
      )}
      {messages.map((m) => (
        <div key={m.id} className={`flex ${m.mine ? 'justify-start' : 'justify-end'}`}>
          <div
            className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap shadow-sm ${
              m.mine
                ? 'bg-primary text-primary-foreground rounded-bl-md'
                : 'bg-card border rounded-br-md'
            }`}
          >
            {!m.mine && <p className="text-[10px] font-bold mb-0.5" style={{ color: m.userColor }}>{m.userName}</p>}
            {m.content}
            <span className={`block text-[9px] mt-1 num ${m.mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
              {formatTime(m.createdAt)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
})

function MessageInput({ draft, setDraft, send }: { draft: string; setDraft: (v: string) => void; send: () => void }) {
  return (
    <div className="p-3 border-t bg-card flex items-center gap-2">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
        placeholder="پیام بنویس… (Enter برای ارسال)"
        className="h-11 rounded-full"
      />
      <Button size="icon" className="h-11 w-11 rounded-full shrink-0" onClick={send} disabled={!draft.trim()} aria-label="ارسال">
        <Send className="h-5 w-5" style={{ transform: 'scaleX(-1)' }} />
      </Button>
    </div>
  )
}
