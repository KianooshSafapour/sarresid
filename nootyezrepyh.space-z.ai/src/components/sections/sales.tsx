'use client'

import * as React from 'react'
import { api, ClientUser } from '@/lib/api-client'
import { GlowCard, SectionHeader, EmptyState, Money } from '@/components/zeytoon-ui'
import { formatMoney, toFaDigits, formatJalaliDateTime, toEnDigits, todayJalali, addDaysJalali } from '@/lib/jalali'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { JalaliDatePicker } from '@/components/jalali-date-picker'
import { useToast } from '@/hooks/use-toast'
import { sfxSuccess } from '@/lib/sfx'
import { cn } from '@/lib/utils'
import {
  ShoppingCart, Search, Plus, Minus, Trash2, UserPlus, Users, X, Loader2,
  CheckCircle2, BadgeCheck, Sparkles, ScanBarcode, User, Phone, Cake, Star,
  ClipboardList, Wallet, ScanLine, Share2, Copy, Check, Send,
} from 'lucide-react'

/* =============== types =============== */

interface SaleItem { productId: string | null; name: string; qty: number; price: number }

interface Product {
  id: string
  name: string
  price: number
  stock: number
  unit?: string
  barcode?: string | null
  image?: string | null
}

interface Customer {
  id: string
  name: string
  phone?: string | null
  birthday?: string | null
  preferences?: string | null
  notes?: string | null
  points: number
  createdAt?: string
}

interface SaleOrder {
  id: string
  customerName: string
  customerPhone?: string | null
  salespersonName?: string
  cashierName?: string | null
  items: SaleItem[]
  total: number
  status: 'PENDING' | 'ACCEPTED' | 'CASHED'
  note?: string | null
  createdAt: string
  cashedAt?: string | null
}

const SALE_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'در انتظار آماده‌سازی', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  ACCEPTED: { label: 'تأیید شده — آماده صندوق', cls: 'bg-olive/15 text-olive border-olive/40' },
  CASHED: { label: 'تسویه شده ✅', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
}

function StatusPill({ status }: { status: string }) {
  const s = SALE_STATUS[status]
  if (!s) return null
  return <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold', s.cls)}>{s.label}</span>
}

function parseNum(s: string): number {
  const digits = toEnDigits(s).replace(/[^\d]/g, '')
  return digits ? parseInt(digits, 10) : 0
}

/** Customer-facing receipt text (WhatsApp/SMS-ready) for a pre-registered sale. */
function buildSaleShareText(order: SaleOrder): string {
  const lines: string[] = []
  lines.push('🌿 هایپر زیتون کرمان')
  lines.push(`🧾 سفارش ${order.customerName}`)
  lines.push(`📅 ${toFaDigits(formatJalaliDateTime(order.createdAt))}`)
  lines.push('〰️〰️〰️〰️〰️〰️')
  order.items.forEach((it, i) => {
    lines.push(`${toFaDigits(i + 1)}) ${it.name}`)
    lines.push(`   ${toFaDigits(it.qty)} × ${toFaDigits(formatMoney(it.price))} = ${toFaDigits(formatMoney(it.qty * it.price))} تومان`)
  })
  lines.push('〰️〰️〰️〰️〰️〰️')
  lines.push(`💰 جمع: ${toFaDigits(formatMoney(order.total))} تومان`)
  if (order.note) lines.push(`📝 یادداشت: ${order.note}`)
  lines.push('〰️〰️〰️〰️〰️〰️')
  lines.push('با تشکر از اعتماد شما 🌟')
  return lines.join('\n')
}

/** Normalize an Iranian mobile number to wa.me form (98XXXXXXXXXX). */
function waTarget(phone?: string | null): string {
  const d = String(phone || '').replace(/[^0-9]/g, '')
  if (d.length < 8) return ''
  return d.startsWith('0') ? `98${d.slice(1)}` : d.startsWith('98') ? d : `98${d}`
}

