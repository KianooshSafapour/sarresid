'use client'

import * as React from 'react'
import { api, ClientUser } from '@/lib/api-client'
import {
  formatMoney,
  toFaDigits,
  toEnDigits,
  todayJalali,
  addDaysJalali,
  formatJalali,
  formatJalaliDateTime,
} from '@/lib/jalali'
import { sfxSuccess } from '@/lib/sfx'
import {
  canUser,
  PERMISSIONS,
  ORDER_STATUSES,
  ORDER_FLOW,
} from '@/lib/constants'
import { SectionHeader, EmptyState, GlowCard, StockBadge, Money, OrnamentDivider } from '@/components/zeytoon-ui'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { JalaliDatePicker } from '@/components/jalali-date-picker'
import { InvoicePrintOverlay, PrintableOrder } from '@/components/print/invoice-print-overlay'
import {
  PlusCircle, Search, Trash2, Truck, Package, History, Clock, Pencil, Printer,
  CheckCircle2, Send, XCircle, ClipboardList, Loader2, Phone, FileText, PartyPopper,
  Share2, Copy, Check, CheckCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ==================== types ====================

export interface OrderRow {
  id: string
  number: number
  status: string
  deliveryDate: string
  paymentType: string
  totalAmount: number
  itemCount: number
  totalQty: number
  supplierId: string
  supplierName: string
  createdByName: string
  createdAt: string
  notes?: string | null
  overdue?: boolean
}

export interface ZProduct {
  id: string
  name: string
  barcode?: string | null
  price: number
  cost: number
  stock: number
  minStock: number
  unit: string
  category?: string | null
  image?: string | null
}

export interface ZSupplier {
  id: string
  name: string
  phone?: string | null
  contactName?: string | null
  type?: string
  paymentType: string
  notes?: string | null
  companies: { id: string; name: string; productCount: number; products: ZProduct[] }[]
  orderCount?: number
  totalSpend?: number
}

interface OrderItemRow {
  id: string
  productId: string
  productName: string
  holooName?: string | null
  barcode?: string | null
  quantity: number
  unitPrice: number
  sellPrice?: number | null
  discount: number
  lineTotal: number
  receivedQty?: number | null
  status: string
  note?: string | null
}

interface HistoryEntry {
  id: string
  userName: string
  action: string
  details: {
    fromStatus?: string | null
    toStatus?: string | null
    description?: string
    note?: string
    totalAmount?: number
    items?: { name: string; qty: number; unitPrice: number }[]
  } | null
  createdAt: string
}

interface OrderDetail {
  id: string
  number: number
  status: string
  deliveryDate: string
  paymentType: string
  totalAmount: number
  discount: number
  finalAmount: number
  notes?: string | null
  createdAt: string
  createdByName: string
  holooRef?: string | null
  doneAt?: string | null
  supplier: { id: string; name: string; phone?: string | null; contactName?: string | null; paymentType: string }
  items: OrderItemRow[]
  history: HistoryEntry[]
}

interface RecentProductOrder {
  orderId: string
  orderNumber: number
  supplierName: string
  status: string
  deliveryDate: string
  createdAt: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export const PAYMENT_LABELS: Record<string, string> = {
  CASH_ON_DELIVERY: 'نقدی هنگام تحویل',
  CHEQUE: 'چک',
}

// ==================== small shared atoms ====================

/** Colored status chip from ORDER_STATUSES palette */
export function OrderStatusChip({ status, className }: { status: string; className?: string }) {
  const s = ORDER_STATUSES[status]
  if (!s) return null
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap', className)}
      style={{ color: s.color, background: `${s.color}14`, borderColor: `${s.color}55` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  )
}

/** Numeric input that speaks Persian digits */
function FaNumberInput({ value, onChange, className, disabled }: { value: number; onChange: (n: number) => void; className?: string; disabled?: boolean }) {
  // value only changes through this input itself → no sync-back effect needed
  const [txt, setTxt] = React.useState(() => toFaDigits(value))
  return (
    <Input
      dir="ltr"
      inputMode="decimal"
      disabled={disabled}
      className={cn('h-10 text-center tabular-nums', className)}
      value={txt}
      onChange={(e) => {
        const raw = toEnDigits(e.target.value).replace(/[^\d.]/g, '')
        setTxt(toFaDigits(raw))
        onChange(Number(raw) || 0)
      }}
    />
  )
}

/** +/− quantity stepper with big touch targets */
function QtyStepper({ value, onChange, min = 0, step = 1 }: { value: number; onChange: (n: number) => void; min?: number; step?: number }) {
  return (
    <div className="flex items-center gap-1" dir="ltr">
      <button
        type="button"
        aria-label="افزودن"
        className="size-10 rounded-xl bg-olive text-white font-black text-lg flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40"
        onClick={() => onChange(value + step)}
      >
        +
      </button>
      <div className="w-14 h-10 rounded-xl border border-gold/30 bg-card flex items-center justify-center font-bold tabular-nums">
        {toFaDigits(value)}
      </div>
      <button
        type="button"
        aria-label="کاهش"
        disabled={value <= min}
        className="size-10 rounded-xl border border-gold/30 bg-card font-black text-lg flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40"
        onClick={() => onChange(Math.max(min, value - step))}
      >
        −
      </button>
    </div>
  )
}

/** "سفارش‌های اخیر" popover — summarized orders of one product in the last 30 days */
export function ProductRecentOrdersPopover({ productId, triggerLabel = 'سفارش‌های اخیر' }: { productId: string; triggerLabel?: string }) {
  const [open, setOpen] = React.useState(false)
  const [rows, setRows] = React.useState<RecentProductOrder[] | null>(null)
  const [err, setErr] = React.useState(false)

  React.useEffect(() => {
    if (open && rows === null && !err) {
      api
        .get<RecentProductOrder[]>(`/api/orders?productId=${productId}&lastDays=30&limit=20`)
        .then(setRows)
        .catch(() => setErr(true))
    }
  }, [open, rows, err, productId])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-[11px] text-muted-foreground hover:text-olive gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <History className="size-3.5" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs font-bold mb-2 flex items-center gap-1.5">
          <Clock className="size-3.5 text-gold" />
          سفارش‌های ۳۰ روز اخیر این کالا
        </div>
        {rows === null ? (
          <div className="py-4 flex justify-center"><Loader2 className="size-5 animate-spin text-olive" /></div>
        ) : rows.length === 0 ? (
          <div className="text-xs text-muted-foreground py-3 text-center">در ماه گذشته سفارشی برای این کالا ثبت نشده 🌱</div>
        ) : (
          <div className="max-h-56 overflow-y-auto flex flex-col gap-1.5">
            {rows.map((r, i) => (
              <div key={`${r.orderId}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-accent/60 px-2.5 py-2 text-xs">
                <div>
                  <div className="font-bold">سفارش {toFaDigits(r.orderNumber)} — {r.supplierName}</div>
                  <div className="text-muted-foreground mt-0.5">{formatJalali(r.createdAt)}</div>
                </div>
                <div className="text-left shrink-0">
                  <div className="font-bold text-olive tabular-nums">{toFaDigits(r.quantity)} عدد</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">{formatMoney(r.unitPrice)} ت</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ==================== ORDER CARD ====================

function OrderCard({ order, onOpen }: { order: OrderRow; onOpen: () => void }) {
  const s = ORDER_STATUSES[order.status]
  return (
    <GlowCard interactive className={cn('overflow-hidden', order.overdue && 'ring-2 ring-red-500 ring-offset-0 animate-pulse')}>
      <button onClick={onOpen} className="w-full text-right p-4 focus:outline-none" aria-label={`مشاهده سفارش ${order.number}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-extrabold flex items-center gap-2">
              <ClipboardList className="size-4 text-gold shrink-0" />
              سفارش {toFaDigits(order.number)}
            </div>
            <div className="text-sm text-muted-foreground mt-1 truncate">🏬 {order.supplierName}</div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <OrderStatusChip status={order.status} />
            {order.overdue && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-600 text-white px-2 py-0.5 text-[11px] font-bold">
                <Clock className="size-3" /> موعد گذشته
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-sm">
          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="flex items-center gap-1"><Package className="size-3.5" />{toFaDigits(order.itemCount)} قلم</span>
            <span className="flex items-center gap-1"><Truck className="size-3.5" />{toFaDigits(order.deliveryDate)}</span>
          </div>
          <Money value={order.totalAmount} className="font-extrabold text-foreground" />
        </div>
        <div className="text-[11px] text-muted-foreground mt-2">
          ثبت‌کننده: {order.createdByName || '—'} • {formatJalaliDateTime(order.createdAt)}
        </div>
      </button>
    </GlowCard>
  )
}

// ==================== NEW ORDER WIZARD ====================

const WIZARD_STEPS = ['تأمین‌کننده', 'شرکت', 'کالاها', 'بازبینی']

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {WIZARD_STEPS.map((label, i) => (
        <React.Fragment key={label}>
          {i > 0 && <span className="h-px w-4 bg-gold/40" aria-hidden />}
          <div
            className={cn(
              'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors',
              i === step ? 'bg-olive text-white' : i < step ? 'bg-olive/15 text-olive' : 'bg-muted text-muted-foreground'
            )}
          >
            <span className={cn('size-4 rounded-full flex items-center justify-center text-[9px]', i === step ? 'bg-white/25' : i < step ? 'bg-olive text-white' : 'bg-muted-foreground/25')}>
              {i < step ? '✓' : toFaDigits(i + 1)}
            </span>
            {label}
          </div>
        </React.Fragment>
      ))}
    </div>
  )
}

function NewOrderWizard({
  open,
  onOpenChange,
  onCreated,
  user,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
  user: ClientUser
}) {
  const { toast } = useToast()
  const [step, setStep] = React.useState(0)
  const [suppliers, setSuppliers] = React.useState<ZSupplier[] | null>(null)
  const [supplier, setSupplier] = React.useState<ZSupplier | null>(null)
  const [companyId, setCompanyId] = React.useState<string>('ALL')
  const [search, setSearch] = React.useState('')
  const [cart, setCart] = React.useState<Record<string, number>>({})
  const [deliveryDate, setDeliveryDate] = React.useState(addDaysJalali(todayJalali(), 1))
  const [paymentType, setPaymentType] = React.useState('CHEQUE')
  const [notes, setNotes] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      api.get<{ suppliers: ZSupplier[] }>('/api/suppliers').then((d) => setSuppliers(d.suppliers)).catch(() => setSuppliers([]))
    } else {
      // reset when closed
      setTimeout(() => {
        setStep(0); setSupplier(null); setCompanyId('ALL'); setSearch(''); setCart({})
        setDeliveryDate(addDaysJalali(todayJalali(), 1)); setNotes(''); setBusy(false)
      }, 200)
    }
  }, [open])

  function pickSupplier(s: ZSupplier) {
    setSupplier(s)
    setPaymentType(s.paymentType === 'CASH_ON_DELIVERY' ? 'CASH_ON_DELIVERY' : 'CHEQUE')
    setStep(1)
  }

  const allProducts: ZProduct[] = React.useMemo(() => {
    if (!supplier) return []
    const map = new Map<string, ZProduct>()
    for (const c of supplier.companies) for (const p of c.products) map.set(p.id, p)
    return [...map.values()]
  }, [supplier])

  const shownProducts: ZProduct[] = React.useMemo(() => {
    let list = allProducts
    if (companyId !== 'ALL') list = list.filter((p) => supplier?.companies.find((c) => c.id === companyId)?.products.some((x) => x.id === p.id))
    const q = search.trim()
    if (q) list = list.filter((p) => p.name.includes(q) || (p.barcode || '').includes(q))
    return list
  }, [allProducts, companyId, search, supplier])

  const cartProducts = allProducts.filter((p) => (cart[p.id] || 0) > 0)
  const cartTotal = cartProducts.reduce((s, p) => s + (cart[p.id] || 0) * p.cost, 0)

  async function submit() {
    if (!supplier || cartProducts.length === 0) return
    setBusy(true)
    try {
      const created = await api.post<{ id: string; number: number; status: string }>('/api/orders', {
        supplierId: supplier.id,
        items: cartProducts.map((p) => ({ productId: p.id, quantity: cart[p.id], unitPrice: p.cost, sellPrice: p.price })),
        deliveryDate,
        paymentType,
        notes: notes.trim() || undefined,
      })
      toast({
        title: 'سفارش با موفقیت ثبت شد 🎉',
        description:
          created.status === 'PENDING_APPROVAL'
            ? `شماره ${toFaDigits(created.number)} — منتظر تأیید مدیر فروشگاه`
            : `شماره ${toFaDigits(created.number)} — ${ORDER_STATUSES[created.status]?.label || ''}`,
      })
      onOpenChange(false)
      onCreated()
    } catch (e) {
      toast({ title: 'خطا در ثبت سفارش', description: e instanceof Error ? e.message : 'دوباره تلاش کنید', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-full h-[100dvh] rounded-none sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-2xl p-0 flex flex-col gap-0 overflow-hidden bg-cream">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-gold/20 bg-card/60 shrink-0">
          <DialogTitle className="text-base font-extrabold flex items-center gap-2">
            <PlusCircle className="size-5 text-olive" />
            ثبت سفارش جدید
          </DialogTitle>
          <DialogDescription className="text-xs mt-1">چند قدم ساده تا ثبت سفارش — همراه شما هستیم 🌿</DialogDescription>
          <div className="mt-3"><StepDots step={step} /></div>
        </DialogHeader>

        {/* ---- body ---- */}
        <div className="flex-1 overflow-y-auto p-4 nice-scrollbar">
          {/* STEP 0 — supplier */}
          {step === 0 && (
            suppliers === null ? (
              <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
            ) : suppliers.length === 0 ? (
              <EmptyState title="تأمین‌کننده‌ای ثبت نشده" description="اول از بخش تأمین‌کنندگان یک تأمین‌کننده اضافه کنید." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {suppliers.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => pickSupplier(s)}
                    className="text-right rounded-2xl border border-gold/20 bg-card p-4 hover:border-gold/60 hover:shadow-md transition-all card-hover-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    <div className="font-extrabold text-sm">{s.name}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                      {s.phone && <span className="flex items-center gap-1" dir="ltr"><Phone className="size-3" />{toFaDigits(s.phone)}</span>}
                      {s.contactName && <span>👤 {s.contactName}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {s.companies.map((c) => (
                        <span key={c.id} className="rounded-full bg-olive/10 text-olive px-2 py-0.5 text-[10px] font-bold">{c.name}</span>
                      ))}
                    </div>
                    <div className="mt-2">
                      <span className="inline-flex rounded-full bg-gold/15 text-[10px] font-bold px-2 py-0.5 text-[#8a6d1f]">
                        💳 {PAYMENT_LABELS[s.paymentType] || s.paymentType}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}

          {/* STEP 1 — company */}
          {step === 1 && supplier && (
            <div>
              <div className="text-sm font-bold mb-1">از کدام شرکت برای «{supplier.name}» سفارش می‌زنید؟</div>
              <p className="text-xs text-muted-foreground mb-4">اگر مطمئن نیستید، «همه محصولات» را انتخاب کنید.</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setCompanyId('ALL')}
                  className={cn(
                    'rounded-2xl border-2 px-4 h-12 text-sm font-bold transition-all active:scale-95',
                    companyId === 'ALL' ? 'bg-olive text-white border-olive shadow-md shadow-olive/25' : 'bg-card border-gold/25 hover:border-gold/60'
                  )}
                >
                  🧺 همه محصولات
                </button>
                {supplier.companies.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCompanyId(c.id)}
                    className={cn(
                      'rounded-2xl border-2 px-4 h-12 text-sm font-bold transition-all active:scale-95',
                      companyId === c.id ? 'bg-olive text-white border-olive shadow-md shadow-olive/25' : 'bg-card border-gold/25 hover:border-gold/60'
                    )}
                  >
                    {c.name}
                    <span className="text-[10px] font-medium opacity-75 mr-1.5">({toFaDigits(c.products.length)} کالا)</span>
                  </button>
                ))}
              </div>
              <Button className="mt-6 h-11 bg-olive text-white hover:bg-olive/90" onClick={() => setStep(2)}>
                ادامه ← انتخاب کالاها
              </Button>
            </div>
          )}

          {/* STEP 2 — products */}
          {step === 2 && supplier && (
            <div>
              <Input
                className="h-11 mb-3 bg-card"
                placeholder="🔍 جستجوی نام کالا یا بارکد..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {shownProducts.length === 0 ? (
                <EmptyState title="کالایی پیدا نشد" description="عبارت جستجو را تغییر دهید یا شرکت دیگری را انتخاب کنید." />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {shownProducts.map((p) => {
                    const qty = cart[p.id] || 0
                    return (
                      <div key={p.id} className={cn('rounded-2xl border bg-card p-3 transition-colors', qty > 0 ? 'border-olive/60 bg-olive/5' : 'border-gold/20')}>
                        <div className="flex gap-3">
                          {p.image ? (
                            <img src={p.image} alt={p.name} className="size-14 rounded-xl object-cover border border-gold/25 shrink-0" />
                          ) : (
                            <div className="size-14 rounded-xl bg-accent flex items-center justify-center text-xl shrink-0" aria-hidden>📦</div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-sm leading-snug line-clamp-2">{p.name}</div>
                            <div className="mt-1.5"><StockBadge stock={p.stock} minStock={p.minStock} unit={p.unit} /></div>
                            <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-2 flex-wrap">
                              <span>خرید: <b className="text-foreground tabular-nums">{formatMoney(p.cost)}</b> ت</span>
                              <span>فروش: <b className="text-foreground tabular-nums">{formatMoney(p.price)}</b> ت</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-gold/15">
                          <ProductRecentOrdersPopover productId={p.id} />
                          <QtyStepper value={qty} onChange={(n) => setCart((c) => ({ ...c, [p.id]: n }))} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 3 — review */}
          {step === 3 && supplier && (
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border border-gold/20 bg-card overflow-hidden">
                <div className="px-3 py-2 bg-accent/50 text-xs font-bold flex items-center justify-between">
                  <span>اقلام سفارش — {toFaDigits(cartProducts.length)} قلم</span>
                  <span className="text-muted-foreground font-medium">می‌توانید تعداد را همین‌جا تغییر دهید</span>
                </div>
                <div className="max-h-72 overflow-y-auto nice-scrollbar divide-y divide-gold/10">
                  {cartProducts.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm font-bold truncate">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground tabular-nums">
                          {formatMoney(p.cost)} ت × {toFaDigits(cart[p.id])} {p.unit}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Money value={p.cost * cart[p.id]} className="text-sm font-bold" />
                        <QtyStepper value={cart[p.id]} onChange={(n) => setCart((c) => ({ ...c, [p.id]: n }))} />
                        <button
                          aria-label={`حذف ${p.name}`}
                          className="size-9 rounded-xl text-red-600 hover:bg-red-50 flex items-center justify-center"
                          onClick={() => setCart((c) => { const n = { ...c }; delete n[p.id]; return n })}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-bold mb-1.5 block">📅 تاریخ تحویل مورد انتظار</label>
                  <JalaliDatePicker value={deliveryDate} onChange={setDeliveryDate} />
                </div>
                <div>
                  <label className="text-xs font-bold mb-1.5 block">💳 نحوه پرداخت</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['CASH_ON_DELIVERY', 'CHEQUE'] as const).map((pt) => (
                      <button
                        key={pt}
                        type="button"
                        onClick={() => setPaymentType(pt)}
                        className={cn(
                          'h-11 rounded-xl border-2 text-xs font-bold transition-all active:scale-95',
                          paymentType === pt ? 'bg-olive text-white border-olive' : 'bg-card border-gold/25 hover:border-gold/60'
                        )}
                      >
                        {PAYMENT_LABELS[pt]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold mb-1.5 block">📝 یادداشت برای این سفارش (اختیاری)</label>
                <Textarea rows={2} placeholder="مثلاً: لطفاً محموله قبل از ساعت ۱۰ صبح برسد..." value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-card" />
              </div>

              <div className="rounded-2xl bg-olive/10 border border-olive/30 p-4 flex items-center justify-between">
                <div className="text-sm font-bold">مبلغ کل سفارش</div>
                <Money value={cartTotal} className="text-lg font-black text-olive" />
              </div>
            </div>
          )}
        </div>

        {/* ---- sticky footer ---- */}
        <div className="shrink-0 border-t border-gold/20 bg-card/80 backdrop-blur-md px-4 py-3 flex items-center justify-between gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button variant="ghost" className="h-11" onClick={() => (step === 0 ? onOpenChange(false) : setStep((s) => s - 1))} disabled={busy}>
            {step === 0 ? 'انصراف' : '→ قبلی'}
          </Button>
          {step === 2 && (
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <span className="rounded-full bg-olive/10 text-olive px-2.5 py-1">{toFaDigits(cartProducts.length)} قلم در سبد</span>
            </div>
          )}
          {step < 2 && (
            <Button className="h-11 bg-olive hover:bg-olive/90 text-white" onClick={() => setStep((s) => s + 1)} disabled={(step === 0 && !supplier) || (step === 1 && !companyId)}>
              ادامه ←
            </Button>
          )}
          {step === 2 && (
            <Button className="h-11 bg-olive hover:bg-olive/90 text-white" onClick={() => setStep(3)} disabled={cartProducts.length === 0}>
              بازبینی سفارش ←
            </Button>
          )}
          {step === 3 && (
            <Button className="h-11 bg-olive hover:bg-olive/90 text-white min-w-36" onClick={submit} disabled={busy || cartProducts.length === 0}>
              {busy ? <Loader2 className="size-5 animate-spin" /> : <><PartyPopper className="size-4" /> ثبت سفارش ({formatMoney(cartTotal)} ت)</>}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ==================== ORDER DETAIL DIALOG ====================

interface EditItem { id?: string; productId: string; name: string; barcode?: string | null; quantity: number; unitPrice: number }

/** Persian money for share text: ۱۲۳٬۴۵۶ */
function faMoney(n: number): string {
  return toFaDigits(Math.round(n).toLocaleString('en-US')).replace(/,/g, '٬')
}

/** Build a supplier-friendly plain-text version of the order (WhatsApp/SMS ready) */
function buildOrderShareText(detail: OrderDetail): string {
  const lines: string[] = []
  lines.push(`🧺 سفارش شماره ${toFaDigits(detail.number)}`)
  lines.push(`🏬 تأمین‌کننده: ${detail.supplier.name}`)
  lines.push(`📅 تحویل: ${toFaDigits(detail.deliveryDate)}`)
  lines.push('〰️〰️〰️〰️〰️〰️')
  detail.items.forEach((it, i) => {
    const name = it.productName + (it.holooName ? ` (${it.holooName})` : '')
    lines.push(`${toFaDigits(i + 1)}) ${name}`)
    lines.push(`   ${toFaDigits(it.quantity)} × ${faMoney(it.unitPrice)} = ${faMoney(it.lineTotal)} تومان${it.discount ? ` (تخفیف ${faMoney(it.discount)})` : ''}`)
  })
  lines.push('〰️〰️〰️〰️〰️〰️')
  lines.push(`جمع اقلام: ${faMoney(detail.totalAmount)} تومان`)
  if (detail.discount) lines.push(`تخفیف: ${faMoney(detail.discount)} تومان`)
  const taxVat = (detail as unknown as { tax?: number; vat?: number })
  if (taxVat.tax) lines.push(`مالیات: ${faMoney(taxVat.tax)} تومان`)
  if (taxVat.vat) lines.push(`ارزش افزوده: ${faMoney(taxVat.vat)} تومان`)
  lines.push(`💰 مبلغ نهایی: ${faMoney(detail.finalAmount)} تومان`)
  if (detail.notes) lines.push(`📝 یادداشت: ${detail.notes}`)
  lines.push('〰️〰️〰️〰️〰️〰️')
  lines.push('هایپر زیتون کرمان — واحد خرید')
  return lines.join('\n')
}

/** Supplier share dialog: copy / WhatsApp / native share */
function OrderShareDialog({ detail, onClose }: { detail: OrderDetail | null; onClose: () => void }) {
  const { toast } = useToast()
  const [copied, setCopied] = React.useState(false)
  const text = detail ? buildOrderShareText(detail) : ''

  const phone = detail?.supplier.phone || ''
  const waDigits = toEnDigits(phone).replace(/\D/g, '')
  const waTarget = waDigits.startsWith('0') ? `98${waDigits.slice(1)}` : waDigits.startsWith('98') ? waDigits : waDigits ? `98${waDigits}` : ''
  const waLink = waTarget ? `https://wa.me/${waTarget}?text=${encodeURIComponent(text)}` : null

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // fallback for contexts where the async clipboard API is blocked
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (!ok) throw new Error('copy rejected')
    }
    setCopied(true)
    sfxSuccess()
    toast({ title: 'متن سفارش کپی شد 📋', description: 'می‌توانید در واتساپ یا پیام‌رسان دلخواه برای فروشنده بفرستید.' })
    setTimeout(() => setCopied(false), 2500)
  }

  async function nativeShare() {
    try {
      if (navigator.share) {
        await navigator.share({ title: `سفارش ${toFaDigits(detail!.number)} — ${detail!.supplier.name}`, text })
      } else {
        await copy()
      }
    } catch {
      /* user cancelled */
    }
  }

  return (
    <Dialog open={!!detail} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-5 text-gold" />
            ارسال سفارش به تأمین‌کننده
          </DialogTitle>
          <DialogDescription className="text-xs">
            متن آماده سفارش را کپی کنید یا مستقیم در واتساپ برای فروشنده بفرستید.
          </DialogDescription>
        </DialogHeader>

        <pre
          dir="rtl"
          className="max-h-64 overflow-y-auto nice-scrollbar whitespace-pre-wrap rounded-xl border border-gold/25 bg-cream p-3 text-xs leading-6 font-medium select-all"
        >
          {text}
        </pre>

        <div className="flex flex-wrap gap-2">
          <Button className="h-11 flex-1 bg-olive hover:bg-olive/90 text-white gap-1.5" onClick={copy}>
            {copied ? <><Check className="size-4" /> کپی شد</> : <><Copy className="size-4" /> کپی متن</>}
          </Button>
          {waLink && (
            <Button
              variant="outline"
              className="h-11 flex-1 border-gold/40 gap-1.5 text-foreground"
              onClick={() => window.open(waLink, '_blank', 'noopener')}
            >
              <Send className="size-4 text-olive" /> واتساپ
            </Button>
          )}
          <Button variant="outline" className="h-11 flex-1 border-gold/40 gap-1.5" onClick={nativeShare}>
            <Share2 className="size-4 text-gold" /> اشتراک‌گذاری
          </Button>
        </div>

        {phone && (
          <div className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1.5">
            <Phone className="size-3" />
            تلفن فروشنده: <span dir="ltr" className="font-bold">{toFaDigits(phone)}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function OrderDetailDialog({
  orderId,
  user,
  onClose,
  onChanged,
}: {
  orderId: string
  user: ClientUser
  onClose: () => void
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [detail, setDetail] = React.useState<OrderDetail | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [editItems, setEditItems] = React.useState<EditItem[]>([])
  const [editDate, setEditDate] = React.useState('')
  const [editPayment, setEditPayment] = React.useState('CHEQUE')
  const [editNotes, setEditNotes] = React.useState('')
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [correctionOpen, setCorrectionOpen] = React.useState(false)
  const [correctionNote, setCorrectionNote] = React.useState('')
  const [printOpen, setPrintOpen] = React.useState(false)
  const [shareOpen, setShareOpen] = React.useState(false)

  const canManage = canUser(user.roles, PERMISSIONS.MANAGE_ORDERS)
  const canApprove = canUser(user.roles, PERMISSIONS.APPROVE_ORDERS)

  const load = React.useCallback(async () => {
    try {
      const d = await api.get<OrderDetail>(`/api/orders/${orderId}`)
      setDetail(d)
    } catch (e) {
      toast({ title: 'خطا در دریافت سفارش', description: e instanceof Error ? e.message : '', variant: 'destructive' })
      onClose()
    }
  }, [orderId])

  React.useEffect(() => {
    load()
  }, [load])

  function startEdit() {
    if (!detail) return
    setEditItems(detail.items.map((it) => ({ id: it.id, productId: it.productId, name: it.productName, barcode: it.barcode, quantity: it.quantity, unitPrice: it.unitPrice })))
    setEditDate(detail.deliveryDate)
    setEditPayment(detail.paymentType)
    setEditNotes(detail.notes || '')
    setEditing(true)
  }

  async function saveEdit() {
    if (!detail) return
    setBusy(true)
    try {
      await api.patch(`/api/orders/${detail.id}`, {
        items: editItems.map((it) => ({ id: it.id, productId: it.productId, quantity: it.quantity, unitPrice: it.unitPrice })),
        deliveryDate: editDate || undefined,
        paymentType: editPayment,
        notes: editNotes,
      })
      toast({ title: 'تغییرات ذخیره شد ✅', description: 'سابقه ویرایش در تاریخچه سفارش ثبت شد.' })
      setEditing(false)
      await load()
      onChanged()
    } catch (e) {
      toast({ title: 'خطا در ذخیره', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  async function doAction(action: string, note?: string, successMsg?: string) {
    if (!detail) return
    setBusy(true)
    try {
      await api.post(`/api/orders/${detail.id}/actions`, { action, note })
      toast({ title: successMsg || 'انجام شد ✅' })
      setCorrectionOpen(false)
      setCorrectionNote('')
      await load()
      onChanged()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  async function doCancel() {
    if (!detail) return
    setBusy(true)
    try {
      await api.delete(`/api/orders/${detail.id}`)
      toast({ title: 'سفارش لغو شد', description: 'این سفارش با وضعیت «لغو شده» در سیستم باقی می‌ماند.' })
      setCancelOpen(false)
      await load()
      onChanged()
    } catch (e) {
      toast({ title: 'خطا در لغو سفارش', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const status = detail?.status
  const locked = !!status && !['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'EXPECTED', 'CANCELLED'].includes(status)
  const editTotal = editItems.reduce((s, it) => s + it.quantity * it.unitPrice, 0)

  // map status → first history timestamp (for the timeline dates)
  const statusDates = React.useMemo(() => {
    const m: Record<string, string> = {}
    for (const h of detail?.history || []) {
      const to = h.details?.toStatus
      if (to && !m[to]) m[to] = h.createdAt
    }
    return m
  }, [detail])

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-none w-full h-[100dvh] rounded-none sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-2xl p-0 flex flex-col gap-0 overflow-hidden bg-cream">
        {!detail ? (
          <div className="p-6 space-y-3">
            <DialogTitle className="sr-only">در حال بارگذاری سفارش…</DialogTitle>
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        ) : (
          <>
            <DialogHeader className="px-4 pt-4 pb-3 border-b border-gold/20 bg-card/60 shrink-0">
              <DialogTitle className="text-base font-extrabold flex flex-wrap items-center gap-2">
                <ClipboardList className="size-5 text-gold" />
                سفارش {toFaDigits(detail.number)} — {detail.supplier.name}
                <OrderStatusChip status={detail.status} />
                {detail.holooRef && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[11px] font-black" title="شماره سند ثبت‌شده در هلو">
                    <CheckCheck className="size-3" /> سند هلو: {toFaDigits(detail.holooRef)}
                  </span>
                )}
                {detail.status === 'CANCELLED' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-600 text-white px-2 py-0.5 text-[11px] font-bold"><XCircle className="size-3" /> لغو شده</span>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs mt-1">
                ثبت‌کننده: {detail.createdByName || '—'} • {formatJalaliDateTime(detail.createdAt)}
                {detail.supplier.phone && <> • تلفن: <span dir="ltr">{toFaDigits(detail.supplier.phone)}</span></>}
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="items" className="flex-1 flex flex-col min-h-0">
              <TabsList className="mx-4 mt-3 mb-0 shrink-0 grid grid-cols-2 w-auto">
                <TabsTrigger value="items" className="gap-1.5"><ClipboardList className="size-4" /> جزئیات سفارش</TabsTrigger>
                <TabsTrigger value="history" className="gap-1.5"><History className="size-4" /> تاریخچه و سابقه</TabsTrigger>
              </TabsList>

              {/* ---------- items tab ---------- */}
              <TabsContent value="items" className="flex-1 overflow-y-auto nice-scrollbar p-4 mt-0 data-[state=inactive]:hidden">
                {/* status timeline */}
                {status === 'CANCELLED' ? (
                  <div className="mb-4 rounded-2xl bg-red-50 border border-red-200 p-3 text-sm font-bold text-red-700 flex items-center gap-2">
                    <XCircle className="size-4" /> این سفارش لغو شده و دیگر قابل تغییر نیست.
                  </div>
                ) : (
                  <div className="mb-4 overflow-x-auto nice-scrollbar">
                    <div className="flex items-start gap-1 min-w-max px-1 py-1">
                      {ORDER_FLOW.map((st, i) => {
                        const curIdx = ORDER_FLOW.indexOf(status || 'DRAFT')
                        const date = statusDates[st]
                        return (
                          <React.Fragment key={st}>
                            {i > 0 && <span className={cn('h-0.5 w-4 mt-3.5 rounded', i <= curIdx ? 'bg-olive' : 'bg-muted')} aria-hidden />}
                            <div className="flex flex-col items-center gap-1 w-16 text-center">
                              <span
                                className={cn(
                                  'size-3 rounded-full ring-4',
                                  i < curIdx ? 'bg-olive ring-olive/15' : i === curIdx ? 'bg-gold ring-gold/20 animate-pulse' : 'bg-muted-foreground/30 ring-transparent'
                                )}
                                aria-hidden
                              />
                              <span className={cn('text-[10px] font-bold leading-tight', i <= curIdx ? 'text-foreground' : 'text-muted-foreground')}>{ORDER_STATUSES[st].label}</span>
                              {date && <span className="text-[9px] text-muted-foreground">{formatJalali(date)}</span>}
                            </div>
                          </React.Fragment>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* items table / edit mode */}
                {!editing ? (
                  <div className="rounded-2xl border border-gold/20 bg-card overflow-hidden">
                    <div className="overflow-x-auto nice-scrollbar">
                      <table className="w-full text-sm min-w-[520px]">
                        <thead>
                          <tr className="bg-accent/50 text-xs text-muted-foreground">
                            <th className="text-right font-bold px-3 py-2">کالا</th>
                            <th className="text-center font-bold px-2 py-2">تعداد</th>
                            <th className="text-center font-bold px-2 py-2">قیمت واحد</th>
                            <th className="text-left font-bold px-3 py-2">جمع</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gold/10">
                          {detail.items.map((it) => (
                            <tr key={it.id}>
                              <td className="px-3 py-2.5">
                                <div className="font-bold">{it.productName}</div>
                                {it.barcode && <div className="text-[10px] text-muted-foreground tabular-nums" dir="ltr">{toFaDigits(it.barcode)}</div>}
                                {it.receivedQty !== null && it.receivedQty !== undefined && (
                                  <div className="text-[10px] text-olive font-bold mt-0.5">دریافت‌شده: {toFaDigits(it.receivedQty)}</div>
                                )}
                              </td>
                              <td className="text-center px-2 py-2.5 tabular-nums font-bold">{toFaDigits(it.quantity)}</td>
                              <td className="text-center px-2 py-2.5 tabular-nums"><Money value={it.unitPrice} /></td>
                              <td className="text-left px-3 py-2.5 tabular-nums font-bold"><Money value={it.lineTotal} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border-2 border-olive/40 bg-card overflow-hidden">
                    <div className="px-3 py-2 bg-olive/10 text-xs font-bold text-olive flex items-center gap-1.5"><Pencil className="size-3.5" /> ویرایش اقلام — تعداد و قیمت واحد را تنظیم کنید</div>
                    <div className="max-h-72 overflow-y-auto nice-scrollbar divide-y divide-gold/10">
                      {editItems.map((it, idx) => (
                        <div key={it.id || it.productId} className="px-3 py-2.5 flex flex-wrap items-center gap-2">
                          <div className="min-w-0 flex-1 basis-40">
                            <div className="text-sm font-bold truncate">{it.name}</div>
                            <div className="text-[10px] text-muted-foreground">جمع خط: <b className="tabular-nums">{formatMoney(it.quantity * it.unitPrice)}</b> ت</div>
                          </div>
                          <label className="text-[10px] text-muted-foreground">تعداد</label>
                          <FaNumberInput value={it.quantity} onChange={(n) => setEditItems((arr) => arr.map((x, i) => (i === idx ? { ...x, quantity: n } : x)))} className="w-20" />
                          <label className="text-[10px] text-muted-foreground">قیمت واحد</label>
                          <FaNumberInput value={it.unitPrice} onChange={(n) => setEditItems((arr) => arr.map((x, i) => (i === idx ? { ...x, unitPrice: n } : x)))} className="w-28" />
                          <button
                            aria-label={`حذف ${it.name}`}
                            className="size-9 rounded-xl text-red-600 hover:bg-red-50 flex items-center justify-center"
                            onClick={() => setEditItems((arr) => arr.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="px-3 py-2.5 bg-accent/40 flex items-center justify-between text-sm font-bold">
                      <span>مبلغ جدید سفارش</span>
                      <Money value={editTotal} className="text-olive" />
                    </div>
                  </div>
                )}

                {/* info + totals */}
                {!editing && (
                  <div className="grid gap-3 sm:grid-cols-2 mt-3">
                    <div className="rounded-2xl border border-gold/20 bg-card p-3.5 text-sm space-y-2">
                      <div className="flex items-center justify-between"><span className="text-muted-foreground">📅 موعد تحویل</span><b>{toFaDigits(detail.deliveryDate)}</b></div>
                      <div className="flex items-center justify-between"><span className="text-muted-foreground">💳 نحوه پرداخت</span><b>{PAYMENT_LABELS[detail.paymentType] || detail.paymentType}</b></div>
                      <div className="flex items-center justify-between"><span className="text-muted-foreground">🏬 تأمین‌کننده</span><b>{detail.supplier.name}</b></div>
                    </div>
                    <div className="rounded-2xl bg-olive/10 border border-olive/30 p-3.5 text-sm space-y-2">
                      <div className="flex items-center justify-between"><span>جمع اقلام</span><Money value={detail.totalAmount} /></div>
                      {detail.discount > 0 && <div className="flex items-center justify-between text-red-600"><span>تخفیف</span><span className="tabular-nums">−{formatMoney(detail.discount)}</span></div>}
                      <div className="flex items-center justify-between font-black text-base pt-1 border-t border-olive/25"><span>مبلغ نهایی</span><Money value={detail.finalAmount} className="text-olive" /></div>
                    </div>
                  </div>
                )}

                {detail.notes && !editing && (
                  <div className="mt-3 rounded-2xl bg-gold/10 border border-gold/25 p-3 text-sm">
                    <span className="font-bold">📝 یادداشت: </span>
                    {detail.notes}
                  </div>
                )}

                {editing && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-bold mb-1.5 block">📅 تاریخ تحویل</label>
                      <JalaliDatePicker value={editDate} onChange={setEditDate} />
                    </div>
                    <div>
                      <label className="text-xs font-bold mb-1.5 block">💳 نحوه پرداخت</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['CASH_ON_DELIVERY', 'CHEQUE'] as const).map((pt) => (
                          <button
                            key={pt}
                            type="button"
                            onClick={() => setEditPayment(pt)}
                            className={cn('h-11 rounded-xl border-2 text-xs font-bold transition-all active:scale-95', editPayment === pt ? 'bg-olive text-white border-olive' : 'bg-card border-gold/25 hover:border-gold/60')}
                          >
                            {PAYMENT_LABELS[pt]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-bold mb-1.5 block">📝 یادداشت</label>
                      <Textarea rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="bg-card" />
                    </div>
                  </div>
                )}

                {/* actions */}
                {canManage && status !== 'CANCELLED' && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {!editing && ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'EXPECTED'].includes(status || '') && (
                      <Button variant="outline" className="h-11 border-gold/40" onClick={startEdit} disabled={busy}>
                        <Pencil className="size-4" /> ویرایش سفارش
                      </Button>
                    )}
                    {editing && (
                      <>
                        <Button className="h-11 bg-olive hover:bg-olive/90 text-white" onClick={saveEdit} disabled={busy || editItems.length === 0}>
                          {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} ذخیره تغییرات
                        </Button>
                        <Button variant="ghost" className="h-11" onClick={() => setEditing(false)} disabled={busy}>انصراف</Button>
                      </>
                    )}
                    {status === 'DRAFT' && !editing && (
                      <Button className="h-11 bg-olive hover:bg-olive/90 text-white" onClick={() => doAction('submit', undefined, 'سفارش برای تأیید مدیر فروشگاه ارسال شد')} disabled={busy}>
                        <Send className="size-4" /> ارسال برای تأیید
                      </Button>
                    )}
                    {status === 'PENDING_APPROVAL' && canApprove && !editing && (
                      <>
                        <Button className="h-11 bg-olive hover:bg-olive/90 text-white" onClick={() => doAction('approve', undefined, 'سفارش تأیید شد ✅')} disabled={busy}>
                          <CheckCircle2 className="size-4" /> تأیید سفارش
                        </Button>
                        <Button variant="outline" className="h-11 border-red-300 text-red-600 hover:bg-red-50" onClick={() => doAction('reject', undefined, 'سفارش به پیش‌نویس بازگشت')} disabled={busy}>
                          <XCircle className="size-4" /> رد و اصلاح
                        </Button>
                      </>
                    )}
                    {status === 'APPROVED' && canApprove && !editing && (
                      <Button className="h-11 bg-olive hover:bg-olive/90 text-white" onClick={() => doAction('expect', undefined, 'سفارش ثبت شد؛ در انتظار دریافت کالا')} disabled={busy}>
                        <Truck className="size-4" /> ثبت و انتظار دریافت
                      </Button>
                    )}
                    {['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'EXPECTED'].includes(status || '') && !editing && (
                      <Button variant="outline" className="h-11 border-red-300 text-red-600 hover:bg-red-50" onClick={() => setCancelOpen(true)} disabled={busy}>
                        <XCircle className="size-4" /> لغو سفارش
                      </Button>
                    )}
                    {locked && (
                      <Button variant="outline" className="h-11 border-gold/40" onClick={() => setCorrectionOpen(true)} disabled={busy}>
                        <FileText className="size-4" /> افزودن اصلاحیه
                      </Button>
                    )}
                    {!editing && detail && (
                      <Button variant="outline" className="h-11 border-olive/40 text-olive hover:bg-olive/10" onClick={() => setPrintOpen(true)}>
                        <Printer className="size-4" /> چاپ فاکتور
                      </Button>
                    )}
                    {!editing && detail && (
                      <Button variant="outline" className="h-11 border-gold/40 gap-1.5 hover:bg-gold/10" onClick={() => setShareOpen(true)}>
                        <Share2 className="size-4 text-gold" /> ارسال به فروشنده
                      </Button>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* ---------- history tab ---------- */}
              <TabsContent value="history" className="flex-1 overflow-y-auto nice-scrollbar p-4 mt-0 data-[state=inactive]:hidden">
                <OrnamentDivider />
                {detail.history.length === 0 ? (
                  <EmptyState icon={<History className="size-6" />} title="هنوز سابقه‌ای ثبت نشده" />
                ) : (
                  <div className="relative pr-5">
                    <span className="absolute right-1.5 top-2 bottom-2 w-0.5 bg-gold/25 rounded" aria-hidden />
                    {detail.history.map((h) => (
                      <div key={h.id} className="relative mb-4 last:mb-0">
                        <span className="absolute -right-[1.42rem] top-1.5 size-3 rounded-full bg-gold ring-4 ring-gold/15" aria-hidden />
                        <div className="rounded-2xl border border-gold/20 bg-card p-3">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="font-extrabold text-sm">{h.action}</span>
                            <span className="text-[11px] text-muted-foreground">{formatJalaliDateTime(h.createdAt)}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">👩‍💼 {h.userName}</div>
                          {h.details?.description && <div className="text-sm mt-1.5 leading-relaxed">{h.details.description}</div>}
                          {h.details?.note && <div className="text-sm mt-1 text-amber-800 bg-amber-50 rounded-lg px-2 py-1">💡 {h.details.note}</div>}
                          {h.details?.items && h.details.items.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {h.details.items.map((it, i) => (
                                <span key={i} className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold">{it.name} × {toFaDigits(it.qty)}</span>
                              ))}
                            </div>
                          )}
                          {typeof h.details?.totalAmount === 'number' && (
                            <div className="text-xs text-muted-foreground mt-1.5">مبلغ: <Money value={h.details.totalAmount} className="font-bold text-foreground" /></div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}

        {/* cancel confirm */}
        <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>لغو این سفارش؟</AlertDialogTitle>
              <AlertDialogDescription>
                سفارش با وضعیت «لغو شده» در سیستم ثبت می‌ماند و در تاریخچه قابل مشاهده است، اما دیگر قابل بازیابی نیست.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">نه، نگهش می‌داریم</AlertDialogCancel>
              <AlertDialogAction className="h-11 bg-red-600 hover:bg-red-700 text-white" onClick={doCancel} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : 'بله، لغو کن'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* correction dialog */}
        <Dialog open={correctionOpen} onOpenChange={setCorrectionOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><FileText className="size-5 text-gold" /> افزودن اصلاحیه</DialogTitle>
              <DialogDescription className="text-xs">سفارش در مرحله قفل است؛ توضیحات اصلاحی در تاریخچه سفارش ثبت می‌شود.</DialogDescription>
            </DialogHeader>
            <Textarea rows={3} placeholder="مثلاً: ۲ عدد از اقلام معیوب بود و به تأمین‌کننده برگشت داده شد..." value={correctionNote} onChange={(e) => setCorrectionNote(e.target.value)} />
            <Button
              className="h-11 bg-olive hover:bg-olive/90 text-white"
              disabled={busy || !correctionNote.trim()}
              onClick={() => doAction('correction', correctionNote.trim(), 'اصلاحیه ثبت شد ✅')}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : 'ثبت اصلاحیه'}
            </Button>
          </DialogContent>
        </Dialog>
        <InvoicePrintOverlay
          open={printOpen}
          onClose={() => setPrintOpen(false)}
          order={detail ? ({
            number: detail.number,
            supplierName: detail.supplier?.name || '—',
            status: detail.status,
            deliveryDate: detail.deliveryDate,
            paymentType: detail.paymentType,
            notes: detail.notes,
            createdAt: detail.createdAt,
            createdByName: detail.createdByName,
            totalAmount: detail.totalAmount,
            discount: detail.discount,
            tax: (detail as unknown as { tax?: number }).tax || 0,
            vat: (detail as unknown as { vat?: number }).vat || 0,
            finalAmount: detail.finalAmount,
            items: detail.items.map((it) => ({
              productName: it.productName,
              barcode: it.barcode,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              receivedQty: it.receivedQty,
              printedPrice: (it as unknown as { printedPrice?: number | null }).printedPrice ?? null,
              discount: it.discount,
              lineTotal: it.lineTotal,
              status: it.status,
            })),
          } as PrintableOrder) : null}
        />

        {/* supplier share dialog */}
        {shareOpen && (
          <OrderShareDialog
            detail={detail}
            onClose={() => setShareOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ==================== MAIN SECTION ====================

const ALL_STATUSES = ['ALL', ...Object.keys(ORDER_STATUSES)]

export function OrdersSection({ user }: { user: ClientUser }) {
  const { toast } = useToast()
  const canManage = canUser(user.roles, PERMISSIONS.MANAGE_ORDERS)

  const [orders, setOrders] = React.useState<OrderRow[] | null>(null)
  const [statusFilter, setStatusFilter] = React.useState('ALL')
  const [search, setSearch] = React.useState('')
  const [wizardOpen, setWizardOpen] = React.useState(false)
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)

  React.useEffect(() => {
    let alive = true
    api.get<OrderRow[]>('/api/orders?limit=200').then((d) => {
      if (alive) setOrders(d)
    }).catch((e) => {
      if (!alive) return
      toast({ title: 'خطا در دریافت سفارشات', description: e instanceof Error ? e.message : '', variant: 'destructive' })
      setOrders([])
    })
    return () => { alive = false }
  }, [refreshKey])

  // quick-create hook: header button lands here → open wizard automatically.
  // The shell can either dispatch window event 'zeytoon:new-order' or set sessionStorage 'zeytoon_open_new_order' = '1'.
  React.useEffect(() => {
    try {
      if (sessionStorage.getItem('zeytoon_open_new_order') === '1') {
        sessionStorage.removeItem('zeytoon_open_new_order')
        if (canManage) setWizardOpen(true)
      }
      const openId = sessionStorage.getItem('zeytoon_open_order')
      if (openId) {
        sessionStorage.removeItem('zeytoon_open_order')
        setDetailId(openId)
      }
    } catch { /* private mode */ }
    const handler = () => { if (canManage) setWizardOpen(true) }
    window.addEventListener('zeytoon:new-order', handler)
    return () => window.removeEventListener('zeytoon:new-order', handler)
  }, [canManage])

  const counts = React.useMemo(() => {
    const c: Record<string, number> = { ALL: orders?.length || 0 }
    for (const o of orders || []) c[o.status] = (c[o.status] || 0) + 1
    return c
  }, [orders])

  const visible = React.useMemo(() => {
    let list = orders || []
    if (statusFilter !== 'ALL') list = list.filter((o) => o.status === statusFilter)
    const q = search.trim()
    if (q) list = list.filter((o) => o.supplierName.includes(q) || String(o.number).includes(q) || toFaDigits(o.number).includes(q))
    // overdue first, then newest
    return [...list].sort((a, b) => (Number(b.overdue) || 0) - (Number(a.overdue) || 0))
  }, [orders, statusFilter, search])

  return (
    <div>
      <SectionHeader
        title="سفارشات خرید"
        subtitle={canManage ? 'ثبت و پیگیری سفارش‌های تأمین‌کنندگان' : 'پیگیری سفارش‌های تأمین‌کنندگان (دسترسی مشاهده)'}
        actions={
          canManage && (
            <Button size="lg" className="h-12 text-base bg-olive hover:bg-olive/90 text-white shadow-lg shadow-olive/25 gap-2" onClick={() => setWizardOpen(true)}>
              <PlusCircle className="size-5" />
              سفارش جدید
            </Button>
          )
        }
      />

      {/* status filter chips */}
      <div className="flex flex-wrap gap-2 pb-1 mb-3" role="group" aria-label="فیلتر وضعیت سفارش">
        {ALL_STATUSES.map((st) => {
          const info = st === 'ALL' ? null : ORDER_STATUSES[st]
          const active = statusFilter === st
          return (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={cn(
                'shrink-0 rounded-full border-2 px-3.5 h-9 text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5',
                active ? 'text-white border-transparent shadow-md' : 'bg-card border-gold/20 hover:border-gold/50 text-foreground/80'
              )}
              style={active && info ? { background: info.color } : active ? { background: '#5a7d4f' } : undefined}
            >
              {info ? info.label : 'همه'}
              <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', active ? 'bg-white/20' : 'bg-muted')}>{toFaDigits(counts[st] || 0)}</span>
            </button>
          )
        })}
      </div>

      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden />
        <Input
          className="h-11 pr-9 bg-card"
          placeholder="جستجو: نام تأمین‌کننده یا شماره سفارش..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="جستجوی سفارش"
        />
      </div>

      {orders === null ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-6" />}
          title={orders.length === 0 ? 'هنوز سفارشی ثبت نشده' : 'سفارشی با این فیلتر پیدا نشد'}
          description={orders.length === 0 ? 'با دکمه «سفارش جدید» اولین سفارش خرید هایپر زیتون را ثبت کنید 🌿' : 'فیلتر وضعیت یا عبارت جستجو را تغییر دهید.'}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((o) => (
            <OrderCard key={o.id} order={o} onOpen={() => setDetailId(o.id)} />
          ))}
        </div>
      )}

      <NewOrderWizard open={wizardOpen} onOpenChange={setWizardOpen} onCreated={() => setRefreshKey((k) => k + 1)} user={user} />
      {detailId && (
        <OrderDetailDialog
          orderId={detailId}
          user={user}
          onClose={() => setDetailId(null)}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  )
}
