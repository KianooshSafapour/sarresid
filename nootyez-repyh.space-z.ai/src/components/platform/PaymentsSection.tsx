'use client'
import * as React from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle, Ban, Banknote, CalendarDays, Check, ChevronDown, ChevronUp,
  FileSpreadsheet, Landmark, PenLine, Plus, Printer, RefreshCw, Send, SlidersHorizontal, Stamp, X,
} from 'lucide-react'
import { api, downloadFile } from '@/lib/api'
import { useApp } from '@/lib/store'
import { CHEQUE_STATUSES, CHEQUE_STATUS_LABELS, hasRole, type PUser } from '@/lib/types'
import { amountToFaWords } from '@/lib/fa-words'
import {
  addDaysISO, fmtJalali, fmtJalaliLong, fmtJalaliTime, fmtMoney, fmtMoneyShort,
  isoToJalali, jalaliToISO, JALALI_MONTHS, monthLength, toFaDigits, todayISO,
} from '@/lib/jalali'
import { cn } from '@/lib/utils'
import { JalaliCalendar, JalaliDateField } from './JalaliCalendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Badge, Card, EmptyState, Field, GhostButton, inputCls, Loading, Modal,
  PrimaryButton, SectionHeader, StatCard, StatusBadge,
} from './kit'

/* =============== local types =============== */

interface ChequeRow {
  id: number
  orderId: number | null
  purpose: string
  payee: string | null
  amount: number
  dueDate: string
  status: string
  recipientName: string | null
  recipientPhone: string | null
  note: string | null
  createdAt: string
  createdById?: number
  signedAt?: string | null
  writtenAt?: string | null
  order?: { code: string } | null
}

interface UserRow { id: number; name: string }

interface ListOrder {
  id: number
  code: string
  status: string
  total: number
  supplier?: { id: number; name: string } | null
}

const SECTIONS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'pending', label: 'در انتظار تایید مالک', statuses: ['PENDING_APPROVAL'] },
  { key: 'approved', label: 'تایید شده', statuses: ['APPROVED'] },
  { key: 'written', label: 'نوشته/امضا شده', statuses: ['WRITTEN', 'SIGNED'] },
  { key: 'given', label: 'تحویل به نماینده', statuses: ['GIVEN'] },
  { key: 'collected', label: 'وصول/پایان', statuses: ['COLLECTED', 'DONE'] },
  { key: 'closed', label: 'رد/برگشتی', statuses: ['REJECTED', 'BOUNCED'] },
]

const STALE_SIGNED_MS = 3 * 24 * 3600 * 1000
const TERMINAL = ['COLLECTED', 'DONE', 'REJECTED', 'BOUNCED']

function jMonthKey(iso: string): string {
  const { jy, jm } = isoToJalali(iso)
  return `${jy}-${String(jm).padStart(2, '0')}`
}

/* =============== main section =============== */

