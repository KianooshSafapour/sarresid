'use client'

// Deliveries — receiving queue + processing dialog with barcode scanning
import * as React from 'react'
import { SectionHeader, StatusBadge, EmptyState, LoadingBlock } from '@/components/platform/ui/shared'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PackageCheck, TriangleAlert, CalendarClock, Sun, Loader2, Plus, Minus, ScanLine, Link2, Printer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { money, toFaDigits, formatJalali, formatJalaliFull, formatTime } from '@/lib/jalali'
import { orderStatusInfo, type OrderItemDTO } from '@/lib/types'
import { useApp } from '@/store/app'
import { BarcodeInput } from '@/components/platform/ui/barcode-input'
import { rowCalc, ItemStatusBadge, ITEM_STATUSES, useCatalog, type CatalogBundle } from './commerce-bits'

interface DeliveryOrder {
  id: string
  code: string
  providerName: string
  status: string
  paymentType: string
  receivingDate: string
  finalAmount: number
  itemsCount: number
}

interface OrderFull extends DeliveryOrder {
  note?: string | null
  items: OrderItemDTO[]
}

interface RowState {
  deliveredQty: string
  itemStatus: 'OK' | 'MISSING' | 'REJECTED' | 'CORRECTED'
  correctedPrice: string
  issue: string
}

const DELIVERY_STATUSES = ITEM_STATUSES.filter((s) => s.key !== 'PENDING')

