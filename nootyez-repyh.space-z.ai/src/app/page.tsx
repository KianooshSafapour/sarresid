'use client'
import * as React from 'react'
import { useApp } from '@/lib/store'
import { navFor, badgeCountText, type NavItem } from '@/lib/nav'
import { hasRole } from '@/lib/types'
import { Sidebar } from '@/components/platform/Sidebar'
import { BadgesPoller } from '@/components/platform/BadgesPoller'
import { Header } from '@/components/platform/Header'
import Login from '@/components/platform/Login'
import DashboardSection from '@/components/platform/DashboardSection'
import { QuickNav } from '@/components/platform/QuickNav'
import OrdersSection from '@/components/platform/OrdersSection'
import DeliveriesSection from '@/components/platform/DeliveriesSection'
import AccountingSection from '@/components/platform/AccountingSection'
import PaymentsSection from '@/components/platform/PaymentsSection'
import ProductsSection from '@/components/platform/ProductsSection'
import SuppliersSection from '@/components/platform/SuppliersSection'
import WarehouseSection from '@/components/platform/WarehouseSection'
import PlanogramSection from '@/components/platform/PlanogramSection'
import CrmSection from '@/components/platform/CrmSection'
import TasksSection from '@/components/platform/TasksSection'
import SopsSection from '@/components/platform/SopsSection'
import CommunitySection from '@/components/platform/CommunitySection'
import NotesSection from '@/components/platform/NotesSection'
import MessagesSection from '@/components/platform/MessagesSection'
import ProfileSection from '@/components/platform/ProfileSection'
import AdminSection from '@/components/platform/AdminSection'
import AuditSection from '@/components/platform/AuditSection'
import ReportsSection from '@/components/platform/ReportsSection'
import DemoSection from '@/components/platform/DemoSection'
import PilotSection from '@/components/platform/PilotSection'
import { toFaDigits } from '@/lib/jalali'
import { APP_RELEASE_FA } from '@/lib/version'

function Section({ view, user }: { view: string; user: NonNullable<ReturnType<typeof useApp.getState>['user']> }) {
  switch (view) {
    case 'dashboard': return <DashboardSection user={user} />
    case 'orders': return <OrdersSection user={user} />
    case 'deliveries': return <DeliveriesSection user={user} />
    case 'accounting': return <AccountingSection user={user} />
    case 'payments': return <PaymentsSection user={user} />
    case 'products': return <ProductsSection user={user} />
    case 'suppliers': return <SuppliersSection user={user} />
    case 'warehouse': return <WarehouseSection user={user} />
    case 'planogram': return <PlanogramSection user={user} />
    case 'crm': return <CrmSection user={user} />
    case 'tasks': return <TasksSection user={user} />
    case 'sops': return <SopsSection user={user} />
    case 'community': return <CommunitySection user={user} />
    case 'notes': return <NotesSection user={user} />
    case 'messages': return <MessagesSection user={user} />
    case 'profile': return <ProfileSection user={user} />
    case 'admin': return <AdminSection user={user} />
    case 'audit': return <AuditSection user={user} />
    case 'reports': return <ReportsSection user={user} />
    case 'demo': return <DemoSection user={user} />
    case 'pilot': return <PilotSection user={user} />
    default: return <DashboardSection user={user} />
  }
}

const BADGE_TONE: Record<string, string> = {
  orders: 'bg-[#DAA520] text-[#2F4A36]',
  cheques: 'bg-[#DAA520] text-[#2F4A36]',
  deliveries: 'bg-[#93C572] text-[#253A2A]',
  tasksMine: 'bg-[#93C572] text-[#253A2A]',
  messagesUnread: 'bg-rose-500 text-white',
}

