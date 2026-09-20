'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/store/app'
import { useToast } from '@/hooks/use-toast'
import {
  SectionHeader, EmptyState, LoadingBlock, UserAvatar, PointsBadge,
} from '@/components/platform/ui/shared'
import { formatJalali, toFaDigits } from '@/lib/jalali'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Cell } from 'recharts'
import { Trophy, Crown, Award, Plus, Loader2, Sparkles } from 'lucide-react'

interface LeaderRow {
  rank: number
  id: string
  name: string
  title: string
  color: string
  points: number
  recentAwards: { id: string; points: number; reason: string; createdAt: string }[]
}

interface AwardDTO {
  id: string
  userId: string
  points: number
  reason: string
  createdAt: string
}

interface AwardsResp {
  awards: AwardDTO[]
  user?: { id: string; name: string; color: string; title: string; points: number } | null
  rank?: number
}

const PODACITY_COLORS = ['#C9A227', '#A8B0A8', '#B08D57']

export function Team() {
  const { user } = useApp()
  const { toast } = useToast()
  const isManager = !!user?.isManager
  const [board, setBoard] = React.useState<LeaderRow[] | null>(null)
  const [mine, setMine] = React.useState<AwardsResp | null>(null)
  const [grantOpen, setGrantOpen] = React.useState(false)

  const loadBoard = React.useCallback(async () => {
    try {
      const d = await api<{ leaderboard: LeaderRow[] }>('/api/awards?leaderboard=1')
      setBoard(d.leaderboard)
    } catch {
      setBoard([])
    }
  }, [])

  const loadMine = React.useCallback(async () => {
    try {
      const d = await api<AwardsResp>('/api/awards')
      setMine(d)
    } catch {
      setMine(null)
    }
  }, [])

  React.useEffect(() => {
    loadBoard()
    loadMine()
  }, [loadBoard, loadMine])

  const podium = board?.slice(0, 3) ?? []
  const rest = board?.slice(3) ?? []

  return (
    <div className="space-y-4">
      <SectionHeader
        title="تیم و عملکرد"
        subtitle="اینجا جشن تلاش‌های همه‌ی ماست — هر امتیاز یعنی یک کار خوب 💫"
        icon={<Trophy className="h-5 w-5" />}
        actions={
          isManager ? (
            <Button size="sm" className="gap-1.5" onClick={() => setGrantOpen(true)}>
              <Plus className="h-4 w-4" /> اعطای امتیاز
            </Button>
          ) : undefined
        }
      />

      {/* my card */}
      {mine?.user && (
        <Card className="glow-border-static overflow-hidden">
          <CardContent className="p-4 flex flex-wrap items-center gap-4">
            <UserAvatar name={mine.user.name} color={mine.user.color} size={56} />
            <div className="min-w-0 flex-1">
              <p className="font-bold">{mine.user.name} <span className="text-xs text-muted-foreground font-normal">({mine.user.title})</span></p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <PointsBadge points={mine.user.points} />
                {mine.rank && <Badge variant="secondary" className="rounded-full num">رتبه {toFaDigits(mine.rank)} در تیم</Badge>}
              </div>
            </div>
            <div className="w-full sm:w-72 space-y-1.5 max-h-28 overflow-y-auto nice-scroll">
              <p className="text-xs font-bold text-muted-foreground">آخرین پاداش‌های تو:</p>
              {mine.awards.length === 0 ? (
                <p className="text-xs text-muted-foreground">به‌زودی اولین ⭐ تو هم اینجا می‌درخشد!</p>
              ) : mine.awards.slice(0, 5).map((a) => (
                <p key={a.id} className="text-xs flex items-center justify-between gap-2">
                  <span className="truncate">{a.reason}</span>
                  <span className="text-gold font-bold shrink-0 num">+{toFaDigits(a.points)}</span>
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!board ? <LoadingBlock rows={4} /> : board.length === 0 ? (
        <EmptyState icon={<Sparkles />} title="هنوز امتیازی ثبت نشده" description="کارها را در «کارهای من» کامل کن تا اولین ⭐ را بگیری!" />
      ) : (
        <>
          {/* podium */}
          <div className="grid grid-cols-3 gap-2 md:gap-4 items-end max-w-2xl mx-auto">
            {[1, 0, 2].map((idx, pos) => {
              const row = podium[idx]
              if (!row) return <div key={pos} />
              const heights = ['h-24 md:h-32', 'h-32 md:h-40', 'h-20 md:h-24']
              return (
                <div key={row.id} className={`flex flex-col items-center gap-2 ${idx === 0 ? 'order-2' : idx === 1 ? 'order-1' : 'order-3'}`}>
                  <div className="relative">
                    {idx === 0 && <Crown className="absolute -top-6 left-1/2 -translate-x-1/2 h-6 w-6 text-gold" />}
                    <UserAvatar name={row.name} color={row.color} size={idx === 0 ? 64 : 52} />
                  </div>
                  <p className="text-xs md:text-sm font-bold text-center truncate max-w-full">{row.name}</p>
                  <PointsBadge points={row.points} />
                  <div
                    className={`w-full ${heights[idx === 0 ? 1 : idx === 1 ? 0 : 2]} rounded-t-2xl flex items-start justify-center pt-3`}
                    style={{ background: `linear-gradient(180deg, ${PODACITY_COLORS[idx]}44, ${PODACITY_COLORS[idx]}11)`, border: `1px solid ${PODACITY_COLORS[idx]}55` }}
                  >
                    <span className="num text-2xl font-extrabold" style={{ color: PODACITY_COLORS[idx] }}>{toFaDigits(row.rank)}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 14-day awards chart */}
          <AwardsChart />

          {/* full table */}
          <Card>
            <CardContent className="p-0">
              <div className="max-h-96 overflow-y-auto nice-scroll">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead className="text-right">رتبه</TableHead>
                      <TableHead className="text-right">همکار</TableHead>
                      <TableHead className="text-right">امتیاز</TableHead>
                      <TableHead className="text-right hidden md:table-cell">آخرین پاداش</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rest.map((row) => (
                      <TableRow key={row.id} className={row.id === user?.id ? 'bg-accent/50' : ''}>
                        <TableCell className="num font-bold">{toFaDigits(row.rank)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <UserAvatar name={row.name} color={row.color} size={32} />
                            <div>
                              <p className="text-sm font-bold">{row.name}{row.id === user?.id && ' (تو)'}</p>
                              <p className="text-[11px] text-muted-foreground">{row.title}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><PointsBadge points={row.points} /></TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                          {row.recentAwards[0]?.reason ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <GrantDialog
        open={grantOpen}
        onClose={() => setGrantOpen(false)}
        onDone={() => { loadBoard(); loadMine(); toast({ title: 'امتیاز ثبت شد 🎉' }) }}
      />
    </div>
  )
}

// 14-day awards bar chart
function AwardsChart() {
  const [data, setData] = React.useState<{ label: string; count: number }[] | null>(null)

  React.useEffect(() => {
    api<{ leaderboard: LeaderRow[] }>('/api/awards?leaderboard=1')
      .then((d) => {
        const counts = new Map<string, number>()
        for (let i = 13; i >= 0; i--) {
          const day = new Date()
          day.setDate(day.getDate() - i)
          const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
          counts.set(key, 0)
        }
        for (const row of d.leaderboard) {
          for (const a of row.recentAwards) {
            const key = `${new Date(a.createdAt).getFullYear()}-${String(new Date(a.createdAt).getMonth() + 1).padStart(2, '0')}-${String(new Date(a.createdAt).getDate()).padStart(2, '0')}`
            if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1)
          }
        }
        const days = Array.from(counts.entries()).map(([, count], idx) => {
          const dt = new Date()
          dt.setDate(dt.getDate() - (13 - idx))
          return { label: formatJalali(dt).slice(5), count }
        })
        setData(days)
      })
      .catch(() => setData([]))
  }, [])

  if (!data) return <LoadingBlock rows={2} />
  if (data.every((d) => d.count === 0)) return null
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm font-bold mb-3">امتیازهای ۱۴ روز اخیر 📊</p>
        <div className="h-44" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb55" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} reversed />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} orientation="right" width={28} />
              <Tooltip
                contentStyle={{ fontFamily: 'inherit', fontSize: 12, borderRadius: 12, textAlign: 'right' }}
                formatter={(v: number) => [`${v} امتیاز`, '']}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.count > 0 ? '#C9A227' : '#8A8F9822'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

function GrantDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast()
  const [users, setUsers] = React.useState<LeaderRow[]>([])
  const [userId, setUserId] = React.useState('')
  const [points, setPoints] = React.useState(5)
  const [reason, setReason] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    api<{ leaderboard: LeaderRow[] }>('/api/awards?leaderboard=1')
      .then((d) => setUsers(d.leaderboard))
      .catch(() => setUsers([]))
  }, [open])

  const submit = async () => {
    if (!userId || !reason.trim()) return
    setSaving(true)
    try {
      await api('/api/awards', { body: { userId, points, reason } })
      onDone()
      onClose()
      setReason('')
      setPoints(5)
    } catch (e) {
      toast({ title: 'ثبت نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-gold" /> اعطای امتیاز به همکار
          </DialogTitle>
          <DialogDescription>قدرشناسی کوچک، انگیزه‌ی بزرگ ✨</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>همکار</Label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="w-full h-10 rounded-xl border border-input bg-card px-3 text-sm">
              <option value="">— انتخاب —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.points} امتیاز)</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>امتیاز</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" className="h-10 w-10" onClick={() => setPoints((p) => Math.max(1, p - 1))}>−</Button>
              <Input value={points} onChange={(e) => setPoints(Math.max(1, Number(e.target.value) || 1))} inputMode="numeric" className="h-10 text-center num" />
              <Button type="button" variant="outline" size="icon" className="h-10 w-10" onClick={() => setPoints((p) => p + 1)}>+</Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>دلیل</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: پوشش نکوهیده شیفت عصر" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>انصراف</Button>
            <Button onClick={submit} disabled={saving || !userId || !reason.trim()} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} اعطای امتیاز
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
