'use client'

import { create } from 'zustand'
import type { SessionUser, NotificationDTO } from '@/lib/types'
import {
  DEFAULT_PREFS, applyUserPrefs, loadPrefs, savePrefs, scheduleServerSync, watchSystemTheme,
  type UserPrefs,
} from '@/lib/prefs'
import { api } from '@/lib/api'

export interface NavItem {
  key: string
  label: string
  icon: string
  roles?: string[] // empty = everyone (managers see all)
  managerOnly?: boolean
  badge?: number
}

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'اصلی',
    items: [
      { key: 'dashboard', label: 'داشبورد', icon: 'LayoutDashboard' },
      { key: 'tasks', label: 'کارهای من', icon: 'ListChecks' },
      { key: 'sops', label: 'رویه‌ها و راهنما', icon: 'BookOpenCheck' },
    ],
  },
  {
    title: 'خرید و تأمین',
    items: [
      { key: 'orders', label: 'سفارش‌ها', icon: 'ShoppingCart' },
      { key: 'deliveries', label: 'تحویل‌ها', icon: 'Truck' },
      { key: 'accounting', label: 'حسابداری و هولو', icon: 'Calculator' },
      { key: 'payments', label: 'چک‌ها و پرداخت‌ها', icon: 'Wallet' },
    ],
  },
  {
    title: 'انبار و محصولات',
    items: [
      { key: 'products', label: 'محصولات', icon: 'Package' },
      { key: 'providers', label: 'تأمین‌کنندگان', icon: 'Handshake' },
      { key: 'inventory', label: 'انبار و موجودی', icon: 'Warehouse' },
      { key: 'stock-count', label: 'جرد انبار', icon: 'ClipboardList', roles: ['inventory'] },
      { key: 'planogram', label: 'چیدمان قفسه', icon: 'LayoutGrid' },
      { key: 'archive', label: 'بایگانی اسناد', icon: 'Library', roles: ['owner', 'gm', 'om', 'pm', 'accountant', 'inventory', 'it_admin'] },
    ],
  },
  {
    title: 'فروش و مشتریان',
    items: [
      { key: 'customers', label: 'مشتریان و فروش', icon: 'Users' },
      { key: 'floor', label: 'عملیات فروشگاه', icon: 'Store' },
    ],
  },
  {
    title: 'تیم و همکاری',
    items: [
      { key: 'wall', label: 'دیوار همکاری', icon: 'Megaphone' },
      { key: 'chat', label: 'پیام‌ها', icon: 'MessagesSquare' },
      { key: 'notes', label: 'یادداشت‌های من', icon: 'StickyNote' },
      { key: 'feedback', label: 'بازخورد و ایده‌ها', icon: 'Lightbulb' },
      { key: 'team', label: 'تیم و عملکرد', icon: 'Trophy' },
      { key: 'leaves', label: 'مرخصی و برنامه تیم', icon: 'CalendarHeart' },
      { key: 'vault', label: 'گنجینه شخصی', icon: 'Archive' },
      { key: 'help', label: 'راهنمای پلتفرم', icon: 'CircleHelp' },
    ],
  },
  {
    title: 'مدیریت',
    items: [
      { key: 'reports', label: 'گزارش‌ها و تحلیل', icon: 'BarChart3', managerOnly: true },
      { key: 'admin', label: 'کاربران و نقش‌ها', icon: 'UserCog', managerOnly: true },
      { key: 'activity', label: 'گزارش فعالیت', icon: 'History', managerOnly: true },
      { key: 'demo-lab', label: 'آزمایشگاه نمایشی', icon: 'FlaskConical', managerOnly: true },
      { key: 'settings', label: 'تنظیمات', icon: 'Settings' },
    ],
  },
]

interface AppState {
  user: SessionUser | null
  booted: boolean
  section: string
  notifications: NotificationDTO[]
  unreadCount: number
  quickAction: string | null // e.g. "new-order" opens wizard
  demoName: string | null // active demo scenario name (حالت نمایشی)
  prefs: UserPrefs // appearance prefs — hydration: inline script (pre-paint) → local → server on login
  setUser: (u: SessionUser | null) => void
  setBooted: (b: boolean) => void
  setSection: (s: string) => void
  setNotifications: (n: NotificationDTO[]) => void
  setQuickAction: (a: string | null) => void
  setDemoName: (n: string | null) => void
  canSee: (item: NavItem) => boolean
  /** optimistic patch → DOM apply → localStorage → debounced server PATCH */
  updatePrefs: (patch: Partial<UserPrefs>) => void
  /** full reset to DEFAULT_PREFS (بازگشت به پیش‌فرض) */
  resetPrefs: () => void
  /** pull saved prefs from the server and apply them (login hydration) */
  hydratePrefs: (userId: string) => void
}

