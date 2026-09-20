'use client'

// Payments — Jalali cheque calendar, cheque lifecycle (owner/gm), split, payments ledger
import * as React from 'react'
import { SectionHeader, StatusBadge, EmptyState, LoadingBlock, ChipSelect, StatCard } from '@/components/platform/ui/shared'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Wallet, Plus, Minus, Loader2, PenLine, XCircle, Truck, BadgeCheck, AlertTriangle, SplitSquareHorizontal, Ban, Printer, CalendarClock,
  Sparkles, SlidersHorizontal, CalendarPlus, ChevronDown, MoveHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import {
  money, toFaDigits, toEnDigits, isoDay, formatJalali, formatJalaliDateTime, formatJalaliFull,
  jalaliMonthGrid, toJalali, JALALI_MONTHS, JALALI_WEEKDAYS_SHORT, addDays, weekdayFa,
} from '@/lib/jalali'
import {
  parseFlexibility, resolveFlex, FLEX_SCOPES, FLEX_SCOPE_FA, FLEX_KEY_EXAMPLES,
  type FlexibilityConfig, type FlexScope,
} from '@/lib/cheque-flex'
import { amountInPersianWords } from '@/lib/persian-words'
import { CHEQUE_STATUSES, chequeStatusInfo } from '@/lib/types'
import { useApp } from '@/store/app'
import { JalaliDatePicker } from '@/components/platform/ui/jalali-date-picker'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { isClosedDay, suggestOpenDay, holidaySetOf, useCatalog } from './commerce-bits'

interface ChequeRow {
  id: string
  number: string
  amount: number
  dueDate: string
  issueDate: string
  payeeName: string
  payeePhone?: string | null
  orderId?: string | null
  isForOrder: boolean
  status: string
  note?: string | null
  writtenAt?: string | null
  collectedAt?: string | null
  givenTo?: string | null
  signedById?: string | null
  orderCode?: string | null
}

interface PaymentRow {
  id: string
  orderCode?: string | null
  amount: number
  type: string
  receiptNo?: string | null
  posReceiptNo?: string | null
  note?: string | null
  userName: string
  createdAt: string
}

interface OrderLite {
  id: string
  code: string
  providerName: string
  finalAmount: number
}

const CHEQUE_FILTERS = [{ key: 'ALL', label: 'همه', color: '#3E7C59' }, ...CHEQUE_STATUSES] as { key: string; label: string; color: string }[]

// ---------- printable cheque payment voucher (سند پرداخت چک) ----------
function printChequeVoucher(c: ChequeRow) {
  const metaCell = (label: string, value: string) =>
    `<div><b>${label}</b><span class="mono">${value}</span></div>`
  const html = `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8">
  <title>سند پرداخت چک ${c.number}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; font-family: Vazirmatn, Tahoma, sans-serif; }
    body { margin: 0; color: #1d2a22; }
    .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px double #C9A227; padding-bottom: 12px; }
    .brand { font-size: 20px; font-weight: 900; color: #2c5443; }
    .brand small { display: block; font-size: 10px; font-weight: 400; color: #7d8a80; }
    .title { font-size: 15px; font-weight: 800; color: #8A6F3C; letter-spacing: 1px; }
    .vdate { font-size: 11px; color: #7d8a80; margin-top: 3px; }
    .orn { text-align: center; color: #C9A227; font-size: 11px; letter-spacing: 6px; margin-top: 10px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 14px; font-size: 12px; }
    .meta div { border: 1px solid #d8d2c2; border-radius: 8px; padding: 6px 9px; background: #fbf9f2; }
    .meta b { color: #7d8a80; font-weight: 500; font-size: 10px; display: block; margin-bottom: 2px; }
    .amount-box { margin-top: 12px; border: 2px solid #3E7C59; border-radius: 12px; overflow: hidden; }
    .amount-box .digits { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #eef4ef; }
    .amount-box .digits .lbl { font-size: 11px; color: #356b4c; font-weight: 700; }
    .amount-box .digits .val { font-size: 22px; font-weight: 900; color: #2c5443; font-variant-numeric: tabular-nums; }
    .amount-box .words { border-top: 1px dashed #b9cdc0; padding: 9px 14px; font-size: 13px; background: #fbf9f2; }
    .amount-box .words b { color: #7d8a80; font-size: 10px; font-weight: 500; display: block; margin-bottom: 2px; }
    .pipe { margin-top: 14px; display: flex; gap: 4px; flex-wrap: wrap; }
    .step { font-size: 10px; padding: 4px 10px; border-radius: 999px; border: 1px solid #d8d2c2; color: #9aa396; background: #fbf9f2; }
    .step.on { color: #fff; border-color: transparent; font-weight: 800; }
    .note { margin-top: 12px; font-size: 11px; background: #fdf6e3; border: 1px solid #e6d9a8; border-radius: 8px; padding: 7px 10px; }
    .sign { margin-top: 38px; display: flex; justify-content: space-between; font-size: 12px; }
    .sign div { width: 30%; text-align: center; }
    .sign .line { margin-top: 30px; border-top: 1px dashed #9aa396; padding-top: 5px; color: #7d8a80; }
    .foot { margin-top: 26px; font-size: 9px; color: #9aa396; text-align: center; border-top: 1px solid #e4dcc9; padding-top: 6px; }
  </style></head><body>
  <div class="head">
    <div class="brand">هایپر زیتون <small>کرمان — سند پرداخت</small></div>
    <div style="text-align:left">
      <div class="title">سند پرداخت چک</div>
      <div class="vdate mono">تاریخ سند: ${formatJalaliFull(new Date())}</div>
    </div>
  </div>
  <div class="orn">◆ ─── ✦ ─── ◆</div>
  <div class="meta">
    ${metaCell('شماره چک', c.number)}
    ${metaCell('در وجه', c.payeeName)}
    ${metaCell('تلفن ذی‌نفع', c.payeePhone ? toFaDigits(c.payeePhone) : '—')}
    ${metaCell('تاریخ صدور چک', formatJalaliFull(c.issueDate))}
    ${metaCell('تاریخ سررسید', formatJalaliFull(c.dueDate))}
    ${metaCell('سفارش مرتبط', c.orderCode ?? '—')}
    ${metaCell('تاریخ امضا', c.writtenAt ? formatJalaliFull(c.writtenAt) : 'هنوز امضا نشده')}
    ${metaCell('تحویل‌گیرنده', c.givenTo ?? '—')}
    ${metaCell('تاریخ وصول', c.collectedAt ? formatJalaliFull(c.collectedAt) : '—')}
  </div>
  <div class="amount-box">
    <div class="digits">
      <span class="lbl">مبلغ چک (ریال/تومان)</span>
      <span class="val">${money(c.amount)} تومان</span>
    </div>
    <div class="words"><b>مبلغ به حروف</b>${amountInPersianWords(c.amount)}</div>
  </div>
  <div class="pipe">
    ${CHEQUE_STATUSES.filter((s) => !['CLEARED'].includes(s.key))
      .map((s) => `<span class="step${s.key === c.status ? ' on" style="background:' + s.color : ''}">${s.label}</span>`)
      .join('')}
  </div>
  ${c.note ? `<div class="note">یادداشت: ${c.note}</div>` : ''}
  <div class="sign">
    <div><div class="line">تنظیم‌کننده — حسابدار</div></div>
    <div><div class="line">تأیید خزانه‌دار</div></div>
    <div><div class="line">امضای مدیریت</div></div>
  </div>
  <div class="foot">هایپر زیتون — پلتفرم مدیریت یکپارچه • این سند به‌صورت خودکار از سامانه تولید شده است</div>
  <script>window.onload = function () { window.print() }<\/script>
  </body></html>`
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) {
    toast({ title: 'اجازه باز شدن پنجره چاپ داده نشد', variant: 'destructive' })
    return
  }
  w.document.write(html)
  w.document.close()
}

const PAYMENT_TYPES = [
  { key: 'CASH_ON_DELIVERY', label: 'نقدی هنگام تحویل' },
  { key: 'CHEQUE', label: 'چک' },
  { key: 'TRANSFER', label: 'انتقال بانکی' },
  { key: 'OTHER', label: 'سایر' },
]

