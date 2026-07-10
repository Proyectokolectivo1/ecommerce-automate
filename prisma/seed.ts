// ============================================================
// seed.ts — Datos demo para Plataforma Ecommerce Inteligente
// ============================================================
// Idempotente: borra todo en orden de dependencias y reinserta.
// Ejecutar: `bun run db:seed`
// ============================================================

import { db } from "../src/lib/db"
import { hashPassword } from "../src/lib/auth-utils"

// ------------------------------------------------------------
// Helpers de fecha
// ------------------------------------------------------------
const DAY = 86400000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY)
const hoursAgo = (n: number) => new Date(Date.now() - n * 3600000)

// ------------------------------------------------------------
// 0. Limpieza (orden de dependencias)
// ------------------------------------------------------------
async function wipeDatabase() {
  // Hijas primero
  await db.trackingEvent.deleteMany()
  await db.printJob.deleteMany()
  await db.return.deleteMany()
  await db.transaction.deleteMany()
  await db.shipment.deleteMany()
  await db.orderStatusLog.deleteMany()
  await db.orderItem.deleteMany()
  await db.notification.deleteMany()
  // Órdenes
  await db.order.deleteMany()
  // Catálogo / clientes
  await db.product.deleteMany()
  await db.customer.deleteMany()
  // Costos / alertas / auditoría
  await db.costEntry.deleteMany()
  await db.alert.deleteMany()
  await db.auditLog.deleteMany()
  // Config
  await db.integrationSetting.deleteMany()
  await db.aiInsight.deleteMany()
  // Usuarios al final
  await db.user.deleteMany()
}

// ============================================================
// 1. USERS (4 — uno por rol)
// ============================================================
async function seedUsers() {
  const users = [
    { email: "admin@demo.com", name: "Admin Demo", role: "ADMIN", password: "admin123" },
    { email: "gerencia@demo.com", name: "Gerencia Demo", role: "GERENCIA", password: "gerencia123" },
    { email: "bodega@demo.com", name: "Bodega Demo", role: "BODEGA", password: "bodega123" },
    { email: "servicio@demo.com", name: "Servicio Demo", role: "SERVICIO", password: "servicio123" },
  ]

  const created = []
  for (const u of users) {
    created.push(
      await db.user.create({
        data: {
          email: u.email,
          name: u.name,
          role: u.role,
          passwordHash: hashPassword(u.password),
          lastLoginAt: hoursAgo(5),
        },
      })
    )
  }
  return created
}

// ============================================================
// 2. CUSTOMERS (8)
// ============================================================
async function seedCustomers() {
  const customers = [
    { name: "Carlos Ramírez", email: "carlos.ramirez@gmail.com", phone: "+57 310 555 1234", city: "Bogotá", address: "Calle 85 #15-23, Apt 402", classification: "VIP", totalSpent: 4_850_000, ordersCount: 24, lastOrderAt: daysAgo(2) },
    { name: "Valentina Mesa", email: "valentina.mesa@hotmail.com", phone: "+57 311 444 5678", city: "Medellín", address: "Cra 43A #1-50, El Poblado", classification: "VIP", totalSpent: 3_200_000, ordersCount: 18, lastOrderAt: daysAgo(5) },
    { name: "Andrés Caicedo", email: "andres.caicedo@gmail.com", phone: "+57 312 333 9012", city: "Cali", address: "Av 6N #22-15, Apt 8A", classification: "FRECUENTE", totalSpent: 1_540_000, ordersCount: 9, lastOrderAt: daysAgo(7) },
    { name: "Sofía Martínez", email: "sofia.martinez@outlook.com", phone: "+57 313 222 3456", city: "Barranquilla", address: "Calle 79 #42-18", classification: "FRECUENTE", totalSpent: 1_120_000, ordersCount: 6, lastOrderAt: daysAgo(11) },
    { name: "Mateo Hernández", email: "mateo.hernandez@gmail.com", phone: "+57 314 111 7890", city: "Cartagena", address: "Av. Pedro de Heredia #30-45", classification: "FRECUENTE", totalSpent: 980_000, ordersCount: 5, lastOrderAt: daysAgo(14) },
    { name: "Luisa Gómez", email: "luisa.gomez@gmail.com", phone: "+57 315 999 6543", city: "Bucaramanga", address: "Calle 38 #22-11, Cabecera", classification: "NUEVO", totalSpent: 159_900, ordersCount: 1, lastOrderAt: daysAgo(3) },
    { name: "Diego Restrepo", email: "diego.restrepo@yahoo.com", phone: "+57 316 888 4321", city: "Pereira", address: "Cra 7 #20-30, Centro", classification: "NUEVO", totalSpent: 89_900, ordersCount: 1, lastOrderAt: daysAgo(1) },
    { name: "Camila López", email: "camila.lopez@gmail.com", phone: "+57 317 777 9876", city: "Manizales", address: "Av. Santander #15-40", classification: "INACTIVO", totalSpent: 245_000, ordersCount: 2, lastOrderAt: daysAgo(120) },
  ]

  const created = []
  for (const c of customers) {
    created.push(await db.customer.create({ data: c }))
  }
  return created
}

// ============================================================
// 3. PRODUCTS (6)
// ============================================================
async function seedProducts() {
  const products = [
    { sku: "AUR-BT-001", title: "Auriculares Bluetooth", variant: "Negro", cost: 45000, price: 89900, weight: 250, inventoryQty: 120, imageUrl: "https://placehold.co/400x400?text=Auriculares+Bluetooth" },
    { sku: "SW-DEP-002", title: "Smartwatch Deportivo", variant: "Verde", cost: 75000, price: 159900, weight: 180, inventoryQty: 45, imageUrl: "https://placehold.co/400x400?text=Smartwatch+Deportivo" },
    { sku: "CARG-IN-003", title: "Cargador Inalámbrico", variant: "15W", cost: 22000, price: 49900, weight: 200, inventoryQty: 200, imageUrl: "https://placehold.co/400x400?text=Cargador+Inalambrico" },
    { sku: "FUN-IP15-004", title: "Funda iPhone 15", variant: "Transparente", cost: 12000, price: 34900, weight: 50, inventoryQty: 300, imageUrl: "https://placehold.co/400x400?text=Funda+iPhone+15" },
    { sku: "PB-20K-005", title: "Power Bank 20000mAh", variant: "USB-C PD", cost: 55000, price: 119900, weight: 400, inventoryQty: 80, imageUrl: "https://placehold.co/400x400?text=Power+Bank+20000mAh" },
    { sku: "ALT-BT-006", title: "Altavoz Bluetooth", variant: "Azul", cost: 65000, price: 129900, weight: 600, inventoryQty: 8, imageUrl: "https://placehold.co/400x400?text=Altavoz+Bluetooth" }, // LOW_INVENTORY
  ]

  const created = []
  for (const p of products) {
    created.push(await db.product.create({ data: { active: true, ...p } }))
  }
  return created
}

