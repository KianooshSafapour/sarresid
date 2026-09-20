'use client'

/**
 * Global command palette (Ctrl/⌘ + K) — fast keyboard-first navigation,
 * quick actions and search across sections, staff, orders and products.
 * Persian-friendly: normalizes ی/ك variants and Persian digits before matching.
 */

import * as React from 'react'
import { api, ClientUser } from '@/lib/api-client'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { allowedSections, SectionDef } from '@/lib/sections-registry'
import { toFaDigits, formatMoney } from '@/lib/jalali'
import { cn } from '@/lib/utils'
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandShortcut, CommandSeparator,
} from '@/components/ui/command'
import {
  PlusCircle, Wallet, CheckSquare, MessagesSquare, Search,
} from 'lucide-react'

// ---- helpers ----

/** normalize Persian/Arabic glyph variants + digits for forgiving search */
function norm(s: string): string {
  return toEnDigits(s)
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\s]+/g, ' ')
    .trim()
    .toLowerCase()
}

function toEnDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
}

interface PaletteStaff { id: string; name: string; primaryRole: string; color: string; active: boolean }
interface PaletteProduct { id: string; name: string; barcode: string; sellPrice: number; stock: number; minStock: number; unit: string }
interface PaletteOrder { id: string; number: number; supplierName: string; status: string; finalAmount: number }

type Cmd = {
  id: string
  label: string
  hint?: string
  badge?: string
  keywords?: string
  icon: React.ReactNode
  run: () => void
}

