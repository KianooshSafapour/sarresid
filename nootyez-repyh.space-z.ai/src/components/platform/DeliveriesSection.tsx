'use client'
import * as React from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle, Camera, CameraOff, CheckCircle2, ChevronDown, ClipboardCheck, Eye, Flashlight, FlashlightOff,
  History, LayoutGrid, Minus, PackageCheck, Plus, ScanLine, Truck, Volume2, VolumeX, X, XCircle,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { hasRole, type OrderT, type OrderItemT, type PUser } from '@/lib/types'
import { fmtJalali, fmtJalaliTime, fmtMoney, toFaDigits, todayISO } from '@/lib/jalali'
import { cn } from '@/lib/utils'
import {
  Badge, Card, EmptyState, Field, GhostButton, GoldButton, inputCls, Loading, Modal, Money,
  PrimaryButton, ProductImage, SectionHeader, Spinner, StatCard, StatusBadge, Tabs, TableWrap, Td, Th,
} from './kit'
import { DeliveryGridSkeleton, TableRowsSkeleton } from './Skeletons'
import {
  isScanMuted, playScanErr, playScanOk, playScanWarn, primeScanAudio, setScanMuted,
} from '@/lib/scan-feedback'
import { logScanEvent, type ScanSource, type ScanStats } from '@/lib/scan-log'

/* =============== BarcodeDetector ambient typing (not in TS DOM lib yet) =============== */

interface BarcodeDetectorResultLike {
  rawValue: string
}

interface BarcodeDetectorLike {
  /** detect() accepts any ImageBitmapSource per spec; we only ever pass the <video> element */
  detect: (source: HTMLVideoElement) => Promise<BarcodeDetectorResultLike[]>
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor
  }
}

/* =============== local types =============== */

type ItemStatus = 'OK' | 'MISSING' | 'REJECTED'
type SheetMode = 'receive' | 'confirm'

interface ListOrder {
  id: number
  code: string
  status: string
  receivingDate: string
  subtotal: number
  vat: number
  total: number
  createdAt: string
  doneAt: string | null
  supplier?: { id: number; name: string; paymentTerms?: string; chequeDays?: number } | null
  _count?: { items: number }
}

interface DetailItem extends OrderItemT {
  product?: { id: number; name: string; barcode: string | null; imageUrl: string | null } | null
}
interface DetailOrder extends OrderT {
  items: DetailItem[]
}

interface RowState {
  qty: number // deliveredQty (receive) / confirmedQty (confirm)
  printed: string
  final: string
  status: ItemStatus
  note: string
}

const VAT_RATE = 0.09
const DELTA_TOLERANCE = 1000 // تومان

/* =============== helpers =============== */

/**
 * Normalize a scanned/typed order code for matching:
 * strip Code39 start/stop `*` and all whitespace, map Persian/Arabic digits
 * to ASCII (manual entry), uppercase. (Inline equivalent of sanitizeCode39
 * from lib/code39 — that one keeps spaces, which scanners do send, and its
 * charset filter would mangle the code shown in error messages.)
 */
function normalizeOrderCode(raw: string): string {
  return String(raw ?? '')
    .replace(/[\s*]+/g, '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .toUpperCase()
}

/**
 * Stable-read dedupe for the camera detection loop: a raw read only counts
 * when the SAME value is seen twice in a row (two consecutive detector hits)
 * — filters one-off glitches/ghost reads. Pure so QA can eval it directly.
 */
function dedupeRead(last: string, raw: string): { accept: boolean; last: string } {
  if (!raw) return { accept: false, last: '' }
  return { accept: raw === last, last: raw }
}

/* QA/debug handles (same convention as window.__errs) — lets headless QA eval
 * the scan normalization/dedupe logic without a camera. */
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__hzScanDebug = { normalizeOrderCode, dedupeRead }
}

/** numeric input → number | null (accepts Persian digits too) */
function num(v: string): number | null {
  const t = String(v).trim().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  if (!t) return null
  const n = Number(t)
  return isFinite(n) ? n : null
}

const round1 = (n: number) => Math.round(n * 100) / 100

function initRows(mode: SheetMode, order: DetailOrder): Record<number, RowState> {
  const rec: Record<number, RowState> = {}
  for (const it of order.items) {
    rec[it.id] = {
      qty: mode === 'receive'
        ? (it.deliveredQty ?? it.qty)
        : (it.confirmedQty ?? it.deliveredQty ?? it.qty),
      printed: String(it.printedPrice ?? it.unitCost ?? 0),
      final: String(it.finalCost ?? it.printedPrice ?? it.unitCost ?? 0),
      status: it.status === 'MISSING' || it.status === 'REJECTED' ? it.status : 'OK',
      note: it.note ?? '',
    }
  }
  return rec
}

const STATUS_OPTS: { v: ItemStatus; label: string; activeCls: string; idleCls: string }[] = [
  { v: 'OK', label: 'سالم', activeCls: 'bg-emerald-500 border-emerald-600 text-white shadow-md', idleCls: 'border-emerald-200 bg-white text-emerald-700' },
  { v: 'MISSING', label: 'ناقص', activeCls: 'bg-amber-500 border-amber-600 text-white shadow-md', idleCls: 'border-amber-200 bg-white text-amber-700' },
  { v: 'REJECTED', label: 'مردود', activeCls: 'bg-rose-500 border-rose-600 text-white shadow-md', idleCls: 'border-rose-200 bg-white text-rose-700' },
]

/* =============== qty stepper (44px touch targets) =============== */

function QtyStepper({ label, value, onChange, inputRef }: {
  label: string
  value: number
  onChange: (n: number) => void
  /** optional external ref to the qty input (scan-to-receive focus shortcut) */
  inputRef?: React.Ref<HTMLInputElement>
}) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-xs font-semibold text-[#4A5A44]">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button" aria-label="کاهش تعداد"
          onClick={() => onChange(Math.max(0, round1(value - 1)))}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#D8D2BC] bg-white text-[#4A5A44] transition hover:bg-[#F3F7EF] active:scale-95"
        >
          <Minus size={16} />
        </button>
        <input
          ref={inputRef}
          type="number" inputMode="decimal" min={0} step="any" aria-label={label}
          value={String(value)}
          onChange={(e) => { const n = Number(e.target.value); onChange(isFinite(n) && n >= 0 ? round1(n) : 0) }}
          className="h-11 w-full min-w-0 rounded-xl border border-[#D8D2BC] bg-white text-center text-sm font-bold tabular-nums text-[#253A2A] outline-none focus:border-[#5F8F55] focus:ring-2 focus:ring-[#93C572]/30"
        />
        <button
          type="button" aria-label="افزایش تعداد"
          onClick={() => onChange(round1(value + 1))}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#D8D2BC] bg-white text-[#4A5A44] transition hover:bg-[#F3F7EF] active:scale-95"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  )
}

/* =============== receive / confirm sheet =============== */