// ============================================================
// Helper: crear OrderStatusLog
// ============================================================
async function addLog(orderId: string, fromStatus: string | null, toStatus: string, createdAt: Date, actor = "system", reason?: string) {
  await db.orderStatusLog.create({
    data: { orderId, fromStatus, toStatus, actor, reason, createdAt },
  })
}

// ============================================================
// Helper: construir items y totales
// ============================================================
function buildItems(productList: { product: any; qty: number }[]) {
  const items = productList.map(({ product, qty }) => ({
    productId: product.id,
    title: product.title,
    sku: product.sku,
    quantity: qty,
    unitPrice: product.price,
    unitCost: product.cost,
    total: product.price * qty,
  }))
  const subtotal = items.reduce((s, i) => s + i.total, 0)
  return { items, subtotal }
}

// ============================================================
// 4. ORDERS (15) + OrderItems + Shipments + Tracking + PrintJobs
//    + Returns + Transactions + OrderStatusLogs
// ============================================================
async function seedOrders(users: any[], customers: any[], products: any[]) {
  const admin = users.find((u) => u.role === "ADMIN")!

  // Helper carriers
  const carriers = ["SERVIENTREGA", "ENVIA", "INTERRAPIDISIMO"]
  const guidePrefixes: Record<string, string> = {
    SERVIENTREGA: "SRG",
    ENVIA: "ENV",
    INTERRAPIDISIMO: "INT",
  }

  let guideCounter = 100000001
  const nextGuide = (carrier: string) => `${guidePrefixes[carrier]}${guideCounter++}`

  let txCounter = 1000
  const nextTxRef = () => `TX-DEMO-${txCounter++}`

  // ------------------------------------------------------------
  // ORDEN 1 — NUEVO / PREPAID / hoy
  // ------------------------------------------------------------
  {
    const { items, subtotal } = buildItems([{ product: products[0], qty: 1 }])
    const shippingCost = 8000
    const transportCost = 6000
    const total = subtotal + shippingCost
    const placedAt = hoursAgo(2)
    const order = await db.order.create({
      data: {
        orderNumber: "#1001",
        customerId: customers[0].id,
        status: "NUEVO",
        paymentMethod: "PREPAID",
        subtotal,
        shippingCost,
        transportCost,
        total,
        declaredValue: subtotal,
        city: customers[0].city,
        address: customers[0].address,
        notes: "Pedido web — Shopify",
        placedAt,
        createdAt: placedAt,
        items: { create: items },
      },
    })
    await addLog(order.id, null, "NUEVO", placedAt, "shopify", "Pedido importado desde Shopify")
  }

  // ------------------------------------------------------------
  // ORDEN 2 — NUEVO / COD / ayer
  // ------------------------------------------------------------
  {
    const { items, subtotal } = buildItems([
      { product: products[2], qty: 1 },
      { product: products[3], qty: 2 },
    ])
    const shippingCost = 9000
    const transportCost = 7000
    const total = subtotal + shippingCost
    const placedAt = daysAgo(1)
    const order = await db.order.create({
      data: {
        orderNumber: "#1002",
        customerId: customers[1].id,
        status: "NUEVO",
        paymentMethod: "COD",
        subtotal,
        shippingCost,
        transportCost,
        total,
        declaredValue: subtotal,
        city: customers[1].city,
        address: customers[1].address,
        codPaid: false,
        placedAt,
        createdAt: placedAt,
        items: { create: items },
      },
    })
    await addLog(order.id, null, "NUEVO", placedAt, "shopify", "Pedido COD importado desde Shopify")
  }

  // ------------------------------------------------------------
  // ORDEN 3 — PENDIENTE_PAGO_TRANSPORTE / COD / 3 días atrás
  // ------------------------------------------------------------
  {
    const { items, subtotal } = buildItems([{ product: products[4], qty: 1 }])
    const shippingCost = 12000
    const transportCost = 11000
    const total = subtotal + shippingCost
    const placedAt = daysAgo(3)
    const t1 = new Date(placedAt.getTime() + 2 * 3600000)
    const order = await db.order.create({
      data: {
        orderNumber: "#1003",
        customerId: customers[5].id,
        status: "PENDIENTE_PAGO_TRANSPORTE",
        paymentMethod: "COD",
        subtotal,
        shippingCost,
        transportCost,
        total,
        declaredValue: subtotal,
        city: customers[5].city,
        address: customers[5].address,
        codPaid: false,
        codPaymentLink: `https://demo.wompi.co/l/${nextTxRef()}`,
        placedAt,
        createdAt: placedAt,
        items: { create: items },
      },
    })
    await addLog(order.id, null, "NUEVO", placedAt, "shopify")
    await addLog(order.id, "NUEVO", "PENDIENTE_PAGO_TRANSPORTE", t1, "system", "Esperando pago de transporte COD")
  }

  // ------------------------------------------------------------
  // ORDEN 4 — PENDIENTE_PAGO_TRANSPORTE / COD / hoy
  // ------------------------------------------------------------
  {
    const { items, subtotal } = buildItems([{ product: products[1], qty: 1 }])
    const shippingCost = 10000
    const transportCost = 9000
    const total = subtotal + shippingCost
    const placedAt = hoursAgo(5)
    const t1 = hoursAgo(4)
    const order = await db.order.create({
      data: {
        orderNumber: "#1004",
        customerId: customers[2].id,
        status: "PENDIENTE_PAGO_TRANSPORTE",
        paymentMethod: "COD",
        subtotal,
        shippingCost,
        transportCost,
        total,
        declaredValue: subtotal,
        city: customers[2].city,
        address: customers[2].address,
        codPaid: false,
        codPaymentLink: `https://demo.wompi.co/l/${nextTxRef()}`,
        placedAt,
        createdAt: placedAt,
        items: { create: items },
      },
    })
    await addLog(order.id, null, "NUEVO", placedAt, "shopify")
    await addLog(order.id, "NUEVO", "PENDIENTE_PAGO_TRANSPORTE", t1, "system", "Esperando pago de transporte COD")
  }

  // ------------------------------------------------------------
  // ORDEN 5 — PENDIENTE_PAGO_TRANSPORTE / COD / hoy
  // ------------------------------------------------------------
  {
    const { items, subtotal } = buildItems([
      { product: products[0], qty: 1 },
      { product: products[2], qty: 1 },
    ])
    const shippingCost = 9000
    const transportCost = 7500
    const total = subtotal + shippingCost
    const placedAt = hoursAgo(8)
    const t1 = hoursAgo(6)
    const order = await db.order.create({
      data: {
        orderNumber: "#1005",
        customerId: customers[6].id,
        status: "PENDIENTE_PAGO_TRANSPORTE",
        paymentMethod: "COD",
        subtotal,
        shippingCost,
        transportCost,
        total,
        declaredValue: subtotal,
        city: customers[6].city,
        address: customers[6].address,
        codPaid: false,
        codPaymentLink: `https://demo.bold.co/l/${nextTxRef()}`,
        placedAt,
        createdAt: placedAt,
        items: { create: items },
      },
    })
    await addLog(order.id, null, "NUEVO", placedAt, "shopify")
    await addLog(order.id, "NUEVO", "PENDIENTE_PAGO_TRANSPORTE", t1, "system", "Esperando pago de transporte COD")
  }

  // ------------------------------------------------------------
  // ORDEN 6 — PAGO_TRANSPORTE_CONFIRMADO / COD / placed 2 días atrás, pagado hoy
  // ------------------------------------------------------------
  {
    const { items, subtotal } = buildItems([{ product: products[5], qty: 1 }])
    const shippingCost = 11000
    const transportCost = 9500
    const total = subtotal + shippingCost
    const placedAt = daysAgo(2)
    const t1 = new Date(placedAt.getTime() + 2 * 3600000)
    const t2 = hoursAgo(3)
    const order = await db.order.create({
      data: {
        orderNumber: "#1006",
        customerId: customers[3].id,
        status: "PAGO_TRANSPORTE_CONFIRMADO",
        paymentMethod: "COD",
        subtotal,
        shippingCost,
        transportCost,
        total,
        declaredValue: subtotal,
        city: customers[3].city,
        address: customers[3].address,
        codPaid: true,
        codPaymentId: nextTxRef(),
        placedAt,
        transportPaidAt: t2,
        createdAt: placedAt,
        items: { create: items },
      },
    })
    await db.transaction.create({
      data: {
        orderId: order.id,
        provider: "WOMPI",
        type: "TRANSPORT",
        amount: transportCost,
        status: "APPROVED",
        reference: nextTxRef(),
        providerTxId: `wompi-${order.id.slice(-6)}`,
        paymentUrl: `https://demo.wompi.co/l/${order.id}`,
        rawResponse: JSON.stringify({ status: "APPROVED", amount: transportCost, currency: "COP" }),
        createdAt: t2,
        updatedAt: t2,
      },
    })
    await addLog(order.id, null, "NUEVO", placedAt, "shopify")
    await addLog(order.id, "NUEVO", "PENDIENTE_PAGO_TRANSPORTE", t1, "system")
    await addLog(order.id, "PENDIENTE_PAGO_TRANSPORTE", "PAGO_TRANSPORTE_CONFIRMADO", t2, "system", "Pago de transporte confirmado por WOMPI")
  }

  // ------------------------------------------------------------
  // ORDEN 7 — PAGO_TRANSPORTE_CONFIRMADO / COD / placed 4 días atrás, pagado hoy
  // ------------------------------------------------------------
  {
    const { items, subtotal } = buildItems([
      { product: products[1], qty: 1 },
      { product: products[3], qty: 1 },
    ])
    const shippingCost = 10000
    const transportCost = 8500
    const total = subtotal + shippingCost
    const placedAt = daysAgo(4)
    const t1 = new Date(placedAt.getTime() + 3 * 3600000)
    const t2 = hoursAgo(7)
    const order = await db.order.create({
      data: {
        orderNumber: "#1007",
        customerId: customers[4].id,
        status: "PAGO_TRANSPORTE_CONFIRMADO",
        paymentMethod: "COD",
        subtotal,
        shippingCost,
        transportCost,
        total,
        declaredValue: subtotal,
        city: customers[4].city,
        address: customers[4].address,
        codPaid: true,
        codPaymentId: nextTxRef(),
        placedAt,
        transportPaidAt: t2,
        createdAt: placedAt,
        items: { create: items },
      },
    })
    await db.transaction.create({
      data: {
        orderId: order.id,
        provider: "BOLD",
        type: "TRANSPORT",
        amount: transportCost,
        status: "APPROVED",
        reference: nextTxRef(),
        providerTxId: `bold-${order.id.slice(-6)}`,
        paymentUrl: `https://demo.bold.co/l/${order.id}`,
        rawResponse: JSON.stringify({ status: "APPROVED", amount: transportCost, currency: "COP" }),
        createdAt: t2,
        updatedAt: t2,
      },
    })
    await addLog(order.id, null, "NUEVO", placedAt, "shopify")
    await addLog(order.id, "NUEVO", "PENDIENTE_PAGO_TRANSPORTE", t1, "system")
    await addLog(order.id, "PENDIENTE_PAGO_TRANSPORTE", "PAGO_TRANSPORTE_CONFIRMADO", t2, "system", "Pago de transporte confirmado por BOLD")
  }

  // ------------------------------------------------------------
  // ORDEN 8 — PREPARANDO / PREPAID / placed 5 días atrás, paid 5 días atrás
  // ------------------------------------------------------------
  {
    const { items, subtotal } = buildItems([{ product: products[0], qty: 2 }])
    const shippingCost = 8000
    const transportCost = 6000
    const total = subtotal + shippingCost
    const placedAt = daysAgo(5)
    const t1 = new Date(placedAt.getTime() + 1 * 3600000)
    const t2 = new Date(placedAt.getTime() + 4 * 3600000)
    const order = await db.order.create({
      data: {
        orderNumber: "#1008",
        customerId: customers[0].id,
        status: "PREPARANDO",
        paymentMethod: "PREPAID",
        subtotal,
        shippingCost,
        transportCost,
        total,
        declaredValue: subtotal,
        city: customers[0].city,
        address: customers[0].address,
        placedAt,
        paidAt: t1,
        createdAt: placedAt,
        items: { create: items },
      },
    })
    await db.transaction.create({
      data: {
        orderId: order.id,
        provider: "MERCADOPAGO",
        type: "ORDER_PAYMENT",
        amount: total,
        status: "APPROVED",
        reference: nextTxRef(),
        providerTxId: `mp-${order.id.slice(-6)}`,
        paymentUrl: `https://demo.mercadopago.co/l/${order.id}`,
        rawResponse: JSON.stringify({ status: "approved", amount: total, currency: "COP" }),
        createdAt: t1,
        updatedAt: t1,
      },
    })
    await addLog(order.id, null, "NUEVO", placedAt, "shopify")
    await addLog(order.id, "NUEVO", "PREPARANDO", t2, "bodega", "Pago confirmado — inicia preparación")
  }

  // ------------------------------------------------------------
  // ORDEN 9 — PREPARANDO / COD / placed 6 días atrás
  // ------------------------------------------------------------
  {
    const { items, subtotal } = buildItems([{ product: products[4], qty: 1 }])
    const shippingCost = 11000
    const transportCost = 9500
    const total = subtotal + shippingCost
    const placedAt = daysAgo(6)
    const t1 = new Date(placedAt.getTime() + 2 * 3600000)
    const t2 = daysAgo(5)
    const t3 = new Date(daysAgo(5).getTime() + 6 * 3600000)
    const order = await db.order.create({
      data: {
        orderNumber: "#1009",
        customerId: customers[1].id,
        status: "PREPARANDO",
        paymentMethod: "COD",
        subtotal,
        shippingCost,
        transportCost,
        total,
        declaredValue: subtotal,
        city: customers[1].city,
        address: customers[1].address,
        codPaid: true,
        codPaymentId: nextTxRef(),
        placedAt,
        transportPaidAt: t2,
        createdAt: placedAt,
        items: { create: items },
      },
    })
    await db.transaction.create({
      data: {
        orderId: order.id,
        provider: "PAYU",
        type: "TRANSPORT",
        amount: transportCost,
        status: "APPROVED",
        reference: nextTxRef(),
        providerTxId: `payu-${order.id.slice(-6)}`,
        paymentUrl: `https://demo.payu.co/l/${order.id}`,
        rawResponse: JSON.stringify({ status: "APPROVED", amount: transportCost, currency: "COP" }),
        createdAt: t2,
        updatedAt: t2,
      },
    })
    await addLog(order.id, null, "NUEVO", placedAt, "shopify")
    await addLog(order.id, "NUEVO", "PENDIENTE_PAGO_TRANSPORTE", t1, "system")
    await addLog(order.id, "PENDIENTE_PAGO_TRANSPORTE", "PAGO_TRANSPORTE_CONFIRMADO", t2, "system")
    await addLog(order.id, "PAGO_TRANSPORTE_CONFIRMADO", "PREPARANDO", t3, "bodega", "Inicia preparación en bodega")
  }

  // ------------------------------------------------------------
  // Helper: crear envío + tracking events + print job
  // ------------------------------------------------------------
  async function createShipmentAndTracking(
    order: any,
    carrier: string,
    status: string,
    guideNumber: string,
    baseDate: Date,
    events: { status: string; message: string; city: string; offsetHours: number }[]
  ) {
    const shipment = await db.shipment.create({
      data: {
        orderId: order.id,
        carrier,
        guideNumber,
        mastershopId: `MS-${guideNumber}`,
        status,
        pdfUrl: `https://placehold.co/600x800?text=Guia+${guideNumber}`,
        createdAt: baseDate,
        updatedAt: baseDate,
      },
    })

    for (const ev of events) {
      await db.trackingEvent.create({
        data: {
          shipmentId: shipment.id,
          status: ev.status,
          message: ev.message,
          city: ev.city,
          occurredAt: new Date(baseDate.getTime() + ev.offsetHours * 3600000),
        },
      })
    }

    await db.printJob.create({
      data: {
        orderId: order.id,
        guideNumber,
        status: "PRINTED",
        printer: "Bodega-Printer-01",
        attempts: 1,
        queuedAt: baseDate,
        sentAt: new Date(baseDate.getTime() + 5 * 60000),
        printedAt: new Date(baseDate.getTime() + 10 * 60000),
      },
    })

    return shipment
  }

  // ------------------------------------------------------------
  // ORDEN 10 — ENVIADO / PREPAID / placed 7 días atrás, shipped 6 días atrás
  // ------------------------------------------------------------
  {
    const { items, subtotal } = buildItems([{ product: products[2], qty: 2 }])
    const shippingCost = 9000
    const transportCost = 7000
    const total = subtotal + shippingCost
    const placedAt = daysAgo(7)
    const paidAt = new Date(placedAt.getTime() + 1 * 3600000)
    const prepAt = new Date(placedAt.getTime() + 4 * 3600000)
    const shippedAt = daysAgo(6)
    const order = await db.order.create({
      data: {
        orderNumber: "#1010",
        customerId: customers[2].id,
        status: "ENVIADO",
        paymentMethod: "PREPAID",
        subtotal,
        shippingCost,
        transportCost,
        total,
        declaredValue: subtotal,
        city: customers[2].city,
        address: customers[2].address,
        placedAt,
        paidAt,
        shippedAt,
        createdAt: placedAt,
        items: { create: items },
      },
    })
    await db.transaction.create({
      data: {
        orderId: order.id,
        provider: "MERCADOPAGO",
        type: "ORDER_PAYMENT",
        amount: total,
        status: "APPROVED",
        reference: nextTxRef(),
        providerTxId: `mp-${order.id.slice(-6)}`,
        rawResponse: JSON.stringify({ status: "approved", amount: total, currency: "COP" }),
        createdAt: paidAt,
        updatedAt: paidAt,
      },
    })
    const carrier = carriers[0]
    await createShipmentAndTracking(order, carrier, "IN_TRANSIT", nextGuide(carrier), shippedAt, [
      { status: "CREATED", message: "Guía generada en Mastershop", city: "Bogotá", offsetHours: 0 },
      { status: "PRINTED", message: "Guía impresa en bodega", city: "Bogotá", offsetHours: 1 },
      { status: "IN_TRANSIT", message: "En camino a ciudad de destino", city: "Cali", offsetHours: 18 },
    ])
    await addLog(order.id, null, "NUEVO", placedAt, "shopify")
    await addLog(order.id, "NUEVO", "PREPARANDO", prepAt, "bodega")
    await addLog(order.id, "PREPARANDO", "ENVIADO", shippedAt, "bodega", "Paquete entregado a transportadora")
  }

  // ------------------------------------------------------------
  // ORDEN 11 — ENVIADO / COD / placed 8 días atrás, shipped 7 días atrás
  // ------------------------------------------------------------
  {
    const { items, subtotal } = buildItems([{ product: products[1], qty: 1 }])
    const shippingCost = 12000
    const transportCost = 10500
    const total = subtotal + shippingCost
    const placedAt = daysAgo(8)
    const pendAt = new Date(placedAt.getTime() + 2 * 3600000)
    const paidAt = daysAgo(7)
    const prepAt = new Date(daysAgo(7).getTime() + 3 * 3600000)
    const shippedAt = new Date(daysAgo(7).getTime() + 6 * 3600000)
    const order = await db.order.create({
      data: {
        orderNumber: "#1011",
        customerId: customers[3].id,
        status: "ENVIADO",
        paymentMethod: "COD",
        subtotal,
        shippingCost,
        transportCost,
        total,
        declaredValue: subtotal,
        city: customers[3].city,
        address: customers[3].address,
        codPaid: true,
        codPaymentId: nextTxRef(),
        placedAt,
        transportPaidAt: paidAt,
        shippedAt,
        createdAt: placedAt,
        items: { create: items },
      },
    })
    await db.transaction.create({
      data: {
        orderId: order.id,
        provider: "WOMPI",
        type: "TRANSPORT",
        amount: transportCost,
        status: "APPROVED",
        reference: nextTxRef(),
        providerTxId: `wompi-${order.id.slice(-6)}`,
        rawResponse: JSON.stringify({ status: "APPROVED", amount: transportCost, currency: "COP" }),
        createdAt: paidAt,
        updatedAt: paidAt,
      },
    })
    const carrier = carriers[1]
    await createShipmentAndTracking(order, carrier, "IN_TRANSIT", nextGuide(carrier), shippedAt, [
      { status: "CREATED", message: "Guía generada", city: "Bogotá", offsetHours: 0 },
      { status: "PRINTED", message: "Guía impresa", city: "Bogotá", offsetHours: 1 },
      { status: "IN_TRANSIT", message: "En tránsito hacia Barranquilla", city: "Barranquilla", offsetHours: 20 },
      { status: "IN_TRANSIT", message: "En centro de distribución", city: "Barranquilla", offsetHours: 30 },
    ])
    await addLog(order.id, null, "NUEVO", placedAt, "shopify")
    await addLog(order.id, "NUEVO", "PENDIENTE_PAGO_TRANSPORTE", pendAt, "system")
    await addLog(order.id, "PENDIENTE_PAGO_TRANSPORTE", "PAGO_TRANSPORTE_CONFIRMADO", paidAt, "system")
    await addLog(order.id, "PAGO_TRANSPORTE_CONFIRMADO", "PREPARANDO", prepAt, "bodega")
    await addLog(order.id, "PREPARANDO", "ENVIADO", shippedAt, "bodega")
  }

  // ------------------------------------------------------------
  // ORDEN 12 — ENVIADO / PREPAID / placed 9 días atrás, shipped 8 días atrás
  // ------------------------------------------------------------
  {
    const { items, subtotal } = buildItems([
      { product: products[0], qty: 1 },
      { product: products[3], qty: 1 },
    ])
    const shippingCost = 9000
    const transportCost = 7000
    const total = subtotal + shippingCost
    const placedAt = daysAgo(9)
    const paidAt = new Date(placedAt.getTime() + 1 * 3600000)
    const prepAt = new Date(placedAt.getTime() + 4 * 3600000)
    const shippedAt = daysAgo(8)
    const order = await db.order.create({
      data: {
        orderNumber: "#1012",
        customerId: customers[4].id,
        status: "ENVIADO",
        paymentMethod: "PREPAID",
        subtotal,
        shippingCost,
        transportCost,
        total,
        declaredValue: subtotal,
        city: customers[4].city,
        address: customers[4].address,
        placedAt,
        paidAt,
        shippedAt,
        createdAt: placedAt,
        items: { create: items },
      },
    })
    await db.transaction.create({
      data: {
        orderId: order.id,
        provider: "EPAYCO",
        type: "ORDER_PAYMENT",
        amount: total,
        status: "APPROVED",
        reference: nextTxRef(),
        providerTxId: `epayco-${order.id.slice(-6)}`,
        rawResponse: JSON.stringify({ status: "Aceptada", amount: total, currency: "COP" }),
        createdAt: paidAt,
        updatedAt: paidAt,
      },
    })
    const carrier = carriers[0]
    await createShipmentAndTracking(order, carrier, "IN_TRANSIT", nextGuide(carrier), shippedAt, [
      { status: "CREATED", message: "Guía generada", city: "Bogotá", offsetHours: 0 },
      { status: "PRINTED", message: "Guía impresa", city: "Bogotá", offsetHours: 1 },
      { status: "IN_TRANSIT", message: "En camino a Cartagena", city: "Cartagena", offsetHours: 24 },
    ])
    await addLog(order.id, null, "NUEVO", placedAt, "shopify")
    await addLog(order.id, "NUEVO", "PREPARANDO", prepAt, "bodega")
    await addLog(order.id, "PREPARANDO", "ENVIADO", shippedAt, "bodega")
  }

  // ------------------------------------------------------------
  // ORDEN 13 — ENTREGADO / COD / placed 10 días, delivered 7 días
  // ------------------------------------------------------------
  {
    const { items, subtotal } = buildItems([{ product: products[5], qty: 1 }])
    const shippingCost = 11000
    const transportCost = 9500
    const total = subtotal + shippingCost
    const placedAt = daysAgo(10)
    const pendAt = new Date(placedAt.getTime() + 2 * 3600000)
    const transportPaidAt = daysAgo(9)
    const prepAt = new Date(daysAgo(9).getTime() + 4 * 3600000)
    const shippedAt = new Date(daysAgo(9).getTime() + 8 * 3600000)
    const deliveredAt = daysAgo(7)
    const order = await db.order.create({
      data: {
        orderNumber: "#1013",
        customerId: customers[5].id,
        status: "ENTREGADO",
        paymentMethod: "COD",
        subtotal,
        shippingCost,
        transportCost,
        total,
        declaredValue: subtotal,
        city: customers[5].city,
        address: customers[5].address,
        codPaid: true,
        codPaymentId: nextTxRef(),
        placedAt,
        transportPaidAt,
        shippedAt,
        deliveredAt,
        createdAt: placedAt,
        items: { create: items },
      },
    })
    await db.transaction.create({
      data: {
        orderId: order.id,
        provider: "BOLD",
        type: "TRANSPORT",
        amount: transportCost,
        status: "APPROVED",
        reference: nextTxRef(),
        providerTxId: `bold-${order.id.slice(-6)}`,
        rawResponse: JSON.stringify({ status: "APPROVED", amount: transportCost, currency: "COP" }),
        createdAt: transportPaidAt,
        updatedAt: transportPaidAt,
      },
    })
    const carrier = carriers[1]
    await createShipmentAndTracking(order, carrier, "DELIVERED", nextGuide(carrier), shippedAt, [
      { status: "CREATED", message: "Guía generada", city: "Bogotá", offsetHours: 0 },
      { status: "PRINTED", message: "Guía impresa en bodega", city: "Bogotá", offsetHours: 1 },
      { status: "IN_TRANSIT", message: "En tránsito a Bucaramanga", city: "Bucaramanga", offsetHours: 24 },
      { status: "IN_TRANSIT", message: "En centro de distribución local", city: "Bucaramanga", offsetHours: 40 },
      { status: "DELIVERED", message: "Entregado al cliente", city: "Bucaramanga", offsetHours: 48 },
    ])
    await addLog(order.id, null, "NUEVO", placedAt, "shopify")
    await addLog(order.id, "NUEVO", "PENDIENTE_PAGO_TRANSPORTE", pendAt, "system")
    await addLog(order.id, "PENDIENTE_PAGO_TRANSPORTE", "PAGO_TRANSPORTE_CONFIRMADO", transportPaidAt, "system")
    await addLog(order.id, "PAGO_TRANSPORTE_CONFIRMADO", "PREPARANDO", prepAt, "bodega")
    await addLog(order.id, "PREPARANDO", "ENVIADO", shippedAt, "bodega")
    await addLog(order.id, "ENVIADO", "ENTREGADO", deliveredAt, "system", "Confirmación de entrega por transportadora")
  }

  // ------------------------------------------------------------
  // ORDEN 14 — ENTREGADO / PREPAID / placed 12 días, delivered 9 días
  // ------------------------------------------------------------
  {
    const { items, subtotal } = buildItems([{ product: products[0], qty: 2 }])
    const shippingCost = 8000
    const transportCost = 6000
    const total = subtotal + shippingCost
    const placedAt = daysAgo(12)
    const paidAt = new Date(placedAt.getTime() + 1 * 3600000)
    const prepAt = new Date(placedAt.getTime() + 4 * 3600000)
    const shippedAt = daysAgo(11)
    const deliveredAt = daysAgo(9)
    const order = await db.order.create({
      data: {
        orderNumber: "#1014",
        customerId: customers[0].id,
        status: "ENTREGADO",
        paymentMethod: "PREPAID",
        subtotal,
        shippingCost,
        transportCost,
        total,
        declaredValue: subtotal,
        city: customers[0].city,
        address: customers[0].address,
        placedAt,
        paidAt,
        shippedAt,
        deliveredAt,
        createdAt: placedAt,
        items: { create: items },
      },
    })
    await db.transaction.create({
      data: {
        orderId: order.id,
        provider: "MERCADOPAGO",
        type: "ORDER_PAYMENT",
        amount: total,
        status: "APPROVED",
        reference: nextTxRef(),
        providerTxId: `mp-${order.id.slice(-6)}`,
        rawResponse: JSON.stringify({ status: "approved", amount: total, currency: "COP" }),
        createdAt: paidAt,
        updatedAt: paidAt,
      },
    })
    const carrier = carriers[0]
    await createShipmentAndTracking(order, carrier, "DELIVERED", nextGuide(carrier), shippedAt, [
      { status: "CREATED", message: "Guía generada", city: "Bogotá", offsetHours: 0 },
      { status: "PRINTED", message: "Guía impresa", city: "Bogotá", offsetHours: 1 },
      { status: "IN_TRANSIT", message: "En reparto", city: "Bogotá", offsetHours: 20 },
      { status: "DELIVERED", message: "Entregado al cliente", city: "Bogotá", offsetHours: 36 },
    ])
    await addLog(order.id, null, "NUEVO", placedAt, "shopify")
    await addLog(order.id, "NUEVO", "PREPARANDO", prepAt, "bodega")
    await addLog(order.id, "PREPARANDO", "ENVIADO", shippedAt, "bodega")
    await addLog(order.id, "ENVIADO", "ENTREGADO", deliveredAt, "system")
  }

  // ------------------------------------------------------------
  // ORDEN 15 — DEVUELTO / COD / placed 15 días, returned 10 días
  // ------------------------------------------------------------
  {
    const { items, subtotal } = buildItems([{ product: products[1], qty: 1 }])
    const shippingCost = 12000
    const transportCost = 10500
    const total = subtotal + shippingCost
    const placedAt = daysAgo(15)
    const pendAt = new Date(placedAt.getTime() + 2 * 3600000)
    const transportPaidAt = daysAgo(14)
    const prepAt = new Date(daysAgo(14).getTime() + 4 * 3600000)
    const shippedAt = new Date(daysAgo(14).getTime() + 8 * 3600000)
    const deliveredAttempt = daysAgo(12)
    const returnedAt = daysAgo(10)
    const order = await db.order.create({
      data: {
        orderNumber: "#1015",
        customerId: customers[6].id,
        status: "DEVUELTO",
        paymentMethod: "COD",
        subtotal,
        shippingCost,
        transportCost,
        total,
        declaredValue: subtotal,
        city: customers[6].city,
        address: customers[6].address,
        codPaid: true,
        codPaymentId: nextTxRef(),
        placedAt,
        transportPaidAt,
        shippedAt,
        deliveredAt: deliveredAttempt,
        returnedAt,
        createdAt: placedAt,
        items: { create: items },
      },
    })
    await db.transaction.create({
      data: {
        orderId: order.id,
        provider: "PAYU",
        type: "TRANSPORT",
        amount: transportCost,
        status: "APPROVED",
        reference: nextTxRef(),
        providerTxId: `payu-${order.id.slice(-6)}`,
        rawResponse: JSON.stringify({ status: "APPROVED", amount: transportCost, currency: "COP" }),
        createdAt: transportPaidAt,
        updatedAt: transportPaidAt,
      },
    })
    const carrier = carriers[2]
    const shipment = await createShipmentAndTracking(order, carrier, "RETURNED", nextGuide(carrier), shippedAt, [
      { status: "CREATED", message: "Guía generada", city: "Bogotá", offsetHours: 0 },
      { status: "PRINTED", message: "Guía impresa", city: "Bogotá", offsetHours: 1 },
      { status: "IN_TRANSIT", message: "En tránsito a Pereira", city: "Pereira", offsetHours: 24 },
      { status: "IN_TRANSIT", message: "Intento de entrega fallido — cliente no disponible", city: "Pereira", offsetHours: 48 },
      { status: "RETURNED", message: "Devuelto a origen — bodega", city: "Bogotá", offsetHours: 96 },
    ])
    // Return record
    await db.return.create({
      data: {
        orderId: order.id,
        productId: products[1].id,
        reason: "Cliente no reclama el pedido — 3 intentos de entrega fallidos",
        city: customers[6].city,
        lostValue: transportCost + subtotal * 0.1,
        status: "RECEIVED",
        createdAt: returnedAt,
      },
    })
    await addLog(order.id, null, "NUEVO", placedAt, "shopify")
    await addLog(order.id, "NUEVO", "PENDIENTE_PAGO_TRANSPORTE", pendAt, "system")
    await addLog(order.id, "PENDIENTE_PAGO_TRANSPORTE", "PAGO_TRANSPORTE_CONFIRMADO", transportPaidAt, "system")
    await addLog(order.id, "PAGO_TRANSPORTE_CONFIRMADO", "PREPARANDO", prepAt, "bodega")
    await addLog(order.id, "PREPARANDO", "ENVIADO", shippedAt, "bodega")
    await addLog(order.id, "ENVIADO", "ENTREGADO", deliveredAttempt, "system", "Intento de entrega registrado por transportadora")
    await addLog(order.id, "ENTREGADO", "DEVUELTO", returnedAt, "system", "Pedido devuelto — cliente no reclama")
  }
}

