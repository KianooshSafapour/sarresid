'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { toast } from 'sonner'
import { api, setSessionToken, clearSessionToken } from '@/lib/client'
import { canAccess, ROLE_LABELS } from '@/lib/constants'
import { faNum } from '@/lib/jalali'
import { Avatar } from '@/components/app/ui-bits'
import LoginView from '@/components/views/Login'
import DashboardView from '@/components/views/Dashboard'
import OrdersView from '@/components/views/Orders'
import ReceivingView from '@/components/views/Receiving'
import VerifyView from '@/components/views/Verify'
import AccountingView from '@/components/views/Accounting'
import ProductsView from '@/components/views/Products'
import ProvidersView from '@/components/views/Providers'
import ChequesView from '@/components/views/Cheques'
import ArchiveView from '@/components/views/Archive'
import MessagesView from '@/components/views/Messages'
import TasksView from '@/components/views/Tasks'
import SopView from '@/components/views/Sop'
import WallView from '@/components/views/Wall'
import NotesView from '@/components/views/Notes'
import FeedbackView from '@/components/views/Feedback'
import PlanogramView from '@/components/views/Planogram'
import SalesView from '@/components/views/Sales'
import PerfView from '@/components/views/Perf'
import AdminView from '@/components/views/Admin'
import HelpView from '@/components/views/Help'
import NotifsView from '@/components/views/Notifs'
import BriefingView from '@/components/views/Briefing'
import ReportsView from '@/components/views/Reports'
import PriceCheckView from '@/components/views/PriceCheck'
import ScienceView from '@/components/views/Science'
import PayrollView from '@/components/views/Payroll'
import PeopleView from '@/components/views/People'
import ResearchView from '@/components/views/Research'
import DemoStudioView from '@/components/views/DemoStudio'
import ZoneCountView from '@/components/views/ZoneCount'
import LeavesView from '@/components/views/Leaves'
import CrmView from '@/components/views/Crm'
import PersonnelView from '@/components/views/Personnel'
import RbacView from '@/components/views/Rbac'
import DataAdminView from '@/components/views/DataAdmin'
import UrgentView from '@/components/views/Urgent'
import KbView from '@/components/views/Kb'
import SandboxTour, { SandboxTourButton } from '@/components/app/SandboxTour'
import { ThemeLangBar, PopoverScaffold } from '@/components/app/ThemeLangBar'
import { AppCtx } from '@/components/app/ui-bits'
import BarcodeScannerHost from '@/components/app/BarcodeScanner'
import CommandPalette, { pushRecentView } from '@/components/app/CommandPalette'
import { useHolidays } from '@/components/app/jalali-widgets'
import { t as tI18n } from '@/lib/i18n'
import { formatJalaliFull, todayIso } from '@/lib/jalali'
import { useLang } from '@/lib/i18n'
import { cn } from '@/lib/utils'

// lucide icons
import {
  LayoutDashboard, ClipboardList, PackageCheck, Warehouse, Calculator, ShoppingBasket,
  Truck, Banknote, ListChecks, BookOpen, Newspaper, MessageCircle, NotebookPen,
  HeartHandshake, LayoutGrid, Store, Trophy, ShieldCheck, Info, Bell, Plus, LogOut,
  Menu, X, BellRing, Sunrise, CalendarDays, FileSpreadsheet, BadgePercent, Search,
  FlaskConical, GraduationCap, Presentation, Library, ClipboardCheck, CalendarRange,
  Users, UserCog, KeyRound, DatabaseBackup, Zap, Wallet, Contact,
} from 'lucide-react'

type NavItem = { key: string; label: string; icon: any; badge?: number }
type NavGroup = { title: string; items: NavItem[] }

function snoozeTargetIso(hours: number): string {
  return new Date(Date.now() + hours * 3600000).toISOString()
}

