'use client'
import * as React from 'react'
import { toast } from 'sonner'
import {
  Calculator, CheckCircle2, ClipboardCheck, Coins, Download, Eye,
  FileSpreadsheet, Landmark, TrendingUp,
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api, downloadFile } from '@/lib/api'
import { useApp } from '@/lib/store'
import { hasRole, type PUser } from '@/lib/types'
import {
  fmtJalali, fmtJalaliTime, fmtMoney, fmtMoneyShort, isoToJalali,
  JALALI_MONTHS, toFaDigits, todayISO,
} from '@/lib/jalali'
import {
  Badge, Card, EmptyState, GhostButton, GoldButton, Loading, Modal, Money,
  PrimaryButton, SectionHeader, StatCard, StatusBadge, Tabs, TableWrap, Td, Th,
} from './kit'

/* =============== local types =============== */

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
  supplier?: { id: number; name: string } | null
  _count?: { items: number }
}

interface DashT {
  counts: { chequesPendingOwner: number } & Record<string, number>
  ordersByStatus: { status: string; count: number }[]
}

const VAT_RATE = 0.09
const PIE_COLORS = ['#3E6B4A', '#5F8F55', '#93C572', '#DAA520', '#B8860B', '#C9A227']

const HOLOO_STEPS = [
  'روی سفارش، دکمه «خروجی Excel برای Holoo» را بزنید تا فایل اکسل دانلود شود.',
  'در Holoo به بخش Buy → Invoice بروید و فایل اکسل را وارد (Import) کنید.',
  'قیمت‌ها و تعدادها را با فاکتور تامین‌کننده کنترل کنید.',
  'بعد از ثبت موفق در Holoo، برگردید و همین‌جا «ثبت شد در هولو» را بزنید تا سفارش بسته شود.',
  'پرداخت (نقدی یا چک) را در بخش «پرداخت‌ها / چک‌ها» ثبت کنید.',
]

function jMonthKey(iso: string): string {
  const { jy, jm } = isoToJalali(iso)
  return `${jy}-${String(jm).padStart(2, '0')}`
}

/* =============== main section =============== */