// ============================================================
// 5. COST ENTRIES (4)
// ============================================================
async function seedCostEntries() {
  const periodStart = daysAgo(30)
  const periodEnd = new Date()
  await db.costEntry.create({ data: { category: "PRODUCT", description: "Compra de inventario — reposición mensual", amount: 15_000_000, periodStart, periodEnd } })
  await db.costEntry.create({ data: { category: "SHIPPING", description: "Flete y transportadoras — último mes", amount: 3_500_000, periodStart, periodEnd } })
  await db.costEntry.create({ data: { category: "ADVERTISING", description: "Campañas Meta Ads + Google Ads — mensual", amount: 4_000_000, periodStart, periodEnd } })
  await db.costEntry.create({ data: { category: "OPERATION", description: "Servidores, SAAS y nómina bodega — mensual", amount: 2_500_000, periodStart, periodEnd } })
}

// ============================================================
// 6. NOTIFICATIONS (5) — para admin
// ============================================================
async function seedNotifications(adminId: string, orders: any[]) {
  // Buscar órdenes por número
  const order1003 = await db.order.findUnique({ where: { orderNumber: "#1003" } })
  const order1006 = await db.order.findUnique({ where: { orderNumber: "#1006" } })
  const order1015 = await db.order.findUnique({ where: { orderNumber: "#1015" } })

  await db.notification.create({ data: { userId: adminId, orderId: order1003?.id, channel: "DASHBOARD", type: "WARNING", title: "Pago de transporte pendiente", message: `El pedido #1003 lleva 3 días esperando pago de transporte COD ($11.000 COP).`, read: false, createdAt: hoursAgo(2) } })
  await db.notification.create({ data: { userId: adminId, channel: "DASHBOARD", type: "INFO", title: "Nueva orden importada", message: `Se importaron 2 pedidos nuevos desde Shopify en la última hora.`, read: false, createdAt: hoursAgo(1) } })
  await db.notification.create({ data: { userId: adminId, orderId: order1006?.id, channel: "DASHBOARD", type: "SUCCESS", title: "Pago de transporte confirmado", message: `WOMPI aprobó el pago de transporte del pedido #1006 ($9.500 COP).`, read: true, createdAt: hoursAgo(3) } })
  await db.notification.create({ data: { userId: adminId, orderId: order1015?.id, channel: "DASHBOARD", type: "ERROR", title: "Pedido devuelto", message: `El pedido #1015 fue devuelto. Cliente no reclama el pedido. Pérdida estimada: $25.490 COP.`, read: false, createdAt: daysAgo(10) } })
  await db.notification.create({ data: { userId: adminId, channel: "DASHBOARD", type: "WARNING", title: "Inventario bajo", message: `El producto "Altavoz Bluetooth" tiene solo 8 unidades en inventario.`, read: true, createdAt: hoursAgo(5) } })
}

