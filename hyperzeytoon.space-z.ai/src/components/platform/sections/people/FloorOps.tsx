'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/store/app'
import { useToast } from '@/hooks/use-toast'
import { SectionHeader, EmptyState, LoadingBlock, StatusBadge, ConfirmButton } from '@/components/platform/ui/shared'
import { timeAgo, toFaDigits } from '@/lib/jalali'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { BarcodeInput } from '@/components/platform/ui/barcode-input'
import { Package, Flame, Search, Loader2, Plus, Store, Lightbulb, CheckCircle2, Truck } from 'lucide-react'

interface WarehouseRequestDTO {
  id: string
  productId: string
  qty: number
  status: string
  note?: string | null
  createdAt: string
  product?: { id: string; name: string; unit: string; stock: number }
  requesterName?: string | null
}

interface StockRequestDTO {
  id: string
  productName: string
  count: number
  updatedAt: string
}

interface SuggestionDTO {
  id: string
  name: string
  barcode?: string | null
  note?: string | null
  status: string
  managementNote?: string | null
  createdAt: string
}

interface ProductLite {
  id: string
  name: string
  unit: string
  stock: number
}

const WR_STATUSES = [
  { key: 'PENDING', label: 'در انتظار انبار', color: '#8A8F98' },
  { key: 'PREPARING', label: 'در حال آماده‌سازی', color: '#D9832E' },
  { key: 'SENT', label: 'ارسال شد', color: '#C9A227' },
  { key: 'DELIVERED', label: 'تحویل شد ✅', color: '#3E7C59' },
]

const SUG_STATUSES = [
  { key: 'NEW', label: 'ثبت شده', color: '#8A8F98' },
  { key: 'REVIEWING', label: 'در حال بررسی', color: '#D9832E' },
  { key: 'APPROVED', label: 'تأیید شد', color: '#3E7C59' },
  { key: 'REJECTED', label: 'این بار نه', color: '#B33A3A' },
]

function wrStatus(key: string) {
  return WR_STATUSES.find((s) => s.key === key) ?? { key, label: key, color: '#8A8F98' }
}
function sugStatus(key: string) {
  return SUG_STATUSES.find((s) => s.key === key) ?? { key, label: key, color: '#8A8F98' }
}

