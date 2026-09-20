'use client'

// IranMap — نقشه تأمین کشوری هایپر زیتون
// کارتوگرام شبه‌مربعی ۳۱ استان ایران (شبکه ۸×۷، تقریب جغرافیا با خلیج فارس/خزر/عمان)
// شدت سبز پسته‌ای = شمار تأمین‌کنندگان استان؛ هاور/کلیک = کارت اطلاعات استان
import * as React from 'react'
import { IRAN_PROVINCES, IRAN_SEA_CELLS, IRAN_GRID, findProvince } from '@/lib/iran-geo'
import { toFaDigits } from '@/lib/jalali'
import { cn } from '@/lib/utils'
import { MapPin, Landmark, MousePointerClick, Star } from 'lucide-react'

interface MapProvider {
  id: string
  name: string
  color: string
  province?: string | null
  city?: string | null
}

// هندسه سلول‌ها
const CELL_W = 66
const CELL_H = 48
const STEP_X = 74
const STEP_Y = 56
const OX = 10
const OY = 10
const VIEW_W = OX * 2 + STEP_X * (IRAN_GRID.cols - 1) + CELL_W // ≈ 602
const VIEW_H = OY * 2 + STEP_Y * (IRAN_GRID.rows - 1) + CELL_H // ≈ 400

const LEVELS = [
  { max: 0, fill: 0.05, label: 'بدون تأمین‌کننده' },
  { max: 1, fill: 0.28, label: '۱ تأمین‌کننده' },
  { max: 3, fill: 0.5, label: '۲ تا ۳' },
  { max: 5, fill: 0.72, label: '۴ تا ۵' },
  { max: Infinity, fill: 0.95, label: '۶ و بیشتر' },
]

function levelOf(count: number) {
  return LEVELS.find((l) => count <= l.max) ?? LEVELS[0]
}

