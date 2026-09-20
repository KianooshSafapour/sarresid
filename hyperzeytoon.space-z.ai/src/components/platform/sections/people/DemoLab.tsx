'use client'

/**
 * آزمایشگاه نمایشی — Demo Company Simulator UI (manager-only)
 * Launches one of 3 virtual companies (boutique / hyper / chain) so
 * prospects can explore a living platform with realistic Persian data.
 * Restores the real Hyper Zeytoon dataset with one click.
 */
import * as React from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/store/app'
import { useToast } from '@/hooks/use-toast'
import { SectionHeader, LoadingBlock, EmptyState } from '@/components/platform/ui/shared'
import { formalName } from '@/lib/persian-words'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Gem, Building2, Network, Play, RotateCcw, FlaskConical, Users, Package, Handshake, MapPin, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface ScenarioMeta {
  key: string
  name: string
  tagline: string
  description: string
  branches: string[]
  highlights: string[]
  icon: string
  accent: string
}

const ICONS: Record<string, React.ReactNode> = {
  Gem: <Gem className="h-6 w-6" />,
  Building2: <Building2 className="h-6 w-6" />,
  Network: <Network className="h-6 w-6" />,
}

interface DemoStats {
  staff: number; products: number; providers: number; companies: number; orders: number; shelves: number; branches: number
}

const SCENARIO_SIZE: Record<string, { label: string; tone: string }> = {
  boutique: { label: 'کوچک و بوتیک', tone: 'bg-[#7D5BA6]/10 text-[#7D5BA6] border-[#7D5BA6]/30' },
  hyper: { label: 'بزرگ و پرحجم', tone: 'bg-[#3E7C59]/10 text-[#3E7C59] border-[#3E7C59]/30' },
  chain: { label: 'زنجیره‌ای چندشعبه‌ای', tone: 'bg-[#B07D2B]/10 text-[#B07D2B] border-[#B07D2B]/30' },
}

const fa = (n: number) => n.toLocaleString('fa-IR')

