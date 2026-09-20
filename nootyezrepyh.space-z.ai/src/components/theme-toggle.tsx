'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/**
 * Kerman-styled light/dark toggle.
 * - Sun and moon crossfade + rotate inside a fixed-size round button.
 * - Briefly enables a global color crossfade (html.theme-switching) so the
 *   whole app eases into the new theme instead of snapping.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme, theme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === 'dark'
  const isAuto = mounted && theme === 'system'

  const toggle = () => {
    const next = isDark ? 'light' : 'dark'
    const root = document.documentElement
    root.classList.add('theme-switching')
    window.setTimeout(() => root.classList.remove('theme-switching'), 420)
    setTheme(next)
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            onClick={toggle}
            aria-label={isDark ? 'فعال‌سازی تم روشن' : 'فعال‌سازی تم تیره'}
            title={isAuto ? 'تم سیستم (روشن/تیره خودکار)' : isDark ? 'تم روشن' : 'تم تیره'}
            className="relative size-10 rounded-full border-gold/30 bg-card/70 hover:border-gold/60 hover:bg-accent shadow-sm overflow-hidden"
          >
            {/* moon (dark) — visible when dark */}
            <Moon
              className={`theme-icon-swap absolute size-[18px] text-gold ${isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-50'}`}
              aria-hidden
            />
            {/* sun (light) — visible when light */}
            <Sun
              className={`theme-icon-swap absolute size-[18px] text-olive ${isDark ? 'opacity-0 -rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'}`}
              aria-hidden
            />
            <span className="sr-only">تغییر تم روشن/تیره</span>
            {isAuto && <span className="absolute bottom-1 left-1 size-1.5 rounded-full bg-olive ring-1 ring-background" aria-hidden />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {isAuto ? 'تم سیستم' : isDark ? 'تم روشن' : 'تم تیره'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
