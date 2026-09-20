// Shared client-side types mirroring Prisma models (serialized dates as strings)

export interface SessionUser {
  id: string
  name: string
  username: string
  title: string
  gender: string
  color: string
  points: number
  roles: { key: string; name: string; isManager: boolean; color: string }[]
  isManager: boolean
  roleKeys: string[]
  isRoot?: boolean // root administrator — ultimate authority
  prefs?: string | null // JSON — UI personalization
  locale?: string // fa | en | ar | tr
}

export interface RoleDTO {
  id: string
  key: string
  name: string
  description?: string | null
  color: string
  isManager: boolean
}

export interface UserDTO {
  id: string
  username: string
  name: string
  title: string
  color: string
  phone?: string | null
  active: boolean
  points: number
  roles: { key: string; name: string; isManager: boolean; color: string }[]
}

export interface ProductDTO {
  id: string
  name: string
  altName?: string | null
  holooCode?: string | null
  category: string
  brand?: string | null
  unit: string
  sellPrice: number
  sellPrice2?: number | null
  buyPrice: number
  taxRate: number
  stock: number
  minStock: number
  capacity: number
  image?: string | null
  status: string
  notes?: string | null
  barcodes: { id: string; code: string; isPrimary: boolean }[]
}

export interface OrderItemDTO {
  id: string
  productId?: string | null
  name: string
  barcode?: string | null
  unit: string
  qty: number
  unitPrice: number
  discount: number
  tax: number
  vat: number
  total: number
  deliveredQty?: number | null
  correctedPrice?: number | null
  itemStatus: string
  issue?: string | null
  checkedAt?: string | null
}

export interface OrderHistoryDTO {
  id: string
  userName: string
  action: string
  detail?: string | null
  createdAt: string
}

export interface OrderDTO {
  id: string
  code: string
  providerId?: string | null
  companyId?: string | null
  providerName: string
  companyName?: string | null
  createdById: string
  createdByName?: string
  status: string
  paymentType: string
  receivingDate: string
  deliveredAt?: string | null
  confirmedAt?: string | null
  accountingDoneAt?: string | null
  totalAmount: number
  discount: number
  tax: number
  vat: number
  finalAmount: number
  holooTotal?: number | null
  note?: string | null
  correctionNote?: string | null
  lockedAt?: string | null
  createdAt: string
  updatedAt: string
  items: OrderItemDTO[]
  history?: OrderHistoryDTO[]
  cheques?: ChequeDTO[]
}

export interface ChequeDTO {
  id: string
  number: string
  amount: number
  dueDate: string
  issueDate: string
  payeeName: string
  payeePhone?: string | null
  orderId?: string | null
  isForOrder: boolean
  status: string
  note?: string | null
  writtenAt?: string | null
  collectedAt?: string | null
  givenTo?: string | null
  orderCode?: string | null
}

export interface TaskDTO {
  id: string
  title: string
  description?: string | null
  category: string
  priority: string
  status: string
  fromOwner: boolean
  createdById: string
  assignedToId?: string | null
  assigneeName?: string | null
  assigneeColor?: string | null
  dueDate?: string | null
  pauseReason?: string | null
  createdAt: string
  updatedAt: string
  updates?: { id: string; userName: string; content: string; createdAt: string }[]
}

export interface NotificationDTO {
  id: string
  title: string
  body?: string | null
  type: string
  link?: string | null
  read: boolean
  createdAt: string
}

export const ORDER_STATUSES: { key: string; label: string; color: string }[] = [
  { key: 'DRAFT', label: 'پیش‌نویس', color: '#8A8F98' },
  { key: 'PENDING_APPROVAL', label: 'در انتظار تأیید', color: '#C9A227' },
  { key: 'APPROVED', label: 'تأیید شده', color: '#3E7C59' },
  { key: 'SENT', label: 'ارسال به تأمین‌کننده', color: '#5E8C61' },
  { key: 'RECEIVING', label: 'در حال تحویل', color: '#B07D2B' },
  { key: 'RECEIVED_BY_DELIVERY', label: 'دریافت شد (تحویل‌گیرنده)', color: '#6B8E23' },
  { key: 'CONFIRMED_BY_INVENTORY', label: 'تأیید انبار', color: '#2E6E8E' },
  { key: 'ACCOUNTING_DONE', label: 'ثبت در حسابداری', color: '#7D5BA6' },
  { key: 'DONE', label: 'تکمیل شده', color: '#3E7C59' },
  { key: 'CANCELLED', label: 'لغو شده', color: '#B33A3A' },
]

export function orderStatusInfo(key: string) {
  return ORDER_STATUSES.find((s) => s.key === key) ?? { key, label: key, color: '#8A8F98' }
}

export const CHEQUE_STATUSES: { key: string; label: string; color: string }[] = [
  { key: 'PENDING_OWNER', label: 'در انتظار امضای مالک', color: '#C9A227' },
  { key: 'SIGNED', label: 'امضا شده — آماده تحویل', color: '#3E7C59' },
  { key: 'DELIVERED', label: 'تحویل داده شده', color: '#2E6E8E' },
  { key: 'COLLECTED', label: 'وصول شده', color: '#4C7A34' },
  { key: 'CLEARED', label: 'تسویه شده', color: '#3E7C59' },
  { key: 'UNCOLLECTED_REPORTED', label: 'دریافت نشده — پیگیری', color: '#B07D2B' },
  { key: 'REJECTED', label: 'رد شده', color: '#B33A3A' },
]

export function chequeStatusInfo(key: string) {
  return CHEQUE_STATUSES.find((s) => s.key === key) ?? { key, label: key, color: '#8A8F98' }
}

export const TASK_STATUSES: { key: string; label: string; color: string }[] = [
  { key: 'TODO', label: 'انجام نشده', color: '#8A8F98' },
  { key: 'IN_PROGRESS', label: 'در حال انجام', color: '#B07D2B' },
  { key: 'FOLLOW_UP', label: 'در حال پیگیری', color: '#2E6E8E' },
  { key: 'PAUSED', label: 'متوقف شده', color: '#B33A3A' },
  { key: 'DONE', label: 'انجام شد', color: '#3E7C59' },
]

export const PRIORITIES = [
  { key: 'LOW', label: 'کم', color: '#8A8F98' },
  { key: 'MEDIUM', label: 'متوسط', color: '#C9A227' },
  { key: 'HIGH', label: 'زیاد', color: '#B07D2B' },
  { key: 'URGENT', label: 'فوری', color: '#B33A3A' },
]

// stock level indicator shared across the app
export function stockLevel(stock: number, minStock: number): 'critical' | 'low' | 'ok' {
  if (stock <= 0 || stock <= Math.max(1, Math.floor(minStock * 0.35))) return 'critical'
  if (stock <= minStock) return 'low'
  return 'ok'
}

export const STOCK_COLORS = { critical: '#B33A3A', low: '#C9A227', ok: '#3E7C59' }
export const STOCK_LABELS = { critical: 'کمبود جدی', low: 'در حال اتمام', ok: 'موجودی مناسب' }