export default function PaymentsSection({ user }: { user: PUser }) {
  const openOrder = useApp((s) => s.openOrder)
  const isOwner = hasRole(user, 'OWNER')
  const isGM = hasRole(user, 'GENERAL_MANAGER')

  const [loading, setLoading] = React.useState(true)
  const [cheques, setCheques] = React.useState<ChequeRow[]>([])
  const [holidays, setHolidays] = React.useState<Record<string, string>>({})
  const [doneOrders, setDoneOrders] = React.useState<ListOrder[]>([])
  const [confirmedOrders, setConfirmedOrders] = React.useState<ListOrder[]>([])
  const [usersMap, setUsersMap] = React.useState<Record<number, string>>({})

  // calendar month anchor (any ISO date inside the viewed Jalali month)
  const [anchor, setAnchor] = React.useState(todayISO())

  // section collapse state (owner sees pending open by default)
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>({
    pending: true, approved: true, written: true, given: true, collected: false, closed: false,
  })

  // new cheque modal
  const [showNew, setShowNew] = React.useState(false)
  const [purpose, setPurpose] = React.useState<'ORDER' | 'OTHER'>('ORDER')
  const [orderId, setOrderId] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [dueDate, setDueDate] = React.useState<string | null>(null)
  const [recipientName, setRecipientName] = React.useState('')
  const [recipientPhone, setRecipientPhone] = React.useState('')
  const [payee, setPayee] = React.useState('')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  // reject modal
  const [rejectTarget, setRejectTarget] = React.useState<ChequeRow | null>(null)
  const [rejectReason, setRejectReason] = React.useState('')
  const [rejecting, setRejecting] = React.useState(false)

  // cheque print sheet (bank-style) — accountant / GM / owner only
  const canPrintCheque = isGM || isOwner || hasRole(user, 'ACCOUNTANT')
  const [printCheque, setPrintCheque] = React.useState<ChequeRow | null>(null)
  const printOne = (c: ChequeRow) => {
    setPrintCheque(c)
    setTimeout(() => window.print(), 120)
  }

  // cheque register XLS export — accountant / GM / owner only
  const canExportRegister = canPrintCheque
  const [exporting, setExporting] = React.useState(false)
  // optional status filter applied to BOTH register exports (month + full)
  const [exportStatuses, setExportStatuses] = React.useState<string[]>([])
  const [statusPopoverOpen, setStatusPopoverOpen] = React.useState(false)
  const toggleExportStatus = (s: string) =>
    setExportStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  const statusFaLabel = (s: string) => CHEQUE_STATUS_LABELS[s]?.split('|')[0].trim() ?? s

  const exportRegister = async (scope: 'month' | 'all') => {
    setExporting(true)
    try {
      const params = new URLSearchParams({ userId: String(user.id) })
      if (scope === 'month') {
        const j = isoToJalali(anchor)
        params.set('from', jalaliToISO(j.jy, j.jm, 1))
        params.set('to', jalaliToISO(j.jy, j.jm, monthLength(j.jy, j.jm)))
      }
      if (exportStatuses.length > 0) params.set('status', exportStatuses.join(','))
      const stamp = scope === 'month' ? `-${anchorMonthLabel.replace(/\s/g, '-')}` : '-kol'
      await downloadFile(`/api/export/cheques?${params.toString()}`, `daftar-cheque${stamp}.xls`)
      toast.success(exportStatuses.length
        ? `دفتر چک دانلود شد ✓ (فیلتر: ${statusFaLabel(exportStatuses[0])}${exportStatuses.length > 1 ? ` +${toFaDigits(exportStatuses.length - 1)}` : ''})`
        : 'دفتر چک دانلود شد ✓')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در دریافت خروجی')
    } finally {
      setExporting(false)
    }
  }

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [c, h, dn, cf, us] = await Promise.all([
        api.get<{ cheques: ChequeRow[] }>('/api/cheques'),
        api.get<{ holidays: { date: string; title: string }[] }>('/api/holidays'),
        api.get<{ orders: ListOrder[] }>('/api/orders?status=DONE'),
        api.get<{ orders: ListOrder[] }>('/api/orders?status=CONFIRMED'),
        api.get<{ users: UserRow[] }>('/api/users'),
      ])
      setCheques(c.cheques)
      setHolidays(Object.fromEntries(h.holidays.map((x) => [x.date, x.title])))
      setDoneOrders(dn.orders)
      setConfirmedOrders(cf.orders)
      setUsersMap(Object.fromEntries(us.users.map((u) => [u.id, u.name])))
    } catch {
      toast.error('خطا در بارگذاری چک‌ها و تقویم')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  /* ---- derived ---- */
  const highlight = React.useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of cheques) {
      const iso = c.dueDate.slice(0, 10)
      m[iso] = m[iso] ? `${m[iso]} + 💰` : '💰 سررسید چک'
    }
    return m
  }, [cheques])

  const anchorKey = jMonthKey(anchor)
  const monthCheques = React.useMemo(
    () => cheques
      .filter((c) => jMonthKey(c.dueDate) === anchorKey)
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)),
    [cheques, anchorKey]
  )

  const dueThisMonth = monthCheques.filter((c) => !TERMINAL.includes(c.status)).reduce((s, c) => s + c.amount, 0)
  const collectedThisMonth = monthCheques.filter((c) => c.status === 'COLLECTED' || c.status === 'DONE').reduce((s, c) => s + c.amount, 0)
  const awaitingOwner = cheques.filter((c) => c.status === 'PENDING_APPROVAL')

  const staleSigned = cheques.filter(
    (c) => c.status === 'SIGNED' && c.signedAt && Date.now() - new Date(c.signedAt).getTime() > STALE_SIGNED_MS
  )

  const anchorJ = isoToJalali(anchor)
  const anchorMonthLabel = `${JALALI_MONTHS[anchorJ.jm - 1]} ${toFaDigits(anchorJ.jy)}`

  /* ---- actions ---- */
  const act = async (c: ChequeRow, action: string, extra?: Record<string, unknown>, msg?: string) => {
    try {
      await api.patch('/api/cheques', { id: c.id, action, userId: user.id, ...extra })
      toast.success(msg ?? 'ثبت شد ✓')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ثبت عملیات')
    }
  }

  const submitReject = async () => {
    if (!rejectTarget) return
    setRejecting(true)
    try {
      await api.patch('/api/cheques', { id: rejectTarget.id, action: 'reject', userId: user.id, reason: rejectReason })
      toast.success('چک رد شد')
      setRejectTarget(null)
      setRejectReason('')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در رد چک')
    } finally {
      setRejecting(false)
    }
  }

  /* ---- new cheque ---- */
  const linkableOrders = React.useMemo(
    () => [...doneOrders, ...confirmedOrders].sort((a, b) => (a.code < b.code ? 1 : -1)),
    [doneOrders, confirmedOrders]
  )

  const pickOrder = (id: string) => {
    setOrderId(id)
    const o = linkableOrders.find((x) => String(x.id) === id)
    if (o) setAmount(String(Math.round(o.total)))
  }

  const selectedHoliday = dueDate ? holidays[dueDate] : undefined
  const holidaySuggestions = React.useMemo(() => {
    if (!dueDate) return []
    return [1, 2, 3]
      .map((k) => ({ k, iso: addDaysISO(dueDate, -k) }))
      .filter((s) => !holidays[s.iso])
  }, [dueDate, holidays])

  const openNew = () => {
    setPurpose('ORDER'); setOrderId(''); setAmount(''); setDueDate(null)
    setRecipientName(''); setRecipientPhone(''); setPayee(''); setNote('')
    setShowNew(true)
  }

  const submitNew = async () => {
    const amt = Number(amount)
    if (!isFinite(amt) || amt <= 0) { toast.error('مبلغ چک را درست وارد کنید'); return }
    if (!dueDate) { toast.error('تاریخ سررسید را انتخاب کنید'); return }
    if (holidays[dueDate]) { toast.error('سررسید نمی‌تواند روی روز تعطیل باشد'); return }
    if (purpose === 'ORDER' && !orderId) { toast.error('برای چک سفارش، سفارش را انتخاب کنید'); return }
    setSaving(true)
    try {
      await api.post('/api/cheques', {
        orderId: purpose === 'ORDER' && orderId ? Number(orderId) : undefined,
        purpose,
        amount: amt,
        dueDate,
        recipientName: recipientName || undefined,
        recipientPhone: recipientPhone || undefined,
        payee: payee || undefined,
        note: note || undefined,
        createdById: user.id,
      })
      toast.success('چک ثبت شد و در انتظار تایید مالک است ✓')
      setShowNew(false)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ثبت چک')
    } finally {
      setSaving(false)
    }
  }

  /* ---- per-cheque action buttons ---- */
  const renderActions = (c: ChequeRow) => {
    const btns: React.ReactNode[] = []
    if (c.status === 'PENDING_APPROVAL' && isOwner) {
      btns.push(
        <PrimaryButton
          key="approve"
          className="min-h-[48px] flex-[2] text-base"
          onClick={() => act(c, 'approve', {}, 'چک تایید شد ✓')}
        >
          <Check size={18} /> تایید چک
        </PrimaryButton>,
        <DangerGhost key="reject" onClick={() => { setRejectTarget(c); setRejectReason('') }} />
      )
    }
    if (c.status === 'APPROVED' && isOwner) {
      btns.push(<MiniBtn key="write" icon={<PenLine size={15} />} label="نوشتن چک" onClick={() => act(c, 'write', {}, 'چک نوشته شد ✓')} />)
    }
    if (c.status === 'WRITTEN' && isOwner) {
      btns.push(<MiniBtn key="sign" icon={<Stamp size={15} />} label="امضا" onClick={() => act(c, 'sign', {}, 'چک امضا شد ✓')} />)
    }
    if (isGM) {
      if (c.status === 'SIGNED') {
        btns.push(<MiniBtn key="give" icon={<Send size={15} />} label="تحویل به نماینده" onClick={() => act(c, 'give', {}, 'چک تحویل داده شد ✓')} />)
      }
      if (c.status === 'GIVEN') {
        btns.push(<MiniBtn key="collect" icon={<Banknote size={15} />} label="وصول شد" onClick={() => act(c, 'collect', {}, 'چک وصول شد ✓')} />)
      }
      if (['WRITTEN', 'SIGNED', 'GIVEN'].includes(c.status)) {
        btns.push(<MiniBtn key="bounce" icon={<Ban size={15} />} label="برگشت چک" tone="rose" onClick={() => act(c, 'bounce', {}, 'چک برگشتی ثبت شد')} />)
      }
    }
    if (btns.length === 0) return null
    return <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#EFEAD8] pt-3">{btns}</div>
  }

  const renderChequeCard = (c: ChequeRow) => {
    const isHolidayDue = !!holidays[c.dueDate.slice(0, 10)]
    const isStale = c.status === 'SIGNED' && !!c.signedAt && Date.now() - new Date(c.signedAt).getTime() > STALE_SIGNED_MS
    const ownerPending = isOwner && c.status === 'PENDING_APPROVAL'
    const isApproved = c.status === 'APPROVED'
    const isTerminal = TERMINAL.includes(c.status)
    return (
      <Card
        key={c.id}
        className={cn(
          'relative overflow-hidden p-4 transition-all hover:shadow-md',
          'bg-gradient-to-br from-white to-[#FBF9F3]',
          ownerPending && 'border-[#DAA520]/60 from-[#FFFDF5] to-white shadow-[0_2px_16px_-4px_rgba(184,134,11,0.25)]',
          isApproved && !ownerPending && 'border-[#7FC4B0]/60 from-[#F4FBF8] to-white',
          isTerminal && 'opacity-75',
          isStale && !ownerPending && 'ring-2 ring-rose-300'
        )}
      >
        {/* engraved corner watermark (banknote motif) */}
        <Landmark
          aria-hidden
          size={92}
          strokeWidth={0.6}
          className="pointer-events-none absolute -left-4 -top-4 text-[#3E6B4A]/[0.06]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px]"
          style={{ background: 'repeating-linear-gradient(90deg, #B8860B 0 14px, transparent 14px 22px)', opacity: 0.35 }}
        />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-lg font-extrabold tabular-nums text-[#253A2A]">{fmtMoney(c.amount)}</div>
            <div className={cn('mt-0.5 text-xs font-semibold', isHolidayDue ? 'text-rose-600' : 'text-[#6B7A66]')}>
              سررسید: {fmtJalaliLong(c.dueDate)}
            </div>
          </div>
          <StatusBadge status={c.status} kind="cheque" />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[#6B7A66]">
          {c.orderId && c.order?.code ? (
            <button
              type="button"
              onClick={() => openOrder(c.orderId!)}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-[#D8E2D0] bg-[#F3F7EF] px-2.5 py-0.5 font-semibold text-[#3E6B4A] transition hover:bg-[#E7EFE2]"
            >
              سفارش {c.order.code}
            </button>
          ) : (
            <Badge className="border-[#E4DCC8] bg-[#F5F2E8] text-[#6B7A66]">متفرقه</Badge>
          )}
          {c.recipientName && <span>گیرنده: <b>{c.recipientName}</b></span>}
          {c.recipientPhone && <span dir="ltr" className="font-mono">{c.recipientPhone}</span>}
          {c.payee && <span>در وجه: {c.payee}</span>}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[#8A9884]">
          <span>ثبت توسط: {c.createdById ? usersMap[c.createdById] ?? '—' : '—'} · {fmtJalali(c.createdAt)}</span>
          {canPrintCheque && (
            <button
              type="button"
              onClick={() => printOne(c)}
              title="چاپ برگه چپ | Print cheque sheet"
              aria-label={`چاپ برگه چک ${fmtMoney(c.amount)}`}
              className="inline-flex min-h-[28px] items-center gap-1 rounded-full border border-[#E4DCC8] bg-white px-2 py-0.5 font-semibold text-[#4A5A44] transition hover:border-[#B8860B] hover:text-[#8A6508]"
            >
              <Printer size={12} /> چاپ
            </button>
          )}
        </div>

        {c.note && (
          <div className="mt-2 rounded-lg bg-[#F5F2E8] px-3 py-1.5 text-xs leading-5 text-[#6B7A66]">{c.note}</div>
        )}

        {isStale && (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700">
            <AlertTriangle size={14} /> چک نوشته شده ولی جمع نشده — پیگیری کنید
          </div>
        )}

        {ownerPending && !isStale && (
          <div className="mt-2 text-[11px] font-semibold text-[#8A6508]">در انتظار تایید شما، آقای نوروزی</div>
        )}

        {renderActions(c)}
      </Card>
    )
  }

  const renderSection = (sec: (typeof SECTIONS)[number]) => {
    const list = cheques.filter((c) => sec.statuses.includes(c.status))
    const open = !!openSections[sec.key]
    const isOwnerPending = isOwner && sec.key === 'pending'
    return (
      <Card key={sec.key} className={cn('overflow-hidden', isOwnerPending && list.length > 0 && 'border-[#DAA520]/60')}>
        <button
          type="button"
          onClick={() => setOpenSections((s) => ({ ...s, [sec.key]: !s[sec.key] }))}
          className={cn(
            'flex min-h-[52px] w-full items-center justify-between gap-2 px-4 py-3 text-right transition',
            isOwnerPending && list.length > 0 ? 'bg-gradient-to-l from-[#FFF7E0] to-[#FFFDF5]' : 'bg-[#FBF9F3] hover:bg-[#F5F2E8]'
          )}
          aria-expanded={open}
        >
          <span className="flex items-center gap-2">
            <span className="text-sm font-extrabold text-[#253A2A]">{sec.label}</span>
            <Badge className={cn(
              'tabular-nums',
              isOwnerPending && list.length > 0 ? 'border-[#DAA520]/50 bg-[#FFF3D6] text-[#8A6508]' : 'border-[#E4DCC8] bg-white text-[#6B7A66]'
            )}>
              {toFaDigits(list.length)}
            </Badge>
            {isOwnerPending && list.length > 0 && (
              <span className="hidden text-[11px] font-bold text-[#8A6508] sm:inline">— مناسب تایید آقای نوروزی</span>
            )}
          </span>
          {open ? <ChevronUp size={17} className="text-[#8A9884]" /> : <ChevronDown size={17} className="text-[#8A9884]" />}
        </button>
        {open && (
          <div className="space-y-3 border-t border-[#EFEAD8] p-3">
            {list.length === 0 ? (
              <div className="py-3 text-center text-xs text-[#8A9884]">چکی در این وضعیت نیست</div>
            ) : (
              list.map(renderChequeCard)
            )}
          </div>
        )}
      </Card>
    )
  }

  return (
    <div>
      <SectionHeader
        title="پرداخت‌ها | Payments"
        subtitle="مدیریت چک‌ها، سررسیدها و تایید مالک"
        icon={<Landmark size={20} />}
        actions={
          <>
            <GhostButton className="min-h-[44px]" onClick={load} aria-label="بازخوانی">
              <RefreshCw size={15} /> <span className="hidden sm:inline">بازخوانی</span>
            </GhostButton>
            {canExportRegister && (
              <GhostButton
                className="min-h-[44px] border-[#EAD9A8] bg-[#FBF6E8] text-[#8A6508] hover:bg-[#F5EDD3]"
                onClick={() => void exportRegister('month')}
                disabled={exporting}
                title={`خروجی اکسل چک‌های سررسید ${anchorMonthLabel}`}
              >
                <FileSpreadsheet size={15} /> <span className="hidden sm:inline">اکسل دفتر چک ({anchorMonthLabel})</span>
                <span className="sm:hidden">اکسل</span>
              </GhostButton>
            )}
            {canExportRegister && exportStatuses.length > 0 && (
              <GhostButton
                className="min-h-[44px] border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                onClick={() => setExportStatuses([])}
                title="فیلتر وضعیت روی خروجی اکسل فعال است — برای حذف کلیک کنید"
                aria-label={`فیلتر خروجی فعال: ${toFaDigits(exportStatuses.length)} وضعیت — حذف فیلتر`}
              >
                <SlidersHorizontal size={14} /> فیلتر: {toFaDigits(exportStatuses.length)} وضعیت <X size={13} />
              </GhostButton>
            )}
            {isGM && (
              <PrimaryButton className="min-h-[44px]" onClick={openNew}>
                <Plus size={16} /> چک جدید | New Cheque
              </PrimaryButton>
            )}
          </>
        }
      />

      {/* stats */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label={`سررسید ${anchorMonthLabel}`} value={fmtMoneyShort(dueThisMonth)} sub={`${toFaDigits(monthCheques.length)} چک در این ماه`} icon={<CalendarDays size={20} />} tone="gold" />
        <StatCard label="در انتظار تایید مالک" value={toFaDigits(awaitingOwner.length)} sub="چک‌های PENDING_APPROVAL" icon={<Landmark size={20} />} tone="rose" />
        <StatCard label={`وصول ${anchorMonthLabel}`} value={fmtMoneyShort(collectedThisMonth)} sub="چک‌های وصول/پایان‌یافته" icon={<Banknote size={20} />} tone="olive" />
      </div>

      {loading ? (
        <Loading label="در حال بارگذاری چک‌ها…" />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[340px_1fr]">
          {/* ---- calendar column ---- */}
          <div className="space-y-4">
            <Card className="p-3">
              <JalaliCalendar
                value={anchor}
                onChange={setAnchor}
                holidays={holidays}
                highlight={highlight}
              />
              <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-[#EFEAD8] pt-2 text-[11px] text-[#8A9884]">
                <span>💰 سررسید چک</span>
                <span>🔴 تعطیل رسمی</span>
              </div>
              {holidays[anchor] && (
                <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
                  ⚠ این روز تعطیل است: {holidays[anchor]}
                </div>
              )}
            </Card>

            {/* cheques of the selected month */}
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-bold text-[#253A2A]">چک‌های {anchorMonthLabel}</h3>
              {monthCheques.length === 0 ? (
                <div className="py-4 text-center text-xs text-[#8A9884]">در این ماه چکی سررسید نمی‌شود</div>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto pl-1 pz-scroll">
                  {monthCheques.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-[#EFEAD8] bg-white px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold tabular-nums text-[#253A2A]">{fmtMoney(c.amount)}</div>
                        <div className={cn('text-[10px]', holidays[c.dueDate.slice(0, 10)] ? 'font-bold text-rose-600' : 'text-[#8A9884]')}>
                          {fmtJalaliLong(c.dueDate)}
                        </div>
                      </div>
                      <StatusBadge status={c.status} kind="cheque" />
                    </div>
                  ))}
                </div>
              )}
              {/* status filter for the XLS register exports (month + full) */}
              {canExportRegister && (
                <Popover open={statusPopoverOpen} onOpenChange={setStatusPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="mt-3 flex w-full min-h-[44px] items-center justify-between gap-1.5 rounded-lg border border-[#EAD9A8] bg-[#FBF6E8] px-3 text-[11px] font-bold text-[#8A6508] transition hover:bg-[#F5EDD3]"
                      aria-expanded={statusPopoverOpen}
                      aria-label="فیلتر وضعیت خروجی دفتر چک"
                    >
                      <span className="flex items-center gap-1.5"><SlidersHorizontal size={13} /> فیلتر وضعیت خروجی | Status filter</span>
                      {exportStatuses.length > 0 ? (
                        <span className="rounded-full bg-[#B8860B] px-2 py-0.5 text-[10px] font-bold text-white">{toFaDigits(exportStatuses.length)}</span>
                      ) : (
                        <span className="text-[10px] font-medium text-[#B0A57E]">همه</span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" sideOffset={6} className="w-72 rounded-2xl border-[#E4DCC8] bg-white p-3 shadow-xl">
                    <div className="mb-1.5 text-xs font-bold text-[#253A2A]">
                      وضعیت چک‌ها برای خروجی اکسل
                    </div>
                    <div className="mb-2 text-[10px] leading-4 text-[#8A9884]">
                      روی هر دو خروجی (ماه جاری و دفتر کامل) اعمال می‌شود؛ بدون انتخاب = همه وضعیت‌ها.
                    </div>
                    <div className="max-h-64 space-y-0.5 overflow-y-auto pz-scroll">
                      {CHEQUE_STATUSES.map((s) => (
                        <label
                          key={s}
                          className="flex min-h-[44px] cursor-pointer items-center justify-between gap-2 rounded-lg px-2 text-sm text-[#33402F] transition hover:bg-[#F3F7EF]"
                        >
                          <span>{statusFaLabel(s)}</span>
                          <input
                            type="checkbox"
                            checked={exportStatuses.includes(s)}
                            onChange={() => toggleExportStatus(s)}
                            className="h-4 w-4 accent-[#3E6B4A]"
                            aria-label={statusFaLabel(s)}
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-[#EFEAD8] pt-2">
                      <button
                        type="button"
                        onClick={() => setExportStatuses([])}
                        className="min-h-[36px] rounded-lg px-2 py-1.5 text-xs font-semibold text-[#5F8F55] transition hover:bg-[#F3F7EF]"
                      >
                        همه وضعیت‌ها | Clear
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusPopoverOpen(false)}
                        className="min-h-[36px] rounded-lg border border-[#D8D2BC] bg-white px-3 py-1.5 text-xs font-semibold text-[#4A5A44] transition hover:bg-[#F3F7EF]"
                      >
                        بستن
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              {canExportRegister && (
                <button
                  type="button"
                  onClick={() => void exportRegister('all')}
                  disabled={exporting}
                  className="mt-2 flex w-full min-h-[36px] items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#EAD9A8] bg-[#FDFBF3] text-[11px] font-bold text-[#8A6508] transition hover:bg-[#F5EDD3] disabled:opacity-50"
                >
                  <FileSpreadsheet size={13} /> خروجی اکسل همه چک‌ها | Export full register
                </button>
              )}
            </Card>
          </div>

          {/* ---- grouped list column ---- */}
          <div className="space-y-3">
            {staleSigned.length > 0 && (
              <div className="flex items-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                <AlertTriangle size={18} className="shrink-0" />
                {toFaDigits(staleSigned.length)} چک نوشته و امضا شده ولی جمع نشده — پیگیری کنید
              </div>
            )}
            {cheques.length === 0 ? (
              <EmptyState icon={<Landmark size={40} />} title="هنوز چکی ثبت نشده" hint={isGM ? 'با دکمه «چک جدید» اولین چک را ثبت کنید.' : 'چک‌های ثبت‌شده اینجا نمایش داده می‌شوند.'} />
            ) : (
              SECTIONS.map(renderSection)
            )}
          </div>
        </div>
      )}

      {/* ================= new cheque modal ================= */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="چک جدید | New Cheque">
        <div className="space-y-4">
          {/* purpose */}
          <div>
            <span className="mb-1 block text-xs font-semibold text-[#4A5A44]">هدف چک</span>
            <div className="grid grid-cols-2 gap-2">
              {([
                { v: 'ORDER' as const, label: 'سفارش | Order' },
                { v: 'OTHER' as const, label: 'متفرقه | Other' },
              ]).map((o) => (
                <button
                  key={o.v} type="button"
                  onClick={() => { setPurpose(o.v); if (o.v === 'OTHER') setOrderId('') }}
                  aria-pressed={purpose === o.v}
                  className={cn(
                    'min-h-[44px] rounded-xl border-2 px-3 text-sm font-bold transition-all active:scale-[0.98]',
                    purpose === o.v
                      ? 'border-[#3A6242] bg-[#3A6242] text-white shadow-md'
                      : 'border-[#D8D2BC] bg-white text-[#4A5A44] hover:bg-[#F3F7EF]'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {purpose === 'ORDER' ? (
            <Field label="انتخاب سفارش" hint="سفارش‌های بسته‌شده یا آماده حسابداری — با انتخاب، مبلغ خودکار پر می‌شود" required>
              <select className={inputCls} value={orderId} onChange={(e) => pickOrder(e.target.value)}>
                <option value="">— انتخاب سفارش —</option>
                {linkableOrders.map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.code} — {o.supplier?.name ?? '—'} — {fmtMoneyShort(o.total)}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="توضیح هدف چک" hint="مثلاً: اجاره محل، برق، خرج تنخواه" required>
              <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="هدف چک متفرقه را بنویسید…" />
            </Field>
          )}

          <Field label="مبلغ (تومان)" required>
            <input
              type="number" inputMode="decimal" min={0} step="any"
              className={cn(inputCls, 'font-bold tabular-nums')}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </Field>

          <div>
            <JalaliDateField
              label="تاریخ سررسید"
              value={dueDate}
              onChange={setDueDate}
              holidays={holidays}
              minDate={todayISO()}
            />
            {selectedHoliday && (
              <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">
                ⚠ این روز تعطیل است: {selectedHoliday} — چک باید قبل از تعطیلات سررسید شود
                {holidaySuggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {holidaySuggestions.map((s) => (
                      <GhostButton
                        key={s.iso}
                        type="button"
                        className="min-h-[36px] px-2.5 py-1 text-xs"
                        onClick={() => setDueDate(s.iso)}
                      >
                        {toFaDigits(s.k)} روز قبل — {fmtJalali(s.iso)}
                      </GhostButton>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="نام نماینده گیرنده">
              <input className={inputCls} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="نام نماینده تامین‌کننده" />
            </Field>
            <Field label="تلفن گیرنده">
              <input className={inputCls} dir="ltr" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} placeholder="0913..." />
            </Field>
          </div>
          {purpose === 'ORDER' && (
            <Field label="در وجه (Payee)">
              <input className={inputCls} value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="نام شخص یا شرکت در وجه چک" />
            </Field>
          )}
          {purpose === 'ORDER' && (
            <Field label="یادداشت">
              <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="توضیح اختیاری…" />
            </Field>
          )}

          <PrimaryButton
            className="min-h-[48px] w-full text-base"
            onClick={submitNew}
            disabled={saving || !!selectedHoliday}
          >
            {saving ? 'در حال ثبت…' : 'ثبت چک'}
          </PrimaryButton>
          {selectedHoliday && (
            <p className="text-center text-[11px] font-semibold text-amber-700">تا وقتی سررسید تعطیل است، دکمه ثبت غیرفعال می‌ماند</p>
          )}
        </div>
      </Modal>

      {/* ================= reject modal ================= */}
      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title="رد چک">
        <div className="space-y-3">
          {rejectTarget && (
            <div className="text-sm text-[#4A5A44]">
              رد چک <b className="tabular-nums">{fmtMoney(rejectTarget.amount)}</b>
              {rejectTarget.order?.code ? <> مربوط به سفارش <b>{rejectTarget.order.code}</b></> : null} — دلیل را بنویسید:
            </div>
          )}
          <textarea
            className={cn(inputCls, 'min-h-[88px] resize-y')}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="مثلاً: فروش نرفت، سررسید باید عقب بیفتد…"
            aria-label="دلیل رد چک"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <PrimaryButton className="min-h-[44px] flex-1" onClick={submitReject} disabled={rejecting}>
              {rejecting ? 'در حال ثبت…' : 'ثبت رد چک'}
            </PrimaryButton>
            <GhostButton className="min-h-[44px]" onClick={() => setRejectTarget(null)}>لغو</GhostButton>
          </div>
        </div>
      </Modal>
      {/* ================= cheque print sheet (bank-style) ================= */}
      {printCheque && (
        <div className="pz-print-only" dir="rtl" style={{ fontFamily: 'Tahoma, Vazirmatn, sans-serif' }}>
          <div style={{ border: '3px double #1a1a1a', borderRadius: 8, padding: '18px 22px', maxWidth: 760, margin: '0 auto' }}>
            {/* bank header */}
            <div style={{ textAlign: 'center', borderBottom: '1px solid #1a1a1a', paddingBottom: 8 }}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: '#333' }}>جمهوری اسلامی ایران</div>
              <div style={{ fontSize: 17, fontWeight: 800, marginTop: 4 }}>
                بانک .............................................
              </div>
              <div style={{ fontSize: 11, marginTop: 3, color: '#333' }}>
                شعبه ............................................. — کد شعبه ................
              </div>
            </div>

            {/* cheque number + dates */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 10, fontSize: 12 }}>
              <div>چــک شماره <span style={{ display: 'inline-block', minWidth: 140, borderBottom: '1px dotted #555', textAlign: 'center' }}>{toFaDigits(printCheque.id)}</span></div>
              <div style={{ textAlign: 'left', lineHeight: 1.9 }}>
                <div>تاریخ صدور: <b>{fmtJalali(printCheque.createdAt)}</b></div>
                <div>تاریخ سررسید: <b>{fmtJalaliLong(printCheque.dueDate)}</b></div>
              </div>
            </div>

            {/* payee */}
            <div style={{ marginTop: 16, fontSize: 14, fontWeight: 700 }}>
              در وجه{' '}
              <span style={{ display: 'inline-block', minWidth: 300, borderBottom: '1px solid #1a1a1a', paddingBottom: 2, textAlign: 'center' }}>
                {printCheque.payee || printCheque.recipientName || '..........................................'}
              </span>{' '}
              خواهشمند است مبلغ زیر را از حساب ما بپردازید.
            </div>

            {/* amount box */}
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <div style={{ border: '2px solid #1a1a1a', borderRadius: 6, padding: '8px 14px', minWidth: 180, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#555' }}>مبلغ به عدد (تومان)</div>
                <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{toFaDigits(new Intl.NumberFormat('en-US').format(Math.round(printCheque.amount)))} تومان</div>
              </div>
              <div style={{ flex: 1, border: '1px solid #1a1a1a', borderRadius: 6, padding: '8px 12px' }}>
                <div style={{ fontSize: 10, color: '#555' }}>مبلغ به حروف</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }}>{amountToFaWords(printCheque.amount)}</div>
              </div>
            </div>

            {/* purpose / reference */}
            <div style={{ marginTop: 14, fontSize: 12 }}>
              بابت:{' '}
              <b>
                {printCheque.order?.code
                  ? `پرداخت سفارش ${printCheque.order.code}`
                  : printCheque.note || printCheque.purpose === 'ORDER'
                    ? 'پرداخت سفارش خرید'
                    : 'هزینه متفرقه'}
              </b>
              {printCheque.recipientName && printCheque.recipientName !== (printCheque.payee || '') && (
                <span style={{ color: '#555' }}> — تحویل به نماینده: {printCheque.recipientName}</span>
              )}
            </div>

            {/* status strip */}
            <div style={{ marginTop: 12, fontSize: 10, color: '#555' }}>
              وضعیت در سامانه هایپر زیتون: <b>{CHEQUE_STATUS_LABELS[printCheque.status] ?? printCheque.status}</b>
            </div>

            {/* signatures */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 34, fontSize: 11 }}>
              <div style={{ textAlign: 'center', minWidth: 150 }}>
                <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 4, fontWeight: 700 }}>امضای صادرکننده (حسابدار)</div>
              </div>
              <div style={{ textAlign: 'center', minWidth: 150 }}>
                <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 4, fontWeight: 700 }}>امضای مجاز (مدیرعامل)</div>
              </div>
              <div style={{ textAlign: 'center', minWidth: 110 }}>
                <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 4, fontWeight: 700 }}>مهر واحد</div>
              </div>
            </div>

            {/* security microline */}
            <div
              aria-hidden
              style={{
                marginTop: 14, paddingTop: 4, borderTop: '1px solid #1a1a1a', borderBottom: '1px solid #1a1a1a',
                fontSize: 8, letterSpacing: 1, whiteSpace: 'nowrap', overflow: 'hidden', color: '#666', textAlign: 'center',
                userSelect: 'none',
              }}
            >
              {'HYPER ZEYTOON • هایپر زیتون • HYPER ZEYTOON • هایپر زیتون • HYPER ZEYTOON • هایپر زیتون • HYPER ZEYTOON • هایپر زیتون • HYPER ZEYTOON • هایپر زیتون • HYPER ZEYTOON • هایپر زیتون'}
            </div>

            <div style={{ marginTop: 8, fontSize: 9, color: '#888', display: 'flex', justifyContent: 'space-between' }}>
              <span>چاپ از سامانه عملیات هایپر زیتون</span>
              <span>زمان چاپ: {fmtJalaliTime(new Date())}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MiniBtn({ icon, label, onClick, tone = 'olive' }: {
  icon: React.ReactNode; label: string; onClick: () => void; tone?: 'olive' | 'rose'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-all active:scale-[0.98]',
        tone === 'rose'
          ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
          : 'border-[#D8E2D0] bg-[#F3F7EF] text-[#3E6B4A] hover:bg-[#E7EFE2]'
      )}
    >
      {icon}{label}
    </button>
  )
}

function DangerGhost({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-700 transition-all hover:bg-rose-100 active:scale-[0.98]"
    >
      <X size={16} /> رد
    </button>
  )
}
