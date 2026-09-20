'use client'

import * as React from 'react'
import { api, ClientUser } from '@/lib/api-client'
import { GlowCard, SectionHeader, EmptyState, Money, OrnamentDivider } from '@/components/zeytoon-ui'
import { formatMoney, toFaDigits, toEnDigits, todayJalali, formatJalali, formatJalaliDateTime, diffDaysJalali } from '@/lib/jalali'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { sfxSuccess, sfxError, sfxCelebrate } from '@/lib/sfx'
import {
  Truck, PackageCheck, ClipboardCheck, AlertTriangle, Minus, Plus, CheckCircle2,
  ScanBarcode, Loader2, CalendarClock, Banknote, ReceiptText, SearchCheck, PackageOpen,
} from 'lucide-react'

// ---------- types ----------
interface QueueItem {
  id: string
  productId: string
  productName: string
  holooName: string | null
  barcode: string | null
  barcodes: string[]
  quantity: number
  unitPrice: number
  sellPrice: number | null
  currentSellPrice: number | null
  printedPrice: number | null
  discount: number
  lineTotal: number
  receivedQty: number | null
  status: string
  note: string | null
}

interface QueueOrder {
  id: string
  number: number
  status: string
  deliveryDate: string
  paymentType: string
  notes: string | null
  totalAmount: number
  discount: number
  tax: number
  vat: number
  finalAmount: number
  supplier: { name: string; phone: string | null; paymentType: string }
  receivedAt: string | null
  items: QueueItem[]
}

interface DeliveriesData {
  canReceive: boolean
  canInspect: boolean
  expected: QueueOrder[]
  received: QueueOrder[]
}

type ItemStatus = 'OK' | 'MISSING' | 'REJECTED'

interface RecRow {
  itemId: string
  productId: string
  name: string
  barcode: string | null
  barcodes: string[]
  ordered: number
  unitPrice: number
  sellPrice: number | null
  receivedQty: number
  status: ItemStatus
  note: string
  printedPrice: string
  discount: string
  scanned: boolean
}

interface NewBarcode {
  productId: string
  barcode: string
}

const PAY_TYPE: Record<string, string> = {
  CASH_ON_DELIVERY: 'نقدی هنگام تحویل',
  CHEQUE: 'چکی',
}

/** parse a Persian-digit input string into a number */
function num(s: string): number {
  const v = parseFloat(toEnDigits(String(s)).replace(/[^\d.-]/g, ''))
  return isNaN(v) ? 0 : v
}

