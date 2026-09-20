'use client'

/**
 * حقوق و دستمزد — هایپر زیتون (قانون کار ایران ۱۴۰۴)
 * ماهانه: کارکرد روزانه (اضافه‌کاری/جمعه‌کاری/شب‌کاری/غیبت) + اقلام متغیر + کسور + فیش قابل چاپ
 * سالانه: عیدی و سنوات با تناسب روزهای خدمت · تنظیمات: نرخ‌ها/سقف‌ها/جدول مالیات
 * واحد موتور: ریال — نمایش در جدول‌ها به «تومان» (تقسیم بر ۱۰) و فیش چاپی به «ریال».
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/client'
import {
  enDigits, faMoney, faNum, formatJalaliDateTime, formatJalaliShort,
  J_MONTHS, jalaliToIso, toJalaliParts, todayIso,
} from '@/lib/jalali'
import {
  EmptyState, Labeled, Pill, SectionCard, StatCard, FaPriceInput, type AppCtx,
} from '@/components/app/ui-bits'
import { Modal } from '@/components/views/Orders'
import { cn } from '@/lib/utils'
import {
  BadgeCheck, Banknote, CalendarDays, ChevronLeft, ChevronRight, Coins, Eye, FileDown, Landmark,
  Lock, Pencil, Percent, PiggyBank, Printer, RefreshCcw, Save, Settings2, Sparkles, Trash2, Users, X,
} from 'lucide-react'

const EMERALD = '#0e7a4a'
const GOLD = '#c9a227'
const ROSE = '#b3372f'
const OLIVE = '#77934a'
const SKY = '#2563eb'
const GRAY = '#6b7280'

/* ── نمایش پول: موتور ریال است؛ faMoney تقسیم نمی‌کند → تومان = ریال ÷ ۱۰ ── */
const T = (rial: number | null | undefined) => faMoney((rial || 0) / 10) // تومان
const R = (rial: number | null | undefined) => faMoney(rial || 0) // ریال

type Profile = {
  baseSalary: number; housing: number; foodAllowance: number; maritalAllowance: number
  childAllowance: number; childCount: number; seniorityBase: number; overtimeDivisor: number
  includeBenefitsInOT: boolean
}
type DayRow = { forDate: string; otMinutes: number; holidayOtMinutes: number; nightMinutes: number; absence: string; dayKind: string; note: string }
type AdjustRow = { id: string; kind: string; amount: number; note: string; ownerOnly: boolean; createdByName: string; createdAt: string }
type Computed = {
  workDays: number; absentFullDays: number; absentHalfDays: number
  otHours: number; holidayOtHours: number; nightHours: number
  baseProrated: number; housing: number; foodAllowance: number; marital: number; childTotal: number
  hourlyBase: number; overtimePay: number; holidayOtPay: number; nightPay: number; seniorityAccrual: number
  rewards: number; commissions: number; fines: number; advances: number; other: number; gross: number
  insurableBase: number; insurance: number; tax: number; otherDeductions: number; net: number
  warnings: string[]
}
type Row = {
  id: string; name: string; personnelNo: string; jobTitle: string; nationalId: string
  bankCard: string; shaba: string; hireDate: string; active: boolean; childrenCount: number
  profile: Profile
  month: { id: string; status: string; payslipNo: string; confirmedByName: string; confirmedAt: string; paidAt: string; note: string; gross: number; net: number }
  days: DayRow[]
  adjusts: AdjustRow[]
  hiddenCommissionCount: number
  computed: Computed
}
type TaxCfg = { exempt: number; bands: Array<{ upTo: number | null; rate: number }> }
type PolicyCfg = { otRate: number; nightRate: number; holidayOtRate: number; otCapMinutes: number; insuranceRate: number; insuranceIncludesOT: boolean; fineCapPct: number; roundTo: number }
type Resp = {
  jy: number; jm: number; monthDays: number; employer: string
  isManager: boolean; isOwner: boolean; self: { personnelId: string } | null
  defaults: Partial<Profile>; policy: PolicyCfg; tax: TaxCfg; statutory: Record<string, unknown>
  viewer: { isManager: boolean; isOwner: boolean; canCommission: boolean; canSettings: boolean }
  personnel: Row[]; hint?: string
}

type Yearly = {
  jy: number; yearDays: number; serviceDays: number; ratio: number; serviceFrom: string | null; serviceTo: string
  eydiRaw: number; eydiCap: number; eydi: number; seniority: number; total: number; partial: boolean
}

const KIND_META: Record<string, { label: string; color: string }> = {
  REWARD: { label: 'تشویقی', color: EMERALD },
  FINE: { label: 'جریمه', color: ROSE },
  COMMISSION: { label: 'پورسانت', color: GOLD },
  ADVANCE: { label: 'مساعده', color: SKY },
  OTHER: { label: 'سایر', color: OLIVE },
}
const STATUS_META: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'پیش‌نویس', color: GRAY },
  CONFIRMED: { label: 'تأییدشده', color: GOLD },
  PAID: { label: 'پرداخت‌شده', color: EMERALD },
}
const DAYKIND_META: Record<string, { label: string; color: string }> = {
  WORK: { label: 'کار', color: OLIVE },
  FRIDAY: { label: 'جمعه', color: GOLD },
  HOLIDAY: { label: 'تعطیل', color: ROSE },
  LEAVE: { label: 'مرخصی', color: SKY },
  OFF: { label: 'تعطیل', color: GRAY },
}
const WEEK_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']
function weekdayShort(iso: string): string {
  return WEEK_SHORT[new Date(iso + 'T12:00:00').getDay() === 6 ? 0 : (new Date(iso + 'T12:00:00').getDay() + 1) % 7]
}

/** ورودی عدد کوچک (دقیقه/شمارش) — ارقام فارسی/عربی/لاتین می‌پذیرد */
function SmallNum({ value, onChange, disabled, max = 720, w = 'w-14' }: { value: number; onChange: (v: number) => void; disabled?: boolean; max?: number; w?: string }) {
  return (
    <input
      type="text" inputMode="numeric" dir="ltr" disabled={disabled}
      value={value === 0 ? '' : faNum(value)}
      placeholder="۰"
      onChange={(e) => {
        const cleaned = enDigits(e.target.value).replace(/[^\d]/g, '')
        const n = cleaned === '' ? 0 : Math.min(max, Number(cleaned))
        onChange(isNaN(n) ? 0 : n)
      }}
      className={cn(w, 'rounded-lg border border-input bg-white/90 px-1 py-1 text-center text-xs font-bold tabular-nums outline-none focus:border-primary disabled:opacity-50')}
    />
  )
}

/** دکمهٔ چیپ سریع دقیقه (+۳۰/+۶۰/+۱۲۰) */
function QuickChip({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className="rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-40">
      {label}
    </button>
  )
}

