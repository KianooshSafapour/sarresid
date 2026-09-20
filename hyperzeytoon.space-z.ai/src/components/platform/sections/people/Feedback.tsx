'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/store/app'
import { useToast } from '@/hooks/use-toast'
import { SectionHeader, EmptyState, LoadingBlock, StatusBadge, ChipSelect } from '@/components/platform/ui/shared'
import { timeAgo, toFaDigits } from '@/lib/jalali'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Lightbulb, Star, Shield, Plus, Loader2, Sparkles, Gift, MessageSquareHeart, EyeOff,
} from 'lucide-react'

interface FeedbackDTO {
  id: string
  content: string
  rating?: number | null
  anonymous: boolean
  status: string
  adminReply?: string | null
  createdAt: string
  authorName?: string | null
  authorColor?: string | null
}

interface IdeaDTO {
  id: string
  title: string
  content: string
  status: string
  rewardPoints: number
  adminNote?: string | null
  createdAt: string
  mine: boolean
  authorName: string
  authorColor: string
}

const IDEA_STATUSES = [
  { key: 'SUBMITTED', label: 'ثبت شده', color: '#8A8F98' },
  { key: 'UNDER_REVIEW', label: 'در حال بررسی', color: '#D9832E' },
  { key: 'ACCEPTED', label: 'پذیرفته شد', color: '#3E7C59' },
  { key: 'IMPLEMENTED', label: 'اجرا شد', color: '#C9A227' },
  { key: 'REJECTED', label: 'این بار نه', color: '#B33A3A' },
]

function ideaStatusInfo(key: string) {
  return IDEA_STATUSES.find((s) => s.key === key) ?? { key, label: key, color: '#8A8F98' }
}

export function Feedback() {
  const { user } = useApp()
  const isManager = !!user?.isManager
  const [tab, setTab] = React.useState('anonymous')

  return (
    <div className="space-y-4">
      <SectionHeader
        title="بازخورد و ایده‌ها"
        subtitle="صدای تو اینجا امن است — نظرت پلتفرم را برای همه بهتر می‌کند 💚"
        icon={<Lightbulb className="h-5 w-5" />}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="anonymous" className="flex-1 md:flex-none">نظر مخفیانه</TabsTrigger>
          <TabsTrigger value="ideas" className="flex-1 md:flex-none">ایده‌های من</TabsTrigger>
        </TabsList>
        <TabsContent value="anonymous" className="mt-3"><FeedbackTab isManager={isManager} /></TabsContent>
        <TabsContent value="ideas" className="mt-3"><IdeasTab isManager={isManager} /></TabsContent>
      </Tabs>
    </div>
  )
}