export function IranMap({ providers }: { providers: MapProvider[] }) {
  const [hovered, setHovered] = React.useState<string | null>(null)
  const [pinned, setPinned] = React.useState<string | null>(null)

  // گروه‌بندی تأمین‌کنندگان بر پایه استان (تطبیق نرم نام)
  const byProvince = React.useMemo(() => {
    const m = new Map<string, MapProvider[]>()
    const unknown: MapProvider[] = []
    for (const p of providers) {
      const prov = findProvince(p.province)
      if (!prov) {
        unknown.push(p)
        continue
      }
      const arr = m.get(prov.id) ?? []
      arr.push(p)
      m.set(prov.id, arr)
    }
    return { m, unknown }
  }, [providers])

  const activeId = hovered ?? pinned
  const activeProvince = IRAN_PROVINCES.find((p) => p.id === activeId) ?? null
  const activeProviders = activeProvince ? byProvince.m.get(activeProvince.id) ?? [] : []

  const coveredProvinces = IRAN_PROVINCES.filter((p) => (byProvince.m.get(p.id)?.length ?? 0) > 0).length
  const topProvince = IRAN_PROVINCES.map((p) => ({ p, n: byProvince.m.get(p.id)?.length ?? 0 }))
    .sort((a, b) => b.n - a.n)[0]

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* —— کارتوگرام —— */}
        <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 relative overflow-hidden">
          <span className="pointer-events-none absolute inset-0 paisley-bg opacity-[0.04]" aria-hidden />
          <div className="relative overflow-x-auto nice-scroll">
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H + 14}`}
              className="min-w-[540px] w-full h-auto select-none"
              role="img"
              aria-label="نقشه کارتوگرام استان‌های ایران بر پایه شمار تأمین‌کنندگان"
            >
              {/* پهنه‌های آبی */}
              {IRAN_SEA_CELLS.map((s) => {
                const x = OX + s.x * STEP_X
                const y = OY + s.y * STEP_Y
                return (
                  <g key={`sea-${s.x}-${s.y}`}>
                    <rect
                      x={x} y={y} width={CELL_W} height={CELL_H} rx={12}
                      fill="rgba(46,110,142,0.07)"
                      stroke="rgba(46,110,142,0.30)"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                    />
                    {s.label && (
                      <text
                        x={x + CELL_W / 2}
                        y={s.label === 'دریای خزر' ? y + CELL_H / 2 + 4 : y + CELL_H - 10}
                        textAnchor="middle"
                        fontSize={11}
                        fontStyle="italic"
                        fontWeight={600}
                        className="fill-[#2E6E8E]/80"
                      >
                        {s.label}
                      </text>
                    )}
                  </g>
                )
              })}

              {/* استان‌ها */}
              {IRAN_PROVINCES.map((prov) => {
                const x = OX + prov.x * STEP_X
                const y = OY + prov.y * STEP_Y
                const n = byProvince.m.get(prov.id)?.length ?? 0
                const lv = levelOf(n)
                const isActive = activeId === prov.id
                return (
                  <g
                    key={prov.id}
                    onMouseEnter={() => setHovered(prov.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => setPinned((v) => (v === prov.id ? null : prov.id))}
                    className="cursor-pointer"
                  >
                    <title>{`${prov.name} — ${n > 0 ? `${toFaDigits(n)} تأمین‌کننده` : 'بدون تأمین‌کننده'}`}</title>
                    {/* هاله طلایی استان خانه */}
                    {prov.home && (
                      <rect
                        x={x - 3.5} y={y - 3.5} width={CELL_W + 7} height={CELL_H + 7} rx={15}
                        fill="none" stroke="#C9A227" strokeWidth={1.4} strokeDasharray="3 3" opacity={0.85}
                      />
                    )}
                    <rect
                      x={x} y={y} width={CELL_W} height={CELL_H} rx={12}
                      fill="#3E7C59"
                      fillOpacity={n > 0 ? lv.fill : 0.05}
                      stroke={isActive ? '#C9A227' : 'rgba(62,124,89,0.35)'}
                      strokeWidth={isActive ? 2.4 : 1}
                      className="transition-all duration-200"
                    />
                    {prov.lines ? (
                      <text
                        x={x + CELL_W / 2}
                        y={y + (n > 0 ? CELL_H / 2 - 6 : CELL_H / 2 + 1)}
                        textAnchor="middle"
                        fontSize={8.6}
                        fontWeight={700}
                        className={cn('pointer-events-none', n >= 4 ? 'fill-white' : 'fill-[#2c5443] dark:fill-[#DCEDE2]')}
                      >
                        <tspan x={x + CELL_W / 2} dy="0">{prov.lines[0]}</tspan>
                        <tspan x={x + CELL_W / 2} dy="10">{prov.lines[1]}</tspan>
                      </text>
                    ) : (
                      <text
                        x={x + CELL_W / 2}
                        y={y + (n > 0 ? CELL_H / 2 - 3 : CELL_H / 2 + 4)}
                        textAnchor="middle"
                        fontSize={9.4}
                        fontWeight={700}
                        className={cn('pointer-events-none', n >= 4 ? 'fill-white' : 'fill-[#2c5443] dark:fill-[#DCEDE2]')}
                      >
                        {prov.name}
                      </text>
                    )}
                    {n > 0 && (
                      <text
                        x={x + CELL_W / 2}
                        y={y + CELL_H - 7}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight={900}
                        className="pointer-events-none fill-[#8A6F3C] dark:fill-[#C9A227]"
                      >
                        {prov.home ? '★ ' : ''}{toFaDigits(n)}
                      </text>
                    )}
                    {prov.home && n === 0 && (
                      <text
                        x={x + CELL_W / 2}
                        y={y + CELL_H - 7}
                        textAnchor="middle"
                        fontSize={9}
                        fontWeight={800}
                        className="pointer-events-none fill-[#C9A227]"
                      >
                        ★ کرمان
                      </text>
                    )}
                  </g>
                )
              })}

              {/* راهنمای کوچک داخل نقشه */}
              <text x={OX} y={VIEW_H + 9} fontSize={8.5} className="fill-[#9AA79E]">
                کارتوگرام تقریبی — هر سلول یک استان (تعداد تأمین‌کننده زیر نام)
              </text>
            </svg>
          </div>

          {/* راهنمای شدت رنگ */}
          <div className="relative mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-muted-foreground">
            {LEVELS.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1.5">
                <span className="h-3 w-4 rounded-[4px]" style={{ backgroundColor: `rgba(62,124,89,${l.fill === 0.05 ? 0.08 : l.fill})` }} />
                {l.label}
              </span>
            ))}
          </div>
        </div>

        {/* —— کارت استان فعال —— */}
        <div className="rounded-2xl border border-border bg-card p-4 flex flex-col">
          {activeProvince ? (
            <div className="space-y-3">
              <div>
                <p className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                  <MousePointerClick className="h-3 w-3" />
                  {pinned === activeProvince.id ? 'انتخاب ثابت (برای رها کردن کلیک کنید)' : 'پیش‌نمایش هاور'}
                </p>
                <p className="mt-1 flex items-center gap-2 text-lg font-extrabold">
                  <MapPin className="h-5 w-5 text-[#C9A227]" />
                  {activeProvince.name}
                  {activeProvince.home && <Star className="h-4 w-4 fill-[#C9A227] text-[#C9A227]" aria-label="استان خانه" />}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#3E7C59]/10 border border-[#3E7C59]/30 px-3 py-1 text-sm font-black text-[#3E7C59] num">
                  {toFaDigits(activeProviders.length)} تأمین‌کننده
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {activeProviders.length > 0 ? 'روی شبکه تأمین این استان' : 'هنوز تأمین‌کننده‌ای در این استان نیست'}
                </span>
              </div>
              {activeProviders.length > 0 && (
                <div className="space-y-1.5 max-h-64 overflow-y-auto nice-scroll">
                  {activeProviders.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="text-xs font-bold truncate">{p.name}</span>
                      {p.city && <span className="mr-auto text-[10px] text-muted-foreground shrink-0">{p.city}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center gap-2 py-6">
              <MousePointerClick className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-bold">یک استان را لمس کنید</p>
              <p className="text-xs text-muted-foreground leading-5 max-w-[240px]">
                هاور یا کلیک روی هر استان، شمار و نام تأمین‌کنندگان همان استان را نشان می‌دهد. ستاره طلایی = کرمان، استان خانه.
              </p>
            </div>
          )}

          {/* خلاصه */}
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
            <div>
              <p className="num text-lg font-black text-[#3E7C59]">{toFaDigits(providers.length)}</p>
              <p className="text-[9px] text-muted-foreground">تأمین‌کننده</p>
            </div>
            <div>
              <p className="num text-lg font-black text-[#8A6F3C]">{toFaDigits(coveredProvinces)}</p>
              <p className="text-[9px] text-muted-foreground">استان فعال</p>
            </div>
            <div>
              <p className="text-xs font-black text-[#C9A227] truncate mt-1.5" title={topProvince?.n ? topProvince.p.name : '—'}>
                {topProvince && topProvince.n > 0 ? topProvince.p.name : '—'}
              </p>
              <p className="text-[9px] text-muted-foreground">بزرگ‌ترین شبکه</p>
            </div>
          </div>
        </div>
      </div>

      {/* تأمین‌کنندگان بدون استان */}
      <div className="rounded-2xl border border-dashed border-border bg-card/60 p-3.5">
        <p className="flex items-center gap-2 text-xs font-extrabold text-muted-foreground">
          <Landmark className="h-4 w-4" />
          بدون استان مشخص — {toFaDigits(byProvince.unknown.length)} مورد
        </p>
        {byProvince.unknown.length === 0 ? (
          <p className="text-[11px] text-muted-foreground mt-1.5">استان تمام تأمین‌کنندگان مشخص است. ✓</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {byProvince.unknown.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                {p.name}
                <span className="text-[9px] font-normal text-muted-foreground rounded-full border border-border px-1.5">نامشخص</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
