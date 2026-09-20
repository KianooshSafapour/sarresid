'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/store/app'
import { useToast } from '@/hooks/use-toast'
import { SectionHeader, EmptyState, LoadingBlock, UserAvatar, ConfirmButton } from '@/components/platform/ui/shared'
import { timeAgo, toFaDigits } from '@/lib/jalali'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { ChipSelect } from '@/components/platform/ui/shared'
import { Megaphone, Heart, Pin, PinOff, Loader2, Sparkles, Trash2 } from 'lucide-react'

interface WallPostDTO {
  id: string
  content: string
  category: string
  pinned: boolean
  likes: number
  createdAt: string
  author: { id: string; name: string; color: string; title: string }
}

const CATEGORIES = [
  { key: 'INFO', label: 'اطلاعیه', color: '#3E7C59' },
  { key: 'WARNING', label: 'هشدار', color: '#B33A3A' },
  { key: 'EVENT', label: 'رویداد', color: '#D9832E' },
  { key: 'TIP', label: 'نکته طلایی', color: '#C9A227' },
]

export function Wall() {
  const { user } = useApp()
  const { toast } = useToast()
  const isManager = !!user?.isManager
  const [posts, setPosts] = React.useState<WallPostDTO[] | null>(null)
  const [content, setContent] = React.useState('')
  const [category, setCategory] = React.useState('INFO')
  const [sending, setSending] = React.useState(false)
  const [liked, setLiked] = React.useState<Set<string>>(new Set())

  const load = React.useCallback(async () => {
    try {
      const d = await api<{ posts: WallPostDTO[] }>('/api/wall')
      setPosts(d.posts)
    } catch {
      setPosts([])
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!content.trim()) return
    setSending(true)
    try {
      const d = await api<{ awarded: boolean }>('/api/wall', { body: { content, category } })
      setContent('')
      toast({
        title: d.awarded ? 'ممنون از مشارکتت! +۱ امتیاز ⭐' : 'روی دیوار ثبت شد 🌿',
        description: d.awarded ? 'صدایت شنیده می‌شود — همین کار را ادامه بده' : undefined,
      })
      load()
    } catch (e) {
      toast({ title: 'ثبت نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  // optimistic like
  const like = async (post: WallPostDTO) => {
    if (liked.has(post.id)) return
    setLiked((prev) => new Set(prev).add(post.id))
    setPosts((prev) => prev?.map((p) => (p.id === post.id ? { ...p, likes: p.likes + 1 } : p)) ?? prev)
    try {
      await api('/api/wall', { method: 'PATCH', body: { id: post.id, likes: 'inc' } })
    } catch {
      setLiked((prev) => { const n = new Set(prev); n.delete(post.id); return n })
      setPosts((prev) => prev?.map((p) => (p.id === post.id ? { ...p, likes: Math.max(0, p.likes - 1) } : p)) ?? prev)
    }
  }

  const togglePin = async (post: WallPostDTO) => {
    try {
      await api('/api/wall', { method: 'PATCH', body: { id: post.id, pinned: !post.pinned } })
      load()
    } catch (e) {
      toast({ title: 'انجام نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  const remove = async (post: WallPostDTO) => {
    try {
      await api(`/api/wall?id=${post.id}`, { method: 'DELETE' })
      toast({ title: 'پست حذف شد' })
      load()
    } catch (e) {
      toast({ title: 'حذف نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="دیوار همکاری"
        subtitle="اخبار، رویدادها و نکته‌های طلایی تیم — جای صدای همه‌ی ما 🌿"
        icon={<Megaphone className="h-5 w-5" />}
      />

      {/* composer */}
      <Card className="glow-border-static">
        <CardContent className="p-4 space-y-3">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="چه چیزی می‌خواهی به بقیه بگویی؟ خبر، رویداد یا یک نکته طلایی…"
            rows={3}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ChipSelect options={CATEGORIES} value={category} onChange={setCategory} />
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-muted-foreground hidden sm:block">+۱ امتیاز برای هر مشارکت 💫</span>
              <Button onClick={submit} disabled={sending || !content.trim()} className="gap-1.5 h-11">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                به دیوار اضافه کن
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {!posts ? (
        <LoadingBlock rows={4} />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={<Sparkles />}
          title="دیوار هنوز خالی است"
          description="اولین پیام را تو بنویس — می‌تواند یک اطلاعیه ساده یا یک تجربه خوب از امروز باشد ✨"
        />
      ) : (
        <div className="columns-1 md:columns-2 xl:columns-3 gap-3 [&>*]:mb-3 [&>*]:break-inside-avoid">
          {posts.map((p) => {
            const cat = CATEGORIES.find((c) => c.key === p.category) ?? CATEGORIES[0]
            return (
              <Card key={p.id} className={`overflow-hidden ${p.pinned ? 'border-gold/60' : ''}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar name={p.author.name} color={p.author.color} size={38} />
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{p.author.name}</p>
                        <p className="text-[11px] text-muted-foreground">{p.author.title} · {timeAgo(p.createdAt)}</p>
                      </div>
                    </div>
                    {p.pinned && (
                      <span className="text-[11px] text-gold font-bold flex items-center gap-1 shrink-0">
                        <Pin className="h-3.5 w-3.5" /> سنجاق‌شده
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-6 whitespace-pre-wrap">{p.content}</p>
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
                    <span
                      className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                      style={{ backgroundColor: `${cat.color}1a`, color: cat.color }}
                    >
                      {cat.label}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm" variant="ghost"
                        className={`gap-1.5 h-9 ${liked.has(p.id) ? 'text-pomegranate' : 'text-muted-foreground'}`}
                        onClick={() => like(p)}
                      >
                        <Heart className={`h-4 w-4 ${liked.has(p.id) ? 'fill-current' : ''}`} />
                        <span className="num">{toFaDigits(p.likes)}</span>
                      </Button>
                      {isManager && (
                        <Button size="sm" variant="ghost" className="h-9" onClick={() => togglePin(p)} title={p.pinned ? 'برداشتن سنجاق' : 'سنجاق کردن'}>
                          {p.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                        </Button>
                      )}
                      {(user?.id === p.author.id || isManager) && (
                        <ConfirmButton onConfirm={() => remove(p)} confirmText="حذف؟" className="h-9 text-pomegranate" variant="ghost">
                          <Trash2 className="h-4 w-4" />
                        </ConfirmButton>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
