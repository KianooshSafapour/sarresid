'use client'
/**
 * QuickNav — Ctrl/Cmd+K command palette.
 * Keyboard-first navigation for desktop managers: jump to any allowed section
 * or trigger quick actions (new order). Fully keyboard accessible.
 */
import * as React from 'react'
import {
  LayoutDashboard, ShoppingCart, Truck, Calculator, CreditCard, Package, Building2,
  Warehouse, Map, Users, CheckSquare, BookOpen, MessageSquareHeart, StickyNote,
  MessageCircle, Sparkles, ShieldCheck, Settings, BarChart3, Plus, Search,
} from 'lucide-react'
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator,
} from '@/components/ui/command'
import { useApp } from '@/lib/store'
import { navGroupsFor, NAV_GROUP_LABELS, type NavItem } from '@/lib/nav'
import { canQuickOrder } from './Sidebar'
import type { PUser } from '@/lib/types'

const ICONS: Record<string, React.ComponentType<{ size?: number | string; className?: string }>> = {
  LayoutDashboard, ShoppingCart, Truck, Calculator, CreditCard, Package, Building2,
  Warehouse, Map, Users, CheckSquare, BookOpen, MessageSquareHeart, StickyNote,
  MessageCircle, Sparkles, ShieldCheck, Settings, BarChart3,
}

export function QuickNav({ user }: { user: PUser }) {
  const [open, setOpen] = React.useState(false)
  const { setView, requestNewOrder } = useApp()
  const groups = navGroupsFor(user)

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const go = (key: string) => {
    setOpen(false)
    setView(key as never)
  }

  const runItem = (item: NavItem) => (
    <CommandItem
      key={item.key}
      value={`${item.labelFa} ${item.label}`}
      onSelect={() => go(item.key)}
      className="gap-3 py-2.5"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F3F0E4] text-[#3E6B4A]">
        {React.createElement(ICONS[item.icon] ?? LayoutDashboard, { size: 15 })}
      </span>
      <span className="flex-1 text-sm font-semibold">{item.labelFa}</span>
      <span className="text-[10px] text-[#8A9884]">{item.label}</span>
    </CommandItem>
  )

  return (
    <CommandDialog open={open} onOpenChange={setOpen} className="sm:max-w-xl">
      <CommandInput placeholder="جستجوی بخش‌ها… | Search sections…" />
      <CommandList className="pz-scroll min-h-72">
        <CommandEmpty>
          <span className="flex items-center justify-center gap-2 py-6 text-sm text-[#8A9884]">
            <Search size={14} /> چیزی پیدا نشد
          </span>
        </CommandEmpty>
        {canQuickOrder(user) && (
          <>
            <CommandGroup heading="اقدام سریع | Quick action">
              <CommandItem
                value="سفارش جدید new order"
                onSelect={() => { setOpen(false); requestNewOrder() }}
                className="gap-3 py-2.5"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#DAA520] to-[#B8860B] text-white">
                  <Plus size={15} />
                </span>
                <span className="flex-1 text-sm font-bold">سفارش جدید</span>
                <span className="text-[10px] text-[#8A9884]">New order</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        {groups.map(({ group, items }, idx) => (
          <React.Fragment key={group}>
            <CommandGroup heading={`${NAV_GROUP_LABELS[group].fa} — ${NAV_GROUP_LABELS[group].en}`}>
              {items.map(runItem)}
            </CommandGroup>
            {idx < groups.length - 1 && <CommandSeparator />}
          </React.Fragment>
        ))}
      </CommandList>
      <div className="flex items-center justify-between border-t border-[#EFEAD8] px-4 py-2 text-[10px] font-semibold text-[#8A9884]">
        <span>↑↓ حرکت · Enter انتخاب · Esc بستن</span>
        <span className="rounded border border-[#E4DCC8] bg-[#FAF7EF] px-1.5 py-0.5 font-mono">Ctrl K</span>
      </div>
    </CommandDialog>
  )
}
