'use client'
import * as React from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { BarChart3, Clock, Target, Wallet, AlertTriangle, TrendingUp, Users, Receipt } from 'lucide-react'
import { api } from '@/lib/api'
import type { PUser } from '@/lib/types'
import { hasRole } from '@/lib/types'
import { fmtMoney, fmtMoneyShort, toFaDigits, JALALI_MONTHS } from '@/lib/jalali'
import { Card, SectionHeader, StatCard, Badge, EmptyState, Loading, TableWrap, Th, Td, Avatar } from './kit'

interface ReportsData {
  delivery: { avgReceiveLagH: number; avgConfirmLagH: number; onTimePct: number; receivedCount: number }
  supplierScorecard: { name: string; orders: number; spend: number; missing: number; rejected: number; lines: number; issueRate: number }[]
  monthlySpend: { month: string; total: number }[]
  staffActivity: { id: number; name: string; color: string; actions: number; points: number }[]
  marginTop: { id: number; name: string; nameFa: string | null; supplier: string; buyPrice: number; sellPrice: number; marginPct: number; stock: number; minStock: number }[]
  marginRisk: { id: number; name: string; marginPct: number }[]
  funnel: { status: string; count: number }[]
  financial: { totalSpend30d: number; estVat30d: number; openCommitments: number; ordersDone: number }
  salesMargin: {
    revenue30d: number
    marginPct: number
    marginValue: number
    unknownPct: number
    productsCounted: number
    top: { id: number; name: string; nameFa: string | null; qty: number; revenue: number; marginPct: number }[]
    risk: { id: number; name: string; nameFa: string | null; qty: number; revenue: number; marginPct: number }[]
  }
}

const FUNNEL_LABELS: Record<string, string> = {
  DRAFT: 'پیش‌نویس', SUBMITTED: 'در انتظار تایید', APPROVED: 'تایید شده',
  RECEIVED: 'تحویل شده', CONFIRMED: 'تایید انبار', DONE: 'بسته شده',
}
const FUNNEL_COLORS: Record<string, string> = {
  DRAFT: '#A8A28C', SUBMITTED: '#D97706', APPROVED: '#0F766E',
  RECEIVED: '#0891B2', CONFIRMED: '#7C3AED', DONE: '#16A34A',
}

function marginCls(pct: number) {
  if (pct >= 25) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (pct >= 10) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-red-50 text-red-600 border-red-200'
}

/** '2026-09' -> 'مهر ۱۴۰۵' (approximate Gregorian->Jalali month mapping by mid-month day) */
function monthLabel(key: string): string {
  const [gy, gm] = key.split('-').map(Number)
  const mid = new Date(gy, gm - 1, 15)
  // Approximate Jalali month from Gregorian mid-month day of year
  const startJalaliMonthGregorian = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2] // Farvardin starts ~Mar 21
  const d = mid
  // find jalali month index: month of (d - 21 days)
  const shifted = new Date(d)
  shifted.setDate(shifted.getDate() - 20)
  const jm = (startJalaliMonthGregorian.indexOf(shifted.getMonth()) + 12) % 12
  const jy = shifted.getMonth() >= 2 ? shifted.getFullYear() - 621 : shifted.getFullYear() - 622
  return `${JALALI_MONTHS[jm]} ${toFaDigits(jy)}`
}

