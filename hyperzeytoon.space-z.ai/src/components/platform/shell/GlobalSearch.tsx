'use client'

import * as React from 'react'
import { useApp } from '@/store/app'
import { api } from '@/lib/api'
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Search, Package, ShoppingCart, Users, UserRound, Wallet, Zap, ClipboardList } from 'lucide-react'

interface Hit {
  type: 'product' | 'order' | 'customer' | 'staff' | 'cheque' | 'action' | 'stockcount'
  id: string
  title: string
  subtitle?: string
  section: string
}

const TYPE_ICON: Record<Hit['type'], React.ElementType> = {
  product: Package,
  order: ShoppingCart,
  customer: Users,
  staff: UserRound,
  cheque: Wallet,
  action: Zap,
  stockcount: ClipboardList,
}

const TYPE_LABEL: Record<Hit['type'], string> = {
  product: 'محصولات',
  order: 'سفارش‌ها',
  customer: 'مشتریان',
  staff: 'همکاران',
  cheque: 'چک‌ها',
  action: 'دسترسی سریع',
  stockcount: 'جرد انبار',
}

export function GlobalSearch() {
  const { setSection, setQuickAction, user } = useApp()
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState('')
  const [hits, setHits] = React.useState<Hit[]>([])

  // Ctrl+K / ⌘K opens the palette
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (user) setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [user])

  // debounced search
  React.useEffect(() => {
    if (!open) return
    const query = q.trim()
    if (query.length < 2) {
      setHits([])
      return
    }
    const t = setTimeout(() => {
      api<{ hits: Hit[] }>(`/api/search?q=${encodeURIComponent(query)}`)
        .then((d) => setHits(d.hits))
        .catch(() => setHits([]))
    }, 220)
    return () => clearTimeout(t)
  }, [q, open])

  const grouped = React.useMemo(() => {
    const map = new Map<Hit['type'], Hit[]>()
    for (const h of hits) {
      const arr = map.get(h.type) ?? []
      arr.push(h)
      map.set(h.type, arr)
    }
    return [...map.entries()]
  }, [hits])

  const go = (h: Hit) => {
    setOpen(false)
    setQ('')
    setHits([])
    if (h.type === 'action' && h.id === 'new-order') {
      setSection('orders')
      setQuickAction('new-order')
      return
    }
    setSection(h.section)
  }

  if (!user) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 h-9 rounded-full border border-input bg-card/70 px-3 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors min-w-44 lg:min-w-60"
        aria-label="جستجوی سراسری"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-right">جستجو در همه‌چیز…</span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] num">Ctrl K</kbd>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden touch-target"
        onClick={() => setOpen(true)}
        aria-label="جستجو"
      >
        <Search className="h-5 w-5" />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen} className="max-w-xl">
        <CommandInput
          value={q}
          onValueChange={setQ}
          placeholder="نام کالا، بارکد، شماره سفارش، مشتری، همکار…"
        />
        <CommandList>
          <CommandEmpty>
            {q.trim().length < 2 ? 'حداقل ۲ حرف بنویسید…' : 'نتیجه‌ای پیدا نشد 🌱'}
          </CommandEmpty>
          {grouped.map(([type, list]) => {
            const Icon = TYPE_ICON[type]
            return (
              <CommandGroup key={type} heading={TYPE_LABEL[type]}>
                {list.map((h) => (
                  <CommandItem key={h.type + h.id} value={`${h.title} ${h.subtitle ?? ''}`} onSelect={() => go(h)}>
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="font-medium">{h.title}</span>
                    {h.subtitle && <span className="text-xs text-muted-foreground truncate">{h.subtitle}</span>}
                    <CommandShortcut className="text-[10px]">Enter ↵</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )
          })}
        </CommandList>
      </CommandDialog>
    </>
  )
}
