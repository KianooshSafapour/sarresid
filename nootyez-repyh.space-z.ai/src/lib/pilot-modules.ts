/**
 * Hyper Zeytoon — Field Pilot Program «آزمون میدانی» (Task 13-a)
 *
 * Shared vocabulary for the pilot program: the 12 platform modules testers
 * can score, company-size presets (aligned with the Demo Lab), tester
 * statuses and their Persian labels. Used by both API routes and the UI so
 * the contract never drifts.
 */

export interface PilotModuleMeta {
  key: string
  fa: string
  en: string
  icon: string // lucide icon name (mapped in the UI)
}

/** The 12 platform modules a field tester can evaluate — order = display order */
export const PILOT_MODULES: PilotModuleMeta[] = [
  { key: 'orders', fa: 'سفارش‌ها', en: 'Orders', icon: 'ShoppingCart' },
  { key: 'deliveries', fa: 'تحویل کالا', en: 'Deliveries', icon: 'Truck' },
  { key: 'warehouse', fa: 'انبار', en: 'Warehouse', icon: 'Warehouse' },
  { key: 'payments', fa: 'پرداخت و چک', en: 'Payments & Cheques', icon: 'CreditCard' },
  { key: 'products', fa: 'کالاها', en: 'Products', icon: 'Package' },
  { key: 'suppliers', fa: 'تأمین‌کنندگان', en: 'Suppliers', icon: 'Building2' },
  { key: 'planogram', fa: 'چیدمان قفسه', en: 'Planogram', icon: 'Map' },
  { key: 'crm', fa: 'مشتریان و فروش', en: 'Customers & Sales', icon: 'Users' },
  { key: 'tasks', fa: 'تسک‌ها', en: 'Tasks', icon: 'CheckSquare' },
  { key: 'sops', fa: 'دستورالعمل‌ها', en: 'SOPs', icon: 'BookOpen' },
  { key: 'accounting', fa: 'حسابداری', en: 'Accounting', icon: 'Calculator' },
  { key: 'reports', fa: 'گزارش و تحلیل', en: 'Reports & Analytics', icon: 'BarChart3' },
]

export const PILOT_MODULE_KEYS = PILOT_MODULES.map((m) => m.key)

/** fa label lookup — safe on unknown keys */
export function pilotModuleFa(key: string): string {
  return PILOT_MODULES.find((m) => m.key === key)?.fa ?? key
}

/* ---------- company sizes (same presets as the Demo Lab) ---------- */

export const PILOT_SIZES = ['BOUTIQUE', 'MID', 'LARGE'] as const
export type PilotSizeKey = (typeof PILOT_SIZES)[number]

export const PILOT_SIZE_LABELS_FA: Record<string, string> = {
  BOUTIQUE: 'بوتیک تک‌شعبه',
  MID: 'زنجیره متوسط',
  LARGE: 'زنجیره بزرگ',
}

/* ---------- tester statuses ---------- */

export const PILOT_STATUSES = ['INVITED', 'ACTIVE', 'COMPLETED', 'DECLINED'] as const
export type PilotStatusKey = (typeof PILOT_STATUSES)[number]

export const PILOT_STATUS_LABELS_FA: Record<string, string> = {
  INVITED: 'دعوت‌شده',
  ACTIVE: 'فعال',
  COMPLETED: 'تکمیل‌شده',
  DECLINED: 'انصراف',
}
