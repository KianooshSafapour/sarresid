'use client'
import * as React from 'react'
import { api } from '@/lib/api'
import type { PUser } from '@/lib/types'
import { toFaDigits } from '@/lib/jalali'
import {
  Avatar, Badge, Card, EmptyState, Loading, RoleBadge, SectionHeader, TimeAgo,
} from './kit'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Sprout, Lock, Trophy, Users, Heart, Star } from 'lucide-react'

type PointsLogT = {
  id: number
  userId: number
  points: number
  reason: string
  awardedById: number | null
  createdAt: string
}
type StaffPoint = { name: string; points: number; color: string }

const LEVEL_TITLES = ['جوانه', 'شاخ و برگ', 'شکوفه', 'زیتون‌دار', 'استاد باغ']

const BADGES: { at: number; label: string; cls: string }[] = [
  { at: 10, label: '🌿 اولین برگ', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  { at: 25, label: '🌱 جوانه', cls: 'border-[#C8D8C0] bg-[#F3F7EF] text-[#3E6B4A]' },
  { at: 50, label: '🫒 زیتون کوچک', cls: 'border-[#EAD9A8] bg-[#FBF4DE] text-[#8A6508]' },
  { at: 100, label: '🏅 ستون تیم', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  { at: 200, label: '🏆 زیتون‌دار طلایی', cls: 'border-[#DAA520] bg-gradient-to-b from-[#FBF4DE] to-[#F0D890]/40 text-[#6B5A20]' },
  { at: 300, label: '💎 افتخار هایپر زیتون', cls: 'border-violet-200 bg-violet-50 text-violet-800' },
]

export default function ProfileSection({ user }: { user: PUser }) {
  const [logs, setLogs] = React.useState<PointsLogT[]>([])
  const [leaderboard, setLeaderboard] = React.useState<StaffPoint[]>([])
  const [usersNames, setUsersNames] = React.useState<Record<number, string>>({})
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let alive = true
    Promise.all([
      api.get<{ logs: PointsLogT[] }>(`/api/points?userId=${user.id}`),
      api.get<{ staffPoints: StaffPoint[] }>('/api/dashboard'),
      api.get<{ users: { id: number; name: string }[] }>('/api/users'),
    ])
      .then(([p, d, u]) => {
        if (!alive) return
        setLogs(p.logs)
        setLeaderboard(d.staffPoints ?? [])
        setUsersNames(Object.fromEntries(u.users.map((x) => [x.id, x.name])))
      })
      .catch(() => toast.error('خطا در بارگذاری پروفایل'))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [user.id])

  const points = user.points ?? 0
  const level = Math.floor(points / 25) + 1
  const levelTitle = LEVEL_TITLES[Math.min(level - 1, 4)]
  const progress = (points % 25) / 25

  return (
    <div>
      <SectionHeader
        title="پروفایل من"
        subtitle="امتیازها، نشان‌ها و جایگاه شما در باغ هایپر زیتون"
        icon={<Sprout size={20} />}
      />

      {loading ? <Loading /> : (
        <div className="space-y-5">
          {/* warm banner */}
          <div className="flex items-start gap-3 rounded-2xl border border-[#C8D8C0] bg-gradient-to-l from-[#F3F7EF] to-[#FBF9F3] px-4 py-3">
            <Heart size={18} className="mt-0.5 shrink-0 text-[#3E6B4A]" />
            <p className="text-xs font-semibold leading-relaxed text-[#3E6B4A] sm:text-sm">
              مدیریت تلاش روزانه شما را می‌بیند و قدردان است — اینجا ثبت می‌شود
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {/* ===== hero card ===== */}
            <Card className="relative overflow-hidden p-6 lg:col-span-2">
              <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-[#93C572]/15 blur-2xl" />
              <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                <Avatar name={user.name} color={user.color} size={88} />
                <div className="min-w-0 flex-1 text-center sm:text-right">
                  <h3 className="text-xl font-black text-[#253A2A]">{user.name}</h3>
                  <div className="mt-1.5 flex flex-wrap justify-center gap-1 sm:justify-start">
                    <RoleBadge roles={user.roles} />
                  </div>

                  <div className="mt-4 flex items-baseline justify-center gap-2 sm:justify-start">
                    <span className="pz-gold-text text-5xl font-black tabular-nums">{toFaDigits(points)}</span>
                    <span className="text-sm font-bold text-[#8A6508]">امتیاز زیتون</span>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-[#4A5A44]">
                      <span>سطح {toFaDigits(level)} — {levelTitle}</span>
                      <span className="text-[#8A9884]">{toFaDigits(points % 25)} / {toFaDigits(25)} تا سطح بعد</span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-[#EFEAD8]" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#B8860B] via-[#DAA520] to-[#F0D890] shadow-inner transition-all duration-700"
                        style={{ width: `${Math.max(progress * 100, 3)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* ===== mini leaderboard ===== */}
            <Card className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#253A2A]">
                <Trophy size={16} className="text-[#B8860B]" /> برترین‌های باغ
              </h3>
              {leaderboard.length === 0 ? (
                <p className="py-6 text-center text-xs text-[#A8A28C]">هنوز امتیازی ثبت نشده</p>
              ) : (
                <div className="pz-scroll max-h-72 space-y-1.5 overflow-y-auto">
                  {leaderboard.map((s, i) => {
                    const me = s.name === user.name
                    return (
                      <div
                        key={s.name + i}
                        className={cn(
                          'flex items-center gap-2.5 rounded-xl px-2.5 py-2',
                          me ? 'bg-gradient-to-l from-[#FBF4DE] to-transparent ring-1 ring-[#EAD9A8]' : 'bg-white/60'
                        )}
                      >
                        <span className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black',
                          i === 0 ? 'bg-[#DAA520] text-white' : i === 1 ? 'bg-[#C0C0C0] text-white' : i === 2 ? 'bg-[#B87333] text-white' : 'bg-[#F5F2E8] text-[#6B7A66]'
                        )}>
                          {toFaDigits(i + 1)}
                        </span>
                        <Avatar name={s.name} color={s.color} size={28} />
                        <span className={cn('min-w-0 flex-1 truncate text-xs font-semibold', me ? 'text-[#8A6508]' : 'text-[#33402F]')}>
                          {s.name}{me && ' (شما)'}
                        </span>
                        <span className="shrink-0 text-xs font-black tabular-nums text-[#3E6B4A]">{toFaDigits(s.points)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* ===== badges grid ===== */}
          <Card className="p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-[#253A2A]">
              <Star size={16} className="text-[#B8860B]" /> نشان‌های افتخار
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {BADGES.map((b) => {
                const earned = points >= b.at
                return (
                  <div
                    key={b.at}
                    className={cn(
                      'relative flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-4 text-center transition-all',
                      earned
                        ? cn(b.cls, 'shadow-sm hover:-translate-y-0.5 hover:shadow-md')
                        : 'border-dashed border-[#D8D2BC] bg-[#FBF9F3]/50 grayscale'
                    )}
                  >
                    {!earned && <Lock size={12} className="absolute right-2 top-2 text-[#A8A28C]" />}
                    <span className="text-2xl" aria-hidden>{b.label.split(' ')[0]}</span>
                    <span className={cn('text-[11px] font-bold leading-tight', earned ? '' : 'text-[#8A9884]')}>
                      {b.label.split(' ').slice(1).join(' ')}
                    </span>
                    <span className="text-[10px] tabular-nums text-[#8A9884]">{toFaDigits(b.at)} امتیاز</span>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* ===== points history ===== */}
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#253A2A]">
              <Users size={16} className="text-[#3E6B4A]" /> تاریخچه امتیازها
            </h3>
            {logs.length === 0 ? (
              <EmptyState
                icon={<Sprout size={34} />}
                title="هنوز امتیازی برای شما ثبت نشده"
                hint="با انجام روزانه کارها، امتیازهای شما اینجا جمع می‌شود"
              />
            ) : (
              <div className="pz-scroll max-h-96 space-y-1.5 overflow-y-auto">
                {logs.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 rounded-xl border border-[#EFEAD8] bg-white/70 px-3 py-2.5">
                    <span className={cn(
                      'flex h-9 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-black tabular-nums',
                      l.points >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                    )}>
                      {l.points >= 0 ? `+${toFaDigits(l.points)}` : toFaDigits(l.points)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-[#33402F]">{l.reason}</div>
                      <div className="text-[10px] text-[#8A9884]">
                        {l.awardedById && usersNames[l.awardedById] ? `اعطا توسط: ${usersNames[l.awardedById]} · ` : ''}
                        <TimeAgo iso={l.createdAt} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

