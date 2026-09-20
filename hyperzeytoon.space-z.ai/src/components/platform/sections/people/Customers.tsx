'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/store/app'
import { useToast } from '@/hooks/use-toast'
import { SectionHeader, EmptyState, LoadingBlock, UserAvatar, StatusBadge, ConfirmButton } from '@/components/platform/ui/shared'
import { money, timeAgo, toFaDigits } from '@/lib/jalali'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Users, Search, Plus, Loader2, Minus, ShoppingBasket, Send, Phone, Sparkles, CheckCircle2, Footprints } from 'lucide-react'

interface CustomerDTO {
  id: string
  name: string
  phone?: string | null
  favoriteProducts?: string | null
  tasteNotes?: string | null
  visits: number
  points: number
  salespersonName?: string | null
  salespersonColor?: string | null
}

interface OrderItemDTO {
  productId?: string
  name: string
  qty: number
  price: number
}

interface CustomerOrderDTO {
  id: string
  customerId?: string | null
  customerName?: string | null
  salespersonId: string
  status: string
  items: OrderItemDTO[]
  total: number
  note?: string | null
  createdAt: string
  sentAt?: string | null
}

interface ProductLite {
  id: string
  name: string
  sellPrice: number
  unit: string
  stock: number
}

const ORDER_STATUSES = [
  { key: 'PREPARING', label: 'در حال آماده‌سازی', color: '#D9832E' },
  { key: 'SENT_TO_CASHIER', label: 'ارسال به صندوق', color: '#C9A227' },
  { key: 'COMPLETED', label: 'پرداخت شد', color: '#3E7C59' },
  { key: 'CANCELLED', label: 'لغو شد', color: '#B33A3A' },
]

function statusInfo(key: string) {
  return ORDER_STATUSES.find((s) => s.key === key) ?? { key, label: key, color: '#8A8F98' }
}