export function Deliveries() {
  const user = useApp((s) => s.user)
  const { data: catalog } = useCatalog()
  const [groups, setGroups] = React.useState<{ today: DeliveryOrder[]; overdue: DeliveryOrder[]; upcoming: DeliveryOrder[] } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [processing, setProcessing] = React.useState<OrderFull | null>(null)

  const canProcess = Boolean(user && (user.isManager || user.roleKeys.some((k) => ['delivery', 'inventory'].includes(k))))

  const refresh = React.useCallback(async () => {
    try {
      const g = await api<{ today: DeliveryOrder[]; overdue: DeliveryOrder[]; upcoming: DeliveryOrder[] }>('/api/deliveries')
      setGroups(g)
    } catch (e) {
      toast({ title: 'خطا در دریافت صف تحویل', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  const openProcessing = async (o: DeliveryOrder) => {
    try {
      const full = await api<OrderFull>(`/api/orders/${o.id}`)
      setProcessing(full)
    } catch (e) {
      toast({ title: 'خطا در باز کردن سفارش', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    }
  }

  const counts = {
    overdue: groups?.overdue.length ?? 0,
    today: groups?.today.length ?? 0,
    upcoming: groups?.upcoming.length ?? 0,
  }

  const printTodayList = () => {
    if (!groups) return
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const rowHtml = (o: DeliveryOrder, tag: string, tone: string) => `
      <tr>
        <td class="num">${esc(tag)}</td>
        <td class="num code">${esc(o.code)}</td>
        <td>${esc(o.providerName)}</td>
        <td class="num">${toFaDigits(o.itemsCount)}</td>
        <td class="num">${toFaDigits(formatTime(o.receivingDate))}</td>
        <td class="num">${toFaDigits(money(o.finalAmount))}</td>
        <td style="color:${tone}">${esc(orderStatusInfo(o.status).label)}</td>
        <td class="box"></td>
      </tr>`
    const overdueRows = groups.overdue.map((o) => rowHtml(o, 'عقب‌افتاده', '#B33A3A')).join('')
    const todayRows = groups.today.map((o) => rowHtml(o, 'امروز', '#3E7C59')).join('')
    const upcomingRows = groups.upcoming.slice(0, 8).map((o) => rowHtml(o, 'آینده', '#2E6E8E')).join('')
    const html = `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8">
    <title>لیست تحویل ${toFaDigits(formatJalaliFull(new Date()))}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Tahoma, sans-serif; padding: 28px 36px; color: #1c241f; }
      .brand { text-align: center; border-bottom: 3px double #C9A227; padding-bottom: 12px; margin-bottom: 4px; }
      .brand h1 { font-size: 21px; margin: 0 0 4px; }
      .brand .sub { color: #8A6F3C; font-size: 11px; letter-spacing: 2px; }
      h2 { text-align: center; font-size: 15px; margin: 14px 0 2px; }
      .meta { text-align: center; color: #666; font-size: 11px; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
      th { background: #3E7C59; color: #fff; padding: 6px 5px; font-size: 10.5px; }
      td { border: 1px solid #d8ded9; padding: 6px 5px; text-align: center; }
      tr:nth-child(even) td { background: #f6f8f6; }
      .code { font-weight: bold; } .box { width: 42px; }
      .note { margin-top: 16px; font-size: 11px; color: #8A6F3C; border: 1px dashed #C9A22788; border-radius: 10px; padding: 8px 12px; }
      .foot { text-align: center; color: #999; font-size: 10px; margin-top: 20px; border-top: 1px dashed #C9A22788; padding-top: 6px; }
    </style></head><body>
      <div class="brand"><h1>هایپر زیتون ✦</h1><div class="sub">HYPER ZEYTOON — KERMAN</div></div>
      <h2>لیست تحویل‌های امروز</h2>
      <div class="meta">تاریخ: ${toFaDigits(formatJalaliFull(new Date()))} — ${toFaDigits(counts.overdue + counts.today)} تحویل (${toFaDigits(counts.overdue)} عقب‌افتاده)</div>
      <table>
        <thead><tr><th>وضعیت زمانی</th><th>کد سفارش</th><th>تأمین‌کننده</th><th>اقلام</th><th>ساعت</th><th>مبلغ (تومان)</th><th>مرحله</th><th>✓</th></tr></thead>
        <tbody>${overdueRows}${todayRows}${upcomingRows}</tbody>
      </table>
      <div class="note">☝ هنگام مراجعه نمایندگی: کد سفارش را اعلام کنید، اقلام را با پرداخت تحویل در سامانه مغایرت‌گیری کنید و چک/رسید را همزمان دریافت دارید.</div>
      <div class="foot">این لیست توسط پلتفرم داخلی هایپر زیتون تولید شده است — ✦</div>
      <script>window.onload = function () { window.print() }</script>
    </body></html>`
    const w = window.open('', '_blank', 'width=920,height=1000')
    if (!w) {
      toast({ title: 'اجازه باز شدن پنجره چاپ داده نشد', description: 'مسدودکننده پاپ‌آپ را خاموش کنید', variant: 'destructive' })
      return
    }
    w.document.write(html)
    w.document.close()
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="تحویل‌ها"
        subtitle="صف دریافت توزیع — اسکن بارکد، مغایرت‌گیری و ثبت اصلاحیه"
        icon={<PackageCheck className="h-6 w-6" />}
        actions={
          counts.overdue + counts.today > 0 ? (
            <Button variant="outline" onClick={printTodayList} className="min-h-11 gap-1.5 border-[#C9A227]/40 text-[#8A6F3C] hover:bg-[#C9A227]/10">
              <Printer className="h-4 w-4" /> چاپ لیست امروز
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <LoadingBlock rows={4} />
      ) : !groups || (counts.overdue + counts.today + counts.upcoming === 0) ? (
        <EmptyState icon={<PackageCheck />} title="صف تحویل خالی است" description="سفارش تأییدشده‌ای برای دریافت وجود ندارد." />
      ) : (
        <div className="space-y-5">
          {counts.overdue > 0 && (
            <Group title="عقب‌افتاده" icon={<TriangleAlert className="h-4 w-4" />} tone="past" orders={groups.overdue} canProcess={canProcess} onOpen={openProcessing} />
          )}
          {counts.today > 0 && (
            <Group title="امروز" icon={<Sun className="h-4 w-4" />} tone="today" orders={groups.today} canProcess={canProcess} onOpen={openProcessing} />
          )}
          {counts.upcoming > 0 && (
            <Group title="آینده" icon={<CalendarClock className="h-4 w-4" />} tone="future" orders={groups.upcoming} canProcess={canProcess} onOpen={openProcessing} />
          )}
        </div>
      )}

      {processing && (
        <ProcessingDialog
          order={processing}
          catalog={catalog}
          onClose={() => setProcessing(null)}
          onDone={() => {
            setProcessing(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

// ---------- group of cards ----------
function Group({
  title, icon, tone, orders, canProcess, onOpen,
}: {
  title: string
  icon: React.ReactNode
  tone: 'past' | 'today' | 'future'
  orders: DeliveryOrder[]
  canProcess: boolean
  onOpen: (o: DeliveryOrder) => void
}) {
  return (
    <div>
      <div className={cn('flex items-center gap-2 mb-2 text-sm font-bold', tone === 'past' && 'text-[#B33A3A]', tone === 'today' && 'text-primary')}>
        {icon}
        <span>{title}</span>
        <span className="num text-xs text-muted-foreground">({toFaDigits(orders.length)})</span>
        <span className="flex-1 h-px bg-border" aria-hidden />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {orders.map((o) => {
          const info = orderStatusInfo(o.status)
          return (
            <div
              key={o.id}
              className={cn(
                'rounded-2xl border bg-card p-4',
                tone === 'past' ? 'border-[#B33A3A] ring-1 ring-[#B33A3A]/25' : 'border-border'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="num font-bold text-sm">{o.code}</span>
                <StatusBadge label={info.label} color={info.color} />
              </div>
              <p className="text-sm mt-1.5">{o.providerName}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                <span>{toFaDigits(o.itemsCount)} قلم</span>
                <span className="num">{formatJalali(o.receivingDate)} — {formatTime(o.receivingDate)}</span>
                <span className="num font-bold text-foreground">{money(o.finalAmount)} تومان</span>
              </div>
              <div className="mt-3 flex justify-end">
                {canProcess ? (
                  <Button size="sm" className="touch-target font-bold" onClick={() => onOpen(o)}>
                    <PackageCheck className="h-4 w-4" /> پرداخت تحویل
                  </Button>
                ) : (
                  <span className="text-[11px] text-muted-foreground">ثبت دریافت توسط تحویل‌گیرنده/انبار انجام می‌شود</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------- processing dialog ----------
function ProcessingDialog({
  order, catalog, onClose, onDone,
}: {
  order: OrderFull
  catalog: CatalogBundle | null
  onClose: () => void
  onDone: () => void
}) {
  const user = useApp((s) => s.user)
  const isAccountant = Boolean(user && (user.isManager || user.roleKeys.includes('accountant')))
  const [rows, setRows] = React.useState<Record<string, RowState>>({})
  const [flashId, setFlashId] = React.useState<string | null>(null)
  const [unknownCode, setUnknownCode] = React.useState<string | null>(null)
  const [attachTarget, setAttachTarget] = React.useState<string>('')
  const [newBarcodes, setNewBarcodes] = React.useState<{ productId: string; code: string }[]>([])
  const [correctionNote, setCorrectionNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const rowRefs = React.useRef<Record<string, HTMLDivElement | null>>({})

  React.useEffect(() => {
    const init: Record<string, RowState> = {}
    for (const it of order.items) {
      init[it.id] = {
        deliveredQty: String(it.deliveredQty ?? it.qty),
        itemStatus: (it.itemStatus === 'PENDING' ? 'OK' : it.itemStatus) as RowState['itemStatus'],
        correctedPrice: it.correctedPrice ? String(it.correctedPrice) : '',
        issue: it.issue ?? '',
      }
    }
    setRows(init)
    setNewBarcodes([])
    setUnknownCode(null)
    setCorrectionNote('')
  }, [order])

  const setRow = (id: string, patch: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const productBarcodeMap = React.useMemo(() => {
    const m = new Map<string, string>() // barcode → productId
    for (const p of catalog?.products ?? []) for (const b of p.barcodes) m.set(b.code, p.id)
    return m
  }, [catalog])

  const itemsByProduct = React.useMemo(() => {
    const m = new Map<string, OrderItemDTO>()
    for (const it of order.items) if (it.productId) m.set(it.productId, it)
    return m
  }, [order])

  const onScan = (code: string) => {
    // 1) direct item barcode
    let target = order.items.find((it) => it.barcode === code)
    // 2) via product barcodes
    if (!target) {
      const productId = productBarcodeMap.get(code)
      if (productId) target = itemsByProduct.get(productId)
    }
    if (target) {
      setUnknownCode(null)
      setFlashId(target.id)
      setTimeout(() => setFlashId((f) => (f === target?.id ? null : f)), 1600)
      setTimeout(() => rowRefs.current[target!.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
    } else {
      // unknown → suggest attach; preselect nearest guess (same product via bundle, else first row)
      setAttachTarget(order.items[0]?.id ?? '')
      setUnknownCode(code)
    }
  }

  const attachBarcode = () => {
    if (!unknownCode || !attachTarget) return
    const it = order.items.find((i) => i.id === attachTarget)
    if (!it) return
    setNewBarcodes((prev) => [...prev.filter((n) => n.code !== unknownCode), { productId: it.productId ?? '', code: unknownCode }])
    setUnknownCode(null)
    toast({ title: `بارکد به «${it.name}» متصل خواهد شد`, description: 'با ثبت دریافت ذخیره می‌شود' })
  }

  // --- keyboard-wedge global capture --------------------------------
  // USB/Bluetooth scanners "type" the code very fast and end with Enter.
  // If focus drifted (e.g. user clicked a status button), the scan would
  // previously be lost. This window-level listener buffers digits typed
  // OUTSIDE inputs/textarea and fires onScan on Enter, like the scanner
  // input itself. Human typing in the qty/price inputs is untouched.
  const wedgeBuf = React.useRef('')
  const wedgeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [wedgeActive, setWedgeActive] = React.useState(false)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      const inField = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
      if (e.key === 'Enter') {
        if (!inField && wedgeBuf.current.trim().length >= 4) {
          e.preventDefault()
          const code = wedgeBuf.current.trim()
          wedgeBuf.current = ''
          setWedgeActive(false)
          onScan(code)
        }
        return
      }
      if (/^\d$/.test(e.key) && !inField) {
        wedgeBuf.current = (wedgeBuf.current + e.key).slice(-32)
        setWedgeActive(true)
        if (wedgeTimer.current) clearTimeout(wedgeTimer.current)
        wedgeTimer.current = setTimeout(() => {
          wedgeBuf.current = ''
          setWedgeActive(false)
        }, 4000)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (wedgeTimer.current) clearTimeout(wedgeTimer.current)
    }
  }, [order, catalog])

  // live recalculated total (OK/CORRECTED rows only)
  const correctedTotal = React.useMemo(() => {
    let sum = 0
    for (const it of order.items) {
      const r = rows[it.id]
      if (!r || (r.itemStatus !== 'OK' && r.itemStatus !== 'CORRECTED')) continue
      const price = r.itemStatus === 'CORRECTED' && r.correctedPrice ? Number(r.correctedPrice) : it.unitPrice
      sum += rowCalc(Number(r.deliveredQty) || 0, price, it.discount).total
    }
    return sum
  }, [rows, order])

  const submit = async () => {
    setSaving(true)
    try {
      const items = order.items.map((it) => {
        const r = rows[it.id]
        return {
          id: it.id,
          deliveredQty: Number(r.deliveredQty) || 0,
          itemStatus: r.itemStatus,
          correctedPrice: r.correctedPrice ? Number(r.correctedPrice) : undefined,
          issue: r.issue || undefined,
        }
      })
      await api(`/api/orders/${order.id}/status`, {
        body: { action: 'receive_delivery', payload: { items, newBarcodes, correctionNote: correctionNote || undefined } },
      })
      toast({ title: `دریافت ${order.code} ثبت شد ✅`, description: 'انبار و حسابداری مطلع شدند' })
      onDone()
    } catch (e) {
      toast({ title: 'خطا در ثبت دریافت', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[94vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <DialogTitle className="num text-base flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" /> پرداخت تحویل — {order.code}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {order.providerName} • دریافت: <span className="num">{formatJalaliFull(order.receivingDate)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* barcode scanner */}
          <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold flex items-center gap-1.5"><ScanLine className="h-4 w-4 text-primary" /> اسکن بارکد</p>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold transition-all',
                  wedgeActive ? 'bg-[#3E7C59] text-white scale-105' : 'bg-accent text-muted-foreground'
                )}
                aria-live="polite"
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', wedgeActive ? 'bg-white animate-pulse' : 'bg-muted-foreground/40')} />
                {wedgeActive ? 'دریافت بارکد…' : 'اسکنر آماده'}
              </span>
            </div>
            <BarcodeInput onScan={onScan} autoFocus placeholder="بارکد را اسکن کنید تا ردیف مربوطه پیدا شود…" />
            {unknownCode && (
              <div className="rounded-xl border border-[#C9A227]/50 bg-[#C9A227]/10 p-3 space-y-2 animate-in fade-in" role="alert">
                <p className="text-xs font-bold text-[#8a6f3c]">بارکد شناخته نشد: <span className="num">{unknownCode}</span></p>
                <p className="text-xs text-muted-foreground">بارکد جدید برای کالای زیر ثبت شود؟</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Select value={attachTarget} onValueChange={setAttachTarget}>
                    <SelectTrigger className="flex-1 h-11 text-xs" aria-label="انتخاب ردیف کالا">
                      <SelectValue placeholder="انتخاب کالا…" />
                    </SelectTrigger>
                    <SelectContent>
                      {order.items.map((it) => (
                        <SelectItem key={it.id} value={it.id} className="text-xs">{it.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="touch-target" onClick={attachBarcode}>
                    <Link2 className="h-4 w-4" /> اتصال بارکد
                  </Button>
                </div>
              </div>
            )}
            {newBarcodes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {newBarcodes.map((n) => {
                  const it = order.items.find((i) => i.productId === n.productId)
                  return (
                    <span key={n.code} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[11px] num">
                      {n.code} ← {it?.name ?? '؟'}
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {/* item rows */}
          {order.items.map((it) => {
            const r = rows[it.id]
            if (!r) return null
            const price = r.itemStatus === 'CORRECTED' && r.correctedPrice ? Number(r.correctedPrice) : it.unitPrice
            const calc = rowCalc(Number(r.deliveredQty) || 0, price, it.discount)
            const counted = r.itemStatus === 'OK' || r.itemStatus === 'CORRECTED'
            return (
              <div
                key={it.id}
                ref={(el) => { rowRefs.current[it.id] = el }}
                className={cn(
                  'rounded-2xl border p-3 bg-card transition-all duration-300',
                  flashId === it.id ? 'ring-2 ring-[#3E7C59] border-[#3E7C59] bg-[#3E7C59]/5' : 'border-border',
                  r.itemStatus === 'CORRECTED' && 'border-[#D9832E]/50'
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold line-clamp-1">{it.name}</p>
                    {it.barcode && <p className="num text-[10px] text-muted-foreground" dir="ltr">{it.barcode}</p>}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <ItemStatusBadge status={r.itemStatus} />
                    <span className="num text-muted-foreground">سفارش: {toFaDigits(Math.round(it.qty))}</span>
                  </div>
                </div>

                {/* status 4-button group */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2.5">
                  {DELIVERY_STATUSES.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      aria-pressed={r.itemStatus === s.key}
                      onClick={() => setRow(it.id, { itemStatus: s.key as RowState['itemStatus'] })}
                      className={cn(
                        'h-11 rounded-xl text-xs font-bold border transition-colors touch-target',
                        r.itemStatus === s.key ? 'text-white border-transparent' : 'bg-card hover:bg-accent'
                      )}
                      style={r.itemStatus === s.key ? { backgroundColor: s.color } : { borderColor: `${s.color}55` }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* qty stepper + corrected price + issue */}
                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                  <div className="flex items-center gap-1 rounded-xl border border-border p-1">
                    <button
                      type="button"
                      aria-label="کاهش تعداد تحویلی"
                      className="h-10 w-10 rounded-lg flex items-center justify-center hover:bg-accent touch-target active:scale-90 transition-transform"
                      onClick={() => setRow(it.id, { deliveredQty: String(Math.max(0, (Number(r.deliveredQty) || 0) - 1)) })}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      aria-label={`تعداد تحویلی ${it.name}`}
                      value={r.deliveredQty}
                      onChange={(e) => setRow(it.id, { deliveredQty: e.target.value.replace(/[^\d.]/g, '') })}
                      inputMode="decimal"
                      className="w-14 h-9 text-center text-sm font-bold num bg-transparent outline-none"
                    />
                    <button
                      type="button"
                      aria-label="افزایش تعداد تحویلی"
                      className="h-10 w-10 rounded-lg flex items-center justify-center hover:bg-accent touch-target active:scale-90 transition-transform text-primary"
                      onClick={() => setRow(it.id, { deliveredQty: String((Number(r.deliveredQty) || 0) + 1) })}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  {(r.itemStatus === 'CORRECTED' || isAccountant) && (
                    <Input
                      value={r.correctedPrice}
                      onChange={(e) => setRow(it.id, { correctedPrice: e.target.value.replace(/[^\d.]/g, '') })}
                      placeholder="قیمت اصلاح‌شده…"
                      inputMode="numeric"
                      className="h-11 w-36 num text-xs"
                      aria-label={`قیمت اصلاح‌شده ${it.name}`}
                    />
                  )}

                  {r.itemStatus !== 'OK' && (
                    <Input
                      value={r.issue}
                      onChange={(e) => setRow(it.id, { issue: e.target.value })}
                      placeholder="توضیح مغایرت…"
                      className="h-11 flex-1 min-w-36 text-xs"
                      aria-label={`توضیح مغایرت ${it.name}`}
                    />
                  )}

                  <span className={cn('ms-auto text-xs num font-bold', counted ? 'text-primary' : 'text-[#B33A3A] line-through')}>
                    {counted ? `${money(calc.total)} تومان` : 'حذف از حساب'}
                  </span>
                </div>
              </div>
            )
          })}

          <Textarea
            value={correctionNote}
            onChange={(e) => setCorrectionNote(e.target.value)}
            placeholder="یادداشت اصلاحیه کلی (اختیاری)…"
            className="min-h-16"
            aria-label="یادداشت اصلاحیه"
          />
        </div>

        {/* summary diff + submit */}
        <div className="shrink-0 border-t border-border bg-card/80 backdrop-blur px-4 py-3 space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span>سفارش: <span className="num font-bold">{money(order.finalAmount)}</span> تومان</span>
            <span>تحویلی اصلاح‌شده: <span className={cn('num font-bold', correctedTotal !== order.finalAmount ? 'text-[#B07D2B]' : 'text-primary')}>{money(correctedTotal)}</span> تومان</span>
            {correctedTotal !== order.finalAmount && (
              <span className="num text-[#B33A3A] font-bold">مغایرت: {money(correctedTotal - order.finalAmount)}</span>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="touch-target" onClick={onClose} disabled={saving}>بستن</Button>
            <Button size="sm" className="touch-target font-bold" onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} ثبت دریافت
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
