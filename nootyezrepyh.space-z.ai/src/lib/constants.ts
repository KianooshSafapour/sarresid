// Shared constants: roles, permissions, statuses, workflow

export const ROLES: Record<string, { name: string; color: string; description: string }> = {
  OWNER: { name: 'مالک / مدیرعامل', color: '#8a6d1f', description: 'آقای جواد نوری' },
  GENERAL_MANAGER: { name: 'مدیر فروشگاه', color: '#5a7d4f', description: 'سرکار خانم لطفی' },
  OPERATION_MANAGER: { name: 'مدیر عملیات', color: '#a35d3f', description: 'کفیانوش صفاعور' },
  IT_ADMIN: { name: 'مدیر فناوری اطلاعات', color: '#4f6d7d', description: 'مدیریت پلتفرم' },
  PRODUCT_MANAGER: { name: 'مدیر محصول', color: '#7d4f6d', description: 'سرکار خانم نوری' },
  ACCOUNTANT: { name: 'حسابدار ارشد', color: '#6d6a2f', description: 'سرکار خانم درویشی' },
  INVENTORY_SUPERVISOR: { name: 'سرپرست انبار', color: '#2f6d5a', description: 'آقای محمدی' },
  DELIVERY_RECEIVER: { name: 'تحویل‌گیرنده کالا', color: '#7d5a2f', description: 'پذیرش مرسولات' },
  CASHIER: { name: 'صندوق‌دار', color: '#5a5a7d', description: 'کارکنان صندوق' },
  HEAD_CASHIER: { name: 'سرصندوق‌دار', color: '#5a5a7d', description: 'مدیریت صندوق' },
  SALESPERSON: { name: 'فروشنده', color: '#7d2f4f', description: 'فروش و مشاوره' },
  MERCHANDISER: { name: 'چیدمان‌دار', color: '#2f7d4f', description: 'چیدمان و پرکردن قفسه‌ها' },
}

