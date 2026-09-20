'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/client'
import { faMoney, faNum, formatJalaliShort } from '@/lib/jalali'
import { ORDER_STATUSES, ROLE_LABELS, canAccess } from '@/lib/constants'
import { SectionCard, StatCard, Pill, EmptyState, Avatar, SearchInput } from '@/components/app/ui-bits'
import { BarChart, Donut, RankBars } from '@/components/app/charts'
import type { AppCtx } from '@/components/app/ui-bits'
import { cn } from '@/lib/utils'
import { ClipboardList, Truck, Banknote, ShoppingBasket, ListChecks, MessageCircle, Calculator, Warehouse, Sparkles, TrendingUp, Newspaper, AlertTriangle, BadgePercent, Archive, MapPin, Users } from 'lucide-react'

type Dash = any

export default function DashboardView({ ctx }: { ctx: AppCtx }) {
  const [data, setData] = useState<Dash | null>(null)
  const [err, setErr] = useState('')

  const load = () =>
    api<Dash>('/api/dashboard')
      .then(setData)
      .catch((e) => setErr(e.message))

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [])

  if (err) return <EmptyState emoji="⚠️" title="خطا در بارگذاری داشبورد" hint={err} />
  if (!data) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="glow-card h-28 animate-pulse rounded-2xl bg-card/60" />
        ))}
      </div>
    )
  }

  const k = data.kpi
  const role = ctx.user!.role
  const isManager = ['GM', 'OM', 'OWNER', 'PM'].includes(role)
  const today = new Date().toISOString().slice(0, 10)

  const pipelineData = ['SUBMITTED', 'APPROVED', 'RECEIVING', 'RECEIVED', 'VERIFIED', 'ACCOUNTED', 'DONE'].map((s) => ({
    label: ORDER_STATUSES[s].label,
    value: k.byStatus[s] || 0,
  }))

  return (
    <div className="space-y-5">
      {/* Greeting hero */}
      <section className="hero-emerald gold-glow-border relative overflow-hidden rounded-2xl p-5 sm:p-7">
        {/* pistachio branch ornaments */}
        <svg className="hero-ornament tl" width="150" height="84" viewBox="0 0 150 84" fill="none" stroke="#c9a227" strokeWidth="1.4">
          <path d="M6 62 C28 60 42 44 48 24 C54 44 66 58 88 62 M48 24 C50 36 56 50 68 58" />
          <circle cx="48" cy="21" r="3.5" fill="#c9a227" stroke="none" />
          <ellipse cx="26" cy="58" rx="6" ry="3" transform="rotate(-18 26 58)" opacity="0.8" />
          <ellipse cx="72" cy="56" rx="6" ry="3" transform="rotate(14 72 56)" opacity="0.8" />
          <path d="M100 70 C116 66 126 54 132 40 C136 54 144 62 148 64" opacity="0.6" />
          <circle cx="132" cy="36" r="2.5" fill="#93c572" stroke="none" />
        </svg>
        <svg className="hero-ornament br" width="150" height="84" viewBox="0 0 150 84" fill="none" stroke="#c9a227" strokeWidth="1.4">
          <path d="M6 62 C28 60 42 44 48 24 C54 44 66 58 88 62 M48 24 C50 36 56 50 68 58" />
          <circle cx="48" cy="21" r="3.5" fill="#c9a227" stroke="none" />
          <ellipse cx="26" cy="58" rx="6" ry="3" transform="rotate(-18 26 58)" opacity="0.8" />
          <ellipse cx="72" cy="56" rx="6" ry="3" transform="rotate(14 72 56)" opacity="0.8" />
          <path d="M100 70 C116 66 126 54 132 40 C136 54 144 62 148 64" opacity="0.6" />
          <circle cx="132" cy="36" r="2.5" fill="#93c572" stroke="none" />
        </svg>
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-[#93c572]">{new Intl.DateTimeFormat('fa-IR', { dateStyle: 'full' }).format(new Date())}</p>
            <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">
              سلام {ctx.user!.name.split(' ')[0]} عزیز 👋
            </h2>
            <p className="mt-1.5 max-w-lg text-xs leading-5 text-[#cfe3d4]">
              {k.myOpenTasks > 0
                ? `${faNum(k.myOpenTasks)} وظیفه باز دارید و ${faNum(k.todayDeliveries)} مرسوله امروز به فروشگاه می‌رسد. با هم پیش می‌رویم! 🌿`
                : 'امروز وظیفه‌ای بر عهده شما نیست — وقت خوبی برای ایده‌های تازه است ✨'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {isManager && (
              <button
                onClick={() => ctx.navigate('briefing')}
                className="flex items-center gap-2 rounded-2xl border border-[#c9a227]/50 bg-[#c9a227]/15 px-4 py-3 text-right backdrop-blur transition hover:bg-[#c9a227]/25"
              >
                <span className="text-2xl">🌅</span>
                <span>
                  <span className="block text-xs font-black text-white">صبح‌نامه امروز</span>
                  <span className="block text-[9px] text-[#93c572]">گزارش چاپی جلسه صبح</span>
                </span>
              </button>
            )}
            <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
              <Sparkles className="text-[#c9a227]" size={20} />
              <div>
                <p className="text-xs font-black leading-5 text-white">{faNum(ctx.user!.points)}</p>
                <p className="block text-[9px] text-[#93c572]">امتیاز شما — آفرین!</p>
              </div>
            </div>
          </div>
        </div>
        <div className="shimmer-line absolute bottom-0 right-0 h-1 w-full" />
      </section>

      {/* KPI row — role aware */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="سفارش‌های فعال" value={k.ordersTotal - (k.byStatus['DONE'] || 0) - (k.byStatus['CANCELLED'] || 0)} hint="در جریان در چرخه تأمین" tone="emerald" icon={<ClipboardList size={20} />} onClick={() => ctx.navigate('orders')} />
        {k.overdueCount > 0 ? (
          <StatCard label="سفارش سرآمده ⚠️" value={k.overdueCount} hint="تحویل با تأخیر — فالوآپ" tone="rose" icon={<Truck size={20} />} onClick={() => ctx.navigate('orders')} />
        ) : (
          <StatCard label="مرسوله‌های امروز" value={k.todayDeliveries} hint="برای دریافت امروز" tone="olive" icon={<Truck size={20} />} onClick={() => ctx.navigate('receiving')} />
        )}
        <StatCard label="کالاهای کم‌موجودی" value={k.lowStockCount} hint={`${faNum(k.outOfStockCount)} قلم ناموجود`} tone={k.lowStockCount > 0 ? 'gold' : 'emerald'} icon={<ShoppingBasket size={20} />} onClick={() => ctx.navigate('products')} />
        <StatCard label="چک‌های در انتظار" value={k.pendingCheques} hint={`${faMoney(k.pendingChequesAmount)} تومان — ${faNum(k.signedCheques)} چک آماده تحویل`} tone="terra" icon={<Banknote size={20} />} onClick={() => ctx.navigate('cheques')} />
      </div>

      {/* Archive quick-search — find a supplier's entire document trail + physical location in one second */}
      {canAccess('archive', role, ctx.user!.secondaryRoles) && <ArchiveQuickSearch ctx={ctx} />}

      {/* Role-specific quick queues */}
      {canAccess('pricecheck', role, ctx.user!.secondaryRoles) && k.priceCheckRemaining > 0 && (
        <SectionCard
          title="کنترل قیمت امروز ⏳"
          subtitle={`قیمت چاپ‌شده ${faNum(k.priceCheckRemaining)} کالا هنوز امروز تأیید نشده — پاسخ سریع به تورم روزانه`}
          icon={<BadgePercent size={18} />}
        >
          <button
            onClick={() => ctx.navigate('pricecheck')}
            className={cn('w-full rounded-xl bg-gradient-to-l p-3 text-right transition', k.priceCheckRed > 0 ? 'from-[#b3372f]/15 to-transparent hover:from-[#b3372f]/25' : 'from-[#c9a227]/15 to-transparent hover:from-[#c9a227]/25')}
          >
            {k.priceCheckRed > 0 ? (
              <span className="text-sm font-extrabold text-[#b3372f]">{faNum(k.priceCheckRed)} کالا حاشیه بحرانی زیر ۱۰٪ دارد — بازکردن تابلوی کنترل قیمت</span>
            ) : (
              <span className="text-sm font-extrabold text-[#8a6d10]">{faNum(k.priceCheckRemaining)} کالا مانده امروز — بازکردن تابلوی کنترل قیمت</span>
            )}
          </button>
        </SectionCard>
      )}

      {['ACC', 'OM', 'OWNER'].includes(role) && k.toAccountCount > 0 && (
        <SectionCard title="در انتظار ثبت در هلو" subtitle="سفارش‌های تأییدشده انبار که باید وارد نرم‌افزار حسابداری شوند" icon={<Calculator size={18} />}>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.toAccount.map((o: any) => (
              <button key={o.id} onClick={() => ctx.navigate('accounting', o.id)} className="glow-card flex items-center justify-between rounded-xl bg-card p-3 text-right">
                <span>
                  <span className="block text-sm font-extrabold">{o.code}</span>
                  <span className="text-xs text-muted-foreground">{o.providerName}</span>
                </span>
                <span className="text-sm font-black text-[#8a6d10]">{faMoney(o.totalAmount)}</span>
              </button>
            ))}
          </div>
        </SectionCard>
      )}

      {['SK', 'OM', 'GM'].includes(role) && k.toVerifyCount > 0 && (
        <SectionCard title="در انتظار تأیید انبار" subtitle="مرسوله‌های دریافتی که سرپرست انبار باید تأیید کند" icon={<Warehouse size={18} />}>
          <button onClick={() => ctx.navigate('verify')} className="w-full rounded-xl bg-gradient-to-l from-[#77934a]/15 to-transparent p-3 text-right transition hover:from-[#77934a]/25">
            <span className="text-sm font-extrabold text-[#5c7236]">{faNum(k.toVerifyCount)} سفارش آماده بررسی — بازکردن بخش تأیید انبار</span>
          </button>
        </SectionCard>
      )}

      {k.cashierQueue > 0 && ['HC', 'CASHIER', 'GM'].includes(role) && (
        <SectionCard title="صف پیش‌فاکتورهای فروش" subtitle="فروشندگان برای مشتریان سفارش ثبت کرده‌اند — آماده پردازش صندوق" icon={<MessageCircle size={18} />}>
          <button onClick={() => ctx.navigate('sales')} className="w-full rounded-xl bg-gradient-to-l from-[#c9a227]/15 to-transparent p-3 text-right transition hover:from-[#c9a227]/25">
            <span className="text-sm font-extrabold text-[#8a6d10]">{faNum(k.cashierQueue)} پیش‌فاکتور در صف — بازکردن بخش فروش</span>
          </button>
        </SectionCard>
      )}

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="گردش سفارش‌ها" subtitle="وضعیت همه سفارش‌ها در یک نگاه" icon={<TrendingUp size={18} />} className="lg:col-span-2">
          <Donut data={pipelineData} centerLabel="کل سفارش‌ها" centerValue={faNum(k.ordersTotal)} size={160} />
        </SectionCard>

        <SectionCard title="جدول امتیاز تیم 🏆" subtitle="قدردانی مدیران از تلاش همکاران" icon={<Sparkles size={18} />}>
          <RankBars data={data.leaderboard.map((l: any) => ({ label: l.name, value: l.points, color: l.color }))} formatValue={(v) => faNum(v)} />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="سفارش‌های ۲ هفته اخیر" subtitle="روند روزانه ثبت سفارش" icon={<ClipboardList size={18} />}>
          <BarChart
            data={data.series.map((s: any) => ({ label: formatJalaliShort(s.day).slice(5), value: s.count }))}
            formatLabel={(l) => l}
            height={150}
          />
        </SectionCard>
        <SectionCard title="سررسید چک‌ها (۸ هفته آینده)" subtitle="برنامه مالی هفتگی — مبلغ تومان" icon={<Banknote size={18} />}>
          <BarChart
            data={data.chequeSeries.map((s: any) => ({ label: formatJalaliShort(s.week).slice(5), value: s.amount }))}
            color="#c9a227"
            height={150}
            formatValue={(v) => `${faMoney(v)} تومان`}
          />
        </SectionCard>
      </div>

      {/* Expiring items — recorded at receiving */}
      {['GM', 'OM', 'SK', 'ACC', 'HC'].includes(role) && data.expiring?.length > 0 && (
        <SectionCard
          title="نزدیک به انقضا ⏳"
          subtitle="اقلامی که در دریافت، تاریخ انقضایشان ثبت شده و تا ۱۴ روز آینده تمام می‌شود — جلوتر از قفسه بفروشید یا تخفیف بزنید"
          icon={<AlertTriangle size={18} />}
          className="border-[#c96f4a]/40"
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {data.expiring.map((e: any) => (
              <div key={e.id} className={`rounded-xl border p-3 ${e.daysLeft <= 3 ? 'border-[#b3372f]/40 bg-[#fee2e2]/50' : e.daysLeft <= 7 ? 'border-[#a16207]/40 bg-[#fef9c3]/50' : 'border-border bg-white/70'}`}>
                <p className="line-clamp-2 text-xs font-extrabold">{e.productName}</p>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{faNum(e.qty)} قلم</span>
                  <span className={`text-[11px] font-black ${e.daysLeft <= 3 ? 'text-[#b3372f]' : e.daysLeft <= 7 ? 'text-[#a16207]' : 'text-[#0e7a4a]'}`}>
                    {e.daysLeft < 0 ? 'منقضی شده!' : `${faNum(e.daysLeft)} روز مانده`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Lists row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="وظایف من" subtitle="امروز چه کاری دارم؟" icon={<ListChecks size={18} />}>
          {data.myTasks.length === 0 ? (
            <EmptyState emoji="🌤️" title="فعلاً وظیفه‌ای ندارید" hint="وقت خوبی برای یادگیری بخش راهنماست" />
          ) : (
            <ul className="space-y-2">
              {data.myTasks.map((t: any) => (
                <li key={t.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-white/60 p-3">
                  <span className="text-xs font-bold">{t.title}</span>
                  <Pill label={t.priority === 'URGENT' ? 'فوری' : t.priority === 'HIGH' ? 'مهم' : 'معمولی'} color={t.priority === 'URGENT' ? '#b3372f' : t.priority === 'HIGH' ? '#a16207' : '#166534'} />
                </li>
              ))}
            </ul>
          )}
          <button onClick={() => ctx.navigate('tasks')} className="mt-3 w-full rounded-xl bg-secondary py-2 text-xs font-extrabold text-secondary-foreground transition hover:bg-[#dcead4]">
            همه وظایف →
          </button>
        </SectionCard>

        <SectionCard title="دیجیتال‌وال" subtitle="آخرین خبرهای تیم" icon={<Newspaper size={18} />}>
          <ul className="space-y-2">
            {data.wall.map((w: any) => (
              <li key={w.id} className="rounded-xl border border-border/60 bg-white/60 p-3">
                <p className="text-xs font-extrabold">{w.pinned ? '📌 ' : ''}{w.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{w.content}</p>
                <p className="mt-1 text-[10px] font-bold text-primary">{w.authorName}</p>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="پرتقاضاترین درخواست‌های مشتری" subtitle="کالاهایی که مشتری دنبالش بود و نداشتیم" icon={<MessageCircle size={18} />}>
          {data.customerReqs.length === 0 ? (
            <EmptyState emoji="🛒" title="درخواستی ثبت نشده" />
          ) : (
            <ul className="space-y-2">
              {data.customerReqs.map((r: any) => (
                <li key={r.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-white/60 p-3">
                  <span className="text-xs font-bold">{r.productName}</span>
                  <span className="rounded-full bg-[#b3372f]/10 px-2 py-0.5 text-[11px] font-black text-[#b3372f]">{faNum(r.count)} بار</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Activity feed for managers */}
      {isManager && (
        <SectionCard title="تازه‌ترین فعالیت تیم" subtitle="شفافیت کامل — هر اقدامی ثبت می‌شود" icon={<TrendingUp size={18} />}>
          <ul className="scroll-gold max-h-72 space-y-1.5 overflow-y-auto pl-1">
            {data.activities.map((a: any) => (
              <li key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60">
                <Avatar name={a.userName} color="#5c7236" size={26} />
                <span className="text-xs"><b>{a.userName}</b> — {a.action}</span>
                <span className="mr-auto text-[10px] text-muted-foreground">{formatJalaliShort(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  )
}

/** آرشیو اسناد — جست‌وجوی فوری طرف حساب: مسیر فیزیکی سند در یک ثانیه */
function ArchiveQuickSearch({ ctx }: { ctx: AppCtx }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<{ docs: any[]; parties: any[]; binderMap: Map<string, { cabinet: string; shelf: string }>; binders: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const run = (query: string) => {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    return api<any>(`/api/archive?${params}`)
      .then((d) =>
        setRes({
          docs: d.docs || [],
          parties: d.parties || [],
          binderMap: new Map((d.binders || []).map((b: any) => [b.id, { cabinet: b.cabinet, shelf: b.shelf }])),
          binders: d.stats?.binders || 0,
        }),
      )
      .catch(() => { /* widget is non-critical — stay silent */ })
  }

  useEffect(() => { run('') }, [])
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const onType = (v: string) => {
    setQ(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => run(v.trim()), 300)
  }

  const hasQuery = q.trim().length > 0
  const docResults = hasQuery && res ? res.docs.slice(0, 5) : []
  const partyChips = res ? res.parties.slice(0, 3) : []

  return (
    <SectionCard
      title="آرشیو اسناد — جست‌وجوی فوری طرف حساب"
      subtitle={`${faNum(res?.binders ?? 0)} زونکن موضوعی فعال — بایگانی هیبریدی دیجیتال ↔ فیزیکی (ISO 15489)`}
      icon={<Archive size={18} />}
      actions={
        <button onClick={() => ctx.navigate('archive')} className="min-h-[44px] rounded-xl border border-[#c9a227]/50 bg-[#fdf6dd]/60 px-3 py-2 text-[11px] font-extrabold text-[#8a5a2b]">
          بازکردن آرشیو کامل
        </button>
      }
    >
      <SearchInput value={q} onChange={onType} placeholder="نام تأمین‌کننده، پخش یا شماره سند/فاکتور…" />

      {!hasQuery && (
        <div>
          <p className="mt-3 rounded-xl bg-[#fdf6dd]/70 p-3 text-[11px] font-bold leading-relaxed text-[#8a5a2b]">
            نام تأمین‌کننده یا شماره سند را بزنید — مسیر فیزیکی سند در یک ثانیه (کابینت › طبقه › زونکن › جایگاه).
          </p>
          {partyChips.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-[10px] font-black text-muted-foreground"><Users size={12} /> پرتکرارترین طرف‌حساب‌ها:</span>
              {partyChips.map((p: any) => (
                <button
                  key={p.party}
                  onClick={() => ctx.navigate('archive')}
                  className="min-h-[44px] rounded-xl bg-[#0e7a4a]/10 px-3 py-2 text-[11px] font-black text-[#0e7a4a] transition hover:bg-[#0e7a4a]/20"
                >
                  {p.party} · {faNum(p.docCount)} سند
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {hasQuery && docResults.length === 0 && (
        <p className="mt-3 rounded-xl bg-card p-3 text-[11px] font-bold text-muted-foreground">سندی با این عبارت یافت نشد — بخشی از نام طرف حساب یا شماره فاکتور را امتحان کنید.</p>
      )}

      {docResults.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] font-black text-muted-foreground">اسناد یافت‌شده — برای مشاهدهٔ پروندهٔ کامل، آرشیو را باز کنید:</p>
          {docResults.map((d: any) => {
            const b = res?.binderMap.get(d.binderId)
            return (
              <button
                key={d.id}
                onClick={() => ctx.navigate('archive')}
                className="glow-card flex w-full items-center justify-between gap-3 rounded-xl bg-white/80 p-3 text-right min-h-[44px] transition hover:shadow-md"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 truncate text-xs font-black">
                    🗂 {d.title}
                    <span className="shrink-0 rounded-md bg-[#c9a227]/15 px-1.5 py-0.5 text-[9px] font-black text-[#8a5a2b]" dir="ltr">{d.code}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                    {d.party}{d.invoiceNo ? ` • فاکتور ${d.invoiceNo}` : ''}{d.amount > 0 ? ` • ${faMoney(d.amount)} تومان` : ''}
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-[10px] font-black text-[#0e7a4a]">
                    <MapPin size={11} /> کابینت {faNum(b?.cabinet ?? '؟')} › طبقهٔ {faNum(b?.shelf ?? '؟')} › زونکن {d.binderCode} › جایگاه {faNum(d.seq)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}
