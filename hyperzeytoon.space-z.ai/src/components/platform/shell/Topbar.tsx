'use client'

import * as React from 'react'
import { useApp } from '@/store/app'
import { api } from '@/lib/api'
import { clearSessionToken } from '@/lib/session'
import { formatJalaliFull, timeAgo } from '@/lib/jalali'
import { formalName } from '@/lib/persian-words'
import { PointsBadge, UserAvatar } from '@/components/platform/ui/shared'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Bell, Menu, LogOut, Plus, CheckCheck, UserRound, Sun, Moon, FlaskConical, Settings2 } from 'lucide-react'
import { LanguageMenu } from '@/components/platform/shell/LanguageMenu'
import { GlobalSearch } from '@/components/platform/shell/GlobalSearch'
import { AppearanceStudio } from '@/components/platform/shell/AppearanceStudio'
import type { ThemeChoice } from '@/lib/prefs'
import { cn } from '@/lib/utils'
import type { NotificationDTO } from '@/lib/types'

/**
 * Quick theme toggle — store-driven (prefs.theme is the single source of truth;
 * DOM is applied by applyUserPrefs). Animated sun/moon swap, formally-worded
 * tooltip, ≥44px touch target.
 */
function ThemeToggle() {
  const theme = useApp((s) => s.prefs.theme)
  const updatePrefs = useApp((s) => s.updatePrefs)
  const [mounted, setMounted] = React.useState(false)
  const [sysDark, setSysDark] = React.useState(false)
  React.useEffect(() => {
    setMounted(true)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const h = () => setSysDark(mq.matches)
    h()
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])
  if (!mounted) return <span className="w-9" aria-hidden />
  const isDark = theme === 'system' ? sysDark : theme === 'dark'
  const next: ThemeChoice = isDark ? 'light' : 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      className="touch-target"
      onClick={() => updatePrefs({ theme: next })}
      aria-label={isDark ? 'تغییر به حالت روشن' : 'تغییر به حالت شب کویر'}
      title={isDark ? 'رفتن به حالت روشن (کاشی و خامه)' : 'رفتن به حالت شب کویر (زغالی گرم)'}
    >
      {/* key= remounts the icon so the swap animation replays every toggle */}
      <span key={isDark ? 'dark' : 'light'} className="theme-swap-icon inline-flex">
        {isDark ? <Sun className="h-5 w-5 text-gold" /> : <Moon className="h-5 w-5" />}
      </span>
    </Button>
  )
}

const TYPE_COLORS: Record<string, string> = {
  INFO: '#2E6E8E', SUCCESS: '#3E7C59', WARNING: '#C9A227', ERROR: '#B33A3A',
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, notifications, unreadCount, setNotifications, setSection, setUser, setQuickAction, demoName } = useApp()
  const prefs = useApp((s) => s.prefs)
  const today = React.useMemo(() => formatJalaliFull(new Date()), [])
  const [open, setOpen] = React.useState(false)
  const [studioOpen, setStudioOpen] = React.useState(false)

  const markAll = async () => {
    await api('/api/notifications', { body: { all: true } })
    setNotifications(notifications.map((n) => ({ ...n, read: true })))
  }

  const openNotif = async (n: NotificationDTO) => {
    await api('/api/notifications', { body: { id: n.id } }).catch(() => null)
    setNotifications(notifications.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
    if (n.link) setSection(n.link)
    setOpen(false)
  }

  const logout = async () => {
    await api('/api/auth/logout', { body: {} }).catch(() => null)
    clearSessionToken()
    setUser(null)
  }

  const canOrder = user?.isManager || user?.roleKeys.includes('pm') || user?.roleKeys.includes('gm')

  return (
    <header className="sticky top-0 z-30 h-16 shrink-0 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 flex items-center gap-2 px-3 md:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="منو">
        <Menu className="h-5 w-5" />
      </Button>

      <div className="hidden sm:block">
        <p className="text-sm font-bold">{today}</p>
        <p className="text-[11px] text-muted-foreground">{formalName(user?.gender, user?.name)} به کار امروز خوش آمدید 🌿</p>
      </div>
      <div className="sm:hidden">
        <p className="text-sm font-bold">هایپر زیتون</p>
      </div>

      {demoName && (
        <button
          onClick={() => setSection('demo-lab')}
          className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-[#C9A227]/50 bg-[#C9A227]/10 px-3 py-1 text-[11px] font-bold text-[#8a6d13] hover:bg-[#C9A227]/20 transition-colors"
          title="حالت نمایشی فعال است — داده‌ها شبیه‌سازی‌شده‌اند"
        >
          <FlaskConical className="h-3.5 w-3.5" />
          حالت نمایشی: {demoName}
        </button>
      )}

      <div className="flex-1" />

      <GlobalSearch />

      <ThemeToggle />

      <LanguageMenu />

      {/* Appearance Studio «شخصی‌سازی محیط کار» */}
      <Button
        variant="ghost"
        size="icon"
        className="touch-target"
        onClick={() => setStudioOpen(true)}
        aria-label="شخصی‌سازی محیط کار"
        aria-haspopup="dialog"
        title="شخصی‌سازی محیط کار — تم، رنگ، تراکم و چیدمان"
      >
        <Settings2 className="h-5 w-5" />
      </Button>

      {canOrder && (
        <Button
          size="sm"
          className="hidden md:inline-flex touch-target gap-1.5 shadow-md"
          onClick={() => setQuickAction('new-order')}
        >
          <Plus className="h-4 w-4" />
          سفارش جدید
        </Button>
      )}

      {user && <PointsBadge points={user.points} className="hidden md:inline-flex" />}

      {/* notifications */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative touch-target" aria-label="اعلان‌ها">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 left-1 h-4 min-w-4 px-1 rounded-full bg-pomegranate text-white text-[10px] flex items-center justify-center num">
                {unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <p className="font-bold text-sm">اعلان‌ها</p>
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={markAll}>
              <CheckCheck className="h-3.5 w-3.5" /> خواندن همه
            </Button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">اعلانی ندارید 🌱</p>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => openNotif(n)}
                className={cn(
                  'w-full text-right px-4 py-3 border-b last:border-0 hover:bg-accent/60 transition-colors flex gap-3',
                  !n.read && 'bg-accent/30'
                )}
              >
                <span className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[n.type] ?? '#8A8F98' }} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-snug">{n.title}</span>
                  {n.body && <span className="block text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.body}</span>}
                  <span className="block text-[10px] text-muted-foreground/70 mt-1">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* user menu */}
      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full p-1 hover:bg-accent transition-colors" aria-label="منوی کاربر">
              <UserAvatar
                name={user.name}
                color={user.color}
                username={user.username}
                config={prefs.avatar ?? null}
                size={38}
              />
              <div className="hidden md:block text-right">
                <p className="text-sm font-bold leading-tight">{user.name}</p>
                <p className="text-[10px] text-muted-foreground">{user.title}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>
              <p>{user.name}</p>
              <p className="text-xs text-muted-foreground font-normal">{user.roles.map((r) => r.name).join('، ')}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSection('settings')} className="gap-2">
              <UserRound className="h-4 w-4" /> پروفایل و تنظیمات
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout} className="gap-2 text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" /> خروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <AppearanceStudio open={studioOpen} onOpenChange={setStudioOpen} />
    </header>
  )
}
