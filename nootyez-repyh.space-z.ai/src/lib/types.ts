export interface PUser {
  id: number
  name: string
  pin: string
  roles: string
  color: string
  active: boolean
  points: number
  createdAt?: string
}

export const ROLES = [
  'OWNER', 'GENERAL_MANAGER', 'OPERATION_MANAGER', 'PRODUCT_MANAGER',
  'ACCOUNTANT', 'INVENTORY_SUPERVISOR', 'DELIVERY_RECEIVER',
  'CASHIER', 'SALESPERSON', 'MERCHANDISER', 'IT_ADMIN',
] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'مالک | Owner',
  GENERAL_MANAGER: 'مدیر عامل | General Manager',
  OPERATION_MANAGER: 'مدیر عملیات | Operation Manager',
  PRODUCT_MANAGER: 'مدیر محصول | Product Manager',
  ACCOUNTANT: 'حسابدار | Accountant',
  INVENTORY_SUPERVISOR: 'انباردار | Inventory Supervisor',
  DELIVERY_RECEIVER: 'گیرنده تحویل | Delivery Receiver',
  CASHIER: 'صندوق‌دار | Cashier',
  SALESPERSON: 'فروشنده | Salesperson',
  MERCHANDISER: 'چیدمان | Merchandiser',
  IT_ADMIN: 'مدیر IT | IT Admin',
}

export const ROLE_HOME: Partial<Record<Role, string>> = {
  OWNER: 'dashboard',
  GENERAL_MANAGER: 'dashboard',
  OPERATION_MANAGER: 'dashboard',
  PRODUCT_MANAGER: 'orders',
  ACCOUNTANT: 'accounting',
  INVENTORY_SUPERVISOR: 'deliveries',
  DELIVERY_RECEIVER: 'deliveries',
  CASHIER: 'tasks',
  SALESPERSON: 'crm',
  MERCHANDISER: 'tasks',
  IT_ADMIN: 'admin',
}

export const ORDER_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'RECEIVED', 'CONFIRMED', 'DONE', 'CANCELLED'] as const
export const ORDER_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'پیش‌نویس | Draft',
  SUBMITTED: 'در انتظار تایید | Awaiting approval',
  APPROVED: 'تایید شده | Approved',
  RECEIVED: 'تحویل گرفته شد | Received',
  CONFIRMED: 'تایید انبار | Inventory confirmed',
  DONE: 'تسویه/بسته | Done',
  CANCELLED: 'لغو شده | Cancelled',
}
export const ORDER_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-stone-100 text-stone-700 border-stone-200',
  SUBMITTED: 'bg-amber-50 text-amber-800 border-amber-200',
  APPROVED: 'bg-teal-50 text-teal-800 border-teal-200',
  RECEIVED: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  CONFIRMED: 'bg-violet-50 text-violet-800 border-violet-200',
  DONE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
}

export const CHEQUE_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'WRITTEN', 'SIGNED', 'GIVEN', 'COLLECTED', 'DONE', 'REJECTED', 'BOUNCED'] as const
export const CHEQUE_STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: 'در انتظار تایید مالک | Awaiting owner',
  APPROVED: 'تایید شده | Approved',
  WRITTEN: 'چک نوشته شد | Written',
  SIGNED: 'امضا شده | Signed',
  GIVEN: 'تحویل داده شد | Given',
  COLLECTED: 'وصول شد | Collected',
  DONE: 'پایان یافته | Done',
  REJECTED: 'رد شده | Rejected',
  BOUNCED: 'برگشتی | Bounced',
}
export const CHEQUE_STATUS_COLORS: Record<string, string> = {
  PENDING_APPROVAL: 'bg-amber-50 text-amber-800 border-amber-200',
  APPROVED: 'bg-teal-50 text-teal-800 border-teal-200',
  WRITTEN: 'bg-sky-50 text-sky-800 border-sky-200',
  SIGNED: 'bg-violet-50 text-violet-800 border-violet-200',
  GIVEN: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  COLLECTED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  DONE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  BOUNCED: 'bg-red-100 text-red-800 border-red-300',
}

