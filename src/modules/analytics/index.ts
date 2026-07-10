// ============================================================
// analytics/index.ts — Barrel export for the analytics module
// ============================================================

export {
  getSalesKPIs,
  getSalesTrend,
  getOrdersByStatus,
  getOrdersByPaymentMethod,
  getTopProducts,
  getReturnsMetrics,
  getProfitability,
} from './sales.metrics'

export type {
  Period,
  SalesKPIs,
  SalesTrendPoint,
  OrdersByStatusPoint,
  PaymentMethodBreakdown,
  TopProduct,
  ReturnsMetrics,
  Profitability,
} from './sales.metrics'
