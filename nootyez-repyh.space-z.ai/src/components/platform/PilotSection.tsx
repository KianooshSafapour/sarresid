'use client'

/**
 * Hyper Zeytoon — Field Pilot Program «آزمون میدانی» (Task 13-a)
 *
 * The owner-facing engine for the external pilot: onboard tester companies
 * (invite code HZP-XXXX), track their status, watch structured feedback land
 * (public endpoint — testers have no accounts), a module leaderboard by avg
 * rating, a live feedback inbox, and a CSV export of every feedback row.
 *
 * API: GET/POST/PATCH /api/pilot (manager-gated) — POST /api/pilot/feedback (public).
 */
import * as React from 'react'
import {
  ClipboardCheck, UserPlus, Copy, Check, Star, Users, UserCheck, MessageSquareText,
  Timer, ChevronDown, Download, RefreshCw, Send, Info, ShoppingCart, Truck, Warehouse,
  CreditCard, Package, Building2, Map, CheckSquare, BookOpen, Calculator, BarChart3,
  Phone, MapPin, Inbox, Trophy,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, downloadFile } from '@/lib/api'
import { toFaDigits, isoToJalali, fmtJalali } from '@/lib/jalali'
import { hasRole, type PUser } from '@/lib/types'
import {
  PILOT_MODULES, PILOT_SIZES, PILOT_STATUSES, PILOT_SIZE_LABELS_FA, PILOT_STATUS_LABELS_FA,
} from '@/lib/pilot-modules'
import {
  Card, SectionHeader, StatCard, Badge, GoldButton, GhostButton,
  EmptyState, Field, inputCls, TableWrap, Th, Td, TimeAgo,
} from './kit'
import { SkeletonBlock } from './Skeletons'
import { cn } from '@/lib/utils'

/* ================= local types & helpers ================= */

interface FeedbackDTO {
  id: number
  moduleKey: string
  rating: number
  timeSavedMin: number | null
  comment: string | null
  createdAt: string
}

interface TesterDTO {
  id: number
  companyName: string
  contactName: string
  phone: string | null
  city: string | null
  sizeKey: string
  inviteCode: string
  status: string
  notes: string | null
  createdAt: string
  feedback: FeedbackDTO[]
  _feedbackCount: number
  _avgRating: number | null
  _totalTimeSavedMin: number
}

interface ModuleStat {
  moduleKey: string
  count: number
  avgRating: number
  totalTimeSavedMin: number
}

interface Summary {
  testers: number
  invited: number
  active: number
  completed: number
  feedbackCount: number
  avgRating: number | null
  totalTimeSavedMin: number
}

/** Persian digits integer */
const faInt = (n: number) => toFaDigits(Math.round(n))
/** Persian digits with one decimal + «٫» separator — e.g. ۴٫۷ */
const fa1 = (n: number) => toFaDigits((Math.round(n * 10) / 10).toFixed(1).replace('.', '٫'))

const MODULE_ICONS: Record<string, React.ComponentType<{ size?: number | string; className?: string }>> = {
  ShoppingCart, Truck, Warehouse, CreditCard, Package, Building2,
  Map, Users, CheckSquare, BookOpen, Calculator, BarChart3,
}

const STATUS_CHIP: Record<string, string> = {
  INVITED: 'bg-slate-100 text-slate-700 border-slate-200',
  ACTIVE: 'bg-[#F3F7EF] text-[#3E6B4A] border-[#C8D8C0]',
  COMPLETED: 'bg-[#FBF3DC] text-[#8A6508] border-[#EAD9A8]',
  DECLINED: 'bg-rose-50 text-rose-700 border-rose-200',
}

/* ================= tiny presentational bits ================= */

function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`امتیاز ${fa1(value)} از ۵`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={i <= Math.round(value) ? 'fill-[#DAA520] text-[#B8860B]' : 'text-[#D8D2BC]'}
        />
      ))}
    </span>
  )
}

async function copyText(s: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(s)
    } else {
      const ta = document.createElement('textarea')
      ta.value = s
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    toast.success('کپی شد ✓')
  } catch {
    toast.error('کپی ممکن نشد')
  }
}

function CopyCodeButton({ code }: { code: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); void copyText(code) }}
      className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border border-[#EAD9A8] bg-white/80 px-2.5 text-xs font-bold text-[#8A6508] transition hover:bg-[#FBF3DC] active:scale-[0.97]"
      aria-label={`کپی کد دعوت ${code}`}
      title="کپی کد دعوت"
    >
      <Copy size={13} /> کپی
    </button>
  )
}

