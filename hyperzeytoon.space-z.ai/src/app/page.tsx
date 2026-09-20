'use client'

import * as React from 'react'
import { useApp } from '@/store/app'
import { api } from '@/lib/api'
import { clearSessionToken } from '@/lib/session'
import { Sidebar, MobileNavDrawer, MobileBottomBar } from '@/components/platform/shell/Sidebar'
import { Topbar } from '@/components/platform/shell/Topbar'
import { SystemOverlays } from '@/components/platform/shell'
import { I18nProvider } from '@/lib/i18n'
import { Login } from '@/components/platform/sections/Login'
import { registry, SectionPlaceholder } from '@/components/platform/sections/registry'
import { EmptyState } from '@/components/platform/ui/shared'
import { Plus } from "lucide-react"
import type { SessionUser } from '@/lib/types'

function SectionView() {
  const { section } = useApp()
  const Comp = registry[section]
  if (!Comp) return <SectionPlaceholder section={section} />
  // key forces the entrance animation to replay on every section switch
  return (
    <div key={section} className="fade-in-up">
      <Comp />
    </div>
  )
}

function QuickOrderFab() {
  const { user, setQuickAction } = useApp()
  if (!user?.isManager) return null
  return (
    <button
      onClick={() => setQuickAction('new-order')}
      aria-label="سفارش جدید"
      className="md:hidden fixed bottom-20 left-4 z-40 h-14 w-14 rounded-full text-white shadow-xl flex items-center justify-center active:scale-95 transition-transform"
      style={{ background: 'linear-gradient(135deg,#3E7C59,#2a5a40)', boxShadow: '0 8px 24px rgba(62,124,89,.45), 0 0 0 2px rgba(201,162,39,.5)' }}
    >
      <Plus className="h-7 w-7" />
    </button>
  )
}

function Shell() {
  const { notifications, setNotifications, unreadCount } = useApp()
  const [drawer, setDrawer] = React.useState(false)

  // poll notifications
  React.useEffect(() => {
    let alive = true
    const load = () =>
      api<never[]>('/api/notifications')
        .then((d) => alive && setNotifications(d))
        .catch(() => null)
    load()
    const t = setInterval(load, 20000)
    return () => { alive = false; clearInterval(t) }
  }, [setNotifications])

  return (
    <div className="h-screen flex" dir="rtl">
      {/* desktop sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-l border-[#c9a227]/20">
        <Sidebar />
      </aside>
      <MobileNavDrawer open={drawer} onClose={() => setDrawer(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenu={() => setDrawer(true)} />
        <main className="flex-1 overflow-y-auto p-3 md:p-6 pb-24 lg:pb-8 paisley-bg" role="main">
          <div className="mx-auto max-w-7xl fade-in-up">
            <SectionView />
          </div>
        </main>
        {/* sticky footer */}
        <footer className="hidden lg:flex mt-auto items-center justify-center gap-2 py-3 text-xs text-muted-foreground border-t border-border bg-card/50">
          <span>پلتفرم داخلی هایپر زیتون — ساخته‌شده برای همکاران 🌿</span>
          <span className="text-gold">•</span>
          <span>دسترسی سریع: داشبورد، سفارش‌ها، تحویل‌ها و کارهای من</span>
        </footer>
      </div>
      <MobileBottomBar />
      <QuickOrderFab />
      <SystemOverlays />
    </div>
  )
}

export default function Home() {
  const { user, booted, setUser, setBooted, setDemoName } = useApp()
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    api<{ user: SessionUser | null; demo?: { active: boolean; name: string | null } }>('/api/auth/me')
      .then((d) => {
        if (!d.user) clearSessionToken() // stale/invalid token — clean up
        setUser(d.user)
        setDemoName(d.demo?.active ? d.demo.name : null)
        setBooted(true)
      })
      .catch(() => {
        setError('ارتباط با سرور برقرار نشد')
        setBooted(true)
      })
  }, [setUser, setBooted, setDemoName])

  if (!booted) {
    return (
      <div className="min-h-screen paisley-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-20 w-20 rounded-3xl overflow-hidden ring-2 ring-[#c9a227]/50 soft-pulse">
            <img src="/brand/logo.png" alt="هایپر زیتون" className="h-full w-full object-cover" />
          </div>
          <p className="text-sm text-muted-foreground">در حال آماده‌سازی…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen paisley-bg flex items-center justify-center p-6">
        <EmptyState title="خطای ارتباط با سرور" description={error} />
      </div>
    )
  }

  return (
    <I18nProvider>
      {user ? <Shell /> : <Login />}
    </I18nProvider>
  )
}