const NAV: NavGroup[] = [
  {
    title: 'عملیات روزانه',
    items: [
      { key: 'dashboard', label: 'داشبورد', icon: LayoutDashboard },
      { key: 'orders', label: 'سفارش‌ها', icon: ClipboardList },
      { key: 'receiving', label: 'دریافت مرسوله', icon: PackageCheck },
      { key: 'verify', label: 'تأیید انبار', icon: Warehouse },
      { key: 'accounting', label: 'حسابداری و هلو', icon: Calculator },
    ],
  },
  {
    title: 'انبار و فروش',
    items: [
      { key: 'products', label: 'کالاها', icon: ShoppingBasket },
      { key: 'zonecount', label: 'شمارش روزانهٔ زون', icon: ClipboardCheck },
      { key: 'providers', label: 'تأمین‌کنندگان', icon: Truck },
      { key: 'planogram', label: 'پلانوگرام قفسه‌ها', icon: LayoutGrid },
      { key: 'sales', label: 'فروش و مشتریان', icon: Store },
      { key: 'crm', label: 'CRM مشتریان', icon: Users },
    ],
  },
  {
    title: 'مالی',
    items: [
      { key: 'pricecheck', label: 'کنترل قیمت روزانه', icon: BadgePercent },
      { key: 'cheques', label: 'چک‌ها و پرداخت‌ها', icon: Banknote },
      { key: 'archive', label: 'آرشیو اسناد', icon: Library },
      { key: 'payroll', label: 'حقوق و دستمزد', icon: Wallet },
      { key: 'reports', label: 'گزارش‌ها و اکسل', icon: FileSpreadsheet },
    ],
  },
  {
    title: 'علم و پژوهش',
    items: [
      { key: 'science', label: 'جعبه‌ابزار علمی', icon: FlaskConical },
      { key: 'research', label: 'مرکز پژوهش', icon: GraduationCap },
      { key: 'demo', label: 'استودیوی دمو', icon: Presentation },
    ],
  },
  {
    title: 'تیم و ارتباطات',
    items: [
      { key: 'tasks', label: 'وظایف من', icon: ListChecks },
      { key: 'sop', label: 'روال‌های استاندارد', icon: BookOpen },
      { key: 'wall', label: 'دیجیتال‌وال', icon: Newspaper },
      { key: 'messages', label: 'پیام‌ها', icon: MessageCircle },
      { key: 'urgent', label: 'پرسش‌های فوری', icon: Zap },
      { key: 'notes', label: 'یادداشت‌های من', icon: NotebookPen },
      { key: 'feedback', label: 'بازخورد و ایده‌ها', icon: HeartHandshake },
      { key: 'leaves', label: 'مرخصی و برنامهٔ تیم', icon: CalendarRange },
      { key: 'personnel', label: 'مدیریت پرسنل', icon: UserCog },
      { key: 'people', label: 'دفتر اشخاص', icon: Contact },
      { key: 'perf', label: 'عملکرد و امتیازها', icon: Trophy },
    ],
  },
  {
    title: 'سیستم',
    items: [
      { key: 'notifs', label: 'مرکز اعلان‌ها', icon: BellRing },
      { key: 'briefing', label: 'صبح‌نامه امروز', icon: Sunrise },
      { key: 'kb', label: 'دانشنامه و آموزش', icon: GraduationCap },
      { key: 'admin', label: 'مدیریت سامانه', icon: ShieldCheck },
      { key: 'rbac', label: 'نقش‌ها و دسترسی‌ها', icon: KeyRound },
      { key: 'data', label: 'مدیریت داده‌ها', icon: DatabaseBackup },
      { key: 'help', label: 'راهنما', icon: Info },
    ],
  },
]

const VIEW_TITLES: Record<string, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.key, i.label]))
)

const GROUP_TITLE_KEYS: Record<string, string> = {
  'عملیات روزانه': 'nav.daily',
  'انبار و فروش': 'nav.inventory',
  'مالی': 'nav.finance',
  'علم و پژوهش': 'nav.group.science',
  'تیم و ارتباطات': 'nav.team',
  'سیستم': 'nav.system',
}

/** برچسب ناوبری چندزبانه — در نبود ترجمه، برچسب فارسی اصلی */
function navLabel(key: string, faLabel: string, lang: string): string {
  if (lang === 'fa') return faLabel
  const v = tI18n(`nav.${key}`)
  return v.startsWith('nav.') ? faLabel : v
}
function groupTitle(faTitle: string, lang: string): string {
  if (lang === 'fa') return faTitle
  const v = tI18n(GROUP_TITLE_KEYS[faTitle] || '')
  return v.startsWith('nav.') ? faTitle : v
}

