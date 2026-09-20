'use client'

// ============================================================
// LanguageMenu — locale switcher (fa / en / ar / tr).
//
// Props-less on purpose: drop it anywhere (Topbar next to the
// theme toggle, login corner, settings). Radix DropdownMenu gives
// full keyboard navigation (arrows/Enter/Esc, typeahead) and the
// shadcn Tooltip adds the formal hover label. Selecting a locale
// calls setLocale → context + localStorage + /api/auth/prefs +
// 'hz-locale-change' event (see lib/i18n).
// ============================================================

import { Check, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LOCALES } from '@/lib/i18n/dict'
import { useI18n } from '@/lib/i18n'

export function LanguageMenu() {
  const { locale, setLocale } = useI18n()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="touch-target"
              aria-label="زبان / Language"
              aria-haspopup="menu"
            >
              <Globe className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {/* deliberately bilingual: readable in every locale */}
            <DropdownMenuLabel>زبان / Language</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {LOCALES.map((l) => {
              const active = locale === l.code
              return (
                <DropdownMenuItem
                  key={l.code}
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => setLocale(l.code)}
                  className="flex items-center gap-2"
                >
                  <span className="flex-1">{l.name}</span>
                  <span className="text-[10px] text-muted-foreground uppercase">{l.code}</span>
                  {active && <Check className="h-4 w-4 text-primary" aria-hidden />}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </TooltipTrigger>
      <TooltipContent>زبان / Language</TooltipContent>
    </Tooltip>
  )
}