export function Customers() {
  const { user } = useApp()
  const { toast } = useToast()
  const canSell = !!user && (user.isManager || user.roleKeys.some((k) => ['sales', 'cashier'].includes(k)))
  const isSales = !!user && (user.isManager || user.roleKeys.includes('sales'))
  const isCashier = !!user && (user.isManager || user.roleKeys.includes('cashier'))

  const [customers, setCustomers] = React.useState<CustomerDTO[] | null>(null)
  const [query, setQuery] = React.useState('')
  const [detail, setDetail] = React.useState<CustomerDTO | null>(null)
  const [newOpen, setNewOpen] = React.useState(false)
  const [orders, setOrders] = React.useState<CustomerOrderDTO[]>([])
  const [ordersLoaded, setOrdersLoaded] = React.useState(false)

  const load = React.useCallback(async (q?: string) => {
    try {
      const d = await api<{ customers: CustomerDTO[] }>(`/api/customers${q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
      setCustomers(d.customers)
    } catch {
      setCustomers([])
    }
  }, [])

  const loadOrders = React.useCallback(async () => {
    try {
      const d = await api<{ orders: CustomerOrderDTO[] }>('/api/customer-orders')
      setOrders(d.orders)
      setOrdersLoaded(true)
    } catch {
      setOrdersLoaded(true)
    }
  }, [])

  React.useEffect(() => { load() }, [load])
  React.useEffect(() => {
    if (canSell) loadOrders()
  }, [canSell, loadOrders])

  // debounced search
  React.useEffect(() => {
    const t = setTimeout(() => load(query), 350)
    return () => clearTimeout(t)
  }, [query, load])

  const registerVisit = async (c: CustomerDTO) => {
    try {
      await api(`/api/customers/${c.id}`, { method: 'PATCH', body: { incrementVisit: true } })
      toast({ title: 'بازدید ثبت شد 🌿', description: `${c.name} امروز سر زد — خوشحالیم!` })
      setDetail(null)
      load(query)
    } catch (e) {
      toast({ title: 'ثبت نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  const cashierQueue = orders.filter((o) => o.status === 'SENT_TO_CASHIER')
  const activeBaskets = orders.filter((o) => o.status === 'PREPARING')

  return (
    <div className="space-y-4">
      <SectionHeader
        title="مشتریان و فروش"
        subtitle="مشتری‌های خاص ما — با سلیقه‌ها و علایقشان"
        icon={<Users className="h-5 w-5" />}
        actions={canSell ? (
          <Button size="sm" className="gap-1.5" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> مشتری جدید
          </Button>
        ) : undefined}
      />

      {canSell && (
        <Tabs defaultValue="book" dir="rtl">
          <TabsList className="w-full md:w-auto flex-wrap h-auto">
            <TabsTrigger value="book" className="flex-1 md:flex-none">دفتر مشتریان</TabsTrigger>
            {isSales && <TabsTrigger value="builder" className="flex-1 md:flex-none">سبد فروش سریع 🧺</TabsTrigger>}
            {(isCashier || isSales) && (
              <TabsTrigger value="queue" className="flex-1 md:flex-none">
                صندوق {cashierQueue.length > 0 && <Badge className="ms-1 rounded-full bg-gold text-white num">{toFaDigits(cashierQueue.length)}</Badge>}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="book" className="mt-3">
            <CustomerBook
              customers={customers}
              query={query}
              setQuery={setQuery}
              onOpen={(c) => setDetail(c)}
            />
          </TabsContent>

          {isSales && (
            <TabsContent value="builder" className="mt-3">
              <PreCheckoutBuilder onSent={() => { loadOrders(); toast({ title: 'سبد به صندوق رفت ✨' }) }} />
            </TabsContent>
          )}

          {(isCashier || isSales) && (
            <TabsContent value="queue" className="mt-3">
              <CashierQueue
                orders={ordersLoaded ? cashierQueue : []}
                loading={!ordersLoaded}
                activeBaskets={ordersLoaded ? activeBaskets : []}
                isCashier={isCashier}
                onChanged={loadOrders}
              />
            </TabsContent>
          )}
        </Tabs>
      )}

      {!canSell && <CustomerBook customers={customers} query={query} setQuery={setQuery} onOpen={(c) => setDetail(c)} />}

      {/* customer detail */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <UserAvatar name={detail.name} color={detail.salespersonColor ?? '#3E7C59'} size={44} />
                  <div>
                    {detail.name}
                    {detail.phone && (
                      <p className="text-xs text-muted-foreground font-normal num mt-0.5 flex items-center gap-1" dir="ltr">
                        <Phone className="h-3 w-3" /> {toFaDigits(detail.phone)}
                      </p>
                    )}
                  </div>
                </DialogTitle>
                <DialogDescription className="text-right">
                  {toFaDigits(detail.visits)} بازدید ثبت‌شده · {toFaDigits(detail.points)} امتیاز
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {detail.favoriteProducts && (
                  <div>
                    <p className="text-xs font-bold text-muted-foreground mb-1.5">کالاهای مورد علاقه:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.favoriteProducts.split('،').map((p, i) => (
                        <Badge key={i} variant="secondary" className="rounded-full">{p.trim()}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {detail.tasteNotes && (
                  <div className="rounded-xl bg-accent p-3 text-xs leading-5">
                    <span className="font-bold text-primary">سلیقه مشتری: </span>{detail.tasteNotes}
                  </div>
                )}
                {detail.salespersonName && (
                  <p className="text-xs text-muted-foreground">بازاریاب: {detail.salespersonName}</p>
                )}
                <Button className="w-full h-11 gap-1.5" onClick={() => registerVisit(detail)}>
                  <Footprints className="h-4 w-4" /> +۱ بازدید ثبت کن
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <NewCustomerDialog open={newOpen} onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); load(query) }} />
    </div>
  )
}

function CustomerBook({
  customers, query, setQuery, onOpen,
}: {
  customers: CustomerDTO[] | null
  query: string
  setQuery: (v: string) => void
  onOpen: (c: CustomerDTO) => void
}) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جستجو با نام یا شماره تلفن…"
          className="w-full h-12 rounded-2xl border border-input bg-card pr-12 pl-4 text-sm outline-none focus:ring-2 focus:ring-ring/40"
        />
      </div>
      {!customers ? <LoadingBlock rows={3} /> : customers.length === 0 ? (
        <EmptyState
          icon={<Sparkles />}
          title={query ? 'مشتری‌ای با این مشخصات پیدا نشد' : 'دفتر مشتریان خالی است'}
          description={query ? 'شاید با شماره دیگری ثبت شده؛ دوباره جستجو کن.' : 'اولین مشتری را با «مشتری جدید» ثبت کن تا سلیقه‌هایش را یادداشت کنیم.'}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {customers.map((c) => (
            <button key={c.id} onClick={() => onOpen(c)} className="text-right focus-visible:ring-2 focus-visible:ring-ring rounded-2xl">
              <Card className="glow-border-static h-full transition-transform hover:-translate-y-0.5">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar name={c.name} color={c.salespersonColor ?? '#3E7C59'} size={38} />
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{c.name}</p>
                        {c.phone && <p className="text-[11px] text-muted-foreground num" dir="ltr">{toFaDigits(c.phone)}</p>}
                      </div>
                    </div>
                    <Badge variant="secondary" className="rounded-full num shrink-0">{toFaDigits(c.visits)} بازدید</Badge>
                  </div>
                  {c.favoriteProducts && (
                    <p className="text-xs text-muted-foreground truncate">💚 {c.favoriteProducts}</p>
                  )}
                  {c.tasteNotes && <p className="text-[11px] text-muted-foreground truncate">🏷 {c.tasteNotes}</p>}
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function NewCustomerDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [name, setName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await api('/api/customers', { body: { name, phone: phone || undefined } })
      toast({ title: 'مشتری ثبت شد 🌿', description: 'حالا سلیقه‌هایش را در جزئیاتش یادداشت کن.' })
      setName('')
      setPhone('')
      onSaved()
    } catch (e) {
      toast({ title: 'ثبت نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>مشتری جدید</DialogTitle>
          <DialogDescription>حداقل همین دو فیلد کافی است — بقیه را بعداً تکمیل می‌کنیم.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>نام مشتری</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: خانم رضایی" />
          </div>
          <div className="space-y-1.5">
            <Label>شماره تلفن (اختیاری)</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" dir="ltr" className="num text-left" placeholder="0913…" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>انصراف</Button>
            <Button onClick={save} disabled={saving || !name.trim()} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} ذخیره
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------- pre-checkout builder (sales + managers) ----------
function PreCheckoutBuilder({ onSent }: { onSent: () => void }) {
  const { toast } = useToast()
  const [customers, setCustomers] = React.useState<CustomerDTO[]>([])
  const [customerId, setCustomerId] = React.useState('')
  const [products, setProducts] = React.useState<ProductLite[] | null>(null)
  const [pQuery, setPQuery] = React.useState('')
  const [cart, setCart] = React.useState<OrderItemDTO[]>([])
  const [note, setNote] = React.useState('')
  const [sending, setSending] = React.useState(false)

  React.useEffect(() => {
    api<{ customers: CustomerDTO[] }>('/api/customers')
      .then((d) => setCustomers(d.customers))
      .catch(() => setCustomers([]))
  }, [])

  React.useEffect(() => {
    api<{ products: ProductLite[] }>(`/api/products?q=${encodeURIComponent(pQuery)}&limit=24`)
      .then((d) => setProducts(d.products))
      .catch(() => setProducts([]))
  }, [pQuery])

  const addToCart = (p: ProductLite) => {
    setCart((prev) => {
      const found = prev.find((i) => i.productId === p.id)
      if (found) return prev.map((i) => (i.productId === p.id ? { ...i, qty: i.qty + 1 } : i))
      return [...prev, { productId: p.id, name: p.name, qty: 1, price: p.sellPrice }]
    })
  }
  const changeQty = (productId: string | undefined, delta: number) => {
    if (!productId) return
    setCart((prev) =>
      prev
        .map((i) => (i.productId === productId ? { ...i, qty: Math.max(0, i.qty + delta) } : i))
        .filter((i) => i.qty > 0)
    )
  }
  const total = cart.reduce((s, i) => s + i.qty * i.price, 0)

  const send = async () => {
    if (cart.length === 0) return
    setSending(true)
    try {
      await api('/api/customer-orders', {
        body: { customerId: customerId || undefined, items: cart, total, note, sendToCashier: true },
      })
      setCart([])
      setNote('')
      setCustomerId('')
      onSent()
    } catch (e) {
      toast({ title: 'ارسال نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_22rem] gap-4 items-start">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={pQuery} onChange={(e) => setPQuery(e.target.value)} placeholder="جستجوی کالا برای افزودن به سبد…" className="pr-10 h-11" />
          </div>
          {!products ? <LoadingBlock rows={2} /> : products.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              کالایی پیدا نشد{products.length === 0 && !pQuery ? ' — ماژول محصولات هنوز فعال نشده است.' : ''}
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-96 overflow-y-auto nice-scroll">
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="rounded-xl border bg-card p-3 text-right hover:bg-accent transition-colors min-h-20"
                >
                  <p className="text-xs font-bold leading-5 line-clamp-2">{p.name}</p>
                  <p className="text-[11px] text-gold font-bold mt-1.5 num">{money(p.sellPrice)} تومان</p>
                  <p className="text-[10px] text-muted-foreground num">{toFaDigits(p.stock)} {p.unit}</p>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glow-border-static lg:sticky lg:top-4">
        <CardContent className="p-4 space-y-3">
          <p className="font-bold text-sm flex items-center gap-2">
            <ShoppingBasket className="h-4 w-4 text-primary" /> سبد مشتری
          </p>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full h-10 rounded-xl border border-input bg-card px-3 text-sm"
          >
            <option value="">— مشتری (بدون نام / عادی) —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ''}</option>
            ))}
          </select>
          <div className="space-y-2 max-h-56 overflow-y-auto nice-scroll">
            {cart.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">از بالا کالا اضافه کن 🛒</p>}
            {cart.map((i) => (
              <div key={i.productId} className="flex items-center justify-between gap-2 rounded-xl bg-accent/60 p-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{i.name}</p>
                  <p className="text-[10px] text-muted-foreground num">{money(i.price)} تومان</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => changeQty(i.productId, -1)}>
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-8 text-center text-sm font-bold num">{toFaDigits(i.qty)}</span>
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => changeQty(i.productId, 1)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-xl bg-accent p-3">
            <span className="text-sm">جمع کل</span>
            <span className="font-extrabold num text-primary">{money(total)} تومان</span>
          </div>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="یادداشت برای صندوق (اختیاری)" className="text-xs" />
          <Button className="w-full h-12 gap-1.5" onClick={send} disabled={sending || cart.length === 0}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            ارسال به صندوق
          </Button>
          <p className="text-[10px] text-muted-foreground leading-4 text-center">
            صندوق‌دار فقط جمع می‌زند و پرداخت را می‌گیرد؛ مشتری سریع‌تر راه می‌افتد ✨
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------- cashier queue ----------
function CashierQueue({
  orders, loading, activeBaskets, isCashier, onChanged,
}: {
  orders: CustomerOrderDTO[]
  loading: boolean
  activeBaskets: CustomerOrderDTO[]
  isCashier: boolean
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const update = async (o: CustomerOrderDTO, status: string, msg: string) => {
    setBusyId(o.id)
    try {
      await api(`/api/customer-orders/${o.id}`, { method: 'PATCH', body: { status } })
      toast({ title: msg })
      onChanged()
    } catch (e) {
      toast({ title: 'انجام نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const sendToCashier = (o: CustomerOrderDTO) => update(o, 'SENT_TO_CASHIER', 'سبد به صندوق ارسال شد 🧺')
  const complete = (o: CustomerOrderDTO) => update(o, 'COMPLETED', 'پرداخت کامل شد ✅ ممنون از سرعتت!')
  const cancel = (o: CustomerOrderDTO) => update(o, 'CANCELLED', 'سبد لغو شد')

  if (loading) return <LoadingBlock rows={3} />
  return (
    <div className="space-y-4">
      {orders.length === 0 ? (
        <EmptyState icon={<CheckCircle2 />} title="صف صندوق خالی است" description="سبد جدیدی از بخش «سبد فروش سریع» بفرست تا اینجا ظاهر شود." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((o) => (
            <Card key={o.id} className="border-gold/50">
              <CardContent className="p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-sm">{o.customerName || 'مشتری عادی'}</p>
                  <StatusBadge label={statusInfo(o.status).label} color={statusInfo(o.status).color} />
                </div>
                <div className="space-y-1 max-h-36 overflow-y-auto nice-scroll">
                  {o.items.map((i, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate">{i.name}</span>
                      <span className="num shrink-0">{toFaDigits(i.qty)} × {money(i.price)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between rounded-xl bg-accent p-2.5">
                  <span className="text-xs">جمع</span>
                  <span className="font-extrabold num text-primary text-sm">{money(o.total)} تومان</span>
                </div>
                {o.note && <p className="text-[11px] text-muted-foreground">📝 {o.note}</p>}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {isCashier && (
                    <>
                      <Button size="sm" className="h-10 gap-1" disabled={busyId === o.id} onClick={() => complete(o)}>
                        <CheckCircle2 className="h-4 w-4" /> تکمیل شد
                      </Button>
                      <ConfirmButton onConfirm={() => cancel(o)} confirmText="لغو سبد؟" variant="outline" className="h-10">
                        لغو
                      </ConfirmButton>
                    </>
                  )}
                  {!isCashier && (
                    <>
                      <span />
                      <ConfirmButton onConfirm={() => cancel(o)} confirmText="لغو سبد؟" variant="outline" className="h-10">
                        لغو
                      </ConfirmButton>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {activeBaskets.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-muted-foreground px-1">سبدهای در حال آماده‌سازی:</p>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {activeBaskets.map((o) => (
              <Card key={o.id}>
                <CardContent className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{o.customerName || 'مشتری عادی'}</p>
                    <p className="text-[10px] text-muted-foreground num">{toFaDigits(o.items.length)} قلم · {timeAgo(o.createdAt)}</p>
                  </div>
                  {isCashier ? (
                    <span className="text-[10px] text-muted-foreground shrink-0">در حال چیدن…</span>
                  ) : (
                    <Button size="sm" variant="outline" className="h-9 shrink-0 gap-1" disabled={busyId === o.id} onClick={() => sendToCashier(o)}>
                      <Send className="h-3.5 w-3.5" /> ارسال به صندوق
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