// ============================================================
export function DeliveriesSection({ user }: { user: ClientUser }) {
  const { toast } = useToast()
  const [data, setData] = React.useState<DeliveriesData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [receiveOrder, setReceiveOrder] = React.useState<QueueOrder | null>(null)
  const [inspectOrder, setInspectOrder] = React.useState<QueueOrder | null>(null)

  const load = React.useCallback(() => {
    setLoading(true)
    api.get<DeliveriesData>('/api/deliveries')
      .then(setData)
      .catch((e) => toast({ title: 'خطا', description: e.message, variant: 'destructive' }))
      .finally(() => setLoading(false))
  }, [toast])

  React.useEffect(() => { load() }, [load])

  const canReceive = canUser(user.roles, PERMISSIONS.RECEIVE_DELIVERY) || canUser(user.roles, PERMISSIONS.INSPECT_DELIVERY)
  const canInspect = canUser(user.roles, PERMISSIONS.INSPECT_DELIVERY)

  const overdue = (data?.expected || []).filter((o) => o.deliveryDate < todayJalali())

  if (!canReceive && !canInspect) {
    return (
      <div>
        <SectionHeader title="دریافت مرسولات" />
        <EmptyState icon="🔒" title="دسترسی ندارید" description="این بخش مخصوص تحویل‌گیرندگان و سرپرست انبار است." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="دریافت مرسولات"
        subtitle="مهمان عزیز، سفارش‌های رسیده را اینجا تحویل بگیر و کنترل کن 📦"
        actions={
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />}
            به‌روزرسانی
          </Button>
        }
      />

      {/* overdue alert banner */}
      {!loading && overdue.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600" />
          <div className="text-sm">
            <div className="font-bold text-red-700">
              {toFaDigits(overdue.length)} سفارش موعد دریافتش گذشته است
            </div>
            <div className="text-red-600 mt-0.5">
              {overdue.map((o) => `سفارش ${toFaDigits(o.number)} — ${o.supplier.name} (${toFaDigits(o.deliveryDate)})`).join(' • ')}
              — لطفاً پیگیری کن که کالا برسد.
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
      ) : (
        <>
          {/* receiver queue */}
          {canReceive && (
            <OrderQueue
              title="انتظار دریافت امروز"
              subtitle="سفارش‌هایی که تأمین‌کننده باید تحویل بدهد — روی هر سفارش بزن تا مرسولات را ثبت کنی"
              orders={data?.expected || []}
              icon={<Truck className="size-4 text-gold" />}
              emptyTitle="هنوز سفارشی برای دریافت نیست"
              emptyDesc="وقتی سفارش جدیدی تأیید شود، همین‌جا ظاهر می‌شود."
              overdueLabel="موعد گذشته"
              onPick={setReceiveOrder}
              pickLabel="ثبت دریافت"
            />
          )}

          {/* supervisor queue */}
          {canInspect && (
            <OrderQueue
              title="در انتظار کنترل انبار"
              subtitle="سفارش‌های دریافت‌شده که باید شمارش و تأیید نهایی شوند"
              orders={data?.received || []}
              icon={<ClipboardCheck className="size-4 text-gold" />}
              emptyTitle="چیزی در انتظار کنترل نیست"
              emptyDesc="همه چیز مرتب است — سفارش کنترل‌شده به حسابداری می‌رود 🌿"
              onPick={setInspectOrder}
              pickLabel="کنترل انبار"
            />
          )}
        </>
      )}

      {/* receiving workflow dialog */}
      {receiveOrder && (
        <ReceiveDialog
          order={receiveOrder}
          onClose={() => setReceiveOrder(null)}
          onDone={(o) => {
            setReceiveOrder(null)
            toast({
              title: 'دریافت ثبت شد ✅',
              description: `سفارش ${toFaDigits(o.number)} حالا در انتظار کنترل انبار است.`,
            })
            load()
          }}
        />
      )}

      {/* inspection dialog */}
      {inspectOrder && (
        <InspectDialog
          order={inspectOrder}
          onClose={() => setInspectOrder(null)}
          onDone={(o) => {
            setInspectOrder(null)
            toast({
              title: 'کنترل انبار تأیید شد 🌿',
              description: `سفارش ${toFaDigits(o.number)} به حسابداری ارسال شد.`,
            })
            load()
          }}
        />
      )}
    </div>
  )
}

