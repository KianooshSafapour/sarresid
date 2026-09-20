'use client'

import * as React from 'react'
import { useApp, useNavGroups, type NavItem } from '@/store/app'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, ListChecks, BookOpenCheck, ShoppingCart, Truck, Calculator, Wallet,
  Package, Handshake, Warehouse, LayoutGrid, Users, Store, Megaphone, MessagesSquare,
  StickyNote, Lightbulb, Trophy, CircleHelp, UserCog, History, Settings, BarChart3, Leaf, LogOut, X,
  ClipboardList, FlaskConical,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, ListChecks, BookOpenCheck, ShoppingCart, Truck, Calculator, Wallet,
  Package, Handshake, Warehouse, LayoutGrid, Users, Store, Megaphone, MessagesSquare,
  StickyNote, Lightbulb, Trophy, CircleHelp, UserCog, History, Settings, BarChart3, ClipboardList,
  FlaskConical,
}

function NavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  const Icon = ICONS[item.icon] ?? LayoutDashboard
  return (
    <button
      onClick={onClick}
      // nav-btn: [data-density='compact'] shrinks paddings via globals.css
      className={cn(
        'nav-btn w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-150 touch-target',
        active
          ? 'sidebar nav-active-aura bg-gradient-to-l from-[var(--sidebar-accent)] to-transparent text-[var(--sidebar-accent-foreground)] font-bold'
          : 'text-[#b9c0ae] hover:bg-white/5 hover:text-[var(--sidebar-foreground)]'
      )}
    >
      <Icon className={cn('h-[18px] w-[18px] shrink-0 transition-colors duration-150', active ? 'text-[var(--sidebar-primary)]' : '')} />
      <span className="truncate">{item.label}</span>
      {item.badge ? (
        <span className="mr-auto h-5 min-w-5 rounded-full bg-pomegranate text-white text-[10px] flex items-center justify-center px-1.5 num">
          {item.badge}
        </span>
      ) : null}
    </button>
  )
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { section, setSection } = useApp()
  const pattern = useApp((s) => s.prefs.pattern)
  // prefs-driven: order + visibility (store selector), pattern, density (CSS attr)
  const groups = useNavGroups()
  const motif = pattern !== 'plain' ? pattern : undefined
  return (
    <div
      className={cn('h-full sidebar bg-[#232d26] text-[#e9e4d5] flex flex-col', pattern !== 'plain' && 'sidebar-pattern')}
      data-pattern={motif}
    >
      <div className="flex items-center gap-3 p-4 border-b border-[var(--sidebar-border)]">
        <div className="h-11 w-11 rounded-xl overflow-hidden ring-1 ring-[var(--sidebar-primary)]/50 shrink-0">
          <img src="/brand/logo.png" alt="هایپر زیتون" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0">
          <p className="font-black text-[#f3ead2] leading-tight">هایپر زیتون</p>
          <p className="text-[11px] text-[#9aa595]">سامانه داخلی مدیریت</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-4" aria-label="فهرست اصلی">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="nav-group-title text-[10px] font-bold text-[#7d8a76] tracking-wider px-3 mb-1.5">{group.title}</p>
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavButton
                  key={item.key}
                  item={item}
                  active={section === item.key}
                  onClick={() => { setSection(item.key); onNavigate?.() }}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="p-3 border-t border-[var(--sidebar-border)] text-[10px] text-[#7d8a76] flex items-center gap-1.5">
        <Leaf className="h-3 w-3 text-[var(--sidebar-primary)]" />
        نسخه ۱.۰ — هایپر زیتون کرمان
      </div>
    </div>
  )
}

export function MobileNavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-72 shadow-2xl">
        <button onClick={onClose} className="absolute top-3 left-3 z-10 h-9 w-9 rounded-full bg-black/30 text-white flex items-center justify-center">
          <X className="h-4 w-4" />
        </button>
        <Sidebar onNavigate={onClose} />
      </div>
    </div>
  )
}

/** Bottom tab bar for floor staff on mobile */
export function MobileBottomBar() {
  const { section, setSection, user } = useApp()
  const items: NavItem[] = [
    { key: 'dashboard', label: 'خانه', icon: 'LayoutDashboard' },
    { key: 'tasks', label: 'کارها', icon: 'ListChecks' },
    { key: 'deliveries', label: 'تحویل', icon: 'Truck' },
    { key: 'chat', label: 'پیام', icon: 'MessagesSquare' },
  ]
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-[#232d26] border-t border-[var(--sidebar-border)] flex pb-[env(safe-area-inset-bottom)]" aria-label="نوار ناوبری موبایل">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard
        const active = section === item.key
        return (
          <button
            key={item.key}
            onClick={() => setSection(item.key)}
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] touch-target transition-colors duration-150',
              active ? 'text-[var(--sidebar-primary)]' : 'text-[#9aa595] hover:text-[var(--sidebar-foreground)]'
            )}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

export { ICONS }