function DeliverySheet({ orderId, mode, viaScan = false, user, onClose, onDone }: {
  orderId: number | null
  mode: SheetMode
  /** sheet opened by an order-code scan (resolveScan hit) → focus the first
   * qty input instead of the inner scan box + briefly flash the first row */
  viaScan?: boolean
  user: PUser
  onClose: () => void
  onDone: () => void
}) {
  const [order, setOrder] = React.useState<DetailOrder | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [rows, setRows] = React.useState<Record<number, RowState>>({})
  const [scan, setScan] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [barcodeFor, setBarcodeFor] = React.useState<number | null>(null)
  const [barcodeVal, setBarcodeVal] = React.useState('')
  const [allOkConfirm, setAllOkConfirm] = React.useState(false) // «همه سالم» overwrite confirm
  const [qtyFlash, setQtyFlash] = React.useState(false) // first-row gold ring flash (scan entry)
  const firstQtyRef = React.useRef<HTMLInputElement | null>(null)
  const qtyFocusDone = React.useRef<number | null>(null) // focus once per opened order

  React.useEffect(() => {
    if (orderId == null) { setOrder(null); return }
    let alive = true
    setLoading(true)
    setOrder(null)
    setScan(''); setBarcodeFor(null); setBarcodeVal(''); setAllOkConfirm(false)
    api.get<DetailOrder>(`/api/orders/${orderId}`)
      .then((o) => { if (!alive) return; setOrder(o); setRows(initRows(mode, o)) })
      .catch(() => { if (!alive) return; toast.error('خطا در بارگذاری سفارش'); onClose() })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [orderId, mode, onClose])

  /* scan-to-receive shortcut: when the sheet was opened by a code scan, put
   * the caret straight into the first qty input (NOT the scan box) and briefly
   * flash the first row so the operator lands where the counts are. */
  React.useEffect(() => {
    if (!viaScan || mode !== 'receive') return
    if (loading || !order || order.items.length === 0) return
    if (qtyFocusDone.current === order.id) return
    qtyFocusDone.current = order.id
    const raf = requestAnimationFrame(() => firstQtyRef.current?.focus())
    setQtyFlash(true)
    const timer = setTimeout(() => setQtyFlash(false), 1500)
    return () => { cancelAnimationFrame(raf); clearTimeout(timer) }
  }, [viaScan, mode, loading, order])

  const upd = (id: number, patch: Partial<RowState>) =>
    setRows((r) => (r[id] ? { ...r, [id]: { ...r[id], ...patch } } : r))

  /* ---- «همه سالم» quick-complete (round-11 rec #4): fill EVERY row's
   * delivered qty = ordered qty + status OK in one tap. Deliberately reuses
   * upd() — the exact state setter each QtyStepper's onChange drives — so the
   * values flow through the SAME rows state and the SAME manual save button
   * below (submit()). Save stays manual: this only pre-fills the sheet and
   * never bypasses the existing receive/confirm path. The viaScan qty-focus
   * logic is untouched (no refs involved). ---- */
  const applyAllOk = () => {
    if (!order) return
    for (const it of order.items) upd(it.id, { qty: it.qty, status: 'OK', note: '' })
    setAllOkConfirm(false)
    toast.success('همه اقلام سالم ثبت شد')
  }

  const onAllOkClick = () => {
    if (!order) return
    // overwrite guard: any row whose current (non-empty) delivered qty differs
    // from the ordered qty we're about to write → inline Persian confirm first
    const overwrites = order.items.some((it) => {
      const r = rows[it.id]
      return r && r.qty !== it.qty
    })
    if (overwrites) setAllOkConfirm(true)
    else applyAllOk()
  }

  /* ---- barcode scan: mark item OK with full qty ---- */
  const handleScan = () => {
    const code = scan.trim()
    if (!code || !order) return
    const it = order.items.find((i) => (i.barcode ?? '') === code || (i.product?.barcode ?? '') === code)
    if (!it) { toast.error('قلمی با این بارکد در سفارش یافت نشد'); return }
    const q = mode === 'receive' ? it.qty : (it.deliveredQty ?? it.qty)
    upd(it.id, { status: 'OK', qty: q, note: '' })
    toast.success(`تایید شد ✓ — ${it.name}`)
    setScan('')
  }

  /* ---- add barcode to an item (product) ---- */
  const saveBarcode = async (itemId: number) => {
    const barcode = barcodeVal.trim()
    if (!barcode || orderId == null) return
    try {
      await api.patch(`/api/orders/${orderId}`, { action: 'addBarcode', userId: user.id, itemId, barcode })
      toast.success('بارکد ذخیره شد ✓')
      setBarcodeVal('')
      setBarcodeFor(null)
      setOrder((o) => (o
        ? { ...o, items: o.items.map((i) => (i.id === itemId && !i.barcode ? { ...i, barcode } : i)) }
        : o))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ذخیره بارکد')
    }
  }

  /* ---- recalc footer ---- */
  const totals = React.useMemo(() => {
    if (!order) return { subtotal: 0, vat: 0, total: 0 }
    let subtotal = 0
    for (const it of order.items) {
      const row = rows[it.id]
      if (!row) continue
      const cost = mode === 'receive'
        ? (num(row.printed) ?? it.unitCost)
        : (num(row.final) ?? it.printedPrice ?? it.unitCost)
      subtotal += cost * row.qty
    }
    const vat = subtotal * VAT_RATE
    return { subtotal, vat, total: subtotal + vat }
  }, [order, rows, mode])

  const delta = order ? totals.total - order.total : 0
  const smallDelta = Math.abs(delta) <= DELTA_TOLERANCE

  const submit = async () => {
    if (!order) return
    setSaving(true)
    try {
      const items = order.items.map((it) => {
        const row = rows[it.id] ?? { qty: 0, printed: '', final: '', status: 'OK' as ItemStatus, note: '' }
        return mode === 'receive'
          ? {
            id: it.id,
            deliveredQty: row.qty,
            printedPrice: num(row.printed),
            status: row.status,
            note: row.note || null,
            finalCost: num(row.printed),
          }
          : {
            id: it.id,
            confirmedQty: row.qty,
            finalCost: num(row.final),
            status: row.status,
            note: row.note || null,
          }
      })
      await api.patch(`/api/orders/${order.id}`, {
        action: mode === 'receive' ? 'receive' : 'confirm',
        userId: user.id,
        items,
      })
      toast.success(mode === 'receive' ? 'تحویل سفارش ثبت شد ✓' : 'تایید نهایی انبار ثبت شد ✓')
      onDone()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ثبت')
    } finally {
      setSaving(false)
    }
  }

  const isToday = order ? order.receivingDate.slice(0, 10) === todayISO() : false

  return (
    <Modal
      open={orderId != null}
      onClose={onClose}
      wide
      title={mode === 'receive' ? 'دریافت تحویل سفارش' : 'تایید نهایی انبار'}
    >
      {loading || !order ? (
        <Loading label="در حال بارگذاری اقلام سفارش…" />
      ) : (
        <div className="space-y-4">
          {/* ---- header ---- */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#E4DCC8] bg-white p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold text-[#253A2A]">{order.code}</span>
                <StatusBadge status={order.status} />
              </div>
              <div className="mt-0.5 text-sm text-[#6B7A66]">تامین‌کننده: <b className="text-[#3E6B4A]">{order.supplier?.name ?? '—'}</b></div>
            </div>
            <div className="text-left">
              <Badge className={isToday ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-[#E4DCC8] bg-[#F5F2E8] text-[#4A5A44]'}>
                {isToday ? 'تحویل صبح امروز' : `تحویل: ${fmtJalali(order.receivingDate)}`}
              </Badge>
              <div className="mt-1 text-xs text-[#8A9884]">
                جمع اصلی سفارش: <b className="tabular-nums">{fmtMoney(order.total)}</b> · {toFaDigits(order.items.length)} قلم
              </div>
            </div>
          </div>

          {/* ---- scan box ---- */}
          <div className="flex items-center gap-2 rounded-xl border border-[#93C572]/50 bg-[#F3F7EF] px-3 py-1.5">
            <ScanLine size={18} className="shrink-0 text-[#3E6B4A]" />
            <input
              autoFocus={!viaScan}
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleScan() } }}
              placeholder="بارکد را اسکن کنید و Enter بزنید…"
              dir="ltr"
              className="h-11 w-full bg-transparent text-sm text-[#253A2A] outline-none placeholder:text-[#A8A28C]"
              aria-label="اسکن بارکد"
            />
          </div>

          {/* ---- «همه سالم» quick-complete (receive mode only, ≥2 items) ---- */}
          {mode === 'receive' && order.items.length >= 2 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <GoldButton
                  type="button"
                  className="min-h-[44px]"
                  title="Mark all items as received & OK"
                  aria-label="همه سالم — Mark all items as received & OK"
                  onClick={onAllOkClick}
                >
                  <PackageCheck size={16} aria-hidden />
                  <span>همه سالم</span>
                  <span
                    className="rounded-full bg-[#3A2E05]/15 px-2 py-0.5 text-[11px] font-extrabold tabular-nums"
                    aria-hidden
                  >
                    {toFaDigits(order.items.length)} قلم
                  </span>
                </GoldButton>
                <span className="hidden text-[11px] font-medium text-[#8A9884] sm:inline" dir="ltr">
                  Mark all items as received & OK
                </span>
              </div>
              {allOkConfirm && (
                <div
                  role="alert"
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2"
                >
                  <AlertTriangle size={16} className="shrink-0 text-amber-600" aria-hidden />
                  <span className="text-xs font-bold text-amber-800">مقادیر واردشده بازنویسی می‌شوند</span>
                  <div className="flex gap-2">
                    <GoldButton type="button" className="min-h-[44px] px-4 py-1.5" onClick={applyAllOk}>
                      تأیید
                    </GoldButton>
                    <GhostButton
                      type="button"
                      className="min-h-[44px] px-4 py-1.5"
                      onClick={() => setAllOkConfirm(false)}
                    >
                      انصراف
                    </GhostButton>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---- item cards ---- */}
          <div className="max-h-[46vh] space-y-3 overflow-y-auto pl-1 pz-scroll">
            {order.items.map((it, idx) => {
              const row = rows[it.id]
              if (!row) return null
              const cost = mode === 'receive'
                ? (num(row.printed) ?? it.unitCost)
                : (num(row.final) ?? it.printedPrice ?? it.unitCost)
              const line = cost * row.qty
              return (
                <Card key={it.id} className={cn('p-3', idx === 0 && qtyFlash && 'pz-focus-flash')}>
                  {/* product head */}
                  <div className="flex items-center gap-3">
                    <ProductImage src={it.product?.imageUrl} name={it.name} size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-[#253A2A]">{it.name}</div>
                      <div className="font-mono text-[11px] text-[#8A9884]" dir="ltr">{it.barcode || it.product?.barcode || '—'}</div>
                      <div className="text-[11px] text-[#6B7A66]">
                        مقدار سفارش: <b className="tabular-nums">{toFaDigits(it.qty)}</b>
                        {mode === 'receive' && it.deliveredQty != null && <> · دریافتی قبلی: <b className="tabular-nums">{toFaDigits(it.deliveredQty)}</b></>}
                      </div>
                    </div>
                    <div className="shrink-0 text-left">
                      <div className="text-[10px] text-[#8A9884]">جمع خط</div>
                      <div className="text-xs font-bold tabular-nums text-[#3E6B4A]">{fmtMoney(line)}</div>
                    </div>
                  </div>

                  {/* qty + price */}
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <QtyStepper
                      label={mode === 'receive' ? 'تعداد دریافتی' : 'تعداد تایید نهایی'}
                      value={row.qty}
                      onChange={(n) => upd(it.id, { qty: n })}
                      inputRef={idx === 0 ? firstQtyRef : undefined}
                    />
                    {mode === 'receive' ? (
                      <Field label="قیمت چاپ‌شده (تومان)" hint="قیمت چاپ‌شده روی بسته">
                        <input
                          type="number" inputMode="decimal" min={0} step="any"
                          value={row.printed}
                          onChange={(e) => upd(it.id, { printed: e.target.value })}
                          className={inputCls}
                        />
                      </Field>
                    ) : (
                      <Field label="قیمت نهایی واحد (تومان)" hint="پیش‌فرض: قیمت چاپ‌شده / قیمت خرید">
                        <input
                          type="number" inputMode="decimal" min={0} step="any"
                          value={row.final}
                          onChange={(e) => upd(it.id, { final: e.target.value })}
                          className={inputCls}
                        />
                      </Field>
                    )}
                  </div>

                  {/* status toggles */}
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {STATUS_OPTS.map((o) => (
                      <button
                        key={o.v} type="button"
                        onClick={() => upd(it.id, { status: o.v })}
                        aria-pressed={row.status === o.v}
                        className={cn(
                          'min-h-[44px] rounded-xl border-2 px-2 text-sm font-bold transition-all active:scale-[0.98]',
                          row.status === o.v ? o.activeCls : o.idleCls
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>

                  {/* note when MISSING / REJECTED */}
                  {row.status !== 'OK' && (
                    <div className="mt-3">
                      <Field label="توضیح" hint="دلیل ناقص یا مردود بودن را بنویسید">
                        <input
                          value={row.note}
                          onChange={(e) => upd(it.id, { note: e.target.value })}
                          placeholder="مثلاً: ۲ عدد شکسته بود"
                          className={inputCls}
                        />
                      </Field>
                    </div>
                  )}

                  {/* add barcode */}
                  <div className="mt-3">
                    {barcodeFor === it.id ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          autoFocus
                          value={barcodeVal}
                          onChange={(e) => setBarcodeVal(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveBarcode(it.id) } }}
                          placeholder="بارکد جدید را اسکن/وارد کنید…"
                          dir="ltr"
                          className={cn(inputCls, 'font-mono')}
                        />
                        <div className="flex gap-2">
                          <PrimaryButton type="button" className="min-h-[44px] flex-1" onClick={() => saveBarcode(it.id)}>ذخیره بارکد</PrimaryButton>
                          <GhostButton type="button" className="min-h-[44px]" onClick={() => { setBarcodeFor(null); setBarcodeVal('') }}>لغو</GhostButton>
                        </div>
                      </div>
                    ) : (
                      <GhostButton type="button" className="min-h-[44px] w-full sm:w-auto" onClick={() => { setBarcodeFor(it.id); setBarcodeVal('') }}>
                        افزودن بارکد
                      </GhostButton>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>

          {/* ---- recalc footer ---- */}
          <Card className="border-[#EAD9A8] bg-gradient-to-br from-[#FFFDF5] to-[#FBF3DC] p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[11px] text-[#8A6508]">جمع اقلام</div>
                <div className="text-sm font-bold tabular-nums text-[#253A2A]">{fmtMoney(totals.subtotal)}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#8A6508]">مالیات بر ارزش افزوده (۹٪)</div>
                <div className="text-sm font-bold tabular-nums text-[#253A2A]">{fmtMoney(totals.vat)}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#8A6508]">جمع کل</div>
                <div className="text-sm font-extrabold tabular-nums text-[#3E6B4A]">{fmtMoney(totals.total)}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#EFE0B8] pt-3">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold',
                  smallDelta ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-amber-50 text-amber-800'
                )}
              >
                {smallDelta
                  ? '✓ اختلاف جزئی قابل قبول'
                  : `اختلاف با سفارش اصلی: ${delta > 0 ? '+' : '−'}${fmtMoney(Math.abs(delta))}`}
              </span>
              <span className="text-[11px] text-[#8A9884]">مبدا مقایسه: جمع ثبت‌شده سفارش ({fmtMoney(order.total)})</span>
            </div>
            <PrimaryButton className="mt-3 min-h-[48px] w-full text-base" onClick={submit} disabled={saving}>
              {saving
                ? 'در حال ثبت…'
                : mode === 'receive'
                  ? 'ثبت دریافت تحویل'
                  : 'ثبت تایید نهایی انبار'}
            </PrimaryButton>
          </Card>
        </div>
      )}
    </Modal>
  )
}

/* =============== scan-in bar (closes the printed → scanned loop) =============== */

type ScanOutcome = { kind: 'ok' | 'warn' | 'err'; text: string }
type CamStatus = 'starting' | 'live' | 'unsupported' | 'unavailable'

const SCAN_RECENT_KEY = 'hz_scan_recent'

/** one cream summary block inside the scan-stats panel (Persian digits) */
function ScanStatBlock({ label, value, tone }: { label: string; value: string; tone?: 'gold' | 'olive' | 'rose' }) {
  return (
    <div className="rounded-xl border border-[#EAD9A8] bg-[#FFFDF5] px-3 py-2.5 text-center">
      <div className="text-[11px] font-semibold text-[#8A6508]">{label}</div>
      <div className={cn(
        'mt-0.5 text-lg font-extrabold tabular-nums',
        tone === 'olive' ? 'text-[#3E6B4A]' : tone === 'rose' ? 'text-rose-700' : tone === 'gold' ? 'text-[#B8860B]' : 'text-[#253A2A]',
      )}>{value}</div>
    </div>
  )
}

function readRecentCodes(): string[] {
  try {
    const raw = window.sessionStorage.getItem(SCAN_RECENT_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((c) => typeof c === 'string').slice(0, 3) : []
  } catch {
    return []
  }
}

function writeRecentCodes(codes: string[]) {
  try {
    window.sessionStorage.setItem(SCAN_RECENT_KEY, JSON.stringify(codes.slice(0, 3)))
  } catch {
    /* private mode etc. */
  }
}

/**
 * Gold/olive scan bar at the top of Deliveries. Barcode scanners behave like
 * keyboards and send Enter after the code, so the input submits on Enter;
 * a gold button covers manual entry. Outcomes come from the parent's
 * `resolve` (match → open detail, order-without-delivery → hint, unknown →
 * error + shake). Keeps the last 3 resolved codes as re-open chips (persisted
 * in sessionStorage so the trail survives the detail open/close round-trip).
 */
function ScanBar({ resolve, stats, statsBusy = false, onLoadStats }: {
  resolve: (rawCode: string, source?: ScanSource) => Promise<ScanOutcome>
  /** manager-only scan-adoption mini stats (undefined for staff) — loaded lazily by the parent */
  stats?: ScanStats | null
  /** true while a stats refetch is in flight → panel dims subtly, previous data stays */
  statsBusy?: boolean
  /** manager-gated (re)fetch of /api/scan-log/stats for a range (7|30) — panel open + range switches */
  onLoadStats?: (days: number) => void
}) {
  const [value, setValue] = React.useState('')
  const [outcome, setOutcome] = React.useState<ScanOutcome | null>(null)
  const [looking, setLooking] = React.useState(false)
  const [shaking, setShaking] = React.useState(false)
  const [recent, setRecent] = React.useState<string[]>([])   // hydrated after mount (SSR-safe)
  const [muted, setMuted] = React.useState(false)            // default ON; synced from storage after mount
  const [camOpen, setCamOpen] = React.useState(false)        // camera-scan modal
  const [camLive, setCamLive] = React.useState(false)        // camera stream active → gold tint on button
  const [statsOpen, setStatsOpen] = React.useState(false)    // manager stats panel (chip toggle)
  const [panelDays, setPanelDays] = React.useState(7)        // panel range: 7 | 30
  const recentRef = React.useRef<string[]>([])               // mirror — survives unmount-timing races
  const inputRef = React.useRef<HTMLInputElement>(null)
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const shakeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    const saved = readRecentCodes()
    recentRef.current = saved
    setRecent(saved)
    setMuted(isScanMuted())
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      if (shakeTimer.current) clearTimeout(shakeTimer.current)
    }
  }, [])

  /** record a resolved code — writes storage imperatively first, because a
   * successful resolve may unmount this bar in the same commit (detail opens)
   * and React discards pending updates (never running updater side-effects). */
  const addRecent = (code: string) => {
    const next = [code, ...recentRef.current.filter((c) => c !== code)].slice(0, 3)
    recentRef.current = next
    writeRecentCodes(next)
    setRecent(next)
  }

  const submit = async (rawOverride?: string, source: ScanSource = 'manual') => {
    if (looking) return
    const code = normalizeOrderCode(rawOverride ?? value)
    if (!code) return // empty input → ignore silently
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
    setOutcome(null)
    setLooking(true)
    try {
      const res = await resolve(code, source)
      setOutcome(res)
      // sound + haptics feedback (muted flag respected inside scan-feedback)
      if (res.kind === 'err') playScanErr()
      else if (res.kind === 'warn') playScanWarn()
      else playScanOk()
      if (res.kind === 'err') {
        // miss → shake + keep the input focused for the next scan
        setShaking(false)
        if (shakeTimer.current) clearTimeout(shakeTimer.current)
        shakeTimer.current = setTimeout(() => setShaking(false), 520)
        requestAnimationFrame(() => setShaking(true))
        inputRef.current?.focus()
      } else {
        addRecent(code)
        if (res.kind === 'warn') inputRef.current?.focus()
        if (res.kind === 'ok') {
          hideTimer.current = setTimeout(() => setOutcome(null), 6000)
        }
      }
    } finally {
      setLooking(false)
      setValue('')
    }
  }

  /* keep a fresh submit reference for stable camera callbacks (the modal's
   * effect deps must never change identity, or the stream would restart) */
  const submitRef = React.useRef(submit)
  React.useEffect(() => { submitRef.current = submit })

  const handleCamCode = React.useCallback((raw: string) => {
    setCamOpen(false)
    setCamLive(false)
    void submitRef.current(raw, 'camera') // same resolve() flow, logged as a camera scan
  }, [])
  const handleCamClose = React.useCallback(() => {
    setCamOpen(false)
    setCamLive(false)
  }, [])
  const handleCamStatus = React.useCallback((s: CamStatus) => setCamLive(s === 'live'), [])

  /* scan-adoption chip + panel math (manager only) — pure divs, no chart lib.
   * statsDaysCount = window length of the LOADED payload (byDay is zero-filled
   * with exactly `days` entries) — keeps chip/panel labels truthful after a
   * 30-day refetch. */
  const statsDaysCount = stats ? stats.byDay.length : 7
  const statsMax = stats ? Math.max(1, ...stats.byDay.map((d) => d.count)) : 1
  const statsBars = stats
    ? stats.byDay.map((d) => Math.max(d.count > 0 ? 18 : 12, Math.round((d.count / statsMax) * 100)))
    : []
  const cameraShare = stats && stats.total > 0 ? Math.round((stats.bySource.camera / stats.total) * 100) : 0
  const statsTitle = stats
    ? `اسکن‌های ${toFaDigits(statsDaysCount)} روز اخیر: ${toFaDigits(stats.total)} — موفق: ${toFaDigits(stats.hits + stats.closed)} — بدون تحویل/ناموفق: ${toFaDigits(stats.issues)} — سهم دوربین: ${toFaDigits(cameraShare)}٪`
    : ''

  /* panel-only math: per-user leaderboard + trend summary */
  const panelPerUser = stats?.perUser ?? []
  const leaderTotal = Math.max(1, ...panelPerUser.map((u) => u.total))
  const activeDays = stats ? stats.byDay.filter((d) => d.count > 0).length : 0

  return (
    <>
      <section
      aria-label="اسکن بارکد تحویل"
      className={cn(
        'relative mb-4 overflow-hidden rounded-2xl border border-[#EAD9A8] bg-gradient-to-l from-[#F3F7EF] via-[#FBF9F3] to-[#FFFDF5] p-4 shadow-[0_2px_14px_-4px_rgba(90,74,32,0.14)]',
        shaking && 'pz-shake'
      )}
    >
      {/* header: title + hint + example legend */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#B8860B] to-[#DAA520] text-white shadow-md shadow-amber-700/20">
            <ScanLine size={20} />
          </span>
          <div>
            <div className="text-sm font-extrabold text-[#253A2A]">اسکن تحویل | Scan-in</div>
            <div className="text-[11px] text-[#8A9884]">بارکد حک‌شده روی چاپ سفارش را اسکن کنید</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* scan-adoption mini stats chip → expandable stats toggle — managers only
           * (loaded lazily by the parent; staff render nothing). Opens the stats
           * panel rendered right after the section below. */}
          {stats && (
            <button
              type="button"
              data-scan-stats
              onClick={() => {
                const next = !statsOpen
                setStatsOpen(next)
                if (next) onLoadStats?.(panelDays) // fresh numbers every time the panel opens
              }}
              aria-expanded={statsOpen}
              aria-controls="scan-stats-panel"
              title={statsTitle}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#EAD9A8] bg-gradient-to-l from-[#FFFDF5] via-[#FBF6E8] to-[#F7F0DA] px-3 py-1 shadow-[0_1px_5px_-2px_rgba(138,101,8,0.4)] transition-all hover:-translate-y-0.5 hover:shadow-[0_5px_12px_-4px_rgba(138,101,8,0.5)] active:translate-y-0 active:scale-[0.98]"
            >
              <span className="whitespace-nowrap text-[11px] font-bold leading-none text-[#8A6508]">
                اسکن {toFaDigits(statsDaysCount)} روز: {toFaDigits(stats.total)} — موفق {toFaDigits(stats.hits + stats.closed)}
              </span>
              <span aria-hidden className="flex h-4 items-end gap-[2px]">
                {statsBars.map((h, i) => (
                  <span
                    key={i}
                    className={cn(
                      'w-[5px] rounded-t-[2px]',
                      i === statsBars.length - 1 ? 'bg-[#DAA520]' : 'bg-[#9DB48A]',
                    )}
                    style={{ height: `${h}%` }}
                  />
                ))}
              </span>
              <span className="whitespace-nowrap rounded-full border border-[#CBDCC4] bg-[#F3F7EF] px-1.5 py-[3px] text-[10px] font-bold leading-none text-[#4A5A44]">
                دوربین {toFaDigits(cameraShare)}٪
              </span>
              <ChevronDown
                size={13}
                aria-hidden
                className={cn('shrink-0 text-[#8A6508]/80 transition-transform duration-200', statsOpen && 'rotate-180')}
              />
            </button>
          )}
          {/* mute toggle — sound + haptics feedback, persisted in localStorage */}
          <button
            type="button"
            onClick={() => {
              const next = !muted
              setMuted(next)
              setScanMuted(next)
              if (!next) primeScanAudio()
            }}
            aria-pressed={!muted}
            aria-label={muted ? 'صدای اسکن خاموش است — برای وصل کردن کلیک کنید' : 'صدای اسکن روشن است — برای قطع کردن کلیک کنید'}
            title={muted ? 'صدای اسکن خاموش است — برای وصل کردن کلیک کنید' : 'صدای اسکن روشن است — برای قطع کردن کلیک کنید'}
            className={cn(
              'inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold transition-all active:scale-95',
              muted
                ? 'border-stone-300 bg-stone-100 text-stone-500'
                : 'border-[#CBDCC4] bg-[#F3F7EF] text-[#4A5A44] hover:border-[#DAA520] hover:text-[#8A6508]',
            )}
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            {muted ? 'صدا خاموش' : 'صدا روشن'}
          </button>
          <Badge className="pz-barcode border-[#EAD9A8] bg-[#FFFDF5] text-[11px] text-[#8A6508]">مثال: HZ-1005</Badge>
        </div>
      </div>

      {/* input row: scanner line + icon + LTR mono input + submit button */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div
          className={cn(
            'relative flex-1 rounded-xl border border-[#E4DCC8] bg-white transition-all',
            'focus-within:border-[#DAA520] focus-within:shadow-[0_0_0_4px_rgba(218,165,32,0.16)]'
          )}
        >
          <span aria-hidden className="pz-scanline left-1.5" />
          <ScanLine size={18} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[#B8860B]/70" aria-hidden />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit() } }}
            placeholder="کد سفارش را اسکن یا وارد کنید… | Scan order code"
            dir="ltr"
            aria-label="کد سفارش را اسکن یا وارد کنید"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="h-12 min-h-[48px] w-full bg-transparent pl-12 pr-4 pz-barcode text-base font-bold tracking-widest text-[#253A2A] outline-none placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-[#A8A28C]"
          />
        </div>
        {/* camera scan — BarcodeDetector API with graceful fallback */}
        <button
          type="button"
          onClick={() => { primeScanAudio(); setCamOpen(true) }}
          aria-label="اسکن با دوربین"
          title="اسکن با دوربین"
          className={cn(
            'flex h-12 min-h-[48px] w-full shrink-0 items-center justify-center gap-2 rounded-xl border text-sm font-bold transition-all active:scale-95 sm:w-12',
            camLive
              ? 'border-[#DAA520] bg-[#FFFDF5] text-[#B8860B] shadow-[0_0_0_3px_rgba(218,165,32,0.18)]'
              : 'border-[#E4DCC8] bg-white text-[#4A5A44] hover:border-[#DAA520] hover:bg-[#FFFDF5] hover:text-[#8A6508]',
          )}
        >
          <Camera size={19} />
          <span className="sm:hidden">دوربین</span>
        </button>
        <GoldButton
          type="button"
          onClick={() => void submit()}
          disabled={looking}
          className="min-h-[48px] shrink-0 px-5"
        >
          {looking ? <Spinner /> : <ScanLine size={17} />} باز کردن
        </GoldButton>
      </div>

      {/* outcome banners */}
      {outcome?.kind === 'ok' && (
        <div role="status" className="mt-2.5 flex items-center gap-2 rounded-xl border border-[#EAD9A8] bg-[#FFFDF5] px-3 py-2.5 text-sm font-bold text-[#8A6508]">
          <CheckCircle2 size={17} className="shrink-0" />
          <span>{outcome.text}</span>
        </div>
      )}
      {outcome?.kind === 'warn' && (
        <div role="status" className="mt-2.5 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-bold text-amber-800">
          <AlertTriangle size={17} className="shrink-0" />
          <span>{outcome.text}</span>
        </div>
      )}
      {outcome?.kind === 'err' && (
        <div role="alert" className="mt-2.5 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-bold text-rose-700">
          <XCircle size={17} className="shrink-0" />
          <span>{outcome.text}</span>
        </div>
      )}

      {/* recently scanned trail (click = re-open) */}
      {recent.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-[#8A9884]">اسکن‌های اخیر:</span>
          {recent.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => void submit(c)}
              aria-label={`باز کردن مجدد ${c}`}
              className="pz-barcode inline-flex min-h-[44px] items-center rounded-full border border-[#E4DCC8] bg-white px-3 py-1 text-xs font-bold tracking-wider text-[#4A5A44] transition-all hover:border-[#DAA520] hover:bg-[#FFFDF5] hover:text-[#8A6508] active:scale-[0.97]"
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </section>

    {/* manager scan-stats panel (chip toggle) — rendered right after the scan-bar
     * section, OUTSIDE it (the section's pz-shake transform must not affect it).
     * Entrance animation .pz-panel-in is motion-safe; refetches dim the content
     * subtly while previous data stays on screen. */}
    {stats && statsOpen && (
      <div
        id="scan-stats-panel"
        role="region"
        aria-label="آمار اسکن"
        className="pz-panel-in mb-4 rounded-2xl border border-[#EAD9A8] bg-gradient-to-br from-[#FFFDF5] via-[#FBF6E8] to-[#F3F7EF] p-4 shadow-[0_8px_20px_-10px_rgba(90,74,32,0.28)]"
      >
        <div className={cn('space-y-3 transition-opacity duration-200', statsBusy && 'opacity-60')}>
          {/* header: title + 7/30-day range toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-extrabold text-[#253A2A]">
              آمار اسکن | Scan stats
              <span className="mr-2 text-[11px] font-semibold text-[#8A9884]">{toFaDigits(statsDaysCount)} روز اخیر</span>
            </div>
            <div className="flex items-center gap-1.5" role="group" aria-label="بازه آمار اسکن">
              {[7, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={panelDays === d}
                  onClick={() => {
                    if (d === panelDays) return
                    setPanelDays(d)
                    onLoadStats?.(d) // silent fail — previous payload stays while loading
                  }}
                  className={cn(
                    'min-h-[44px] rounded-full border px-4 text-xs font-bold transition-all active:scale-95',
                    panelDays === d
                      ? 'border-[#B8860B] bg-gradient-to-b from-[#DAA520] to-[#B8860B] text-white shadow-md'
                      : 'border-[#EAD9A8] bg-white text-[#8A6508] hover:bg-[#FFFDF5]',
                  )}
                >
                  {d === 7 ? '۷ روز' : '۳۰ روز'}
                </button>
              ))}
            </div>
          </div>

          {/* summary blocks */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ScanStatBlock label="کل اسکن‌ها" value={toFaDigits(stats.total)} />
            <ScanStatBlock label="موفق" value={toFaDigits(stats.hits + stats.closed)} tone="olive" />
            <ScanStatBlock label="بدون تحویل و خطا" value={toFaDigits(stats.issues)} tone="rose" />
            <ScanStatBlock label="سهم دوربین" value={`${toFaDigits(cameraShare)}٪`} tone="gold" />
          </div>

          {/* daily trend — pure-div sparkline, responsive bars (thin bars for 30d) */}
          <div className="rounded-xl border border-[#EAD9A8] bg-white/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#4A5A44]">روند اسکن روزانه</span>
              <span className="text-[10px] font-semibold text-[#8A9884]">
                <span aria-hidden className="ml-1 inline-block h-2 w-2 rounded-sm bg-[#DAA520] align-middle" />
                امروز
              </span>
            </div>
            <span className="sr-only">
              {`روند اسکن ${toFaDigits(statsDaysCount)} روز اخیر: مجموع ${toFaDigits(stats.total)} اسکن؛ ${toFaDigits(activeDays)} روز فعال؛ بیشترین اسکن در یک روز: ${toFaDigits(statsMax)}.`}
            </span>
            <div aria-hidden className="flex h-12 w-full items-end justify-center gap-[2px]">
              {stats.byDay.map((d, i) => (
                  <span
                    key={d.dayISO}
                    title={`${d.dayISO}: ${toFaDigits(d.count)} اسکن`}
                    className={cn(
                      'flex-1 rounded-t-[3px]',
                      statsDaysCount > 10 ? 'max-w-[4px]' : 'max-w-[24px]',
                      i === stats.byDay.length - 1 ? 'bg-[#DAA520]' : 'bg-[#9DB48A]',
                    )}
                    style={{ height: `${Math.max(d.count > 0 ? 18 : 6, Math.round((d.count / statsMax) * 100))}%` }}
                  />
              ))}
            </div>
          </div>

          {/* per-user leaderboard («برترین اسکن‌کننده‌ها») */}
          <div className="rounded-xl border border-[#EAD9A8] bg-white/60 p-3">
            <div className="mb-2 text-xs font-bold text-[#4A5A44]">برترین اسکن‌کننده‌ها <span className="font-semibold text-[#8A9884]">| Top scanners</span></div>
            {panelPerUser.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#E4DCC8] bg-[#FBF9F3] px-3 py-4 text-center text-xs font-semibold text-[#8A9884]">
                هنوز اسکنی ثبت نشده است
              </div>
            ) : (
              <ol className="grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
                {panelPerUser.map((u, i) => {
                  const rank = i + 1
                  const share = Math.max(4, Math.round((u.total / leaderTotal) * 100))
                  return (
                    <li key={u.userName} className="flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white shadow-sm',
                          rank === 1 && 'bg-gradient-to-br from-[#B8860B] to-[#DAA520]',
                          rank === 2 && 'bg-gradient-to-br from-[#A8A8A2] to-[#7E7F78]',
                          rank === 3 && 'bg-gradient-to-br from-[#B08D57] to-[#8C6D3F]',
                          rank > 3 && 'border border-[#CBDCC4] bg-[#F3F7EF] text-[#4A5A44] shadow-none',
                        )}
                      >
                        {toFaDigits(rank)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-xs font-bold text-[#253A2A]">{u.userName}</span>
                          <span className="whitespace-nowrap text-[11px] font-bold tabular-nums text-[#8A6508]">
                            {toFaDigits(u.total)} اسکن
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#EFE9D6]">
                          <div
                            className="h-full rounded-full bg-gradient-to-l from-[#5F7A4E] to-[#DAA520]"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                        <div className="mt-0.5 text-[10px] font-semibold text-[#8A9884]">
                          موفق {toFaDigits(u.hits)} از {toFaDigits(u.total)}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </div>
      </div>
    )}

    {/* camera-scan modal lives OUTSIDE the section (the section animates
     * transform on pz-shake, which would trap position:fixed children) */}
    <ScanCameraModal open={camOpen} onClose={handleCamClose} onCode={handleCamCode} onStatusChange={handleCamStatus} />
    </>
  )
}

/* =============== camera scan modal (BarcodeDetector + graceful fallback) =============== */

/**
 * Full-screen camera viewfinder for order-barcode scanning.
 * - Feature detection first: no BarcodeDetector / no getUserMedia → «unsupported»
 *   fallback (browser can't do it). getUserMedia failure (denied / no device /
 *   busy / insecure context) → «unavailable» fallback with a specific hint.
 * - Live path: environment-facing stream in a premium viewfinder (gold corner
 *   brackets, pz-cam-beam sweep), code_39 polled ~250 ms; a read is accepted
 *   only when the same raw value appears twice in a row (dedupeRead) →
 *   stop stream → onCode(rawValue) → the ScanBar runs its normal resolve().
 * - All tracks stop on close, on tab-hide (visibilitychange) and on unmount.
 */
function ScanCameraModal({ open, onClose, onCode, onStatusChange }: {
  open: boolean
  onClose: () => void
  onCode: (raw: string) => void
  onStatusChange?: (status: CamStatus) => void
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const [status, setStatus] = React.useState<CamStatus>('starting')
  const [errHint, setErrHint] = React.useState('')
  const [torchOn, setTorchOn] = React.useState(false) // torch constraint currently applied
  const [torchOk, setTorchOk] = React.useState(false) // device reports torch capability → show toggle

  const stopStream = React.useCallback(() => {
    const st = streamRef.current
    if (!st) return
    // stopping the tracks also kills an active torch — the explicit state
    // reset just keeps the UI honest for the next open
    setTorchOn(false)
    setTorchOk(false)
    for (const t of st.getTracks()) t.stop()
    streamRef.current = null
  }, [])

  /** torch toggle — feature-detected upstream; a failed constraint silently
   * keeps the previous state (button simply stays as it was) */
  const toggleTorch = React.useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints)
      setTorchOn(next)
    } catch {
      /* torch not applied — state stays as it was */
    }
  }, [torchOn])

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const apply = (s: CamStatus) => {
      setStatus(s)
      onStatusChange?.(s)
    }

    /** first stable read → stop everything, hand the raw code to the bar */
    const finish = (raw: string) => {
      cancelled = true
      if (timer) { clearInterval(timer); timer = null }
      stopStream()
      onCode(raw)
    }

    const start = async () => {
      apply('starting')
      setErrHint('')
      const Ctor = window.BarcodeDetector
      if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
        apply('unsupported')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop()
          return
        }
        streamRef.current = stream
        const v = videoRef.current
        if (v) {
          v.srcObject = stream
          try { await v.play() } catch { /* muted+playsInline usually autoplay fine */ }
        }
        const detector = new Ctor({ formats: ['code_39'] })
        apply('live')
        // torch capability — desktop/headless webcams lack it → toggle stays hidden entirely
        const caps = stream.getVideoTracks()[0]?.getCapabilities?.() as
          | (MediaTrackCapabilities & { torch?: boolean })
          | undefined
        setTorchOk(caps?.torch === true)
        setTorchOn(false)
        let last = ''
        timer = setInterval(() => {
          if (cancelled) return
          const vid = videoRef.current
          if (!vid || vid.readyState < 2 || vid.videoWidth === 0) return
          detector.detect(vid)
            .then((hits) => {
              if (cancelled) return
              const raw = hits && hits.length > 0 && hits[0]?.rawValue ? String(hits[0].rawValue) : ''
              if (!raw) return
              const d = dedupeRead(last, raw)
              last = d.last
              if (d.accept) finish(raw)
            })
            .catch(() => { /* transient decode failure — keep polling */ })
        }, 250)
      } catch (e) {
        if (cancelled) return
        const name = e instanceof DOMException ? e.name : ''
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
          setErrHint('دسترسی به دوربین رد شد. لطفاً از نوار آدرس مرورگر اجازه دوربین را برای این صفحه فعال کنید.')
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
          setErrHint('دوربینی روی این دستگاه پیدا نشد.')
        } else if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
          setErrHint('دوربین در دسترس نیست — احتمالاً برنامه دیگری آن را در حال استفاده است.')
        } else {
          setErrHint('باز کردن دوربین ممکن نشد — این قابلیت به محیط امن (HTTPS) نیاز دارد.')
        }
        apply('unavailable')
      }
    }

    void start()

    // extra safety: stop the camera when the tab is hidden or Escape pressed
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose() }
    const onVis = () => { if (document.hidden) onClose() }
    document.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelled = true
      if (timer) { clearInterval(timer); timer = null }
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVis)
      stopStream()
    }
  }, [open, onClose, onCode, onStatusChange, stopStream])

  if (!open) return null

  const fallback = status === 'unsupported' || status === 'unavailable'

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="اسکن بارکد سفارش با دوربین"
      className="fixed inset-0 z-[60] flex flex-col bg-[#0E120C]/80 backdrop-blur-md"
    >
      {/* header */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <div className="flex items-center gap-2 text-[#F3E7C4]">
          <Camera size={18} />
          <span className="text-sm font-bold">اسکن با دوربین</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="بستن دوربین"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[#DAA520]/40 bg-black/30 text-[#F3E7C4] transition hover:bg-black/50 active:scale-95"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-6">
        {fallback ? (
          /* graceful fallback: unsupported browser or unavailable camera */
          <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-[#DAA520]/30 bg-[#1B221A]/90 p-6 text-center shadow-2xl">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-400/30 bg-rose-500/10 text-rose-300">
              <CameraOff size={26} />
            </span>
            <div className="text-base font-extrabold text-[#F3E7C4]">
              {status === 'unsupported' ? 'مرورگر شما از اسکن دوربینی پشتیبانی نمی‌کند' : 'دسترسی به دوربین ممکن نشد'}
            </div>
            <p className="text-sm leading-7 text-[#C9CDBD]">
              {status === 'unsupported'
                ? 'این مرورگر تشخیص خودکار بارکد ندارد. لطفاً کد سفارش را به‌صورت دستی وارد کنید یا از اسکنر فیزیکی استفاده کنید.'
                : `${errHint} می‌توانید کد سفارش را دستی وارد کنید.`}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-xl border border-[#DAA520]/50 bg-[#DAA520]/15 px-5 text-sm font-bold text-[#F0D68A] transition hover:bg-[#DAA520]/25 active:scale-95"
            >
              بستن و ورود دستی کد
            </button>
          </div>
        ) : (
          /* live viewfinder (also holds the «starting» spinner until the stream flows) */
          <div className="relative h-[min(100%,540px)] max-h-full w-auto max-w-full aspect-[3/4] overflow-hidden rounded-3xl border border-[#DAA520]/30 bg-black shadow-2xl">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={cn('absolute inset-0 h-full w-full object-cover', status !== 'live' && 'opacity-0')}
            />
            {status !== 'live' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black text-sm font-semibold text-[#D8D2BC]">
                <Spinner />
                <span>در حال باز کردن دوربین…</span>
              </div>
            )}
            {status === 'live' && (
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[64%] w-[82%] -translate-x-1/2 -translate-y-1/2">
                {/* dim everything outside the viewport frame */}
                <div className="absolute inset-0 rounded-2xl shadow-[0_0_0_9999px_rgba(8,12,8,0.55)] ring-1 ring-[#DAA520]/35" />
                {/* 4 gold corner brackets with a subtle glow */}
                <span className="absolute -left-1 -top-1 h-8 w-8 rounded-tl-2xl border-l-[3px] border-t-[3px] border-[#E8C24A] shadow-[0_0_8px_rgba(218,165,32,0.65)]" />
                <span className="absolute -right-1 -top-1 h-8 w-8 rounded-tr-2xl border-r-[3px] border-t-[3px] border-[#E8C24A] shadow-[0_0_8px_rgba(218,165,32,0.65)]" />
                <span className="absolute -bottom-1 -left-1 h-8 w-8 rounded-bl-2xl border-b-[3px] border-l-[3px] border-[#E8C24A] shadow-[0_0_8px_rgba(218,165,32,0.65)]" />
                <span className="absolute -bottom-1 -right-1 h-8 w-8 rounded-br-2xl border-b-[3px] border-r-[3px] border-[#E8C24A] shadow-[0_0_8px_rgba(218,165,32,0.65)]" />
                {/* sweeping gold beam (pz-cam-beam — reduced-motion safe) */}
                <div className="pz-cam-beam" aria-hidden />
                <div className="absolute inset-x-0 -bottom-9 text-center text-xs font-semibold text-[#EFE3C2]/90">
                  بارکد سفارش را داخل کادر قرار دهید
                </div>
              </div>
            )}
            {/* torch toggle — only when the active track reports the capability
             * (bottom-center of the frame, gold chrome matching the brackets) */}
            {status === 'live' && torchOk && (
              <button
                type="button"
                onClick={() => void toggleTorch()}
                aria-pressed={torchOn}
                aria-label={torchOn ? 'خاموشی فلش' : 'روشنایی فلش'}
                title={torchOn ? 'خاموشی فلش' : 'روشنایی فلش'}
                className={cn(
                  'absolute bottom-4 left-1/2 z-10 flex h-11 w-11 min-h-[44px] -translate-x-1/2 items-center justify-center rounded-full border backdrop-blur-sm transition-all active:scale-95',
                  torchOn
                    ? 'border-[#DAA520] bg-[#DAA520]/30 text-[#F0D68A] shadow-[0_0_12px_rgba(218,165,32,0.6)]'
                    : 'border-[#DAA520]/40 bg-black/40 text-[#F3E7C4] hover:bg-black/60',
                )}
              >
                {torchOn ? <Flashlight size={20} /> : <FlashlightOff size={20} />}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* =============== main section =============== */

export default function DeliveriesSection({ user }: { user: PUser }) {
  const openOrder = useApp((s) => s.openOrder)

  const hasReceive = hasRole(user, 'DELIVERY_RECEIVER') || hasRole(user, 'INVENTORY_SUPERVISOR')
  const hasConfirm = hasRole(user, 'INVENTORY_SUPERVISOR')
  const isManager = hasRole(user, 'GENERAL_MANAGER') || hasRole(user, 'OPERATION_MANAGER')
    || hasRole(user, 'ACCOUNTANT') || hasRole(user, 'PRODUCT_MANAGER')
  // scan-adoption stats chip: narrower manager set, mirrors the stats API gate
  const canScanStats = hasRole(user, 'GENERAL_MANAGER') || hasRole(user, 'OPERATION_MANAGER')
    || hasRole(user, 'IT_ADMIN') || hasRole(user, 'OWNER')

  const [tab, setTab] = React.useState<string>(() =>
    hasConfirm ? 'confirm' : hasRole(user, 'DELIVERY_RECEIVER') ? 'receive' : 'overview')

  const [loading, setLoading] = React.useState(true)
  const [approved, setApproved] = React.useState<ListOrder[]>([])
  const [received, setReceived] = React.useState<ListOrder[]>([])
  const [confirmed, setConfirmed] = React.useState<ListOrder[]>([])
  const [done, setDone] = React.useState<ListOrder[]>([])
  const [holidays, setHolidays] = React.useState<Record<string, string>>({})
  const [sheet, setSheet] = React.useState<{ id: number; mode: SheetMode; viaScan?: boolean } | null>(null)
  const [scanStats, setScanStats] = React.useState<ScanStats | null>(null)
  const [scanStatsBusy, setScanStatsBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [a, r, c, d, h] = await Promise.all([
        api.get<{ orders: ListOrder[] }>('/api/orders?status=APPROVED'),
        api.get<{ orders: ListOrder[] }>('/api/orders?status=RECEIVED'),
        api.get<{ orders: ListOrder[] }>('/api/orders?status=CONFIRMED'),
        api.get<{ orders: ListOrder[] }>('/api/orders?status=DONE'),
        api.get<{ holidays: { date: string; title: string }[] }>('/api/holidays'),
      ])
      setApproved(a.orders)
      setReceived(r.orders)
      setConfirmed(c.orders)
      setDone(d.orders)
      setHolidays(Object.fromEntries(h.holidays.map((x) => [x.date, x.title])))
    } catch {
      toast.error('خطا در بارگذاری داده‌ها')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  /* lazy scan-stats (managers only) — loadScanStats(days) is the single fetch
   * path: the effect fires it after the main data lands (and after every reload,
   * keeping the currently selected range), and the stats panel calls it when it
   * opens or the 7/30-day toggle changes. Best-effort + silent-fail (403s
   * included); the previous payload stays on screen while a refetch is in
   * flight (panel dims subtly via scanStatsBusy). The request-id ref discards
   * stale responses when ranges are switched quickly. */
  const scanStatsReq = React.useRef(0)
  const scanStatsDays = React.useRef(7)
  const loadScanStats = React.useCallback((days: number) => {
    scanStatsDays.current = days
    const req = ++scanStatsReq.current
    setScanStatsBusy(true)
    api.get<ScanStats>(`/api/scan-log/stats?days=${days}&userId=${user.id}`)
      .then((r) => { if (scanStatsReq.current === req) setScanStats(r) })
      .catch(() => { /* chip + panel are best-effort analytics — stay silent */ })
      .finally(() => { if (scanStatsReq.current === req) setScanStatsBusy(false) })
  }, [user.id])

  React.useEffect(() => {
    if (!canScanStats || loading) return
    loadScanStats(scanStatsDays.current)
  }, [canScanStats, loading, loadScanStats])

  const closeSheet = React.useCallback(() => setSheet(null), [])
  const afterSheet = React.useCallback(() => { load() }, [load])

  const today = todayISO()
  const todayHoliday = holidays[today]

  const tabs = [
    ...(hasReceive ? [{ key: 'receive', label: 'دریافت تحویل', icon: <PackageCheck size={16} /> }] : []),
    ...(hasConfirm ? [{ key: 'confirm', label: 'تایید انبار', icon: <ClipboardCheck size={16} /> }] : []),
    ...(isManager ? [
      { key: 'overview', label: 'نمای کلی', icon: <LayoutGrid size={16} /> },
      { key: 'history', label: 'تاریخچه', icon: <History size={16} /> },
    ] : []),
  ]

  const active = React.useMemo(
    () => [...approved, ...received, ...confirmed].sort((a, b) => (a.receivingDate < b.receivingDate ? -1 : 1)),
    [approved, received, confirmed]
  )
  const isOverdue = (o: ListOrder) => o.receivingDate.slice(0, 10) < today && o.status === 'APPROVED'

  const openAction = (o: ListOrder, viaScan = false) => {
    if (o.status === 'APPROVED' && hasReceive) setSheet({ id: o.id, mode: 'receive', viaScan })
    else if (o.status === 'RECEIVED' && hasConfirm) setSheet({ id: o.id, mode: 'confirm' })
    else openOrder(o.id)
  }

  /* ---- scan-in resolution: printed Code39 (HZ-xxxx) → delivery detail ----
   * every resolved submit is also logged (SCAN_IN audit via /api/scan-log,
   * fire-and-forget + silent) — hits AND misses, the miss count is the
   * adoption signal. Mapping: ok→hit, DONE→closed, other warn→warn,
   * unknown code→miss, lookup failure→error. */
  const resolveScan = async (rawCode: string, source: ScanSource = 'manual'): Promise<ScanOutcome> => {
    const code = normalizeOrderCode(rawCode)
    if (!code) return { kind: 'warn', text: '' } // submit() never sends empty codes — nothing to log

    // 1) already-loaded delivery lists (fast path)
    const hit = [...approved, ...received, ...confirmed].find((o) => o.code === code)
    if (hit) {
      logScanEvent(user.id, code, source, 'hit')
      toast.success(`تحویل ${code} پیدا شد — باز شد ✓`)
      openAction(hit, true) // viaScan → receive sheet focuses the first qty input
      return { kind: 'ok', text: `تحویل ${code} پیدا شد — باز شد ✓` }
    }
    const closed = done.find((o) => o.code === code)
    if (closed) {
      logScanEvent(user.id, code, source, 'closed')
      openOrder(closed.id)
      toast.info(`سفارش ${code} قبلاً تحویل داده شده و بسته شده — برای مشاهده باز شد`)
      return { kind: 'warn', text: `سفارش ${code} قبلاً تحویل داده شده و بسته شده — برای مشاهده باز شد` }
    }

    // 2) fresh lookup (covers stale lists + orders that never reached the delivery stage)
    try {
      const res = await api.get<{ orders: ListOrder[] }>(`/api/orders?code=${encodeURIComponent(code)}`)
      const ord = res.orders?.[0]
      if (!ord) {
        logScanEvent(user.id, code, source, 'miss')
        return { kind: 'err', text: `کد سفارش یافت نشد: ${code}` }
      }
      if (ord.status === 'APPROVED' || ord.status === 'RECEIVED' || ord.status === 'CONFIRMED') {
        logScanEvent(user.id, code, source, 'hit')
        toast.success(`تحویل ${code} پیدا شد — باز شد ✓`)
        openAction(ord, true) // viaScan → receive sheet focuses the first qty input
        return { kind: 'ok', text: `تحویل ${code} پیدا شد — باز شد ✓` }
      }
      if (ord.status === 'DONE') {
        logScanEvent(user.id, code, source, 'closed')
        openOrder(ord.id)
        toast.info(`سفارش ${code} قبلاً تحویل داده شده و بسته شده — برای مشاهده باز شد`)
        return { kind: 'warn', text: `سفارش ${code} قبلاً تحویل داده شده و بسته شده — برای مشاهده باز شد` }
      }
      if (ord.status === 'CANCELLED') {
        logScanEvent(user.id, code, source, 'warn')
        toast.info(`سفارش ${code} لغو شده است و تحویلی ندارد`)
        return { kind: 'warn', text: `سفارش ${code} لغو شده است و تحویلی ندارد` }
      }
      logScanEvent(user.id, code, source, 'warn')
      return { kind: 'warn', text: `سفارش ${code} هنوز تحویلی ثبت نشده` }
    } catch {
      logScanEvent(user.id, code, source, 'error')
      return { kind: 'err', text: `خطا در بررسی کد — دوباره تلاش کنید: ${code}` }
    }
  }

  return (
    <div>
      <SectionHeader
        title="دریافت و انبار | Deliveries"
        subtitle="تحویل سفارش‌های تامین‌کننده و تایید نهایی انبار"
        icon={<Truck size={20} />}
      />

      {/* scan-in bar (closes the printed → scanned loop) — the manager stats
          panel renders inside ScanBar, right after the bar's section */}
      {tabs.length > 0 && (
        <ScanBar
          resolve={resolveScan}
          stats={canScanStats ? scanStats : undefined}
          statsBusy={scanStatsBusy}
          onLoadStats={canScanStats ? loadScanStats : undefined}
        />
      )}

      {/* holiday banner */}
      {todayHoliday && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          <AlertTriangle size={18} className="shrink-0" />
          امروز تعطیل است: {todayHoliday}
        </div>
      )}

      {tabs.length > 0 && <Tabs tabs={tabs} active={tab} onChange={setTab} />}

      {loading ? (
        tab === 'history' ? (
          <TableWrap>
            <thead>
              <tr>
                <Th>کد سفارش</Th>
                <Th>تامین‌کننده</Th>
                <Th>مبلغ کل</Th>
                <Th>تاریخ بستن</Th>
                <Th className="text-left">عملیات</Th>
              </tr>
            </thead>
            <TableRowsSkeleton rows={6} cols={5} widths={['w-20', 'w-28', 'w-20', 'w-24', 'w-16']} />
          </TableWrap>
        ) : (
          <DeliveryGridSkeleton count={6} />
        )
      ) : tabs.length === 0 ? (
        <EmptyState title="دسترسی‌ای برای این بخش ندارید" hint="این بخش برای گیرندگان تحویل، انباردار و مدیران است." />
      ) : (
        <>
          {/* ================= RECEIVE TAB ================= */}
          {tab === 'receive' && (
            <div className="space-y-3">
              {confirmed.length > 0 && (
                <div className="rounded-2xl border border-[#EAD9A8] bg-[#FFFDF5] px-4 py-3 text-sm font-semibold text-[#8A6508]">
                  {toFaDigits(confirmed.length)} سفارش تایید نهایی شده و آماده حسابداری است ✓
                </div>
              )}
              {approved.length === 0 ? (
                <EmptyState icon={<PackageCheck size={40} />} title="سفارشی برای دریافت تحویل نیست" hint="سفارش‌های تاییدشده مدیر اینجا نمایش داده می‌شوند." />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {[...approved].sort((a, b) => (a.receivingDate < b.receivingDate ? -1 : 1)).map((o) => (
                    <Card key={o.id} className={cn('p-4', isOverdue(o) && 'border-rose-300 bg-rose-50/50')}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-base font-extrabold text-[#253A2A]">{o.code}</div>
                          <div className="truncate text-xs text-[#6B7A66]">{o.supplier?.name ?? '—'}</div>
                        </div>
                        <StatusBadge status={o.status} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6B7A66]">
                        <span>تحویل: <b>{fmtJalali(o.receivingDate)}</b></span>
                        <span>{toFaDigits(o._count?.items ?? 0)} قلم</span>
                        <Money value={o.total} className="text-xs" />
                      </div>
                      {isOverdue(o) && (
                        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                          <div className="flex items-center gap-1.5"><AlertTriangle size={14} /> سفارش معوق — به تامین‌کننده پیگیری شود</div>
                        </div>
                      )}
                      <PrimaryButton className="mt-3 min-h-[44px] w-full" onClick={() => setSheet({ id: o.id, mode: 'receive', viaScan: false })}>
                        دریافت تحویل
                      </PrimaryButton>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ================= CONFIRM TAB ================= */}
          {tab === 'confirm' && (
            <div className="space-y-3">
              {received.length === 0 ? (
                <EmptyState icon={<ClipboardCheck size={40} />} title="سفارش دریافتی در انتظار تایید نیست" hint="سفارش‌هایی که گیرنده تحویل ثبت کرده اینجا برای تایید نهایی می‌آیند." />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {received.map((o) => (
                    <Card key={o.id} className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-base font-extrabold text-[#253A2A]">{o.code}</div>
                          <div className="truncate text-xs text-[#6B7A66]">{o.supplier?.name ?? '—'}</div>
                        </div>
                        <StatusBadge status={o.status} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6B7A66]">
                        <span>تحویل: <b>{fmtJalali(o.receivingDate)}</b></span>
                        <span>{toFaDigits(o._count?.items ?? 0)} قلم</span>
                        <Money value={o.total} className="text-xs" />
                      </div>
                      <PrimaryButton className="mt-3 min-h-[44px] w-full" onClick={() => setSheet({ id: o.id, mode: 'confirm', viaScan: false })}>
                        تایید نهایی انبار
                      </PrimaryButton>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ================= OVERVIEW TAB ================= */}
          {tab === 'overview' && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="در انتظار دریافت" value={toFaDigits(approved.length)} sub="سفارش تاییدشده" icon={<Truck size={20} />} tone="gold" />
                <StatCard label="دریافت‌شده" value={toFaDigits(received.length)} sub="منتظر تایید انبار" icon={<PackageCheck size={20} />} tone="olive" />
                <StatCard label="آماده حسابداری" value={toFaDigits(confirmed.length)} sub="تایید نهایی شده" icon={<ClipboardCheck size={20} />} tone="sky" />
              </div>
              {active.length === 0 ? (
                <EmptyState icon={<LayoutGrid size={40} />} title="سفارش فعالی وجود ندارد" />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {active.map((o) => {
                    const overdue = isOverdue(o)
                    return (
                      <Card key={o.id} className={cn('p-4', overdue && 'border-rose-300 bg-rose-50/50')}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-base font-extrabold text-[#253A2A]">{o.code}</div>
                            <div className="truncate text-xs text-[#6B7A66]">{o.supplier?.name ?? '—'}</div>
                          </div>
                          <StatusBadge status={o.status} />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6B7A66]">
                          <span>تحویل: <b>{fmtJalali(o.receivingDate)}</b></span>
                          <span>{toFaDigits(o._count?.items ?? 0)} قلم</span>
                          <Money value={o.total} className="text-xs" />
                        </div>
                        {overdue && (
                          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700">
                              <AlertTriangle size={14} /> سفارش معوق — به تامین‌کننده پیگیری شود
                            </div>
                            <GhostButton className="mt-2 min-h-[44px] w-full" onClick={() => openOrder(o.id)}>
                              <Eye size={15} /> مشاهده جزئیات سفارش
                            </GhostButton>
                          </div>
                        )}
                        {!overdue && (
                          <GhostButton className="mt-3 min-h-[44px] w-full" onClick={() => openAction(o)}>
                            {o.status === 'APPROVED' && hasReceive ? 'دریافت تحویل'
                              : o.status === 'RECEIVED' && hasConfirm ? 'تایید انبار'
                                : <><Eye size={15} /> مشاهده سفارش</>}
                          </GhostButton>
                        )}
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================= HISTORY TAB ================= */}
          {tab === 'history' && (
            done.length === 0 ? (
              <EmptyState icon={<History size={40} />} title="تاریخچه خالی است" hint="سفارش‌های بسته‌شده در حسابداری اینجا نمایش داده می‌شوند." />
            ) : (
              <div className="max-h-[70vh] overflow-y-auto pz-scroll">
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>کد سفارش</Th>
                      <Th>تامین‌کننده</Th>
                      <Th>مبلغ کل</Th>
                      <Th>تاریخ بستن</Th>
                      <Th className="text-left">عملیات</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {done.map((o) => (
                      <tr key={o.id} className="transition hover:bg-[#FBF9F3]">
                        <Td className="font-bold">{o.code}</Td>
                        <Td>{o.supplier?.name ?? '—'}</Td>
                        <Td><Money value={o.total} className="text-xs font-semibold" /></Td>
                        <Td className="text-xs">{fmtJalaliTime(o.doneAt)}</Td>
                        <Td className="text-left">
                          <GhostButton className="min-h-[44px]" onClick={() => openOrder(o.id)}>
                            <Eye size={15} /> مشاهده
                          </GhostButton>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </div>
            )
          )}
        </>
      )}

      {/* sheet (receive / confirm) */}
      <DeliverySheet
        orderId={sheet?.id ?? null}
        mode={sheet?.mode ?? 'receive'}
        viaScan={sheet?.viaScan ?? false}
        user={user}
        onClose={closeSheet}
        onDone={afterSheet}
      />
    </div>
  )
}