// ---------- anonymous feedback ----------
function FeedbackTab({ isManager }: { isManager: boolean }) {
  const { toast } = useToast()
  const [list, setList] = React.useState<FeedbackDTO[] | null>(null)
  const [content, setContent] = React.useState('')
  const [rating, setRating] = React.useState(0)
  const [anonymous, setAnonymous] = React.useState(true)
  const [sending, setSending] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const d = await api<{ feedback: FeedbackDTO[] }>('/api/feedback')
      setList(d.feedback)
    } catch {
      setList([])
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!content.trim()) return
    setSending(true)
    try {
      await api('/api/feedback', { body: { content, rating: rating || undefined, anonymous } })
      setContent('')
      setRating(0)
      toast({
        title: 'نظرت ثبت شد؛ ممنونیم 🌿',
        description: anonymous ? 'نظر تو بدون نام ثبت می‌شود — خیالت راحت.' : undefined,
      })
      load()
    } catch (e) {
      toast({ title: 'ثبت نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  const review = async (fb: FeedbackDTO, body: Record<string, unknown>) => {
    try {
      await api('/api/feedback', { method: 'PATCH', body: { id: fb.id, ...body } })
      load()
    } catch (e) {
      toast({ title: 'انجام نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      {/* form */}
      <Card className="glow-border-static">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Shield className="h-5 w-5" />
            <p className="font-bold text-sm">کاملاً محرمانه — تنها مدیریت می‌بیند و بدون قضاوت.</p>
          </div>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            placeholder="هر چه دل تنگت می‌خواهد بنویس… درباره پلتفرم، فروشگاه یا روند کارها"
          />
          <div className="space-y-1.5">
            <Label>به پلتفرم از ۱ تا ۵ چند ستاره می‌دهی؟</Label>
            <div className="flex gap-1.5 justify-center py-2" role="radiogroup" aria-label="امتیاز ستاره‌ای">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s} type="button" role="radio" aria-checked={rating === s} aria-label={`${s} ستاره`}
                  onClick={() => setRating(s)}
                  className="p-1.5 active:scale-90 transition-transform"
                >
                  <Star className={`h-9 w-9 transition-colors ${s <= rating ? 'fill-gold text-gold' : 'text-muted-foreground/40'}`} />
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold flex items-center gap-1.5">
                <EyeOff className="h-4 w-4 text-primary" /> ثبت بدون نام
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">نظر تو بدون نام ثبت می‌شود — حتی مدیریت هم نامت را نمی‌بیند.</p>
            </div>
            <Switch checked={anonymous} onCheckedChange={setAnonymous} />
          </div>
          <Button onClick={submit} disabled={sending || !content.trim()} className="w-full h-11 gap-1.5">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareHeart className="h-4 w-4" />}
            ارسال نظر
          </Button>
        </CardContent>
      </Card>

      {/* list */}
      <div className="space-y-3">
        <p className="text-sm font-bold text-muted-foreground px-1">
          {isManager ? 'بازخوردهای دریافتی' : 'بازخوردهای قبلی تو (نظرات مخفیانه نمایش داده نمی‌شوند)'}
        </p>
        {!list ? <LoadingBlock rows={3} /> : list.length === 0 ? (
          <EmptyState icon={<Sparkles />} title="هنوز بازخوردی نیست" description="اولین نفر باش — هر نظر می‌تواند فردای فروشگاه را بهتر کند." />
        ) : (
          <div className="space-y-3 max-h-[70vh] overflow-y-auto nice-scroll pe-1">
            {list.map((fb) => (
              <Card key={fb.id}>
                <CardContent className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {fb.anonymous || !fb.authorName ? (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <EyeOff className="h-3.5 w-3.5" /> بدون نام
                        </span>
                      ) : (
                        <span className="text-xs font-bold">{fb.authorName}</span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">{timeAgo(fb.createdAt)}</span>
                  </div>
                  {fb.rating ? (
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={`h-4 w-4 ${s <= (fb.rating ?? 0) ? 'fill-gold text-gold' : 'text-muted-foreground/30'}`} />
                      ))}
                    </div>
                  ) : null}
                  <p className="text-sm leading-6 whitespace-pre-wrap">{fb.content}</p>
                  {fb.adminReply && (
                    <div className="rounded-xl bg-accent p-3 text-xs leading-5">
                      <p className="font-bold text-primary mb-1">پاسخ مدیریت:</p>
                      {fb.adminReply}
                    </div>
                  )}
                  {isManager && (
                    <ManagerFeedbackActions fb={fb} onReview={review} />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ManagerFeedbackActions({ fb, onReview }: { fb: FeedbackDTO; onReview: (fb: FeedbackDTO, body: Record<string, unknown>) => void }) {
  const [reply, setReply] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const statusOptions = [
    { key: 'NEW', label: 'جدید', color: '#8A8F98' },
    { key: 'REVIEWED', label: 'بررسی شد', color: '#D9832E' },
    { key: 'ACTIONED', label: 'اقدام شد', color: '#3E7C59' },
  ]
  return (
    <div className="space-y-2 pt-1 border-t border-border/60">
      <div className="flex items-center gap-2 flex-wrap">
        <ChipSelect options={statusOptions} value={fb.status} onChange={(v) => onReview(fb, { status: v })} />
        <Button size="sm" variant="outline" className="h-9" onClick={() => { setReply(fb.adminReply ?? ''); setOpen(true) }}>
          پاسخ
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>پاسخ به بازخورد</DialogTitle>
            <DialogDescription>
              {fb.anonymous || !fb.authorName
                ? 'این نظر مخفیانه است — پاسخ فقط در همین بخش نمایش داده می‌شود.'
                : `پاسخ برای ${fb.authorName} ارسال اعلان می‌شود.`}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>انصراف</Button>
            <Button onClick={() => { onReview(fb, { adminReply: reply }); setOpen(false) }}>ارسال پاسخ</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------- ideas ----------
function IdeasTab({ isManager }: { isManager: boolean }) {
  const { toast } = useToast()
  const [ideas, setIdeas] = React.useState<IdeaDTO[] | null>(null)
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [content, setContent] = React.useState('')
  const [sending, setSending] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const d = await api<{ ideas: IdeaDTO[] }>('/api/ideas')
      setIdeas(d.ideas)
    } catch {
      setIdeas([])
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!title.trim() || !content.trim()) return
    setSending(true)
    try {
      await api('/api/ideas', { body: { title, content } })
      setOpen(false)
      setTitle('')
      setContent('')
      toast({ title: 'ایده‌ات ثبت شد 🌱', description: 'مدیریت بررسی می‌کند و اگر اجرا شود امتیاز ویژه می‌گیری!' })
      load()
    } catch (e) {
      toast({ title: 'ثبت نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  const updateIdea = async (idea: IdeaDTO, body: Record<string, unknown>) => {
    try {
      await api('/api/ideas', { method: 'PATCH', body: { id: idea.id, ...body } })
      toast({ title: 'بروزرسانی شد 🌿' })
      load()
    } catch (e) {
      toast({ title: 'انجام نشد', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-3">
      {!isManager && (
        <Button onClick={() => setOpen(true)} className="gap-1.5 h-11">
          <Plus className="h-4 w-4" /> ایده جدید ثبت کن
        </Button>
      )}
      {isManager && (
        <Button onClick={() => setOpen(true)} className="gap-1.5 h-11">
          <Plus className="h-4 w-4" /> ثبت ایده (از طرف خودم)
        </Button>
      )}
      {!ideas ? <LoadingBlock rows={3} /> : ideas.length === 0 ? (
        <EmptyState
          icon={<Lightbulb />}
          title="هنوز ایده‌ای ثبت نشده"
          description="یک فکر کوچک می‌تواند فروشگاه را بزرگ کند. نترس، هر ایده‌ای ارزش شنیده‌شدن دارد ✨"
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ideas.map((idea) => {
            const st = ideaStatusInfo(idea.status)
            return (
              <Card key={idea.id} className="glow-border-static">
                <CardContent className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-sm leading-6">{idea.title}</p>
                    <StatusBadge label={st.label} color={st.color} />
                  </div>
                  <p className="text-xs text-muted-foreground leading-5 line-clamp-4">{idea.content}</p>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: idea.authorColor }} />
                      {idea.mine ? 'ایده تو' : idea.authorName} · {timeAgo(idea.createdAt)}
                    </span>
                    {idea.rewardPoints > 0 && (
                      <Badge className="rounded-full text-white shrink-0 gap-1" style={{ background: 'linear-gradient(120deg,#c9a227,#8a6f3c)' }}>
                        <Gift className="h-3 w-3" /> {toFaDigits(idea.rewardPoints)} امتیاز
                      </Badge>
                    )}
                  </div>
                  {idea.adminNote && (
                    <p className="rounded-lg bg-accent p-2 text-[11px] leading-5">
                      <span className="font-bold text-primary">یادداشت مدیریت: </span>{idea.adminNote}
                    </p>
                  )}
                  {isManager && <ManagerIdeaActions idea={idea} onUpdate={updateIdea} />}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>ایده جدید</DialogTitle>
            <DialogDescription>هر ایده‌ای که کار ما را آسان‌تر یا مشتری خوشحال‌تر می‌کند، طلایی است.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان ایده" />
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} placeholder="توضیح بده چطور کار می‌کند…" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>انصراف</Button>
              <Button onClick={submit} disabled={sending || !title.trim() || !content.trim()} className="gap-1.5">
                {sending && <Loader2 className="h-4 w-4 animate-spin" />} ثبت ایده
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ManagerIdeaActions({ idea, onUpdate }: { idea: IdeaDTO; onUpdate: (idea: IdeaDTO, body: Record<string, unknown>) => void }) {
  const [reward, setReward] = React.useState(String(idea.rewardPoints || ''))
  const [note, setNote] = React.useState(idea.adminNote ?? '')
  return (
    <div className="space-y-2 pt-2 border-t border-border/60">
      <ChipSelect options={IDEA_STATUSES} value={idea.status} onChange={(v) => onUpdate(idea, { status: v })} />
      <div className="flex gap-2">
        <Input
          value={reward} onChange={(e) => setReward(e.target.value)} inputMode="numeric"
          placeholder="امتیاز هدیه" className="h-9 num"
        />
        <Input
          value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="یادداشت مدیریت" className="h-9"
        />
        <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={() => onUpdate(idea, { rewardPoints: Number(reward) || 0, adminNote: note })}>
          ذخیره
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">با انتخاب «پذیرفته شد» یا «اجرا شد»، امتیاز به‌صورت خودکار به صاحب ایده داده می‌شود 🎁</p>
    </div>
  )
}
