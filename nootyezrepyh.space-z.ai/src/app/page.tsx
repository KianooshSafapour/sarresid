'use client'

import * as React from 'react'
import { useUser, api, ClientUser } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { toFaDigits } from '@/lib/jalali'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { allowedSections } from '@/lib/sections-registry'
import { PatternBackground, GlowCard, OrnamentDivider, RoleBadge } from '@/components/zeytoon-ui'
import { NotificationBell } from '@/components/notification-bell'
import { ProfileMenu } from '@/components/profile-menu'
import { CommandPalette } from '@/components/command-palette'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Toaster } from '@/components/ui/toaster'
import { useToast } from '@/hooks/use-toast'
import { Delete, Loader2, Menu, PlusCircle } from 'lucide-react'

// ---- Section registry (each module implements its own component) ----
import { DashboardSection } from '@/components/sections/dashboard'
import { OrdersSection } from '@/components/sections/orders'
import { DeliveriesSection } from '@/components/sections/deliveries'
import { AccountingSection } from '@/components/sections/accounting'
import { ChequesSection } from '@/components/sections/cheques'
import { ProductsSection } from '@/components/sections/products'
import { SuppliersSection } from '@/components/sections/suppliers'
import { PlanogramSection } from '@/components/sections/planogram'
import { TasksSection } from '@/components/sections/tasks'
import { SopsSection } from '@/components/sections/sops'
import { WallSection } from '@/components/sections/wall'
import { NotesSection } from '@/components/sections/notes'
import { FeedbackSection } from '@/components/sections/feedback'
import { MessagesSection } from '@/components/sections/messages'
import { ShiftsSection } from '@/components/sections/shifts'
import { SalesSection } from '@/components/sections/sales'
import { WarehouseSection } from '@/components/sections/warehouse'
import { AdminSection } from '@/components/sections/admin'
import { RewardsSection } from '@/components/sections/rewards'
import { ResearchSection } from '@/components/sections/research'
import { DemoSection } from '@/components/sections/demo'
import { VersionsSection } from '@/components/sections/versions'

interface StaffMember { id: string; name: string; primaryRole: string; roles: string[]; color: string; points: number; active: boolean }

