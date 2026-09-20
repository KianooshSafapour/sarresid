'use client'
import * as React from 'react'
import { api } from '@/lib/api'
import type { PUser } from '@/lib/types'
import { fmtJalaliTime, toFaDigits } from '@/lib/jalali'
import {
  Avatar, Badge, Card, EmptyState, Loading, Modal, PrimaryButton, SectionHeader,
} from './kit'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { MessagesSquare, Send, ShieldCheck, UserPlus, ArrowRight, MessageCirclePlus } from 'lucide-react'

type Conv = {
  id: number
  other: { id: number; name: string; color: string }
  lastMessage: string
  lastAt: string
  unread: number
}
type Msg = {
  id: number
  conversationId: number
  senderId: number
  content: string
  readAt: string | null
  createdAt: string
}
type UserLite = { id: number; name: string; color: string; active: boolean }

export default function MessagesSection({ user }: { user: PUser }) {
  const [convs, setConvs] = React.useState<Conv[]>([])
  const [users, setUsers] = React.useState<UserLite[]>([])
  const [loading, setLoading] = React.useState(true)
  const [activeId, setActiveId] = React.useState<number | null>(null)
  const [messages, setMessages] = React.useState<Msg[]>([])
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [newChatOpen, setNewChatOpen] = React.useState(false)
  const [mobileView, setMobileView] = React.useState<'list' | 'chat'>('list')

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const activeIdRef = React.useRef<number | null>(null)
  activeIdRef.current = activeId

  const loadConvs = React.useCallback(async () => {
    try {
      const r = await api.get<{ conversations: Conv[] }>(`/api/conversations?userId=${user.id}`)
      setConvs(r.conversations)
    } catch { /* silent for polling */ }
  }, [user.id])

  const loadMessages = React.useCallback(async (conversationId: number) => {
    try {
      const r = await api.get<{ messages: Msg[] }>(`/api/messages?conversationId=${conversationId}&userId=${user.id}`)
      if (activeIdRef.current === conversationId) setMessages(r.messages)
    } catch { /* silent for polling */ }
  }, [user.id])

  // initial + 5s polling for conversation list, users once
  React.useEffect(() => {
    let alive = true
    Promise.all([
      api.get<{ users: UserLite[] }>('/api/users'),
    ]).then(([u]) => { if (alive) setUsers(u.users.filter((x) => x.id !== user.id)) }).catch(() => {})
    loadConvs().finally(() => { if (alive) setLoading(false) })
    const t = setInterval(loadConvs, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [user.id, loadConvs])

  // poll active conversation every 4s
  React.useEffect(() => {
    if (!activeId) return
    loadMessages(activeId)
    loadConvs()
    const t = setInterval(() => { if (activeIdRef.current) loadMessages(activeIdRef.current) }, 4000)
    return () => clearInterval(t)
  }, [activeId, loadMessages, loadConvs])

  const activeConv = convs.find((c) => c.id === activeId) ?? null

  // auto-scroll to bottom on new messages
  React.useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, activeId])

  const openConv = (id: number) => {
    setActiveId(id)
    setMessages([])
    setMobileView('chat')
  }

  const send = async () => {
    const content = draft.trim()
    if (!content || !activeId || sending) return
    setSending(true)
    try {
      await api.post('/api/messages', { conversationId: activeId, senderId: user.id, content })
      setDraft('')
      await loadMessages(activeId)
      await loadConvs()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ارسال پیام ناموفق بود')
    } finally {
      setSending(false)
    }
  }

  const startChat = async (otherId: number) => {
    try {
      const r = await api.post<{ conversation: { id: number } }>('/api/conversations', { userAId: user.id, userBId: otherId })
      setNewChatOpen(false)
      await loadConvs()
      openConv(r.conversation.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ساخت گفتگو')
    }
  }

  const usersMap = React.useMemo(() => new Map(users.map((u) => [u.id, u])), [users])

  return (
    <div>
      <SectionHeader
        title="پیام‌های خصوصی"
        subtitle="گفتگوی مستقیم با همکاران"
        icon={<MessagesSquare size={20} />}
        actions={
          <PrimaryButton onClick={() => setNewChatOpen(true)} className="min-h-[44px]">
            <UserPlus size={16} /> گفتگوی جدید
          </PrimaryButton>
        }
      />

      {/* trust banner */}
      <div className="mb-4 flex items-center gap-2.5 rounded-2xl border border-[#C8D8C0] bg-[#F3F7EF] px-4 py-3">
        <ShieldCheck size={18} className="shrink-0 text-[#3E6B4A]" />
        <p className="text-xs font-semibold text-[#3E6B4A] sm:text-sm">
          🔒 گفتگوها خصوصی است و فقط بین شما و مخاطب حفظ می‌شود
        </p>
      </div>

      {loading ? <Loading /> : (
        <div className="flex gap-4">
          {/* ===== conversations list ===== */}
          <Card className={cn('w-full shrink-0 flex-col md:flex md:w-80', mobileView === 'chat' ? 'hidden' : 'flex')}>
            <div className="border-b border-[#E4DCC8] px-4 py-3">
              <h3 className="text-sm font-bold text-[#253A2A]">گفتگوها <span className="text-xs font-normal text-[#8A9884]">({toFaDigits(convs.length)})</span></h3>
            </div>
            <div className="pz-scroll max-h-[60vh] flex-1 overflow-y-auto p-2 md:max-h-[calc(70vh-56px)]">
              {convs.length === 0 ? (
                <div className="p-3">
                  <EmptyState
                    icon={<MessageCirclePlus size={36} />}
                    title="هنوز گفتگویی ندارید"
                    hint="با دکمه «گفتگوی جدید» اولین پیام را برای یک همکار بفرستید"
                  />
                </div>
              ) : convs.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openConv(c.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl p-3 text-right transition-all',
                    activeId === c.id ? 'bg-[#EFF5EA] shadow-[inset_2px_0_0_0_#5F8F55]' : 'hover:bg-[#F5F2E8]'
                  )}
                >
                  <Avatar name={c.other.name} color={c.other.color} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold text-[#253A2A]">{c.other.name}</span>
                      {c.unread > 0 && (
                        <Badge className="shrink-0 border-rose-200 bg-rose-500 px-1.5 font-bold text-white">{toFaDigits(c.unread)}</Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-[#6B7A66]">{c.lastMessage || '—'}</span>
                      <span className="shrink-0 text-[10px] text-[#A8A28C]">
                        {new Date(c.lastAt).getTime() > Date.now() - 86400000
                          ? <TimeShort iso={c.lastAt} />
                          : fmtJalaliTime(c.lastAt).split(' - ')[0]}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* ===== chat pane ===== */}
          <Card className={cn('min-w-0 flex-1 flex-col md:flex', mobileView === 'chat' ? 'flex' : 'hidden')}>
            {!activeConv ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <EmptyState
                  icon={<MessagesSquare size={40} />}
                  title="یک گفتگو را انتخاب کنید"
                  hint="از فهرست سمت راست گفتگو را باز کنید یا گفتگوی جدید بسازید"
                />
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                {/* header */}
                <div className="flex items-center gap-3 border-b border-[#E4DCC8] bg-gradient-to-l from-[#F3F7EF] to-transparent px-3 py-2.5">
                  <button
                    onClick={() => { setMobileView('list'); setActiveId(null) }}
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-[#4A5A44] transition hover:bg-[#EFF5EA] md:hidden"
                    aria-label="بازگشت به فهرست"
                  >
                    <ArrowRight size={20} />
                  </button>
                  <Avatar name={activeConv.other.name} color={activeConv.other.color} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-[#253A2A]">{activeConv.other.name}</div>
                    <div className="text-[11px] text-[#8A9884]">گفتگوی خصوصی</div>
                  </div>
                </div>

                {/* messages */}
                <div ref={scrollRef} className="pz-scroll max-h-[50vh] flex-1 space-y-3 overflow-y-auto bg-[#FBF9F3]/50 p-4">
                  {messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center py-10 text-xs text-[#A8A28C]">
                      اولین پیام را بفرستید 👋
                    </div>
                  ) : messages.map((m) => {
                    const mine = m.senderId === user.id
                    return (
                      <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
                        <div
                          className={cn(
                            'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm sm:max-w-[70%]',
                            mine
                              ? 'rounded-br-md bg-gradient-to-b from-[#4A7A52] to-[#3A6242] text-white'
                              : 'rounded-bl-md border border-[#E4DCC8] bg-white text-[#253A2A]'
                          )}
                        >
                          {m.content}
                        </div>
                        <span className={cn('mt-1 px-1 text-[10px] text-[#A8A28C]', mine && 'text-left')}>
                          {fmtJalaliTime(m.createdAt)}{mine && (m.readAt ? ' · دیده شد' : ' · ارسال شد')}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* input row */}
                <div className="flex items-center gap-2 border-t border-[#E4DCC8] bg-white p-3">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                    placeholder="پیام خود را بنویسید…"
                    className="min-h-[44px] w-full rounded-xl border border-[#D8D2BC] bg-[#FBF9F3] px-3.5 text-sm text-[#253A2A] outline-none transition placeholder:text-[#A8A28C] focus:border-[#5F8F55] focus:ring-2 focus:ring-[#93C572]/30"
                    aria-label="متن پیام"
                  />
                  <PrimaryButton onClick={send} disabled={!draft.trim() || sending} className="min-h-[44px] px-4">
                    <Send size={16} className="scale-x-[-1]" />
                    <span className="hidden sm:inline">{sending ? '…' : 'ارسال'}</span>
                  </PrimaryButton>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* new chat modal */}
      <Modal open={newChatOpen} onClose={() => setNewChatOpen(false)} title="شروع گفتگوی جدید">
        <p className="mb-3 text-xs text-[#6B7A66]">فرد مورد نظر را انتخاب کنید تا گفتگوی خصوصی باز شود:</p>
        {users.length === 0 ? (
          <EmptyState title="کاربری برای گفتگو یافت نشد" />
        ) : (
          <div className="pz-scroll grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => startChat(u.id)}
                disabled={!u.active}
                className={cn(
                  'flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 transition-all',
                  u.active
                    ? 'border-[#E4DCC8] bg-white hover:border-[#5F8F55] hover:bg-[#F3F7EF] hover:shadow-md active:scale-[0.98]'
                    : 'cursor-not-allowed border-[#EFEAD8] bg-[#F5F2E8]/60 opacity-50'
                )}
              >
                <Avatar name={u.name} color={u.color} size={40} />
                <span className="w-full truncate text-center text-xs font-semibold text-[#253A2A]">{u.name}</span>
                {!u.active && <span className="text-[10px] text-[#A8A28C]">غیرفعال</span>}
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}

/** small relative-time text for today's list rows */
function TimeShort({ iso }: { iso: string }) {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return <span>{toFaDigits(`${hh}:${mm}`)}</span>
}
