'use client'

/**
 * SandboxBanner — pill shown while حالت تمرین (sandbox) is active.
 * Fixed at the bottom-start, above the footer / mobile bottom bar.
 */

import * as React from 'react'
import { useSandboxStore, type JournalEntry } from '@/store/sandbox'
import { useToast } from '@/hooks/use-toast'
import { toFaDigits, timeAgo } from '@/lib/jalali'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FlaskConical, LogOut, ClipboardList, ScrollText } from 'lucide-react'

const METHOD_FA: Record<string, string> = {
  GET: 'دریافت',
  POST: 'ایجاد',
  PATCH: 'ویرایش',
  PUT: 'بروزرسانی',
  DELETE: 'حذف',
}

function entryLabel(e: JournalEntry): string {
  return `${METHOD_FA[e.method] ?? e.method} · ${e.url.replace(/^\/api\//, '')}`
}

export function SandboxBanner() {
  const enabled = useSandboxStore((s) => s.enabled)
  const journal = useSandboxStore((s) => s.journal)
  const disable = useSandboxStore((s) => s.disable)
  const clearJournal = useSandboxStore((s) => s.clearJournal)
  const { toast } = useToast()

  if (!enabled) return null

  const exit = () => {
    disable()
    clearJournal()
    toast({
      title: 'از حالت تمرین خارج شدید 🌿',
      description: 'همهٔ تغییرات آزمایشی پاک شد؛ از این پس تغییرات واقعاً ذخیره می‌شود.',
    })
  }

  return (
    <div
      className="fixed bottom-[4.75rem] lg:bottom-14 start-3 z-40 max-w-[calc(100vw-1.5rem)]"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-2xl border border-[#c9a227]/60 bg-gradient-to-l from-[#f5e3a8] via-[#f0d78c] to-[#e8c964] dark:from-[#3d3517] dark:via-[#4a3d17] dark:to-[#3d3517] backdrop-blur px-3 py-2 shadow-lg shadow-[#c9a227]/20">
        <FlaskConical className="h-4 w-4 text-[#8a6d13] dark:text-[#e0bc4a] shrink-0" aria-hidden />
        <p className="text-[11px] md:text-xs font-bold text-[#6b5409] dark:text-[#e0bc4a] leading-5">
          حالت تمرین فعال است — تغییرات واقعی ذخیره نمی‌شوند
        </p>
        <Badge className="rounded-full bg-[#8a6d13] text-white text-[10px] num shrink-0" title="تعداد تغییرات آزمایشی">
          {toFaDigits(journal.length)}
        </Badge>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-[11px] font-bold text-[#6b5409] dark:text-[#e0bc4a] hover:bg-[#c9a227]/25 dark:hover:bg-[#c9a227]/15"
            >
              <ClipboardList className="h-3.5 w-3.5" /> مشاهده کارنامه
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-80 p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <p className="font-bold text-sm flex items-center gap-1.5">
                <ScrollText className="h-4 w-4 text-[#8a6d13]" /> کارنامه حالت تمرین
              </p>
              <span className="text-[11px] text-muted-foreground num">{toFaDigits(journal.length)} تغییر</span>
            </div>
            <div className="max-h-64 overflow-y-auto nice-scroll p-2 space-y-1">
              {journal.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-6">
                  تا این لحظه تغییری در حالت تمرین ثبت نشده است.
                </p>
              ) : (
                journal.slice(0, 50).map((e, i) => (
                  <div key={`${e.ts}-${i}`} className="rounded-xl border bg-card px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">{entryLabel(e)}</p>
                      {e.body !== null && e.body !== undefined && Object.keys(e.body as object).length > 0 && (
                        <p className="text-[10px] text-muted-foreground truncate num" dir="ltr">
                          {JSON.stringify(e.body).slice(0, 60)}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(new Date(e.ts))}</span>
                  </div>
                ))
              )}
            </div>
            <div className="border-t px-4 py-2.5">
              <p className="text-[10px] text-muted-foreground leading-5">
                این فهرست تنها در همین دستگاه ذخیره می‌شود و با خروج از حالت تمرین پاک خواهد شد.
              </p>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          size="sm"
          className="h-8 gap-1.5 text-[11px] font-bold bg-[#8a6d13] hover:bg-[#755c0f] text-white shrink-0"
          onClick={exit}
        >
          <LogOut className="h-3.5 w-3.5" /> خروج از حالت تمرین
        </Button>
      </div>
    </div>
  )
}