export const PERMISSIONS = {
  VIEW_DASHBOARD: 'view_dashboard',
  MANAGE_ORDERS: 'manage_orders',
  APPROVE_ORDERS: 'approve_orders',
  RECEIVE_DELIVERY: 'receive_delivery',
  INSPECT_DELIVERY: 'inspect_delivery',
  ACCOUNTING: 'accounting',
  MANAGE_CHEQUES: 'manage_cheques',
  APPROVE_CHEQUES: 'approve_cheques',
  VIEW_CHEQUES: 'view_cheques',
  MANAGE_PRODUCTS: 'manage_products',
  MANAGE_SUPPLIERS: 'manage_suppliers',
  MANAGE_TASKS: 'manage_tasks',
  MANAGE_SOPS: 'manage_sops',
  MANAGE_PLANOGRAM: 'manage_planogram',
  VIEW_REPORTS: 'view_reports',
  ADMIN_USERS: 'admin_users',
  ADMIN_SETTINGS: 'admin_settings',
  VIEW_AUDIT: 'view_audit',
  SALES_FLOOR: 'sales_floor',
  CASHIER: 'cashier',
  WAREHOUSE: 'warehouse',
  AWARD_POINTS: 'award_points',
  MANAGE_SHIFTS: 'manage_shifts',
}

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: [PERMISSIONS.VIEW_DASHBOARD, PERMISSIONS.VIEW_REPORTS, PERMISSIONS.APPROVE_CHEQUES, PERMISSIONS.VIEW_CHEQUES, PERMISSIONS.AWARD_POINTS, PERMISSIONS.VIEW_AUDIT, PERMISSIONS.MANAGE_TASKS, PERMISSIONS.MANAGE_PRODUCTS],
  GENERAL_MANAGER: [PERMISSIONS.VIEW_DASHBOARD, PERMISSIONS.MANAGE_ORDERS, PERMISSIONS.APPROVE_ORDERS, PERMISSIONS.RECEIVE_DELIVERY, PERMISSIONS.INSPECT_DELIVERY, PERMISSIONS.ACCOUNTING, PERMISSIONS.MANAGE_CHEQUES, PERMISSIONS.VIEW_CHEQUES, PERMISSIONS.MANAGE_PRODUCTS, PERMISSIONS.MANAGE_TASKS, PERMISSIONS.MANAGE_SOPS, PERMISSIONS.MANAGE_PLANOGRAM, PERMISSIONS.VIEW_REPORTS, PERMISSIONS.AWARD_POINTS, PERMISSIONS.WAREHOUSE, PERMISSIONS.SALES_FLOOR, PERMISSIONS.MANAGE_SHIFTS],
  OPERATION_MANAGER: [PERMISSIONS.VIEW_DASHBOARD, PERMISSIONS.MANAGE_ORDERS, PERMISSIONS.APPROVE_ORDERS, PERMISSIONS.MANAGE_PRODUCTS, PERMISSIONS.MANAGE_TASKS, PERMISSIONS.MANAGE_SOPS, PERMISSIONS.MANAGE_PLANOGRAM, PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AUDIT, PERMISSIONS.ADMIN_USERS, PERMISSIONS.ADMIN_SETTINGS, PERMISSIONS.AWARD_POINTS, PERMISSIONS.WAREHOUSE, PERMISSIONS.MANAGE_SHIFTS, PERMISSIONS.VIEW_CHEQUES],
  IT_ADMIN: [PERMISSIONS.VIEW_DASHBOARD, PERMISSIONS.ADMIN_USERS, PERMISSIONS.ADMIN_SETTINGS, PERMISSIONS.VIEW_AUDIT, PERMISSIONS.VIEW_REPORTS, PERMISSIONS.MANAGE_PRODUCTS],
  PRODUCT_MANAGER: [PERMISSIONS.VIEW_DASHBOARD, PERMISSIONS.MANAGE_ORDERS, PERMISSIONS.MANAGE_PRODUCTS, PERMISSIONS.MANAGE_PLANOGRAM, PERMISSIONS.WAREHOUSE, PERMISSIONS.VIEW_REPORTS],
  ACCOUNTANT: [PERMISSIONS.VIEW_DASHBOARD, PERMISSIONS.ACCOUNTING, PERMISSIONS.MANAGE_CHEQUES, PERMISSIONS.VIEW_CHEQUES, PERMISSIONS.VIEW_REPORTS, PERMISSIONS.VIEW_AUDIT],
  INVENTORY_SUPERVISOR: [PERMISSIONS.INSPECT_DELIVERY, PERMISSIONS.WAREHOUSE, PERMISSIONS.VIEW_DASHBOARD, PERMISSIONS.MANAGE_PRODUCTS],
  DELIVERY_RECEIVER: [PERMISSIONS.RECEIVE_DELIVERY, PERMISSIONS.VIEW_DASHBOARD],
  CASHIER: [PERMISSIONS.CASHIER, PERMISSIONS.SALES_FLOOR],
  HEAD_CASHIER: [PERMISSIONS.CASHIER, PERMISSIONS.SALES_FLOOR, PERMISSIONS.VIEW_DASHBOARD],
  SALESPERSON: [PERMISSIONS.SALES_FLOOR],
  MERCHANDISER: [PERMISSIONS.WAREHOUSE, PERMISSIONS.SALES_FLOOR],
}

export const ORDER_STATUSES: Record<string, { label: string; color: string; description: string }> = {
  DRAFT: { label: 'پیش‌نویس', color: '#8a8a8a', description: 'در حال تهیه سفارش' },
  PENDING_APPROVAL: { label: 'در انتظار تأیید', color: '#c9a227', description: 'نیازمند تأیید مدیر فروشگاه' },
  APPROVED: { label: 'تأیید و ثبت شده', color: '#5a7d4f', description: 'به تأمین‌کننده اعلام شده' },
  EXPECTED: { label: 'در انتظار دریافت', color: '#4f6d7d', description: 'انتظار دریافت کالا' },
  RECEIVED: { label: 'دریافت شده', color: '#a35d3f', description: 'تحویل گرفته شد - در انتظار کنترل انبار' },
  INSPECTED: { label: 'کنترل شده', color: '#7d4f6d', description: 'تأیید سرپرست انبار - ارسال به حسابداری' },
  TO_HOLOO: { label: 'در حال ثبت در هلو', color: '#6d6a2f', description: 'حسابدار در حال ثبت در نرم‌افزار هلو' },
  DONE: { label: 'تکمیل شده', color: '#2f7d4f', description: 'ثبت نهایی و پردازش کامل' },
  CANCELLED: { label: 'لغو شده', color: '#a33f3f', description: 'سفارش لغو شد' },
}

