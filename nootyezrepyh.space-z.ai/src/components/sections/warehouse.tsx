'use client'

import * as React from 'react'
import { api, ClientUser } from '@/lib/api-client'
import { SectionHeader, EmptyState, GlowCard, StockBadge } from '@/components/zeytoon-ui'
import { toFaDigits, formatJalaliDateTime } from '@/lib/jalali'
import { canUser, PERMISSIONS, STOCK_STATUS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  Plus, Search, Warehouse, Loader2, CheckCircle2, Package, Minus,
  Users, Lightbulb, Truck, PackageCheck, Send, ClipboardCheck, ArrowLeft,
} from 'lucide-react'

// ================= Types =================

interface ProductLite {
  id: string
  name: string
  stock: number
  minStock: number
  unit: string
  price: number
  image?: string | null
}

interface WarehouseRequest {
  id: string
  productId: string
  productName: string
  quantity: number
  requestedById: string
  requestedByName?: string
  preparedByName?: string
  status: 'PENDING' | 'PREPARED' | 'SENT' | 'RECEIVED'
  createdAt: string
  updatedAt: string
}

interface CustomerRequest {
  id: string
  productName: string
  details?: string | null
  count: number
  requestedById: string
  requestedByName?: string
  status: 'OPEN' | 'ORDERED' | 'RESOLVED'
  createdAt: string
}

interface ProductRequest {
  id: string
  productName: string
  details?: string | null
  suggestedById: string
  suggestedByName?: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  reviewedByName?: string
  createdAt: string
}

const WR_STEPS: { key: WarehouseRequest['status']; label: string; icon: React.ReactNode }[] = [
  { key: 'PENDING', label: 'ثبت درخواست', icon: <ClipboardCheck className="size-3.5" /> },
  { key: 'PREPARED', label: 'آماده‌سازی', icon: <Package className="size-3.5" /> },
  { key: 'SENT', label: 'ارسال به طبقه', icon: <Truck className="size-3.5" /> },
  { key: 'RECEIVED', label: 'دریافت در قفسه', icon: <PackageCheck className="size-3.5" /> },
]

