import type { ComponentType } from 'react'
import { Products } from './Products'
import { Providers } from './Providers'
import { Inventory } from './Inventory'

export const catalogSections: Record<string, ComponentType> = {
  products: Products,
  providers: Providers,
  inventory: Inventory,
}
