'use client'

// Accounting — Holoo registration queue, xlsx export, order completion
import * as React from 'react'
import {
  SectionHeader, StatusBadge, StatCard, EmptyState, LoadingBlock,
} from '@/components/platform/ui/shared'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, FileSpreadsheet, Calculator, CheckCircle2, Hourglass, Wallet } from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { money, toFaDigits, formatJalali } from '@/lib/jalali'
import { orderStatusInfo, chequeStatusInfo } from '@/lib/types'
import { useApp } from '@/store/app'

interface AccOrder {
  id: string
  code: string
  providerName: string
  status: string
  paymentType: string
  receivingDate: string
  finalAmount: number
  holooTotal?: number | null
  accountingDoneAt?: string | null
  itemsCount: number
}

interface AccCheque {
  id: string
  number: string
  amount: number
  status: string
  dueDate: string
}

interface OrderFull extends AccOrder {
  cheques: AccCheque[]
}

interface PaymentRow {
  id: string
  orderId?: string | null
  orderCode?: string | null
  amount: number
  type: string
  receiptNo?: string | null
  posReceiptNo?: string | null
  userName: string
  createdAt: string
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  CASH_ON_DELIVERY: 'نقدی',
  CHEQUE: 'چک',
  TRANSFER: 'انتقالی',
  OTHER: 'سایر',
}