const useAppBase = create<AppState>((set, get) => ({
  user: null,
  booted: false,
  section: 'dashboard',
  notifications: [],
  unreadCount: 0,
  quickAction: null,
  demoName: null,
  prefs: DEFAULT_PREFS,
  setUser: (u) => {
    set({ user: u })
    if (u) get().hydratePrefs(u.id)
  },
  setBooted: (b) => set({ booted: b }),
  setSection: (s) => set({ section: s }),
  setNotifications: (n) =>
    set({ notifications: n, unreadCount: n.filter((x) => !x.read).length }),
  setQuickAction: (a) => set({ quickAction: a }),
  setDemoName: (n) => set({ demoName: n }),
  canSee: (item) => {
    const user = get().user
    if (!user) return false
    if (item.managerOnly) return user.isManager
    if (!item.roles || item.roles.length === 0) return true
    return user.isManager || item.roles.some((r) => user.roleKeys.includes(r))
  },
  updatePrefs: (patch) => {
    const next: UserPrefs = { ...get().prefs, ...patch }
    applyUserPrefs(next)
    savePrefs(next)
    scheduleServerSync(next)
    set({ prefs: next })
  },
  resetPrefs: () => {
    const next: UserPrefs = { ...DEFAULT_PREFS }
    applyUserPrefs(next)
    savePrefs(next)
    scheduleServerSync(next)
    set({ prefs: next })
  },
  hydratePrefs: (userId) => {
    if (typeof window === 'undefined') return
    if (hydratedUserId === userId) return
    hydratedUserId = userId
    api<{ prefs: Partial<UserPrefs> | null }>('/api/auth/prefs')
      .then((d) => {
        // server wins for the keys it has; local stays the fallback
        const server = d?.prefs && typeof d.prefs === 'object' ? d.prefs : null
        if (!server) return
        const merged: UserPrefs = { ...get().prefs, ...server } as UserPrefs
        applyUserPrefs(merged)
        savePrefs(merged)
        set({ prefs: merged })
      })
      .catch(() => {
        hydratedUserId = null // offline/401 — allow retry on next login
      })
  },
}))

export const useApp = useAppBase

// ---------------------------------------------------------------------------
// Client bootstrap (runs once per page load, client-side only):
// 1) apply locally-stored prefs immediately (idempotent with the inline
//    pre-paint script in layout.tsx — covers client-side navigations),
// 2) re-apply when the OS color-scheme flips while theme = 'system'.
// ---------------------------------------------------------------------------
let hydratedUserId: string | null = null
if (typeof window !== 'undefined') {
  applyUserPrefs(loadPrefs())
  watchSystemTheme(
    () => useAppBase.getState().prefs,
    () => applyUserPrefs(useAppBase.getState().prefs)
  )
}

/**
 * Sidebar store-selector: NAV_GROUPS sorted by prefs.sidebarOrder (group
 * TITLE → index) with hidden titles removed. Falls back to the default
 * order gracefully when prefs carry no layout yet.
 */
export function useNavGroups(): { title: string; items: NavItem[] }[] {
  const sidebarOrder = useApp((s) => s.prefs.sidebarOrder)
  const sidebarHidden = useApp((s) => s.prefs.sidebarHidden)
  const canSee = useApp((s) => s.canSee)
  const visible = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter(canSee) })).filter(
    (g) => g.items.length > 0
  )
  if (!sidebarOrder && !sidebarHidden?.length) return visible
  const hidden = new Set(sidebarHidden ?? [])
  const indexed = visible.map((g, i) => ({ g, i })).filter(({ g }) => !hidden.has(g.title))
  indexed.sort((a, b) => {
    const oa = sidebarOrder?.[a.g.title]
    const ob = sidebarOrder?.[b.g.title]
    if (oa != null && ob != null) return oa - ob
    if (oa != null) return -1
    if (ob != null) return 1
    return a.i - b.i
  })
  return indexed.map(({ g }) => g)
}
