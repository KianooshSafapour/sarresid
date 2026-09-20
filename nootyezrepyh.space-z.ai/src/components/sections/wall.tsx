'use client'

import * as React from 'react'
import { api, type ClientUser } from '@/lib/api-client'
import { canUser, PERMISSIONS } from '@/lib/constants'
import { toFaDigits, formatJalali } from '@/lib/jalali'
import { GlowCard, SectionHeader, EmptyState, OrnamentDivider } from '@/components/zeytoon-ui'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Toaster } from '@/components/ui/toaster'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Heart, Pin, Trash2, Loader2, Send } from 'lucide-react'

interface WallPost {
  id: string
  content: string
  pinned: boolean
  likes: string // JSON array of userIds
  createdAt: string
  authorId: string
  authorName: string
  authorColor: string
}

export function WallSection({ user }: { user: ClientUser }) {
  const isManager = canUser(user.roles, PERMISSIONS.MANAGE_TASKS) || canUser(user.roles, PERMISSIONS.AWARD_POINTS)
  const { toast } = useToast()
  const [posts, setPosts] = React.useState<WallPost[] | null>(null)
  const [draft, setDraft] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(() => {
    api.get<WallPost[]>('/api/wall').then(setPosts).catch(() => setPosts([]))
  }, [])
  React.useEffect(() => { load() }, [load])

  async function send() {
    if (!draft.trim()) return
    setBusy(true)
    try {
      await api.post('/api/wall', { content: draft.trim() })
      setDraft('')
      toast({ title: 'پیامت روی دیوار رفت! 🌿', description: 'ممنون که تیم رو هم‌قدم نگه می‌داری' })
      load()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  async function toggleLike(p: WallPost) {
    const likes = parseLikes(p.likes)
    const iLiked = likes.includes(user.id)
    // optimistic
    setPosts((prev) => prev ? prev.map((x) => x.id === p.id ? { ...x, likes: JSON.stringify(toggle(likes, user.id)) } : x) : prev)
    try { await api.patch(`/api/wall/${p.id}`, { like: true }) } catch { load() }
    if (!iLiked) toast({ title: 'لایک شد ❤️' })
  }

  async function togglePin(p: WallPost) {
    try {
      await api.patch(`/api/wall/${p.id}`, { pinned: !p.pinned })
      load()
    } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  async function remove(p: WallPost) {
    if (!window.confirm('این پست حذف شود؟')) return
    try { await api.delete(`/api/wall/${p.id}`); load() } catch (e) {
      toast({ title: 'خطا', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  const sorted = [...(posts || [])].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return (
    <div className="max-w-2xl mx-auto">
      <SectionHeader title="دیوار تیمی" subtitle="اخبار فروشگاه، یادآوری‌ها و لحظه‌های خوب تیم — این‌جا همیشه به‌روزه 🌿" />

      {/* Composer */}
      <GlowCard className="p-4 mb-5">
        <div className="flex gap-3">
          <div className="size-10 shrink-0 rounded-full flex items-center justify-center text-white font-black" style={{ background: user.color }}>
            {user.name.replace('خانم ', '').replace('آقای ', '').charAt(0)}
          </div>
          <div className="flex-1 space-y-2.5">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="چه خبر؟ برای تیم بنویس... (یادآوری، تشکر، خبر خوب)"
              className="min-h-20 bg-transparent"
            />
            <div className="flex justify-end">
              <Button onClick={send} disabled={busy || !draft.trim()} className="h-10 px-5 font-bold bg-olive hover:bg-olive/90 text-white">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <><Send className="size-4 ml-1.5" /> ارسال</>}
              </Button>
            </div>
          </div>
        </div>
        <OrnamentDivider className="my-2" />
      </GlowCard>

      {/* Feed */}
      {!posts ? (
        <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      ) : sorted.length === 0 ? (
        <EmptyState icon="🧱" title="دیوار هنوز خالیه!" description="اولین پست رو تو بنویس و تیم رو روشن کن ✨" />
      ) : (
        <div className="space-y-4">
          {sorted.map((p) => {
            const likes = parseLikes(p.likes)
            const iLiked = likes.includes(user.id)
            const canDelete = isManager || p.authorId === user.id
            return (
              <div key={p.id} className={cn('glow-card p-4', p.pinned && 'ring-1 ring-gold/50')}>
                <div className="flex items-center gap-3 mb-2.5">
                  <div className="size-10 shrink-0 rounded-full flex items-center justify-center text-white font-black" style={{ background: p.authorColor }}>
                    {p.authorName.replace('خانم ', '').replace('آقای ', '').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm flex items-center gap-1.5 flex-wrap">
                      {p.authorName}
                      {p.pinned && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-gold/15 text-gold px-2 py-0.5 text-[10px] font-bold">
                          <Pin className="size-3" /> سنجاق‌شده
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground" title={toFaDigits(formatJalali(p.createdAt))}>{relTime(p.createdAt)}</div>
                  </div>
                  {isManager && (
                    <Button variant="ghost" size="icon" className={cn('size-9 shrink-0', p.pinned ? 'text-gold' : 'text-muted-foreground')} onClick={() => togglePin(p)} aria-label={p.pinned ? 'برداشتن سنجاق' : 'سنجاق کردن'} title={p.pinned ? 'برداشتن سنجاق' : 'سنجاق کردن'}>
                      <Pin className="size-4" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button variant="ghost" size="icon" className="size-9 shrink-0 text-muted-foreground hover:text-red-600" onClick={() => remove(p)} aria-label="حذف پست">
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
                <p className="text-[15px] leading-7 whitespace-pre-wrap">{p.content}</p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => toggleLike(p)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold border transition-all active:scale-95',
                      iLiked ? 'bg-rose-50 border-rose-300 text-rose-600' : 'border-gold/25 text-muted-foreground hover:border-rose-300 hover:text-rose-500'
                    )}
                  >
                    <Heart className={cn('size-4', iLiked && 'fill-current')} />
                    {likes.length > 0 ? toFaDigits(likes.length) : 'دوست دارم'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <Toaster />
    </div>
  )
}

/* ==================== HELPERS ==================== */

function parseLikes(json: string): string[] {
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.map(String) : []
  } catch { return [] }
}

function toggle(arr: string[], id: string): string[] {
  return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]
}

function relTime(d: string): string {
  const diff = Date.now() - new Date(d).getTime()
  if (isNaN(diff)) return ''
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'همین حالا ✨'
  if (m < 60) return `${toFaDigits(m)} دقیقه پیش`
  const h = Math.floor(m / 60)
  if (h < 24) return `${toFaDigits(h)} ساعت پیش`
  const days = Math.floor(h / 24)
  if (days < 7) return `${toFaDigits(days)} روز پیش`
  return toFaDigits(formatJalali(d))
}