export default function HomePage() {
  const { user, loading, logout } = useUser()
  const [section, setSection] = React.useState('dashboard')
  const [navNonce, setNavNonce] = React.useState(0)
  const [moreOpen, setMoreOpen] = React.useState(false)

  /** navigation used by the command palette — re-navigating the same section forces a fresh mount so deep-link flags are consumed */
  const navigateExternal = React.useCallback((key: string) => {
    setSection((cur) => {
      if (cur === key) setNavNonce((n) => n + 1)
      return key
    })
  }, [])

  React.useEffect(() => {
    if (user) setSection(canUser(user.roles, PERMISSIONS.VIEW_DASHBOARD) ? 'dashboard' : 'tasks')
  }, [user])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <Loader2 className="size-8 animate-spin text-olive" />
      </div>
    )
  }

  if (!user) return <LoginScreen />

  const navItems = allowedSections(user.roles, canUser)

  const sections: Record<string, React.ReactNode> = {
    dashboard: <DashboardSection user={user} onNavigate={setSection} />,
    orders: <OrdersSection user={user} />,
    deliveries: <DeliveriesSection user={user} />,
    accounting: <AccountingSection user={user} />,
    cheques: <ChequesSection user={user} />,
    products: <ProductsSection user={user} />,
    suppliers: <SuppliersSection user={user} />,
    planogram: <PlanogramSection user={user} />,
    tasks: <TasksSection user={user} />,
    sops: <SopsSection user={user} />,
    wall: <WallSection user={user} />,
    notes: <NotesSection user={user} />,
    feedback: <FeedbackSection user={user} />,
    messages: <MessagesSection user={user} />,
    shifts: <ShiftsSection user={user} />,
    sales: <SalesSection user={user} />,
    warehouse: <WarehouseSection user={user} />,
    admin: <AdminSection user={user} />,
    rewards: <RewardsSection user={user} />,
    research: <ResearchSection user={user} />,
    demo: <DemoSection user={user} onNavigate={setSection} />,
    versions: <VersionsSection user={user} />,
  }

  const groups = [...new Set(navItems.map((n) => n.group))]
  const currentNav = navItems.find((n) => n.key === section)

  return (
    <div className="min-h-screen flex flex-col bg-cream pattern-paisley">
      {/* Top header */}
      <header className="sticky top-0 z-40 border-b border-gold/25 bg-card/85 backdrop-blur-md">
        <div className="flex items-center gap-3 px-4 h-16 max-w-[1600px] mx-auto w-full">
          {/* logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <svg width="38" height="38" viewBox="0 0 48 48" aria-hidden>
              <circle cx="24" cy="24" r="22" fill="#5a7d4f" opacity="0.12" />
              <path d="M24 8c9 0 15 7 15 15 0 10-8 15-8 22 0 5 4 7 7 7-11 0-21-7-21-18 0-9 6-13 6-20 0-4-3-6-6-6 3 0 7 2 7 6" transform="scale(0.72) translate(9 4)" fill="#5a7d4f" />
              <circle cx="31" cy="19" r="2.4" fill="#b8860b" />
            </svg>
            <div className="leading-tight">
              <div className="font-black text-[15px] gold-shimmer">هایپر زیتون</div>
              <div className="text-[10px] text-muted-foreground">سامانه هوشمند مدیریت</div>
            </div>
          </div>

          {/* Quick actions (desktop) */}
          <div className="hidden md:flex items-center gap-2 mr-4">
            {canUser(user.roles, PERMISSIONS.MANAGE_ORDERS) && (
              <Button
                size="sm"
                className="bg-olive hover:bg-olive/90 text-white gap-1.5 animate-pulse-gold"
                onClick={() => {
                  sessionStorage.setItem('zeytoon_open_new_order', '1')
                  setSection('orders')
                }}
              >
                <PlusCircle className="size-4" />
                سفارش جدید
              </Button>
            )}
          </div>

          <div className="flex-1" />

          {/* global search / command palette */}
          <CommandPalette user={user} onNavigate={navigateExternal} />

          <ThemeToggle />

          <NotificationBell user={user} onNavigate={setSection} />

          <div className="hidden sm:block text-left">
            <div className="text-sm font-bold">{user.name}</div>
            <RoleBadge roleKey={user.primaryRole} />
          </div>
          <ProfileMenu user={user} logout={logout} />
        </div>
      </header>

      <div className="flex flex-1 max-w-[1600px] mx-auto w-full">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex flex-col w-60 shrink-0 border-l border-gold/15 bg-card/60 backdrop-blur-sm py-4 px-3 gap-1 sticky top-16 self-start max-h-[calc(100vh-4rem)] overflow-y-auto">
          {groups.map((g) => (
            <div key={g} className="mb-2">
              <div className="text-[11px] font-bold text-muted-foreground px-3 mb-1.5">{g}</div>
              {navItems.filter((n) => n.group === g).map((n) => (
                <button
                  key={n.key}
                  onClick={() => setSection(n.key)}
                  className={cn(
                    'group relative w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all',
                    section === n.key
                      ? 'bg-olive text-white shadow-md shadow-olive/25'
                      : 'text-foreground/80 hover:bg-accent hover:translate-x-[-2px]'
                  )}
                >
                  <n.icon className={cn('size-4.5 transition-transform', section !== n.key && 'group-hover:scale-110')} />
                  {n.label}
                  {section === n.key && (
                    <span className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full bg-gold shadow-[0_0_8px] shadow-gold/60" aria-hidden />
                  )}
                </button>
              ))}
            </div>
          ))}
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 p-4 pb-24 lg:pb-6">
          <div key={`${section}-${navNonce}`} className="animate-fade-up">
            {sections[section] || (
              <div className="p-8 text-center text-muted-foreground">بخش یافت نشد</div>
            )}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-md border-t border-gold/25 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {navItems.slice(0, 4).map((n) => (
            <button
              key={n.key}
              onClick={() => setSection(n.key)}
              className={cn('flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold transition-colors', section === n.key ? 'text-olive' : 'text-muted-foreground')}
            >
              <n.icon className="size-5" />
              {n.label.length > 10 ? n.label.split(' ')[0] : n.label}
            </button>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className={cn('flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold transition-colors', navItems.slice(4).some((n) => n.key === section) ? 'text-olive' : 'text-muted-foreground')}
          >
            <Menu className="size-5" />
            بیشتر
          </button>
        </div>
      </nav>

      {/* Mobile "more" sheet */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>همه بخش‌ها</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 pb-4">
            {navItems.map((n) => (
              <button
                key={n.key}
                onClick={() => {
                  setSection(n.key)
                  setMoreOpen(false)
                }}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-[11px] font-bold',
                  section === n.key ? 'border-olive bg-olive/10 text-olive' : 'border-gold/20 bg-card'
                )}
              >
                <n.icon className="size-5" />
                <span className="text-center leading-tight">{n.label}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Footer */}
      <footer className="mt-auto border-t border-gold/20 bg-card/70 backdrop-blur-sm">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
            سامانه فعال — هایپر زیتون کرمان
          </div>
          <div>طراحی‌شده برای ساده‌سازی کار شما 🌿</div>
        </div>
      </footer>
    </div>
  )
}

/* ==================== LOGIN SCREEN ==================== */

function LoginScreen() {
  const { toast } = useToast()
  const [staff, setStaff] = React.useState<StaffMember[]>([])
  const [selected, setSelected] = React.useState<StaffMember | null>(null)
  const [pin, setPin] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [search, setSearch] = React.useState('')

  React.useEffect(() => {
    fetch('/api/auth/staff')
      .then((r) => r.json())
      .then(setStaff)
      .catch(() => {})
  }, [])

  async function login() {
    if (!selected || pin.length < 4) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selected.id, pin }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطا در ورود')
      localStorage.setItem('zeytoon_session', JSON.stringify({ ...data.user, token: data.token }))
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  // auto-submit once all 4 digits are entered (PIN-pad style)
  React.useEffect(() => {
    if (pin.length === 4 && !busy) login()
  }, [pin])

  const filtered = staff.filter((s) => s.name.includes(search.trim()))

  return (
    <div className="min-h-screen flex flex-col pattern-girih bg-cream">
      {/* theme preference available before login too */}
      <div className="fixed top-4 left-4 z-50 no-print">
        <ThemeToggle />
      </div>
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl">
          {/* Brand */}
          <div className="text-center mb-8">
            <div className="logo-float inline-flex items-center justify-center size-20 rounded-3xl bg-gradient-to-br from-olive to-olive/70 shadow-xl shadow-olive/30 mb-4 rotate-3">
              <svg width="46" height="46" viewBox="0 0 48 48" aria-hidden>
                <path d="M24 6c10 0 17 8 17 17 0 11-9 17-9 25 0 6 5 8 8 8-13 0-24-8-24-20 0-10 7-15 7-22 0-5-4-7-7-7 4 0 8 2 8 7" transform="scale(0.7) translate(10 3)" fill="#faf7ef" />
                <circle cx="32" cy="18" r="2.8" fill="#d4a937" transform="scale(0.7) translate(10 3)" />
              </svg>
            </div>
            <h1 className="text-3xl font-black gold-shimmer">هایپر زیتون کرمان</h1>
            <p className="text-muted-foreground mt-2">به سامانه مدیریت هوشمند خوش آمدید 🌿</p>
          </div>

          <GlowCard className="p-5 md:p-7">
            {!selected ? (
              <>
                <OrnamentDivider />
                <div className="text-center font-bold mb-4">نام خود را انتخاب کنید</div>
                <input
                  className="w-full h-11 rounded-xl border border-input bg-background px-4 mb-4 text-sm"
                  placeholder="🔍 جستجوی نام..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[42vh] overflow-y-auto p-1">
                  {filtered.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setSelected(s); setPin(''); setError('') }}
                      className="card-hover-lift flex flex-col items-center gap-2 rounded-2xl border border-gold/20 bg-card p-4 hover:border-gold/50 transition-colors"
                    >
                      <Avatar className="size-12 ring-2 ring-gold/30">
                        <AvatarFallback style={{ background: s.color }} className="text-white font-black text-lg">
                          {s.name.replace('خانم ', '').replace('آقای ', '').charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="font-bold text-sm text-center">{s.name}</div>
                      <RoleBadge roleKey={s.primaryRole} />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-5">
                  <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setPin(''); setError('') }}>
                    ← بازگشت
                  </Button>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-10 ring-2 ring-gold/30">
                      <AvatarFallback style={{ background: selected.color }} className="text-white font-bold">
                        {selected.name.replace('خانم ', '').replace('آقای ', '').charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-bold">{selected.name}</div>
                      <RoleBadge roleKey={selected.primaryRole} />
                    </div>
                  </div>
                </div>
                <div className="text-center text-sm text-muted-foreground mb-3">رمز ورود خود را وارد کنید</div>
                {/* PIN dots */}
                <div className="flex justify-center gap-3 mb-6" dir="ltr">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        'size-4 rounded-full border-2 transition-all',
                        i < pin.length ? 'bg-olive border-olive scale-110' : 'border-gold/40'
                      )}
                    />
                  ))}
                </div>
                {error && <div className="text-center text-sm text-red-600 mb-3 bg-red-50 rounded-lg py-2">{error}</div>}
                {/* Keypad */}
                <div className="grid grid-cols-3 gap-2.5 max-w-xs mx-auto" dir="ltr">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                    <button
                      key={d}
                      onClick={() => pin.length < 4 && setPin((p) => p + d)}
                      className="h-14 rounded-2xl border border-gold/25 bg-card text-xl font-bold hover:bg-accent active:scale-95 transition-all touch-manipulation"
                    >
                      {toFaDigits(d)}
                    </button>
                  ))}
                  <button
                    onClick={() => setPin((p) => p.slice(0, -1))}
                    className="h-14 rounded-2xl border border-gold/25 bg-card flex items-center justify-center hover:bg-accent active:scale-95 transition-all"
                    aria-label="حذف"
                  >
                    <Delete className="size-5" />
                  </button>
                  <button
                    onClick={() => pin.length < 4 && setPin((p) => p + '0')}
                    className="h-14 rounded-2xl border border-gold/25 bg-card text-xl font-bold hover:bg-accent active:scale-95 transition-all"
                  >
                    {toFaDigits('0')}
                  </button>
                  <button
                    onClick={login}
                    disabled={busy || pin.length < 4}
                    className="h-14 rounded-2xl bg-olive text-white font-bold hover:bg-olive/90 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center"
                  >
                    {busy ? <Loader2 className="size-5 animate-spin" /> : 'ورود'}
                  </button>
                </div>
                <div className="text-center text-xs text-muted-foreground mt-5">
                  رمز پیش‌فرض: ۱۲۳۴ — در صورت فراموشی با مدیر سامانه تماس بگیرید
                </div>
              </>
            )}
          </GlowCard>
        </div>
      </main>
      <footer className="mt-auto py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center">
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden className="opacity-70">
            <path d="M24 6c10 0 17 8 17 17 0 11-9 17-9 25 0 6 5 8 8 8-13 0-24-8-24-20 0-10 7-15 7-22 0-5-4-7-7-7 4 0 8 2 8 7" transform="scale(0.7) translate(10 3)" fill="#5a7d4f" />
          </svg>
          هایپر زیتون کرمان — سامانهٔ داخلی مدیریت
          <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold tabular-nums" dir="ltr">v1.6</span>
        </div>
      </footer>
      <Toaster />
    </div>
  )
}
