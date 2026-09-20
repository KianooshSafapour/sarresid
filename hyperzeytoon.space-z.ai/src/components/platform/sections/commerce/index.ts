// Commerce section registry — orders / deliveries / accounting / payments
import type { ComponentType } from 'react'
import { Orders } from './Orders'
import { Deliveries } from './Deliveries'
import { Accounting } from './Accounting'
import { Payments } from './Payments'

// NewOrderWizard is mounted inside Orders (also opens via quickAction 'new-order')
export const commerceSections: Record<string, ComponentType> = {
  orders: Orders,
  deliveries: Deliveries,
  accounting: Accounting,
  payments: Payments,
}
