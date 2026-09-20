'use client'

import * as React from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { SectionHeader, EmptyState, LoadingBlock, UserAvatar } from '@/components/platform/ui/shared'
import { formatJalaliDateTime, toFaDigits } from '@/lib/jalali'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Search, History, ChevronDown } from 'lucide-react'

interface LogDTO {
  id: string
  userId?: string | null
  userName: string
  action: string
  entity?: string | null
  entityId?: string | null
  detail?: string | null
  createdAt: string
}

export function ActivityLog() {
  const { toast } = useToast()
  const [logs, setLogs] = React.useState<LogDTO[] | null>(null)
  const [locked, setLocked] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [take, setTake] = React.useState(100)
  const [hasMore, setHasMore] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)

  const load = React.useCallback(async (q: string, count: number) => {
    try {
      const d = await api<LogDTO[]>(`/api/activity?q=${encodeURIComponent(q)}&take=${count + 1}`)
      setHasMore(d.length > count)
      setLogs(d.slice(0, count))
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      // analytics is admin-only — managers see a graceful locked state, not an error
      if (msg.includes('دسترسی') || msg.includes('فعال نیست')) {
        setLocked(true)
        setLogs([])
      } else {
        toast({ title: 'دریافت گزارش ناموفق', description: msg, variant: 'destructive' })
        setLogs([])
      }
    }
  }, [toast])

  React.useEffect(() => {
    const t = setTimeout(() => { setLogs(null); load(query, take) }, query ? 350 : 0)
    return () => clearTimeout(t)
  }, [query, take, load])

  return (
    <div className="space-y-4">
      <SectionHeader
        title="گزارش فعالیت"
        subtitle="مسیر کار تیم برای شفافیت و یادگیری — نه برای سرزنش 🌿"
        icon={<History className="h-5 w-5" />}
      />

      {locked ? (
        <EmptyState
          icon={<History />}
          title="این بخش برای نقش شما فعال نیست"
          description="گزارش فعالیت تنها برای مدیر سامانه فعال است؛ رویدادهای مهم تیم همچنان از طریق دیوار همکاری و اعلان‌ها به اشتراک گذاشته می‌شود."
        />
      ) : (
      <>
      <div className="relative">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جستجو در نام، عمل یا جزئیات…"
          className="pr-12 h-12 rounded-2xl"
        />
      </div>

      {!logs ? <LoadingBlock rows={6} /> : logs.length === 0 ? (
        <EmptyState icon={<History />} title="فعالیتی با این جستجو پیدا نشد" description="عبارت دیگری را امتحان کن." />
      ) : (
        <Card>
          <CardContent className="p-4">
            <div className="relative space-y-0">
              {logs.map((log, i) => (
                <div key={log.id} className="relative flex gap-3 pb-5">
                  {/* timeline line */}
                  {i < logs.length - 1 && <span className="absolute right-[17px] top-10 bottom-0 w-px bg-border" />}
                  <div className="relative z-10 shrink-0 pt-0.5">
                    <UserAvatar name={log.userName} color={colorOf(log.userName)} size={36} />
                  </div>
                  <div className="min-w-0 flex-1 rounded-xl border bg-card p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm">
                        <span className="font-bold">{log.userName}</span>
                        <span className="text-muted-foreground"> — {log.action}</span>
                      </p>
                      <span className="text-[11px] text-muted-foreground num shrink-0">{formatJalaliDateTime(log.createdAt)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {log.entity && (
                        <Badge variant="secondary" className="rounded-full text-[10px]">
                          {log.entity}{log.entityId ? ` #${toFaDigits(log.entityId.slice(-4))}` : ''}
                        </Badge>
                      )}
                      {log.detail && <span className="text-xs text-muted-foreground truncate max-w-full">{log.detail}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline" className="gap-1.5" disabled={loadingMore}
                  onClick={() => { setLoadingMore(true); setTake((t) => t + 100); setLoadingMore(false) }}
                >
                  <ChevronDown className="h-4 w-4" /> نمایش بیشتر
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      </>
      )}
    </div>
  )
}

// deterministic pleasant color per username
function colorOf(name: string) {
  const palette = ['#3E7C59', '#C9A227', '#D9832E', '#B33A3A', '#8A6F3C', '#5E8C61', '#7D5BA6', '#B07D2B']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}
