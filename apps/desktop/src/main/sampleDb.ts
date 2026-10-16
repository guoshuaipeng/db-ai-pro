import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type Database from 'better-sqlite3'

type Product = { id: number; price: number }

const PRODUCTS: Product[] = [
  { id: 1, price: 128000 },
  { id: 2, price: 8600 },
  { id: 3, price: 9200 },
  { id: 4, price: 24600 },
  { id: 5, price: 31200 },
  { id: 6, price: 1800 },
]

function daysAgo(days: number): string {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

export function seedRetailDatabase(db: Database.Database): void {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE customers (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      status TEXT NOT NULL,
      region TEXT NOT NULL,
      city TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE products (
      id INTEGER PRIMARY KEY,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price_cents INTEGER NOT NULL
    );

    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      status TEXT NOT NULL,
      total_cents INTEGER NOT NULL,
      placed_at TEXT NOT NULL
    );

    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      qty INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL
    );
  `)

  const insertCustomer = db.prepare(
    `INSERT INTO customers (id, name, email, status, region, city, created_at)
     VALUES (@id, @name, @email, @status, @region, @city, @createdAt)`,
  )
  const insertProduct = db.prepare(
    `INSERT INTO products (id, sku, name, category, price_cents)
     VALUES (@id, @sku, @name, @category, @price)`,
  )
  const insertOrder = db.prepare(
    `INSERT INTO orders (id, customer_id, status, total_cents, placed_at)
     VALUES (@id, @customerId, @status, @total, @placedAt)`,
  )
  const insertItem = db.prepare(
    `INSERT INTO order_items (id, order_id, product_id, qty, unit_price_cents)
     VALUES (@id, @orderId, @productId, @qty, @price)`,
  )

  const customers = [
    [1, '林晓', 'lin.xiao@example.com', '活跃', '华东', '上海', '2024-11-02'],
    [2, '周衡', null, '活跃', '华东', '杭州', '2025-01-14'],
    [3, '陈予安', 'chen@example.com', '暂停', '华北', '北京', '2025-02-02'],
    [4, '苏晚', null, '活跃', '华南', '深圳', '2025-03-18'],
    [5, '高见', 'gao@example.com', '活跃', '华北', '天津', '2025-04-09'],
    [6, '许南星', null, '流失', '西南', '成都', '2024-08-21'],
    [7, '沈清越', 'shen@example.com', '活跃', '华东', '上海', '2025-06-01'],
    [8, '顾承', 'gu@example.com', '活跃', '华南', '广州', '2025-06-19'],
    [9, '叶知夏', null, '暂停', '西南', '重庆', '2025-07-07'],
    [10, '江澄', 'jiang@example.com', '活跃', '华北', '北京', '2025-08-12'],
  ] as const

  const products = [
    [1, 'GW-100', '工业网关', '连接', 128000],
    [2, 'SN-20', '温湿度传感器', '传感', 8600],
    [3, 'SN-21', '电流传感器', '传感', 9200],
    [4, 'TM-7', '采集终端', '终端', 24600],
    [5, 'TM-9', '边缘终端', '终端', 31200],
    [6, 'CB-3', '屏蔽线缆', '配件', 1800],
  ] as const

  const orders: { customerId: number; status: string; days: number; items: [number, number][] }[] = [
    { customerId: 1, status: '已完成', days: 44, items: [[1, 1], [4, 1]] },
    { customerId: 1, status: '已支付', days: 15, items: [[5, 2]] },
    { customerId: 2, status: '待发货', days: 26, items: [[5, 1], [3, 4]] },
    { customerId: 4, status: '已完成', days: 66, items: [[2, 2], [6, 4]] },
    { customerId: 5, status: '已完成', days: 8, items: [[1, 1]] },
    { customerId: 7, status: '已取消', days: 120, items: [[4, 1]] },
    { customerId: 7, status: '已完成', days: 18, items: [[5, 1], [2, 3]] },
    { customerId: 8, status: '待发货', days: 4, items: [[6, 2]] },
    { customerId: 10, status: '已完成', days: 47, items: [[1, 1], [5, 2], [3, 2]] },
    { customerId: 3, status: '已完成', days: 200, items: [[2, 1]] },
    { customerId: 5, status: '已支付', days: 6, items: [[4, 2]] },
    { customerId: 8, status: '已完成', days: 32, items: [[3, 5], [4, 1]] },
  ]

  const write = db.transaction(() => {
    for (const row of customers) {
      insertCustomer.run({
        id: row[0],
        name: row[1],
        email: row[2],
        status: row[3],
        region: row[4],
        city: row[5],
        createdAt: row[6],
      })
    }
    for (const row of products) {
      insertProduct.run({
        id: row[0],
        sku: row[1],
        name: row[2],
        category: row[3],
        price: row[4],
      })
    }
    let itemId = 1
    orders.forEach((order, index) => {
      const total = order.items.reduce((sum, [productId, qty]) => {
        const product = PRODUCTS.find((item) => item.id === productId)
        return sum + (product?.price ?? 0) * qty
      }, 0)
      insertOrder.run({
        id: index + 1,
        customerId: order.customerId,
        status: order.status,
        total,
        placedAt: daysAgo(order.days),
      })
      for (const [productId, qty] of order.items) {
        const product = PRODUCTS.find((item) => item.id === productId)
        insertItem.run({
          id: itemId,
          orderId: index + 1,
          productId,
          qty,
          price: product?.price ?? 0,
        })
        itemId += 1
      }
    })
  })

  write()
}

export function ensureParent(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
}

export function createId(): string {
  return randomUUID()
}