export const ORDER_FLOW = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'EXPECTED', 'RECEIVED', 'INSPECTED', 'TO_HOLOO', 'DONE']

export const CHEQUE_STATUSES: Record<string, { label: string; color: string }> = {
  PENDING_OWNER: { label: 'در انتظار صدور', color: '#c9a227' },
  WRITTEN: { label: 'صادر شده', color: '#4f6d7d' },
  SIGNED: { label: 'امضا شده', color: '#5a7d4f' },
  READY: { label: 'آماده تحویل', color: '#2f7d4f' },
  COLLECTED: { label: 'تحویل داده شده', color: '#a35d3f' },
  DONE: { label: 'پرداخت شده', color: '#2f6d5a' },
  REJECTED: { label: 'رد شده', color: '#a33f3f' },
  UNCOLLECTED: { label: 'تحویل نشده', color: '#a33f3f' },
}

export const TASK_STATUSES: Record<string, { label: string; color: string }> = {
  TODO: { label: 'در انتظار انجام', color: '#8a8a8a' },
  IN_PROGRESS: { label: 'در حال انجام', color: '#c9a227' },
  FOLLOW_UP: { label: 'پیگیری', color: '#a35d3f' },
  DONE: { label: 'انجام شد', color: '#2f7d4f' },
}

export const ACTIVITY_TYPES: Record<string, { label: string; icon: string; defaultPoints: number }> = {
  TASK_DONE: { label: 'انجام وظیفه', icon: '✓', defaultPoints: 10 },
  DELIVERY: { label: 'دریافت مرسولات', icon: '📦', defaultPoints: 15 },
  CLEANING: { label: 'نظافت و مرتب‌سازی', icon: '🧹', defaultPoints: 8 },
  HELP: { label: 'همیاری و کمک', icon: '🤝', defaultPoints: 8 },
  SHELF_STOCK: { label: 'پرکردن قفسه', icon: '🧺', defaultPoints: 6 },
  IDEA: { label: 'ایده نو', icon: '💡', defaultPoints: 20 },
  CUSTOMER_SERVICE: { label: 'خدمات مشتری', icon: '🌟', defaultPoints: 10 },
  MANUAL_AWARD: { label: 'قدردانی مدیر', icon: '🏅', defaultPoints: 10 },
  OTHER: { label: 'سایر', icon: '•', defaultPoints: 5 },
}

export const STOCK_STATUS = {
  // colors resolve through CSS vars (see globals.css :root/.dark) so badges stay theme-aware
  CRITICAL: { label: 'کمبود جدی', color: 'var(--stock-critical-color)', bg: 'var(--stock-critical-bg)' },
  LOW: { label: 'در حال اتمام', color: 'var(--stock-low-color)', bg: 'var(--stock-low-bg)' },
  OK: { label: 'موجودی مناسب', color: 'var(--stock-ok-color)', bg: 'var(--stock-ok-bg)' },
}

export function stockStatus(stock: number, minStock: number): keyof typeof STOCK_STATUS {
  if (stock <= minStock * 0.5) return 'CRITICAL'
  if (stock <= minStock) return 'LOW'
  return 'OK'
}

export function canUser(roles: string[], permission: string): boolean {
  return roles.some((r) => (ROLE_PERMISSIONS[r] || []).includes(permission))
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

// ============ PLATFORM VERSION (بازیابی نسخه پایدار) ============
export const APP_VERSION = '0.1.0-alpha'
export const APP_CODENAME = 'Hello, World'
export const APP_VERSION_FA = 'نسخه ۰٫۱ آلفا — «Hello, World»'
export const HELLO_WORLD_SNAPSHOT = 'v0.1-alpha-hello-world'