// ============================================================
// 7. ALERTS (4)
// ============================================================
async function seedAlerts() {
  const order1003 = await db.order.findUnique({ where: { orderNumber: "#1003" } })
  const altavoz = await db.product.findUnique({ where: { sku: "ALT-BT-006" } })

  await db.alert.create({
    data: {
      type: "COD_UNPAID",
      severity: "WARNING",
      entity: order1003?.id,
      message: `Pedido #1003 con pago de transporte COD pendiente hace 3 días.`,
      resolved: false,
      createdAt: hoursAgo(2),
    },
  })

  await db.alert.create({
    data: {
      type: "GUIDE_ERROR",
      severity: "CRITICAL",
      entity: "SRG100000003",
      message: `No se pudo generar la guía Mastershop para el pedido #1012 — reintentando (intento 2/3).`,
      resolved: false,
      createdAt: daysAgo(8),
    },
  })

  await db.alert.create({
    data: {
      type: "HIGH_RETURN",
      severity: "WARNING",
      message: `Tasa de devoluciones del 7% en los últimos 30 días (umbral: 5%). Revisar transportadoras con mayor tasa.`,
      resolved: false,
      createdAt: daysAgo(1),
    },
  })

  await db.alert.create({
    data: {
      type: "LOW_INVENTORY",
      severity: "WARNING",
      entity: altavoz?.id,
      message: `Producto "Altavoz Bluetooth" (SKU ALT-BT-006) con inventario bajo: 8 unidades.`,
      resolved: true,
      resolvedAt: hoursAgo(4),
      createdAt: hoursAgo(8),
    },
  })
}