/** تاریخ امروز به‌همراه تعطیلی (اگر تعطیل است) — چیپ زیبای نوار بالا */
function TopbarDateChip() {
  const holidays = useHolidays()
  const today = todayIso()
  const holidayName = holidays.get(today)
  const isWeekend = [4, 5].includes(new Date().getDay()) // پنجشنبه/جمعه
  return (
    <div
      className={cn(
        'hidden items-center gap-2 rounded-xl border px-3 py-1.5 md:flex',
        holidayName
          ? 'border-[#b3372f]/30 bg-[#fee2e2]/50'
          : isWeekend
            ? 'border-[#c9a227]/40 bg-[#fdf6dd]/60'
            : 'border-border bg-card'
      )}
      title={holidayName || undefined}
    >
      <CalendarDays size={15} className={holidayName || isWeekend ? 'text-[#b3372f]' : 'text-[#0e7a4a]'} />
      <span className="text-[11px] font-extrabold text-foreground">{formatJalaliFull(todayIso())}</span>
      {holidayName && (
        <span className="rounded-lg bg-[#b3372f] px-2 py-0.5 text-[10px] font-black text-white">تعطیل — {holidayName}</span>
      )}
    </div>
  )
}

function parseHash(): { view: string; param: string } {
  const h = window.location.hash.replace(/^#\/?/, '')
  const [view, param] = h.split('/')
  return { view: view || 'dashboard', param: param || '' }
}

export default function AppShell() {
  const { lang } = useLang()
  const [user, setUser] = useState<AppCtx['user']>(null)
  const [loading, setLoading] = useState(true)
  const [nav, setNav] = useState({ view: 'dashboard', param: '' })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const bellRef = useRef<HTMLButtonElement>(null)
  const [notifs, setNotifs] = useState<{ id: string; severity: string; icon: string; title: string; detail: string; go: string }[]>([])
  const [snoozedUntil, setSnoozedUntil] = useState('')
  const [socket, setSocket] = useState<Socket | null>(null)
  const [extraViews, setExtraViews] = useState<string[]>([]) // بخش‌هایی که نقش‌های سفارشی باز می‌کنند
  const [msgTick, setMsgTick] = useState(0)
  const socketRef = useRef<Socket | null>(null)
  const [deskNotif, setDeskNotif] = useState<boolean>(
    () => typeof window !== 'undefined' && 'Notification' in window && localStorage.getItem('hz-desktop-notifs') === '1'
  )
  const [deskPerm, setDeskPerm] = useState<string>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  ) // 'granted' | 'denied' | 'default' | 'unsupported'

  /* اعلان دسکتاپ — وقتی تب در پس‌زمینه است، اعلان‌های فوری را با Notification API نشان بده.
   * dedupe با نقشه id→count در localStorage؛ وقتی تب دیده می‌شود فقط وضعیت را به‌روز می‌کنیم (تُست خودش خبر می‌دهد). */
  const fireDesktopNotifs = useCallback((list: { id: string; severity: string; icon: string; title: string; detail: string; count?: number }[]) => {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      const enabled = localStorage.getItem('hz-desktop-notifs') === '1'
      const seen: Record<string, number> = JSON.parse(localStorage.getItem('hz-desktop-seen') || '{}')
      const hidden = document.visibilityState === 'hidden'
      for (const n of list) {
        const cur = n.count ?? 1
        const wasSeen = seen[n.id]
        const isNew = wasSeen === undefined || cur > wasSeen
        if (enabled && hidden && isNew && n.severity === 'critical') {
          try {
            const notif = new Notification('هایپر زیتون 🫒', {
              body: `${n.icon} ${n.title}\n${n.detail.slice(0, 110)}`,
              tag: n.id,
            })
            notif.onclick = () => {
              window.focus()
              notif.close()
            }
          } catch {
            /* some engines throw on constructor — ignore */
          }
        }
        seen[n.id] = cur
      }
      // prune keys that no longer exist
      const live = new Set(list.map((n) => n.id))
      for (const k of Object.keys(seen)) if (!live.has(k)) delete seen[k]
      localStorage.setItem('hz-desktop-seen', JSON.stringify(seen))
    } catch {
      /* storage unavailable — silent */
    }
  }, [])

  const toggleDeskNotif = useCallback(async () => {
    if (!('Notification' in window)) return toast.info('مرورگر شما از اعلان دسکتاپ پشتیبانی نمی‌کند')
    if (Notification.permission === 'denied') return toast.error('اجازه اعلان داده نشده — از نوار آدرس مرورگر (🔒) اجازه دهید')
    if (deskNotif) {
      localStorage.setItem('hz-desktop-notifs', '0')
      setDeskNotif(false)
      toast.info('اعلان دسکتاپ خاموش شد — اعلان‌ها فقط داخل سامانه می‌آیند')
      return
    }
    try {
      const perm = await Notification.requestPermission()
      setDeskPerm(perm)
      if (perm === 'granted') {
        localStorage.setItem('hz-desktop-notifs', '1')
        setDeskNotif(true)
        toast.success('اعلان دسکتاپ روشن شد — وقتی سامانه در پس‌زمینه است، فوری‌ها 🚨 روی دسکتاپ می‌آیند')
        try {
          const t = new Notification('هایپر زیتون 🫒', { body: 'اعلان دسکتاپ فعال شد ✅ — این یک پیام آزمایشی است' })
          t.onclick = () => {
            window.focus()
            t.close()
          }
        } catch {
          /* ignore */
        }
      } else {
        toast.info('برای فعال‌سازی، اجازه اعلان را در مرورگر تأیید کنید')
      }
    } catch {
      toast.error('درخواست اجازه اعلان ناموفق بود')
    }
  }, [deskNotif])

  useEffect(() => {
    api<{ user: AppCtx['user']; extraViews?: string[]; token?: string }>('/api/auth/me')
      .then((d) => {
        if (d.token) setSessionToken(d.token) // self-heal session for cookie-blocked mobile webviews
        setUser(d.user)
        setExtraViews(d.extraViews || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    const applyHash = () => setNav(parseHash())
    const raf = requestAnimationFrame(applyHash)
    window.addEventListener('hashchange', applyHash)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('hashchange', applyHash)
    }
  }, [])

  // websocket for real-time messaging (URL configurable for local server deployments)
  useEffect(() => {
    if (!user || socketRef.current) return
    const sockUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '/?XTransformPort=3003'
    const s = io(sockUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1500,
    })
    socketRef.current = s
    s.on('connect', () => {
      s.emit('hz-join', { userId: user.id, name: user.name })
      setSocket(s)
    })
    s.on('hz-msg', (data: { toId: string; fromName: string; body: string }) => {
      if (data.toId === user.id) {
        toast(`💬 ${data.fromName}: ${data.body.slice(0, 60)}`)
        setMsgTick((t) => t + 1)
      }
    })
    return () => {
      s.disconnect()
      socketRef.current = null
    }
  }, [user?.id])

  const navigate = useCallback((view: string, param = '') => {
    window.location.hash = `#/${view}${param ? '/' + param : ''}`
    setNav({ view, param })
    setSidebarOpen(false)
    setNotifOpen(false)
    pushRecentView(view)
    window.scrollTo({ top: 0 })
  }, [])

  // Ctrl+K / ⌘K opens the command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const refreshNotifications = useCallback(async () => {
    if (!user) return
    try {
      const d = await api<any>('/api/notifications')
      setNotifs(d.notifications || [])
      setSnoozedUntil(d.prefs?.snoozeUntil || '')
      fireDesktopNotifs(d.notifications || [])
    } catch {
      /* silent */
    }
  }, [user, fireDesktopNotifs])

  const bellSnooze = async (hours: number) => {
    try {
      await api('/api/notif-prefs', { method: 'PUT', body: { snoozeUntil: snoozeTargetIso(hours) } })
      toast.success(`سامانه ${faNum(hours)} ساعت ساکت شد — فقط فوری‌ها زنگ می‌خورند 😌`)
      setNotifOpen(false)
      refreshNotifications()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const wakeNotifs = async () => {
    try {
      await api('/api/notif-prefs', { method: 'PUT', body: { snoozeUntil: '' } })
      toast.success('سکوت موقت لغو شد — اعلان‌ها برگشتند 🔔')
      refreshNotifications()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  useEffect(() => {
    if (!user) return
    const tick = () => refreshNotifications()
    const t0 = setTimeout(tick, 0)
    const t = setInterval(tick, 45000)
    return () => {
      clearTimeout(t0)
      clearInterval(t)
    }
  }, [user, refreshNotifications, msgTick])

  const logout = async () => {
    try { await api('/api/auth/logout', { method: 'POST' }) } catch { /* still clear locally */ }
    clearSessionToken()
    socketRef.current?.disconnect()
    socketRef.current = null
    setSocket(null)
    setUser(null)
    navigate('dashboard')
  }

  const ctx: AppCtx = useMemo(
    () => ({ user, navigate, view: nav.view, param: nav.param, refreshNotifications, socket, socketReady: !!socket }),
    [user, navigate, nav, refreshNotifications, socket]
  )

  if (loading) {
    return (
      <div className="pattern-girih flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-14 w-14 animate-spin rounded-full border-4 border-[#c9a227]/30 border-t-[#c9a227]" />
          <p className="text-sm font-bold text-[#e9f0e4]">در حال بارگذاری سامانه…</p>
        </div>
      </div>
    )
  }

  if (!user)
    return (
      <LoginView
        onLogin={(u, token) => {
          if (token) setSessionToken(token) // header channel for cookie-blocked webviews
          setUser(u)
          api<{ extraViews?: string[] }>('/api/auth/me').then((d) => setExtraViews(d.extraViews || [])).catch(() => {})
          toast.success(`خوش آمدید ${u.name} 🌿`)
        }}
      />
    )

  // role-filtered nav (+ multi-language labels) — نقش‌های سفارشی هم بخش باز می‌کنند
  const groups = NAV.map((g) => ({
    title: groupTitle(g.title, lang),
    items: g.items
      .filter((i) => canAccess(i.key, user.role, user.secondaryRoles || []) || extraViews.includes('*') || extraViews.includes(i.key))
      .map((i) => ({ ...i, label: navLabel(i.key, i.label, lang) })),
  })).filter((g) => g.items.length > 0)

  const canQuickOrder = ['GM', 'PM', 'OM'].includes(user.role)

  const currentTitle =
    nav.param && nav.view === 'orders'
      ? navLabel('orders', 'جزئیات سفارش', lang)
      : nav.param && nav.view === 'receiving'
        ? navLabel('receiving', 'دریافت مرسوله', lang)
        : VIEW_TITLES[nav.view]
          ? navLabel(nav.view, VIEW_TITLES[nav.view], lang)
          : navLabel('dashboard', 'داشبورد', lang)

  const renderView = () => {
    switch (nav.view) {
      case 'dashboard': return <DashboardView ctx={ctx} />
      case 'orders': return <OrdersView ctx={ctx} />
      case 'receiving': return <ReceivingView ctx={ctx} />
      case 'verify': return <VerifyView ctx={ctx} />
      case 'accounting': return <AccountingView ctx={ctx} />
      case 'products': return <ProductsView ctx={ctx} />
      case 'providers': return <ProvidersView ctx={ctx} />
      case 'cheques': return <ChequesView ctx={ctx} />
      case 'archive': return <ArchiveView ctx={ctx} />
      case 'messages': return <MessagesView ctx={ctx} />
      case 'tasks': return <TasksView ctx={ctx} />
      case 'sop': return <SopView ctx={ctx} />
      case 'wall': return <WallView ctx={ctx} />
      case 'notes': return <NotesView ctx={ctx} />
      case 'feedback': return <FeedbackView ctx={ctx} />
      case 'planogram': return <PlanogramView ctx={ctx} />
      case 'sales': return <SalesView ctx={ctx} />
      case 'perf': return <PerfView ctx={ctx} />
      case 'admin': return <AdminView ctx={ctx} />
      case 'help': return <HelpView ctx={ctx} />
      case 'notifs': return <NotifsView ctx={ctx} />
      case 'briefing': return <BriefingView ctx={ctx} />
      case 'reports': return <ReportsView ctx={ctx} />
      case 'pricecheck': return <PriceCheckView ctx={ctx} />
      case 'science': return <ScienceView ctx={ctx} param={nav.param} />
      case 'research': return <ResearchView ctx={ctx} />
      case 'demo': return <DemoStudioView ctx={ctx} />
      case 'zonecount': return <ZoneCountView ctx={ctx} />
      case 'leaves': return <LeavesView ctx={ctx} />
      case 'crm': return <CrmView ctx={ctx} />
      case 'personnel': return <PersonnelView ctx={ctx} />
      case 'rbac': return <RbacView ctx={ctx} />
      case 'data': return <DataAdminView ctx={ctx} />
      case 'urgent': return <UrgentView ctx={ctx} />
      case 'kb': return <KbView ctx={ctx} />
      case 'payroll': return <PayrollView ctx={ctx} />
      case 'people': return <PeopleView ctx={ctx} />
      default: return <DashboardView ctx={ctx} />
    }
  }

  const sidebar = (
    <div className="pattern-girih flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[#1d5238] px-4 py-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#c9a227] to-[#14532d] shadow-lg">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fffdf6" strokeWidth="1.8">
            <path d="M12 22c4-2 8-5.5 8-11V5l-8-3-8 3v6c0 5.5 4 9 8 11Z" />
            <path d="M12 8c-2 1.5-3 3.5-3 6 2-1 3.5-2 4.5-4" />
          </svg>
        </div>
        <div>
          <p className="brand-shine text-lg font-black leading-6">هایپر زیتون</p>
          <p className="text-[10px] text-[#93c572]">سامانه مدیریت عملیات</p>
        </div>
        <button className="ms-auto text-[#93c572] lg:hidden" onClick={() => setSidebarOpen(false)}>
          <X size={20} />
        </button>
      </div>

      <nav className="scroll-gold flex-1 overflow-y-auto px-3 py-3">
        {groups.map((g, gi) => (
          <div key={g.title} className="mb-3">
            <p className="mb-1.5 px-2 text-[10px] font-bold tracking-wide text-[#93c572]/70">{g.title}</p>
            {g.items.map((i) => {
              const Icon = i.icon
              const active = nav.view === i.key
              return (
                <button
                  key={i.key}
                  onClick={() => navigate(i.key)}
                  className={cn(
                    'group mb-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-all',
                    active
                      ? 'bg-gradient-to-l from-[#c9a227]/25 to-[#c9a227]/5 text-[#f3ead0] shadow-[inset_0_0_0_1px_rgba(201,162,39,0.35)]'
                      : 'text-[#b9cfc0] hover:bg-[#143d2b] hover:text-white'
                  )}
                >
                  <Icon size={18} className={cn('shrink-0', active ? 'text-[#c9a227]' : 'text-[#6f9179] group-hover:text-[#c9a227]')} />
                  <span>{i.label}</span>
                  {active && <span className="ms-auto h-1.5 w-1.5 rounded-full bg-[#c9a227] pulse-dot" />}
                </button>
              )
            })}
            {gi < groups.length - 1 && <div className="sidebar-divider mx-2 mt-2" />}
          </div>
        ))}
      </nav>

      <div className="border-t border-[#1d5238] p-3">
        <div className="mb-2 flex items-center justify-center gap-1.5 rounded-lg border border-[#c9a227]/25 bg-[#c9a227]/10 px-2 py-1">
          <span className="text-[9px] font-black text-[#c9a227]">نسخه ۰٫۱ آلفا</span>
          <span className="text-[9px] text-[#93c572]">نام‌کد: «پِسته» — آمادهٔ آزمون مدیریت</span>
        </div>
        <div className="mb-2"><SandboxTourButton /></div>
        <div className="flex items-center gap-3 rounded-xl bg-[#143d2b] p-3">
          <Avatar name={user.name} color={user.color} size={38} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-white">{user.name}</p>
            <p className="text-[10px] text-[#93c572]">{ROLE_LABELS[user.role]} • {faNum(user.points)} امتیاز</p>
          </div>
          <button onClick={logout} title="خروج" className="rounded-lg p-2 text-[#93c572] transition hover:bg-[#b3372f]/20 hover:text-[#ff8a7a]">
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar — منطقی: در راست‌به‌چپ راست، در چپ‌به‌راست چپ */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-72 shadow-2xl">{sidebar}</aside>
        </div>
      )}

      <BarcodeScannerHost />
      <SandboxTour ctx={ctx} />
      {paletteOpen && <CommandPalette ctx={ctx} onClose={() => setPaletteOpen(false)} onLogout={logout} />}

      <div className="flex min-h-screen flex-col lg:ms-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 border-b border-[#e4dcc4]/80 bg-[#faf7ee]/90 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
            <button className="rounded-xl border border-border bg-card p-2 lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu size={18} />
            </button>
            <h1 className="min-w-0 text-base font-black text-foreground sm:text-lg">{currentTitle}</h1>
            <TopbarDateChip />
            <ThemeLangBar compact />

            {/* فرمان‌یاب */}
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[10px] font-bold text-muted-foreground transition hover:border-[#c9a227]/60 hover:text-[#8a6d10] md:flex"
              title="جست‌وجوی سریع (Ctrl+K)"
            >
              <Search size={14} />
              کجا برویم؟
              <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[9px] font-black">Ctrl K</kbd>
            </button>

            {canQuickOrder && (
              <button
                onClick={() => navigate('orders', 'new')}
                className="hidden items-center gap-1.5 rounded-xl bg-gradient-to-l from-[#0e7a4a] to-[#12905a] px-4 py-2 text-xs font-extrabold text-white shadow-lg shadow-[#0e7a4a]/25 transition hover:shadow-xl hover:shadow-[#0e7a4a]/35 sm:flex"
              >
                <Plus size={15} />
                سفارش جدید
              </button>
            )}

            <div className="ms-auto flex flex-wrap items-center gap-2">
              {/* فرمان‌یاب موبایل */}
              <button
                onClick={() => setPaletteOpen(true)}
                className="rounded-xl border border-border bg-card p-2.5 transition hover:border-[#c9a227]/60 md:hidden"
                title="جست‌وجوی سریع"
                aria-label="جست‌وجوی سریع"
              >
                <Search size={17} className="text-[#8a6d10]" />
              </button>
              {/* notifications */}
              <div className="relative">
                <button
                  ref={bellRef}
                  onClick={() => setNotifOpen((v) => !v)}
                  aria-expanded={notifOpen}
                  className="relative rounded-xl border border-border bg-card p-2.5 transition hover:border-[#c9a227]/60"
                  title="اعلان‌ها"
                >
                  <Bell size={17} className={cn('text-[#8a6d10]', snoozedUntil && 'opacity-45')} />
                  {snoozedUntil && (
                    <span className="bell-muted absolute -start-1 -top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#8a6d10] text-[9px] text-white" title="سکوت موقت فعال">🔕</span>
                  )}
                  {!snoozedUntil && notifs.length > 0 && (
                    <span className="absolute -start-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-[#b3372f] px-1 text-[9px] font-black text-white">
                      {faNum(notifs.length)}
                    </span>
                  )}
                </button>
                <PopoverScaffold open={notifOpen} onClose={() => setNotifOpen(false)} anchorRef={bellRef} width={320} panelClassName="p-2" maxHeightVh={70}>
                    <p className="px-2 py-1.5 text-xs font-black text-muted-foreground">مرور لحظه‌ای کارها — مرتب‌شده بر اساس اهمیت</p>
                    {notifs.length === 0 && <p className="px-2 py-4 text-center text-xs text-muted-foreground">همه‌چیز مرتب است ✅</p>}
                    {notifs.slice(0, 7).map((n, i) => (
                      <button
                        key={n.id}
                        onClick={() => navigate(n.go)}
                        className={cn(
                          'notif-item mb-1 flex w-full items-start gap-3 rounded-xl border p-2.5 transition hover:bg-secondary',
                          n.severity === 'critical' ? 'border-[#b3372f]/30 bg-[#fee2e2]/40' : n.severity === 'warning' ? 'border-[#a16207]/25 bg-[#fef9c3]/40' : 'border-transparent'
                        )}
                      >
                        <span className="text-xl">{n.icon}</span>
                        <span>
                          <span className="block text-xs font-extrabold">{n.title}</span>
                          <span className="block text-[10px] leading-4 text-muted-foreground">{n.detail}</span>
                        </span>
                      </button>
                    ))}
                    {notifs.length > 7 && <p className="px-2 pb-1 pt-0.5 text-center text-[10px] text-muted-foreground">و {faNum(notifs.length - 7)} اعلان دیگر…</p>}
                    {/* اعلان دسکتاپ */}
                    {deskPerm !== 'unsupported' && (
                      <div className="mt-1 flex items-center justify-between gap-2 border-t border-dashed border-[#c9a227]/30 px-1 pt-2">
                        <span className="text-[10px] font-bold text-muted-foreground">🖥️ اعلان دسکتاپ (وقتی تب بسته/پشت است)</span>
                        {deskPerm === 'denied' ? (
                          <span className="rounded-full bg-[#b3372f]/10 px-2 py-0.5 text-[9px] font-bold text-[#b3372f]" title="از نوار آدرس مرورگر اجازه اعلان بدهید">اجازه داده نشد</span>
                        ) : (
                          <button
                            onClick={toggleDeskNotif}
                            role="switch"
                            aria-checked={deskNotif}
                            aria-label="اعلان دسکتاپ"
                            className={cn('desk-switch relative h-5 w-9 shrink-0 rounded-full transition', deskNotif ? 'bg-[#c9a227]' : 'bg-border')}
                            title={deskNotif ? 'روشن — برای خاموش‌کردن بزنید' : 'خاموش — برای روشن‌کردن بزنید'}
                          >
                            <span className={cn('desk-knob absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', deskNotif ? 'end-0.5' : 'start-0.5')} />
                          </button>
                        )}
                      </div>
                    )}
                    {/* سکوت موقت / بیدارکردن */}
                    <div className="mt-1 border-t border-dashed border-[#c9a227]/30 pt-1.5">
                      {snoozedUntil ? (
                        <button
                          onClick={wakeNotifs}
                          className="w-full rounded-xl bg-[#0e7a4a] py-2 text-[11px] font-extrabold text-white shadow transition hover:shadow-lg"
                        >
                          🔕 سکوت فعال — بیدارکردن اعلان‌ها
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 text-[10px] font-bold text-muted-foreground">سکوت:</span>
                          <button onClick={() => bellSnooze(1)} className="flex-1 rounded-xl border border-border bg-card py-1.5 text-[10px] font-extrabold transition hover:border-[#c9a227] hover:bg-[#fdf6dd]">۱ ساعت</button>
                          <button onClick={() => bellSnooze(3)} className="flex-1 rounded-xl border border-border bg-card py-1.5 text-[10px] font-extrabold transition hover:border-[#c9a227] hover:bg-[#fdf6dd]">۳ ساعت</button>
                          <button onClick={() => navigate('notifs')} className="rounded-xl px-1.5 py-1.5 text-[10px] font-black text-[#8a6d10]" title="تنظیمات کامل اعلان‌ها">⋯</button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => navigate('notifs')}
                      className="mt-1.5 w-full rounded-xl border border-[#c9a227]/40 bg-[#fdf6dd]/60 py-2 text-[11px] font-extrabold text-[#8a6d10] transition hover:bg-[#fdf6dd]"
                    >
                      🔔 مشاهده همه در مرکز اعلان‌ها ←
                    </button>
                </PopoverScaffold>
              </div>
              {canQuickOrder && (
                <button
                  onClick={() => navigate('orders', 'new')}
                  className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-extrabold text-white sm:hidden"
                >
                  <Plus size={14} /> سفارش
                </button>
              )}
              <button onClick={() => navigate('perf')} className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 sm:flex">
                <Avatar name={user.name} color={user.color} size={28} />
                <span className="text-xs font-extrabold">{user.name}</span>
              </button>
            </div>
          </div>
          <div className="shimmer-line h-px w-full" />
        </header>

        <main className="pattern-sand mx-auto w-full max-w-7xl flex-1 p-4 pb-24 sm:p-6 lg:pb-10">{renderView()}</main>

        {/* Sticky footer */}
        <footer className="mt-auto border-t border-[#e4dcc4]/70 bg-[#0b2e20] px-6 py-4 text-center">
          <p className="text-[11px] text-[#93c572]">
            هایپر زیتون کرمان • سامانه مدیریت یکپارچه عملیات — نسخه ۰٫۱ آلفا «پِسته»
          </p>
          <p className="mt-1 text-[10px] text-[#93c572]/60">تقویم شمسی و قمری دقیق • پشتیبانی از هلو • ساخته‌شده برای توانمندسازی تیم</p>
        </footer>
      </div>
    </div>
  )
}
