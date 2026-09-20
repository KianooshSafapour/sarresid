'use client'

import * as React from 'react'
import { api } from '@/lib/api-client'
import { APP_VERSION, APP_CODENAME, HELLO_WORLD_SNAPSHOT } from '@/lib/constants'
import { SectionHeader, GlowCard, EmptyState, OrnamentDivider } from '@/components/zeytoon-ui'
import { PistachioMotif, SaffronDivider } from '@/components/cultural-svg'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { formatMoney, toFaDigits } from '@/lib/jalali'
import {
  History, ShieldCheck, Plus, RotateCcw, Trash2, Database, Sparkles, Lock,
  AlertTriangle, CheckCircle2, HardDriveDownload,
} from 'lucide-react'

interface SnapMeta {
  name: string
  label?: string
  at: string
  atJalali?: string
  note?: string
  createdBy?: string
  sizeBytes?: number
  exists?: boolean
}

export function VersionsSection({ user }: { user: { id: string; name: string; roles: string[]; primaryRole: string; color: string; points: number } }) {
  const { toast } = useToast()
  const [loading, setLoading] = React.useState(true)
  const [snapshots, setSnapshots] = React.useState<SnapMeta[]>([])
  const [creating, setCreating] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [label, setLabel] = React.useState('')
  const [note, setNote] = React.useState('')
  const [restoreTarget, setRestoreTarget] = React.useState<SnapMeta | null>(null)
  const [restoring, setRestoring] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<SnapMeta | null>(null)

  const canManage = ['IT_ADMIN', 'OPERATION_MANAGER', 'OWNER'].some(r => user.roles.includes(r))

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await api.get<{ snapshots: SnapMeta[] }>('/api/snapshots')
      setSnapshots(d.snapshots || [])
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  React.useEffect(() => { load() }, [load])

  async function createSnapshot() {
    setCreating(true)
    try {
      await api.post('/api/snapshots', { label, note })
      toast({ title: '✅ نسخه پشتیبان ساخته شد', description: 'نقطه بازیابی جدید ثبت شد.' })
      setCreateOpen(false); setLabel(''); setNote('')
      load()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
    } finally { setCreating(false) }
  }

  async function doRestore() {
    if (!restoreTarget) return
    setRestoring(true)
    try {
      await api.put('/api/snapshots', { name: restoreTarget.name })
      toast({ title: 'بازگردانی انجام شد', description: 'صفحه برای اعمال نسخه، دوباره بارگذاری می‌شود...' })
      setTimeout(() => { window.location.reload() }, 1500)
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
      setRestoring(false)
    }
  }

  async function doDelete() {
    if (!deleteTarget) return
    try {
      await api.delete(`/api/snapshots?name=${encodeURIComponent(deleteTarget.name)}`)
      toast({ title: 'نسخه حذف شد' })
      setDeleteTarget(null); load()
    } catch (e) {
      toast({ title: 'خطا', description: (e as Error).message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="نسخه‌ها و نقاط بازیابی"
        subtitle="هر نسخه، یک عکس کامل از کل سامانه است — اگر روزی چیزی خراب شد، با یک کلیک به نقطه سالم برمی‌گردید."
        actions={canManage && (
          <Button onClick={() => setCreateOpen(true)} className="h-11 gap-2 bg-primary text-primary-foreground hover:opacity-90">
            <Plus className="size-5" /> ساخت نقطه بازیابی
          </Button>
        )}
      />

      {/* current version card */}
      <GlowCard className="relative overflow-hidden p-0">
        <div className="pointer-events-none absolute -left-10 -top-10 size-44 rounded-full bg-primary/10 blur-3xl" />
        <PistachioMotif className="pointer-events-none absolute -bottom-6 -left-6 size-40 rotate-12 text-primary/10" />
        <CardContent className="relative flex flex-col gap-4 p-6 md:flex-row md:items-center">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <ShieldCheck className="size-8" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold">نسخه فعلی پلتفرم</h3>
              <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">v{APP_VERSION} «{APP_CODENAME}»</Badge>
              <Badge variant="outline" className="gap-1 border-primary/40 text-primary"><Lock className="size-3" /> نسخه پایدار و مرجع</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground leading-6">
              این نسخه به‌عنوان «نقطه امن» ثبت شده است؛ همه ماژول‌ها (سفارش تا هلو، چک، وظایف، گیمیفیکیشن، شیفت‌ها و تست فشار) در آن تست و تأیید شده‌اند.
              نسخه <span className="font-medium text-foreground">«Hello, World»</span> محافظت‌شده است و هرگز حذف نمی‌شود.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
            <Database className="size-4 text-primary" />
            {snapshots.length > 0 && <span className="font-bold text-foreground">{toFaDigits(snapshots.length)}</span>} نقطه بازیابی ثبت‌شده
          </div>
        </CardContent>
      </GlowCard>

      <SaffronDivider className="my-2" />

      {/* snapshot list */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : snapshots.length === 0 ? (
        <EmptyState icon={<HardDriveDownload className="size-10 text-primary/60" />} title="هنوز نقطه بازیابی‌ای نیست" description="اولین نسخه پشتیبان را بسازید تا خیال‌تان راحت باشد." />
      ) : (
        <div className="space-y-3">
          {snapshots.map((s, idx) => {
            const isHello = s.name === HELLO_WORLD_SNAPSHOT
            return (
              <GlowCard key={s.name} className={idx === 0 ? '' : 'animate-fade-up'} interactive={false}>
                <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                  <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${isHello ? 'bg-amber-500/15 text-amber-600' : 'bg-primary/10 text-primary'}`}>
                    {isHello ? <Sparkles className="size-6" /> : <History className="size-6" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{s.label || s.name}</span>
                      {isHello && <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">محافظت‌شده 🔒</Badge>}
                      {s.exists === false && <Badge variant="destructive">فایل یافت نشد</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {s.atJalali && <span>🗓 {s.atJalali}</span>}
                      {typeof s.sizeBytes === 'number' && s.sizeBytes > 0 && <span>💾 {formatMoney(s.sizeBytes / 1024)} کیلوبایت</span>}
                      {s.createdBy && <span>👤 {s.createdBy}</span>}
                    </div>
                    {s.note && <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{s.note}</p>}
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="outline" size="sm" className="h-10 gap-1.5"
                        disabled={s.exists === false || restoring}
                        onClick={() => setRestoreTarget(s)}
                      >
                        <RotateCcw className="size-4" /> بازگردانی
                      </Button>
                      {!isHello && (
                        <Button variant="ghost" size="sm" className="h-10 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteTarget(s)}>
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </GlowCard>
            )
          })}
        </div>
      )}

      {/* create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="size-5 text-primary" /> ساخت نقطه بازیابی جدید</DialogTitle>
            <DialogDescription>یک عکس کامل از همه داده‌ها و تنظیمات فعلی ذخیره می‌شود. قبل از تغییرهای بزرگ (ورود اطلاعات هلو، بستن سال مالی و…) یک نقطه بسازید.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">نام نسخه</label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="مثلاً: قبل از ورود اسفندماه" className="h-11" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">توضیح (اختیاری)</label>
              <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="چه چیزی در این لحظه مهم است؟" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} className="h-11">انصراف</Button>
            <Button onClick={createSnapshot} disabled={creating} className="h-11 gap-2">
              {creating ? 'در حال ذخیره…' : (<><Plus className="size-4" /> ذخیره نسخه</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* restore confirm */}
      <AlertDialog open={!!restoreTarget} onOpenChange={o => !o && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-amber-500" /> بازگردانی به «{restoreTarget?.label || restoreTarget?.name}»؟</AlertDialogTitle>
            <AlertDialogDescription className="leading-7">
              کل سامانه به وضعیت همین نسخه برمی‌گردد؛ تغییرهایی که بعد از این نسخه ثبت شده، پاک می‌شود.
              <br />
              ⚠️ پیش از بازگردانی، به‌طور خودکار از وضعیت فعلی یک نسخه پشتیبان («خودکار — قبل از بازگردانی») گرفته می‌شود، پس داده‌ها از بین نمی‌روند.
              <br />
              بهتر است در این لحظه بقیه همکاران در سامانه کاری انجام ندهند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={doRestore} disabled={restoring} className="h-11 gap-2 bg-amber-600 text-white hover:bg-amber-700">
              {restoring ? 'در حال بازگردانی…' : (<><RotateCcw className="size-4" /> بله، بازگردانی کن</>)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف نسخه «{deleteTarget?.label || deleteTarget?.name}»؟</AlertDialogTitle>
            <AlertDialogDescription>این نقطه بازیابی برای همیشه حذف می‌شود. نسخه «Hello, World» همیشه محافظت می‌ماند.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="h-11 bg-destructive text-white hover:bg-destructive/90">حذف کن</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
