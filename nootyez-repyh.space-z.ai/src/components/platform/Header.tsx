'use client'
import * as React from 'react'
import { Bell, Menu, Plus, CheckCheck, BellRing, CalendarDays, Newspaper } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { type NotificationT, type PUser } from '@/lib/types'
import { TimeAgo } from './kit'
import { cn } from '@/lib/utils'
import { fmtJalaliLong, toFaDigits, todayISO } from '@/lib/jalali'
import { canQuickOrder } from './Sidebar'

export function Header({ user, onOpenMobile }: { user: PUser; onOpenMobile: () => void }) {
  const requestNewOrder = useApp((s) => s.requestNewOrder)
  const [open, setOpen] = React.useState(false)
  const [notifs, setNotifs] = React.useState<NotificationT[]>([])
  const [unread, setUnread] = React.useState(0)
  const [browserNotif, setBrowserNotif] = React.useState(false)
  const lastSeenIdRef = React.useState(() => (typeof window !== 'undefined' ? Number(localStorage.getItem('pz-last-notif-id') ?? 0) : 0))[0]
  const browserNotifRef = React.useRef(false)

  // restore browser-notification preference
  React.useEffect(() => {
    const on = typeof window !== 'undefined' && localStorage.getItem('pz-browser-notif') === '1' && 'Notification' in window && Notification.permission === 'granted'
    setBrowserNotif(on)
    browserNotifRef.current = on
  }, [])

  const fireBrowserNotifications = React.useCallback((list: NotificationT[]) => {
    if (!browserNotifRef.current || typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return
    const maxSeen = Math.max(lastSeenIdRef, Number(localStorage.getItem('pz-last-notif-id') ?? 0))
    let newest = maxSeen
    for (const n of list) {
      if (n.id > maxSeen && !n.readAt) {
        try {
          new Notification(n.title, { body: n.body ?? '', dir: 'rtl', lang: 'fa', icon: '/logo.svg', tag: `pz-${n.id}` })
        } catch { /* some browsers require SW; ignore */ }
      }
      if (n.id > newest) newest = n.id
    }
    if (newest > maxSeen) localStorage.setItem('pz-last-notif-id', String(newest))
  }, [lastSeenIdRef])

  const load = React.useCallback(async () => {
    try {
      const r = await api.get<{ notifications: NotificationT[]; unread: number }>(`/api/notifications?userId=${user.id}`)
      setNotifs(r.notifications)
      setUnread(r.unread)
      fireBrowserNotifications(r.notifications)
    } catch { /* silent */ }
  }, [user.id, fireBrowserNotifications])

  React.useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  const markAll = async () => {
    await api.patch('/api/notifications', { all: true, userId: user.id }).catch(() => {})
    load()
  }
  const markOne = async (id: number) => {
    await api.patch('/api/notifications', { id }).catch(() => {})
    load()
  }

  const toggleBrowserNotif = async () => {
    if (browserNotif) {
      localStorage.setItem('pz-browser-notif', '0')
      setBrowserNotif(false)
      browserNotifRef.current = false
      toast('اعلان مرورگر خاموش شد')
      return
    }
    if (!('Notification' in window)) {
      toast.error('مرورگر شما از اعلان پشتیبانی نمی‌کند')
      return
    }
    let perm = Notification.permission
    if (perm === 'default') perm = await Notification.requestPermission()
    if (perm === 'granted') {
      // seed watermark so we don't replay the whole history
      const maxId = notifs.reduce((m, n) => Math.max(m, n.id), Number(localStorage.getItem('pz-last-notif-id') ?? 0))
      localStorage.setItem('pz-last-notif-id', String(maxId))
      localStorage.setItem('pz-browser-notif', '1')
      setBrowserNotif(true)
      browserNotifRef.current = true
      toast.success('اعلان مرورگر فعال شد ✓')
      try { new Notification('هایپر زیتون', { body: 'اعلان‌های سامانه از این پس در مرورگر هم نمایش داده می‌شود ✓', dir: 'rtl', lang: 'fa', icon: '/logo.svg' }) } catch { /* ignore */ }
    } else {
      toast.error('اجازه اعلان داده نشد | Permission denied')
    }
  }

  const today = React.useMemo(() => {
    try { return fmtJalaliLong(todayISO()) } catch { return '' }
  }, [])

  return (
    <header className="sticky top-0 z-30 border-b border-[#E4DCC8] bg-[#FAF7EF]/85 backdrop-blur-md">
      <div className="flex items-center gap-2 px-3 py-2.5 sm:px-5">
        <button onClick={onOpenMobile} className="rounded-xl border border-[#E4DCC8] bg-white/80 p-2 text-[#4A5A44] transition hover:bg-white lg:hidden" aria-label="Open menu">
          <Menu size={20} />
        </button>

        <div className="hidden items-center gap-2 md:flex">
          <span className="pz-pulse h-2 w-2 rounded-full bg-[#7ab05e]" />
          <span className="text-xs font-semibold text-[#6B7A66]">سیستم فعال</span>
          <span className="mx-1 h-4 w-px bg-[#E4DCC8]" aria-hidden />
          <span className="flex items-center gap-1.5 rounded-lg border border-[#E4DCC8] bg-white/70 px-2.5 py-1 text-xs font-semibold text-[#4A5A44]">
            <CalendarDays size={13} className="text-[#B8860B]" />
            {today}
          </span>
        </div>

        <div className="flex-1" />

        {canQuickOrder(user) && (
          <button
            onClick={requestNewOrder}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#DAA520] to-[#B8860B] px-3 py-2 text-sm font-bold text-[#3A2E05] shadow-md transition-all hover:brightness-110 active:scale-95"
          >
            <Plus size={17} strokeWidth={2.6} />
            <span className="hidden sm:inline">سفارش جدید</span>
            <span className="sm:hidden">سفارش</span>
          </button>
        )}

        {/* notifications */}
        <div className="relative">
          <button onClick={() => setOpen((o) => !o)} className="relative rounded-xl border border-[#E4DCC8] bg-white/80 p-2 text-[#4A5A44] transition hover:bg-white" aria-label="Notifications">
            <Bell size={19} />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow">
                {toFaDigits(unread > 9 ? '9+' : unread)}
              </span>
            )}
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute left-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-[#E4DCC8] bg-white shadow-2xl sm:w-96">
                <div className="flex items-center justify-between bg-gradient-to-r from-[#2F4A36] to-[#3E6B4A] px-4 py-2.5 text-white">
                  <span className="text-sm font-bold">اعلان‌ها | Notifications</span>
                  <button onClick={markAll} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition hover:bg-white/15">
                    <CheckCheck size={14} /> خواندن همه
                  </button>
                </div>
                <div className="pz-scroll max-h-96 overflow-y-auto">
                  {notifs.length === 0 && <div className="px-4 py-8 text-center text-sm text-[#8A9884]">اعلانی نیست 🌿</div>}
                  {notifs.map((n) => {
                    const isDigest = n.type === 'DIGEST'
                    return (
                      <button
                        key={n.id}
                        onClick={() => markOne(n.id)}
                        className={cn(
                          'block min-h-[44px] w-full border-b border-[#EFEAD8] px-4 py-3 text-right transition hover:bg-[#F7F4E8]',
                          isDigest && 'border-r-[3px] border-r-[#DAA520] bg-gradient-to-l from-[#FBF3DC] via-[#FCF6E4] to-[#FDF9EE] hover:from-[#F7EBC8] hover:to-[#FBF5E4]',
                          !isDigest && !n.readAt && 'bg-[#F3F7EF]'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          {isDigest && <Newspaper size={17} className="mt-0.5 shrink-0 text-[#B8860B]" aria-hidden />}
                          <span
                            className={cn(
                              'text-sm font-bold',
                              isDigest
                                ? 'flex-1 text-[15px] font-extrabold text-[#8A6508]'
                                : n.type === 'WARNING'
                                  ? 'text-amber-700'
                                  : n.type === 'ERROR'
                                    ? 'text-rose-700'
                                    : 'text-[#253A2A]'
                            )}
                          >
                            {n.title}
                          </span>
                          {!n.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#DAA520]" />}
                        </div>
                        {n.body && (
                          <div
                            className={cn(
                              'mt-0.5 text-xs text-[#6B7A66]',
                              isDigest ? 'whitespace-pre-line leading-5' : 'line-clamp-2'
                            )}
                          >
                            {n.body}
                          </div>
                        )}
                        <div className="mt-1"><TimeAgo iso={n.createdAt} /></div>
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={toggleBrowserNotif}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 border-t border-[#EFEAD8] px-4 py-2.5 text-xs font-semibold transition',
                    browserNotif ? 'bg-[#F3F7EF] text-[#3E6B4A]' : 'bg-white text-[#6B7A66] hover:bg-[#F7F4E8]'
                  )}
                  aria-pressed={browserNotif}
                >
                  <span className="flex items-center gap-2">
                    <BellRing size={14} className={browserNotif ? 'text-[#3E6B4A]' : 'text-[#8A9884]'} />
                    اعلان مرورگر | Browser notifications
                  </span>
                  <span className={cn(
                    'relative h-5 w-9 rounded-full transition-colors',
                    browserNotif ? 'bg-[#3E6B4A]' : 'bg-[#D8D2C0]'
                  )}>
                    <span className={cn(
                      'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
                      browserNotif ? 'left-0.5' : 'left-[18px]'
                    )} />
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