export function Payments() {
  const user = useApp((s) => s.user)
  const { data: catalog } = useCatalog()
  const holidaySet = React.useMemo(() => holidaySetOf(catalog), [catalog])

  const isOwner = Boolean(user && user.roleKeys.includes('owner'))
  const isGmTeam = Boolean(user && (user.isManager || ['gm', 'om'].some((k) => user.roleKeys.includes(k))))
  const canCreateCheque = Boolean(user && (user.isManager || ['gm', 'om', 'owner', 'accountant'].some((k) => user.roleKeys.includes(k))))
  const canCreatePayment = Boolean(user && (user.isManager || user.roleKeys.includes('accountant')))

  const [cheques, setCheques] = React.useState<ChequeRow[]>([])
  const [payments, setPayments] = React.useState<PaymentRow[]>([])
  const [meta, setMeta] = React.useState<{ todayCount: number; weekTotal: number } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL')
  const [ownerOnly, setOwnerOnly] = React.useState(false)
  const [dueDay, setDueDay] = React.useState<string | null>(null)

  // cheque due-date flexibility (انعطاف سررسید) — feeds calendar badges + planner
  const [flexibility, setFlexibility] = React.useState<FlexibilityConfig | null>(null)
  React.useEffect(() => {
    api<Record<string, string>>('/api/settings')
      .then((s) => setFlexibility(parseFlexibility(s.cheque_flexibility)))
      .catch(() => setFlexibility({ default: 0, levels: [] }))
  }, [])

  const refresh = React.useCallback(async () => {
    try {
      const [ch, pay] = await Promise.all([
        api<ChequeRow[]>('/api/cheques'),
        api<{ payments: PaymentRow[]; meta: { todayCount: number; weekTotal: number } }>('/api/payments?take=80'),
      ])
      setCheques(ch)
      setPayments(pay.payments)
      setMeta(pay.meta)
    } catch (e) {
      toast({ title: 'خطا در دریافت چک‌ها و پرداخت‌ها', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  const patchCheque = async (id: string, status: string, extra?: { note?: string; givenTo?: string }, successMsg?: string) => {
    try {
      await api('/api/cheques', { method: 'PATCH', body: { id, status, ...extra } })
      toast({ title: successMsg ?? 'وضعیت چک بروزرسانی شد ✅' })
      refresh()
      return true
    } catch (e) {
      toast({ title: 'خطا در تغییر وضعیت چک', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
      return false
    }
  }

  const filtered = React.useMemo(() => {
    let list = cheques
    if (statusFilter !== 'ALL') list = list.filter((c) => c.status === statusFilter)
    if (ownerOnly) list = list.filter((c) => c.signedById === user?.id)
    if (dueDay) list = list.filter((c) => isoDay(c.dueDate) === dueDay)
    return list
  }, [cheques, statusFilter, ownerOnly, dueDay, user])

  return (
    <div className="space-y-4">
      <SectionHeader
        title="چک‌ها و پرداخت‌ها"
        subtitle="تقویم سررسید چک‌ها، چرخه امضا/تحویل/وصول و دفتر پرداخت‌ها"
        icon={<Wallet className="h-6 w-6" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canCreateCheque && <PlannerButton holidays={holidaySet} onCreated={refresh} />}
            <FlexibilitySettingsButton
              isManager={Boolean(user?.isManager)}
              flexibility={flexibility}
              onSaved={setFlexibility}
            />
            {canCreateCheque && <CreateChequeButton holidays={holidaySet} onCreated={refresh} />}
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <StatCard title="در انتظار امضا" value={toFaDigits(cheques.filter((c) => c.status === 'PENDING_OWNER').length)} color="#C9A227" icon={<PenLine className="h-5 w-5" />} />
        <StatCard title="مبلغ چک‌های باز" value={<span className="num">{money(cheques.filter((c) => !['COLLECTED', 'CLEARED', 'REJECTED'].includes(c.status)).reduce((s, c) => s + c.amount, 0))}</span>} hint="تومان" color="#8A6F3C" icon={<CalendarClock className="h-5 w-5" />} fullValue={money(cheques.filter((c) => !['COLLECTED', 'CLEARED', 'REJECTED'].includes(c.status)).reduce((s, c) => s + c.amount, 0))} />
        <StatCard title="پرداخت هفته" value={<span className="num">{money(meta?.weekTotal ?? 0)}</span>} hint={`تومان — ${toFaDigits(meta?.todayCount ?? 0)} ثبت امروز`} color="#3E7C59" icon={<Wallet className="h-5 w-5" />} />
      </div>

      <Tabs defaultValue="cheques" dir="rtl">
        <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:flex">
          <TabsTrigger value="cheques" className="touch-target">🧾 چک‌ها</TabsTrigger>
          <TabsTrigger value="payments" className="touch-target">💳 پرداخت‌ها</TabsTrigger>
        </TabsList>

        {/* ---------------- cheques tab ---------------- */}
        <TabsContent value="cheques" className="space-y-4 mt-3">
          <DueHeatmap cheques={cheques} holidays={holidaySet} selected={dueDay} onSelect={setDueDay} />

          <ChequeCalendar cheques={cheques} holidays={holidaySet} flexibility={flexibility} />

          <div className="flex flex-wrap items-center gap-2">
            <ChipSelect options={CHEQUE_FILTERS} value={statusFilter} onChange={setStatusFilter} className="flex-1" />
            {isOwner && (
              <button
                type="button"
                onClick={() => setOwnerOnly((v) => !v)}
                aria-pressed={ownerOnly}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-bold border touch-target shrink-0',
                  ownerOnly ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card text-muted-foreground'
                )}
              >
                ✍️ امضاهای من
              </button>
            )}
          </div>

          {loading ? (
            <LoadingBlock rows={4} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Wallet />}
              title={dueDay ? 'چکی با این سررسید یافت نشد' : 'چکی یافت نشد'}
              description={dueDay ? 'برای بازگشت به همه چک‌ها، فیلتر سررسید را بردارید.' : 'با فیلتر وضعیت یا تقویم سررسید، چک‌ها را ببینید.'}
              action={dueDay && (
                <Button variant="outline" size="sm" onClick={() => setDueDay(null)}>حذف فیلتر سررسید</Button>
              )}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filtered.map((c) => (
                <ChequeCard
                  key={c.id}
                  cheque={c}
                  isOwner={isOwner}
                  isGmTeam={isGmTeam}
                  canSplit={canCreateCheque}
                  holidays={holidaySet}
                  onPatch={patchCheque}
                  onChanged={refresh}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------------- payments tab ---------------- */}
        <TabsContent value="payments" className="space-y-3 mt-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">دفتر پرداخت‌ها</p>
            {canCreatePayment && <CreatePaymentButton onCreated={refresh} />}
          </div>
          {loading ? (
            <LoadingBlock rows={3} />
          ) : payments.length === 0 ? (
            <EmptyState icon={<Wallet />} title="پرداختی ثبت نشده" />
          ) : (
            <div className="rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead>
                  <tr className="bg-accent/60 text-muted-foreground">
                    <th className="px-3 py-2.5 text-right font-medium">نوع</th>
                    <th className="px-3 py-2.5 text-center font-medium">رسید</th>
                    <th className="px-3 py-2.5 text-center font-medium">POS</th>
                    <th className="px-3 py-2.5 text-center font-medium">مبلغ</th>
                    <th className="px-3 py-2.5 text-center font-medium">سفارش</th>
                    <th className="px-3 py-2.5 text-center font-medium">تاریخ</th>
                    <th className="px-3 py-2.5 text-center font-medium">ثبت‌کننده</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-3 py-2.5">
                        <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">{payTypeLabel(p.type)}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-center num">{p.receiptNo ?? '—'}</td>
                      <td className="px-3 py-2.5 text-center num">{p.posReceiptNo ?? '—'}</td>
                      <td className="px-3 py-2.5 text-center num font-bold">{money(p.amount)}</td>
                      <td className="px-3 py-2.5 text-center num text-primary">{p.orderCode ?? '—'}</td>
                      <td className="px-3 py-2.5 text-center num">{formatJalaliDateTime(p.createdAt)}</td>
                      <td className="px-3 py-2.5 text-center">{p.userName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function payTypeLabel(t: string) {
  return PAYMENT_TYPES.find((x) => x.key === t)?.label ?? t
}

// ================= Cheque calendar =================
// ================= due heatmap (۸ هفته آینده) =================
function DueHeatmap({
  cheques, holidays, selected, onSelect,
}: {
  cheques: ChequeRow[]
  holidays: Set<string>
  selected: string | null
  onSelect: (iso: string | null) => void
}) {
  const days = React.useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const unsettled = cheques.filter((c) => !['COLLECTED', 'CLEARED', 'REJECTED', 'CANCELLED'].includes(c.status))
    const byDay = new Map<string, { count: number; amount: number }>()
    for (const c of unsettled) {
      const k = isoDay(c.dueDate)
      const e = byDay.get(k) ?? { count: 0, amount: 0 }
      e.count++
      e.amount += c.amount
      byDay.set(k, e)
    }
    const out: { iso: string; g: Date; jd: number; jmName: string; isToday: boolean; isFriday: boolean; isHoliday: boolean; count: number; amount: number }[] = []
    for (let i = 0; i < 56; i++) {
      const g = new Date(today)
      g.setDate(g.getDate() + i)
      const j = toJalali(g)
      const iso = isoDay(g)
      const e = byDay.get(iso) ?? { count: 0, amount: 0 }
      out.push({
        iso, g, jd: j.jd, jmName: JALALI_MONTHS[j.jm - 1].slice(0, 3),
        isToday: i === 0,
        isFriday: g.getDay() === 5,
        isHoliday: holidays.has(iso),
        count: e.count, amount: e.amount,
      })
    }
    return { days: out, max: Math.max(1, ...out.map((d) => d.amount)) }
  }, [cheques, holidays])

  const intensity = (amount: number) => {
    if (!amount) return 'transparent'
    const r = amount / days.max
    if (r > 0.66) return '#3E7C59'
    if (r > 0.33) return 'rgba(62,124,89,0.55)'
    return 'rgba(62,124,89,0.22)'
  }

  // arrange into 7 weekday rows × 8 week columns (RTL: first week on the right)
  const cells: (typeof days.days)[number][] = days.days
  const weekCols: (typeof cells)[] = []
  for (let w = 0; w < 8; w++) weekCols.push(cells.slice(w * 7, w * 7 + 7))

  const total = cells.reduce((s, d) => s + d.amount, 0)
  const totalCount = cells.reduce((s, d) => s + d.count, 0)

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <p className="text-sm font-bold">نقشه حرارتی سررسید چک‌ها — ۸ هفته آینده</p>
          <p className="text-[11px] text-muted-foreground num">
            {toFaDigits(totalCount)} چک باز • {money(total)} تومان — غلظت رنگ = مبلغ سررسید روز
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground" aria-hidden>
          کم
          <span className="h-3 w-3 rounded" style={{ background: 'rgba(62,124,89,0.22)' }} />
          <span className="h-3 w-3 rounded" style={{ background: 'rgba(62,124,89,0.55)' }} />
          <span className="h-3 w-3 rounded bg-[#3E7C59]" />
          زیاد
        </div>
      </div>
      <div className="overflow-x-auto nice-scroll pb-1">
        <div className="grid grid-rows-7 grid-flow-col gap-1 w-max" dir="rtl">
          {weekCols.map((week) =>
            week.map((d) => {
              const bg = intensity(d.amount)
              const isSel = selected === d.iso
              return (
                <button
                  key={d.iso}
                  type="button"
                  onClick={() => onSelect(isSel ? null : d.iso)}
                  aria-label={`${formatJalaliFull(d.g)}${d.count ? ` — ${d.count} چک، ${money(d.amount)} تومان` : ' — بدون سررسید'}`}
                  aria-pressed={isSel}
                  title={`${formatJalaliFull(d.g)}${d.count ? ` — ${toFaDigits(d.count)} چک، ${money(d.amount)} تومان` : ' — بدون سررسید'}`}
                  className={cn(
                    'h-6 w-6 sm:h-7 sm:w-7 rounded-md border transition-all hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring',
                    d.amount ? 'border-transparent' : 'border-border/60',
                    isSel && 'ring-2 ring-[#C9A227] ring-offset-1 ring-offset-card',
                    d.isToday && 'outline outline-1 outline-[#C9A227]/60'
                  )}
                  style={{ backgroundColor: bg || undefined }}
                >
                  <span
                    className={cn(
                      'text-[8px] num leading-none',
                      (d.isFriday || d.isHoliday) && d.amount ? 'text-white/90 font-bold' : (d.isFriday || d.isHoliday) ? 'text-pomegranate/70' : d.amount ? 'text-white/90 font-bold' : 'text-muted-foreground/50'
                    )}
                  >
                    {toFaDigits(d.jd)}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
      {selected && (
        <div className="mt-3 flex items-center gap-2 animate-in fade-in">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#8a6f1c] dark:text-[#e3c765] px-3 py-1 text-xs font-bold">
            فیلتر سررسید: {formatJalaliFull(isoToDate(selected))}
            <button type="button" onClick={() => onSelect(null)} aria-label="حذف فیلتر سررسید" className="hover:opacity-70">
              <XCircle className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      )}
    </div>
  )
}

function ChequeCalendar({
  cheques, holidays, flexibility,
}: {
  cheques: ChequeRow[]
  holidays: Set<string>
  flexibility?: FlexibilityConfig | null
}) {
  const now = React.useMemo(() => toJalali(new Date()), [])
  const [jy, setJy] = React.useState(now.jy)
  const [jm, setJm] = React.useState(now.jm)
  const [selected, setSelected] = React.useState<string | null>(null)

  const cells = React.useMemo(() => jalaliMonthGrid(jy, jm), [jy, jm])

  const byDay = React.useMemo(() => {
    const m = new Map<string, { count: number; amount: number; cheques: ChequeRow[] }>()
    for (const c of cheques) {
      if (['REJECTED'].includes(c.status)) continue
      const k = isoDay(c.dueDate)
      if (!m.has(k)) m.set(k, { count: 0, amount: 0, cheques: [] })
      const e = m.get(k)!
      e.count++
      e.amount += c.amount
      e.cheques.push(c)
    }
    return m
  }, [cheques])

  const monthTotal = React.useMemo(() => {
    let sum = 0
    let count = 0
    for (const cell of cells) {
      if (!cell) continue
      const e = byDay.get(isoDay(cell.gDate))
      if (e) { sum += e.amount; count += e.count }
    }
    return { sum, count }
  }, [cells, byDay])

  const move = (delta: number) => {
    let nm = jm + delta
    let ny = jy
    if (nm > 12) { nm = 1; ny++ }
    if (nm < 1) { nm = 12; ny-- }
    setJm(nm)
    setJy(ny)
    setSelected(null)
  }

  const dayCheques = selected ? byDay.get(selected)?.cheques ?? [] : []

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0 touch-target" onClick={() => move(1)} aria-label="ماه بعد">‹</Button>
        <div className="text-center">
          <p className="font-bold text-sm">{JALALI_MONTHS[jm - 1]} {toFaDigits(jy)}</p>
          <p className="text-[11px] text-muted-foreground num">{toFaDigits(monthTotal.count)} چک — {money(monthTotal.sum)} تومان</p>
        </div>
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0 touch-target" onClick={() => move(-1)} aria-label="ماه قبل">›</Button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {JALALI_WEEKDAYS_SHORT.map((d, i) => (
          <div key={i} className={cn('text-center text-[11px] font-medium py-1', i === 6 ? 'text-pomegranate' : 'text-muted-foreground')}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell) return <div key={`e${i}`} />
          const key = isoDay(cell.gDate)
          const entry = byDay.get(key)
          const isHoliday = holidays.has(key) || cell.isFriday
          const isSel = selected === key
          // انعطاف سررسید این روز (مهم‌ترین سطح منطبق) — badge on non-zero days
          const flex = flexibility ? resolveFlex(flexibility, cell.gDate) : null
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(isSel ? null : key)}
              aria-label={`${formatJalaliFull(cell.gDate)}${entry ? ` — ${entry.count} چک` : ''}${flex && flex.days ? ` — انعطاف ${toFaDigits(flex.days)} روز` : ''}`}
              className={cn(
                'relative h-14 sm:h-16 rounded-xl border text-center transition-colors flex flex-col items-center justify-center gap-0.5',
                isSel ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-border hover:bg-accent/60',
                isHoliday && 'bg-pomegranate/5'
              )}
            >
              <span className={cn('text-xs num font-bold', isHoliday ? 'text-pomegranate' : 'text-foreground')}>{toFaDigits(cell.jd)}</span>
              {flex && flex.days !== 0 && (
                <span
                  title={`انعطاف سررسید: ${toFaDigits(flex.days)} روز${flex.keyLabel ? ` — سطح ${flex.keyLabel}` : ' — سطح پیش‌فرض'}`}
                  className="absolute top-1 left-1 rounded-md bg-[#3E7C59]/15 text-[#3E7C59] dark:text-[#7fc49c] text-[9px] num font-bold px-1 leading-4"
                >
                  +{toFaDigits(flex.days)}
                </span>
              )}
              {entry && (
                <>
                  <span className="text-[10px] num font-bold text-[#8a6f3c]">{toFaDigits(entry.count)} چک</span>
                  <span className="absolute bottom-1 flex gap-0.5" aria-hidden>
                    <span className="h-1.5 w-1.5 rounded-full bg-[#C9A227]" />
                    {entry.amount > 500_000_000 && <span className="h-1.5 w-1.5 rounded-full bg-[#8A6F3C]" />}
                  </span>
                </>
              )}
              {isHoliday && !entry && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-pomegranate/60" aria-hidden />}
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="mt-3 pt-3 border-t border-border space-y-2 animate-in fade-in">
          <p className="text-xs font-bold">{formatJalaliFull(isoToDate(selected))}</p>
          {dayCheques.length === 0 ? (
            <p className="text-xs text-muted-foreground">چکی در این روز سررسید نمی‌شود</p>
          ) : (
            dayCheques.map((c) => {
              const ci = chequeStatusInfo(c.status)
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-2 text-xs rounded-lg border border-border px-2.5 py-2">
                  <span className="num font-bold">{c.number}</span>
                  <span>{c.payeeName}</span>
                  <span className="num font-bold text-primary ms-auto">{money(c.amount)} تومان</span>
                  <StatusBadge label={ci.label} color={ci.color} />
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// helper: isoDay (gregorian yyyy-mm-dd) back to Date
function isoToDate(selected: string): Date {
  const [y, m, d] = toEnDigits(selected).split('-').map(Number)
  return new Date(y, m - 1, d)
}

// ================= Cheque card =================
function ChequeCard({
  cheque, isOwner, isGmTeam, canSplit, holidays, onPatch, onChanged,
}: {
  cheque: ChequeRow
  isOwner: boolean
  isGmTeam: boolean
  canSplit: boolean
  holidays: Set<string>
  onPatch: (id: string, status: string, extra?: { note?: string; givenTo?: string }, msg?: string) => Promise<boolean>
  onChanged: () => void
}) {
  const c = cheque
  const ci = chequeStatusInfo(c.status)
  const [busy, setBusy] = React.useState(false)
  const [rejectOpen, setRejectOpen] = React.useState(false)
  const [rejectNote, setRejectNote] = React.useState('')
  const [deliverOpen, setDeliverOpen] = React.useState(false)
  const [givenTo, setGivenTo] = React.useState('')
  const [splitOpen, setSplitOpen] = React.useState(false)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    await fn()
    setBusy(false)
  }

  return (
    <div className={cn('rounded-2xl border bg-card p-4 space-y-2.5', ['PENDING_OWNER'].includes(c.status) ? 'border-[#C9A227]/50' : 'border-border')}>
      <div className="flex items-center justify-between gap-2">
        <span className="num font-bold text-sm">{c.number}</span>
        <StatusBadge label={ci.label} color={ci.color} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-bold">{c.payeeName}</span>
        {c.payeePhone && <span className="num text-muted-foreground">☎ {toFaDigits(c.payeePhone)}</span>}
        <span className="num font-extrabold text-base text-primary">{money(c.amount)} <span className="text-[10px] font-normal text-muted-foreground">تومان</span></span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>📅 سررسید: <span className="num">{formatJalali(c.dueDate)}</span></span>
        {c.orderCode && <span>سفارش: <span className="num text-primary">{c.orderCode}</span></span>}
        {c.writtenAt && <span>امضا: <span className="num">{formatJalali(c.writtenAt)}</span></span>}
        {c.givenTo && <span>تحویل‌گیرنده: {c.givenTo}</span>}
        {c.collectedAt && <span>وصول: <span className="num">{formatJalali(c.collectedAt)}</span></span>}
      </div>
      {c.note && <p className="text-[11px] text-muted-foreground leading-5">{c.note}</p>}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" className="touch-target gap-1.5" onClick={() => printChequeVoucher(c)} title="چاپ سند پرداخت">
          <Printer className="h-4 w-4" /> چاپ سند
        </Button>
        {c.status === 'PENDING_OWNER' && isOwner && (
          <>
            <Button size="sm" className="touch-target font-bold" disabled={busy} onClick={() => run(async () => { await onPatch(c.id, 'SIGNED', {}, 'چک امضا و تأیید شد ✍️') })}>
              <PenLine className="h-4 w-4" /> امضا و تأیید
            </Button>
            <Button size="sm" variant="outline" className="touch-target text-pomegranate border-pomegranate/40" disabled={busy} onClick={() => setRejectOpen(true)}>
              <XCircle className="h-4 w-4" /> رد
            </Button>
          </>
        )}
        {c.status === 'SIGNED' && isGmTeam && (
          <Button size="sm" className="touch-target" disabled={busy} onClick={() => { setGivenTo(''); setDeliverOpen(true) }}>
            <Truck className="h-4 w-4" /> تحویل به نماینده
          </Button>
        )}
        {c.status === 'DELIVERED' && isGmTeam && (
          <Button size="sm" className="touch-target" disabled={busy} onClick={() => run(async () => { await onPatch(c.id, 'COLLECTED', {}, 'چک وصول شد ✅') })}>
            <BadgeCheck className="h-4 w-4" /> وصول شد
          </Button>
        )}
        {['SIGNED', 'DELIVERED'].includes(c.status) && isGmTeam && (
          <Button size="sm" variant="outline" className="touch-target text-[#B07D2B] border-[#B07D2B]/40" disabled={busy} onClick={() => run(async () => { await onPatch(c.id, 'UNCOLLECTED_REPORTED', {}, 'پیگیری عدم دریافت ثبت شد') })}>
            <AlertTriangle className="h-4 w-4" /> پیگیری عدم دریافت
          </Button>
        )}
        {['PENDING_OWNER', 'SIGNED'].includes(c.status) && canSplit && (
          <Button size="sm" variant="outline" className="touch-target" onClick={() => setSplitOpen(true)}>
            <SplitSquareHorizontal className="h-4 w-4" /> تقسیم چک
          </Button>
        )}
      </div>

      {/* reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">رد چک {c.number}</DialogTitle>
            <DialogDescription className="text-xs">دلیل رد در یادداشت چک ثبت می‌شود.</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="دلیل رد…" className="min-h-20" aria-label="دلیل رد" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="touch-target" onClick={() => setRejectOpen(false)}>انصراف</Button>
            <Button
              variant="destructive"
              size="sm"
              className="touch-target"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const okRes = await onPatch(c.id, 'REJECTED', { note: rejectNote || 'رد شده توسط مالک' }, 'چک رد شد')
                  if (okRes) setRejectOpen(false)
                })
              }
            >
              <Ban className="h-4 w-4" /> رد قطعی
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* deliver dialog */}
      <Dialog open={deliverOpen} onOpenChange={setDeliverOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">تحویل چک به نماینده</DialogTitle>
            <DialogDescription className="text-xs">نام نماینده‌ای که چک را می‌برد را وارد کنید.</DialogDescription>
          </DialogHeader>
          <Input value={givenTo} onChange={(e) => setGivenTo(e.target.value)} placeholder="نام نماینده…" className="h-11" aria-label="نام نماینده" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="touch-target" onClick={() => setDeliverOpen(false)}>انصراف</Button>
            <Button
              size="sm"
              className="touch-target"
              disabled={busy || !givenTo.trim()}
              onClick={() =>
                run(async () => {
                  const okRes = await onPatch(c.id, 'DELIVERED', { givenTo: givenTo.trim() }, 'تحویل چک ثبت شد 📤')
                  if (okRes) setDeliverOpen(false)
                })
              }
            >
              ثبت تحویل
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* split dialog */}
      <SplitChequeDialog open={splitOpen} onOpenChange={setSplitOpen} cheque={c} holidays={holidays} onDone={onChanged} />
    </div>
  )
}

// ================= split dialog =================
function SplitChequeDialog({
  open, onOpenChange, cheque, holidays, onDone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  cheque: ChequeRow
  holidays: Set<string>
  onDone: () => void
}) {
  const [parts, setParts] = React.useState<{ amount: string; dueDate: Date | null }[]>([
    { amount: '', dueDate: null },
    { amount: '', dueDate: null },
  ])
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      const half = Math.floor(cheque.amount / 2)
      setParts([
        { amount: String(half), dueDate: null },
        { amount: String(cheque.amount - half), dueDate: null },
      ])
    }
  }, [open, cheque])

  const sum = parts.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const diff = sum - cheque.amount

  const submit = async () => {
    setSaving(true)
    try {
      await api('/api/cheques/split', {
        body: {
          id: cheque.id,
          parts: parts.map((p) => ({ amount: Number(p.amount), dueDate: p.dueDate ? p.dueDate.toISOString() : null })),
        },
      })
      toast({ title: `چک به ${toFaDigits(parts.length)} بخش تقسیم شد ✂️`, description: 'بخش‌های جدید در انتظار امضای مالک هستند' })
      onOpenChange(false)
      onDone()
    } catch (e) {
      toast({ title: 'خطا در تقسیم چک', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">تقسیم چک {cheque.number}</DialogTitle>
          <DialogDescription className="text-xs">
            مبلغ اصلی: <span className="num font-bold">{money(cheque.amount)}</span> تومان — جمع بخش‌ها باید دقیقاً برابر باشد.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5">
          {parts.map((p, i) => {
            const closed = p.dueDate ? isClosedDay(p.dueDate, holidays) : false
            return (
              <div key={i} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold">بخش {toFaDigits(i + 1)}</p>
                  {parts.length > 2 && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-pomegranate" onClick={() => setParts((prev) => prev.filter((_, j) => j !== i))}>
                      حذف
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input
                    value={p.amount}
                    onChange={(e) => setParts((prev) => prev.map((x, j) => (j === i ? { ...x, amount: e.target.value.replace(/[^\d.]/g, '') } : x)))}
                    inputMode="numeric"
                    placeholder="مبلغ (تومان)"
                    className="h-11 num"
                    aria-label={`مبلغ بخش ${i + 1}`}
                  />
                  <JalaliDatePicker
                    value={p.dueDate}
                    onChange={(d) => setParts((prev) => prev.map((x, j) => (j === i ? { ...x, dueDate: d } : x)))}
                    holidays={holidays}
                    allowClear={false}
                  />
                </div>
                {closed && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[#C9A227]/10 border border-[#C9A227]/40 px-2.5 py-2 text-[11px] text-[#8a6f3c]" role="alert">
                    <span className="font-bold">سررسید به تعطیلات می‌افتد؛ زودتر انتخاب کنید</span>
                    {p.dueDate && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-[11px]"
                        onClick={() => setParts((prev) => prev.map((x, j) => (j === i ? { ...x, dueDate: suggestOpenDay(p.dueDate!, holidays) } : x)))}
                      >
                        پیشنهاد: {formatJalali(suggestOpenDay(p.dueDate, holidays))}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex items-center justify-between text-xs">
          <Button
            variant="outline"
            size="sm"
            className="touch-target"
            onClick={() => setParts((prev) => [...prev, { amount: '', dueDate: null }])}
            disabled={parts.length >= 6}
          >
            <Plus className="h-4 w-4" /> افزودن بخش
          </Button>
          <span className={cn('num font-bold', Math.abs(diff) <= 1 ? 'text-primary' : 'text-pomegranate')}>
            جمع: {money(sum)} / {money(cheque.amount)} {Math.abs(diff) > 1 && `(اختلاف ${money(diff)})`}
          </span>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" className="touch-target" onClick={() => onOpenChange(false)} disabled={saving}>انصراف</Button>
          <Button size="sm" className="touch-target font-bold" onClick={submit} disabled={saving || Math.abs(diff) > 1 || parts.some((p) => !Number(p.amount) || !p.dueDate)}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} تقسیم قطعی
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ================= create cheque =================
function CreateChequeButton({
  holidays, onCreated,
}: {
  holidays: Set<string>
  onCreated: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [amount, setAmount] = React.useState('')
  const [payeeName, setPayeeName] = React.useState('')
  const [payeePhone, setPayeePhone] = React.useState('')
  const [dueDate, setDueDate] = React.useState<Date | null>(null)
  const [note, setNote] = React.useState('')
  const [orderQuery, setOrderQuery] = React.useState('')
  const [orderResults, setOrderResults] = React.useState<OrderLite[]>([])
  const [orderId, setOrderId] = React.useState<string | null>(null)
  const [isForOrder, setIsForOrder] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setAmount(''); setPayeeName(''); setPayeePhone(''); setDueDate(null); setNote(''); setOrderQuery(''); setOrderId(null)
  }, [open])

  React.useEffect(() => {
    if (!open || orderQuery.trim().length < 2) { setOrderResults([]); return }
    const t = setTimeout(() => {
      api<OrderLite[]>(`/api/orders?q=${encodeURIComponent(orderQuery.trim())}`)
        .then((list) => setOrderResults(list.slice(0, 6)))
        .catch(() => setOrderResults([]))
    }, 300)
    return () => clearTimeout(t)
  }, [orderQuery, open])

  const closed = dueDate ? isClosedDay(dueDate, holidays) : false

  const submit = async () => {
    setSaving(true)
    try {
      await api('/api/cheques', {
        body: {
          amount: Number(amount),
          payeeName,
          payeePhone: payeePhone || undefined,
          dueDate: dueDate?.toISOString(),
          orderId: orderId ?? undefined,
          isForOrder,
          note: note || undefined,
        },
      })
      toast({ title: 'چک صادر شد و در انتظار امضای مالک است ✍️' })
      setOpen(false)
      onCreated()
    } catch (e) {
      toast({ title: 'خطا در صدور چک', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button className="touch-target font-bold" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> صدور چک
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">صدور چک جدید</DialogTitle>
            <DialogDescription className="text-xs">سررسید نباید جمعه یا روز تعطیل باشد.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold mb-1.5 block">مبلغ (تومان)</label>
                <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="numeric" className="h-11 num" aria-label="مبلغ چک" />
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">تلفن گیرنده</label>
                <Input value={payeePhone} onChange={(e) => setPayeePhone(e.target.value)} inputMode="tel" className="h-11 num" aria-label="تلفن گیرنده" />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold mb-1.5 block">نام گیرنده</label>
              <Input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} className="h-11" aria-label="نام گیرنده" />
            </div>
            <div>
              <label className="text-xs font-bold mb-1.5 block">تاریخ سررسید</label>
              <JalaliDatePicker value={dueDate} onChange={setDueDate} holidays={holidays} allowClear={false} />
              <p className="text-[11px] text-muted-foreground mt-1">{dueDate ? formatJalaliFull(dueDate) : 'انتخاب نشده'}</p>
            </div>
            {closed && dueDate && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/40 px-3 py-2.5 text-xs text-[#8a6f3c]" role="alert">
                <span className="font-bold">سررسید به تعطیلات می‌افتد؛ زودتر انتخاب کنید</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-[11px]"
                  onClick={() => setDueDate(suggestOpenDay(dueDate, holidays))}
                >
                  پیشنهاد: {formatJalali(suggestOpenDay(dueDate, holidays))}
                </Button>
              </div>
            )}
            <div>
              <label className="text-xs font-bold mb-1.5 block">لینک به سفارش (اختیاری)</label>
              {orderId ? (
                <div className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
                  <span className="num font-bold">{orderResults.find((o) => o.id === orderId)?.code ?? 'سفارش انتخاب‌شده'}</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOrderId(null)}>حذف لینک</Button>
                </div>
              ) : (
                <>
                  <Input value={orderQuery} onChange={(e) => setOrderQuery(e.target.value)} placeholder="جستجو با کد سفارش…" className="h-11 num" aria-label="جستجوی سفارش" />
                  {orderResults.length > 0 && (
                    <div className="mt-1.5 rounded-xl border border-border divide-y divide-border max-h-36 overflow-y-auto">
                      {orderResults.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => { setOrderId(o.id); setIsForOrder(true) }}
                          className="w-full text-right px-3 py-2 text-xs hover:bg-accent touch-target flex items-center justify-between"
                        >
                          <span className="num font-bold">{o.code}</span>
                          <span className="text-muted-foreground">{o.providerName} • <span className="num">{money(o.finalAmount)}</span></span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
              <span className="text-xs font-bold">چک بابت سفارش است</span>
              <Switch checked={isForOrder} onCheckedChange={setIsForOrder} aria-label="چک بابت سفارش" />
            </div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="یادداشت (اختیاری)…" className="min-h-16" aria-label="یادداشت چک" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="touch-target" onClick={() => setOpen(false)} disabled={saving}>انصراف</Button>
            <Button size="sm" className="touch-target font-bold" onClick={submit} disabled={saving || !Number(amount) || !payeeName.trim() || !dueDate || closed}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} صدور چک
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ================= create payment =================
function CreatePaymentButton({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [amount, setAmount] = React.useState('')
  const [type, setType] = React.useState('CASH_ON_DELIVERY')
  const [receiptNo, setReceiptNo] = React.useState('')
  const [posReceiptNo, setPosReceiptNo] = React.useState('')
  const [note, setNote] = React.useState('')
  const [orderQuery, setOrderQuery] = React.useState('')
  const [orderResults, setOrderResults] = React.useState<OrderLite[]>([])
  const [orderId, setOrderId] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setAmount(''); setReceiptNo(''); setPosReceiptNo(''); setNote(''); setOrderQuery(''); setOrderId(null); setType('CASH_ON_DELIVERY')
  }, [open])

  React.useEffect(() => {
    if (!open || orderQuery.trim().length < 2) { setOrderResults([]); return }
    const t = setTimeout(() => {
      api<OrderLite[]>(`/api/orders?q=${encodeURIComponent(orderQuery.trim())}`)
        .then((list) => setOrderResults(list.slice(0, 6)))
        .catch(() => setOrderResults([]))
    }, 300)
    return () => clearTimeout(t)
  }, [orderQuery, open])

  const submit = async () => {
    setSaving(true)
    try {
      await api('/api/payments', {
        body: {
          amount: Number(amount),
          type,
          receiptNo: receiptNo || undefined,
          posReceiptNo: posReceiptNo || undefined,
          note: note || undefined,
          orderId: orderId ?? undefined,
        },
      })
      toast({ title: 'پرداخت ثبت شد ✅' })
      setOpen(false)
      onCreated()
    } catch (e) {
      toast({ title: 'خطا در ثبت پرداخت', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button variant="outline" className="touch-target" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> ثبت پرداخت
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">ثبت پرداخت جدید</DialogTitle>
            <DialogDescription className="text-xs">پرداخت‌های نقدی/انتقالی و رسیدها را ثبت کنید.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold mb-1.5 block">مبلغ (تومان)</label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="numeric" className="h-11 num" aria-label="مبلغ پرداخت" />
            </div>
            <div>
              <label className="text-xs font-bold mb-1.5 block">نوع پرداخت</label>
              <div className="grid grid-cols-2 gap-1.5">
                {PAYMENT_TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    aria-pressed={type === t.key}
                    onClick={() => setType(t.key)}
                    className={cn('rounded-xl border py-2.5 text-xs font-bold touch-target', type === t.key ? 'border-primary bg-primary/10 text-primary' : 'bg-card')}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold mb-1.5 block">شماره رسید</label>
                <Input value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} className="h-11 num" aria-label="شماره رسید" />
              </div>
              <div>
                <label className="text-xs font-bold mb-1.5 block">رسید POS</label>
                <Input value={posReceiptNo} onChange={(e) => setPosReceiptNo(e.target.value)} className="h-11 num" aria-label="رسید POS" />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold mb-1.5 block">لینک به سفارش (اختیاری)</label>
              {orderId ? (
                <div className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
                  <span className="num font-bold">{orderResults.find((o) => o.id === orderId)?.code ?? 'سفارش انتخاب‌شده'}</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOrderId(null)}>حذف لینک</Button>
                </div>
              ) : (
                <Input value={orderQuery} onChange={(e) => setOrderQuery(e.target.value)} placeholder="جستجو با کد سفارش…" className="h-11 num" aria-label="جستجوی سفارش" />
              )}
              {orderId === null && orderResults.length > 0 && (
                <div className="mt-1.5 rounded-xl border border-border divide-y divide-border max-h-32 overflow-y-auto">
                  {orderResults.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setOrderId(o.id)}
                      className="w-full text-right px-3 py-2 text-xs hover:bg-accent touch-target flex items-center justify-between"
                    >
                      <span className="num font-bold">{o.code}</span>
                      <span className="text-muted-foreground num">{money(o.finalAmount)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="یادداشت (اختیاری)…" className="min-h-16" aria-label="یادداشت پرداخت" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="touch-target" onClick={() => setOpen(false)} disabled={saving}>انصراف</Button>
            <Button size="sm" className="touch-target font-bold" onClick={submit} disabled={saving || !Number(amount)}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} ثبت پرداخت
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ============================================================
// SMART CHEQUE PLANNER (برنامه‌ریز چک) — task 9-a
// کاربر فقط «چند روز بعد» را می‌داند؛ ابزار، تاریخ سررسید را با احتساب
// انعطاف و روزهای تعطیل پیشنهاد می‌دهد.
// ============================================================

interface PlannerAlt {
  iso: string
  jalali: string
  weekdayFa: string
  isFriday: boolean
  isHoliday: boolean
  holidayName?: string
  flexDays: number
  flexSource: string
  flexSourceFa: string
}

interface PlannerProposal {
  index: number
  baseISO: string
  baseJalali: string
  flexDays: number
  flexSource: string
  flexSourceFa: string
  candidateISO: string
  candidateJalali: string
  weekdayFa: string
  isFriday: boolean
  isHoliday: boolean
  holidayName?: string
  warnings: string[]
  alternatives: PlannerAlt[]
}

// numeric stepper (۴۵±) با اعداد فارسی
function NumStepper({
  value, onChange, min, max, ariaLabel,
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  ariaLabel: string
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  return (
    <div className="flex items-center gap-1 rounded-xl border border-border p-1 w-fit bg-card">
      <button
        type="button"
        aria-label="کاهش"
        onClick={() => onChange(clamp(value - 1))}
        className="h-9 w-9 rounded-lg hover:bg-accent flex items-center justify-center touch-target active:scale-90 transition-transform"
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        aria-label={ariaLabel}
        value={toFaDigits(value)}
        inputMode="numeric"
        onChange={(e) => {
          const n = Number(toEnDigits(e.target.value).replace(/[^\d]/g, ''))
          onChange(clamp(Number.isFinite(n) && n > 0 ? n : min))
        }}
        className="w-12 h-8 text-center text-sm font-bold num bg-transparent outline-none"
      />
      <button
        type="button"
        aria-label="افزایش"
        onClick={() => onChange(clamp(value + 1))}
        className="h-9 w-9 rounded-lg hover:bg-accent flex items-center justify-center touch-target active:scale-90 transition-transform text-primary"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}

function PlannerButton({
  holidays, onCreated,
}: {
  holidays: Set<string>
  onCreated: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [start, setStart] = React.useState<Date>(new Date())
  const [maxDays, setMaxDays] = React.useState(45)
  const [count, setCount] = React.useState(1)
  const [amount, setAmount] = React.useState('')
  const [payeeName, setPayeeName] = React.useState('')
  const [note, setNote] = React.useState('')
  const [proposals, setProposals] = React.useState<PlannerProposal[] | null>(null)
  const [fetching, setFetching] = React.useState(false)
  const [overrides, setOverrides] = React.useState<Record<number, string>>({})
  const [inserting, setInserting] = React.useState(false)

  const startISO = isoDay(start)
  const amountNum = Number(toEnDigits(amount).replace(/[^\d.]/g, '')) || 0

  // reset on open
  React.useEffect(() => {
    if (!open) return
    setStart(new Date())
    setMaxDays(45)
    setCount(1)
    setAmount('')
    setPayeeName('')
    setNote('')
    setProposals(null)
    setOverrides({})
  }, [open])

  // live proposals — debounced; فقط ورودی‌های محاسبه (start/maxDays/count) را دوباره می‌پرسد
  React.useEffect(() => {
    if (!open) return
    let alive = true
    setFetching(true)
    const t = setTimeout(() => {
      api<{ proposals: PlannerProposal[] }>('/api/cheques/planner', {
        body: { startISO, maxDays, count },
      })
        .then((res) => {
          if (!alive) return
          setProposals(res.proposals)
          setOverrides({})
        })
        .catch((e) => {
          if (!alive) return
          toast({ title: 'خطا در محاسبه برنامه‌ریز چک', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
        })
        .finally(() => {
          if (alive) setFetching(false)
        })
    }, 450)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [open, startISO, maxDays, count])

  // live client preview: choosing an alternative shifts the remaining cheques by the same delta
  const previews = React.useMemo(() => {
    if (!proposals) return []
    let carry = 0
    return proposals.map((p) => {
      const candidate = isoToDate(p.candidateISO)
      const ov = overrides[p.index]
      let date: Date
      let overridden = false
      if (ov) {
        date = isoToDate(ov)
        carry = Math.round((date.getTime() - candidate.getTime()) / 86_400_000)
        overridden = true
      } else if (carry !== 0) {
        date = addDays(candidate, carry)
      } else {
        date = candidate
      }
      const closed = isClosedDay(date, holidays)
      return {
        p,
        date,
        carryAfter: carry,
        overridden,
        shifted: overridden || carry !== 0,
        closed,
        finalDate: closed ? suggestOpenDay(date, holidays) : date,
      }
    })
  }, [proposals, overrides, holidays])

  const adjustedCount = previews.filter((pv) => pv.closed).length

  const insert = async () => {
    if (!amountNum || !payeeName.trim() || previews.length === 0) return
    setInserting(true)
    try {
      for (const pv of previews) {
        await api('/api/cheques', {
          body: {
            amount: amountNum,
            payeeName: payeeName.trim(),
            dueDate: pv.finalDate.toISOString(),
            isForOrder: false,
            note: [note.trim(), count > 1 ? `برنامه‌ریز چک — قسط ${toFaDigits(pv.p.index + 1)} از ${toFaDigits(count)}` : 'برنامه‌ریز چک']
              .filter(Boolean)
              .join(' — '),
          },
        })
      }
      toast({
        title: `${toFaDigits(previews.length)} چک در تقویم ثبت شد ✅`,
        description: adjustedCount > 0 ? `${toFaDigits(adjustedCount)} سررسیدِ تعطیل به روز باز قبل منتقل شد` : 'همه در انتظار امضای مالک هستند',
      })
      setOpen(false)
      onCreated()
    } catch (e) {
      toast({ title: 'خطا در درج چک‌ها', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setInserting(false)
    }
  }

  return (
    <>
      <Button
        className="touch-target font-bold bg-[#C9A227] hover:bg-[#a8861d] text-white shadow-sm"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-4 w-4" /> برنامه‌ریز چک
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#C9A227]" /> برنامه‌ریز چک
            </DialogTitle>
            <DialogDescription className="text-xs leading-5">
              تاریخ سررسید را نمی‌دانید؟ فقط بازه را بنویسید؛ سررسید منطقی با احتساب انعطاف و تعطیلات پیشنهاد می‌شود.
            </DialogDescription>
          </DialogHeader>

          {/* ---------- inputs ---------- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold mb-1.5 block">تاریخ شروع (مبنا)</label>
              <JalaliDatePicker value={start} onChange={(d) => d && setStart(d)} allowClear={false} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1.5 block">سررسید چند روز بعد؟</label>
              <NumStepper value={maxDays} onChange={setMaxDays} min={1} max={365} ariaLabel="بازه سررسید به روز" />
              <div className="flex gap-1.5 mt-1.5">
                {[30, 45, 60, 90].map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={maxDays === d}
                    onClick={() => setMaxDays(d)}
                    className={cn(
                      'rounded-full px-3 py-1 text-[11px] font-bold border touch-target num',
                      maxDays === d ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card text-muted-foreground'
                    )}
                  >
                    {toFaDigits(d)} روز
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-bold mb-1.5 block">تعداد چک (۱ تا ۱۲)</label>
              <NumStepper value={count} onChange={(v) => setCount(Math.min(12, Math.max(1, v)))} min={1} max={12} ariaLabel="تعداد چک" />
              {count > 1 && <p className="text-[11px] text-muted-foreground mt-1.5">چک‌ها پشت‌سرهم با فاصله ۳۰ روزه چیده می‌شوند.</p>}
            </div>
            <div>
              <label className="text-xs font-bold mb-1.5 block">مبلغ هر چک (تومان — اختیاری برای محاسبه)</label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="numeric"
                className="h-11 num"
                aria-label="مبلغ هر چک"
              />
              {amountNum > 0 && <p className="text-[11px] text-primary num mt-1">{money(amountNum)} تومان{count > 1 ? ` × ${toFaDigits(count)} چک = ${money(amountNum * count)}` : ''}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-bold mb-1.5 block">در وجه (برای درج در تقویم)</label>
              <Input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} className="h-11" placeholder="نام گیرنده چک…" aria-label="در وجه" />
            </div>
            <div className="sm:col-span-2">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="یادداشت (اختیاری)…" className="min-h-14" aria-label="یادداشت چک‌ها" />
            </div>
          </div>

          {/* ---------- live proposals ---------- */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold">پیشنهاد سررسید</p>
              {fetching && <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> در حال محاسبه…</span>}
            </div>
            {!proposals && !fetching && <p className="text-xs text-muted-foreground">برای مشاهده پیشنهاد، بازه و تعداد را تنظیم کنید.</p>}
            {previews.map(({ p, date, shifted, closed, finalDate, carryAfter }) => {
              const flexLabel = p.flexDays > 0 ? `انعطاف ${p.flexSourceFa}: ${toFaDigits(p.flexDays)} روز` : ''
              return (
                <div key={p.index} className={cn('rounded-xl border p-3 space-y-2', p.isFriday || p.isHoliday ? 'border-[#C9A227]/50 bg-[#C9A227]/5' : 'border-border')}>
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <p className="text-xs font-bold">چک {toFaDigits(p.index + 1)}</p>
                    <span className="text-[11px] text-muted-foreground num">
                      پایه: {p.baseJalali} (+{toFaDigits(maxDays)} روز{count > 1 && p.index > 0 ? ` + ${toFaDigits(p.index * 30)} فاصله` : ''})
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('text-2xl font-black num leading-none', closed ? 'text-pomegranate' : 'text-primary')}>
                      {formatJalali(date)}
                    </span>
                    <span className="text-xs text-muted-foreground">{weekdayFa(date)}</span>
                    {flexLabel && (
                      <span className="rounded-full bg-[#3E7C59]/12 border border-[#3E7C59]/35 text-[#3E7C59] px-2.5 py-0.5 text-[11px] font-bold num">
                        {flexLabel}
                      </span>
                    )}
                    {shifted && (
                      <span className="rounded-full bg-accent border border-border px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                        <MoveHorizontal className="h-3 w-3" /> بازبینی زنده
                      </span>
                    )}
                  </div>
                  {p.warnings.map((w, wi) => (
                    <div key={wi} role="alert" className="rounded-lg bg-[#C9A227]/12 border border-[#C9A227]/40 px-2.5 py-2 text-[11px] font-medium text-[#8a6f3c] dark:text-[#e3c765]">
                      ⚠️ {w}
                    </div>
                  ))}
                  {closed && !p.warnings.length && (
                    <div role="alert" className="rounded-lg bg-[#C9A227]/12 border border-[#C9A227]/40 px-2.5 py-2 text-[11px] font-medium text-[#8a6f3c] dark:text-[#e3c765]">
                      ⚠️ تاریخ بازبینی‌شده مصادف با تعطیل است — هنگام درج، به روز بازِ قبل ({formatJalali(finalDate)}) منتقل می‌شود.
                    </div>
                  )}
                  {p.alternatives.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-bold text-muted-foreground">روزهای باز پیشنهادی — انتخاب کنید:</p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          aria-pressed={!overrides[p.index]}
                          onClick={() => setOverrides((prev) => { const n = { ...prev }; delete n[p.index]; return n })}
                          className={cn(
                            'rounded-full px-3 py-1.5 text-[11px] font-bold border touch-target num',
                            !overrides[p.index] ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card hover:bg-accent'
                          )}
                        >
                          {p.candidateJalali} (پیشنهاد اصلی)
                        </button>
                        {p.alternatives.map((a) => {
                          const active = overrides[p.index] === a.iso
                          return (
                            <button
                              key={a.iso}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setOverrides((prev) => ({ ...prev, [p.index]: a.iso }))}
                              title={`${a.weekdayFa}${a.isFriday ? ' — جمعه' : ''}${a.isHoliday ? ` — تعطیل ${a.holidayName ?? ''}` : ''}${a.flexDays ? ` — انعطاف ${toFaDigits(a.flexDays)} روز` : ''}`}
                              className={cn(
                                'rounded-full px-3 py-1.5 text-[11px] font-bold border touch-target num',
                                active ? 'bg-[#C9A227] text-white border-transparent' : 'bg-card hover:bg-accent'
                              )}
                            >
                              {a.jalali}
                              <span className="font-normal text-muted-foreground"> {a.weekdayFa}</span>
                              {a.flexDays > 0 && <span className="text-[#3E7C59] font-bold"> +{toFaDigits(a.flexDays)}</span>}
                            </button>
                          )
                        })}
                      </div>
                      {overrides[p.index] && carryAfter !== 0 && count > 1 && p.index + 1 < count && (
                        <p className="text-[11px] text-muted-foreground num">
                          چک‌های بعدی {toFaDigits(Math.abs(carryAfter))} روز {carryAfter > 0 ? 'به بعد' : 'به قبل'} منتقل می‌شوند.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-border">
            <p className="text-[11px] text-muted-foreground ms-auto">
              {previews.length > 0 && `جمع درج: ${toFaDigits(previews.length)} چک${amountNum > 0 ? ` — ${money(amountNum * previews.length)} تومان` : ''}`}
            </p>
            <Button variant="outline" size="sm" className="touch-target" onClick={() => setOpen(false)} disabled={inserting}>انصراف</Button>
            <Button
              size="sm"
              className="touch-target font-bold"
              onClick={insert}
              disabled={inserting || fetching || !amountNum || !payeeName.trim() || previews.length === 0}
            >
              {inserting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              درج در تقویم
            </Button>
          </div>
          {(!amountNum || !payeeName.trim()) && (
            <p className="text-[11px] text-muted-foreground -mt-2">برای درج، مبلغ و «در وجه» لازم است.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ============================================================
// تنظیمات انعطاف سررسید — flexibility levels editor (managers)
// ============================================================

interface FlexRow {
  scope: FlexScope
  key: string
  days: string
}

function FlexibilitySettingsButton({
  isManager, flexibility, onSaved,
}: {
  isManager: boolean
  flexibility: FlexibilityConfig | null
  onSaved: (c: FlexibilityConfig) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [defaultDays, setDefaultDays] = React.useState('0')
  const [rows, setRows] = React.useState<FlexRow[]>([])
  const [saving, setSaving] = React.useState(false)
  const [howOpen, setHowOpen] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    const cfg = flexibility ?? { default: 0, levels: [] }
    setDefaultDays(String(cfg.default))
    setRows(cfg.levels.map((l) => ({ scope: l.scope, key: l.key, days: String(l.days) })))
  }, [open, flexibility])

  const save = async () => {
    const def = Number(toEnDigits(defaultDays).replace(/[^\d]/g, '')) || 0
    if (def < 0 || def > 90) {
      toast({ title: 'انعطاف پیش‌فرض باید بین ۰ تا ۹۰ روز باشد', variant: 'destructive' })
      return
    }
    const levels = rows.map((r) => ({
      scope: r.scope,
      key: toEnDigits(r.key).trim(),
      days: Number(toEnDigits(r.days).replace(/[^\d]/g, '')) || 0,
    }))
    if (levels.length > 50) {
      toast({ title: 'حداکثر ۵۰ سطح انعطاف قابل ثبت است', variant: 'destructive' })
      return
    }
    if (levels.some((l) => !l.key.trim())) {
      toast({ title: 'کلید همه سطوح را وارد کنید', description: 'نمونه: ۱۴۰۴-۰۳ برای ماه', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const config = { default: def, levels }
      await api('/api/settings', { method: 'PATCH', body: { cheque_flexibility: JSON.stringify(config) } })
      toast({ title: 'تنظیمات انعطاف ذخیره شد ✅', description: 'برنامه‌ریز چک و نشان‌های تقویم بلافاصله به‌روز می‌شوند' })
      onSaved(parseFlexibility(JSON.stringify(config)))
      setOpen(false)
    } catch (e) {
      toast({ title: 'خطا در ذخیره تنظیمات انعطاف', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button variant="outline" className="touch-target border-[#C9A227]/40 text-[#8A6F3C] hover:bg-[#C9A227]/10" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="h-4 w-4" /> تنظیمات انعطاف
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">تنظیمات انعطاف سررسید چک</DialogTitle>
            <DialogDescription className="text-xs leading-5">
              برای هر سطح (سال/فصل/ماه/هفته/روز) می‌توانید چند روز به سررسید پایه اضافه شود. دقیق‌ترین سطح منطبق اعمال می‌شود.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
              <div>
                <p className="text-xs font-bold">انعطاف پیش‌فرض</p>
                <p className="text-[11px] text-muted-foreground">وقتی هیچ سطحی با تاریخ سررسید مطابقت نداشته باشد</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  value={toFaDigits(defaultDays)}
                  onChange={(e) => setDefaultDays(toEnDigits(e.target.value).replace(/[^\d]/g, ''))}
                  inputMode="numeric"
                  className="h-10 w-16 num text-center"
                  aria-label="انعطاف پیش‌فرض (روز)"
                  disabled={!isManager}
                />
                <span className="text-[11px] text-muted-foreground">روز</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold">سطوح انعطاف</p>
                {isManager && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setRows((r) => [...r, { scope: 'MONTH', key: '', days: '0' }])}
                    disabled={rows.length >= 50}
                  >
                    <Plus className="h-3.5 w-3.5" /> افزودن سطح
                  </Button>
                )}
              </div>
              {rows.length === 0 && (
                <p className="text-[11px] text-muted-foreground rounded-xl border border-dashed border-border p-3 text-center">
                  سطحی ثبت نشده است — بدون سطح، فقط انعطاف پیش‌فرض اعمال می‌شود.
                </p>
              )}
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-[7.5rem_1fr_5.5rem_2.5rem] gap-2 items-center rounded-xl border border-border p-2 bg-card">
                  <Select value={r.scope} onValueChange={(v) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, scope: v as FlexScope } : x)))} disabled={!isManager}>
                    <SelectTrigger className="h-10 text-xs" aria-label={`سطح ${i + 1}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FLEX_SCOPES.map((s) => (
                        <SelectItem key={s} value={s}>{FLEX_SCOPE_FA[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={r.key}
                    onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
                    placeholder={FLEX_KEY_EXAMPLES[r.scope]}
                    className="h-10 text-xs text-left"
                    dir="ltr"
                    aria-label={`کلید سطح ${i + 1}`}
                    disabled={!isManager}
                  />
                  <div className="flex items-center gap-1">
                    <Input
                      value={toFaDigits(r.days)}
                      onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, days: toEnDigits(e.target.value).replace(/[^\d]/g, '') } : x)))}
                      inputMode="numeric"
                      className="h-10 num text-center"
                      aria-label={`روزهای سطح ${i + 1}`}
                      disabled={!isManager}
                    />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">روز</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-pomegranate"
                    aria-label={`حذف سطح ${i + 1}`}
                    onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                    disabled={!isManager}
                  >
                    <Ban className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {rows.length > 0 && (
                <p className="text-[10px] text-muted-foreground leading-4">
                  نمونه کلیدها — سال: <span className="num" dir="ltr">1404</span> · فصل: <span className="num" dir="ltr">1404-BAHAR</span> · ماه: <span className="num" dir="ltr">1404-03</span> · هفتهٔ ماه: <span className="num" dir="ltr">1404-03-W2</span> · روز: <span className="num" dir="ltr">1404-03-15</span>
                </p>
              )}
            </div>

            {/* scientific note */}
            <Collapsible open={howOpen} onOpenChange={setHowOpen}>
              <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline touch-target">
                <ChevronDown className={cn('h-4 w-4 transition-transform', howOpen && 'rotate-180')} />
                چطور کار می‌کند؟
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 rounded-xl bg-accent/40 border border-border p-3 text-[11px] leading-6 text-muted-foreground space-y-1.5">
                  <p>۱. انعطاف سررسید، همان اصل «مدیریت وجه نقد» (Cash-Flow Management) است: تاریخ تسویه با توجه به ورودی و خروجی نقدینگی، تعطیلات رسمی و روزهای غیرکاری تنظیم می‌شود تا فشار پرداخت روی روزهای جاری پخش شود.</p>
                  <p>۲. سطوح اولویت‌بندی می‌شوند: روز &gt; هفته &gt; ماه &gt; فصل &gt; سال؛ دقیق‌ترین سطح منطبق بر تاریخ سررسید اعمال می‌شود و در نبود آن، مقدار پیش‌فرض لحاظ می‌گردد.</p>
                  <p>۳. بر اساس ادبیات مالی، هم‌ترازی سررسید چک‌ها با چرخه تبدیل وجه نقد (Cash Conversion Cycle) ریسک برگشت چک و کسری نقدینگی را به‌طور معنادار کاهش می‌دهد.</p>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {!isManager && (
              <p className="text-[11px] text-muted-foreground">مشاهده فقط‌خواندنی است؛ ویرایش انعطاف در اختیار مدیریت است.</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="touch-target" onClick={() => setOpen(false)} disabled={saving}>انصراف</Button>
            {isManager && (
              <Button size="sm" className="touch-target font-bold" onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} ذخیره تنظیمات
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
