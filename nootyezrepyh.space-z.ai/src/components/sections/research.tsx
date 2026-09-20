'use client'

import * as React from 'react'
import type { ClientUser } from '@/lib/api-client'
import { toFaDigits } from '@/lib/jalali'
import { cn } from '@/lib/utils'
import {
  GlowCard, SectionHeader, EmptyState, OrnamentDivider, PatternBackground,
} from '@/components/zeytoon-ui'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  RESEARCH_ENTRIES, RESEARCH_CATEGORIES, categoryIcon, PAIN_MATRIX, ROADMAP,
  type ResearchEntry, type PainMatrixRow, type RoadmapStatus,
} from '@/lib/research-knowledge'
import {
  Search, ChevronDown, AlertTriangle, Leaf, CheckCircle2, Loader2, Clock,
  BookOpen, Target, Map, FlaskConical, Phone, UserRound, ClipboardCheck,
  type LucideIcon,
} from 'lucide-react'

/* ---------- meta maps ---------- */

const STRENGTH_META: Record<ResearchEntry['strength'], { label: string; cls: string }> = {
  meta: { label: 'متاآنالیز', cls: 'border-primary/40 bg-primary/10 text-primary' },
  journal: { label: 'مجله علمی', cls: 'border-olive/40 bg-olive/10 text-olive dark:text-lime-300' },
  study: { label: 'مطالعه کاربردی', cls: 'border-border bg-muted text-muted-foreground' },
}

const STATUS_META: Record<RoadmapStatus, { label: string; icon: LucideIcon; dotCls: string; iconCls: string }> = {
  SHIPPED: {
    label: 'در زیتون فعال است',
    icon: CheckCircle2,
    dotCls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    iconCls: 'text-emerald-600 dark:text-emerald-400',
  },
  IN_PROGRESS: {
    label: 'در حال ساختن',
    icon: Loader2,
    dotCls: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
    iconCls: 'text-amber-600 dark:text-amber-400',
  },
  PLANNED: {
    label: 'برنامه‌ریزی شده',
    icon: Clock,
    dotCls: 'border-border bg-muted text-muted-foreground',
    iconCls: 'text-muted-foreground',
  },
}

const TESTER_POINTS = [
  'اجرای آزمایشی ۲ هفته‌ای، کنار کار روزمره و بدون قطعی',
  'سنجش قبل/بعد: زمان ثبت سفارش، خطای دریافت، ضایعات و رضایت تیم',
  'داده‌ها کاملاً مال شماست — خروجی‌برداری در هر لحظه ممکن است',
  'بدون هزینه سخت‌افزار؛ موبایل فعلی همکاران کافی است',
  'سازگار با هلو و سبزا — جایگزین حسابداری نمی‌شویم، تغذیه‌اش می‌کنیم',
]

/* ---------- main section ---------- */

export function ResearchSection({ user }: { user: ClientUser }) {
  return (
    <section aria-label="علم پشت زیتون" className="mx-auto max-w-6xl space-y-5">
      <SectionHeader
        title="علم پشت زیتون"
        subtitle="هر تصمیمِ این پلتفرم، پشتش یک پژوهش علمی است — از مجلات معتبر مدیریت عملیات تا مطالعات بومی ایران."
      />

      <Tabs defaultValue="library" className="gap-4">
        <TabsList className="h-11 w-full rounded-xl border border-gold/25 bg-card p-1 shadow-sm sm:w-auto sm:self-start">
          <TabsTrigger
            value="library"
            className="h-full gap-1.5 rounded-lg px-2 text-xs data-[state=active]:bg-primary/10 data-[state=active]:shadow-sm sm:px-4 sm:text-sm"
          >
            <BookOpen className="size-4" aria-hidden /> کتابخانه پژوهش
          </TabsTrigger>
          <TabsTrigger
            value="why"
            className="h-full gap-1.5 rounded-lg px-2 text-xs data-[state=active]:bg-primary/10 data-[state=active]:shadow-sm sm:px-4 sm:text-sm"
          >
            <Target className="size-4" aria-hidden /> چرا زیتون؟
          </TabsTrigger>
          <TabsTrigger
            value="roadmap"
            className="h-full gap-1.5 rounded-lg px-2 text-xs data-[state=active]:bg-primary/10 data-[state=active]:shadow-sm sm:px-4 sm:text-sm"
          >
            <Map className="size-4" aria-hidden /> نقشه راه علمی
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-2">
          <LibraryTab />
        </TabsContent>
        <TabsContent value="why" className="mt-2">
          <WhyTab userName={user.name} />
        </TabsContent>
        <TabsContent value="roadmap" className="mt-2">
          <RoadmapTab />
        </TabsContent>
      </Tabs>

      <p className="text-center text-[11px] text-muted-foreground">
        نسخهٔ مجموعهٔ پژوهشی ۱٫۰ • منابع علمی به زبان اصلی حفظ شده‌اند • گردآوری: تیم زیتون
      </p>
    </section>
  )
}

