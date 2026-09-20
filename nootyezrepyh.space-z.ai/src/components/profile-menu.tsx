'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { ClientUser } from '@/lib/api-client'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { RoleBadge } from '@/components/zeytoon-ui'
import { ROLES, APP_VERSION, APP_CODENAME } from '@/lib/constants'
import { toFaDigits } from '@/lib/jalali'
import { LogOut, Trophy, User, ShieldCheck, Sun, Moon, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'

const THEME_OPTIONS = [
  { value: 'light', label: 'روشن', icon: Sun },
  { value: 'system', label: 'سیستم', icon: Monitor },
  { value: 'dark', label: 'تیره', icon: Moon },
] as const

/** Header avatar → profile dropdown with points, roles & theme tri-state */
export function ProfileMenu({ user, logout }: { user: ClientUser; logout: () => void }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const current = mounted && (theme === 'dark' || theme === 'system') ? theme : 'light'

  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <button className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-gold" aria-label="منوی پروفایل">
          <Avatar className="size-9 ring-2 ring-gold/40 hover:ring-gold transition-all cursor-pointer">
            <AvatarFallback style={{ background: user.color }} className="text-white font-bold text-sm">
              {user.name.replace('خانم ', '').replace('آقای ', '').charAt(0)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-3">
        <div className="flex items-center gap-3 mb-2">
          <Avatar className="size-12 ring-2 ring-gold/40">
            <AvatarFallback style={{ background: user.color }} className="text-white font-black text-lg">
              {user.name.replace('خانم ', '').replace('آقای ', '').charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="font-extrabold text-sm truncate">{user.name}</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {user.roles.slice(0, 2).map((r) => <RoleBadge key={r} roleKey={r} />)}
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-gold/10 border border-gold/25 px-3 py-2 flex items-center gap-2 mb-2">
          <Trophy className="size-4 text-gold" />
          <span className="text-xs font-bold">امتیاز شما:</span>
          <span className="text-sm font-black text-gold">{toFaDigits(user.points)}</span>
        </div>
        <div className="rounded-lg bg-secondary/60 px-3 py-2 text-[11px] text-muted-foreground leading-relaxed mb-2">
          <span className="inline-flex items-center gap-1 font-bold text-foreground/70">
            <ShieldCheck className="size-3.5 text-emerald-600" /> نقش‌های شما:
          </span>
          <div className="mt-1">
            {user.roles.map((r) => ROLES[r]?.name || r).join(' • ')}
          </div>
        </div>

        {/* theme tri-state */}
        <div className="rounded-lg border border-border/70 bg-secondary/40 px-2.5 py-2 mb-1">
          <div className="text-[11px] font-bold text-foreground/70 mb-1.5">تم نمایش</div>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-background/70 p-1" role="radiogroup" aria-label="انتخاب تم نمایش">
            {THEME_OPTIONS.map((opt) => {
              const active = current === opt.value
              return (
                <button
                  key={opt.value}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTheme(opt.value)}
                  className={cn(
                    'flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-bold transition-all',
                    active ? 'bg-gold/15 text-gold shadow-sm ring-1 ring-gold/30' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <opt.icon className="size-3.5" /> {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* platform version */}
        <div className="rounded-lg bg-secondary/50 px-3 py-1.5 flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <span>پلتفرم زیتون</span>
          <span dir="ltr" className="font-bold text-foreground/60">v{APP_VERSION} · {APP_CODENAME}</span>
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer">
          <LogOut className="size-4 rotate-180" /> خروج از حساب
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