export default function PayrollView({ ctx }: { ctx: AppCtx }) {
  const now = toJalaliParts(todayIso())
  const [jy, setJy] = useState(now.jy)
  const [jm, setJm] = useState(now.jm)
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'month' | 'yearly' | 'self' | 'settings'>('month')
  const [editorId, setEditorId] = useState<string | null>(null)
  const [confirmBox, setConfirmBox] = useState<null | { type: 'confirm' | 'pay' | 'reopen'; note: string }>(null)
  const [yearlySel, setYearlySel] = useState<{ personnelId: string; jy: number } | null>(null)
  const [yearly, setYearly] = useState<Yearly | null>(null)
  const [yearlyMeta, setYearlyMeta] = useState<{ name: string; jobTitle: string; hireDate: string; personnelNo: string } | null>(null)
  const [slipId, setSlipId] = useState<string | null>(null) // فیش چاپی: personnel id
  const canManage = !!data?.viewer.isManager
  const canCommission = !!data?.viewer.canCommission

  const load = useCallback(async (pjy = jy, pjm = jm) => {
    try {
      const d = await api<Resp>(`/api/payroll?jy=${pjy}&jm=${pjm}`)
      setData(d)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [jy, jm])

  useEffect(() => { setLoading(true); load() }, [load])

  const rows = data?.personnel || []
  const editorRow = rows.find((r) => r.id === editorId) || null
  const slipRow = rows.find((r) => r.id === slipId) || null
  const selfRow = data?.self ? rows.find((r) => r.id === data.self?.personnelId) || null : null

  const totals = useMemo(() => {
    const acc = { gross: 0, net: 0, insurance: 0, tax: 0, ot: 0, confirmed: 0, paid: 0 }
    for (const r of rows) {
      acc.gross += r.computed.gross; acc.net += r.computed.net
      acc.insurance += r.computed.insurance; acc.tax += r.computed.tax
      acc.ot += r.computed.otHours + r.computed.holidayOtHours
      if (r.month.status === 'CONFIRMED') acc.confirmed += 1
      if (r.month.status === 'PAID') acc.paid += 1
    }
    return acc
  }, [rows])

  /* ── تغییر ماه: فقط وضعیت را عوض می‌کنیم — useEffect با load جدید واکشی می‌کند ── */
  const switchMonth = (delta: number) => {
    let njy = jy, njm = jm + delta
    if (njm > 12) { njm = 1; njy += 1 }
    if (njm < 1) { njm = 12; njy -= 1 }
    setJy(njy); setJm(njm)
  }

  const TABS: Array<{ key: typeof tab; label: string; icon: ReactNode }> = [
    { key: 'month', label: 'حقوق ماهانه', icon: <Users size={14} /> },
    { key: 'yearly', label: 'عیدی و سنوات', icon: <Sparkles size={14} /> },
    { key: 'self', label: 'فیش من', icon: <Eye size={14} /> },
  ]
  if (data?.viewer.canSettings) TABS.push({ key: 'settings', label: 'تنظیمات', icon: <Settings2 size={14} /> })

  return (
    <div className="space-y-4">
      {/* استایل چاپ فیش — بدون دست‌زدن به globals.css */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #payslip-print-area, #payslip-print-area *, #yearly-print-area, #yearly-print-area * { visibility: visible !important; }
          #payslip-print-area, #yearly-print-area { position: absolute !important; top: 0 !important; right: 0 !important; left: 0 !important; width: 100% !important; max-height: none !important; overflow: visible !important; box-shadow: none !important; border: none !important; border-radius: 0 !important; padding: 10mm !important; background: white !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* سرصفحهٔ ماه */}
      <SectionCard
        title="حقوق و دستمزد"
        subtitle={`ماه ${J_MONTHS[(data?.jm || jm) - 1]} ${faNum(data?.jy || jy)} — مبالغ جدول به تومان · مطابق قانون کار ۱۴۰۴ (مبالغ موتور: ریال)`}
        icon={<Landmark size={20} />}
        actions={
          <>
            <button onClick={() => switchMonth(-1)} className="flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold hover:border-primary"><ChevronRight size={16} /> ماه قبل</button>
            <button onClick={() => { setJy(now.jy); setJm(now.jm) }} className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold hover:border-primary" title="ماه جاری"><CalendarDays size={16} /></button>
            <button onClick={() => switchMonth(1)} className="flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold hover:border-primary">ماه بعد <ChevronLeft size={16} /></button>
          </>
        }
      >
        {/* تب‌ها */}
        <div className="mb-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold transition',
                tab === t.key ? 'bg-primary text-white shadow' : 'border border-border bg-card text-muted-foreground hover:border-primary')}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/60" />)}</div>
        ) : tab === 'month' && (
          <MonthTab data={data} rows={rows} totals={totals} onOpenEditor={setEditorId} onOpenSlip={setSlipId} onOpenYearly={(pid) => { setYearlySel({ personnelId: pid, jy: now.jy }); setYearly(null); setYearlyMeta(null); setTab('yearly') }} />
        )}
        {tab === 'yearly' && (
          <YearlyTab
            rows={rows} canManage={canManage} selfPid={data?.self?.personnelId || null}
            sel={yearlySel} setSel={setYearlySel} yearly={yearly} setYearly={setYearly} meta={yearlyMeta} setMeta={setYearlyMeta}
          />
        )}
        {tab === 'self' && <SelfTab row={selfRow} onOpenSlip={setSlipId} />}
        {tab === 'settings' && data?.viewer.canSettings && <SettingsTab data={data} onSaved={() => load()} />}
      </SectionCard>

      {/* ویرایشگر ماه پرسنل */}
      {editorRow && data && (
        <MonthEditor
          key={editorRow.id + '-' + data.jy + '-' + data.jm}
          row={editorRow} data={data} canManage={canManage} canCommission={canCommission}
          onClose={() => setEditorId(null)} onReload={() => load()}
          onConfirm={() => setConfirmBox({ type: 'confirm', note: '' })}
          onPay={() => setConfirmBox({ type: 'pay', note: '' })}
          onReopen={() => setConfirmBox({ type: 'reopen', note: '' })}
          onPrint={() => setSlipId(editorRow.id)}
        />
      )}

      {/* جعبهٔ تأیید دومرحله‌ای */}
      {confirmBox && editorRow && (
        <Modal title={{ confirm: 'تأیید ماه حقوق', pay: 'ثبت پرداخت', reopen: 'بازگشایی ماه' }[confirmBox.type]} onClose={() => setConfirmBox(null)}>
          <p className="text-sm leading-6 text-muted-foreground">
            {confirmBox.type === 'confirm' && <>ماه {J_MONTHS[jm - 1]} {faNum(jy)} برای «{editorRow.name}» تأیید شود؟ پس از تأیید، ثبت کارکرد قفل می‌شود.</>}
            {confirmBox.type === 'pay' && <>پرداخت خالص <b className="text-primary">{T(editorRow.computed.net)} تومان</b> به «{editorRow.name}» ثبت شود؟ پس از ثبت، ماه قفل می‌شود.</>}
            {confirmBox.type === 'reopen' && <>بازگشایی ماه برای «{editorRow.name}»؟ {editorRow.month.status === 'PAID' && 'ماه پرداخت‌شده مستلزم ذکر دلیل است.'}</>}
          </p>
          {confirmBox.type === 'reopen' && (
            <Labeled label="دلیل بازگشایی (برای ماه پرداخت‌شده الزامی است)">
              <input value={confirmBox.note} onChange={(e) => setConfirmBox({ ...confirmBox, note: e.target.value })}
                className="w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm outline-none focus:border-primary" />
            </Labeled>
          )}
          <div className="flex gap-2">
            <button onClick={async () => {
              const type = confirmBox.type; const note = confirmBox.note
              setConfirmBox(null)
              try {
                await api('/api/payroll', { method: 'POST', body: { action: type, personnelId: editorRow.id, jy: data?.jy || jy, jm: data?.jm || jm, note } })
                toast.success({ confirm: 'ماه تأیید شد ✓', pay: 'پرداخت ثبت شد ✓', reopen: 'ماه بازگشایی شد' }[type])
                load()
              } catch (e) { toast.error((e as Error).message) }
            }} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-black text-white hover:opacity-90">
              بله، انجام بده
            </button>
            <button onClick={() => setConfirmBox(null)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-muted-foreground">انصراف</button>
          </div>
        </Modal>
      )}

      {/* فیش حقوقی (چاپ) */}
      {slipRow && data && (
        <Modal title={`فیش حقوقی — ${slipRow.name}`} wide onClose={() => setSlipId(null)}>
          <Payslip row={slipRow} data={data} generatedBy={ctx.user?.name || 'سامانه'} />
        </Modal>
      )}
    </div>
  )
}

/* ═══════════ تب ماهانه: جدول پرسنل ═══════════ */