export function FloorOps() {
  const { user } = useApp()
  const isManager = !!user?.isManager
  const isInventory = isManager || (user?.roleKeys.includes('inventory') ?? false)
  const isMerchandiser = isManager || (user?.roleKeys.some((k) => ['merchandiser', 'sales'].includes(k)) ?? false)

  return (
    <div className="space-y-4">
      <SectionHeader
        title="عملیات فروشگاه"
        subtitle="همه‌چیز برای شیفت راحت تو — درخواست بده، بقیه‌اش با تیم 🌿"
        icon={<Store className="h-5 w-5" />}
      />
      <div className="grid lg:grid-cols-3 gap-4 items-start">
        {isMerchandiser && <WarehouseCard />}
        <StockRequestsCard isManager={isManager} />
        <SuggestionsCard isManager={isManager} />
      </div>
      {isInventory && (
        <Card className="border-copper/40">
          <CardContent className="p-4">
            <p className="text-sm font-bold flex items-center gap-2 mb-3">
              <Package className="h-4 w-4 text-copper" /> صف درخواست‌های انبار (نمای انباردار)
            </p>
            <InventoryQueue />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------- (1) warehouse requests ----------
function WarehouseCard() {
  const { toast } = useToast()
  const [products, setProducts] = React.useState<ProductLite[] | null>(null)
  const [pQuery, setPQuery] = React.useState('')
  const [selected, setSelected] = React.useState<ProductLite | null>(null)
  const [qty, setQty] = React.useState(1)
  const [note, setNote] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [requests, setRequests] = React.useState<WarehouseRequestDTO[] | null>(null)

  const load = React.useCallback(async () => {
    try {
      const d = await api<{ requests: WarehouseRequestDTO[] }>('/api/warehouse-requests')
      setRequests(d.requests)
    } catch {
      setRequests([])
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    const t = setTimeout(() => {
      api<{ products: ProductLite[] }>(`/api/products?q=${encodeURIComponent(pQuery)}&limit=8`)
        .then((d) => setProducts(d.products))
        .catch(() => setProducts([]))
    }, 300)
    return () => clearTimeout(t)
  }, [pQuery])

  const submit = async () => {
    if (!selected || qty <= 0) return
    setSending(true)
    try {
      await api('/api/warehouse-requests', { body: { productId: selected.id, qty, note } })
      toast({ title: 'انباردار مطلع شد 📦', description: `${selected.name} × ${qty} — به‌محض آماده شدن خبرت می‌کنیم` })
      setSelected(null)
      setPQuery('')
      setQty(1)
      setNote('')
      load()
    } catch (e) {
      toast({ title: 'ثبت نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  const confirmDelivery = async (r: WarehouseRequestDTO) => {
    try {
      await api('/api/warehouse-requests', { method: 'PATCH', body: { id: r.id, status: 'DELIVERED' } })
      toast({ title: 'آفرین! +۲ امتیاز ⭐', description: 'تحویل تأیید شد — کار تیمی تمیز!' })
      load()
    } catch (e) {
      toast({ title: 'ثبت نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  return (
    <Card className="glow-border-static">
      <CardContent className="p-4 space-y-3">
        <p className="text-sm font-bold flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" /> درخواست از انبار
        </p>
        <div className="space-y-2">
          <Label>کالا</Label>
          {selected ? (
            <div className="flex items-center justify-between rounded-xl bg-accent p-3">
              <div>
                <p className="text-sm font-bold">{selected.name}</p>
                <p className="text-[11px] text-muted-foreground num">موجودی فعلی: {toFaDigits(selected.stock)}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>تغییر</Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={pQuery} onChange={(e) => setPQuery(e.target.value)} placeholder="نام کالا…" className="pr-9 h-11" />
              </div>
              {products && products.length > 0 && !selected && (
                <div className="space-y-1 max-h-40 overflow-y-auto nice-scroll">
                  {products.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setSelected(p); setPQuery('') }}
                      className="w-full text-right rounded-lg px-3 py-2.5 text-xs hover:bg-accent transition-colors min-h-11"
                    >
                      <span className="font-bold">{p.name}</span>
                      <span className="text-muted-foreground num"> — {toFaDigits(p.stock)} {p.unit}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>تعداد</Label>
          <Input value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} inputMode="numeric" className="h-11 num" />
        </div>
        <div className="space-y-1.5">
          <Label>یادداشت (اختیاری)</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="مثلاً: برای قفسه لبنیات" className="text-xs" />
        </div>
        <Button className="w-full h-11 gap-1.5" onClick={submit} disabled={!selected || sending}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} ثبت درخواست
        </Button>

        <div className="space-y-2 pt-2 border-t">
          <p className="text-xs font-bold text-muted-foreground">درخواست‌های اخیر:</p>
          {!requests ? <LoadingBlock rows={2} /> : requests.length === 0 ? (
            <p className="text-xs text-muted-foreground">هنوز درخواستی ثبت نکردی.</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto nice-scroll">
              {requests.slice(0, 12).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border p-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{r.product?.name ?? 'کالا'}</p>
                    <p className="text-[10px] text-muted-foreground num">{toFaDigits(r.qty)} · {timeAgo(r.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <StatusBadge label={wrStatus(r.status).label} color={wrStatus(r.status).color} />
                    {r.status === 'SENT' && (
                      <Button size="sm" variant="outline" className="h-9 gap-1" onClick={() => confirmDelivery(r)}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> رسید
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- (2) customer-requested (out of stock) products ----------
function StockRequestsCard({ isManager }: { isManager: boolean }) {
  const { toast } = useToast()
  const [items, setItems] = React.useState<StockRequestDTO[] | null>(null)
  const [name, setName] = React.useState('')
  const [sending, setSending] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const d = await api<{ items: StockRequestDTO[] }>('/api/stock-requests')
      setItems(d.items)
    } catch {
      setItems([])
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!name.trim()) return
    setSending(true)
    try {
      await api('/api/stock-requests', { body: { productName: name } })
      toast({ title: 'ثبت شد! +۱ امتیاز ⭐', description: 'وقتی این کالا تأمین شد، مشتری خوشحال برمی‌گردد' })
      setName('')
      load()
    } catch (e) {
      toast({ title: 'ثبت نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  const remove = async (item: StockRequestDTO) => {
    try {
      await api(`/api/stock-requests?id=${item.id}`, { method: 'DELETE' })
      load()
    } catch (e) {
      toast({ title: 'حذف نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  const maxCount = Math.max(1, ...(items ?? []).map((i) => i.count))

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <p className="text-sm font-bold flex items-center gap-2">
          <Flame className="h-4 w-4 text-pomegranate" /> کالای درخواستی مشتری (ناموجود)
        </p>
        <div className="space-y-2">
          <BarcodeInput
            value={name}
            onValueChange={setName}
            onScan={() => submit()}
            placeholder="نام کالایی که مشتری خواست…"
          />
          <Button className="w-full h-11 gap-1.5" onClick={submit} disabled={sending || !name.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} ثبت (+۱ امتیاز)
          </Button>
        </div>
        {!items ? <LoadingBlock rows={2} /> : items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">هنوز کالایی ثبت نشده — سلیقه مشتری‌ها را کشف کن!</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto nice-scroll">
            {items.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2 rounded-xl border p-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate flex items-center gap-1.5">
                    {i.productName}
                    {i.count >= Math.max(3, Math.ceil(maxCount * 0.6)) && <Flame className="h-3.5 w-3.5 text-pomegranate shrink-0" />}
                  </p>
                  <p className="text-[10px] text-muted-foreground">آخرین: {timeAgo(i.updatedAt)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="rounded-full bg-pomegranate/10 text-pomegranate px-2.5 py-1 text-[11px] font-bold num">
                    🔥 {toFaDigits(i.count)} بار
                  </span>
                  {isManager && (
                    <ConfirmButton onConfirm={() => remove(i)} confirmText="حذف؟" variant="ghost" className="h-9 text-pomegranate">
                      ✕
                    </ConfirmButton>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- (3) new product suggestions ----------
function SuggestionsCard({ isManager }: { isManager: boolean }) {
  const { toast } = useToast()
  const [items, setItems] = React.useState<SuggestionDTO[] | null>(null)
  const [name, setName] = React.useState('')
  const [barcode, setBarcode] = React.useState('')
  const [note, setNote] = React.useState('')
  const [sending, setSending] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const d = await api<{ suggestions: SuggestionDTO[] }>('/api/suggestions')
      setItems(d.suggestions)
    } catch {
      setItems([])
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!name.trim()) return
    setSending(true)
    try {
      await api('/api/suggestions', { body: { name, barcode: barcode || undefined, note: note || undefined } })
      toast({ title: 'پیشنهادت رسید 🌱', description: 'مدیریت بررسی می‌کند و نتیجه را بهت خبر می‌دهد' })
      setName('')
      setBarcode('')
      setNote('')
      load()
    } catch (e) {
      toast({ title: 'ثبت نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <p className="text-sm font-bold flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-gold" /> پیشنهاد کالای جدید
        </p>
        <div className="space-y-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="نام کالا *" className="h-11" />
          <BarcodeInput value={barcode} onValueChange={setBarcode} placeholder="بارکد (اختیاری)" />
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="چرا این کالا خوب است؟ (اختیاری)" className="text-xs" />
          <Button className="w-full h-11 gap-1.5" onClick={submit} disabled={sending || !name.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />} ارسال پیشنهاد
          </Button>
        </div>
        {!items ? <LoadingBlock rows={2} /> : items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">هنوز پیشنهادی نداری — اولین فکر خوب را بفرست!</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto nice-scroll">
            {items.map((s) => (
              <div key={s.id} className="rounded-xl border p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold truncate">{s.name}</p>
                  <StatusBadge label={sugStatus(s.status).label} color={sugStatus(s.status).color} />
                </div>
                {s.managementNote && <p className="text-[10px] text-muted-foreground">💬 {s.managementNote}</p>}
                <p className="text-[10px] text-muted-foreground">{timeAgo(s.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
        {isManager && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Truck className="h-3 w-3" /> برای تغییر وضعیت، از بخش محصولات و بررسی پیشنهادها استفاده کن.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- inventory staff queue ----------
function InventoryQueue() {
  const { toast } = useToast()
  const [requests, setRequests] = React.useState<WarehouseRequestDTO[] | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      const d = await api<{ requests: WarehouseRequestDTO[] }>('/api/warehouse-requests')
      setRequests(d.requests)
    } catch {
      setRequests([])
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const advance = async (r: WarehouseRequestDTO, status: string) => {
    setBusyId(r.id)
    try {
      await api('/api/warehouse-requests', { method: 'PATCH', body: { id: r.id, status } })
      toast({ title: status === 'SENT' ? 'ارسال شد 🚚' : 'آماده‌سازی شروع شد' })
      load()
    } catch (e) {
      toast({ title: 'انجام نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const open = (requests ?? []).filter((r) => r.status !== 'DELIVERED')

  return (
    !requests ? <LoadingBlock rows={2} /> : open.length === 0 ? (
      <EmptyState icon={<CheckCircle2 />} title="همه درخواست‌ها بسته شدند" description="عالی بود — قفسه‌ها پر و تیم راضی است 🌟" />
    ) : (
      <div className="space-y-2 max-h-80 overflow-y-auto nice-scroll">
        {open.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{r.product?.name ?? 'کالا'}</p>
              <p className="text-[11px] text-muted-foreground num">
                {toFaDigits(r.qty)} {r.product?.unit} · از {r.requesterName ?? 'همکار'} · {timeAgo(r.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <StatusBadge label={wrStatus(r.status).label} color={wrStatus(r.status).color} />
              {r.status === 'PENDING' && (
                <Button size="sm" variant="outline" className="h-9" disabled={busyId === r.id} onClick={() => advance(r, 'PREPARING')}>
                  آماده‌سازی
                </Button>
              )}
              {r.status === 'PREPARING' && (
                <Button size="sm" className="h-9 gap-1" disabled={busyId === r.id} onClick={() => advance(r, 'SENT')}>
                  <Truck className="h-3.5 w-3.5" /> ارسال شد
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  )
}
