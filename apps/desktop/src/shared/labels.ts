export const TABLE_LABELS: Record<string, string> = {
  customers: '客户',
  orders: '订单',
  order_items: '订单明细',
  products: '商品',
}

export function tableLabel(name: string): string {
  return TABLE_LABELS[name] ?? name
}