export default function ReportsSection({ user }: { user: PUser }) {
  const [data, setData] = React.useState<ReportsData | null>(null)
  const [err, setErr] = React.useState('')

  React.useEffect(() => {
    api.get<ReportsData>('/api/reports').then(setData).catch((e) => setErr(e.message))
  }, [])

  if (err) return <EmptyState title="خطا در دریافت گزارش‌ها" hint={err} />
  if (!data) return <Loading label="در حال محاسبه گزارش‌ها…" />

  const { delivery, financial } = data
  const canSeeFinancial = hasRole(user, 'GENERAL_MANAGER') || hasRole(user, 'OWNER') || hasRole(user, 'OPERATION_MANAGER') || hasRole(user, 'IT_ADMIN')

  return (
    <div>
      <SectionHeader
        title="گزارش‌ها و تحلیل | Reports & Analytics"
        subtitle="تصویر کامل عملکرد عملیات، تامین‌کنندگان و سودآوری"
        icon={<BarChart3 size={22} />}
      />

      {/* KPI cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="خرید ۳۰ روز گذشته" sub={`${toFaDigits(financial.ordersDone)} سفارش بسته‌شده`} tone="gold" value={fmtMoneyShort(financial.totalSpend30d)} icon={<Wallet size={20} />} />
        <StatCard label="میانگین تاخیر تحویل" sub="از ثبت تا دریافت" tone="olive" value={`${toFaDigits(String(delivery.avgReceiveLagH))} ساعت`} icon={<Clock size={20} />} />
        <StatCard label="تحویل به‌موقع" sub={`${toFaDigits(delivery.receivedCount)} سفارش دریافت‌شده`} tone={delivery.onTimePct >= 80 ? 'olive' : 'rose'} value={`${toFaDigits(delivery.onTimePct)}٪`} icon={<Target size={20} />} />
        <StatCard label="تعهدات باز" sub="سفارش‌های در جریان" tone="sky" value={fmtMoneyShort(financial.openCommitments)} icon={<AlertTriangle size={20} />} />
      </div>

      {canSeeFinancial && (
        <div className="mb-5 grid gap-4 lg:grid-cols-2">
          {/* Monthly spend */}
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#253A2A]"><TrendingUp size={16} className="text-[#B8860B]" /> روند خرید ماهانه (سفارش‌های بسته‌شده)</h3>
            <div className="h-56" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthlySpend.map((m) => ({ ...m, label: monthLabel(m.month) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EFEAD8" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B7A66' }} />
                  <YAxis tickFormatter={(v) => fmtMoneyShort(Number(v)).replace(' ت', '')} tick={{ fontSize: 10, fill: '#8A9884' }} width={48} />
                  <Tooltip formatter={(v) => [fmtMoney(Number(v)), 'مبلغ']} contentStyle={{ borderRadius: 12, border: '1px solid #E4DCC8', fontSize: 12 }} />
                  <Bar dataKey="total" fill="#B8860B" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Funnel */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-bold text-[#253A2A]">قیف سفارش‌ها | Order pipeline</h3>
            <div className="space-y-2.5">
              {data.funnel.map((f) => {
                const max = Math.max(...data.funnel.map((x) => x.count), 1)
                return (
                  <div key={f.status} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs font-semibold text-[#4A5A44]">{FUNNEL_LABELS[f.status]}</span>
                    <div className="h-6 flex-1 overflow-hidden rounded-lg bg-[#F5F2E8]">
                      <div className="flex h-full items-center justify-end rounded-lg px-2 text-[10px] font-bold text-white transition-all" style={{ width: `${Math.max((f.count / max) * 100, f.count > 0 ? 12 : 0)}%`, background: FUNNEL_COLORS[f.status] }}>
                        {f.count > 0 && toFaDigits(f.count)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Supplier scorecard */}
      <Card className="mb-5 p-4">
        <h3 className="mb-3 text-sm font-bold text-[#253A2A]">کارنامه تأمین‌کنندگان | Supplier scorecard</h3>
        <TableWrap>
          <thead>
            <tr>
              <Th>تأمین‌کننده</Th>
              <Th>سفارش‌ها</Th>
              <Th>مجموع خرید</Th>
              <Th>اقلام ناقص/مردود</Th>
              <Th>نرخ مغایرت</Th>
            </tr>
          </thead>
          <tbody>
            {data.supplierScorecard.map((s) => (
              <tr key={s.name} className="transition hover:bg-[#FBF9F3]">
                <Td className="font-bold">{s.name}</Td>
                <Td>{toFaDigits(s.orders)}</Td>
                <Td>{fmtMoney(s.spend)}</Td>
                <Td>{s.missing + s.rejected > 0 ? `${toFaDigits(s.missing)} ناقص / ${toFaDigits(s.rejected)} مردود` : <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">بدون مغایرت ✓</Badge>}</Td>
                <Td>
                  <Badge className={s.issueRate === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : s.issueRate <= 20 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-red-200 bg-red-50 text-red-600'}>
                    {toFaDigits(String(s.issueRate))}٪
                  </Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        {/* Margin top */}
        <Card className="p-4">
          <h3 className="mb-1 text-sm font-bold text-[#253A2A]">بالاترین حاشیه سود | Top margins</h3>
          <p className="mb-3 text-[11px] text-[#8A9884]">همان منطق اکسل خانم درویشی: سبز ≥۲۵٪، زرد ≥۱۰٪، قرمز &lt;۱۰٪</p>
          <div className="pz-scroll max-h-80 space-y-2 overflow-y-auto pl-1">
            {data.marginTop.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-xl border border-[#EFEAD8] bg-white px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-[#253A2A]">{m.nameFa || m.name}</div>
                  <div className="text-[10px] text-[#8A9884]">{m.supplier} · فروش {fmtMoney(m.sellPrice)}</div>
                </div>
                <Badge className={marginCls(m.marginPct)}>{toFaDigits(String(m.marginPct))}٪</Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Margin risk */}
        <Card className="p-4">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-[#253A2A]"><AlertTriangle size={15} className="text-red-500" /> حاشیه سود پرخطر (زیر ۱۰٪)</h3>
          <p className="mb-3 text-[11px] text-[#8A9884]">این کالاها نزدیک به ضرر هستند — قیمت فروش را بازبینی کنید</p>
          {data.marginRisk.length === 0 ? (
            <EmptyState title="هیچ کالایی در محدوده پرخطر نیست 🎉" hint="همه حاشیه‌های سود بالای ۱۰٪ است" />
          ) : (
            <div className="space-y-2">
              {data.marginRisk.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 rounded-xl border border-red-100 bg-red-50/50 px-3 py-2">
                  <div className="truncate text-xs font-bold text-[#253A2A]">{m.name}</div>
                  <Badge className={marginCls(m.marginPct)}>{toFaDigits(String(m.marginPct))}٪</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Sales margin (register sales × Product.buyPrice) */}
      {canSeeFinancial && (
        <Card className="mb-5 p-4">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-[#253A2A]"><Receipt size={16} className="text-[#3E6B4A]" /> حاشیه سود فروش واقعی (۳۰ روز) | Sales margin</h3>
          <p className="mb-3 text-[11px] text-[#8A9884]">
            فروش‌های ثبت‌شده (صندوق، پیش‌فروش و ورود هولو) × قیمت خرید کالا — محاسبه بر اساس کالاهای دارای قیمت خرید
          </p>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-[#EFEAD8] bg-[#FBF9F3] px-3 py-2.5">
              <div className="text-[10px] font-semibold text-[#8A9884]">فروش کل (۳۰ روز)</div>
              <div className="mt-0.5 text-base font-extrabold tabular-nums text-[#253A2A]">{fmtMoney(data.salesMargin.revenue30d)}</div>
            </div>
            <div className="rounded-xl border border-[#EFEAD8] bg-[#FBF9F3] px-3 py-2.5">
              <div className="text-[10px] font-semibold text-[#8A9884]">سود ناخالص برآوردی</div>
              <div className="mt-0.5 text-base font-extrabold tabular-nums text-[#8A6508]">{fmtMoney(data.salesMargin.marginValue)}</div>
            </div>
            <div className="rounded-xl border border-[#EFEAD8] bg-[#FBF9F3] px-3 py-2.5">
              <div className="text-[10px] font-semibold text-[#8A9884]">حاشیه سود</div>
              <div className="mt-0.5"><Badge className={`text-sm font-extrabold ${marginCls(data.salesMargin.marginPct)}`}>{toFaDigits(String(data.salesMargin.marginPct))}٪</Badge></div>
            </div>
            <div className="rounded-xl border border-[#EFEAD8] bg-[#FBF9F3] px-3 py-2.5">
              <div className="text-[10px] font-semibold text-[#8A9884]">بدون مبنای هزینه</div>
              <div className="mt-0.5 text-base font-extrabold tabular-nums text-[#6B7A66]">{toFaDigits(String(data.salesMargin.unknownPct))}٪</div>
            </div>
          </div>
          {data.salesMargin.top.length === 0 ? (
            <EmptyState title="فروش ثبت‌شده‌ای برای تحلیل نیست" hint="بعد از ثبت فروش (صندوق یا ورود هولو) این بخش فعال می‌شود." />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>کالا</Th>
                  <Th>تعداد فروش</Th>
                  <Th>فروش</Th>
                  <Th>حاشیه سود</Th>
                </tr>
              </thead>
              <tbody>
                {data.salesMargin.top.map((m) => (
                  <tr key={m.id} className="transition hover:bg-[#FBF9F3]">
                    <Td className="font-bold">{m.nameFa || m.name}</Td>
                    <Td>{toFaDigits(m.qty)}</Td>
                    <Td className="tabular-nums">{fmtMoney(m.revenue)}</Td>
                    <Td><Badge className={marginCls(m.marginPct)}>{toFaDigits(String(m.marginPct))}٪</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          {data.salesMargin.risk.length > 0 && (
            <div className="mt-3 rounded-xl border border-red-100 bg-red-50/60 p-3">
              <div className="mb-2 text-xs font-bold text-red-700">⚠ پرفروش‌های کم‌حاشیه (زیر ۱۰٪):</div>
              <div className="flex flex-wrap gap-1.5">
                {data.salesMargin.risk.map((r) => (
                  <span key={r.id} className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-[11px] font-bold text-red-600">
                    {r.nameFa || r.name} — {toFaDigits(String(r.marginPct))}٪
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Staff activity */}
      <Card className="p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#253A2A]"><Users size={15} /> فعالیت تیم در ۳۰ روز گذشته (بر اساس ثبت‌های سامانه)</h3>
        {data.staffActivity.length === 0 ? (
          <EmptyState title="فعالیتی ثبت نشده" />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.staffActivity.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border border-[#EFEAD8] bg-white px-3 py-2">
                <span className="w-5 text-center text-xs font-bold text-[#B8860B]">{toFaDigits(i + 1)}</span>
                <Avatar name={s.name} color={s.color} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-[#253A2A]">{s.name}</div>
                  <div className="text-[10px] text-[#8A9884]">⭐ {toFaDigits(s.points)} امتیاز کل</div>
                </div>
                <Badge className="border-[#D8E2D0] bg-[#F3F7EF] text-[#3E6B4A]">{toFaDigits(s.actions)} اقدام</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