export function Accounting() {
  const user = useApp((s) => s.user)
  const isAccountant = Boolean(user && (user.isManager || user.roleKeys.includes('accountant')))

  const [queue, setQueue] = React.useState<AccOrder[]>([])
  const [pendingInv, setPendingInv] = React.useState<AccOrder[]>([])
  const [completed, setCompleted] = React.useState<AccOrder[]>([])
  const [payments, setPayments] = React.useState<PaymentRow[]>([])
  const [meta, setMeta] = React.useState<{ todayCount: number; weekTotal: number } | null>(null)
  const [tolerance, setTolerance] = React.useState(1000)
  const [loading, setLoading] = React.useState(true)
  const [holooInputs, setHolooInputs] = React.useState<Record<string, string>>({})
  const [exporting, setExporting] = React.useState<string | null>(null)
  const [doneOrder, setDoneOrder] = React.useState<OrderFull | null>(null)
  const [doneLoading, setDoneLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [receiptNo, setReceiptNo] = React.useState('')
  const [posReceiptNo, setPosReceiptNo] = React.useState('')

  const refresh = React.useCallback(async () => {
    try {
      const [q, p, all, pay] = await Promise.all([
        api<AccOrder[]>('/api/orders?status=CONFIRMED_BY_INVENTORY'),
        api<AccOrder[]>('/api/orders?status=RECEIVED_BY_DELIVERY'),
        api<AccOrder[]>('/api/orders'),
        api<{ payments: PaymentRow[]; meta: { todayCount: number; weekTotal: number } }>('/api/payments?take=60'),
      ])
      setQueue(q)
      setPendingInv(p)
      setCompleted(all.filter((o) => ['DONE', 'ACCOUNTING_DONE'].includes(o.status)).slice(0, 12))
      setPayments(pay.payments)
      setMeta(pay.meta)
    } catch (e) {
      toast({ title: 'خطا در دریافت داده‌های حسابداری', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    refresh()
    api<Record<string, string>>('/api/settings')
      .then((s) => {
        const t = Number(s.tolerance_toman)
        if (!isNaN(t) && t > 0) setTolerance(t)
      })
      .catch(() => null)
  }, [refresh])

  const exportXlsx = async (o: AccOrder) => {
    setExporting(o.id)
    try {
      await downloadBlob(`/api/orders/${o.id}/export`, `${o.code}.xlsx`)
      toast({ title: `فایل ${o.code}.xlsx دانلود شد`, description: 'آماده ورود در هولو' })
    } catch (e) {
      toast({ title: 'خطا در خروجی اکسل', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setExporting(null)
    }
  }

  const openDoneDialog = async (o: AccOrder) => {
    setDoneLoading(true)
    setReceiptNo('')
    setPosReceiptNo('')
    try {
      const full = await api<OrderFull>(`/api/orders/${o.id}`)
      setDoneOrder(full)
      setHolooInputs((prev) => ({ ...prev, [o.id]: prev[o.id] ?? (o.holooTotal ? String(o.holooTotal) : '') }))
    } catch (e) {
      toast({ title: 'خطا در باز کردن سفارش', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setDoneLoading(false)
    }
  }

  const submitDone = async () => {
    if (!doneOrder) return
    setSaving(true)
    try {
      const holooTotal = holooInputs[doneOrder.id] ? Number(holooInputs[doneOrder.id]) : undefined
      await api(`/api/orders/${doneOrder.id}/status`, {
        body: {
          action: 'mark_accounting_done',
          payload: {
            holooTotal,
            payment: {
              type: doneOrder.paymentType === 'CASH' ? 'CASH_ON_DELIVERY' : 'CHEQUE',
              receiptNo: receiptNo || undefined,
              posReceiptNo: posReceiptNo || undefined,
              amount: doneOrder.finalAmount,
            },
          },
        },
      })
      toast({ title: `سفارش ${doneOrder.code} ثبت و تکمیل شد ✅`, description: 'به همه مدیران اطلاع داده شد' })
      setDoneOrder(null)
      refresh()
    } catch (e) {
      toast({ title: 'خطا در ثبت هولو', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="حسابداری و هولو"
        subtitle="مغایرت‌گیری مبلغ، خروجی اکسل و ثبت نهایی سفارش‌ها"
        icon={<Calculator className="h-6 w-6" />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="آماده ثبت هولو" value={toFaDigits(queue.length)} color="#2E6E8E" icon={<Hourglass className="h-5 w-5" />} />
        <StatCard title="در انتظار تأیید انبار" value={toFaDigits(pendingInv.length)} color="#8A8F98" icon={<Hourglass className="h-5 w-5" />} />
        <StatCard title="ثبت امروز" value={toFaDigits(meta?.todayCount ?? 0)} color="#3E7C59" icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard title="مبلغ کل هفته" value={<span className="num">{money(meta?.weekTotal ?? 0)}</span>} hint="تومان" color="#C9A227" icon={<Wallet className="h-5 w-5" />} />
      </div>

      {loading ? (
        <LoadingBlock rows={4} />
      ) : (
        <>
          {/* main queue */}
          <div>
            <p className="text-sm font-bold mb-2">آماده ثبت در هولو</p>
            {queue.length === 0 ? (
              <EmptyState icon={<Calculator />} title="صف ثبت خالی است" description="سفارش‌های تأییدشده انبار اینجا نمایش داده می‌شوند." />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {queue.map((o) => {
                  const holoo = holooInputs[o.id] ? Number(holooInputs[o.id]) : null
                  const diff = holoo !== null && !isNaN(holoo) ? holoo - o.finalAmount : null
                  return (
                    <div key={o.id} className="glow-border-static rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="num font-bold text-sm">{o.code}</span>
                        <StatusBadge {...statusProps(o.status)} />
                      </div>
                      <p className="text-sm">{o.providerName}</p>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="num font-extrabold text-lg text-primary">{money(o.finalAmount)} <span className="text-[10px] font-normal text-muted-foreground">تومان</span></span>
                        <span className="text-muted-foreground">{toFaDigits(o.itemsCount)} قلم • {o.paymentType === 'CASH' ? '💵 نقدی' : '🧾 چکی'}</span>
                      </div>
                      <div className="rounded-xl border border-border p-2.5 space-y-2 bg-card/60">
                        <label className="text-[11px] text-muted-foreground block">مبلغ نمایش‌داده‌شده در هولو (اختیاری):</label>
                        <Input
                          value={holooInputs[o.id] ?? ''}
                          onChange={(e) => setHolooInputs((prev) => ({ ...prev, [o.id]: e.target.value.replace(/[^\d.]/g, '') }))}
                          inputMode="numeric"
                          className="h-11 num text-sm"
                          aria-label={`مبلغ هولو ${o.code}`}
                        />
                        <p className="text-[11px] text-muted-foreground">اختلاف زیر {money(tolerance)} تومان قابل چشم‌پوشی است.</p>
                        {diff !== null && !isNaN(diff) && Math.abs(diff) > tolerance && (
                          <p className="text-xs num font-bold text-[#B33A3A]">اختلاف: {money(diff)} تومان — بررسی شود!</p>
                        )}
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" size="sm" className="touch-target" onClick={() => exportXlsx(o)} disabled={exporting === o.id}>
                          {exporting === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} خروجی اکسل (هولو)
                        </Button>
                        {isAccountant && (
                          <Button size="sm" className="touch-target font-bold" onClick={() => openDoneDialog(o)}>
                            <CheckCircle2 className="h-4 w-4" /> ثبت شد در هولو
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* pending inventory (dimmed) */}
          {pendingInv.length > 0 && (
            <div>
              <p className="text-sm font-bold mb-2 text-muted-foreground">در انتظار تأیید انبار</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 opacity-60">
                {pendingInv.map((o) => (
                  <div key={o.id} className="rounded-2xl border border-dashed border-border p-4 bg-card/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="num font-bold text-sm">{o.code}</span>
                      <StatusBadge {...statusProps(o.status)} />
                    </div>
                    <p className="text-sm mt-1.5">{o.providerName}</p>
                    <div className="flex items-center justify-between mt-2 text-xs">
                      <span className="num font-bold">{money(o.finalAmount)} تومان</span>
                      <span className="text-muted-foreground">{toFaDigits(o.itemsCount)} قلم</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* completed */}
          <div>
            <p className="text-sm font-bold mb-2">سفارش‌های تکمیل‌شده اخیر</p>
            {completed.length === 0 ? (
              <EmptyState icon={<CheckCircle2 />} title="هنوز سفارشی تکمیل نشده" />
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pl-1">
                {completed.map((o) => {
                  const pays = payments.filter((p) => p.orderId === o.id)
                  return (
                    <div key={o.id} className="rounded-xl border border-border bg-card p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="num font-bold text-sm">{o.code}</span>
                        <StatusBadge {...statusProps(o.status)} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                        <span>{o.providerName}</span>
                        <span className="num font-bold text-foreground">{money(o.finalAmount)} تومان</span>
                        {o.holooTotal ? <span className="num">هولو: {money(o.holooTotal)}</span> : null}
                        <span className="num">{formatJalali(o.accountingDoneAt ?? o.receivingDate)}</span>
                      </div>
                      {pays.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {pays.map((p) => (
                            <Badge key={p.id} variant="secondary" className="text-[10px] num bg-primary/10 text-primary">
                              {PAYMENT_TYPE_LABELS[p.type] ?? p.type} • {money(p.amount)}
                              {p.receiptNo ? ` • رسید ${p.receiptNo}` : ''}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* mark-done dialog */}
      <Dialog open={Boolean(doneOrder)} onOpenChange={(v) => { if (!v) setDoneOrder(null) }}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          {doneLoading || !doneOrder ? (
            <LoadingBlock rows={3} />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="num text-base">ثبت نهایی — {doneOrder.code}</DialogTitle>
                <DialogDescription className="text-xs">
                  {doneOrder.providerName} • مبلغ نهایی: <span className="num font-bold">{money(doneOrder.finalAmount)}</span> تومان
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold mb-1.5 block">مبلغ هولو (تومان)</label>
                  <Input
                    value={holooInputs[doneOrder.id] ?? ''}
                    onChange={(e) => setHolooInputs((prev) => ({ ...prev, [doneOrder.id]: e.target.value.replace(/[^\d.]/g, '') }))}
                    inputMode="numeric"
                    className="h-11 num"
                    aria-label="مبلغ هولو"
                  />
                  {holooInputs[doneOrder.id] && Number(holooInputs[doneOrder.id]) !== doneOrder.finalAmount && (
                    <p className="text-xs num mt-1 text-[#B07D2B]">اختلاف با سفارش: {money(Number(holooInputs[doneOrder.id]) - doneOrder.finalAmount)} تومان</p>
                  )}
                </div>

                {doneOrder.paymentType === 'CASH' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-bold mb-1.5 block">شماره رسید</label>
                      <Input value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} className="h-11 num" placeholder="رسید…" aria-label="شماره رسید" />
                    </div>
                    <div>
                      <label className="text-xs font-bold mb-1.5 block">شماره رسید POS</label>
                      <Input value={posReceiptNo} onChange={(e) => setPosReceiptNo(e.target.value)} className="h-11 num" placeholder="POS…" aria-label="شماره رسید POS" />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border p-3 space-y-1.5">
                    <p className="text-xs font-bold">چک‌های مرتبط با این سفارش</p>
                    {doneOrder.cheques.length === 0 ? (
                      <p className="text-xs text-muted-foreground">چکی ثبت نشده — از بخش «چک‌ها» صادر کنید یا یادداشت بگذارید.</p>
                    ) : (
                      doneOrder.cheques.map((c) => {
                        const ci = chequeStatusInfo(c.status)
                        return (
                          <div key={c.id} className="flex items-center justify-between text-xs">
                            <span className="num">{c.number}</span>
                            <span className="num">{money(c.amount)}</span>
                            <span style={{ color: ci.color }} className="font-bold">{ci.label}</span>
                            <span className="num text-muted-foreground">{formatJalali(c.dueDate)}</span>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" className="touch-target" onClick={() => setDoneOrder(null)} disabled={saving}>انصراف</Button>
                <Button size="sm" className="touch-target font-bold" onClick={submitDone} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} ثبت قطعی در هولو
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function statusProps(status: string) {
  const info = orderStatusInfo(status)
  return { label: info.label, color: info.color }
}