const CUSTOMER_STATUS: Record<CustomerRequest['status'], { label: string; cls: string }> = {
  OPEN: { label: 'در انتظار پیگیری', cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  ORDERED: { label: 'سفارش ثبت شد', cls: 'bg-[#eef3ea] text-[#5a7d4f] border border-[#cfe0c8]' },
  RESOLVED: { label: 'تأمین شد ✓', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
}

const PRODUCT_REQUEST_STATUS: Record<ProductRequest['status'], { label: string; cls: string }> = {
  PENDING: { label: 'در انتظار بررسی', cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  APPROVED: { label: 'تأیید شد — آماده بررسی سفارش', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  REJECTED: { label: 'رد شد', cls: 'bg-red-50 text-red-600 border border-red-200' },
}

// ================= Warehouse request timeline =================

function StatusTimeline({ status }: { status: WarehouseRequest['status'] }) {
  const activeIdx = WR_STEPS.findIndex((s) => s.key === status)
  return (
    <div className="flex items-center w-full" dir="rtl">
      {WR_STEPS.map((s, i) => {
        const done = i <= activeIdx
        const isCurrent = i === activeIdx
        return (
          <React.Fragment key={s.key}>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div
                className={cn(
                  'size-7 rounded-full flex items-center justify-center border-2 transition-colors',
                  done ? 'border-transparent text-white' : 'border-muted-foreground/25 text-muted-foreground/50 bg-background',
                  isCurrent && 'ring-4 ring-[#5a7d4f]/15',
                )}
                style={done ? { background: '#5a7d4f' } : undefined}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {s.icon}
              </div>
              <span className={cn('text-[9px] font-bold whitespace-nowrap', done ? 'text-foreground' : 'text-muted-foreground/60')}>{s.label}</span>
            </div>
            {i < WR_STEPS.length - 1 && (
              <div className={cn('h-0.5 flex-1 mx-1 mb-4 rounded', i < activeIdx ? 'bg-[#5a7d4f]' : 'bg-muted-foreground/20')} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ================= Product picker =================

function ProductPickerList({ onPick }: { onPick: (p: ProductLite) => void }) {
  const [q, setQ] = React.useState('')
  const [results, setResults] = React.useState<ProductLite[] | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      setLoading(true)
      api.get<{ products: ProductLite[] }>(`/api/products?${params.toString()}`)
        .then((d) => setResults(d.products.slice(0, 30)))
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی کالا..." className="h-10 pr-8 text-sm" />
      </div>
      <ScrollArea className="h-48">
        <div className="space-y-1 pr-1">
          {loading && !results ? (
            <div className="space-y-1.5"><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></div>
          ) : !results || results.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">کالایی پیدا نشد</p>
          ) : (
            results.map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full flex items-center gap-2 rounded-lg border bg-background hover:bg-accent/60 px-2 py-1.5 text-right transition-colors"
                onClick={() => onPick(p)}
              >
                <span className="size-8 rounded-md bg-accent flex items-center justify-center text-olive font-black shrink-0 overflow-hidden">
                  {p.image ? (
                    <img src={p.image} alt={p.name} className="size-full object-cover" loading="lazy" />
                  ) : p.name.charAt(0)}
                </span>
                <span className="text-xs font-medium flex-1 line-clamp-1">{p.name}</span>
                <span className="text-[10px] tabular-nums shrink-0" style={{ color: STOCK_STATUS[canUserStatusColor(p)].color }}>
                  {toFaDigits(Math.round(p.stock))} {p.unit}
                </span>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function canUserStatusColor(p: ProductLite): 'CRITICAL' | 'LOW' | 'OK' {
  if (p.stock <= p.minStock * 0.5) return 'CRITICAL'
  if (p.stock <= p.minStock) return 'LOW'
  return 'OK'
}

// ================= Merchandiser tab (my requests) =================

function MyRequestsTab({ user }: { user: ClientUser }) {
  const { toast } = useToast()
  const [requests, setRequests] = React.useState<WarehouseRequest[] | null>(null)
  const [picked, setPicked] = React.useState<ProductLite | null>(null)
  const [qty, setQty] = React.useState('10')
  const [saving, setSaving] = React.useState(false)
  const [receivingId, setReceivingId] = React.useState('')

  const load = React.useCallback(() => {
    api.get<{ requests: WarehouseRequest[] }>('/api/warehouse-requests?scope=mine')
      .then((d) => setRequests(d.requests))
      .catch(() => setRequests([]))
  }, [])

  React.useEffect(load, [load])

  async function submit() {
    if (!picked) {
      toast({ title: 'اول کالا را انتخاب کنید', variant: 'destructive' })
      return
    }
    const q = parseFloat(qty)
    if (!q || q <= 0) {
      toast({ title: 'تعداد را وارد کنید', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await api.post('/api/warehouse-requests', { productId: picked.id, quantity: q })
      toast({ title: 'درخواست ثبت شد ✓', description: `${picked.name} — ${toFaDigits(Math.round(q))} ${picked.unit}` })
      setPicked(null)
      setQty('10')
      load()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function receive(id: string) {
    setReceivingId(id)
    try {
      await api.patch(`/api/warehouse-requests/${id}`, { action: 'receive' })
      toast({ title: 'دریافت ثبت شد ✓', description: '+۲ امتیاز به کارنامه شما اضافه شد' })
      load()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setReceivingId('')
    }
  }

  return (
    <div className="grid lg:grid-cols-5 gap-4">
      {/* New request card */}
      <GlowCard className="p-4 lg:col-span-2 h-fit space-y-3">
        <h3 className="font-extrabold flex items-center gap-2"><Plus className="size-4 text-olive" /> درخواست جدید از انبار</h3>
        {picked ? (
          <div className="rounded-xl border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-sm line-clamp-1">{picked.name}</span>
              <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" onClick={() => setPicked(null)}>تغییر</Button>
            </div>
            <StockBadge stock={picked.stock} minStock={picked.minStock} unit={picked.unit} />
            <div className="space-y-1.5 pt-1">
              <Label>تعداد</Label>
              <div className="flex items-center gap-2" dir="ltr">
                <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setQty(String(Math.max(1, (parseFloat(qty) || 0) - 1)))} aria-label="کاهش">
                  <Minus className="size-4" />
                </Button>
                <Input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ''))} className="h-11 text-center tabular-nums" inputMode="numeric" />
                <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setQty(String((parseFloat(qty) || 0) + 1))} aria-label="افزایش">
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
            <Button className="w-full h-11" onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Warehouse className="size-4" />} ثبت درخواست
            </Button>
          </div>
        ) : (
          <ProductPickerList onPick={setPicked} />
        )}
      </GlowCard>

      {/* My requests list */}
      <div className="lg:col-span-3 space-y-3">
        {!requests ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)
        ) : requests.length === 0 ? (
          <EmptyState icon={<Warehouse className="size-7 text-olive" />} title="درخواستی ندارید" description="از فرم روبه‌رو درخواست جدید ثبت کنید." />
        ) : (
          requests.map((r) => (
            <GlowCard key={r.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{r.productName}</span>
                <Badge variant="secondary" className="tabular-nums">{toFaDigits(Math.round(r.quantity))} عدد</Badge>
              </div>
              <StatusTimeline status={r.status} />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground tabular-nums">{formatJalaliDateTime(r.createdAt)}</span>
                {r.status === 'SENT' && (
                  <Button size="sm" className="h-9" onClick={() => receive(r.id)} disabled={receivingId === r.id}>
                    {receivingId === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                    دریافت کردم ✓ (+۲ امتیاز)
                  </Button>
                )}
              </div>
            </GlowCard>
          ))
        )}
      </div>
    </div>
  )
}

// ================= Storekeeper queue =================

function QueueTab({ user }: { user: ClientUser }) {
  const { toast } = useToast()
  const [requests, setRequests] = React.useState<WarehouseRequest[] | null>(null)
  const [busyId, setBusyId] = React.useState('')

  const load = React.useCallback(() => {
    api.get<{ requests: WarehouseRequest[] }>('/api/warehouse-requests?scope=queue')
      .then((d) => setRequests(d.requests))
      .catch(() => setRequests([]))
  }, [])

  React.useEffect(load, [load])

  async function act(id: string, action: 'prepare' | 'send') {
    setBusyId(id)
    try {
      await api.patch(`/api/warehouse-requests/${id}`, { action })
      toast({ title: action === 'prepare' ? 'به‌عنوان آماده شده ثبت شد ✓' : 'کالا به طبقه فرستاده شد ✓' })
      load()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="space-y-3">
      {!requests ? (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
      ) : requests.length === 0 ? (
        <EmptyState icon={<PackageCheck className="size-7 text-olive" />} title="صف انبار خالی است" description="درخواست جدیدی در انتظار آماده‌سازی نیست." />
      ) : (
        requests.map((r) => (
          <GlowCard key={r.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold flex items-center gap-2">
                  <Package className="size-4 text-olive" /> {r.productName}
                  <Badge variant="secondary" className="tabular-nums">{toFaDigits(Math.round(r.quantity))} عدد</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  درخواست از: {r.requestedByName || '—'} • {formatJalaliDateTime(r.createdAt)}
                  {r.preparedByName && <> • آماده‌سازی: {r.preparedByName}</>}
                </p>
              </div>
              <div className="flex gap-2">
                {r.status === 'PENDING' && (
                  <Button size="sm" className="h-10" onClick={() => act(r.id, 'prepare')} disabled={busyId === r.id}>
                    {busyId === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <PackageCheck className="size-3.5" />}
                    آماده شد
                  </Button>
                )}
                {r.status === 'PREPARED' && (
                  <Button size="sm" className="h-10" onClick={() => act(r.id, 'send')} disabled={busyId === r.id}>
                    {busyId === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                    فرستاده شد به طبقه
                  </Button>
                )}
                <Badge className="bg-[#eef3ea] text-[#5a7d4f] border border-[#cfe0c8] hover:bg-[#eef3ea] h-9 flex items-center">
                  {r.status === 'PENDING' ? 'در انتظار آماده‌سازی' : 'آماده — منتظر ارسال'}
                </Badge>
              </div>
            </div>
          </GlowCard>
        ))
      )}
    </div>
  )
}

// ================= Customer requests tab =================

function CustomerRequestsTab({ user }: { user: ClientUser }) {
  const { toast } = useToast()
  const isManager = canUser(user.roles, PERMISSIONS.MANAGE_ORDERS) || canUser(user.roles, PERMISSIONS.MANAGE_PRODUCTS) || canUser(user.roles, PERMISSIONS.VIEW_REPORTS)
  const [requests, setRequests] = React.useState<CustomerRequest[] | null>(null)
  const [addOpen, setAddOpen] = React.useState(false)
  const [busyId, setBusyId] = React.useState('')

  const load = React.useCallback(() => {
    api.get<{ requests: CustomerRequest[] }>('/api/customer-requests')
      .then((d) => setRequests(d.requests))
      .catch(() => setRequests([]))
  }, [])

  React.useEffect(load, [load])

  async function setStatus(id: string, status: CustomerRequest['status']) {
    setBusyId(id)
    try {
      await api.patch(`/api/customer-requests/${id}`, { status })
      toast({ title: 'وضعیت بروزرسانی شد ✓' })
      load()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="h-11" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> ثبت درخواست مشتری
        </Button>
      </div>

      {!requests ? (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
      ) : requests.length === 0 ? (
        <EmptyState icon={<Users className="size-7 text-olive" />} title="درخواستی ثبت نشده" description="کالایی که مشتری‌ها دنبالش هستند را اینجا ثبت کنید." />
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {requests.map((r) => (
            <GlowCard key={r.id} className={cn('p-4', r.count >= 3 && r.status === 'OPEN' && 'border-red-300 bg-red-50/40')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold">{r.productName}</span>
                    <Badge
                      variant="secondary"
                      className={cn('tabular-nums', r.count >= 3 && 'bg-red-100 text-red-700 hover:bg-red-100')}
                    >
                      {toFaDigits(r.count)} بار درخواست شده
                    </Badge>
                    {r.count >= 3 && r.status === 'OPEN' && (
                      <span className="text-[10px] font-black text-red-600 animate-pulse">⚠ محصول پرتقاضا!</span>
                    )}
                  </div>
                  {r.details && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.details}</p>}
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    آخرین: {r.requestedByName || '—'} • {formatJalaliDateTime(r.createdAt)}
                  </p>
                </div>
                <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-bold shrink-0', CUSTOMER_STATUS[r.status].cls)}>
                  {CUSTOMER_STATUS[r.status].label}
                </span>
              </div>
              {isManager && (
                <>
                  <Separator className="my-3" />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">تغییر وضعیت:</span>
                    <Select value={r.status} onValueChange={(v) => setStatus(r.id, v as CustomerRequest['status'])} disabled={busyId === r.id}>
                      <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OPEN">در انتظار پیگیری</SelectItem>
                        <SelectItem value="ORDERED">سفارش ثبت شد</SelectItem>
                        <SelectItem value="RESOLVED">تأمین شد</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </GlowCard>
          ))}
        </div>
      )}

      <AddCustomerRequestDialog open={addOpen} onClose={() => setAddOpen(false)} onAdded={load} />
    </div>
  )
}

function AddCustomerRequestDialog({
  open, onClose, onAdded,
}: {
  open: boolean
  onClose: () => void
  onAdded: () => void
}) {
  const { toast } = useToast()
  const [productName, setProductName] = React.useState('')
  const [details, setDetails] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) { setProductName(''); setDetails('') }
  }, [open])

  async function save() {
    if (!productName.trim()) {
      toast({ title: 'نام کالا را وارد کنید', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await api.post('/api/customer-requests', { productName: productName.trim(), details: details.trim() || undefined })
      toast({ title: 'درخواست مشتری ثبت شد ✓' })
      onAdded()
      onClose()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>درخواست کالای مشتری</DialogTitle>
          <DialogDescription>اگر همین کالا قبلاً درخواست شده، تعداد آن یکی اضافه می‌شود</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>نام کالا *</Label>
            <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="مثلاً پنیر برگر بی‌لاکتوز" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>توضیحات (اختیاری)</Label>
            <Textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} placeholder="مثلاً مشتری گفت هر هفته می‌خرد" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onClose} disabled={saving}>انصراف</Button>
          <Button className="h-11 min-w-28" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} ثبت
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================= Product suggestions tab =================

function ProductSuggestionsTab({ user }: { user: ClientUser }) {
  const { toast } = useToast()
  const isManager = canUser(user.roles, PERMISSIONS.MANAGE_PRODUCTS) || canUser(user.roles, PERMISSIONS.APPROVE_ORDERS) || canUser(user.roles, PERMISSIONS.VIEW_REPORTS)
  const [requests, setRequests] = React.useState<ProductRequest[] | null>(null)
  const [addOpen, setAddOpen] = React.useState(false)
  const [busyId, setBusyId] = React.useState('')

  const load = React.useCallback(() => {
    api.get<{ requests: ProductRequest[] }>('/api/product-requests')
      .then((d) => setRequests(d.requests))
      .catch(() => setRequests([]))
  }, [])

  React.useEffect(load, [load])

  async function review(id: string, status: 'APPROVED' | 'REJECTED') {
    setBusyId(id)
    try {
      await api.patch(`/api/product-requests/${id}`, { status })
      toast({ title: status === 'APPROVED' ? 'پیشنهاد تأیید شد ✓' : 'پیشنهاد رد شد' })
      load()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="h-11" onClick={() => setAddOpen(true)}>
          <Lightbulb className="size-4" /> پیشنهاد کالای جدید
        </Button>
      </div>

      {!requests ? (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
      ) : requests.length === 0 ? (
        <EmptyState icon={<Lightbulb className="size-7 text-olive" />} title="پیشنهادی ثبت نشده" description="کالایی که فکر می‌کنید به فروشگاه بیاید را پیشنهاد دهید." />
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <GlowCard key={r.id} className={cn('p-4', r.status === 'APPROVED' && 'border-emerald-300 bg-emerald-50/40')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold flex items-center gap-2">
                    <Lightbulb className="size-4 text-[#8a6d1f]" /> {r.productName}
                  </div>
                  {r.details && <p className="text-xs text-muted-foreground mt-1">{r.details}</p>}
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    پیشنهاد از: {r.suggestedByName || '—'} • {formatJalaliDateTime(r.createdAt)}
                    {r.reviewedByName && <> • بررسی: {r.reviewedByName}</>}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-bold', PRODUCT_REQUEST_STATUS[r.status].cls)}>
                    {PRODUCT_REQUEST_STATUS[r.status].label}
                  </span>
                  {isManager && r.status === 'PENDING' && (
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-9" onClick={() => review(r.id, 'APPROVED')} disabled={busyId === r.id}>
                        <CheckCircle2 className="size-3.5" /> تأیید
                      </Button>
                      <Button size="sm" variant="outline" className="h-9 text-destructive hover:text-destructive" onClick={() => review(r.id, 'REJECTED')} disabled={busyId === r.id}>
                        <ArrowLeft className="size-3.5" /> رد
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </GlowCard>
          ))}
        </div>
      )}

      <AddProductRequestDialog open={addOpen} onClose={() => setAddOpen(false)} onAdded={load} />
    </div>
  )
}

function AddProductRequestDialog({
  open, onClose, onAdded,
}: {
  open: boolean
  onClose: () => void
  onAdded: () => void
}) {
  const { toast } = useToast()
  const [productName, setProductName] = React.useState('')
  const [details, setDetails] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) { setProductName(''); setDetails('') }
  }, [open])

  async function save() {
    if (!productName.trim()) {
      toast({ title: 'نام کالا را وارد کنید', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await api.post('/api/product-requests', { productName: productName.trim(), details: details.trim() || undefined })
      toast({ title: 'پیشنهاد شما ثبت شد ✓', description: 'مدیران بررسی می‌کنند' })
      onAdded()
      onClose()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>پیشنهاد کالای جدید</DialogTitle>
          <DialogDescription>کالایی که به‌نظرتان در هایپر زیتون باید باشد را معرفی کنید</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>نام کالا *</Label>
            <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="مثلاً مربای خانگی زرشک کرمان" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>توضیحات (اختیاری)</Label>
            <Textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} placeholder="چرا این کالا خوب است؟ مشتری چه می‌خواهد؟" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onClose} disabled={saving}>انصراف</Button>
          <Button className="h-11 min-w-28" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Lightbulb className="size-4" />} ارسال پیشنهاد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================= Main section =================

export function WarehouseSection({ user }: { user: ClientUser }) {
  const isMerchandiser = user.roles.includes('MERCHANDISER')
  const hasWarehouse = canUser(user.roles, PERMISSIONS.WAREHOUSE) || isMerchandiser
  const isStorekeeper = user.roles.includes('INVENTORY_SUPERVISOR') ||
    user.roles.includes('GENERAL_MANAGER') ||
    user.roles.includes('OPERATION_MANAGER')

  const tabs: { key: string; label: string; icon: React.ReactNode }[] = []
  if (hasWarehouse) tabs.push({ key: 'mine', label: isMerchandiser ? 'درخواست‌های من' : 'درخواست‌های انبار', icon: <Warehouse className="size-4" /> })
  if (isStorekeeper) tabs.push({ key: 'queue', label: 'صف انبار', icon: <PackageCheck className="size-4" /> })
  tabs.push({ key: 'customers', label: 'درخواست‌های مشتریان', icon: <Users className="size-4" /> })
  tabs.push({ key: 'suggestions', label: 'پیشنهاد کالای جدید', icon: <Lightbulb className="size-4" /> })

  const def = tabs[0]?.key || 'customers'

  return (
    <div>
      <SectionHeader
        title="انبار و درخواست‌ها"
        subtitle="گردش درخواست کالا بین طبقه و انبار، درخواست مشتریان و پیشنهاد کالا"
      />
      <Tabs defaultValue={def}>
        <TabsList className="mb-4 h-11 flex-wrap">
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="gap-1.5 px-4">
              {t.icon} {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {hasWarehouse && (
          <TabsContent value="mine"><MyRequestsTab user={user} /></TabsContent>
        )}
        {isStorekeeper && (
          <TabsContent value="queue"><QueueTab user={user} /></TabsContent>
        )}
        <TabsContent value="customers"><CustomerRequestsTab user={user} /></TabsContent>
        <TabsContent value="suggestions"><ProductSuggestionsTab user={user} /></TabsContent>
      </Tabs>
    </div>
  )
}