// ============================================================
// 8. INTEGRATION SETTINGS (3)
// ============================================================
async function seedIntegrations() {
  await db.integrationSetting.create({
    data: {
      provider: "SHOPIFY",
      config: JSON.stringify({
        apiKey: "shpat_demo_abc123xyz789",
        shopDomain: "mi-tienda-demo.myshopify.com",
        webhookSecret: "whsec_demo_shopify_2024",
        apiVersion: "2024-07",
      }),
      active: true,
    },
  })

  await db.integrationSetting.create({
    data: {
      provider: "MASTERSHOP",
      config: JSON.stringify({
        token: "ms_token_demo_a1b2c3d4e5f6",
        apiUrl: "https://api.mastershop.co/v1",
        clientId: "MS-DEMO-001",
      }),
      active: true,
    },
  })

  await db.integrationSetting.create({
    data: {
      provider: "WOMPI",
      config: JSON.stringify({
        publicKey: "pub_demo_wompi_abc123",
        privateKey: "prv_demo_wompi_xyz789",
        integritySecret: "intsec_demo_wompi_2024",
        environment: "test",
        currency: "COP",
      }),
      active: true,
    },
  })
}

// ============================================================
// 9. AI INSIGHTS (2)
// ============================================================
async function seedAiInsights() {
  await db.aiInsight.create({
    data: {
      type: "MONTHLY_SUMMARY",
      title: "Resumen mensual — últimos 30 días",
      content: `# Resumen mensual — últimos 30 días

## Métricas clave
- **Pedidos:** 15
- **Ingresos:** $1.845.000 COP
- **Costos totales:** $25.000.000 COP
- **Margen bruto estimado:** 41%

## Estados de pedidos
- Entregados: 2
- En tránsito: 3
- En preparación: 2
- Pendientes de pago transporte: 3
- Nuevos: 2
- Devueltos: 1

## Insights
- Tasa de devolución del 7% — ligeramente por encima del umbral del 5%.
- WOMPI es la pasarela con mayor volumen de pagos de transporte.
- El producto "Auriculares Bluetooth" es el más vendido del mes.

## Recomendaciones
1. Revisar transportadora con mayor tasa de devoluciones.
2. Generar reposición urgente de "Altavoz Bluetooth".
3. Considerar campañas dirigidas a clientes FRECUENTE con cupón de descuento.`,
      metadata: JSON.stringify({ period: "30d", generatedBy: "ai-orchestrator", version: 1 }),
      createdAt: hoursAgo(6),
    },
  })

  await db.aiInsight.create({
    data: {
      type: "ANOMALY",
      title: "Anomalía: tasa de devolución elevada",
      content: `# Anomalía detectada — Tasa de devolución elevada

## Hallazgo
La tasa de devolución de los últimos 30 días es del **7%** (1 devolución de 15 pedidos).
El umbral configurable es del 5%.

## Posibles causas
1. **Transportadora INTERRAPIDISIMO** concentra la devolución detectada.
2. Cliente #1006 (Pereira) no reclama el pedido tras 3 intentos de entrega.
3. No hay seguimiento proactivo al cliente tras el primer intento fallido.

## Acciones recomendadas
- Activar notificación WhatsApp automática al cliente tras el primer intento fallido de entrega.
- Revisar SLA con INTERRAPIDISIMO.
- Evaluar cambio de transportadora para la zona de Pereira.`,
      metadata: JSON.stringify({ type: "HIGH_RETURN", severity: "WARNING", affectedOrders: ["#1015"], detectedAt: new Date().toISOString() }),
      createdAt: hoursAgo(4),
    },
  })
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log("🧹 Limpiando base de datos...")
  await wipeDatabase()

  console.log("👤 Creando usuarios...")
  const users = await seedUsers()
  const admin = users.find((u) => u.role === "ADMIN")!

  console.log("👥 Creando clientes...")
  const customers = await seedCustomers()

  console.log("📦 Creando productos...")
  const products = await seedProducts()

  console.log("🛒 Creando pedidos y relacionados...")
  await seedOrders(users, customers, products)

  console.log("💰 Creando cost entries...")
  await seedCostEntries()

  console.log("🔔 Creando notificaciones...")
  await seedNotifications(admin.id, [])

  console.log("⚠️  Creando alertas...")
  await seedAlerts()

  console.log("🔌 Creando integraciones...")
  await seedIntegrations()

  console.log("🤖 Creando AI insights...")
  await seedAiInsights()

  // Resumen
  const counts = {
    users: await db.user.count(),
    customers: await db.customer.count(),
    products: await db.product.count(),
    orders: await db.order.count(),
    orderItems: await db.orderItem.count(),
    orderStatusLogs: await db.orderStatusLog.count(),
    transactions: await db.transaction.count(),
    shipments: await db.shipment.count(),
    trackingEvents: await db.trackingEvent.count(),
    printJobs: await db.printJob.count(),
    returns: await db.return.count(),
    costEntries: await db.costEntry.count(),
    notifications: await db.notification.count(),
    alerts: await db.alert.count(),
    integrationSettings: await db.integrationSetting.count(),
    aiInsights: await db.aiInsight.count(),
  }

  console.log("\n✅ Seed completado!")
  console.log("─────────────────────────────────────")
  console.log(`Seeded: ${counts.users} users, ${counts.customers} customers, ${counts.products} products, ${counts.orders} orders`)
  console.log(`        ${counts.orderItems} order items, ${counts.orderStatusLogs} status logs, ${counts.transactions} transactions`)
  console.log(`        ${counts.shipments} shipments, ${counts.trackingEvents} tracking events, ${counts.printJobs} print jobs`)
  console.log(`        ${counts.returns} returns, ${counts.costEntries} cost entries, ${counts.notifications} notifications`)
  console.log(`        ${counts.alerts} alerts, ${counts.integrationSettings} integrations, ${counts.aiInsights} ai insights`)
  console.log("─────────────────────────────────────")
  console.log("Login demo:")
  console.log("  admin@demo.com     / admin123     (ADMIN)")
  console.log("  gerencia@demo.com  / gerencia123  (GERENCIA)")
  console.log("  bodega@demo.com    / bodega123    (BODEGA)")
  console.log("  servicio@demo.com  / servicio123  (SERVICIO)")
}

main()
  .catch((err) => {
    console.error("❌ Error en seed:", err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