/** Customer share dialog: copy / WhatsApp / native share */
function SaleShareDialog({ order, onClose }: { order: SaleOrder | null; onClose: () => void }) {
  const { toast } = useToast()
  const [copied, setCopied] = React.useState(false)
  const text = order ? buildSaleShareText(order) : ''
  const wa = waTarget(order?.customerPhone)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
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
    toast({ title: 'متن سفارش کپی شد 📋', description: 'می‌توانید برای مشتری در پیام‌رسان بفرستید.' })
    setTimeout(() => setCopied(false), 2500)
  }

  async function nativeShare() {
    try {
      if (navigator.share) {
        await navigator.share({ title: `سفارش ${order!.customerName} — هایپر زیتون`, text })
      } else {
        await copy()
      }
    } catch {
      /* user cancelled */
    }
  }

  return (
    <Dialog open={!!order} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-5 text-gold" />
            ارسال خلاصه سفارش به مشتری
          </DialogTitle>
          <DialogDescription className="text-xs">
            متن آماده فاکتور را کپی کنید یا مستقیم برای مشتری بفرستید.
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
          {wa && (
            <Button
              className="h-11 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              onClick={() => window.open(`https://wa.me/${wa}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')}
            >
              <Send className="size-4" /> واتساپ به مشتری
            </Button>
          )}
          <Button variant="outline" className="h-11 flex-1 border-gold/40 gap-1.5" onClick={nativeShare}>
            <Share2 className="size-4 text-gold" /> اشتراک‌گذاری
          </Button>
        </div>

        <div className="text-[11px] text-muted-foreground text-center flex flex-wrap items-center justify-center gap-1.5">
          <User className="size-3" />
          مشتری: <span className="font-bold">{order?.customerName}</span>
          {wa && (
            <>
              <span aria-hidden>•</span>
              <Phone className="size-3" />
              <span dir="ltr" className="font-bold tabular-nums">{toFaDigits(order?.customerPhone || '')}</span>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Normalize product list — works with both the products module API and the local fallback */
function normalizeProducts(raw: unknown): Product[] {
  let arr: Record<string, unknown>[] = []
  if (Array.isArray(raw)) arr = raw as Record<string, unknown>[]
  else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    if (Array.isArray(obj.products)) arr = obj.products
    else if (Array.isArray(obj.items)) arr = obj.items
  }
  return arr
    .map((p) => ({
      id: String(p.id ?? ''),
      name: String(p.name ?? p.title ?? ''),
      price: Number(p.price ?? p.sellPrice ?? 0),
      stock: Number(p.stock ?? 0),
      unit: (p.unit as string) || 'عدد',
      barcode: (p.barcode as string) || null,
      image: (p.image as string) || null,
    }))
    .filter((p) => p.id && p.name)
}

async function fetchProducts(q: string): Promise<Product[]> {
  // primary: products module (agent 2-e); fallback: sale-orders product endpoint
  try {
    return normalizeProducts(await api.get<unknown>(`/api/products?q=${encodeURIComponent(q)}`))
  } catch {
    return normalizeProducts(await api.get<unknown>(`/api/sale-orders/products?q=${encodeURIComponent(q)}`))
  }
}

/* =============== main =============== */

export function SalesSection({ user }: { user: ClientUser }) {
  const isSalesperson = canUser(user.roles, PERMISSIONS.SALES_FLOOR)
  const isCashier = canUser(user.roles, PERMISSIONS.CASHIER)
  const [tab, setTab] = React.useState(isSalesperson ? 'register' : 'cashier')

  return (
    <div className="space-y-4">
      <SectionHeader
        title="فروش و مشتریان"
        subtitle="ثبت سفارش فروش، صف آماده‌سازی صندوق و پرونده مشتریان"
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-11 bg-card border border-gold/20 flex-wrap h-auto">
          {isSalesperson && (
            <TabsTrigger value="register" className="gap-1.5 px-4 data-[state=active]:bg-olive data-[state=active]:text-white">
              <ShoppingCart className="size-4" /> سفارش فروش
            </TabsTrigger>
          )}
          {isCashier && (
            <TabsTrigger value="cashier" className="gap-1.5 px-4 data-[state=active]:bg-olive data-[state=active]:text-white">
              <ScanLine className="size-4" /> صف آماده‌سازی صندوق
            </TabsTrigger>
          )}
          {isSalesperson && (
            <TabsTrigger value="customers" className="gap-1.5 px-4 data-[state=active]:bg-olive data-[state=active]:text-white">
              <Users className="size-4" /> مشتریان
            </TabsTrigger>
          )}
        </TabsList>
        {isSalesperson && <TabsContent value="register" className="mt-4"><RegisterTab user={user} /></TabsContent>}
        {isCashier && <TabsContent value="cashier" className="mt-4"><CashierTab onNavigateCustomers={() => setTab('customers')} /></TabsContent>}
        {isSalesperson && <TabsContent value="customers" className="mt-4"><CustomersTab /></TabsContent>}
      </Tabs>
    </div>
  )
}

/* =============== salesperson: register tab =============== */

function RegisterTab({ user }: { user: ClientUser }) {
  const { toast } = useToast()
  const [myOrders, setMyOrders] = React.useState<SaleOrder[]>([])
  const [loading, setLoading] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)

  // builder state
  const [items, setItems] = React.useState<SaleItem[]>([])
  const [note, setNote] = React.useState('')
  const [customer, setCustomer] = React.useState<Customer | null>(null)
  const [phone, setPhone] = React.useState('')

  // prefill phone from the picked customer profile (editable)
  React.useEffect(() => {
    if (customer?.phone) setPhone(String(customer.phone))
  }, [customer?.id])

  const load = React.useCallback(async () => {
    try {
      setMyOrders(await api.get<SaleOrder[]>('/api/sale-orders?scope=mine&limit=100'))
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'خطا در دریافت سفارش‌ها', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  React.useEffect(() => { load() }, [load])

  const weekAgoMs = Date.now() - 7 * 24 * 3600 * 1000
  const weekOrders = myOrders.filter((o) => new Date(o.createdAt).getTime() >= weekAgoMs)
  const weekTotal = weekOrders.reduce((s, o) => s + o.total, 0)
  const total = items.reduce((s, i) => s + i.qty * i.price, 0)

  async function submit() {
    if (!items.length) return
    setSubmitting(true)
    try {
      await api.post('/api/sale-orders', {
        customerId: customer?.id,
        customerName: customer?.name || 'مشتری ناشناس',
        customerPhone: phone.trim() || undefined,
        items,
        total,
        note: note || undefined,
      })
      setItems([]); setNote(''); setCustomer(null); setPhone('')
      toast({ title: 'سفارش ثبت شد 🌟', description: 'به صف آماده‌سازی صندوق ارسال شد.' })
      load()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'ثبت سفارش ناموفق بود', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* performance strip */}
      <GlowCard className="p-4 relative overflow-hidden">
        <div className="pattern-olive-branch absolute inset-0 opacity-50" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="size-12 rounded-2xl bg-gold/15 border border-gold/30 flex items-center justify-center">
            <Sparkles className="size-6 text-gold" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="font-extrabold">عملکرد این هفته شما</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              {weekOrders.length > 0
                ? `${toFaDigits(weekOrders.length)} سفارش فروش ثبت کردید با ارزش ${formatMoney(weekTotal)} تومان — دست مریزاد! 👏`
                : 'هنوز سفارشی این هفته ثبت نکرده‌اید. اولین سفارش را ببندید و پیشتاز تیم باشید! 💪'}
            </div>
          </div>
          <div className="flex gap-3">
            <div className="text-center px-4 py-2 rounded-2xl bg-olive/10 border border-olive/25">
              <div className="text-xl font-black text-olive">{toFaDigits(weekOrders.length)}</div>
              <div className="text-[10px] text-muted-foreground">سفارش هفته</div>
            </div>
            <div className="text-center px-4 py-2 rounded-2xl bg-gold/10 border border-gold/30">
              <div className="text-xl font-black text-gold">{toFaDigits(myOrders.length)}</div>
              <div className="text-[10px] text-muted-foreground">مجموع سفارش‌ها</div>
            </div>
          </div>
        </div>
      </GlowCard>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* order builder */}
        <div className="lg:col-span-3 space-y-4">
          <GlowCard className="p-4 space-y-4">
            <div className="font-extrabold flex items-center gap-2"><ShoppingCart className="size-5 text-gold" /> سفارش فروش جدید</div>

            <CustomerPicker value={customer} onChange={setCustomer} />

            <ProductPicker onPick={(p) => {
              setItems((prev) => {
                const idx = prev.findIndex((i) => i.productId === p.id)
                if (idx >= 0) {
                  const next = [...prev]
                  next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
                  return next
                }
                return [...prev, { productId: p.id, name: p.name, qty: 1, price: p.price }]
              })
            }} />

            {/* items */}
            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gold/30 p-4 text-center text-sm text-muted-foreground">
                کالاها را از جستجوی بالا اضافه کنید
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pl-1">
                {items.map((it, idx) => (
                  <div key={`${it.productId}-${idx}`} className="flex items-center gap-2 rounded-xl border border-gold/20 bg-card p-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{it.name}</div>
                      <div className="text-xs text-muted-foreground">{formatMoney(it.price)} × {toFaDigits(it.qty)} = <span className="font-bold text-foreground">{formatMoney(it.price * it.qty)}</span> تومان</div>
                    </div>
                    <div className="flex items-center gap-1" dir="ltr">
                      <Button size="icon" variant="outline" className="size-8" aria-label="کم کردن" onClick={() => setItems((prev) => prev.map((x, j) => (j === idx ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}><Minus className="size-3.5" /></Button>
                      <span className="w-9 text-center font-black">{toFaDigits(it.qty)}</span>
                      <Button size="icon" variant="outline" className="size-8" aria-label="اضافه کردن" onClick={() => setItems((prev) => prev.map((x, j) => (j === idx ? { ...x, qty: x.qty + 1 } : x)))}><Plus className="size-3.5" /></Button>
                    </div>
                    <Button size="icon" variant="ghost" className="size-8 text-red-500" aria-label="حذف" onClick={() => setItems((prev) => prev.filter((_, j) => j !== idx))}><Trash2 className="size-4" /></Button>
                  </div>
                ))}
              </div>
            )}

            <Textarea className="min-h-16" placeholder="یادداشت برای صندوق (اختیاری) — مثلاً: بسته‌بندی کادویی" value={note} onChange={(e) => setNote(e.target.value)} />

            {/* optional customer phone — enables one-tap WhatsApp receipt */}
            <div className="space-y-1.5">
              <Label htmlFor="sale-phone" className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Phone className="size-3" />
                موبایل مشتری (اختیاری — برای ارسال فاکتور در واتساپ)
              </Label>
              <Input
                id="sale-phone"
                dir="ltr"
                inputMode="tel"
                placeholder="0913xxxxxxx"
                value={toFaDigits(phone)}
                onChange={(e) => setPhone(toEnDigits(e.target.value).replace(/[^0-9+]/g, '').slice(0, 13))}
                className="h-10 text-left tabular-nums bg-card"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gold/20 pt-3">
              <div>
                <div className="text-xs text-muted-foreground">مبلغ کل</div>
                <div className="text-2xl font-black text-gold"><Money value={total} /></div>
              </div>
              <Button className="h-12 bg-olive hover:bg-olive/90 font-bold gap-1.5" disabled={!items.length || submitting} onClick={submit}>
                {submitting ? <Loader2 className="size-5 animate-spin" /> : <><CheckCircle2 className="size-5" /> ثبت سفارش فروش</>}
              </Button>
            </div>
          </GlowCard>
        </div>

        {/* my recent orders */}
        <div className="lg:col-span-2">
          <GlowCard className="p-4">
            <div className="font-extrabold flex items-center gap-2 mb-3"><ClipboardList className="size-5 text-olive" /> سفارش‌های من</div>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
            ) : myOrders.length === 0 ? (
              <EmptyState icon="🛍️" title="هنوز سفارشی ثبت نکرده‌اید" description="اولین سفارش فروش را همین امروز ثبت کنید." />
            ) : (
              <div className="space-y-2 max-h-[480px] overflow-y-auto pl-1">
                {myOrders.slice(0, 20).map((o) => (
                  <div key={o.id} className="rounded-xl border border-gold/15 p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm">{o.customerName}</span>
                      <StatusPill status={o.status} />
                    </div>
                    <div className="text-xs text-muted-foreground">{toFaDigits(o.items.length)} قلم — {formatJalaliDateTime(o.createdAt)}</div>
                    <div className="flex items-center justify-between">
                      <span className="font-black text-gold text-sm"><Money value={o.total} /></span>
                      {o.cashierName && <span className="text-[10px] text-muted-foreground">صندوق: {o.cashierName}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlowCard>
        </div>
      </div>
    </div>
  )
}

/* =============== customer picker (builder) =============== */

function CustomerPicker({ value, onChange }: { value: Customer | null; onChange: (c: Customer | null) => void }) {
  const [q, setQ] = React.useState('')
  const [results, setResults] = React.useState<Customer[]>([])
  const [searching, setSearching] = React.useState(false)
  const [addOpen, setAddOpen] = React.useState(false)

  React.useEffect(() => {
    if (value) return
    const t = setTimeout(() => {
      setSearching(true)
      api.get<Customer[]>(`/api/customers?q=${encodeURIComponent(q)}&limit=8`)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(t)
  }, [q, value])

  return (
    <div className="space-y-2">
      <Label>مشتری</Label>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-olive/10 border border-olive/30 px-3 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <User className="size-4 text-olive shrink-0" />
            <div className="min-w-0">
              <div className="font-bold text-sm truncate">{value.name}</div>
              {value.phone && <div className="text-xs text-muted-foreground" dir="ltr">{toFaDigits(value.phone)}</div>}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}><X className="size-4" /> تغییر</Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input className="h-10 pr-9" placeholder="جستجوی نام یا شماره مشتری..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {searching ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-1"><Loader2 className="size-3.5 animate-spin" /> جستجو...</div>
          ) : results.length > 0 ? (
            <div className="rounded-xl border border-gold/20 divide-y divide-gold/10 max-h-40 overflow-y-auto">
              {results.map((c) => (
                <button key={c.id} type="button" className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent text-right" onClick={() => onChange(c)}>
                  <span className="font-bold">{c.name}</span>
                  <span className="text-xs text-muted-foreground" dir="ltr">{c.phone ? toFaDigits(c.phone) : ''} • {toFaDigits(c.points)} امتیاز</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground py-1">مشتری پیدا نشد — بدون عضویت ثبت می‌شود.</div>
          )}
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setAddOpen(true)}>
            <UserPlus className="size-4" /> ثبت مشتری جدید
          </Button>
        </div>
      )}
      <CustomerFormDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={(c) => { onChange(c || null); setAddOpen(false) }}
      />
    </div>
  )
}

/* =============== product picker (builder) =============== */

function ProductPicker({ onPick }: { onPick: (p: Product) => void }) {
  const [q, setQ] = React.useState('')
  const [products, setProducts] = React.useState<Product[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true)
      fetchProducts(q)
        .then(setProducts)
        .catch(() => setProducts([]))
        .finally(() => setLoading(false))
    }, 350)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="space-y-2">
      <Label>افزودن کالا</Label>
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input className="h-10 pr-9" placeholder="نام کالا یا بارکد..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1"><Loader2 className="size-3.5 animate-spin" /> در حال جستجو...</div>
      ) : products.length === 0 ? (
        <div className="text-xs text-muted-foreground py-1">کالایی پیدا نشد.</div>
      ) : (
        <div className="rounded-xl border border-gold/20 divide-y divide-gold/10 max-h-52 overflow-y-auto">
          {products.map((p) => (
            <button key={p.id} type="button" className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-accent text-right" onClick={() => onPick(p)}>
              <span className="font-bold truncate">{p.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">{formatMoney(p.price)} ت</span>
            </button>
          ))}
        </div>
      )}
      <div className="text-[11px] text-muted-foreground flex items-center gap-1"><ScanBarcode className="size-3.5" /> با اسکن بارکد هم می‌توانید جستجو کنید.</div>
    </div>
  )
}

/* =============== cashier tab =============== */

function CashierTab({ onNavigateCustomers }: { onNavigateCustomers: () => void }) {
  const { toast } = useToast()
  const [orders, setOrders] = React.useState<SaleOrder[]>([])
  const [loading, setLoading] = React.useState(true)
  const [open, setOpen] = React.useState<SaleOrder | null>(null)
  const [shareOrder, setShareOrder] = React.useState<SaleOrder | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      const [pending, accepted, cashed] = await Promise.all([
        api.get<SaleOrder[]>('/api/sale-orders?scope=queue&status=PENDING&limit=50'),
        api.get<SaleOrder[]>('/api/sale-orders?scope=queue&status=ACCEPTED&limit=50'),
        api.get<SaleOrder[]>('/api/sale-orders?scope=queue&status=CASHED&limit=50'),
      ])
      setOrders([...pending, ...accepted, ...cashed])
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'خطا در دریافت صف', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  React.useEffect(() => { load() }, [load])

  const pending = orders.filter((o) => o.status === 'PENDING')
  const accepted = orders.filter((o) => o.status === 'ACCEPTED')
  const cashedToday = orders.filter((o) => o.status === 'CASHED' && o.cashedAt && new Date(o.cashedAt).toDateString() === new Date().toDateString())

  async function cash(o: SaleOrder) {
    setBusyId(o.id)
    try {
      await api.patch(`/api/sale-orders/${o.id}`, { action: 'cash' })
      toast({ title: 'تسویه شد 💰', description: `${o.customerName} — ${formatMoney(o.total)} تومان` })
      load()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'عملیات ناموفق بود', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
    )
  }

  return (
    <div className="space-y-5">
      {/* summary */}
      <div className="grid grid-cols-3 gap-2">
        <GlowCard className="p-3 text-center">
          <div className="text-2xl font-black text-amber-600">{toFaDigits(pending.length)}</div>
          <div className="text-[11px] text-muted-foreground">در صف آماده‌سازی</div>
        </GlowCard>
        <GlowCard className="p-3 text-center">
          <div className="text-2xl font-black text-olive">{toFaDigits(accepted.length)}</div>
          <div className="text-[11px] text-muted-foreground">آماده تسویه</div>
        </GlowCard>
        <GlowCard className="p-3 text-center">
          <div className="text-2xl font-black text-emerald-700">{toFaDigits(cashedToday.length)}</div>
          <div className="text-[11px] text-muted-foreground">تسویه امروز</div>
        </GlowCard>
      </div>

      {/* pending queue */}
      <div>
        <h3 className="font-extrabold mb-2 flex items-center gap-2"><ScanLine className="size-4 text-gold" /> صف آماده‌سازی ({toFaDigits(pending.length)})</h3>
        {pending.length === 0 ? (
          <EmptyState icon="🧺" title="صف خالی است" description="وقتی فروشنده‌ای سفارشی ثبت کند، اینجا با نشان «پیش‌ثبت‌شده» می‌بینید." />
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {pending.map((o) => (
              <GlowCard key={o.id} className="p-4 space-y-2.5" interactive>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold">{o.customerName}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 border border-gold/40 text-yellow-800 px-2 py-0.5 text-[10px] font-black">
                    <ScanBarcode className="size-3" /> پیش‌ثبت‌شده
                  </span>
                  <button
                    type="button"
                    aria-label={`ارسال خلاصه سفارش ${o.customerName} به مشتری`}
                    title="ارسال به مشتری"
                    onClick={() => setShareOrder(o)}
                    className="size-8 shrink-0 rounded-full border border-gold/30 bg-card grid place-items-center text-gold hover:bg-gold/10 hover:border-gold/60 transition-colors"
                  >
                    <Share2 className="size-3.5" />
                  </button>
                </div>
                <div className="text-xs text-muted-foreground">{toFaDigits(o.items.length)} قلم — {o.salespersonName ? `فروشنده: ${o.salespersonName}` : ''}</div>
                <div className="flex items-center justify-between">
                  <span className="font-black text-gold"><Money value={o.total} /></span>
                  <span className="text-[10px] text-muted-foreground">{formatJalaliDateTime(o.createdAt)}</span>
                </div>
                <Button className="w-full h-10 bg-olive hover:bg-olive/90 gap-1.5" onClick={() => setOpen(o)}>
                  <ScanBarcode className="size-4" /> بازکردن و تأیید
                </Button>
              </GlowCard>
            ))}
          </div>
        )}
      </div>

      {/* accepted, awaiting cash */}
      <div>
        <h3 className="font-extrabold mb-2 flex items-center gap-2"><Wallet className="size-4 text-olive" /> آماده تسویه ({toFaDigits(accepted.length)})</h3>
        {accepted.length === 0 ? (
          <EmptyState icon="💰" title="سفارش تأییدشده‌ای نیست" description="سفارش‌های تأییدشده برای تسویه نقدی اینجا می‌آیند." />
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {accepted.map((o) => (
              <GlowCard key={o.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold">{o.customerName}</span>
                  <StatusPill status={o.status} />
                  <button
                    type="button"
                    aria-label={`ارسال خلاصه سفارش ${o.customerName} به مشتری`}
                    title="ارسال به مشتری"
                    onClick={() => setShareOrder(o)}
                    className="size-8 shrink-0 rounded-full border border-gold/30 bg-card grid place-items-center text-gold hover:bg-gold/10 hover:border-gold/60 transition-colors"
                  >
                    <Share2 className="size-3.5" />
                  </button>
                </div>
                <div className="text-xs text-muted-foreground">{toFaDigits(o.items.length)} قلم — پیش‌ثبت‌شده برای صندوق هلو</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-gold"><Money value={o.total} /></span>
                  <Button size="sm" className="h-9 bg-emerald-700 hover:bg-emerald-800 gap-1" disabled={busyId === o.id} onClick={() => cash(o)}>
                    <BadgeCheck className="size-4" /> تسویه شد 💰
                  </Button>
                </div>
              </GlowCard>
            ))}
          </div>
        )}
      </div>

      <QueueDialog order={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load(); toast({ title: 'به صندوق هلو ارسال شد 🧾', description: 'این سفارش برای ثبت در صندوق هلو آماده است.' }) }} />
      <SaleShareDialog order={shareOrder} onClose={() => setShareOrder(null)} />
      {pending.length === 0 && accepted.length === 0 && (
        <div className="text-center text-sm text-muted-foreground">
          مشتری جدیدی دارید؟ <button className="text-olive font-bold underline" onClick={onNavigateCustomers}>پرونده مشتریان</button> را ببینید.
        </div>
      )}
    </div>
  )
}

/* =============== cashier queue dialog =============== */

function QueueDialog({ order, onClose, onDone }: { order: SaleOrder | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast()
  const [items, setItems] = React.useState<SaleItem[]>([])
  const [busy, setBusy] = React.useState(false)
  const [q, setQ] = React.useState('')
  const [products, setProducts] = React.useState<Product[]>([])

  React.useEffect(() => {
    if (order) setItems(order.items.map((i) => ({ ...i })))
  }, [order])

  React.useEffect(() => {
    if (!order) return
    const t = setTimeout(() => {
      fetchProducts(q).then(setProducts).catch(() => setProducts([]))
    }, 350)
    return () => clearTimeout(t)
  }, [q, order])

  const total = items.reduce((s, i) => s + i.qty * i.price, 0)

  async function accept() {
    if (!order) return
    setBusy(true)
    try {
      await api.patch(`/api/sale-orders/${order.id}`, { action: 'accept', items })
      onDone()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'عملیات ناموفق بود', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanBarcode className="size-5 text-gold" /> بازبینی سفارش {order?.customerName}
          </DialogTitle>
          <DialogDescription>
            اقلام پیش‌ثبت‌شده را کنترل و اصلاح کنید، سپس به صندوق هلو ارسال کنید.
          </DialogDescription>
        </DialogHeader>
        {order && (
          <div className="space-y-4">
            {order.note && <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm">📝 یادداشت فروشنده: {order.note}</div>}
            <div className="space-y-2 max-h-60 overflow-y-auto pl-1">
              {items.map((it, idx) => (
                <div key={`${it.productId}-${idx}`} className="flex items-center gap-2 rounded-xl border border-gold/20 bg-card p-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{it.name}</div>
                    <div className="text-xs text-muted-foreground">{formatMoney(it.price)} × {toFaDigits(it.qty)} = <span className="font-bold">{formatMoney(it.price * it.qty)}</span></div>
                  </div>
                  <div className="flex items-center gap-1" dir="ltr">
                    <Button size="icon" variant="outline" className="size-8" aria-label="کم کردن" onClick={() => setItems((prev) => prev.map((x, j) => (j === idx ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}><Minus className="size-3.5" /></Button>
                    <span className="w-9 text-center font-black">{toFaDigits(it.qty)}</span>
                    <Button size="icon" variant="outline" className="size-8" aria-label="اضافه کردن" onClick={() => setItems((prev) => prev.map((x, j) => (j === idx ? { ...x, qty: x.qty + 1 } : x)))}><Plus className="size-3.5" /></Button>
                  </div>
                  <Button size="icon" variant="ghost" className="size-8 text-red-500" aria-label="حذف" onClick={() => setItems((prev) => prev.filter((_, j) => j !== idx))}><Trash2 className="size-4" /></Button>
                </div>
              ))}
            </div>
            {/* add product */}
            <div className="space-y-2">
              <Label>افزودن کالا</Label>
              <Input className="h-10" placeholder="نام کالا یا بارکد..." value={q} onChange={(e) => setQ(e.target.value)} />
              {products.length > 0 && (
                <div className="rounded-xl border border-gold/20 divide-y divide-gold/10 max-h-36 overflow-y-auto">
                  {products.filter((p) => !items.some((i) => i.productId === p.id)).slice(0, 6).map((p) => (
                    <button key={p.id} type="button" className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent text-right" onClick={() => setItems((prev) => [...prev, { productId: p.id, name: p.name, qty: 1, price: p.price }])}>
                      <span className="font-bold truncate">{p.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{formatMoney(p.price)} ت</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-gold/20 pt-3">
              <div>
                <div className="text-xs text-muted-foreground">مبلغ نهایی</div>
                <div className="text-2xl font-black text-gold"><Money value={total} /></div>
              </div>
              <Button className="h-12 bg-olive hover:bg-olive/90 font-bold gap-1.5" disabled={!items.length || busy} onClick={accept}>
                {busy ? <Loader2 className="size-5 animate-spin" /> : <><CheckCircle2 className="size-5" /> تأیید و ارسال به صندوق هلو</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* =============== customers tab =============== */

function CustomersTab() {
  const { toast } = useToast()
  const [q, setQ] = React.useState('')
  const [customers, setCustomers] = React.useState<Customer[]>([])
  const [loading, setLoading] = React.useState(true)
  const [addOpen, setAddOpen] = React.useState(false)
  const [detail, setDetail] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setCustomers(await api.get<Customer[]>(`/api/customers?q=${encodeURIComponent(q)}&limit=100`))
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'خطا در دریافت مشتریان', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [q, toast])

  React.useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  return (
    <div className="space-y-3">
      <BirthdayStrip customers={customers} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input className="h-11 pr-9" placeholder="جستجوی نام یا شماره مشتری..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button className="h-11 bg-olive hover:bg-olive/90 gap-1.5" onClick={() => setAddOpen(true)}>
          <UserPlus className="size-4.5" /> مشتری جدید
        </Button>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : customers.length === 0 ? (
        <EmptyState icon="🤝" title="مشتری‌ای پیدا نشد" description="اولین مشتری را با دکمه «مشتری جدید» ثبت کنید." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {customers.map((c) => (
            <GlowCard key={c.id} className="p-4 space-y-2 cursor-pointer card-hover-lift" interactive>
              <button type="button" className="w-full text-right space-y-2" onClick={() => setDetail(c.id)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold flex items-center gap-1.5"><User className="size-4 text-olive" /> {c.name}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 text-yellow-800 border border-gold/30 px-2 py-0.5 text-[10px] font-black">
                    <Star className="size-3" /> {toFaDigits(c.points)} امتیاز
                  </span>
                </div>
                {c.phone && <div className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="size-3" /> <span dir="ltr">{toFaDigits(c.phone)}</span></div>}
                {c.birthday && <div className="text-xs text-muted-foreground flex items-center gap-1"><Cake className="size-3" /> تولد: {toFaDigits(c.birthday)}</div>}
                {c.preferences && (
                  <div className="flex flex-wrap gap-1">
                    {c.preferences.split('،').filter(Boolean).slice(0, 3).map((p, i) => (
                      <span key={i} className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{p.trim()}</span>
                    ))}
                  </div>
                )}
              </button>
            </GlowCard>
          ))}
        </div>
      )}

      <CustomerFormDialog open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load() }} />
      <CustomerDetailDialog id={detail} onClose={() => setDetail(null)} onEditSaved={load} />
    </div>
  )
}

/* =============== customer form (add/edit) =============== */

/** Upcoming customer birthdays (today + next 7 days), computed client-side from loaded customers */
function BirthdayStrip({ customers }: { customers: Customer[] }) {
  const rows = React.useMemo(() => {
    const today = todayJalali()
    const mdOf = (j: string) => j.slice(5)
    const todayMd = mdOf(today)
    const out: { c: Customer; label: string; isToday: boolean }[] = []
    for (const c of customers) {
      if (!c.birthday) continue
      if (mdOf(c.birthday) === todayMd) { out.push({ c, label: 'امروز 🎉', isToday: true }); continue }
      for (let off = 1; off <= 7; off++) {
        if (mdOf(c.birthday) === mdOf(addDaysJalali(today, off))) {
          out.push({ c, label: off === 1 ? 'فردا' : `${toFaDigits(off)} روز دیگر`, isToday: false })
          break
        }
      }
    }
    return out.sort((a, b) => Number(b.isToday) - Number(a.isToday))
  }, [customers])

  if (rows.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-rose-200/80 bg-rose-50/50 dark:border-rose-900/60 dark:bg-rose-950/20 px-3.5 py-2.5 animate-in fade-in slide-in-from-top-1">
      <span className="text-lg" aria-hidden>🎂</span>
      <span className="text-xs font-extrabold text-rose-700 dark:text-rose-300">تولدهای نزدیک:</span>
      {rows.map(({ c, label, isToday }) => {
        const wa = waTarget(c.phone)
        const text = isToday
          ? `سلام ${c.name} عزیز! 🎂 تولدت مبارک — از طرف خانوادهٔ هایپر زیتون 🎁🌿`
          : `سلام ${c.name} عزیز! تولدت پیشاپیش مبارک 🎂 — منتظر دیدارتیم در هایپر زیتون 🌿`
        const chipCls = cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all',
          isToday ? 'bg-rose-500 text-white border-rose-500 shadow-sm' : 'bg-white dark:bg-rose-900/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300',
          wa && 'hover:scale-105 hover:shadow-md hover:ring-2 hover:ring-emerald-400/60 cursor-pointer'
        )
        const inner = (
          <>
            <Cake className="size-3" /> {c.name}
            <span className={cn('text-[10px]', isToday ? 'text-rose-100' : 'text-rose-500 dark:text-rose-400')}>• {label}</span>
            {wa && <Send className="size-3 opacity-70 shrink-0" />}
          </>
        )
        return wa ? (
          <a
            key={c.id}
            href={`https://wa.me/${wa}?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={chipCls}
            title={`تبریک واتساپ به ${c.name} — ${toFaDigits(c.phone || '')}`}
            aria-label={`ارسال پیام تبریک تولد به ${c.name} در واتساپ`}
          >
            {inner}
          </a>
        ) : (
          <span key={c.id} className={chipCls} title="شماره موبایل ثبت نشده — امکان پیام نیست">
            {inner}
          </span>
        )
      })}
    </div>
  )
}

function CustomerFormDialog({ open, onClose, onSaved, edit }: {
  open: boolean
  onClose: () => void
  onSaved: (c?: Customer) => void
  edit?: Customer | null
}) {
  const { toast } = useToast()
  const [busy, setBusy] = React.useState(false)
  const [name, setName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [birthday, setBirthday] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [prefs, setPrefs] = React.useState<string[]>([])
  const [prefInput, setPrefInput] = React.useState('')

  React.useEffect(() => {
    if (open) {
      setName(edit?.name || '')
      setPhone(edit?.phone || '')
      setBirthday(edit?.birthday || '')
      setNotes(edit?.notes || '')
      setPrefs(edit?.preferences ? edit.preferences.split('،').map((s) => s.trim()).filter(Boolean) : [])
      setPrefInput('')
    }
  }, [open, edit])

  async function save() {
    if (!name.trim()) {
      toast({ title: 'خطا', description: 'نام مشتری الزامی است', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      const payload = { name, phone: phone || null, birthday: birthday || null, preferences: prefs, notes: notes || null }
      if (edit) {
        const c = await api.patch<Customer>(`/api/customers/${edit.id}`, payload)
        toast({ title: 'ذخیره شد ✅', description: 'پرونده مشتری به‌روزرسانی شد.' })
        onSaved(c)
      } else {
        const c = await api.post<Customer>('/api/customers', payload)
        toast({ title: 'مشتری ثبت شد 🤝', description: `${name} به پرونده مشتریان اضافه شد.` })
        onSaved(c)
      }
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : 'ثبت ناموفق بود', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="size-5 text-gold" /> {edit ? 'ویرایش مشتری' : 'ثبت مشتری جدید'}</DialogTitle>
          <DialogDescription>اطلاعات تماس و سلیقه مشتری را نگه دارید تا فروش بهتری داشته باشید.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>نام و نام خانوادگی *</Label>
            <Input className="h-11" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً خانم احمدی" />
          </div>
          <div className="space-y-1.5">
            <Label>شماره تماس</Label>
            <Input className="h-11" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0913..." />
          </div>
          <div className="space-y-1.5">
            <Label>تولد (اختیاری — برای تبریک و تخفیف)</Label>
            <JalaliDatePicker value={birthday} onChange={setBirthday} placeholder="انتخاب تاریخ تولد" />
          </div>
          <div className="space-y-1.5">
            <Label>سلیقه‌ها (برند، طعم، دستهٔ محبوب...)</Label>
            <div className="flex gap-2">
              <Input
                className="h-10"
                value={prefInput}
                onChange={(e) => setPrefInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && prefInput.trim()) {
                    e.preventDefault()
                    setPrefs((p) => [...new Set([...p, prefInput.trim()])])
                    setPrefInput('')
                  }
                }}
                placeholder="مثلاً: برند گلرنگ، شکلات تلخ، و Enter"
              />
              <Button
                variant="outline"
                className="h-10 shrink-0"
                onClick={() => {
                  if (prefInput.trim()) { setPrefs((p) => [...new Set([...p, prefInput.trim()])]); setPrefInput('') }
                }}
              >
                <Plus className="size-4" />
              </Button>
            </div>
            {prefs.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {prefs.map((p) => (
                  <span key={p} className="inline-flex items-center gap-1 rounded-full bg-olive/10 border border-olive/30 px-2.5 py-1 text-xs font-bold text-olive">
                    {p}
                    <button type="button" onClick={() => setPrefs((prev) => prev.filter((x) => x !== p))} aria-label={`حذف ${p}`}><X className="size-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>یادداشت</Label>
            <Textarea className="min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثلاً: پارکینگ دارد، همیشه کارت می‌کشد..." />
          </div>
          <Button className="w-full h-12 bg-olive hover:bg-olive/90 font-bold" disabled={busy || !name.trim()} onClick={save}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : edit ? 'ذخیره تغییرات' : 'ثبت مشتری'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* =============== customer detail =============== */

function CustomerDetailDialog({ id, onClose, onEditSaved }: { id: string | null; onClose: () => void; onEditSaved: () => void }) {
  const [customer, setCustomer] = React.useState<Customer | null>(null)
  const [orders, setOrders] = React.useState<SaleOrder[]>([])
  const [loading, setLoading] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)

  React.useEffect(() => {
    if (!id) { setCustomer(null); setOrders([]); return }
    setLoading(true)
    api.get<{ customer: Customer; orders: SaleOrder[] }>(`/api/customers/${id}`)
      .then((d) => { setCustomer(d.customer); setOrders(d.orders) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><User className="size-5 text-gold" /> پرونده مشتری</DialogTitle>
        </DialogHeader>
        {loading || !customer ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-gold/25 bg-gold/5 p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">نام:</span><span className="font-extrabold">{customer.name}</span></div>
              {customer.phone && <div className="flex justify-between"><span className="text-muted-foreground">تلفن:</span><span dir="ltr">{toFaDigits(customer.phone)}</span></div>}
              {customer.birthday && <div className="flex justify-between"><span className="text-muted-foreground">تولد:</span><span>{toFaDigits(customer.birthday)}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">امتیاز:</span><span className="font-black text-gold">{toFaDigits(customer.points)} ⭐</span></div>
              {customer.preferences && <div className="flex flex-wrap gap-1 pt-1">{customer.preferences.split('،').filter(Boolean).map((p, i) => <Badge key={i} variant="secondary" className="text-[10px]">{p.trim()}</Badge>)}</div>}
              {customer.notes && <div className="text-xs text-muted-foreground pt-1">{customer.notes}</div>}
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm font-extrabold">تاریخچه سفارش‌ها ({toFaDigits(orders.length)})</div>
              <Button variant="outline" size="sm" className="h-8" onClick={() => setEditOpen(true)}>ویرایش</Button>
            </div>
            {orders.length === 0 ? (
              <div className="text-xs text-muted-foreground">هنوز سفارشی برای این مشتری ثبت نشده است.</div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pl-1">
                {orders.map((o) => (
                  <div key={o.id} className="rounded-xl border border-gold/15 p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <StatusPill status={o.status} />
                      <span className="text-[10px] text-muted-foreground">{formatJalaliDateTime(o.createdAt)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{toFaDigits(o.items.length)} قلم: {o.items.slice(0, 3).map((i) => `${i.name} ×${toFaDigits(i.qty)}`).join('، ')}{o.items.length > 3 ? '…' : ''}</div>
                    <div className="font-black text-gold text-sm"><Money value={o.total} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {customer && (
          <CustomerFormDialog
            open={editOpen}
            edit={customer}
            onClose={() => setEditOpen(false)}
            onSaved={() => { setEditOpen(false); if (id) api.get<{ customer: Customer; orders: SaleOrder[] }>(`/api/customers/${id}`).then((d) => setCustomer(d.customer)).catch(() => {}); onEditSaved() }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
