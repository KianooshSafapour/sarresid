// Small shared helpers for print documents
export const ORDER_STATUSES: Record<string, { label: string }> = {
  DRAFT: { label: 'پیش‌نویس' },
  PENDING_APPROVAL: { label: 'در انتظار تأیید' },
  APPROVED: { label: 'تأیید شده' },
  EXPECTED: { label: 'در انتظار دریافت' },
  RECEIVED: { label: 'دریافت شده' },
  INSPECTED: { label: 'کنترل شده' },
  TO_HOLOO: { label: 'ثبت در هلو' },
  DONE: { label: 'تکمیل شده' },
  CANCELLED: { label: 'لغو شده' },
}

export const PAYMENT_LABELS_FALLBACK: Record<string, string> = {
  CHEQUE: 'چک',
  CASH_ON_DELIVERY: 'نقدی هنگام تحویل',
}