function MonthTab({ rows, totals, onOpenEditor, onOpenSlip, onOpenYearly, data }: {
  rows: Row[]; totals: { gross: number; net: number; insurance: number; tax: number; ot: number; confirmed: number; paid: number }
  onOpenEditor: (id: string) => void; onOpenSlip: (id: string) => void; onOpenYearly: (id: string) => void
  data: Resp | null
}) {
  if (!rows.length) {
    return <EmptyState emoji="🫒" title="پرسنلی برای حقوق‌وریافتنی نیست" hint={data?.hint || 'پس از ساخت پروندهٔ پرسنلی، پروفایل حقوق خودکار ساخته می‌شود'} />
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="جمع خالص پرداختی ماه (تومان)" value={T(totals.net)} tone="emerald" icon={<Banknote size={18} />} hint={`${faNum(rows.length)} پرسنل`} />
        <StatCard label="جمع حقوق و مزایا (تومان)" value={T(totals.gross)} tone="gold" icon={<Coins size={18} />} hint={`اضافه‌کاری: ${faNum(Math.round(totals.ot))} ساعت`} />
        <StatCard label="بیمهٔ سهم کارگر (تومان)" value={T(totals.insurance)} tone="olive" icon={<PiggyBank size={18} />} hint="۷٪ مشمول بیمه" />
        <StatCard label="مالیات حقوق (تومان)" value={T(totals.tax)} tone="rose" icon={<Percent size={18} />} hint={`تأییدشده: ${faNum(totals.confirmed)} · پرداخت‌شده: ${faNum(totals.paid)}`} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[820px] text-right text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
              <th className="px-3 py-2.5 font-bold">پرسنل</th>
              <th className="px-3 py-2.5 font-bold">کارکرد</th>
              <th className="px-3 py-2.5 font-bold">اضافه‌کاری (عادی/جمعه/شب)</th>
              <th className="px-3 py-2.5 font-bold">ناخالص</th>
              <th className="px-3 py-2.5 font-bold">بیمه</th>
              <th className="px-3 py-2.5 font-bold">مالیات</th>
              <th className="px-3 py-2.5 font-bold">خالص (تومان)</th>
              <th className="px-3 py-2.5 font-bold">وضعیت</th>
              <th className="px-3 py-2.5 font-bold"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = STATUS_META[r.month.status] || STATUS_META.DRAFT
              return (
                <tr key={r.id} onClick={() => onOpenEditor(r.id)}
                  className="cursor-pointer border-b border-border/60 transition hover:bg-secondary/60 last:border-0">
                  <td className="px-3 py-2.5">
                    <div className="font-bold text-foreground">{r.name} {!r.active && <span className="text-[10px] font-bold text-rose-600">(غیرفعال)</span>}</div>
                    <div className="text-[11px] text-muted-foreground">{r.jobTitle || '—'} · {r.personnelNo}</div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{faNum(r.computed.workDays)} روز{r.computed.absentFullDays + r.computed.absentHalfDays > 0 && <span className="text-[11px] text-rose-600"> (−{faNum(r.computed.absentFullDays + r.computed.absentHalfDays)})</span>}</td>
                  <td className="px-3 py-2.5 tabular-nums text-xs">
                    <span className="font-bold text-foreground">{faNum(Math.round(r.computed.otHours))}</span> / <span style={{ color: GOLD }}>{faNum(Math.round(r.computed.holidayOtHours))}</span> / <span style={{ color: SKY }}>{faNum(Math.round(r.computed.nightHours))}</span> ساعت
                  </td>
                  <td className="px-3 py-2.5 tabular-nums font-bold">{T(r.computed.gross)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{T(r.computed.insurance)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{T(r.computed.tax)}</td>
                  <td className="px-3 py-2.5 tabular-nums font-black text-primary">{T(r.computed.net)}</td>
                  <td className="px-3 py-2.5"><Pill label={st.label} color={st.color} /></td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button title="فیش حقوقی" onClick={() => onOpenSlip(r.id)} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:border-primary hover:text-primary"><FileDown size={14} /></button>
                      <button title="عیدی و سنوات" onClick={() => onOpenYearly(r.id)} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:border-primary hover:text-primary"><Sparkles size={14} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] leading-5 text-muted-foreground">
        برای ثبت اضافه‌کاری، غیبت و اقلام متغیر روی ردیف پرسنل کلیک کنید · سقف اضافه‌کاری قانونی ۴ ساعت در روز است (مادهٔ ۵۹) · حق مسکن، بن کارگری و اضافه‌کاری از مشمول بیمه معاف‌اند (تبصرهٔ مادهٔ ۳۸ قانون تأمین اجتماعی).
      </p>
    </div>
  )
}

/* ═══════════ ویرایشگر ماه ═══════════ */

function MonthEditor({ row, data, canManage, canCommission, onClose, onReload, onConfirm, onPay, onReopen, onPrint }: {
  row: Row; data: Resp; canManage: boolean; canCommission: boolean
  onClose: () => void; onReload: () => void; onConfirm: () => void; onPay: () => void; onReopen: () => void; onPrint: () => void
}) {
  const locked = row.month.status !== 'DRAFT'
  const st = STATUS_META[row.month.status] || STATUS_META.DRAFT
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileDraft, setProfileDraft] = useState<Profile>(row.profile)
  const [adjustForm, setAdjustForm] = useState<{ kind: string; amount: number | ''; note: string }>({ kind: 'REWARD', amount: '', note: '' })
  const [busy, setBusy] = useState(false)
  const md = data.monthDays

  // پیش‌نویس روزها — کلید: تاریخ iso
  const [dayDraft, setDayDraft] = useState<Record<string, { ot: number; hot: number; night: number; absence: string; note: string }>>(() => {
    const m: Record<string, { ot: number; hot: number; night: number; absence: string; note: string }> = {}
    for (let i = 1; i <= md; i++) {
      const iso = jalaliToIso(data.jy, data.jm, i)
      const d = row.days.find((x) => x.forDate === iso)
      m[iso] = { ot: d?.otMinutes || 0, hot: d?.holidayOtMinutes || 0, night: d?.nightMinutes || 0, absence: d?.absence || 'NONE', note: d?.note || '' }
    }
    return m
  })
  const daysIso = useMemo(() => Array.from({ length: md }, (_, i) => jalaliToIso(data.jy, data.jm, i + 1)), [md, data.jy, data.jm])
  const dirtyDays = daysIso.filter((iso) => {
    const d = row.days.find((x) => x.forDate === iso)
    const c = dayDraft[iso]
    return c && (!!d ? (d.otMinutes !== c.ot || d.holidayOtMinutes !== c.hot || d.nightMinutes !== c.night || d.absence !== c.absence || (d.note || '') !== c.note) : (c.ot || c.hot || c.night || c.absence !== 'NONE' || c.note))
  })

  const saveDay = async (iso: string) => {
    const c = dayDraft[iso]
    setBusy(true)
    try {
      await api('/api/payroll', { method: 'POST', body: { action: 'set-day', personnelId: row.id, forDate: iso, otMinutes: c.ot, holidayOtMinutes: c.hot, nightMinutes: c.night, absence: c.absence, note: c.note } })
      toast.success(`کارکرد ${formatJalaliShort(iso)} ثبت شد`)
      onReload()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  const saveAllDays = async () => {
    setBusy(true)
    try {
      for (const iso of dirtyDays) {
        const c = dayDraft[iso]
        await api('/api/payroll', { method: 'POST', body: { action: 'set-day', personnelId: row.id, forDate: iso, otMinutes: c.ot, holidayOtMinutes: c.hot, nightMinutes: c.night, absence: c.absence, note: c.note } })
      }
      toast.success('همهٔ تغییرهای کارکرد ثبت شد')
      onReload()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  const saveProfile = async () => {
    setBusy(true)
    try {
      await api('/api/payroll', { method: 'POST', body: { action: 'update-profile', personnelId: row.id, ...profileDraft, childCount: Number(profileDraft.childCount) || 0 } })
      toast.success('پروفایل حقوق به‌روزرسانی شد')
      setEditingProfile(false)
      onReload()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  const addAdjust = async () => {
    if (!adjustForm.amount) { toast.error('مبلغ را وارد کنید'); return }
    setBusy(true)
    try {
      await api('/api/payroll', { method: 'POST', body: { action: 'set-adjust', personnelId: row.id, jy: data.jy, jm: data.jm, kind: adjustForm.kind, amount: adjustForm.amount, note: adjustForm.note } })
      toast.success('قلم ثبت شد')
      setAdjustForm({ kind: adjustForm.kind, amount: '', note: '' })
      onReload()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  const delAdjust = async (id: string) => {
    setBusy(true)
    try {
      await api('/api/payroll', { method: 'POST', body: { action: 'delete-adjust', adjustId: id } })
      toast.success('قلم حذف شد')
      onReload()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  const c = row.computed

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="scroll-gold glow-card relative max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-card p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex flex-wrap items-center gap-2 text-base font-black">
              {row.name} <Pill label={st.label} color={st.color} />
              {!row.active && <Pill label="پرسنل غیرفعال" color={ROSE} />}
              {locked && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Lock size={12} /> قفل ثبت</span>}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.jobTitle} · {row.personnelNo} · ماه {J_MONTHS[data.jm - 1]} {faNum(data.jy)}
              {row.month.paidAt && ` · پرداخت: ${formatJalaliDateTime(row.month.paidAt)}`}
              {row.month.confirmedByName && ` · تأیید: ${row.month.confirmedByName}`}
            </p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <button onClick={onPrint} className="flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:border-primary"><Printer size={14} /> چاپ فیش</button>
            {canManage && !locked && <button onClick={onConfirm} className="flex items-center gap-1 rounded-xl bg-[#c9a227] px-3 py-2 text-xs font-black text-white hover:opacity-90"><BadgeCheck size={14} /> تأیید ماه</button>}
            {canManage && row.month.status === 'CONFIRMED' && <button onClick={onPay} className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-black text-white hover:opacity-90"><Banknote size={14} /> ثبت پرداخت</button>}
            {canManage && locked && <button onClick={onReopen} className="flex items-center gap-1 rounded-xl border border-rose-300 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"><RefreshCcw size={14} /> بازگشایی</button>}
            <button onClick={onClose} className="rounded-lg p-2 hover:bg-muted"><X size={16} /></button>
          </div>
        </div>

        {row.hiddenCommissionCount > 0 && (
          <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
            🔒 {faNum(row.hiddenCommissionCount)} مورد پورسانت — محرمانه (فقط مالک). جمع‌های نمایشی بدون پورسانت است.
          </div>
        )}
        {c.warnings.map((w, i) => (
          <div key={i} className="mb-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">⚠️ {w}</div>
        ))}

        <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
          {/* ستون راست‌چین: پروفایل + روزها + اقلام */}
          <div className="space-y-4">
            {/* پروفایل */}
            <div className="rounded-2xl border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-black">پروفایل حقوق (ریال)</h4>
                {canManage && !editingProfile && (
                  <button onClick={() => { setProfileDraft(row.profile); setEditingProfile(true) }} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold hover:border-primary"><Pencil size={12} /> ویرایش</button>
                )}
              </div>
              {!editingProfile ? (
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  {([
                    ['حقوق پایه', R(row.profile.baseSalary)], ['حق مسکن', R(row.profile.housing)],
                    ['بن کارگری', R(row.profile.foodAllowance)], ['حق تأهل', R(row.profile.maritalAllowance)],
                    ['حق اولاد', `${R(row.profile.childAllowance)} × ${faNum(row.profile.childCount)}`],
                    ['سنوات روزانه', R(row.profile.seniorityBase)],
                    ['مخرج اضافه‌کاری', faNum(row.profile.overtimeDivisor)],
                    ['مزایا در مأخذ OT', row.profile.includeBenefitsInOT ? 'دارد' : 'ندارد'],
                  ] as Array<[string, string]>).map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-muted/50 px-2 py-1.5">
                      <div className="text-[10px] text-muted-foreground">{k}</div>
                      <div className="font-bold tabular-nums">{v}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <ProfField label="حقوق پایه (ریال)" value={profileDraft.baseSalary} onChange={(v) => setProfileDraft({ ...profileDraft, baseSalary: v || 0 })} />
                  <ProfField label="حق مسکن (ریال)" value={profileDraft.housing} onChange={(v) => setProfileDraft({ ...profileDraft, housing: v || 0 })} />
                  <ProfField label="بن کارگری (ریال)" value={profileDraft.foodAllowance} onChange={(v) => setProfileDraft({ ...profileDraft, foodAllowance: v || 0 })} />
                  <ProfField label="حق تأهل (ریال)" value={profileDraft.maritalAllowance} onChange={(v) => setProfileDraft({ ...profileDraft, maritalAllowance: v || 0 })} />
                  <ProfField label="حق اولاد هر فرزند (ریال)" value={profileDraft.childAllowance} onChange={(v) => setProfileDraft({ ...profileDraft, childAllowance: v || 0 })} hint="شرط ۷۲۰ روز سابقهٔ بیمه — در صورت عدم احراز صفر بگذارید" />
                  <ProfField label="سنوات روزانه (ریال)" value={profileDraft.seniorityBase} onChange={(v) => setProfileDraft({ ...profileDraft, seniorityBase: v || 0 })} />
                  <ProfField label="تعداد فرزند" value={profileDraft.childCount} onChange={(v) => setProfileDraft({ ...profileDraft, childCount: v || 0 })} />
                  <ProfField label="مخرج مزد ساعتی (قانون: ۲۲۰)" value={profileDraft.overtimeDivisor} onChange={(v) => setProfileDraft({ ...profileDraft, overtimeDivisor: v || 0 })} />
                  <label className="col-span-2 flex items-center gap-2 rounded-lg bg-muted/40 px-2 py-2 text-xs font-bold sm:col-span-3">
                    <input type="checkbox" checked={profileDraft.includeBenefitsInOT} onChange={(e) => setProfileDraft({ ...profileDraft, includeBenefitsInOT: e.target.checked })} />
                    مزایا (مسکن+بن) در مأخذ اضافه‌کاری لحاظ شود
                  </label>
                  <div className="col-span-2 flex gap-2 sm:col-span-3">
                    <button disabled={busy} onClick={saveProfile} className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-black text-white disabled:opacity-50"><Save size={13} /> ذخیرهٔ پروفایل</button>
                    <button onClick={() => setEditingProfile(false)} className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground">انصراف</button>
                  </div>
                  <p className="col-span-2 text-[10px] leading-4 text-muted-foreground sm:col-span-3">
                    💡 سایر سطوح دستمزد (فرمول رایج ۱۴۰۴): مزد سال قبل × ۱٫۳۲ + ۹٬۳۱۶٬۰۸۰ ریال — به‌صورت خودکار اعمال نمی‌شود؛ دستی وارد کنید.
                  </p>
                </div>
              )}
            </div>

            {/* کارکرد روزانه */}
            <div className="rounded-2xl border border-border p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-black">کارکرد روزانه <span className="text-[10px] font-normal text-muted-foreground">(دقیقه · سقف قانونی ۴ ساعت/روز — مادهٔ ۵۹)</span></h4>
                {canManage && !locked && dirtyDays.length > 0 && (
                  <button disabled={busy} onClick={saveAllDays} className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-black text-white disabled:opacity-50">
                    <Save size={12} /> ذخیرهٔ {faNum(dirtyDays.length)} روز تغییر یافته
                  </button>
                )}
              </div>
              <div className="max-h-[340px] overflow-y-auto rounded-xl border border-border/60">
                <table className="w-full text-right text-xs">
                  <thead className="sticky top-0 bg-muted/95">
                    <tr className="text-[10px] text-muted-foreground">
                      <th className="px-2 py-1.5 font-bold">روز</th>
                      <th className="px-2 py-1.5 font-bold">نوع</th>
                      <th className="px-1 py-1.5 font-bold">اضافه‌کاری</th>
                      <th className="px-1 py-1.5 font-bold">جمعه/تعطیل</th>
                      <th className="px-1 py-1.5 font-bold">شب‌کاری</th>
                      <th className="px-2 py-1.5 font-bold">غیبت</th>
                      <th className="px-2 py-1.5 font-bold">یادداشت</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {daysIso.map((iso) => {
                      const jd = toJalaliParts(iso).jd
                      const kind = row.days.find((x) => x.forDate === iso)?.dayKind || (new Date(iso + 'T12:00:00').getDay() === 5 ? 'FRIDAY' : 'WORK')
                      const km = DAYKIND_META[kind] || DAYKIND_META.WORK
                      const d = dayDraft[iso]
                      const dirty = dirtyDays.includes(iso)
                      return (
                        <tr key={iso} className={cn('border-t border-border/50', dirty && 'bg-amber-50/70')}>
                          <td className="px-2 py-1 font-bold tabular-nums whitespace-nowrap">{faNum(jd)} <span className="text-[10px] text-muted-foreground">{weekdayShort(iso)}</span></td>
                          <td className="px-2 py-1"><Pill label={km.label} color={km.color} /></td>
                          <td className="px-1 py-1">
                            <div className="flex items-center gap-1">
                              <SmallNum value={d.ot} disabled={!canManage || locked} onChange={(v) => setDayDraft({ ...dayDraft, [iso]: { ...d, ot: v } })} />
                              {!canManage || locked ? null : (
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex gap-0.5">
                                    <QuickChip label="+۳۰" onClick={() => setDayDraft({ ...dayDraft, [iso]: { ...d, ot: Math.min(720, d.ot + 30) } })} />
                                    <QuickChip label="+۶۰" onClick={() => setDayDraft({ ...dayDraft, [iso]: { ...d, ot: Math.min(720, d.ot + 60) } })} />
                                  </div>
                                  <QuickChip label="+۱۲۰" onClick={() => setDayDraft({ ...dayDraft, [iso]: { ...d, ot: Math.min(720, d.ot + 120) } })} />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-1 py-1"><SmallNum value={d.hot} disabled={!canManage || locked} onChange={(v) => setDayDraft({ ...dayDraft, [iso]: { ...d, hot: v } })} /></td>
                          <td className="px-1 py-1"><SmallNum value={d.night} disabled={!canManage || locked} onChange={(v) => setDayDraft({ ...dayDraft, [iso]: { ...d, night: v } })} /></td>
                          <td className="px-2 py-1">
                            <select value={d.absence} disabled={!canManage || locked} onChange={(e) => setDayDraft({ ...dayDraft, [iso]: { ...d, absence: e.target.value } })}
                              className="rounded-lg border border-input bg-white/90 px-1 py-1 text-[11px] outline-none disabled:opacity-50">
                              <option value="NONE">—</option>
                              <option value="FULL">غیبت کامل</option>
                              <option value="HALF">نیم‌روز</option>
                            </select>
                          </td>
                          <td className="px-2 py-1">
                            <input value={d.note} disabled={!canManage || locked} placeholder="شرح / روز جایگزین…"
                              onChange={(e) => setDayDraft({ ...dayDraft, [iso]: { ...d, note: e.target.value } })}
                              className="w-24 rounded-lg border border-input bg-white/90 px-1.5 py-1 text-[11px] outline-none focus:border-primary disabled:opacity-50 sm:w-32" />
                          </td>
                          <td className="px-1 py-1">
                            {canManage && !locked && dirty && (
                              <button disabled={busy} onClick={() => saveDay(iso)} title="ثبت این روز" className="rounded-md bg-primary p-1 text-white disabled:opacity-50"><Save size={12} /></button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
                نوع روز خودکار است: جمعه (مادهٔ ۶۲)، تعطیل رسمی (مادهٔ ۶۳) و مرخصی تأییدشده از سامانه تشخیص داده می‌شود · غیبت کامل = کسر روزمزد، نیم‌روز = نصف · جمعه‌کاری/تعطیل‌کاری مستلزم روز جایگزین است.
              </p>
            </div>

            {/* اقلام متغیر */}
            <div className="rounded-2xl border border-border p-3">
              <h4 className="mb-2 text-sm font-black">اقلام متغیر ماه</h4>
              <div className="space-y-1.5">
                {row.adjusts.length === 0 && !row.hiddenCommissionCount && <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">قلمی ثبت نشده است</p>}
                {row.adjusts.map((a) => {
                  const km = KIND_META[a.kind] || KIND_META.OTHER
                  return (
                    <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <Pill label={km.label} color={km.color} />
                        <span className="font-bold tabular-nums">{T(a.amount)} تومان</span>
                        {a.note && <span className="truncate text-muted-foreground">— {a.note}</span>}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {a.createdByName && <span>{a.createdByName}</span>}
                        {canManage && !locked && (
                          <button onClick={() => delAdjust(a.id)} className="rounded p-1 text-rose-600 hover:bg-rose-50"><Trash2 size={12} /></button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {row.hiddenCommissionCount > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-amber-400 bg-amber-50/60 px-3 py-1.5 text-xs font-bold text-amber-800">
                    <Lock size={12} /> مورد پورسانت — محرمانه ({faNum(row.hiddenCommissionCount)} مورد)
                  </div>
                )}
              </div>
              {canManage && !locked && (
                <div className="mt-3 grid gap-2 rounded-xl border border-border/70 bg-muted/20 p-2 sm:grid-cols-[130px_1fr_1fr_auto]">
                  <select value={adjustForm.kind} onChange={(e) => setAdjustForm({ ...adjustForm, kind: e.target.value })}
                    className="rounded-lg border border-input bg-white/90 px-2 py-2 text-xs font-bold outline-none">
                    {Object.entries(KIND_META).filter(([k]) => k !== 'COMMISSION' || canCommission).map(([k, m]) => (
                      <option key={k} value={k}>{m.label}</option>
                    ))}
                  </select>
                  <FaPriceInput value={adjustForm.amount} onChange={(v) => setAdjustForm({ ...adjustForm, amount: v })} placeholder="مبلغ (ریال)" className="rounded-lg border border-input py-2 text-xs" />
                  <input value={adjustForm.note} onChange={(e) => setAdjustForm({ ...adjustForm, note: e.target.value })} placeholder="یادداشت / شرح قانونی…"
                    className="rounded-lg border border-input bg-white/90 px-2 py-2 text-xs outline-none focus:border-primary" />
                  <button disabled={busy} onClick={addAdjust} className="flex items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-black text-white disabled:opacity-50">افزودن</button>
                  {adjustForm.kind === 'FINE' && (
                    <p className="text-[10px] font-bold leading-4 text-rose-700 sm:col-span-4">⚠️ جریمه مستلزم شرح قانونی و مستند است — سقف جریمهٔ ماهانه {faNum(data.policy.fineCapPct)}٪ جمع حقوق و مزایاست. جریمهٔ بدون شرحِ دست‌کم ۵ نویسه ثبت نمی‌شود.</p>
                  )}
                  {adjustForm.kind === 'COMMISSION' && (
                    <p className="text-[10px] font-bold leading-4 text-amber-700 sm:col-span-4">🔒 پورسانت فقط مالک می‌بیند و برای دیگران «محرمانه» نمایش داده می‌شود.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ستون جمع‌ها — تصویر زندهٔ موتور */}
          <div className="space-y-2 lg:sticky lg:top-0 lg:self-start">
            <div className="rounded-2xl border border-border bg-muted/20 p-3">
              <h4 className="mb-2 text-sm font-black">جمع حقوق و مزایا <span className="text-[10px] font-normal text-muted-foreground">(تومان)</span></h4>
              <div className="space-y-1 text-xs">
                <TotalRow k={`حقوق پایه (${faNum(c.workDays)} روز کارکرد)`} v={T(c.baseProrated)} />
                <TotalRow k="حق مسکن" v={T(c.housing)} />
                <TotalRow k="بن کارگری" v={T(c.foodAllowance)} />
                <TotalRow k="حق تأهل" v={T(c.marital)} />
                <TotalRow k="حق اولاد" v={T(c.childTotal)} />
                <TotalRow k={`اضافه‌کاری (${faNum(Math.round(c.otHours * 10) / 10)} ساعت × ۱٫۴)`} v={T(c.overtimePay)} />
                <TotalRow k={`جمعه/تعطیل‌کاری (${faNum(Math.round(c.holidayOtHours * 10) / 10)} ساعت × ۱٫۴)`} v={T(c.holidayOtPay)} />
                <TotalRow k={`شب‌کاری (${faNum(Math.round(c.nightHours * 10) / 10)} ساعت +۳۵٪)`} v={T(c.nightPay)} />
                {c.rewards > 0 && <TotalRow k="تشویقی" v={T(c.rewards)} />}
                {c.commissions > 0 && <TotalRow k="پورسانت 🔒" v={T(c.commissions)} />}
                {c.other > 0 && <TotalRow k="سایر" v={T(c.other)} />}
                <div className="my-1 border-t border-dashed border-border" />
                <TotalRow k="ناخالص" v={T(c.gross)} bold />
                <TotalRow k={`مشمول بیمه (${data.policy.insuranceIncludesOT ? 'با' : 'بدون'} اضافه‌کاری)`} v={T(c.insurableBase)} muted />
                <TotalRow k={`بیمهٔ سهم کارگر (${faNum(Math.round(data.policy.insuranceRate * 100))}٪)`} v={`−${T(c.insurance)}`} danger />
                <TotalRow k="مالیات پلکانی" v={`−${T(c.tax)}`} danger />
                {c.fines > 0 && <TotalRow k="جریمه" v={`−${T(c.fines)}`} danger />}
                {c.advances > 0 && <TotalRow k="مساعده" v={`−${T(c.advances)}`} danger />}
                <div className="my-1 border-t border-dashed border-border" />
                <div className="flex items-center justify-between rounded-xl bg-primary/10 px-3 py-2">
                  <span className="text-sm font-black">خالص پرداختی</span>
                  <span className="text-lg font-black tabular-nums text-primary">{T(c.net)}</span>
                </div>
                <p className="text-[10px] leading-4 text-muted-foreground">ذخیرهٔ سنوات این ماه: {T(c.seniorityAccrual)} تومان (تسویهٔ سالانه همراه عیدی) · مزد ساعتی مأخذ: {T(c.hourlyBase)} تومان</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** ورودی اعشاری (نرخ‌ها) — ارقام فارسی/لاتین + ممیز */
function DecimalField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <Labeled label={label} hint={hint}>
      <input dir="ltr" inputMode="decimal"
        value={String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])}
        onChange={(e) => {
          const cleaned = enDigits(e.target.value).replace(/[^\d.]/g, '')
          const n = Number(cleaned)
          onChange(isNaN(n) ? 0 : n)
        }}
        className="w-full rounded-lg border border-input bg-white/90 px-2 py-2 text-center text-xs font-bold tabular-nums outline-none focus:border-primary" />
    </Labeled>
  )
}

function ProfField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number | '') => void; hint?: string }) {
  return (
    <Labeled label={label} hint={hint}>
      <FaPriceInput value={value} onChange={onChange} className="rounded-lg border border-input py-2 text-xs" />
    </Labeled>
  )
}

function TotalRow({ k, v, bold, danger, muted }: { k: string; v: string; bold?: boolean; danger?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <span className={cn('text-[11px]', muted && 'text-muted-foreground')}>{k}</span>
      <span className={cn('tabular-nums', bold ? 'font-black text-foreground' : 'font-bold', danger && 'text-rose-600')}>{v}</span>
    </div>
  )
}

/* ═══════════ فیش حقوقی چاپی ═══════════ */

function Payslip({ row, data, generatedBy }: { row: Row; data: Resp; generatedBy: string }) {
  const c = row.computed
  const st = STATUS_META[row.month.status] || STATUS_META.DRAFT
  const rows: Array<[string, number]> = [
    ['حقوق پایه (کسر غیبت‌شده)', c.baseProrated],
    ['حق مسکن', c.housing],
    ['بن کارگری (خواروبار)', c.foodAllowance],
    ['حق تأهل', c.marital],
    [`حق اولاد (${faNum(row.profile.childCount)} فرزند)`, c.childTotal],
    [`اضافه‌کاری ${faNum(Math.round(c.otHours * 10) / 10)} ساعت × ۱٫۴ (مادهٔ ۵۹)`, c.overtimePay],
    [`جمعه/تعطیل‌کاری ${faNum(Math.round(c.holidayOtHours * 10) / 10)} ساعت × ۱٫۴ (مواد ۶۲ و ۶۳)`, c.holidayOtPay],
    [`شب‌کاری ${faNum(Math.round(c.nightHours * 10) / 10)} ساعت +۳۵٪ (مادهٔ ۵۸)`, c.nightPay],
    ['تشویقی', c.rewards],
    ['پورسانت (محرمانه)', c.commissions],
    ['سایر مزایا', c.other],
  ]
  const deductions: Array<[string, number]> = [
    [`بیمهٔ تأمین اجتماعی — سهم کارگر ${faNum(Math.round(data.policy.insuranceRate * 100))}٪ (مشمول: ${R(c.insurableBase)} ریال)`, c.insurance],
    ['مالیات حقوق پلکانی (مادهٔ ۸۴ ق.م.م)', c.tax],
    ['جریمه', c.fines],
    ['مساعده', c.advances],
  ]
  return (
    <div>
      <div id="payslip-print-area" className="rounded-2xl border border-border bg-white p-4 text-[#111]" dir="rtl" style={{ fontFamily: 'Vazirmatn, sans-serif' }}>
        <div className="flex items-start justify-between border-b-2 border-[#0e7a4a] pb-2">
          <div>
            <div className="text-lg font-black">{data.employer}</div>
            <div className="text-[10px] text-gray-500">فیش حقوق و دستمزد — مطابق قانون کار جمهوری اسلامی ایران</div>
          </div>
          <div className="text-left text-[11px] leading-5">
            <div>شمارهٔ فیش: <b>{row.month.payslipNo || '—'}</b></div>
            <div>دوره: <b>{J_MONTHS[data.jm - 1]} {faNum(data.jy)}</b></div>
            <div>وضعیت: <b>{st.label}</b>{row.month.paidAt ? ` — ${formatJalaliDateTime(row.month.paidAt)}` : ''}</div>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-b border-dashed border-gray-300 pb-2 text-[11px] sm:grid-cols-4">
          <Info k="نام و نام خانوادگی" v={row.name} />
          <Info k="شمارهٔ پرسنلی" v={row.personnelNo} />
          <Info k="کد ملی" v={row.nationalId ? faNum(row.nationalId) : '—'} />
          <Info k="سمت" v={row.jobTitle || '—'} />
          <Info k="شمارهٔ کارت بانکی" v={row.bankCard ? faNum(row.bankCard) : '—'} />
          <Info k="شبا" v={row.shaba || '—'} />
          <Info k="تاریخ استخدام" v={row.hireDate ? faNum(row.hireDate) : '—'} />
          <Info k="روز کارکرد مؤثر" v={`${faNum(c.workDays)} روز (غیبت: ${faNum(c.absentFullDays)} کامل / ${faNum(c.absentHalfDays)} نیم)`} />
        </div>

        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1 rounded bg-[#0e7a4a] px-2 py-1 text-[11px] font-black text-white">مزایا و درآمد (ریال)</div>
            <table className="w-full text-[11px]">
              <tbody>
                {rows.filter(([, v]) => v > 0).map(([k, v]) => (
                  <tr key={k} className="border-b border-gray-100">
                    <td className="py-1">{k}</td>
                    <td className="py-1 text-left tabular-nums font-bold">{R(v)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-black">
                  <td className="py-1">جمع حقوق و مزایا</td>
                  <td className="py-1 text-left tabular-nums">{R(c.gross)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <div className="mb-1 rounded bg-[#b3372f] px-2 py-1 text-[11px] font-black text-white">کسور (ریال)</div>
            <table className="w-full text-[11px]">
              <tbody>
                {deductions.filter(([, v]) => v > 0).map(([k, v]) => (
                  <tr key={k} className="border-b border-gray-100">
                    <td className="py-1">{k}</td>
                    <td className="py-1 text-left tabular-nums font-bold">{R(v)}</td>
                  </tr>
                ))}
                {!deductions.some(([, v]) => v > 0) && <tr><td className="py-2 text-gray-400">کسوری ثبت نشده است</td></tr>}
                <tr className="bg-gray-50 font-black">
                  <td className="py-1">جمع کسور</td>
                  <td className="py-1 text-left tabular-nums">{R(c.insurance + c.tax + c.otherDeductions)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl border-2 border-[#0e7a4a] bg-[#0e7a4a]/5 px-3 py-2">
          <span className="text-sm font-black">خالص پرداختی</span>
          <span className="text-xl font-black tabular-nums text-[#0e7a4a]">{R(c.net)} ریال</span>
        </div>
        <p className="mt-2 text-[9px] leading-4 text-gray-500">
          توضیح: حق مسکن، بن کارگری و اضافه‌کاری از مشمول بیمهٔ سهم کارگر معاف است (تبصرهٔ مادهٔ ۳۸ قانون تأمین اجتماعی) · مأخذ اضافه‌کاری {data.policy.insuranceIncludesOT ? 'شامل مزایا' : 'حقوق پایه'} با مخرج {faNum(row.profile.overtimeDivisor)} · ذخیرهٔ سنوات این ماه {R(c.seniorityAccrual)} ریال (تسویهٔ سالانه همراه عیدی) · این فیش به‌صورت سیستمی از سامانهٔ هایپر زیتون صادر شده است.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-8 text-center text-[10px] text-gray-600">
          <div className="border-t border-gray-400 pt-1">امضای کارمند</div>
          <div className="border-t border-gray-400 pt-1">امضای کارفرما / حسابدار</div>
        </div>
        <div className="mt-2 text-left text-[9px] text-gray-400">
          صادره توسط: {generatedBy} — {formatJalaliDateTime(new Date().toISOString())}
        </div>
      </div>
      <div className="no-print mt-3 flex justify-end gap-2">
        <button onClick={() => window.print()} className="flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-black text-white hover:opacity-90"><Printer size={15} /> چاپ فیش (A4)</button>
      </div>
    </div>
  )
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span className="text-gray-500">{k}: </span>
      <b>{v}</b>
    </div>
  )
}

/* ═══════════ عیدی و سنوات (سالانه) ═══════════ */

function YearlyTab({ rows, canManage, selfPid, sel, setSel, yearly, setYearly, meta, setMeta }: {
  rows: Row[]; canManage: boolean; selfPid: string | null
  sel: { personnelId: string; jy: number } | null
  setSel: (v: { personnelId: string; jy: number } | null) => void
  yearly: Yearly | null; setYearly: (y: Yearly | null) => void
  meta: { name: string; jobTitle: string; hireDate: string; personnelNo: string } | null
  setMeta: (m: { name: string; jobTitle: string; hireDate: string; personnelNo: string } | null) => void
}) {
  const now = toJalaliParts(todayIso())
  const [busy, setBusy] = useState(false)
  const years = [now.jy + 1, now.jy, now.jy - 1, now.jy - 2]

  const compute = async (personnelId: string, jy: number) => {
    setBusy(true)
    try {
      const d = await api<{ yearly: Yearly; personnel: { name: string; jobTitle: string; hireDate: string }; personnelNo: string }>('/api/payroll', { method: 'POST', body: { action: 'yearly', personnelId, jy } })
      setYearly(d.yearly)
      setMeta({ name: d.personnel.name, jobTitle: d.personnel.jobTitle, hireDate: d.personnel.hireDate, personnelNo: d.personnelNo })
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  if (!rows.length) return <EmptyState emoji="🫒" title="پرسنلی یافت نشد" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Labeled label="پرسنل">
          <select value={sel?.personnelId || ''} onChange={(e) => { setSel({ personnelId: e.target.value, jy: sel?.jy || now.jy }); setYearly(null) }}
            className="min-w-48 rounded-xl border border-input bg-white/90 px-3 py-2 text-sm font-bold outline-none focus:border-primary">
            <option value="">انتخاب کنید…</option>
            {rows.map((r) => <option key={r.id} value={r.id}>{r.name} — {r.jobTitle || '—'}</option>)}
          </select>
        </Labeled>
        <Labeled label="سال شمسی">
          <select value={sel?.jy || now.jy} onChange={(e) => { setSel({ personnelId: sel?.personnelId || '', jy: Number(e.target.value) }); setYearly(null) }}
            className="rounded-xl border border-input bg-white/90 px-3 py-2 text-sm font-bold outline-none focus:border-primary">
            {years.map((y) => <option key={y} value={y}>{faNum(y)}</option>)}
          </select>
        </Labeled>
        <button disabled={!sel?.personnelId || busy} onClick={() => sel && compute(sel.personnelId, sel.jy)}
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">
          محاسبهٔ تسویه
        </button>
        <p className="text-[11px] text-muted-foreground">عیدی: حداقل ۲ برابر مزد ماهانه، سقف ۳ برابر حداقل مزد (۹۰ روز مزد حداقلی) · سنوات: پایهٔ روزانه × روزهای خدمت · خدمت ناقص → تناسب روزها</p>
      </div>

      {busy && <div className="h-24 animate-pulse rounded-2xl bg-muted/60" />}
      {!busy && yearly && meta && (
        <div id="yearly-print-area" className="rounded-2xl border border-border bg-white p-4 text-[#111]" dir="rtl" style={{ fontFamily: 'Vazirmatn, sans-serif' }}>
          <div className="flex items-start justify-between border-b-2 border-[#c9a227] pb-2">
            <div>
              <div className="text-lg font-black">تسویهٔ سالانهٔ عیدی و سنوات</div>
              <div className="text-[11px] text-gray-500">{meta.name} · {meta.jobTitle} · {meta.personnelNo} · استخدام: {meta.hireDate ? faNum(meta.hireDate) : '—'}</div>
            </div>
            <div className="text-[11px]">سال <b>{faNum(yearly.jy)}</b></div>
          </div>
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <KV k="روزهای خدمت در سال" v={`${faNum(yearly.serviceDays)} از ${faNum(yearly.yearDays)} روز (${faNum(Math.round(yearly.ratio * 100))}٪)${yearly.partial ? ' — تناسبی' : ''}`} />
            <KV k="بازهٔ احتساب" v={`${yearly.serviceFrom ? formatJalaliShort(yearly.serviceFrom) : '—'} تا ${formatJalaliShort(yearly.serviceTo)}`} />
            <KV k="عیدی (۲ برابر مزد، تناسبی)" v={`${faMoney(yearly.eydi)} ریال`} />
            <KV k="سقف قانونی عیدی (۳ × ماه حداقلی)" v={`${faMoney(yearly.eydiCap)} ریال`} />
            <KV k="سنوات (پایهٔ روزانه × روز خدمت)" v={`${faMoney(yearly.seniority)} ریال`} />
            <KV k="جمع تسویه" v={`${faMoney(yearly.total)} ریال`} strong />
          </div>
          <p className="mt-3 text-[9px] leading-4 text-gray-500">این برگه «ماشین‌حساب» است و تسویهٔ قطعی پس از بررسی حسابداری معتبر است · قانون حق پاداش سالانه و مادهٔ ۴۲ قانون کار · صادره: {formatJalaliDateTime(new Date().toISOString())}</p>
        </div>
      )}
      {!busy && yearly && (
        <div className="flex justify-end">
          <button onClick={() => window.print()} className="flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-black text-white"><Printer size={15} /> چاپ تسویه</button>
        </div>
      )}
      {!yearly && !busy && (
        <EmptyState emoji="🎁" title="برای محاسبه، پرسنل و سال را انتخاب کنید" hint="عیدی و سنوات سالانه به‌صورت تناسبی با روزهای خدمت محاسبه می‌شود" />
      )}
    </div>
  )
}

function KV({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2', strong && 'bg-[#0e7a4a]/10')}>
      <span className="text-gray-600">{k}</span>
      <span className={cn('tabular-nums', strong ? 'font-black text-[#0e7a4a]' : 'font-bold')}>{v}</span>
    </div>
  )
}

/* ═══════════ فیش من ═══════════ */

function SelfTab({ row, onOpenSlip }: { row: Row | null; onOpenSlip: (id: string) => void }) {
  if (!row) {
    return <EmptyState emoji="🪪" title="فیشی برای نمایش نیست" hint="حساب شما به پروندهٔ پرسنلی متصل نیست — با منابع انسانی تماس بگیرید" />
  }
  const c = row.computed
  const st = STATUS_META[row.month.status] || STATUS_META.DRAFT
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="خالص پرداختی (تومان)" value={T(c.net)} tone="emerald" hint={st.label} />
        <StatCard label="جمع حقوق و مزایا (تومان)" value={T(c.gross)} tone="gold" />
        <StatCard label="بیمه + مالیات (تومان)" value={T(c.insurance + c.tax)} tone="rose" />
        <StatCard label="روز کارکرد" value={faNum(c.workDays)} tone="olive" hint={`اضافه‌کاری ${faNum(Math.round(c.otHours))} ساعت`} />
      </div>
      <div className="rounded-2xl border border-border p-4 text-sm">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-black">فیش من — {row.name}</h4>
          <button onClick={() => onOpenSlip(row.id)} className="flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-xs font-bold hover:border-primary"><Printer size={13} /> چاپ فیش من</button>
        </div>
        <div className="space-y-1 text-xs">
          <TotalRow k="حقوق پایه (کسر غیبت)" v={T(c.baseProrated)} />
          <TotalRow k="مسکن + بن + تأهل + اولاد" v={T(c.housing + c.foodAllowance + c.marital + c.childTotal)} />
          <TotalRow k="اضافه‌کاری + جمعه‌کاری + شب‌کاری" v={T(c.overtimePay + c.holidayOtPay + c.nightPay)} />
          <TotalRow k="بیمهٔ سهم کارگر" v={`−${T(c.insurance)}`} danger />
          <TotalRow k="مالیات" v={`−${T(c.tax)}`} danger />
          <div className="flex items-center justify-between rounded-xl bg-primary/10 px-3 py-2">
            <span className="font-black">خالص پرداختی</span>
            <span className="text-base font-black tabular-nums text-primary">{T(c.net)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════ تنظیمات (مالیات/پیش‌فرض/سیاست) ═══════════ */

function SettingsTab({ data, onSaved }: { data: Resp; onSaved: () => void }) {
  const [tax, setTax] = useState<TaxCfg>(data.tax)
  const [dft, setDft] = useState<Partial<Profile>>(data.defaults)
  const [pol, setPol] = useState<PolicyCfg>(data.policy)
  const [busy, setBusy] = useState(false)
  const stat = data.statutory as { monthlyMinWage?: number; housing?: number; foodAllowance?: number; maritalAllowance?: number; childAllowance?: number; seniorityDaily?: number; dailyMinWage?: number }

  const saveTax = async () => {
    setBusy(true)
    try {
      await api('/api/payroll', { method: 'POST', body: { action: 'set-tax', exempt: tax.exempt, bands: tax.bands } })
      toast.success('جدول مالیات ذخیره شد'); onSaved()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  const saveDefaults = async () => {
    setBusy(true)
    try {
      await api('/api/payroll', { method: 'POST', body: { action: 'set-defaults', ...dft, ...pol } })
      toast.success('پیش‌فرض‌ها و سیاست ذخیره شد'); onSaved()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* مالیات */}
      <div className="rounded-2xl border border-border p-3">
        <h4 className="mb-2 flex items-center gap-1 text-sm font-black"><Percent size={14} /> جدول مالیات حقوق (ریال)</h4>
        <div className="space-y-2">
          <ProfField label="معافیت ماهانه" value={tax.exempt} onChange={(v) => setTax({ ...tax, exempt: v || 0 })} />
          {tax.bands.map((b, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <Labeled label={`سقف پلهٔ ${faNum(i + 1)} (مازاد بر معافیت — ریال${i === tax.bands.length - 1 ? ' · خالی = بی‌سقف' : ''})`}>
                  {i === tax.bands.length - 1 ? (
                    <input disabled value="بی‌سقف" className="w-full rounded-lg border border-input bg-muted/40 px-2 py-2 text-xs" />
                  ) : (
                    <FaPriceInput value={b.upTo ?? 0} onChange={(v) => { const bands = [...tax.bands]; bands[i] = { ...b, upTo: v === '' ? null : v }; setTax({ ...tax, bands }) }} className="rounded-lg border border-input py-2 text-xs" />
                  )}
                </Labeled>
              </div>
              <Labeled label="نرخ ٪">
                <input dir="ltr" value={Math.round(b.rate * 1000) / 10} onChange={(e) => {
                  const pct = Number(enDigits(e.target.value).replace(/[^\d.]/g, ''))
                  const bands = [...tax.bands]; bands[i] = { ...b, rate: (isNaN(pct) ? 0 : pct) / 100 }
                  setTax({ ...tax, bands })
                }} className="w-20 rounded-lg border border-input px-2 py-2 text-center text-xs font-bold tabular-nums outline-none focus:border-primary" />
              </Labeled>
            </div>
          ))}
          <button disabled={busy} onClick={saveTax} className="w-full rounded-xl bg-primary py-2 text-xs font-black text-white disabled:opacity-50">ذخیرهٔ جدول مالیات</button>
          <p className="text-[10px] leading-4 text-muted-foreground">پیش‌فرض ۱۴۰۴: معافیت ۲۴۰م؛ مازاد تا ۳۶۰م ← ۱۰٪، تا ۵۴۰م ← ۱۵٪، بیش از آن ← ۲۰٪ (مادهٔ ۸۴ ق.م.م)</p>
        </div>
      </div>

      {/* پیش‌فرض‌های پروفایل */}
      <div className="rounded-2xl border border-border p-3">
        <h4 className="mb-2 flex items-center gap-1 text-sm font-black"><Coins size={14} /> پیش‌فرض‌های پروفایل جدید (ریال)</h4>
        <div className="space-y-2">
          <ProfField label="حق مسکن" value={dft.housing ?? 0} onChange={(v) => setDft({ ...dft, housing: v || 0 })} />
          <ProfField label="بن کارگری" value={dft.foodAllowance ?? 0} onChange={(v) => setDft({ ...dft, foodAllowance: v || 0 })} />
          <ProfField label="حق تأهل" value={dft.maritalAllowance ?? 0} onChange={(v) => setDft({ ...dft, maritalAllowance: v || 0 })} />
          <ProfField label="حق اولاد هر فرزند" value={dft.childAllowance ?? 0} onChange={(v) => setDft({ ...dft, childAllowance: v || 0 })} hint="ذخیرهٔ صفر = عدم احراز ۷۲۰ روز سابقهٔ بیمه" />
          <ProfField label="سنوات روزانه" value={dft.seniorityBase ?? 0} onChange={(v) => setDft({ ...dft, seniorityBase: v || 0 })} />
          <ProfField label="مخرج اضافه‌کاری" value={dft.overtimeDivisor ?? 220} onChange={(v) => setDft({ ...dft, overtimeDivisor: v || 0 })} />
          <button disabled={busy} onClick={saveDefaults} className="w-full rounded-xl bg-primary py-2 text-xs font-black text-white disabled:opacity-50">ذخیرهٔ پیش‌فرض‌ها و سیاست</button>
          <p className="text-[10px] leading-4 text-muted-foreground">
            مبالغ قانونی ۱۴۰۴ — روزانه: {stat?.dailyMinWage ? faMoney(stat.dailyMinWage) : '—'} · ماهانه: {stat?.monthlyMinWage ? faMoney(stat.monthlyMinWage) : '—'} · سایر سطوح: مزد سال قبل × ۱٫۳۲ + ۹٬۳۱۶٬۰۸۰ (خودکار اعمال نمی‌شود)
          </p>
        </div>
      </div>

      {/* سیاست محاسبه */}
      <div className="rounded-2xl border border-border p-3">
        <h4 className="mb-2 flex items-center gap-1 text-sm font-black"><Settings2 size={14} /> سیاست محاسبه</h4>
        <div className="space-y-2">
          <DecimalField label="ضریب اضافه‌کاری (قانون: ۱٫۴)" value={pol.otRate} onChange={(v) => setPol({ ...pol, otRate: v })} />
          <DecimalField label="ضریب شب‌کاری افزودنی (قانون: ۰٫۳۵)" value={pol.nightRate} onChange={(v) => setPol({ ...pol, nightRate: v })} />
          <DecimalField label="ضریب جمعه/تعطیل‌کاری (قانون: ۱٫۴)" value={pol.holidayOtRate} onChange={(v) => setPol({ ...pol, holidayOtRate: v })} />
          <ProfField label="سقف اضافه‌کاری روزانه (دقیقه — قانون: ۲۴۰)" value={pol.otCapMinutes} onChange={(v) => setPol({ ...pol, otCapMinutes: v || 0 })} />
          <DecimalField label="نرخ بیمهٔ کارگر (۰٫۰۷ = ۷٪)" value={pol.insuranceRate} onChange={(v) => setPol({ ...pol, insuranceRate: v })} />
          <ProfField label="سقف جریمهٔ ماهانه (درصد gross)" value={pol.fineCapPct} onChange={(v) => setPol({ ...pol, fineCapPct: v || 0 })} />
          <ProfField label="گردکردن خالص به مضرب (۰ = دقیق، ۱۰۰۰ = هزار ریال)" value={pol.roundTo} onChange={(v) => setPol({ ...pol, roundTo: v || 0 })} />
          <label className="flex items-center gap-2 rounded-lg bg-muted/40 px-2 py-2 text-xs font-bold">
            <input type="checkbox" checked={pol.insuranceIncludesOT} onChange={(e) => setPol({ ...pol, insuranceIncludesOT: e.target.checked })} />
            اضافه‌کاری مشمول بیمه شود (پیش‌فرض طرح: معاف)
          </label>
          <p className="text-[10px] leading-4 text-muted-foreground">تغییر نرخ‌ها فقط روی محاسبات بعدی اثر می‌گذارد؛ ماه‌های قفل‌شده به‌عقب بازنمی‌گردند.</p>
        </div>
      </div>
    </div>
  )
}