function MobileTabBar() {
  const { user, view, setView, badges } = useApp()
  if (!user) return null
  const items = navFor(user)
  const main = ['dashboard', 'orders', 'deliveries', 'tasks', 'messages']
    .filter((k) => items.some((i) => i.key === k))
    .map((k) => items.find((i) => i.key === k)!)
  const more = items.filter((i) => !main.includes(i))
  const badgeOf = (i: NavItem) => (i.badgeKey ? badges[i.badgeKey] ?? 0 : 0)
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#E4DCC8] bg-[#FAF7EF]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden" aria-label="Quick navigation">
      <div className="grid grid-cols-5">
        {main.slice(0, 5).map((i) => (
          <button
            key={i.key}
            onClick={() => setView(i.key as never)}
            className={`relative flex min-h-[48px] flex-col items-center gap-0.5 py-2 text-[10px] font-bold transition-colors ${view === i.key ? 'text-[#3E6B4A]' : 'text-[#8A9884]'}`}
            aria-current={view === i.key ? 'page' : undefined}
          >
            <span className={`h-1 w-6 rounded-full transition-colors ${view === i.key ? 'bg-[#DAA520]' : 'bg-transparent'}`} />
            {i.labelFa}
            {badgeOf(i) > 0 && (
              <span aria-hidden className="absolute right-[calc(50%-22px)] top-1 h-2 w-2 rounded-full bg-rose-500 shadow" />
            )}
          </button>
        ))}
      </div>
      {more.length > 0 && (
        <div className="pz-scroll flex gap-1 overflow-x-auto border-t border-[#EFEAD8] px-2 py-1.5">
          {more.map((i) => {
            const n = badgeOf(i)
            return (
              <button
                key={i.key}
                onClick={() => setView(i.key as never)}
                className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition ${view === i.key ? 'bg-[#3E6B4A] text-white shadow-sm' : 'bg-white text-[#6B7A66] border border-[#E4DCC8] hover:border-[#93C572]'}`}
              >
                {i.labelFa}
                {n > 0 && (
                  <span className={`ms-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-black leading-none ${BADGE_TONE[i.badgeKey ?? ''] ?? 'bg-rose-500 text-white'}`}>
                    {badgeCountText(n)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </nav>
  )
}

export default function Page() {
  const { user, view } = useApp()
  const [drawer, setDrawer] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <div className="pz-page-bg flex min-h-screen items-center justify-center">
        <div className="pz-glow-border rounded-3xl p-[2px]">
          <div className="flex h-24 w-24 items-center justify-center rounded-[22px] bg-gradient-to-br from-[#2F4A36] to-[#3E6B4A]">
            <span className="pz-gold-text text-3xl font-black">ز</span>
          </div>
        </div>
      </div>
    )
  }

  if (!user) return <Login />

  const allowed = navFor(user).some((n) => n.key === view)

  return (
    <div dir="rtl" className="pz-page-bg flex min-h-screen flex-col">
      <Header user={user} onOpenMobile={() => setDrawer(true)} />
      <div className="flex flex-1">
        <Sidebar user={user} />
        <Sidebar user={user} mobileOpen={drawer} onCloseMobile={() => setDrawer(false)} />
        <main className="min-w-0 flex-1 px-3 pb-40 pt-4 sm:px-5 md:pb-10 lg:pb-8" role="main">
          {allowed ? (
            <Section view={view} user={user} />
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
              <p className="text-lg font-bold text-amber-800">دسترسی به این بخش برای نقش شما مجاز نیست</p>
              <p className="mt-1 text-sm text-amber-700">This section is not available for your role.</p>
            </div>
          )}
        </main>
      </div>

      <QuickNav user={user} />
      <BadgesPoller />

      {/* Sticky footer */}
      <footer className="mt-auto border-t border-[#E4DCC8] bg-[#F5F2E8]/80 px-4 py-3 pb-24 text-center backdrop-blur-sm md:pb-3 lg:pb-3">
        <p className="text-xs text-[#8A9884]">
          هایپر زیتون — پلتفرم مدیریت عملیات · Hyper Zeytoon Operations Platform · {toFaDigits(1404)}
        </p>
        <p className="mt-0.5 text-[10px] font-semibold text-[#B0AA96]">{APP_RELEASE_FA}</p>
        <p className="mt-0.5 hidden text-[10px] text-[#B0AA96] md:block">برای جستجوی سریع Ctrl+K را بزنید · Press Ctrl+K for quick navigation</p>
      </footer>

      <MobileTabBar />
    </div>
  )
}