function StatusChip({ status }: { status: string }) {
  return (
    <Badge className={cn('font-bold', STATUS_CHIP[status] ?? 'bg-stone-100 text-stone-700 border-stone-200')}>
      {PILOT_STATUS_LABELS_FA[status] ?? status}
    </Badge>
  )
}

/* ================= loading skeleton ================= */

function PilotSkeleton() {
  return (
    <div role="status" aria-label="در حال بارگذاری آزمون میدانی…" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <SkeletonBlock className="h-32 w-full rounded-2xl" />
      <SkeletonBlock className="h-56 w-full rounded-2xl" />
    </div>
  )
}

/* ================= component ================= */

const EMPTY_FORM = { companyName: '', contactName: '', phone: '', city: '', sizeKey: 'MID' as string, notes: '' }

export default function PilotSection({ user }: { user: PUser }) {
  const canPilot =
    hasRole(user, 'OWNER') || hasRole(user, 'GENERAL_MANAGER') ||
    hasRole(user, 'OPERATION_MANAGER') || hasRole(user, 'IT_ADMIN') ||
    hasRole(user, 'PRODUCT_MANAGER')

  const [loading, setLoading] = React.useState(true)
  const [testers, setTesters] = React.useState<TesterDTO[]>([])
  const [modules, setModules] = React.useState<ModuleStat[]>([])
  const [summary, setSummary] = React.useState<Summary | null>(null)

  const [formOpen, setFormOpen] = React.useState(false)
  const [form, setForm] = React.useState({ ...EMPTY_FORM })
  const [saving, setSaving] = React.useState(false)
  const [newCode, setNewCode] = React.useState<{ companyName: string; inviteCode: string } | null>(null)

  const [expandedId, setExpandedId] = React.useState<number | null>(null)
  const [exporting, setExporting] = React.useState(false)
  const [statusBusy, setStatusBusy] = React.useState<number | null>(null)

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const r = await api.get<{ testers: TesterDTO[]; modules: ModuleStat[]; summary: Summary }>(
        `/api/pilot?userId=${user.id}`,
      )
      setTesters(r.testers ?? [])
      setModules(r.modules ?? [])
      setSummary(r.summary ?? null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در دریافت داده‌های آزمون میدانی')
    } finally {
      setLoading(false)
    }
  }, [user.id])

  React.useEffect(() => { if (canPilot) void load() }, [canPilot, load])

  /* ---------- add tester ---------- */
  async function addTester(e: React.FormEvent) {
    e.preventDefault()
    if (!form.companyName.trim() || !form.contactName.trim()) {
      toast.error('نام شرکت و نام رابط الزامی است')
      return
    }
    setSaving(true)
    try {
      const r = await api.post<{ tester: TesterDTO }>('/api/pilot', {
        userId: user.id,
        companyName: form.companyName.trim(),
        contactName: form.contactName.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        sizeKey: form.sizeKey,
        notes: form.notes.trim(),
      })
      setNewCode({ companyName: r.tester.companyName, inviteCode: r.tester.inviteCode })
      toast.success(`آزمونگر «${r.tester.companyName}» اضافه شد ✓`)
      setForm({ ...EMPTY_FORM })
      setFormOpen(false)
      await load(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطا در افزودن آزمونگر')
    } finally {
      setSaving(false)
    }
  }

  /* ---------- status change ---------- */
  async function changeStatus(t: TesterDTO, status: string) {
    if (status === t.status) return
    setStatusBusy(t.id)
    try {
      await api.patch('/api/pilot', { userId: user.id, id: t.id, status })
      toast.success(`وضعیت «${t.companyName}» به «${PILOT_STATUS_LABELS_FA[status] ?? status}» تغییر کرد ✓`)
      await load(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'خطا در تغییر وضعیت')
    } finally {
      setStatusBusy(null)
    }
  }

  /* ---------- CSV export ---------- */
  async function exportCsv() {
    setExporting(true)
    try {
      const j = isoToJalali(new Date())
      await downloadFile(`/api/pilot?export=csv&userId=${user.id}`, `pilot-feedback-${j.jy}-${j.jm}.csv`)
      toast.success('خروجی CSV بازخوردها دانلود شد ✓')
    } catch {
      toast.error('خطا در دانلود خروجی CSV')
    } finally {
      setExporting(false)
    }
  }

  /* ---------- latest feedback inbox (latest 12) ---------- */
  const recentFeedback = React.useMemo(() => {
    const all = testers.flatMap((t) => t.feedback.map((f) => ({ ...f, companyName: t.companyName })))
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12)
  }, [testers])

  if (!canPilot) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <p className="text-lg font-bold text-amber-800">دسترسی به آزمون میدانی برای نقش شما مجاز نیست</p>
        <p className="mt-1 text-sm text-amber-700">This program is available to managers &amp; the product team only.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        tone="gold"
        icon={<ClipboardCheck size={22} />}
        title="آزمون میدانی"
        subtitle="Field Pilot Program — شرکت‌های بیرونی پلتفرم را امتحان می‌کنند و بازخورد ثبت می‌کنند"
        actions={
          <>
            <GhostButton onClick={() => void load(true)} className="min-h-[44px]" aria-label="بارگذاری مجدد">
              <RefreshCw size={15} /> بازخوانی
            </GhostButton>
            <GoldButton onClick={() => void exportCsv()} disabled={exporting} className="min-h-[44px]">
              {exporting ? <Spinner14 /> : <Download size={15} />} خروجی CSV
            </GoldButton>
          </>
        }
      />

      {/* ---------- loading ---------- */}
      {loading && <PilotSkeleton />}

      {!loading && (
        <>
          {/* ---------- summary strip ---------- */}
          <section aria-label="خلاصه آزمون میدانی" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatCard tone="olive" icon={<Users size={18} />} label="آزمونگران" value={faInt(summary?.testers ?? 0)} sub="Testers onboarded" />
            <StatCard tone="olive" icon={<UserCheck size={18} />} label="فعال" value={faInt(summary?.active ?? 0)} sub="Active testers" />
            <StatCard tone="gold" icon={<MessageSquareText size={18} />} label="بازخوردها" value={faInt(summary?.feedbackCount ?? 0)} sub="Feedback entries" />
            <StatCard
              tone="gold" icon={<Star size={18} />}
              label="میانگین امتیاز"
              value={summary?.avgRating !== null && summary?.avgRating !== undefined ? `${fa1(summary.avgRating)} ★` : '—'}
              sub="Avg rating (1–5)"
            />
            <StatCard
              tone="gold" icon={<Timer size={18} />}
              label="ساعت صرفه‌جویی‌شده در هفته"
              value={`${fa1((summary?.totalTimeSavedMin ?? 0) / 60)} ساعت`}
              sub="Hours saved / week (self-reported)"
            />
          </section>

          {/* ---------- invite-flow explainer ---------- */}
          <Card className="pz-panel-in overflow-hidden border-[#EAD9A8]/70 bg-gradient-to-l from-[#FBF3DC]/70 via-[#FBF9F3]/90 to-[#F3F7EF]/80">
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#B8860B] to-[#DAA520] text-white shadow-sm">
                  <Info size={16} />
                </span>
                <h4 className="text-sm font-black text-[#253A2A]">گردش کار دعوت — آزمونگران بدون حساب کاربری بازخورد می‌دهند</h4>
              </div>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                {[
                  'کد دعوت «HZP-XXXX» را به شرکت آزمونگر بدهید',
                  'آزمونگر ماژول‌های پلتفرم را در عمل امتحان می‌کند',
                  'امتیاز ۱ تا ۵ و دقیقه‌های صرفه‌جویی‌شده را ثبت می‌کند',
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5 rounded-xl border border-[#EAD9A8]/60 bg-white/70 p-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3E6B4A] to-[#5F8F55] text-xs font-black text-white shadow-sm">
                      {toFaDigits(i + 1)}
                    </span>
                    <p className="text-xs leading-6 font-medium text-[#4A5A44]">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* ---------- add-tester form (collapsible) ---------- */}
          <Card className="pz-panel-in overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFEAD8] p-4 sm:p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F3F7EF] text-[#3E6B4A]">
                  <UserPlus size={18} />
                </span>
                <div>
                  <h4 className="text-sm font-black text-[#253A2A]">افزودن آزمونگر جدید</h4>
                  <p className="text-[11px] text-[#8A9884]">با ثبت شرکت، یک کد دعوت یکتا ساخته می‌شود</p>
                </div>
              </div>
              <GhostButton
                onClick={() => setFormOpen((v) => !v)}
                className="min-h-[44px]"
                aria-expanded={formOpen}
                aria-controls="pilot-add-form"
              >
                {formOpen ? 'بستن فرم' : 'افزودن آزمونگر'}
                <ChevronDown size={15} className={cn('transition-transform motion-safe:duration-300', formOpen && 'rotate-180')} />
              </GhostButton>
            </div>

            {formOpen && (
              <form id="pilot-add-form" onSubmit={(e) => void addTester(e)} className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
                <Field label="نام شرکت" required>
                  <input
                    className={inputCls} value={form.companyName} required
                    onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                    placeholder="مثلاً هایپر مارکت رضایی"
                  />
                </Field>
                <Field label="نام رابط" required>
                  <input
                    className={inputCls} value={form.contactName} required
                    onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                    placeholder="مثلاً آقای رضایی"
                  />
                </Field>
                <Field label="تلفن">
                  <input
                    className={inputCls} value={form.phone} inputMode="tel" dir="ltr"
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="۰۹۱۲···"
                  />
                </Field>
                <Field label="شهر">
                  <input
                    className={inputCls} value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder="مثلاً تهران"
                  />
                </Field>
                <Field label="اندازه کسب‌وکار">
                  <select
                    className={cn(inputCls, 'min-h-[44px]')} value={form.sizeKey}
                    onChange={(e) => setForm((f) => ({ ...f, sizeKey: e.target.value }))}
                  >
                    {PILOT_SIZES.map((s) => (
                      <option key={s} value={s}>{PILOT_SIZE_LABELS_FA[s]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="یادداشت">
                  <input
                    className={inputCls} value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="مثلاً آشنایی در نمایشگاه صنایع غذایی"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <GoldButton type="submit" disabled={saving} className="min-h-[44px] px-6">
                    {saving ? <Spinner14 /> : <Send size={15} />}
                    {saving ? 'در حال ثبت…' : 'ثبت آزمونگر و ساخت کد دعوت'}
                  </GoldButton>
                </div>
              </form>
            )}

            {newCode && (
              <div className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#EAD9A8] bg-gradient-to-l from-[#FBF3DC] to-white p-4 sm:mx-5">
                <div>
                  <div className="text-[11px] font-bold text-[#8A6508]">کد دعوت ساخته شد — به «{newCode.companyName}» بدهید</div>
                  <div dir="ltr" className="mt-1 font-mono text-2xl font-black tracking-[0.2em] text-[#8A6508]">{newCode.inviteCode}</div>
                </div>
                <div className="flex items-center gap-2">
                  <GoldButton onClick={() => void copyText(newCode.inviteCode)} className="min-h-[44px]">
                    <Copy size={15} /> کپی کد
                  </GoldButton>
                  <GhostButton onClick={() => setNewCode(null)} className="min-h-[44px]" aria-label="بستن کد دعوت">
                    <Check size={15} /> انجام شد
                  </GhostButton>
                </div>
              </div>
            )}
          </Card>

          {/* ---------- testers ---------- */}
          <Card className="pz-panel-in overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFEAD8] p-4 sm:p-5">
              <h4 className="text-sm font-black text-[#253A2A]">آزمونگران میدانی</h4>
              <Badge className="border-[#D8E2D0] bg-[#F3F7EF] text-[#3E6B4A]">
                {toFaDigits(testers.length)} شرکت · برای دیدن تاریخچه بازخورد، روی ردیف بزنید
              </Badge>
            </div>

            {testers.length === 0 ? (
              <div className="p-4 sm:p-5">
                <EmptyState
                  icon={<ClipboardCheck size={40} />}
                  title="هنوز آزمونگری دعوت نشده است"
                  hint="اولین شرکت آزمونگر را با فرم بالا اضافه کنید — کد دعوت «HZP-XXXX» ساخته می‌شود و بازخوردها همین‌جا جمع می‌شود."
                />
              </div>
            ) : (
              <div className="p-4 sm:p-5">
                {/* desktop table */}
                <div className="hidden md:block">
                  <TableWrap>
                    <thead>
                      <tr>
                        <Th>شرکت</Th>
                        <Th>رابط</Th>
                        <Th>اندازه</Th>
                        <Th>وضعیت</Th>
                        <Th>کد دعوت</Th>
                        <Th>بازخورد</Th>
                        <Th>میانگین امتیاز</Th>
                        <Th>صرفه‌جویی/هفته</Th>
                        <Th>تغییر وضعیت</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {testers.map((t) => (
                        <TesterRow
                          key={t.id}
                          t={t}
                          expanded={expandedId === t.id}
                          onToggle={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
                          onStatus={(s) => void changeStatus(t, s)}
                          busy={statusBusy === t.id}
                        />
                      ))}
                    </tbody>
                  </TableWrap>
                </div>

                {/* mobile cards */}
                <div className="space-y-3 md:hidden">
                  {testers.map((t) => (
                    <TesterCard
                      key={t.id}
                      t={t}
                      expanded={expandedId === t.id}
                      onToggle={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
                      onStatus={(s) => void changeStatus(t, s)}
                      busy={statusBusy === t.id}
                    />
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* ---------- module leaderboard ---------- */}
          <Card className="pz-panel-in p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FBF3DC] text-[#8A6508]">
                  <Trophy size={16} />
                </span>
                <h4 className="text-sm font-black text-[#253A2A]">جدول امتیاز ماژول‌ها</h4>
              </div>
              <p className="text-[11px] text-[#8A9884]">میانگین امتیاز از ۵ — بر اساس بازخوردهای ثبت‌شده | Avg rating per module</p>
            </div>
            {modules.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  icon={<Star size={32} />}
                  title="هنوز امتیازی ثبت نشده است"
                  hint="به‌محض ثبت اولین بازخورد، نمودار ماژول‌ها همین‌جا ساخته می‌شود."
                />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {modules.map((m) => {
                  const meta = PILOT_MODULES.find((x) => x.key === m.moduleKey)
                  const Icon = MODULE_ICONS[m.moduleKey] ?? Star
                  const pct = Math.max(4, Math.min(100, (m.avgRating / 5) * 100))
                  return (
                    <div key={m.moduleKey} className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F3F7EF] text-[#3E6B4A]">
                        <Icon size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-xs font-bold text-[#253A2A]">{meta?.fa ?? m.moduleKey}</span>
                          <span className="shrink-0 text-[11px] font-semibold text-[#8A9884] tabular-nums">
                            {fa1(m.avgRating)} از ۵ · {toFaDigits(m.count)} بازخورد
                            {m.totalTimeSavedMin > 0 ? ` · ${faInt(m.totalTimeSavedMin)} دقیقه` : ''}
                          </span>
                        </div>
                        <div
                          className="mt-1.5 h-3 overflow-hidden rounded-full bg-[#F0EDE0]"
                          role="img"
                          aria-label={`${meta?.fa ?? m.moduleKey}: میانگین ${fa1(m.avgRating)} از ۵، ${toFaDigits(m.count)} بازخورد`}
                          title={`${meta?.en ?? m.moduleKey} — ${m.avgRating}/5`}
                        >
                          <div
                            className="h-full rounded-full bg-gradient-to-l from-[#F0D890] via-[#DAA520] to-[#B8860B] transition-[width] motion-safe:duration-700"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* ---------- latest feedback inbox ---------- */}
          <Card className="pz-panel-in p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F3F7EF] text-[#3E6B4A]">
                  <Inbox size={16} />
                </span>
                <h4 className="text-sm font-black text-[#253A2A]">صندوق بازخوردهای اخیر</h4>
              </div>
              <Badge className="border-[#EAD9A8] bg-[#FBF3DC] text-[#8A6508]">۱۲ ردیف آخر</Badge>
            </div>
            {recentFeedback.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  icon={<Inbox size={32} />}
                  title="صندوق خالی است"
                  hint="آزمونگران با کد دعوت، بازخوردشان را ثبت می‌کنند و اینجا ظاهر می‌شود."
                />
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-[#EFEAD8]">
                {recentFeedback.map((f) => {
                  const meta = PILOT_MODULES.find((x) => x.key === f.moduleKey)
                  return (
                    <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-black text-[#253A2A]">{f.companyName}</span>
                          <Badge className="border-[#D8E2D0] bg-[#F3F7EF] text-[#3E6B4A]">{meta?.fa ?? f.moduleKey}</Badge>
                          {f.timeSavedMin !== null && f.timeSavedMin > 0 && (
                            <Badge className="border-[#EAD9A8] bg-[#FBF3DC] font-bold text-[#8A6508]">
                              <Timer size={11} /> {toFaDigits(f.timeSavedMin)} دقیقه/هفته
                            </Badge>
                          )}
                        </div>
                        {f.comment && <p className="mt-0.5 text-xs italic leading-5 text-[#6B7A66]">«{f.comment}»</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5">
                        <Stars value={f.rating} size={12} />
                        <TimeAgo iso={f.createdAt} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

/* ================= table row (desktop) ================= */

function Spinner14() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
}

function TesterRow({ t, expanded, onToggle, onStatus, busy }: {
  t: TesterDTO
  expanded: boolean
  onToggle: () => void
  onStatus: (s: string) => void
  busy: boolean
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={cn('cursor-pointer transition-colors hover:bg-[#FBF9F3]', expanded && 'bg-[#FBF9F3]')}
        aria-expanded={expanded}
      >
        <Td>
          <div className="flex items-center gap-2">
            <ChevronDown size={14} className={cn('shrink-0 text-[#B8B29A] transition-transform motion-safe:duration-300', expanded && 'rotate-180')} />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-[#253A2A]">{t.companyName}</div>
              {t.city && <div className="flex items-center gap-1 text-[11px] text-[#8A9884]"><MapPin size={11} /> {t.city}</div>}
            </div>
          </div>
        </Td>
        <Td>
          <div className="text-xs font-semibold text-[#33402F]">{t.contactName}</div>
          {t.phone && <div dir="ltr" className="flex items-center gap-1 text-[11px] text-[#8A9884]"><Phone size={10} /> {t.phone}</div>}
        </Td>
        <Td><Badge className="border-[#E4DCC8] bg-[#F5F2E8] text-[#6B7A66]">{PILOT_SIZE_LABELS_FA[t.sizeKey] ?? t.sizeKey}</Badge></Td>
        <Td><StatusChip status={t.status} /></Td>
        <Td>
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <code dir="ltr" className="rounded-md border border-[#EAD9A8] bg-[#FBF3DC]/60 px-1.5 py-0.5 font-mono text-[11px] font-black tracking-wider text-[#8A6508]">
              {t.inviteCode}
            </code>
            <CopyCodeButton code={t.inviteCode} />
          </div>
        </Td>
        <Td className="tabular-nums">{t._feedbackCount > 0 ? toFaDigits(t._feedbackCount) : '—'}</Td>
        <Td>{t._avgRating !== null ? <Stars value={t._avgRating} /> : <span className="text-xs text-[#B8B29A]">—</span>}</Td>
        <Td className="tabular-nums">
          {t._totalTimeSavedMin > 0 ? <span className="font-bold text-[#8A6508]">{faInt(t._totalTimeSavedMin)} دقیقه</span> : '—'}
        </Td>
        <Td>
          <div onClick={(e) => e.stopPropagation()}>
            <select
              value={t.status}
              disabled={busy}
              onChange={(e) => onStatus(e.target.value)}
              className="min-h-[36px] rounded-lg border border-[#D8D2BC] bg-white px-2 py-1.5 text-xs font-semibold text-[#33402F] outline-none transition focus:border-[#5F8F55] focus:ring-2 focus:ring-[#93C572]/30 disabled:opacity-60"
              aria-label={`تغییر وضعیت ${t.companyName}`}
            >
              {PILOT_STATUSES.map((s) => (
                <option key={s} value={s}>{PILOT_STATUS_LABELS_FA[s]}</option>
              ))}
            </select>
          </div>
        </Td>
      </tr>
      {expanded && (
        <tr className="bg-[#FBF9F3]/60">
          <td colSpan={9} className="border-b border-[#E4DCC8] px-4 py-3 sm:px-6">
            <FeedbackHistory t={t} />
          </td>
        </tr>
      )}
    </>
  )
}

/* ================= mobile card ================= */

function TesterCard({ t, expanded, onToggle, onStatus, busy }: {
  t: TesterDTO
  expanded: boolean
  onToggle: () => void
  onStatus: (s: string) => void
  busy: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-white/90 p-4 transition-all',
        expanded ? 'border-[#DAA520] shadow-md' : 'border-[#E4DCC8]',
      )}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-[#253A2A]">{t.companyName}</div>
          <div className="mt-0.5 text-[11px] font-semibold text-[#6B7A66]">{t.contactName}</div>
          {t.phone && <div dir="ltr" className="mt-0.5 text-[11px] text-[#8A9884]">{t.phone}</div>}
        </div>
        <StatusChip status={t.status} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge className="border-[#E4DCC8] bg-[#F5F2E8] text-[#6B7A66]">{PILOT_SIZE_LABELS_FA[t.sizeKey] ?? t.sizeKey}</Badge>
        {t.city && <Badge className="border-[#E4DCC8] bg-[#F5F2E8] text-[#6B7A66]"><MapPin size={11} /> {t.city}</Badge>}
        <span
          dir="ltr"
          className="inline-flex items-center rounded-md border border-[#EAD9A8] bg-[#FBF3DC]/60 px-1.5 py-0.5 font-mono text-[11px] font-black tracking-wider text-[#8A6508]"
        >
          {t.inviteCode}
        </span>
        <span onClick={(e) => e.stopPropagation()}><CopyCodeButton code={t.inviteCode} /></span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-[#6B7A66]">
        <span>بازخورد: <b className="tabular-nums text-[#33402F]">{t._feedbackCount > 0 ? toFaDigits(t._feedbackCount) : '—'}</b></span>
        <span className="flex items-center gap-1">امتیاز: {t._avgRating !== null ? <Stars value={t._avgRating} /> : '—'}</span>
        <span>صرفه‌جویی: <b className="tabular-nums text-[#8A6508]">{t._totalTimeSavedMin > 0 ? `${faInt(t._totalTimeSavedMin)} دقیقه` : '—'}</b></span>
      </div>
      <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <select
          value={t.status}
          disabled={busy}
          onChange={(e) => onStatus(e.target.value)}
          className="min-h-[44px] flex-1 rounded-xl border border-[#D8D2BC] bg-white px-3 py-2 text-xs font-semibold text-[#33402F] outline-none transition focus:border-[#5F8F55] focus:ring-2 focus:ring-[#93C572]/30 disabled:opacity-60"
          aria-label={`تغییر وضعیت ${t.companyName}`}
        >
          {PILOT_STATUSES.map((s) => (
            <option key={s} value={s}>{PILOT_STATUS_LABELS_FA[s]}</option>
          ))}
        </select>
        <GhostButton onClick={onToggle} className="min-h-[44px]" aria-expanded={expanded}>
          {expanded ? 'بستن' : 'تاریخچه'}
          <ChevronDown size={14} className={cn('transition-transform motion-safe:duration-300', expanded && 'rotate-180')} />
        </GhostButton>
      </div>
      {expanded && (
        <div className="mt-3 border-t border-[#EFEAD8] pt-3" onClick={(e) => e.stopPropagation()}>
          <FeedbackHistory t={t} />
        </div>
      )}
    </div>
  )
}

/* ================= feedback history (expandable) ================= */

function FeedbackHistory({ t }: { t: TesterDTO }) {
  if (t.feedback.length === 0) {
    return (
      <p className="py-2 text-center text-xs font-semibold text-[#8A9884]">
        هنوز بازخوردی ثبت نشده — کد دعوت {t.inviteCode} در اختیار {t.contactName} است
      </p>
    )
  }
  return (
    <div>
      <div className="mb-2 text-[11px] font-black text-[#4A5A44]">
        تاریخچه بازخورد «{t.companyName}» — {toFaDigits(t.feedback.length)} ردیف
      </div>
      <ul className="max-h-96 space-y-2 overflow-y-auto pz-scroll pe-1">
        {t.feedback.map((f) => {
          const meta = PILOT_MODULES.find((x) => x.key === f.moduleKey)
          return (
            <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[#EFEAD8] bg-white/80 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-[#253A2A]">{meta?.fa ?? f.moduleKey}</span>
                  {f.timeSavedMin !== null && f.timeSavedMin > 0 && (
                    <Badge className="border-[#EAD9A8] bg-[#FBF3DC] font-bold text-[#8A6508]">
                      <Timer size={11} /> {toFaDigits(f.timeSavedMin)} دقیقه/هفته
                    </Badge>
                  )}
                </div>
                {f.comment && <p className="mt-0.5 text-xs italic leading-5 text-[#6B7A66]">«{f.comment}»</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <Stars value={f.rating} size={12} />
                <span className="text-[11px] text-[#8A9884]">{fmtJalali(f.createdAt)}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
