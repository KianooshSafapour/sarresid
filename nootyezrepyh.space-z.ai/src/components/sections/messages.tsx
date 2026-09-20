'use client'

import * as React from 'react'
import { api, ClientUser } from '@/lib/api-client'
import { GlowCard, SectionHeader, EmptyState, RoleBadge } from '@/components/zeytoon-ui'
import { formatJalaliDateTime, nowTehranTime } from '@/lib/jalali'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { io } from 'socket.io-client'
import { MessagesSquare, Send, ShieldCheck, ArrowRight, Loader2, Wifi, WifiOff } from 'lucide-react'

interface StaffMember { id: string; name: string; primaryRole: string; color: string }
interface ConvSummary {
  id: string
  participants: StaffMember[]
  title: string
  unread: number
  lastMessage?: { content: string; senderId: string; createdAt: string }
  lastMessageAt: string
}
interface ChatMessage { id: string; senderId: string; senderName?: string; conversationId?: string; content: string; createdAt: string }

export function MessagesSection({ user }: { user: ClientUser }) {
  const [convs, setConvs] = React.useState<ConvSummary[] | null>(null)
  const [active, setActive] = React.useState<string | null>(null)
  const [staff, setStaff] = React.useState<StaffMember[]>([])
  const [online, setOnline] = React.useState<{ userId: string; name: string }[]>([])
  const [connected, setConnected] = React.useState(false)
  const socketRef = React.useRef<ReturnType<typeof io> | null>(null)

  const loadConvs = React.useCallback(() => {
    api.get<ConvSummary[]>('/api/messages').then(setConvs).catch(() => {})
  }, [])

  React.useEffect(() => {
    loadConvs()
    fetch('/api/auth/staff')
      .then((r) => r.json())
      .then((list: StaffMember[]) => setStaff(list.filter((s) => s.id !== user.id)))
      .catch(() => {})
  }, [loadConvs, user.id])

  // socket connection (live delivery) + polling fallback
  React.useEffect(() => {
    const socket = io('/?XTransformPort=3003', { transports: ['websocket', 'polling'] })
    socketRef.current = socket
    socket.on('connect', () => {
      setConnected(true)
      socket.emit('chat:join', { userId: user.id, name: user.name })
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('chat:online', (list: { userId: string; name: string }[]) => setOnline(list || []))
    socket.on('chat:notify', () => loadConvs())
    socket.on('chat:message', (msg: ChatMessage) => {
      if (!msg.conversationId || msg.conversationId === activeRef.current) pushMessage(msg)
    })
    const poll = setInterval(loadConvs, 8000)
    return () => {
      clearInterval(poll)
      socket.disconnect()
    }
  }, [loadConvs, user.id])

  const activeRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    activeRef.current = active
  }, [active])

  // ---- active conversation ----
  const [messages, setMessages] = React.useState<ChatMessage[] | null>(null)
  const [participants, setParticipants] = React.useState<StaffMember[]>([])
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const pushMessage = React.useCallback((m: ChatMessage) => {
    setMessages((prev) => (prev ? (prev.some((x) => x.id === m.id) ? prev : [...prev, m]) : [m]))
  }, [])

  React.useEffect(() => {
    if (!active) return
    setMessages(null)
    api.get<{ participants: StaffMember[]; messages: ChatMessage[] }>(`/api/messages/${active}`).then((d) => {
      setParticipants(d.participants)
      setMessages(d.messages)
      setTimeout(() => scrollRef.current?.scrollTo({ top: 9e9, behavior: 'smooth' }), 80)
    }).catch(() => {})
    socketRef.current?.emit('chat:enter', active)
  }, [active])

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 9e9, behavior: 'smooth' })
  }, [messages?.length])

  // deep-link hook: the shell (command palette) sets sessionStorage 'zeytoon_open_chat' = <userId>
  React.useEffect(() => {
    let cancelled = false
    async function openFromLink() {
      try {
        const uid = sessionStorage.getItem('zeytoon_open_chat')
        if (!uid || uid === user.id) return
        sessionStorage.removeItem('zeytoon_open_chat')
        // small delay so conversations load first
        const res = await api.post<{ id: string }>('/api/messages', { userId: uid })
        if (!cancelled) {
          loadConvs()
          setActive(res.id)
        }
      } catch { /* ignore */ }
    }
    openFromLink()
    return () => { cancelled = true }
  }, [user.id, loadConvs])

  async function send() {
    if (!active || !draft.trim() || sending) return
    const content = draft.trim()
    setDraft('')
    setSending(true)
    try {
      const msg = await api.post<ChatMessage>(`/api/messages/${active}`, { content })
      pushMessage(msg)
      socketRef.current?.emit('chat:message', {
        conversationId: active,
        message: msg,
        toUserIds: participants.map((p) => p.id),
      })
    } catch {
      setDraft(content)
    } finally {
      setSending(false)
    }
  }

  async function startWith(userId: string) {
    const res = await api.post<{ id: string }>('/api/messages', { userId })
    loadConvs()
    setActive(res.id)
  }

  const onlineIds = new Set(online.map((o) => o.userId))

  if (active) {
    const other = participants[0]
    return (
      <div className="max-w-3xl mx-auto">
        <GlowCard className="flex flex-col h-[calc(100vh-14rem)] min-h-[420px]">
          {/* chat header */}
          <div className="flex items-center gap-3 p-3 border-b border-gold/20">
            <Button variant="ghost" size="icon" onClick={() => setActive(null)} aria-label="بازگشت">
              <ArrowRight className="size-5 rotate-180" />
            </Button>
            {other && (
              <>
                <div className="relative">
                  <Avatar className="size-10 ring-2 ring-gold/30">
                    <AvatarFallback style={{ background: other.color }} className="text-white font-bold">
                      {other.name.replace('خانم ', '').replace('آقای ', '').charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  {onlineIds.has(other.id) && <span className="absolute -bottom-0.5 -left-0.5 size-3 rounded-full bg-emerald-500 ring-2 ring-card" title="آنلاین" />}
                </div>
                <div>
                  <div className="font-bold text-sm">{other.name}</div>
                  <RoleBadge roleKey={other.primaryRole} />
                </div>
              </>
            )}
            <div className="flex-1" />
            <span className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground">
              <ShieldCheck className="size-3.5 text-emerald-600" /> گفتگوی خصوصی و امن
            </span>
          </div>
          {/* messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2.5 pattern-paisley opacity-100 nice-scrollbar">
            {messages === null ? (
              <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-olive" /></div>
            ) : messages.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-10">اولین پیام را بفرستید 👋</div>
            ) : (
              messages.map((m) => {
                const mine = m.senderId === user.id
                return (
                  <div key={m.id} className={cn('flex animate-fade-up', mine ? 'justify-start flex-row-reverse' : 'justify-end flex-row-reverse')}>
                    <div
                      className={cn(
                        'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
                        mine ? 'bg-olive text-white rounded-bl-sm' : 'bg-secondary text-foreground rounded-br-sm'
                      )}
                    >
                      {!mine && m.senderName && <div className="text-[10px] font-bold opacity-70 mb-0.5">{m.senderName}</div>}
                      <div className="whitespace-pre-wrap break-words">{m.content}</div>
                      <div className={cn('text-[9px] mt-1', mine ? 'text-white/70' : 'text-muted-foreground')}>
                        {nowTehranTime() === formatTime(m.createdAt) ? 'همین حالا' : formatTime(m.createdAt)}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
          {/* composer */}
          <div className="p-3 border-t border-gold/20 flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
              placeholder="پیام خود را بنویسید..."
              className="h-11 rounded-xl"
            />
            <Button onClick={send} disabled={!draft.trim() || sending} className="size-11 rounded-xl bg-olive hover:bg-olive/90 p-0" aria-label="ارسال">
              {sending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5 rotate-180" />}
            </Button>
          </div>
        </GlowCard>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <SectionHeader
        title="پیام‌ها"
        subtitle="گفتگوی مستقیم و امن با همکاران"
        actions={
          <span className={cn('flex items-center gap-1 text-xs', connected ? 'text-emerald-600' : 'text-muted-foreground')}>
            {connected ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
            {connected ? 'متصله' : 'حالت امن'}
          </span>
        }
      />

      <GlowCard className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <ShieldCheck className="size-4 text-emerald-600" />
          پیام‌ها فقط روی سرور داخلی خودمان ذخیره می‌شوند و بین شما و مخاطب شما خصوصی است.
        </div>
        <div className="text-[11px] font-bold text-muted-foreground mb-2">شروع گفتگو با:</div>
        <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto nice-scrollbar">
          {staff.map((s) => (
            <button
              key={s.id}
              onClick={() => startWith(s.id)}
              className="flex items-center gap-1.5 rounded-full border border-gold/25 bg-card px-2.5 py-1.5 text-xs font-bold hover:border-gold/60 hover:bg-accent transition-colors"
            >
              <span className="relative">
                <Avatar className="size-6">
                  <AvatarFallback style={{ background: s.color }} className="text-white text-[10px] font-black">
                    {s.name.replace('خانم ', '').replace('آقای ', '').charAt(0)}
                  </AvatarFallback>
                </Avatar>
                {onlineIds.has(s.id) && <span className="absolute -bottom-0.5 -left-0.5 size-2 rounded-full bg-emerald-500" />}
              </span>
              {s.name}
              <MessagesSquare className="size-3 text-olive" />
            </button>
          ))}
        </div>
      </GlowCard>

      <div className="space-y-2">
        {convs === null ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)
        ) : convs.length === 0 ? (
          <EmptyState icon={<MessagesSquare className="size-6" />} title="هنوز گفتگویی ندارید" description="از بالا یک همکار را انتخاب کنید و سلام کنید 👋" />
        ) : (
          convs.map((c) => (
            <button key={c.id} onClick={() => setActive(c.id)} className="w-full text-right">
              <GlowCard interactive className="p-3.5 flex items-center gap-3">
                <div className="flex -space-x-2 space-x-reverse">
                  {c.participants.slice(0, 3).map((p) => (
                    <Avatar key={p.id} className="size-10 ring-2 ring-card">
                      <AvatarFallback style={{ background: p.color }} className="text-white font-bold text-sm">
                        {p.name.replace('خانم ', '').replace('آقای ', '').charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm truncate">{c.title}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{formatJalaliDateTime(c.lastMessageAt).split(' - ')[1]}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {c.lastMessage ? (c.lastMessage.senderId === user.id ? 'شما: ' : '') + c.lastMessage.content : 'بدون پیام'}
                  </div>
                </div>
                {c.unread > 0 && (
                  <span className="size-6 rounded-full bg-gold text-white text-xs font-black flex items-center justify-center shrink-0 animate-pulse-gold">
                    {c.unread}
                  </span>
                )}
              </GlowCard>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function formatTime(iso: string): string {
  const t = new Date(new Date(iso).getTime() + 3.5 * 3600000)
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
}
