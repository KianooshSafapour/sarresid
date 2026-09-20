'use client'
import * as React from 'react'
import {
  LayoutDashboard, ShoppingCart, Truck, Calculator, CreditCard, Package, Building2,
  Warehouse, Map, Users, CheckSquare, BookOpen, MessageSquareHeart, StickyNote,
  MessageCircle, Sparkles, ShieldCheck, Settings, LogOut, X, BarChart3, FlaskConical,
  ClipboardCheck,
} from 'lucide-react'
import { useApp, ViewKey } from '@/lib/store'
import { navGroupsFor, NAV_GROUP_LABELS, badgeCountText, type NavItem } from '@/lib/nav'
import { hasRole } from '@/lib/types'
import type { PUser } from '@/lib/types'
import { Avatar } from './kit'
import { cn } from '@/lib/utils'
import { toFaDigits } from '@/lib/jalali'

const ICONS: Record<string, React.ComponentType<{ size?: number | string; className?: string }>> = {
  LayoutDashboard, ShoppingCart, Truck, Calculator, CreditCard, Package, Building2,
  Warehouse, Map, Users, CheckSquare, BookOpen, MessageSquareHeart, StickyNote,
  MessageCircle, Sparkles, ShieldCheck, Settings, BarChart3, FlaskConical, ClipboardCheck,
}

export function Sidebar({ user, onNavigate, mobileOpen, onCloseMobile }: {
  user: PUser
  onNavigate?: () => void
  mobileOpen?: boolean
  onCloseMobile?: () => void
}) {
  const { view, setView, setUser } = useApp()
  const groups = navGroupsFor(user)

  const go = (k: string) => {
    setView(k as ViewKey)
    onNavigate?.()
    onCloseMobile?.()
  }

  const logout = () => {
    setUser(null)
    onCloseMobile?.()
  }

  const content = (
    <div className="pz-sidebar flex h-full w-64 shrink-0 flex-col text-white">
      {/* brand */}
      <div className="relative border-b border-white/10 px-4 pb-4 pt-5">
        {mobileOpen !== undefined && (
          <button onClick={onCloseMobile} className="absolute left-3 top-3 rounded-full p-1 text-white/70 hover:bg-white/10 lg:hidden" aria-label="Close menu">
            <X size={18} />
          </button>
        )}
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#DAA520] to-[#8A6508] shadow-lg">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8"><path d="M12 3c4 0 7 2.5 7 6.5 0 5-3.5 9.5-7 11.5-3.5-2-7-6.5-7-11.5C5 5.5 8 3 12 3Z" /><path d="M12 7c1.5.3 2.5 1.6 2.5 3.2 0 2-1.3 3.7-2.5 4.5-1.2-.8-2.5-2.5-2.5-4.5 0-1.6 1-2.9 2.5-3.2Z" stroke="#2F4A36" /></svg>
          </div>
          <div>
            <div className="pz-gold-text text-lg font-black leading-tight">هایپر زیتون</div>
            <div className="text-[10px] tracking-widest text-white/50">HYPER ZEYTOON OPS</div>
          </div>
        </div>
      </div>

      {/* nav */}
      <nav className="pz-scroll flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {groups.map(({ group, items }) => (
          <div key={group}>
            <div className="mb-1.5 flex items-center gap-2 px-3">
              <span className="text-[10px] font-bold tracking-widest text-[#DAA520]/80">{NAV_GROUP_LABELS[group].fa}</span>
              <span className="text-[9px] uppercase tracking-widest text-white/30">{NAV_GROUP_LABELS[group].en}</span>
              <span className="h-px flex-1 bg-gradient-to-l from-[#DAA520]/30 to-transparent" />
            </div>
            <div className="space-y-0.5">
              {items.map((n) => (
                <NavButton key={n.key} item={n} active={view === n.key} onClick={() => go(n.key)} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* user */}
      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-white/5 p-2.5">
          <Avatar name={user.name} color={user.color} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-white">{user.name}</div>
            <div className="text-[10px] text-[#DAA520]">⭐ {toFaDigits(user.points)} امتیاز</div>
          </div>
        </div>
        <button onClick={logout} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 py-2 text-xs font-semibold text-white/70 transition hover:bg-rose-500/20 hover:text-rose-200">
          <LogOut size={14} /> خروج | Sign out
        </button>
      </div>
    </div>
  )

  if (mobileOpen === undefined) return <aside className="sticky top-0 hidden h-screen lg:block">{content}</aside>

  return (
    <>
      {/* mobile drawer */}
      <div className={cn('fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity lg:hidden', mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0')} onClick={onCloseMobile} />
      <div className={cn('fixed inset-y-0 right-0 z-50 transition-transform duration-300 lg:hidden', mobileOpen ? 'translate-x-0' : 'translate-x-full')}>
        {content}
      </div>
    </>
  )
}

export function canQuickOrder(user: PUser) {
  return hasRole(user, 'GENERAL_MANAGER') || hasRole(user, 'PRODUCT_MANAGER') || hasRole(user, 'OPERATION_MANAGER')
}

function NavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  const Icon = ICONS[item.icon] ?? LayoutDashboard
  const badges = useApp((s) => s.badges)
  const count = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0
  const pillTone =
    item.badgeKey === 'messagesUnread'
      ? 'bg-rose-500 text-white'
      : item.badgeKey === 'orders' || item.badgeKey === 'cheques'
        ? 'bg-[#DAA520] text-[#2F4A36] shadow'
        : 'bg-[#93C572] text-[#253A2A]'
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all',
        active
          ? 'bg-gradient-to-l from-[#DAA520]/25 to-transparent text-[#F0D890] shadow-[inset_-3px_0_0_0_#DAA520]'
          : 'text-white/70 hover:bg-white/10 hover:text-white',
        !active && 'hover:translate-x-[-2px]'
      )}
      aria-current={active ? 'page' : undefined}
    >
      <span className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
        active ? 'bg-[#DAA520]/20 text-[#DAA520]' : 'bg-white/5 text-white/50 group-hover:bg-[#93C572]/15 group-hover:text-[#93C572]'
      )}>
        <Icon size={16} />
      </span>
      <span className="flex-1 truncate text-right">{item.labelFa}</span>
      {count > 0 && (
        <span
          className="relative inline-flex h-5 shrink-0 items-center justify-center"
          title={`${item.labelFa}: ${count}`}
        >
          {item.badgeKey === 'messagesUnread' && (
            <span aria-hidden className="absolute -inset-0.5 animate-ping rounded-full bg-rose-400/50 motion-reduce:hidden" />
          )}
          <span className={cn('relative flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-black leading-none', pillTone)}>
            {badgeCountText(count)}
          </span>
        </span>
      )}
      <span className="shrink-0 text-[9px] font-normal text-white/30">{item.label}</span>
    </button>
  )
}