export function DemoLab() {
  const { user } = useApp()
  const { toast } = useToast()
  const [scenarios, setScenarios] = React.useState<ScenarioMeta[]>([])
  const [active, setActive] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [launching, setLaunching] = React.useState<string | null>(null)
  const [confirmScenario, setConfirmScenario] = React.useState<ScenarioMeta | null>(null)
  const [confirmRestore, setConfirmRestore] = React.useState(false)
  const [doneStats, setDoneStats] = React.useState<{ scenario: string; stats: DemoStats } | null>(null)

  const load = React.useCallback(() => {
    api<{ scenarios: ScenarioMeta[]; status: { active: boolean; scenario: string | null } }>('/api/demo')
      .then((d) => {
        setScenarios(d.scenarios)
        setActive(d.status.scenario)
      })
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(load, [load])

  const launch = async (s: ScenarioMeta) => {
    setConfirmScenario(null)
    setLaunching(s.key)
    try {
      const r = await api<{ ok: boolean; stats: DemoStats }>('/api/demo', { body: { scenario: s.key } })
      setActive(s.key)
      setDoneStats({ scenario: s.name, stats: r.stats })
      toast({ title: `نسخه نمایشی «${s.name}» آماده شد 🎬` })
    } catch (e) {
      toast({ title: 'راه‌اندازی نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setLaunching(null)
    }
  }

  const restore = async () => {
    setConfirmRestore(false)
    setLaunching('restore')
    try {
      await api('/api/demo', { method: 'DELETE' })
      setActive(null)
      toast({ title: 'داده‌های واقعی هایپر زیتون بازگشت 🌿', description: 'ورود با حساب‌های واقعی همکاران' })
    } catch (e) {
      toast({ title: 'بازگردانی نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setLaunching(null)
    }
  }

  if (loading) return <LoadingBlock label="در حال آماده‌سازی آزمایشگاه…" />

  return (
    <div className="space-y-5">
      <SectionHeader
        title="آزمایشگاه نمایشی"
        subtitle="یک شرکت کامل و واقع‌نما بسازید تا قدرت پلتفرم را زنده ببینید"
        icon={<FlaskConical className="h-5 w-5" />}
      />

      {/* active demo banner */}
      {active && (
        <div className="relative overflow-hidden rounded-2xl border border-[#C9A227]/40 bg-gradient-to-l from-[#C9A227]/10 via-transparent to-[#C9A227]/5 p-4">
          <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: "url('/brand/pattern.png')", backgroundSize: 'cover' }} />
          <div className="relative flex flex-wrap items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#C9A227]/15 text-[#C9A227]">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="flex-1 min-w-40">
              <p className="text-sm font-bold">
                نسخه نمایشی فعال: {scenarios.find((s) => s.key === active)?.name ?? '—'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                همه داده‌ها شبیه‌سازی‌شده‌اند. ورود همه همکاران با رمز ۱۲۳۴ — از صفحه انتخاب همکار.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-[#B33A3A]/40 text-[#B33A3A] hover:bg-[#B33A3A]/10 hover:text-[#B33A3A]"
              onClick={() => setConfirmRestore(true)}
              disabled={launching === 'restore'}
            >
              <RotateCcw className="h-4 w-4" />
              بازگشت به داده‌های واقعی
            </Button>
          </div>
        </div>
      )}

      {launching && (
        <Card className="border-[#C9A227]/40">
          <CardContent className="p-6">
            <LoadingBlock
              label={launching === 'restore' ? 'در حال بازگردانی داده‌های واقعی… این کار حدود یک دقیقه طول می‌کشد.' : 'در حال ساخت شرکت نمایشی… (کارکنان، کالاها، سفارش‌ها، چک‌ها، قفسه‌ها و تاریخچه فروش)'}
            />
          </CardContent>
        </Card>
      )}

      {/* scenario cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {scenarios.map((s) => {
          const isActive = active === s.key
          const size = SCENARIO_SIZE[s.key]
          return (
            <Card key={s.key} className={`card-hover relative overflow-hidden ${isActive ? 'ring-2 ring-[#C9A227]/60' : ''}`}>
              <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: "url('/brand/pattern.png')", backgroundSize: 'cover' }} />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-xl shadow-inner"
                    style={{ backgroundColor: `${s.accent}1A`, color: s.accent }}
                  >
                    {ICONS[s.icon] ?? <Gem className="h-6 w-6" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base leading-tight">{s.name}</CardTitle>
                    <Badge variant="outline" className={`mt-1 text-[10px] ${size.tone}`}>{size.label}</Badge>
                  </div>
                  {isActive && (
                    <Badge className="bg-[#C9A227] text-white border-0 text-[10px]">فعال</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="relative space-y-3">
                <p className="text-xs font-medium text-muted-foreground">{s.tagline}</p>
                <p className="text-xs leading-6 text-foreground/80">{s.description}</p>

                <div className="flex flex-wrap gap-1.5">
                  {s.branches.map((b) => (
                    <span key={b} className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {b}
                    </span>
                  ))}
                </div>

                <ul className="space-y-1">
                  {s.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-1.5 text-[11px] text-foreground/75">
                      <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" style={{ color: s.accent }} />
                      {h}
                    </li>
                  ))}
                </ul>

                <Button
                  className="w-full mt-1"
                  style={{ background: `linear-gradient(135deg, ${s.accent}, ${s.accent}CC)` }}
                  onClick={() => setConfirmScenario(s)}
                  disabled={launching !== null}
                >
                  <Play className="h-4 w-4" />
                  راه‌اندازی این شرکت نمایشی
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B07D2B]" />
            <p className="text-xs leading-6 text-muted-foreground">
              راه‌اندازی هر سناریو، <b className="text-foreground">تمام داده‌های فعلی را جایگزین می‌کند</b> —
              این ابزار برای نمایش و آموزش طراحی شده است. در هر لحظه می‌توانید با یک کلیک به داده‌های واقعی
              هایپر زیتون بازگردید. همه حساب‌های نمایشی با رمز <span className="num font-bold">۱۲۳۴</span> وارد می‌شوند.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* launch confirm */}
      <AlertDialog open={!!confirmScenario} onOpenChange={(o) => !o && setConfirmScenario(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>راه‌اندازی «{confirmScenario?.name}»؟</AlertDialogTitle>
            <AlertDialogDescription>
              با این کار همه داده‌های فعلی (کارکنان، سفارش‌ها، چک‌ها و…) با داده‌های شبیه‌سازی‌شدهٔ این
              شرکت جایگزین می‌شود. هر زمان بخواهید، از همین بخش به داده‌های واقعی برمی‌گردید.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#3E7C59] hover:bg-[#336649] text-white"
              onClick={() => confirmScenario && launch(confirmScenario)}
            >
              بله، بساز
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* restore confirm */}
      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>بازگشت به داده‌های واقعی؟</AlertDialogTitle>
            <AlertDialogDescription>
              داده‌های نمایشی حذف و مجموعه داده اصلی هایپر زیتون (همکاران، سفارش‌ها، چک‌ها و تعطیلات)
              بازگردانی می‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction className="bg-[#B33A3A] hover:bg-[#993030] text-white" onClick={restore}>
              بازگردانی داده‌های واقعی
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* done dialog */}
      <Dialog open={!!doneStats} onOpenChange={(o) => !o && setDoneStats(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-[#3E7C59]" />
              «{doneStats?.scenario}» آماده است
            </DialogTitle>
            <DialogDescription>
              یک شرکت کامل با داده‌های واقع‌نما ساخته شد. از صفحه ورود، یکی از همکاران نمایشی را انتخاب و
              با رمز ۱۲۳۴ وارد شوید.
            </DialogDescription>
          </DialogHeader>
          {doneStats && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { icon: <Users className="h-3.5 w-3.5" />, label: 'همکار', value: doneStats.stats.staff },
                { icon: <Package className="h-3.5 w-3.5" />, label: 'قلم کالا', value: doneStats.stats.products },
                { icon: <Handshake className="h-3.5 w-3.5" />, label: 'تأمین‌کننده', value: doneStats.stats.providers },
                { icon: <MapPin className="h-3.5 w-3.5" />, label: 'شعبه', value: doneStats.stats.branches },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-2.5">
                  <span className="text-muted-foreground">{row.icon}</span>
                  <span className="num text-base font-bold">{fa(row.value)}</span>
                  <span className="text-muted-foreground">{row.label}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
