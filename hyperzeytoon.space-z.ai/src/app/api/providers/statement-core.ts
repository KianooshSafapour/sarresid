import { db } from '@/lib/db'

// ------------------------------------------------------------------
// Shared provider statement core — used by the single-provider route
// and the bulk «همه تأمین‌کنندگان» workbook.
// Debit  = settled purchases (orders confirmed by inventory / accounting done / done)
// Credit = payments recorded against those orders + cheques delivered/collected/cleared
// Balance>0 → «مانده بدهی ما به تأمین‌کننده»
// ------------------------------------------------------------------

export const SETTLED_CHEQUE_STATUSES = new Set(['DELIVERED', 'COLLECTED', 'CLEARED'])

export type StatementRow = {
  id: string
  type: 'ORDER' | 'PAYMENT' | 'CHEQUE'
  date: string
  label: string
  ref: string
  debit: number
  credit: number
  balance: number
}

export type ProviderStatement = {
  provider: {
    id: string
    name: string
    phone: string | null
    kind: string
    color: string
    companies: string[]
  }
  rows: StatementRow[]
  summary: {
    purchases: number
    paidOther: number
    settledCheques: number
    balance: number
    ordersCount: number
    cancelledCount: number
    openChequeCount: number
    openChequeAmount: number
    lastActivityAt: string | null
  }
}

export async function buildProviderStatement(providerId: string): Promise<ProviderStatement | null> {
  const provider = await db.provider.findUnique({
    where: { id: providerId },
    include: { companies: { include: { company: { select: { name: true } } } } },
  })
  if (!provider) return null

  const orders = await db.order.findMany({
    where: {
      providerId,
      status: { in: ['CONFIRMED_BY_INVENTORY', 'ACCOUNTING_DONE', 'DONE'] },
    },
    select: {
      id: true, code: true, status: true, finalAmount: true, holooTotal: true,
      receivingDate: true, confirmedAt: true, accountingDoneAt: true, paymentType: true,
    },
    orderBy: { receivingDate: 'asc' },
  })

  const orderIds = orders.map((o) => o.id)
  const [payments, cheques] = await Promise.all([
    orderIds.length
      ? db.payment.findMany({
          where: { orderId: { in: orderIds } },
          select: { id: true, orderId: true, amount: true, type: true, receiptNo: true, posReceiptNo: true, createdAt: true },
        })
      : Promise.resolve([]),
    orderIds.length
      ? db.cheque.findMany({
          where: { orderId: { in: orderIds } },
          select: { id: true, orderId: true, number: true, amount: true, status: true, dueDate: true, writtenAt: true },
        })
      : Promise.resolve([]),
  ])

  const orderCodeById = new Map(orders.map((o) => [o.id, o.code]))
  const orderDate = (o: (typeof orders)[number]) => o.accountingDoneAt ?? o.confirmedAt ?? o.receivingDate

  const raw: Omit<StatementRow, 'balance'>[] = []
  for (const o of orders) {
    raw.push({
      id: `o-${o.id}`,
      type: 'ORDER',
      date: orderDate(o).toISOString(),
      label: 'خرید کالا (سفارش)',
      ref: o.code,
      debit: Math.round(o.holooTotal && o.holooTotal > 0 ? o.holooTotal : o.finalAmount),
      credit: 0,
    })
  }
  for (const p of payments) {
    const typeLabel =
      p.type === 'CHEQUE' ? 'پرداخت با چک (ثبت هولو)'
      : p.type === 'TRANSFER' ? 'پرداخت کارت‌به‌کارت'
      : p.type === 'OTHER' ? 'پرداخت متفرقه'
      : 'پرداخت نقدی هنگام تحویل'
    const instr = [p.receiptNo ? `رسید ${p.receiptNo}` : '', p.posReceiptNo ? `POS ${p.posReceiptNo}` : ''].filter(Boolean).join(' — ')
    raw.push({
      id: `p-${p.id}`,
      type: 'PAYMENT',
      date: p.createdAt.toISOString(),
      label: instr ? `${typeLabel} (${instr})` : typeLabel,
      ref: orderCodeById.get(p.orderId ?? '') ?? '—',
      debit: 0,
      credit: Math.round(p.amount),
    })
  }
  for (const c of cheques) {
    if (!SETTLED_CHEQUE_STATUSES.has(c.status)) continue
    raw.push({
      id: `c-${c.id}`,
      type: 'CHEQUE',
      date: (c.writtenAt ?? c.dueDate).toISOString(),
      label: `تحویل چک شماره ${c.number}`,
      ref: orderCodeById.get(c.orderId ?? '') ?? '—',
      debit: 0,
      credit: Math.round(c.amount),
    })
  }
  raw.sort((a, b) => a.date.localeCompare(b.date))

  let balance = 0
  const rows: StatementRow[] = raw.map((r) => {
    balance += r.debit - r.credit
    return { ...r, balance }
  })

  const purchases = raw.filter((r) => r.type === 'ORDER').reduce((s, r) => s + r.debit, 0)
  const paidOther = raw.filter((r) => r.type === 'PAYMENT').reduce((s, r) => s + r.credit, 0)
  const settledCheques = raw.filter((r) => r.type === 'CHEQUE').reduce((s, r) => s + r.credit, 0)
  const openCheques = cheques.filter((c) => !SETTLED_CHEQUE_STATUSES.has(c.status))
  const cancelledish = await db.order.count({ where: { providerId, status: 'CANCELLED' } })

  return {
    provider: {
      id: provider.id,
      name: provider.name,
      phone: provider.phone,
      kind: provider.kind,
      color: provider.color,
      companies: provider.companies.map((pc) => pc.company.name),
    },
    rows,
    summary: {
      purchases,
      paidOther,
      settledCheques,
      balance,
      ordersCount: orders.length,
      cancelledCount: cancelledish,
      openChequeCount: openCheques.length,
      openChequeAmount: openCheques.reduce((s, c) => s + Math.round(c.amount), 0),
      lastActivityAt: rows.length ? rows[rows.length - 1].date : null,
    },
  }
}