export const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'PAUSED', 'DONE', 'CANCELLED'] as const
export const TASK_STATUS_LABELS: Record<string, string> = {
  OPEN: 'باز | Open',
  IN_PROGRESS: 'در حال انجام | In progress',
  PAUSED: 'متوقف | Paused',
  DONE: 'انجام شد | Done',
  CANCELLED: 'لغو | Cancelled',
}
export const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'کم | Low', MEDIUM: 'متوسط | Medium', HIGH: 'زیاد | High', URGENT: 'فوری | Urgent',
}
export const IDEA_STATUSES = ['SUBMITTED', 'REVIEWING', 'ACCEPTED', 'IMPLEMENTED', 'REJECTED'] as const
export const IDEA_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'ارسال شده | Submitted',
  REVIEWING: 'در بررسی | Reviewing',
  ACCEPTED: 'پذیرفته شد | Accepted',
  IMPLEMENTED: 'اجرا شد | Implemented',
  REJECTED: 'رد شد | Rejected',
}

export interface OrderItemT {
  id: number
  orderId?: number
  productId: number | null
  name: string
  barcode: string | null
  qty: number
  unitCost: number
  sellPrice: number
  deliveredQty: number | null
  confirmedQty: number | null
  printedPrice: number | null
  finalCost: number | null
  status: string
  note: string | null
}

export interface OrderT {
  id: number
  code: string
  supplierId: number
  createdById: number
  status: string
  paymentType: string
  receivingDate: string
  note: string | null
  correction: string | null
  subtotal: number
  discount: number
  tax: number
  vat: number
  total: number
  createdAt: string
  approvedAt: string | null
  receivedAt: string | null
  confirmedAt: string | null
  doneAt: string | null
  supplier?: { id: number; name: string; paymentTerms: string; chequeDays: number }
  items: OrderItemT[]
  events?: OrderEventT[]
}

export interface OrderEventT {
  id: number
  orderId: number
  userName: string
  action: string
  detail: string | null
  createdAt: string
}

export interface ProductT {
  id: number
  name: string
  nameFa: string | null
  barcode: string | null
  companyId: number | null
  supplierId: number | null
  buyPrice: number
  sellPrice: number
  sellPrice2: number | null
  shelfLifeDays?: number | null
  unit: string
  stock: number
  minStock: number
  imageUrl: string | null
  category: string | null
  active: boolean
  mergedInto: number | null
  company?: { id: number; name: string } | null
  supplier?: { id: number; name: string } | null
}

export interface SupplierT {
  id: number
  name: string
  kind: string
  phone: string | null
  note: string | null
  paymentTerms: string
  chequeDays: number
  companies?: { company: { id: number; name: string } }[]
  _count?: { products: number }
  /** GET /api/suppliers extras (price-recency feature) */
  productsCount?: number
  lowCount?: number
  /** per-supplier price-import recency — newest PRODUCT_PRICE_IMPORT audit touching this supplier */
  lastPriceImport?: PriceImportInfo | null
}

/** Latest PRODUCT_PRICE_IMPORT audit row — top-level on GET /api/suppliers */
export interface PriceImportInfo {
  at: string
  by: string
}

export interface ChequeT {
  id: number
  orderId: number | null
  purpose: string
  payee: string | null
  amount: number
  dueDate: string
  status: string
  recipientName: string | null
  recipientPhone: string | null
  note: string | null
  createdAt: string
  order?: { code: string } | null
}

export interface TaskT {
  id: number
  title: string
  description: string | null
  priority: string
  status: string
  assignedToId: number
  createdById: number
  dueDate: string | null
  pauseReason: string | null
  createdAt: string
  completedAt: string | null
  assignedTo?: { id: number; name: string; color: string }
  createdBy?: { id: number; name: string }
}

export interface NotificationT {
  id: number
  userId: number
  title: string
  body: string | null
  type: string
  readAt: string | null
  createdAt: string
}

export interface SopT {
  id: number
  title: string
  department: string
  steps: string // JSON string array
  createdAt: string
}

export function hasRole(user: PUser | null, role: Role): boolean {
  if (!user) return false
  return user.roles.split(',').map((r) => r.trim()).includes(role)
}

export function userRoles(user: PUser | null): Role[] {
  if (!user) return []
  return user.roles.split(',').map((r) => r.trim()) as Role[]
}
