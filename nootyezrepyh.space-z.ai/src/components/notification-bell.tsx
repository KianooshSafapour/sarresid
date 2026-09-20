'use client'

import * as React from 'react'
import { api, ClientUser } from '@/lib/api-client'
import { toFaDigits } from '@/lib/jalali'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Bell, BellRing, AlertTriangle, Info, ChevronLeft, Package, Wallet, ClipboardList, CalendarDays, CalendarClock, Cake } from 'lucide-react'

interface NotificationItem {
  id: string
  kind: string
  severity: 'urgent' | 'warning' | 'info'
  title: string
  body?: string
  section: string
  count?: number
}

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  approval: ClipboardList,
  overdue: AlertTriangle,
  delivery: Package,
  inspect: ClipboardList,
  holoo: ClipboardList,
  'holoo-progress': ClipboardList,
  'cheque-sign': Wallet,
  'cheque-followup': Wallet,
  stock: Package,
  task: ClipboardList,
  'task-blocked': ClipboardList,
  idea: Info,
  warehouse: Package,
  sale: Package,
  shift: CalendarDays,
  'shift-coverage': CalendarClock,
  birthday: Cake,
}

/** Unified notification bell — role-aware alerts with click-to-navigate.
 *  Seen-state persists SERVER-SIDE per user (User.notifSeen JSON map, cross-device)
 *  with localStorage as instant-cache/fallback. An item is "new" when its current
 *  count differs from the stored seen snapshot. */
export function NotificationBell({ user, onNavigate }: { user: ClientUser; onNavigate: (section: string) => void }) {
  const [items, setItems] = React.useState<NotificationItem[]>([])
  const [open, setOpen] = React.useState(false)
  const [ping, setPing] = React.useState(false)
  const lsKey = `zeytoon_notif_seen_${user.id}`
  const [seenMap, setSeenMap] = React.useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      return JSON.parse(localStorage.getItem(lsKey) || '{}')
    } catch {
      return {}
    }
  })

  const load = React.useCallback(() => {
    api.get<{ items: NotificationItem[] }>('/api/notifications')
      .then((d) => {
        setItems((prev) => {
          if (d.items.length > prev.length && prev.length > 0) {
            setPing(true)
            setTimeout(() => setPing(false), 2500)
          }
          return d.items
        })
      })
      .catch(() => {})
  }, [])

  React.useEffect(() => {
    load()
    const t = setInterval(load, 45000)
    // hydrate server-side seen map (authoritative across devices)
    api.get<{ map: Record<string, number> }>('/api/notifications/seen')
      .then((d) => {
        if (d.map && Object.keys(d.map).length) {
          setSeenMap(d.map)
          try { localStorage.setItem(lsKey, JSON.stringify(d.map)) } catch { /* ignore */ }
        }
      })
      .catch(() => {})
    return () => clearInterval(t)
  }, [load, lsKey])

  const snapshotOf = (list: NotificationItem[]): Record<string, number> => {
    const m: Record<string, number> = {}
    for (const it of list) m[it.id] = typeof it.count === 'number' ? it.count : -1
    return m
  }

  /** items whose current count differs from seen snapshot */
  const newIds = React.useMemo(() => {
    const ids = items.filter((it) => seenMap[it.id] !== (typeof it.count === 'number' ? it.count : -1)).map((it) => it.id)
    return new Set(ids)
  }, [items, seenMap])
  const unseenCount = newIds.size
  const urgent = items.some((i) => i.severity === 'urgent' && newIds.has(i.id))

  function markSeen() {
    if (items.length === 0) return
    const map = snapshotOf(items)
    setSeenMap(map)
    try { localStorage.setItem(lsKey, JSON.stringify(map)) } catch { /* storage unavailable */ }
    api.post('/api/notifications/seen', { map }).catch(() => { /* offline — localStorage kept */ })
  }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) markSeen() }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-10" aria-label="اعلان‌ها">
          {urgent ? (
            <BellRing className={cn('size-5 text-gold', ping && 'animate-bounce')} />
          ) : (
            <Bell className="size-5 text-muted-foreground" />
          )}
          {unseenCount > 0 && (
            <span
              className={cn(
                'absolute -top-0.5 -left-0.5 min-w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center px-1 ring-2 ring-card',
                urgent ? 'bg-red-500 text-white animate-pulse-gold' : 'bg-olive text-white'
              )}
            >
              {unseenCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gold/20 bg-accent/40">
          <div className="font-extrabold text-sm">🔔 اعلان‌های شما</div>
          <div className="flex items-center gap-2">
            {unseenCount > 0 && <span className="text-[10px] font-bold rounded-full bg-gold text-white px-2 py-0.5">{toFaDigits(unseenCount)} جدید</span>}
            <span className="text-[11px] text-muted-foreground">{toFaDigits(items.length)} مورد</span>
          </div>
        </div>
        <ScrollArea className="h-[340px]">
          {items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <div className="text-3xl mb-2">🌿</div>
              همه چیز مرتب است — اعلان جدیدی نیست
            </div>
          ) : (
            <div className="p-2 space-y-1.5">
              {items.map((n) => {
                const Icon = KIND_ICON[n.kind] || Bell
                const isNew = newIds.has(n.id)
                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      onNavigate(n.section)
                      setOpen(false)
                    }}
                    className={cn(
                      'relative w-full text-right flex items-start gap-2.5 rounded-xl border p-3 transition-colors hover:bg-accent/60',
                      n.kind === 'birthday'
                        ? 'border-rose-200 bg-rose-50/60'
                        : n.severity === 'urgent'
                          ? 'border-red-200 bg-red-50/60'
                          : n.severity === 'warning'
                            ? 'border-amber-200 bg-amber-50/60'
                            : 'border-gold/15 bg-card',
                      isNew && 'ring-1 ring-gold/50'
                    )}
                  >
                    {isNew && <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-gold ring-2 ring-card" aria-hidden />}
                    <span
                      className={cn(
                        'size-9 rounded-xl flex items-center justify-center shrink-0',
                        n.kind === 'birthday' ? 'bg-rose-100 text-rose-600' : n.severity === 'urgent' ? 'bg-red-100 text-red-600' : n.severity === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-olive/12 text-olive'
                      )}
                    >
                      <Icon className="size-4.5" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold leading-snug">{n.title}</span>
                      {n.body && <span className="block text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.body}</span>}
                    </span>
                    <ChevronLeft className="size-4 text-muted-foreground shrink-0 mt-1" />
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