/* ---------- tab 1: library ---------- */

function LibraryTab() {
  const [cat, setCat] = React.useState<string>('all')
  const [query, setQuery] = React.useState('')
  const [openIds, setOpenIds] = React.useState<Set<string>>(() => new Set())

  const q = query.trim()

  const filtered = React.useMemo(() => {
    return RESEARCH_ENTRIES.filter((e) => {
      if (cat !== 'all' && e.category !== cat) return false
      if (!q) return true
      const haystack = [
        e.titleFa, e.findingFa, e.painFa, e.zeytoonFa, e.evidence, e.evidenceFa, e.source, e.category,
        e.features.join(' '),
      ]
      return haystack.some((t) => t.includes(q))
    })
  }, [cat, q])

  const countOf = (name: string) =>
    name === 'all' ? RESEARCH_ENTRIES.length : RESEARCH_ENTRIES.filter((e) => e.category === name).length

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* search */}
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جستجو در پژوهش‌ها، آمارها و ماژول‌ها…"
          className="h-11 ps-9"
          aria-label="جستجو در کتابخانهٔ پژوهش"
        />
      </div>

      {/* category chips — horizontal scroll on mobile */}
      <div role="group" aria-label="فیلتر دسته‌بندی پژوهش‌ها" className="flex gap-2 overflow-x-auto pb-1">
        <CategoryChip
          active={cat === 'all'}
          onClick={() => setCat('all')}
          label={`همه (${toFaDigits(countOf('all'))})`}
        />
        {RESEARCH_CATEGORIES.map((c) => (
          <CategoryChip
            key={c.name}
            active={cat === c.name}
            onClick={() => setCat(c.name)}
            label={`${c.icon} ${c.name} (${toFaDigits(countOf(c.name))})`}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="size-10 text-primary/60" />}
          title="چیزی پیدا نشد"
          description="عبارت دیگری را جستجو کنید یا فیلتر دسته را بردارید."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((entry, i) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              index={i}
              open={openIds.has(entry.id)}
              onToggle={() => toggle(entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CategoryChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-10 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'border-border bg-card text-muted-foreground hover:border-gold/50 hover:text-foreground',
      )}
    >
      {label}
    </button>
  )
}

function EntryCard({ entry, index, open, onToggle }: { entry: ResearchEntry; index: number; open: boolean; onToggle: () => void }) {
  const st = STRENGTH_META[entry.strength]
  return (
    <GlowCard className="animate-fade-up overflow-hidden" style={{ animationDelay: `${index * 60}ms` }}>
      <article className="flex h-full flex-col gap-3 p-4">
        {/* evidence headline */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-2xl font-black leading-8 text-amber-600 dark:text-amber-400">{entry.evidence}</div>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{entry.evidenceFa}</p>
          </div>
          <Badge variant="outline" className={cn('shrink-0 rounded-full', st.cls)}>
            {st.label}
          </Badge>
        </div>

        <h3 className="text-[15px] font-bold leading-7">{entry.titleFa}</h3>

        <div className="flex flex-wrap items-center gap-2">
          <span dir="ltr" title={entry.source} className="inline-block max-w-full min-w-0 flex-1 truncate rounded-md bg-muted/70 px-2 py-1 text-start text-[11px] text-muted-foreground">
            {entry.source}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground" aria-hidden>
            {categoryIcon(entry.category)} {entry.category}
          </span>
        </div>

        {/* collapsible detail */}
        {open && (
          <div className="animate-fade-up space-y-3 border-t border-dashed border-border pt-3">
            <p className="text-sm leading-7 text-foreground">{entry.findingFa}</p>

            <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden />
              <p className="text-sm leading-6">
                <span className="font-bold text-red-700 dark:text-red-300">درد کلاسیک: </span>
                <span className="text-foreground">{entry.painFa}</span>
              </p>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-olive/25 bg-olive/10 p-3">
              <Leaf className="mt-0.5 size-4 shrink-0 text-olive" aria-hidden />
              <p className="text-sm leading-6">
                <span className="font-bold text-olive dark:text-lime-300">پاسخ زیتون: </span>
                <span className="text-foreground">{entry.zeytoonFa}</span>
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {entry.features.map((f) => (
                <Badge key={f} variant="outline" className="rounded-full text-[11px] font-medium text-muted-foreground">
                  {f}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="mt-auto flex h-10 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {open ? 'بستن جزئیات' : 'جزئیات پژوهش و پاسخ زیتون'}
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </article>
    </GlowCard>
  )
}

/* ---------- tab 2: why zeytoon ---------- */

function WhyTab({ userName }: { userName: string }) {
  return (
    <div className="space-y-5">
      {/* hero */}
      <GlowCard className="relative overflow-hidden">
        <PatternBackground pattern="girih" />
        <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gold/15 text-gold">
            <FlaskConical className="size-8" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-black leading-9 sm:text-2xl">پلتفرم عملیات فروشگاه، با تکیه بر علم</h3>
            <p className="mt-1 text-sm leading-7 text-muted-foreground">
              زیتون از صفر شروع نکرده است؛ هر ماژول روی یافته‌ای از پژوهش‌های مدیریت عملیات، بازاریابی خرده‌فروشی و رفتار
              سازمانی سوار است — و هر روز در میدان واقعی هایپر زیتون کرمان آزموده می‌شود.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1 rounded-full border-gold/40 bg-gold/10 text-amber-700 dark:text-amber-300">
                <ClipboardCheck className="size-3.5" aria-hidden />
                {toFaDigits(RESEARCH_ENTRIES.length)} یافتهٔ علمی مستند
              </Badge>
              <Badge variant="outline" className="gap-1 rounded-full border-border bg-card text-muted-foreground">
                <UserRound className="size-3.5" aria-hidden />
                راهنمای امروز: {userName}
              </Badge>
            </div>
          </div>
        </div>
      </GlowCard>

      <OrnamentDivider />

      {/* pain matrix */}
      <div>
        <h3 className="text-base font-extrabold">از درد تا پاسخ؛ ردیف به ردیف</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">مقایسهٔ روش کلاسیک دستی با یک روز معمول در زیتون — همان کارها، با همان تیم.</p>
      </div>

      {/* column headers (md+) */}
      <div className="hidden gap-3 px-4 text-xs font-bold text-muted-foreground md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_auto]">
        <span>درد مشترک</span>
        <span>سیستم کلاسیک دستی</span>
        <span>با زیتون</span>
        <span>سنجه</span>
      </div>

      <div className="space-y-3">
        {PAIN_MATRIX.map((row, i) => (
          <PainRow key={row.painFa} row={row} index={i} />
        ))}
      </div>

      {/* testers card */}
      <GlowCard className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-olive/10 text-olive">
            <ClipboardCheck className="size-6" aria-hidden />
          </div>
          <div>
            <h3 className="text-base font-extrabold">برای شرکت‌های آزمونگر</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">زیتون را بدون ریسک، در فروشگاه خودتان امتحان کنید:</p>
          </div>
        </div>

        <ul className="mt-4 space-y-2.5">
          {TESTER_POINTS.map((p) => (
            <li key={p} className="flex items-start gap-2 text-sm leading-7">
              <CheckCircle2 className="mt-1 size-4 shrink-0 text-olive" aria-hidden />
              <span className="text-foreground">{p}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-gold/30 bg-gold/10 p-3.5">
          <Phone className="mt-1 size-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden />
          <p className="text-sm font-bold leading-7 text-amber-700 dark:text-amber-200">
            برای شروع آزمایشی با تیم زیتون در ارتباط باشید — هایپر زیتون، کرمان
          </p>
        </div>
      </GlowCard>
    </div>
  )
}

function PainRow({ row, index }: { row: PainMatrixRow; index: number }) {
  return (
    <GlowCard className="animate-fade-up p-4" style={{ animationDelay: `${index * 50}ms` }}>
      <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_auto]">
        <div className="font-bold leading-7">{row.painFa}</div>

        <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden />
          <p className="text-sm leading-6">
            <span className="font-bold text-red-700 md:hidden dark:text-red-300">کلاسیک: </span>
            <span className="text-red-800/90 dark:text-red-200/90">{row.classicFa}</span>
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-olive/25 bg-olive/10 p-3">
          <Leaf className="mt-0.5 size-4 shrink-0 text-olive" aria-hidden />
          <p className="text-sm leading-6">
            <span className="font-bold text-olive md:hidden dark:text-lime-300">با زیتون: </span>
            <span className="text-foreground">{row.zeytoonFa}</span>
          </p>
        </div>

        <div className="justify-self-start md:justify-self-center">
          <Badge className="rounded-full border border-gold/40 bg-gold/15 font-bold text-amber-700 dark:text-amber-300">
            {row.metric}
          </Badge>
        </div>
      </div>
    </GlowCard>
  )
}

/* ---------- tab 3: scientific roadmap ---------- */

function RoadmapTab() {
  const groups: RoadmapStatus[] = ['SHIPPED', 'IN_PROGRESS', 'PLANNED']
  const count = (s: RoadmapStatus) => ROADMAP.filter((r) => r.status === s).length

  return (
    <div className="space-y-7">
      {/* summary chips */}
      <div className="flex flex-wrap items-center gap-2" aria-label="خلاصهٔ وضعیت نقشه راه">
        <Badge variant="outline" className="gap-1.5 rounded-full border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-4" aria-hidden />
          {toFaDigits(count('SHIPPED'))} قابلیت فعال
        </Badge>
        <span className="text-muted-foreground" aria-hidden>•</span>
        <Badge variant="outline" className="gap-1.5 rounded-full border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-700 dark:text-amber-300">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {toFaDigits(count('IN_PROGRESS'))} در حال ساخت
        </Badge>
        <span className="text-muted-foreground" aria-hidden>•</span>
        <Badge variant="outline" className="gap-1.5 rounded-full border-border bg-muted px-3 py-1.5 text-sm text-muted-foreground">
          <Clock className="size-4" aria-hidden />
          {toFaDigits(count('PLANNED'))} در صف برنامه
        </Badge>
      </div>

      {groups.map((s) => {
        const meta = STATUS_META[s]
        const items = ROADMAP.filter((r) => r.status === s)
        const Icon = meta.icon
        return (
          <section key={s} aria-label={meta.label} className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-extrabold">
              <Icon className={cn('size-5', meta.iconCls, s === 'IN_PROGRESS' && 'animate-spin')} aria-hidden />
              {meta.label}
              <Badge variant="outline" className="rounded-full text-[11px] font-medium text-muted-foreground">
                {toFaDigits(items.length)} مورد
              </Badge>
            </h3>

            {/* vertical timeline */}
            <div className="relative">
              <div className="absolute inset-y-2 border-s border-border ms-[13px]" aria-hidden />
              <ol className="space-y-4">
                {items.map((item, i) => (
                  <li
                    key={item.titleFa}
                    className="relative flex animate-fade-up items-start gap-3"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <span className={cn('z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2 bg-card', meta.dotCls)}>
                      <Icon className={cn('size-3.5', s === 'IN_PROGRESS' && 'animate-spin')} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1 rounded-xl border border-border bg-card px-4 py-3">
                      <div className="text-sm font-bold">{item.titleFa}</div>
                      <div className="mt-0.5 text-xs leading-6 text-muted-foreground">{item.descFa}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )
      })}
    </div>
  )
}