// ============================================================
function OrderQueue({
  title, subtitle, orders, icon, emptyTitle, emptyDesc, onPick, pickLabel, overdueLabel,
}: {
  title: string
  subtitle: string
  orders: QueueOrder[]
  icon: React.ReactNode
  emptyTitle: string
  emptyDesc: string
  onPick: (o: QueueOrder) => void
  pickLabel: string
  overdueLabel?: string
}) {
  const today = todayJalali()
  if (orders.length === 0) {
    return (
      <GlowCard className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-2 font-bold text-sm">
          {icon} {title}
        </div>
        <OrnamentDivider />
        <EmptyState title={emptyTitle} description={emptyDesc} />
      </GlowCard>
    )
  }
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 font-bold">
        {icon} {title}
        <span className="text-xs font-medium text-muted-foreground">— {subtitle}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {orders.map((o) => {
          const isOverdue = o.deliveryDate < today
          const daysLate = isOverdue ? diffDaysJalali(today, o.deliveryDate) : 0
          return (
            <GlowCard key={o.id} interactive className="p-4 sm:p-5">
              <button onClick={() => onPick(o)} className="w-full text-right focus:outline-none" aria-label={`${pickLabel} سفارش ${o.number}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-black">سفارش {toFaDigits(o.number)}</span>
                      {isOverdue && overdueLabel && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[11px] font-bold">
                          <AlertTriangle className="size-3" /> {overdueLabel}
                        </span>
                      )}
                      <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-olive">
                        <Banknote className="size-3" /> {PAY_TYPE[o.paymentType] || o.paymentType}
                      </span>
                    </div>
                    <div className="text-sm font-bold mt-1 truncate">{o.supplier.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {toFaDigits(o.items.length)} قلم کالا • تحویل: {toFaDigits(o.deliveryDate)}
                      {isOverdue && <span className="text-red-600 font-bold"> ({toFaDigits(daysLate)} روز تأخیر)</span>}
                    </div>
                  </div>
                  <div className={cn('shrink-0 text-left rounded-xl px-3 py-2', isOverdue ? 'bg-red-50 border border-red-200' : 'bg-accent/60')}>
                    <div className={cn('text-sm font-black tabular-nums', isOverdue && 'text-red-700')}>
                      <Money value={o.finalAmount || o.totalAmount} />
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">مبلغ تقریبی</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">
                    {o.items.slice(0, 3).map((it) => (
                      <span key={it.id} className="rounded-md bg-background border px-1.5 py-0.5 text-[11px] text-muted-foreground truncate max-w-36">
                        {it.productName}
                      </span>
                    ))}
                    {o.items.length > 3 && (
                      <span className="rounded-md bg-background border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        +{toFaDigits(o.items.length - 3)}
                      </span>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-gold">
                    <PackageCheck className="size-4" /> {pickLabel}
                  </span>
                </div>
              </button>
            </GlowCard>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// RECEIVING WORKFLOW
// ============================================================
function ReceiveDialog({
  order, onClose, onDone,
}: {
  order: QueueOrder
  onClose: () => void
  onDone: (o: QueueOrder) => void
}) {
  const { toast } = useToast()
  const [rows, setRows] = React.useState<RecRow[]>(() =>
    order.items.map((it) => ({
      itemId: it.id,
      productId: it.productId,
      name: it.productName,
      barcode: it.barcode,
      barcodes: it.barcodes || [],
      ordered: it.quantity,
      unitPrice: it.unitPrice,
      sellPrice: it.sellPrice,
      receivedQty: it.quantity,
      status: 'OK',
      note: '',
      printedPrice: '',
      discount: it.discount ? String(it.discount) : '',
      scanned: false,
    }))
  )
  const [taxPct, setTaxPct] = React.useState('0')
  const [vatPct, setVatPct] = React.useState('0')
  const [invoiceTotal, setInvoiceTotal] = React.useState('')
  const [scan, setScan] = React.useState('')
  const [scanResult, setScanResult] = React.useState<{ ok: boolean; name?: string; code?: string } | null>(null)
  const [attachTarget, setAttachTarget] = React.useState<string>('')
  const [newBarcodes, setNewBarcodes] = React.useState<NewBarcode[]>([])
  const [submitting, setSubmitting] = React.useState(false)
  const [flashId, setFlashId] = React.useState<string | null>(null)
  const scanInputRef = React.useRef<HTMLInputElement>(null)

  const totals = React.useMemo(() => {
    let gross = 0
    let discounts = 0
    for (const r of rows) {
      if (r.status !== 'OK') continue
      const price = num(r.printedPrice) > 0 ? num(r.printedPrice) : r.unitPrice
      gross += r.receivedQty * price
      discounts += num(r.discount)
    }
    const subtotal = Math.max(0, gross - discounts)
    const tax = Math.round((subtotal * num(taxPct)) / 100)
    const vat = Math.round((subtotal * num(vatPct)) / 100)
    const final = subtotal + tax + vat
    const inv = invoiceTotal.trim() ? num(invoiceTotal) : null
    const diff = inv !== null ? final - inv : null
    return { gross, discounts, subtotal, tax, vat, final, inv, diff }
  }, [rows, taxPct, vatPct, invoiceTotal])

  function updateRow(itemId: string, patch: Partial<RecRow>) {
    setRows((rs) => rs.map((r) => (r.itemId === itemId ? { ...r, ...patch } : r)))
  }

  function setStatus(r: RecRow, status: ItemStatus) {
    updateRow(r.itemId, { status, receivedQty: status === 'OK' ? r.receivedQty || r.ordered : 0 })
  }

  function handleScan() {
    const code = toEnDigits(scan.trim())
    if (!code) return
    const hit = rows.find((r) => r.barcode === code || r.barcodes.includes(code))
    if (hit) {
      sfxSuccess()
      setScanResult({ ok: true, name: hit.name })
      setFlashId(hit.itemId)
      setTimeout(() => setFlashId(null), 950)
      updateRow(hit.itemId, { scanned: true })
    } else {
      sfxError()
      setScanResult({ ok: false, code })
      setAttachTarget('')
    }
    setScan('')
    scanInputRef.current?.focus()
  }

  function attachBarcode() {
    const code = scanResult?.code
    const target = rows.find((r) => r.itemId === attachTarget)
    if (!target || !code) return
    sfxSuccess()
    setNewBarcodes((nb) => [...nb.filter((b) => b.productId !== target.productId), { productId: target.productId, barcode: code }])
    updateRow(target.itemId, { scanned: true, barcode: target.barcode || code })
    setScanResult({ ok: true, name: target.name })
    toast({ title: 'بارکد جدید ثبت شد', description: `به کالای «${target.name}» اضافه می‌شود.` })
  }

  async function submit() {
    setSubmitting(true)
    try {
      await api.post(`/api/orders/${order.id}/receive`, {
        items: rows.map((r) => ({
          itemId: r.itemId,
          receivedQty: r.status === 'OK' ? r.receivedQty : 0,
          status: r.status,
          note: r.note || undefined,
          printedPrice: num(r.printedPrice) > 0 ? num(r.printedPrice) : undefined,
          discount: num(r.discount),
        })),
        newBarcodes,
        tax: totals.tax,
        vat: totals.vat,
        finalAmount: totals.final,
        invoiceTotal: totals.inv ?? undefined,
      })
      sfxCelebrate()
      onDone(order)
    } catch (e) {
      toast({ title: 'ثبت دریافت ناموفق بود', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  const missingCount = rows.filter((r) => r.status !== 'OK').length
  const diffWarn = totals.diff !== null && Math.abs(totals.diff) > 1000

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <PackageOpen className="size-5 text-gold" />
            ثبت دریافت — سفارش {toFaDigits(order.number)}
          </DialogTitle>
          <DialogDescription>
            {order.supplier.name} • تحویل {toFaDigits(order.deliveryDate)} • {toFaDigits(rows.length)} قلم کالا
          </DialogDescription>
        </DialogHeader>

        {/* barcode scan box */}
        <div className="rounded-2xl border-2 border-gold/40 bg-gold/5 p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-2 text-sm font-bold">
            <ScanBarcode className="size-4 text-gold" /> اسکن بارکد
            <span className="font-normal text-xs text-muted-foreground">بارکد را اسکن یا تایپ کن و Enter بزن</span>
          </div>
          <Input
            ref={scanInputRef}
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleScan() } }}
            placeholder="اسکن بارکد..."
            className="h-12 text-lg font-bold tracking-widest"
            autoFocus
            inputMode="numeric"
          />
          {scanResult?.ok && (
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm font-bold text-emerald-700">
              <CheckCircle2 className="size-4" /> تأیید شد ✓ {scanResult.name && `— ${scanResult.name}`}
            </div>
          )}
          {scanResult && !scanResult.ok && (
            <div className="mt-2 rounded-xl bg-amber-50 border border-amber-300 px-3 py-2 text-sm text-amber-800">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="size-4" /> این بارکد در کالاهای این سفارش پیدا نشد ({toFaDigits(scanResult.code || '')})
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs">افزودن بارکد جدید به کالا:</span>
                <Select value={attachTarget} onValueChange={setAttachTarget}>
                  <SelectTrigger className="h-9 w-52 text-xs">
                    <SelectValue placeholder="کالا را انتخاب کن..." />
                  </SelectTrigger>
                  <SelectContent>
                    {rows.map((r) => (
                      <SelectItem key={r.itemId} value={r.itemId}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-9 bg-olive hover:bg-olive/90" disabled={!attachTarget} onClick={attachBarcode}>
                  افزودن
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* item rows */}
        <div className="space-y-3">
          {rows.map((r) => {
            const price = num(r.printedPrice) > 0 ? num(r.printedPrice) : r.unitPrice
            const lineTotal = r.status === 'OK' ? Math.max(0, r.receivedQty * price - num(r.discount)) : 0
            return (
              <div
                key={r.itemId}
                className={cn(
                  'rounded-2xl border p-3 sm:p-4 transition-colors',
                  r.scanned && 'ring-1 ring-emerald-400 bg-emerald-50/40 border-emerald-300',
                  flashId === r.itemId && 'scan-flash',
                  r.status === 'MISSING' && 'bg-red-50/50 border-red-200',
                  r.status === 'REJECTED' && 'bg-amber-50/50 border-amber-300'
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{r.name}</span>
                      {r.scanned && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[11px] font-bold">
                          <CheckCircle2 className="size-3" /> تأیید شد ✓
                        </span>
                      )}
                    </div>
                    {r.barcode && <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">بارکد: {toFaDigits(r.barcode)}</div>}
                  </div>
                  {/* status buttons */}
                  <div className="flex rounded-xl border overflow-hidden" role="group" aria-label={`وضعیت ${r.name}`}>
                    {([
                      { key: 'OK', label: 'موج', cls: 'data-[on=true]:bg-emerald-600 data-[on=true]:text-white' },
                      { key: 'MISSING', label: 'نیامده', cls: 'data-[on=true]:bg-red-500 data-[on=true]:text-white' },
                      { key: 'REJECTED', label: 'مرجوع', cls: 'data-[on=true]:bg-amber-500 data-[on=true]:text-white' },
                    ] as const).map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        data-on={r.status === s.key}
                        onClick={() => setStatus(r, s.key)}
                        className={cn(
                          'h-11 px-4 text-sm font-bold transition-colors hover:bg-accent',
                          s.cls
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
                  {/* qty stepper */}
                  <div className={cn('flex items-center gap-1.5', r.status !== 'OK' && 'opacity-40 pointer-events-none')}>
                    <button
                      type="button"
                      aria-label="کاهش تعداد"
                      onClick={() => updateRow(r.itemId, { receivedQty: Math.max(0, r.receivedQty - 1) })}
                      className="size-11 rounded-xl border bg-background hover:bg-accent flex items-center justify-center"
                    >
                      <Minus className="size-4" />
                    </button>
                    <input
                      value={toFaDigits(r.receivedQty)}
                      onChange={(e) => updateRow(r.itemId, { receivedQty: num(e.target.value) })}
                      inputMode="numeric"
                      aria-label={`تعداد دریافتی ${r.name}`}
                      className="h-11 w-16 rounded-xl border text-center text-lg font-black tabular-nums bg-background"
                    />
                    <button
                      type="button"
                      aria-label="افزایش تعداد"
                      onClick={() => updateRow(r.itemId, { receivedQty: r.receivedQty + 1 })}
                      className="size-11 rounded-xl border bg-background hover:bg-accent flex items-center justify-center"
                    >
                      <Plus className="size-4" />
                    </button>
                    <span className="text-xs text-muted-foreground">سفارش: {toFaDigits(r.ordered)}</span>
                    {r.receivedQty !== r.ordered && r.status === 'OK' && (
                      <span className="text-[11px] font-bold text-amber-600">کمتر از سفارش</span>
                    )}
                  </div>

                  {/* printed price */}
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">قیمت چاپ‌شده روی کالا (تومان)</label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={r.printedPrice ? toFaDigits(r.printedPrice) : ''}
                        onChange={(e) => updateRow(r.itemId, { printedPrice: e.target.value })}
                        placeholder={formatMoney(r.unitPrice)}
                        inputMode="numeric"
                        className="h-11 w-40 text-sm font-bold"
                      />
                      <span className="text-[11px] text-muted-foreground">
                        فروش فعلی: <b className="text-foreground">{formatMoney(r.sellPrice)}</b>
                      </span>
                    </div>
                  </div>

                  {/* discount */}
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">تخفیف قلم (تومان)</label>
                    <Input
                      value={r.discount ? toFaDigits(r.discount) : ''}
                      onChange={(e) => updateRow(r.itemId, { discount: e.target.value })}
                      placeholder="۰"
                      inputMode="numeric"
                      className="h-11 w-32 text-sm font-bold"
                    />
                  </div>

                  <div className="ms-auto text-left">
                    <div className="text-[11px] text-muted-foreground">جمع ردیف</div>
                    <div className="text-sm font-black tabular-nums">{formatMoney(lineTotal)}</div>
                  </div>
                </div>

                {/* reason note for missing/rejected */}
                {r.status !== 'OK' && (
                  <div className="mt-3">
                    <Input
                      value={r.note}
                      onChange={(e) => updateRow(r.itemId, { note: e.target.value })}
                      placeholder={r.status === 'MISSING' ? 'دلیل نیامدن (اختیاری) — مثلاً: از سفارش کسر شد' : 'دلیل مرجوع کردن (اختیاری) — مثلاً: بسته‌بندی آسیب‌دیده'}
                      className="h-11 text-sm"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* totals panel */}
        <div className="rounded-2xl border-2 border-olive/30 bg-accent/30 p-4 space-y-3">
          <div className="font-bold text-sm flex items-center gap-2">
            <ReceiptText className="size-4 text-olive" /> جمع‌بندی فاکتور
            {missingCount > 0 && (
              <span className="text-[11px] font-bold text-red-600">({toFaDigits(missingCount)} قلم نیامده/مرجوع)</span>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <div className="flex justify-between rounded-lg bg-background px-3 py-2">
              <span className="text-muted-foreground">جمع اقلام دریافتی</span>
              <b className="tabular-nums">{formatMoney(totals.gross)}</b>
            </div>
            <div className="flex justify-between rounded-lg bg-background px-3 py-2">
              <span className="text-muted-foreground">تخفیف‌ها</span>
              <b className="tabular-nums text-red-600">−{formatMoney(totals.discounts)}</b>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2 gap-2">
              <span className="text-muted-foreground shrink-0">مالیات ٪</span>
              <div className="flex items-center gap-2">
                <input
                  value={toFaDigits(taxPct)}
                  onChange={(e) => setTaxPct(e.target.value)}
                  inputMode="decimal"
                  aria-label="درصد مالیات"
                  className="h-9 w-16 rounded-md border text-center text-sm font-bold"
                />
                <b className="tabular-nums text-xs">{formatMoney(totals.tax)}</b>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2 gap-2">
              <span className="text-muted-foreground shrink-0">ارزش افزوده ٪</span>
              <div className="flex items-center gap-2">
                <input
                  value={toFaDigits(vatPct)}
                  onChange={(e) => setVatPct(e.target.value)}
                  inputMode="decimal"
                  aria-label="درصد ارزش افزوده"
                  className="h-9 w-16 rounded-md border text-center text-sm font-bold"
                />
                <b className="tabular-nums text-xs">{formatMoney(totals.vat)}</b>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2 gap-2">
              <span className="text-muted-foreground shrink-0">جمع فاکتور کاغذی (اختیاری)</span>
              <input
                value={invoiceTotal ? toFaDigits(invoiceTotal) : ''}
                onChange={(e) => setInvoiceTotal(e.target.value)}
                placeholder="مبلغ روی فاکتور"
                inputMode="numeric"
                aria-label="جمع فاکتور کاغذی"
                className="h-9 w-32 rounded-md border text-center text-sm font-bold"
              />
            </div>
            {totals.diff !== null && (
              <div className={cn('flex items-center justify-between rounded-lg px-3 py-2', diffWarn ? 'bg-red-50 border border-red-300' : 'bg-background')}>
                <span className={cn('text-muted-foreground', diffWarn && 'text-red-700 font-bold')}>اختلاف با فاکتور اصلی</span>
                <b className={cn('tabular-nums', diffWarn ? 'text-red-700' : '')}>
                  {totals.diff >= 0 ? '+' : '−'}{formatMoney(Math.abs(totals.diff))}
                </b>
              </div>
            )}
          </div>
          {diffWarn && (
            <div className="flex items-center gap-2 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle className="size-4" />
              اختلاف بیش از ۱٬۰۰۰ تومان است — لطفاً یک بار دیگر چک کن (اختلاف کمتر از ۱٬۰۰۰ تومان قابل چشم‌پوشی است).
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-olive/20">
            <div>
              <div className="text-xs text-muted-foreground">مبلغ نهایی سفارش</div>
              <div className="text-xl font-black text-olive tabular-nums">
                <Money value={totals.final} />
              </div>
            </div>
            <Button
              onClick={submit}
              disabled={submitting}
              size="lg"
              className="h-12 px-6 bg-olive hover:bg-olive/90 gap-2"
            >
              {submitting ? <Loader2 className="size-5 animate-spin" /> : <PackageCheck className="size-5" />}
              ثبت دریافت
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// SUPERVISOR INSPECTION
// ============================================================
function InspectDialog({
  order, onClose, onDone,
}: {
  order: QueueOrder
  onClose: () => void
  onDone: (o: QueueOrder) => void
}) {
  const { toast } = useToast()
  const [rows, setRows] = React.useState(() =>
    order.items.map((it) => ({
      itemId: it.id,
      name: it.productName,
      ordered: it.quantity,
      receivedQty: it.receivedQty ?? 0,
      status: it.status as ItemStatus,
      unitPrice: it.unitPrice,
      printedPrice: it.printedPrice ? String(it.printedPrice) : '',
      discount: it.discount ? String(it.discount) : '',
      note: it.note || '',
    }))
  )
  const [note, setNote] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  const totals = React.useMemo(() => {
    let total = 0
    for (const r of rows) {
      const price = num(r.printedPrice) > 0 ? num(r.printedPrice) : r.unitPrice
      total += r.status === 'OK' ? Math.max(0, r.receivedQty * price - num(r.discount)) : 0
    }
    return total
  }, [rows])

  function updateRow(itemId: string, patch: Partial<(typeof rows)[number]>) {
    setRows((rs) => rs.map((r) => (r.itemId === itemId ? { ...r, ...patch } : r)))
  }

  async function submit() {
    setSubmitting(true)
    try {
      await api.post(`/api/orders/${order.id}/inspect`, {
        corrections: rows.map((r) => ({
          itemId: r.itemId,
          printedPrice: num(r.printedPrice) > 0 ? num(r.printedPrice) : undefined,
          discount: num(r.discount),
          note: r.note || undefined,
        })),
        note: note || undefined,
      })
      onDone(order)
    } catch (e) {
      toast({ title: 'ثبت کنترل ناموفق بود', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  const missing = rows.filter((r) => r.status !== 'OK')

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <SearchCheck className="size-5 text-gold" />
            کنترل انبار — سفارش {toFaDigits(order.number)}
          </DialogTitle>
          <DialogDescription>
            {order.supplier.name} • دریافت‌شده در {formatJalaliDateTime(order.receivedAt)}
          </DialogDescription>
        </DialogHeader>

        {missing.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-300 px-3 py-2 text-sm font-bold text-amber-800">
            <AlertTriangle className="size-4" />
            {toFaDigits(missing.length)} قلم نیامده یا مرجوع شده — ردیف‌های مشخص‌شده را ببین.
          </div>
        )}

        <div className="space-y-2.5">
          {rows.map((r) => {
            const price = num(r.printedPrice) > 0 ? num(r.printedPrice) : r.unitPrice
            const shortQty = r.status === 'OK' && r.receivedQty < r.ordered
            return (
              <div
                key={r.itemId}
                className={cn(
                  'rounded-xl border p-3',
                  r.status === 'MISSING' && 'bg-red-50/60 border-red-300',
                  r.status === 'REJECTED' && 'bg-amber-50/60 border-amber-300',
                  shortQty && 'bg-amber-50/40 border-amber-200'
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-sm">{r.name}</div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">
                      سفارش: <b className="text-foreground">{toFaDigits(r.ordered)}</b>
                    </span>
                    <span className="text-muted-foreground">
                      دریافتی:{' '}
                      <b className={cn(r.status === 'OK' ? 'text-emerald-700' : 'text-red-600')}>{toFaDigits(r.receivedQty)}</b>
                    </span>
                    {r.status === 'MISSING' && <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[11px] font-bold">نیامده</span>}
                    {r.status === 'REJECTED' && <span className="rounded-full bg-amber-200 text-amber-800 px-2 py-0.5 text-[11px] font-bold">مرجوع</span>}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">قیمت چاپ‌شده</label>
                    <Input
                      value={r.printedPrice ? toFaDigits(r.printedPrice) : ''}
                      onChange={(e) => updateRow(r.itemId, { printedPrice: e.target.value })}
                      placeholder={formatMoney(r.unitPrice)}
                      inputMode="numeric"
                      className="h-10 w-36 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">تخفیف</label>
                    <Input
                      value={r.discount ? toFaDigits(r.discount) : ''}
                      onChange={(e) => updateRow(r.itemId, { discount: e.target.value })}
                      placeholder="۰"
                      inputMode="numeric"
                      className="h-10 w-28 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">یادداشت</label>
                    <Input
                      value={r.note}
                      onChange={(e) => updateRow(r.itemId, { note: e.target.value })}
                      placeholder="یادداشت (اختیاری)"
                      className="h-10 w-52 text-sm"
                    />
                  </div>
                  <div className="ms-auto text-sm">
                    <span className="text-muted-foreground">جمع: </span>
                    <b className="tabular-nums">{formatMoney(r.status === 'OK' ? Math.max(0, r.receivedQty * price - num(r.discount)) : 0)}</b>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div>
          <label className="text-sm font-bold block mb-1.5">یادداشت کنترل انبار</label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="اگر نکته‌ای هست بنویس — مثلاً کیفیت بسته‌بندی یا هماهنگی با تأمین‌کننده..."
            className="min-h-20"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-accent/40 border border-olive/20 px-4 py-3">
          <div>
            <div className="text-xs text-muted-foreground">مبلغ نهایی پس از کنترل</div>
            <div className="text-xl font-black text-olive tabular-nums"><Money value={totals + (order.tax || 0) + (order.vat || 0)} /></div>
          </div>
          <Button onClick={submit} disabled={submitting} size="lg" className="h-12 px-6 bg-olive hover:bg-olive/90 gap-2">
            {submitting ? <Loader2 className="size-5 animate-spin" /> : <ClipboardCheck className="size-5" />}
            تأیید کنترل انبار
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