export function CommandPalette({ user, onNavigate }: { user: ClientUser; onNavigate: (key: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const [staff, setStaff] = React.useState<PaletteStaff[]>([])
  const [products, setProducts] = React.useState<PaletteProduct[] | null>(null)
  const [orders, setOrders] = React.useState<PaletteOrder[] | null>(null)

  const canManageOrders = canUser(user.roles, PERMISSIONS.MANAGE_ORDERS)
  const canManageTasks = canUser(user.roles, PERMISSIONS.MANAGE_TASKS)
  const isFinance = canUser(user.roles, PERMISSIONS.MANAGE_CHEQUES) || canUser(user.roles, PERMISSIONS.ACCOUNTING) || ['GENERAL_MANAGER', 'OWNER', 'OPERATION_MANAGER', 'ACCOUNTANT'].some((r) => user.roles.includes(r))

  // register global hotkey + shell event
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('zeytoon:open-search', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('zeytoon:open-search', onOpen)
    }
  }, [])

  // lazy-load data: prefetch shortly after mount + immediately when opened
  const loadedRef = React.useRef(false)
  const loadPaletteData = React.useCallback(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    fetch('/api/auth/staff').then((r) => r.json()).then((list: PaletteStaff[]) => {
      setStaff((list || []).filter((s) => s.active !== false && s.id !== user.id))
    }).catch(() => {})
    api.get<{ products: PaletteProduct[] }>('/api/products').then((d) => setProducts(d.products)).catch(() => setProducts([]))
    api.get<PaletteOrder[]>('/api/orders?limit=60').then((d) => setOrders(d)).catch(() => setOrders([]))
  }, [user.id])

  React.useEffect(() => {
    const t = setTimeout(loadPaletteData, 1500)
    return () => clearTimeout(t)
  }, [loadPaletteData])

  React.useEffect(() => {
    if (open) loadPaletteData()
  }, [open, loadPaletteData])

  /** navigate + optional follow-up flag (deep-link into a section) */
  function go(section: string, flag?: { key: string; value: string }) {
    try {
      if (flag) sessionStorage.setItem(flag.key, flag.value)
    } catch { /* private mode */ }
    setOpen(false)
    onNavigate(section)
  }

  const sections = allowedSections(user.roles, canUser)

  // ---- build command groups ----
  const actions: Cmd[] = []
  if (canManageOrders) {
    actions.push({
      id: 'new-order', label: 'ثبت سفارش جدید', hint: 'سفارش به تأمین‌کننده', badge: 'Action',
      icon: <PlusCircle className="size-4 text-olive" />,
      run: () => go('orders', { key: 'zeytoon_open_new_order', value: '1' }),
    })
  }
  if (isFinance) {
    actions.push({
      id: 'new-cheque', label: 'صدور چک جدید', hint: 'ثبت چک در تقویم', badge: 'Action',
      icon: <Wallet className="size-4 text-gold" />,
      run: () => go('cheques', { key: 'zeytoon_open_new_cheque', value: '1' }),
    })
  }
  if (canManageTasks) {
    actions.push({
      id: 'new-task', label: 'واگذاری وظیفه جدید', hint: 'تخصیص وظیفه به همکار', badge: 'Action',
      icon: <CheckSquare className="size-4 text-olive" />,
      run: () => go('tasks', { key: 'zeytoon_open_new_task', value: '1' }),
    })
  }
  actions.push({
    id: 'new-message', label: 'پیام به همکار', hint: 'گفتگوی خصوصی جدید', badge: 'Action',
    icon: <MessagesSquare className="size-4 text-olive" />,
    keywords: 'message chat',
    run: () => go('messages'),
  })

  return (
    <>
      {/* header trigger */}
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 h-9 px-3 rounded-xl border border-gold/25 bg-card/60 text-muted-foreground text-xs hover:border-gold/50 hover:bg-accent transition-colors min-w-44"
        aria-label="جستجوی سریع"
      >
        <Search className="size-3.5" />
        <span>جستجوی سریع…</span>
        <kbd className="mr-auto pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border border-gold/30 bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground" dir="ltr">Ctrl K</kbd>
      </button>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex size-9 items-center justify-center rounded-xl border border-gold/25 bg-card/60 text-muted-foreground"
        aria-label="جستجوی سریع"
      >
        <Search className="size-4" />
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="جستجوی سریع"
        description="جستجو میان بخش‌ها، همکاران، سفارش‌ها و کالاها"
        className="sm:max-w-xl top-[12%] translate-y-0"
      >
        <CommandInput placeholder="جستجو: بخش، همکار، سفارش، کالا…" />
        <CommandList className="max-h-[380px] nice-scrollbar">
          <CommandEmpty>نتیجه‌ای پیدا نشد — عبارت دیگری را امتحان کنید.</CommandEmpty>

          {actions.length > 0 && (
            <CommandGroup heading="اقدامات سریع">
              {actions.map((a) => (
                <CommandItem key={a.id} onSelect={() => a.run()} keywords={a.keywords ? [a.keywords] : undefined}>
                  {a.icon}
                  <span>{a.label}</span>
                  {a.hint && <span className="text-[10px] text-muted-foreground mr-1">— {a.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandGroup heading="رفتن به بخش">
            {sections.map((s: SectionDef) => (
              <CommandItem key={s.key} keywords={[norm(s.label), 'section', s.key]} onSelect={() => go(s.key)}>
                <s.icon className="size-4 text-olive" />
                <span>{s.label}</span>
                {s.hint && <CommandShortcut>{s.hint}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <StaffGroup staff={staff} onPick={(id) => go('messages', { key: 'zeytoon_open_chat', value: id })} />

          {(orders || []).length > 0 && (
            <OrderGroup orders={orders || []} onPick={(id) => go('orders', { key: 'zeytoon_open_order', value: id })} />
          )}

          {(products || []).length > 0 && (
            <ProductGroup products={products || []} onPick={(p) => go('products', { key: 'zeytoon_open_product', value: p.id })} />
          )}
        </CommandList>
        <div className="border-t border-gold/15 px-3 py-1.5 text-[10px] text-muted-foreground flex items-center gap-2">
          <span dir="ltr" className="inline-flex items-center gap-1"><kbd className="rounded border bg-muted px-1">↑↓</kbd> حرکت</span>
          <span dir="ltr" className="inline-flex items-center gap-1"><kbd className="rounded border bg-muted px-1">Enter</kbd> انتخاب</span>
          <span dir="ltr" className="inline-flex items-center gap-1"><kbd className="rounded border bg-muted px-1">Esc</kbd> بستن</span>
        </div>
      </CommandDialog>
    </>
  )
}

/* ---------- sub groups (kept simple, filter via cmdk built-in) ---------- */

function StaffGroup({ staff, onPick }: { staff: PaletteStaff[]; onPick: (id: string) => void }) {
  if (staff.length === 0) return null
  return (
    <CommandGroup heading="همکاران">
      {staff.map((s) => (
        <CommandItem key={s.id} value={norm(s.name) + ' staff'} keywords={['person', 'همکار']} onSelect={() => onPick(s.id)}>
          <span className="size-6 rounded-full text-white text-[10px] font-black flex items-center justify-center" style={{ background: s.color }}>
            {s.name.replace('خانم ', '').replace('آقای ', '').charAt(0)}
          </span>
          <span>{s.name}</span>
          <CommandShortcut>ارسال پیام</CommandShortcut>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

const ORDER_STATUS_FA: Record<string, string> = {
  DRAFT: 'پیش‌نویس', PENDING_APPROVAL: 'در انتظار تأیید', APPROVED: 'تأیید شده',
  EXPECTED: 'در انتظار دریافت', RECEIVED: 'دریافت شده', INSPECTED: 'کنترل شده',
  TO_HOLOO: 'ثبت در هلو', DONE: 'تکمیل شده', CANCELLED: 'لغو شده',
}

function OrderGroup({ orders, onPick }: { orders: PaletteOrder[]; onPick: (id: string) => void }) {
  return (
    <CommandGroup heading="سفارش‌های اخیر">
      {orders.slice(0, 12).map((o) => (
        <CommandItem key={o.id} value={norm('سفارش ' + toFaDigits(o.number) + ' ' + o.number + ' ' + o.supplierName)} onSelect={() => onPick(o.id)}>
          <span className="size-1.5 rounded-full bg-gold" />
          <span className="font-bold">سفارش {toFaDigits(o.number)}</span>
          <span className="text-muted-foreground text-xs">— {o.supplierName}</span>
          <CommandShortcut>{ORDER_STATUS_FA[o.status] || o.status}</CommandShortcut>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

function ProductGroup({ products, onPick }: { products: PaletteProduct[]; onPick: (p: PaletteProduct) => void }) {
  return (
    <CommandGroup heading="کالاها">
      {products.slice(0, 14).map((p) => (
        <CommandItem key={p.id} value={norm(p.name + ' ' + p.barcode)} keywords={['product', 'کالا', 'جنس']} onSelect={() => onPick(p)}>
          <span className="size-1.5 rounded-full bg-olive" />
          <span>{p.name}</span>
          <CommandShortcut>
            {p.stock <= p.minStock ? '⚠ ' : ''}{toFaDigits(p.stock)} {p.unit} · {formatMoney(p.sellPrice)}
          </CommandShortcut>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}
