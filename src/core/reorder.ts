import type { AppProduct } from './db';

export interface ReorderItem {
  name: string;
  current_qty: number;
  suggested_qty: number;
  unit_label: string;
}

export function calculateReorderItems(products: AppProduct[]): ReorderItem[] {
  return products
    .filter(product => product.current_qty <= (product.low_stock_threshold ?? 5))
    .map(product => ({
      name: product.name,
      current_qty: product.current_qty,
      suggested_qty: Math.max(1, (product.low_stock_threshold ?? 5) * 2 - product.current_qty),
      unit_label: product.unit_label,
    }))
    .sort((a, b) => a.current_qty - b.current_qty || a.name.localeCompare(b.name));
}