export default function AccountingSection({ user }: { user: PUser }) {
  const openOrder = useApp((s) => s.openOrder)
  const isAccountant = hasRole(user, 'ACCOUNTANT')

  const [loading, setLoading] = React.useState(true)
  const [dash, setDash] = React.useState<DashT | null>(null)
  const [confirmed, setConfirmed] = React.useState<ListOrder[]>([])
  const [doneOrders, setDoneOrders] = React.useState<ListOrder[]>([])
  const [allOrders, setAllOrders] = React.useState<ListOrder[]>([])
  const [tab, setTab] = React.useState('queue')
  const [doneTarget, setDoneTarget] = React.useState<ListOrder | null>(null)
  const [closing, setClosing] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [d, c, dn, all] = await Promise.all([
        api.get<DashT>('/api/dashboard'),
        api.get<{ orders: ListOrder[] }>('/api/orders?status=CONFIRMED'),
        api.get<{ orders: ListOrder[] }>('/api/orders?status=DONE'),
        api.get<{ orders: ListOrder[] }>('/api/orders'),
      ])
      setDash(d)
      setConfirmed(c.orders)
      setDoneOrders(dn.orders)
      setAllOrders(all.orders)
    } catch {
      toast.error('خطا در بارگذاری داده‌های حسابداری')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  /* ---- stats ---- */
  const confirmedCount = React.useMemo(
    () => dash?.ordersByStatus?.find((s) => s.status === 'CONFIRMED')?.count ?? confirmed.length,
    [dash, confirmed]
  )
  const pendingCheques = dash?.counts?.chequesPendingOwner ?? 0

  const currentMonthKey = jMonthKey(todayISO())
  const monthDone = doneOrders.filter((o) => o.doneAt && jMonthKey(o.doneAt) === currentMonthKey)
  const monthDoneSum = monthDone.reduce((s, o) => s + o.total, 0)
  const nowJ = isoToJalali(todayISO())
  const monthLabel = `${JALALI_MONTHS[nowJ.jm - 1]} ${toFaDigits(nowJ.jy)}`

  /* ---- insights: monthly spend ---- */
  const monthly = React.useMemo(() => {
    const m = new Map<string, { jy: number; jm: number; total: number }>()
    for (const o of allOrders) {
      if (!o.createdAt) continue
      const { jy, jm } = isoToJalali(o.createdAt)
      const key = `${jy}-${String(jm).padStart(2, '0')}`
      const cur = m.get(key) ?? { jy, jm, total: 0 }
      cur.total += o.total
      m.set(key, cur)
    }
    return [...m.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-6)
      .map(([, v]) => ({ label: JALALI_MONTHS[v.jm - 1], total: Math.round(v.total) }))
  }, [allOrders])

  /* ---- insights: spend by supplier ---- */
  const bySupplier = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const o of allOrders) {
      const name = o.supplier?.name ?? 'سایر'
      m.set(name, (m.get(name) ?? 0) + o.total)
    }
    const arr = [...m.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
    if (arr.length <= 6) return arr
    const top = arr.slice(0, 5)
    const rest = arr.slice(5).reduce((s, x) => s + x.value, 0)
    return [...top, { name: 'سایر', value: rest }]
  }, [allOrders])

  const totalSpend = allOrders.reduce((s, o) => s + o.total, 0)
  const vatCollected = doneOrders.reduce((s, o) => s + (o.vat > 0 ? o.vat : o.total * VAT_RATE), 0)

  /* ---- actions ---- */
  const exportOne = async (o: ListOrder) => {
    try {
      await downloadFile(`/api/export/order/${o.id}?userId=${user.id}`, `${o.code}-holoo.xls`)
      toast.success('فایل اکسل برای Holoo آماده شد ✓')
    } catch {
      toast.error('خطا در ساخت فایل اکسل')
    }
  }

  const markDone = async () => {
    if (!doneTarget) return
    setClosing(true)
    try {
      await api.patch(`/api/orders/${doneTarget.id}`, { action: 'done', userId: user.id })
      toast.success('سفارش بسته شد +۵ امتیاز')
      setDoneTarget(null)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در بستن سفارش')
    } finally {
      setClosing(false)
    }
  }

  const tabs = [
    { key: 'queue', label: 'صف ثبت در هولو', icon: <ClipboardCheck size={16} /> },
    { key: 'history', label: 'تاریخچه', icon: <CheckCircle2 size={16} /> },
    { key: 'insights', label: 'تحلیل‌ها', icon: <TrendingUp size={16} /> },
  ]

  return (
    <div>
      <SectionHeader
        title="حسابداری | Accounting"
        subtitle="ثبت سفارش‌های تاییدشده در Holoo و تحلیل خریدها"
        icon={<Calculator size={20} />}
        actions={!isAccountant ? <Badge className="border-[#EAD9A8] bg-[#FFF7E0] text-[#8A6508]">فقط مشاهده | Read-only</Badge> : undefined}
      />

      {/* stats */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="در انتظار حسابداری"
          value={toFaDigits(confirmedCount)}
          sub="سفارش تایید انبار — ثبت در هولو"
          icon={<ClipboardCheck size={20} />}
          tone="gold"
        />
        <StatCard
          label={`خرید ثبت‌شده (${monthLabel})`}
          value={fmtMoneyShort(monthDoneSum)}
          sub={`${toFaDigits(monthDone.length)} سفارش بسته‌شده`}
          icon={<Coins size={20} />}
          tone="olive"
        />
        <StatCard
          label="چک در انتظار تایید مالک"
          value={toFaDigits(pendingCheques)}
          sub="بخش پرداخت‌ها"
          icon={<Landmark size={20} />}
          tone="rose"
        />
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {loading ? (
        <Loading label="در حال بارگذاری اطلاعات حسابداری…" />
      ) : (
        <>
          {/* ================= QUEUE TAB ================= */}
          {tab === 'queue' && (
            <div className="space-y-4">
              {confirmed.length === 0 ? (
                <EmptyState icon={<ClipboardCheck size={40} />} title="صف خالی است" hint="سفارش‌های تاییدشده انبار برای ثبت در Holoo اینجا می‌آیند." />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {confirmed.map((o) => (
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
                        <span>VAT: <b className="tabular-nums">{fmtMoney(o.vat)}</b></span>
                      </div>
                      <div className="mt-1 text-sm font-bold text-[#3E6B4A]">
                        جمع کل: <Money value={o.total} className="text-sm" />
                      </div>
                      <div className="mt-3 grid gap-2">
                        <GoldButton className="min-h-[44px] w-full" onClick={() => exportOne(o)}>
                          <FileSpreadsheet size={16} /> خروجی Excel برای Holoo
                        </GoldButton>
                        {isAccountant ? (
                          <PrimaryButton className="min-h-[44px] w-full" onClick={() => setDoneTarget(o)}>
                            <CheckCircle2 size={16} /> ثبت شد در هولو / Mark Done
                          </PrimaryButton>
                        ) : (
                          <GhostButton className="min-h-[44px] w-full" onClick={() => openOrder(o.id)}>
                            <Eye size={15} /> مشاهده سفارش
                          </GhostButton>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {/* Holoo Bridge Guide */}
              <Card className="border-[#EAD9A8] bg-gradient-to-br from-[#FFFDF5] to-[#FBF3DC] p-5">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#DAA520] to-[#B8860B] text-lg text-white shadow-md">🌉</div>
                  <div>
                    <h3 className="text-base font-extrabold text-[#253A2A]">راهنمای پل Holoo | Holoo Bridge Guide</h3>
                    <p className="text-xs text-[#8A6508]">۵ قدم ساده تا بستن هر سفارش</p>
                  </div>
                </div>
                <ol className="space-y-2.5">
                  {HOLOO_STEPS.map((s, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#DAA520] to-[#B8860B] text-xs font-extrabold text-white shadow">
                        {toFaDigits(i + 1)}
                      </span>
                      <span className="text-sm leading-6 text-[#4A4230]">{s}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 rounded-xl border border-[#EAD9A8] bg-white/70 px-3 py-2 text-xs text-[#8A6508]">
                  خانم درویشی، همین ۵ قدم! هر جا سوالی بود، ادمین در خدمت است 🌼
                </p>
              </Card>
            </div>
          )}

          {/* ================= HISTORY TAB ================= */}
          {tab === 'history' && (
            doneOrders.length === 0 ? (
              <EmptyState icon={<CheckCircle2 size={40} />} title="هنوز سفارشی بسته نشده" />
            ) : (
              <div className="max-h-[70vh] overflow-y-auto pz-scroll">
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>کد سفارش</Th>
                      <Th>تامین‌کننده</Th>
                      <Th>مبلغ کل</Th>
                      <Th>VAT</Th>
                      <Th>تاریخ بستن</Th>
                      <Th className="text-left">عملیات</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {doneOrders.map((o) => (
                      <tr key={o.id} className="transition hover:bg-[#FBF9F3]">
                        <Td className="font-bold">{o.code}</Td>
                        <Td>{o.supplier?.name ?? '—'}</Td>
                        <Td><Money value={o.total} className="text-xs font-semibold" /></Td>
                        <Td className="tabular-nums text-xs">{fmtMoney(o.vat)}</Td>
                        <Td className="text-xs">{fmtJalaliTime(o.doneAt)}</Td>
                        <Td className="text-left">
                          <div className="flex justify-end gap-1.5">
                            <GhostButton className="min-h-[44px]" onClick={() => exportOne(o)} title="خروجی مجدد Excel">
                              <Download size={15} /> Excel
                            </GhostButton>
                            <GhostButton className="min-h-[44px]" onClick={() => openOrder(o.id)}>
                              <Eye size={15} /> مشاهده
                            </GhostButton>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </div>
            )
          )}

          {/* ================= INSIGHTS TAB ================= */}
          {tab === 'insights' && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="جمع خرید کل" value={fmtMoneyShort(totalSpend)} sub={`${toFaDigits(allOrders.length)} سفارش`} icon={<Coins size={20} />} tone="olive" />
                <StatCard label="VAT جمع‌آوری‌شده (۹٪)" value={fmtMoneyShort(vatCollected)} sub="بر اساس سفارش‌های بسته‌شده" icon={<Calculator size={20} />} tone="gold" />
                <StatCard label="خرید این ماه" value={fmtMoneyShort(monthDoneSum)} sub={monthLabel} icon={<TrendingUp size={20} />} tone="sky" />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="p-4">
                  <h3 className="mb-3 text-sm font-bold text-[#253A2A]">روند خرید ماهانه (تومان)</h3>
                  <div dir="ltr" className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={monthly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <defs>
                          <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#5F8F55" stopOpacity={0.45} />
                            <stop offset="100%" stopColor="#93C572" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E4DCC8" />
                        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6B7A66' }} />
                        <YAxis tickFormatter={(v: number) => fmtMoneyShort(v)} tick={{ fontSize: 11, fill: '#8A9884' }} width={64} />
                        <Tooltip formatter={(value) => fmtMoney(Number(value))} contentStyle={{ borderRadius: 12, borderColor: '#E4DCC8', fontSize: 12 }} />
                        <Area type="monotone" dataKey="total" stroke="#3E6B4A" strokeWidth={2.5} fill="url(#spendFill)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card className="p-4">
                  <h3 className="mb-3 text-sm font-bold text-[#253A2A]">خرید به تفکیک تامین‌کننده</h3>
                  <div dir="ltr" className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={bySupplier} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                          {bySupplier.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => fmtMoney(Number(value))} contentStyle={{ borderRadius: 12, borderColor: '#E4DCC8', fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 12, direction: 'rtl' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </>
      )}

      {/* mark-done confirm dialog */}
      <Modal open={!!doneTarget} onClose={() => setDoneTarget(null)} title="بستن سفارش در حسابداری">
        {doneTarget && (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800">
              یادآوری: اول فایل اکسل سفارش <b>{doneTarget.code}</b> را در Holoo (بخش Buy → Invoice) وارد کنید.
              بعد از بستن، سفارش قابل تغییر نیست.
            </div>
            <div className="text-sm text-[#4A5A44]">
              تامین‌کننده: <b>{doneTarget.supplier?.name ?? '—'}</b> · جمع کل: <b className="tabular-nums">{fmtMoney(doneTarget.total)}</b>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <PrimaryButton className="min-h-[44px] flex-1" onClick={markDone} disabled={closing}>
                {closing ? 'در حال بستن…' : 'بله، در Holoo ثبت شد — بستن سفارش'}
              </PrimaryButton>
              <GhostButton className="min-h-[44px]" onClick={() => setDoneTarget(null)}>لغو</GhostButton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
