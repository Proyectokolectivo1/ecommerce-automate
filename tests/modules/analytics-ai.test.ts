// ============================================================
// analytics-ai.test.ts — Pruebas de Analytics + AI
// ============================================================

import { describe, it, expect } from '../runner'
import { getStarProducts, getProductRanking, getProductStats } from '@/modules/analytics/product.analytics'
import { getReturnsDetailedMetrics, getReturnsList } from '@/modules/analytics/returns.metrics'
import { getProfitabilityByPeriod, getProfitabilityTrend, getCostBreakdown } from '@/modules/analytics/profitability.metrics'
import { listInsights, getAiStats, getLatestInsight } from '@/modules/ai/ai.service'
import { calculatePrediction } from '@/modules/ai/predict-sales'
import { detectAnomalies } from '@/modules/ai/detect-anomalies'

export function runAnalyticsAiTests(): void {
  // ----------------------------------------------------------
  // Analytics — Product Analytics
  // ----------------------------------------------------------
  describe('Analytics / Product Analytics (DB)', () => {
    it('getStarProducts devuelve 3 categorías de producto estrella', async () => {
      const star = await getStarProducts()
      expect(star).toHaveProperty('topByQuantity')
      expect(star).toHaveProperty('topByRevenue')
      expect(star).toHaveProperty('topByProfit')
    })

    it('getProductRanking devuelve ranking ordenable', async () => {
      const result = await getProductRanking({ sortBy: 'revenue', sortOrder: 'desc', limit: 10 })
      expect(result.products).toBeInstanceOf(Array)
      expect(result.total).toBeGreaterThanOrEqual(0)
      // Verifica orden desc por revenue
      for (let i = 1; i < result.products.length; i++) {
        expect(result.products[i].revenue).toBeLessThanOrEqual(result.products[i - 1].revenue)
      }
    })

    it('getProductRanking respeta el limit', async () => {
      const result = await getProductRanking({ limit: 3 })
      expect(result.products.length).toBeLessThanOrEqual(3)
    })

    it('getProductRanking filtra por búsqueda', async () => {
      const all = await getProductRanking({ limit: 50 })
      if (all.products.length > 0) {
        const title = all.products[0].title
        const filtered = await getProductRanking({ search: title, limit: 50 })
        expect(filtered.products.length).toBeGreaterThan(0)
        for (const p of filtered.products) {
          expect(p.title.toLowerCase()).toContain(title.toLowerCase())
        }
      }
    })

    it('cada ProductRankItem tiene margen calculado correctamente', async () => {
      const result = await getProductRanking({ limit: 5 })
      for (const p of result.products) {
        // profit = revenue - cost
        const expectedProfit = Math.round((p.revenue - p.cost) * 100) / 100
        expect(Math.abs(p.profit - expectedProfit)).toBeLessThan(1)
        // margin = profit / revenue * 100 (si revenue > 0)
        if (p.revenue > 0) {
          const expectedMargin = Math.round((p.profit / p.revenue) * 100 * 100) / 100
          expect(Math.abs(p.margin - expectedMargin)).toBeLessThan(1)
        }
      }
    })

    it('getProductStats devuelve métricas del catálogo', async () => {
      const stats = await getProductStats()
      expect(stats.totalProducts).toBeGreaterThan(0)
      expect(stats.activeProducts).toBeGreaterThanOrEqual(0)
      expect(stats.totalUnitsSold).toBeGreaterThanOrEqual(0)
      expect(stats.totalRevenue).toBeGreaterThanOrEqual(0)
      expect(stats.avgMargin).toBeGreaterThanOrEqual(0)
    })
  })

  // ----------------------------------------------------------
  // Analytics — Returns Metrics
  // ----------------------------------------------------------
  describe('Analytics / Returns Metrics (DB)', () => {
    it('getReturnsDetailedMetrics devuelve métricas completas', async () => {
      const m = await getReturnsDetailedMetrics()
      expect(m.count).toBeGreaterThanOrEqual(0)
      expect(m.totalOrders).toBeGreaterThan(0)
      expect(m.rate).toBeGreaterThanOrEqual(0)
      expect(m.lostValue).toBeGreaterThanOrEqual(0)
      expect(m.topProducts).toBeInstanceOf(Array)
      expect(m.topCities).toBeInstanceOf(Array)
    })

    it('getReturnsDetailedMetrics calcula tasa correctamente', async () => {
      const m = await getReturnsDetailedMetrics()
      if (m.totalOrders > 0) {
        const expectedRate = Math.round((m.count / m.totalOrders) * 100 * 100) / 100
        expect(Math.abs(m.rate - expectedRate)).toBeLessThan(0.1)
      }
    })

    it('getReturnsList devuelve lista paginada', async () => {
      const result = await getReturnsList({ limit: 5 })
      expect(result.returns).toBeInstanceOf(Array)
      expect(result.total).toBeGreaterThanOrEqual(0)
      expect(result.returns.length).toBeLessThanOrEqual(5)
    })

    it('getReturnsList respeta sortBy createdAt desc', async () => {
      const result = await getReturnsList({ sortBy: 'createdAt', sortOrder: 'desc', limit: 20 })
      for (let i = 1; i < result.returns.length; i++) {
        expect(new Date(result.returns[i].createdAt).getTime()).toBeLessThanOrEqual(
          new Date(result.returns[i - 1].createdAt).getTime(),
        )
      }
    })
  })

  // ----------------------------------------------------------
  // Analytics — Profitability Metrics
  // ----------------------------------------------------------
  describe('Analytics / Profitability Metrics (DB)', () => {
    it('getProfitabilityByPeriod calcula rentabilidad mensual', async () => {
      const p = await getProfitabilityByPeriod('month')
      expect(p.period).toBe('month')
      expect(p.revenue).toBeGreaterThanOrEqual(0)
      expect(p.totalRevenue).toBeGreaterThanOrEqual(p.revenue)
      expect(p.costs.total).toBeGreaterThanOrEqual(0)
      expect(p.costs.product).toBeGreaterThanOrEqual(0)
      expect(p.costs.shipping).toBeGreaterThanOrEqual(0)
      expect(p.grossProfit).toBe(p.totalRevenue - p.costs.product - p.costs.shipping)
      expect(p.netProfit).toBe(p.totalRevenue - p.costs.total)
    })

    it('getProfitabilityByPeriod funciona con período "all"', async () => {
      const p = await getProfitabilityByPeriod('all')
      expect(p.period).toBe('all')
      expect(p.ordersCount).toBeGreaterThanOrEqual(0)
    })

    it('getProfitabilityByPeriod con día debería tener menos pedidos que mes', async () => {
      const day = await getProfitabilityByPeriod('day')
      const month = await getProfitabilityByPeriod('month')
      expect(day.ordersCount).toBeLessThanOrEqual(month.ordersCount)
    })

    it('getProfitabilityTrend devuelve 30 puntos', async () => {
      const trend = await getProfitabilityTrend(30)
      expect(trend).toHaveLength(30)
      for (const point of trend) {
        expect(point.date).toBeTruthy()
        expect(point.label).toBeTruthy()
        expect(typeof point.revenue).toBe('number')
        expect(typeof point.costs).toBe('number')
        expect(typeof point.profit).toBe('number')
        // profit = revenue - costs
        const expectedProfit = Math.round((point.revenue - point.costs) * 100) / 100
        expect(Math.abs(point.profit - expectedProfit)).toBeLessThan(1)
      }
    })

    it('getCostBreakdown calcula porcentajes', () => {
      const breakdown = getCostBreakdown({
        product: 5000,
        shipping: 3000,
        advertising: 1000,
        operation: 1000,
        total: 10000,
      })
      expect(breakdown).toHaveLength(4)
      expect(breakdown[0].percentage).toBe(50) // 5000/10000
      expect(breakdown[1].percentage).toBe(30) // 3000/10000
      expect(breakdown[2].percentage).toBe(10) // 1000/10000
      expect(breakdown[3].percentage).toBe(10) // 1000/10000
    })

    it('getCostBreakdown devuelve array vacío si total es 0', () => {
      const breakdown = getCostBreakdown({
        product: 0,
        shipping: 0,
        advertising: 0,
        operation: 0,
        total: 0,
      })
      expect(breakdown).toHaveLength(0)
    })
  })

  // ----------------------------------------------------------
  // AI — ai.service (DB)
  // ----------------------------------------------------------
  describe('AI / ai.service (DB)', () => {
    it('listInsights devuelve insights y total', async () => {
      const result = await listInsights({ limit: 5 })
      expect(result.insights).toBeInstanceOf(Array)
      expect(result.total).toBeGreaterThanOrEqual(0)
    })

    it('getAiStats devuelve estadísticas', async () => {
      const stats = await getAiStats()
      expect(stats.total).toBeGreaterThanOrEqual(0)
      expect(stats.byType).toBeInstanceOf(Object)
      expect(stats.aiGenerated).toBeGreaterThanOrEqual(0)
      expect(stats.fallback).toBeGreaterThanOrEqual(0)
      expect(stats.aiGenerated + stats.fallback).toBe(stats.total)
    })

    it('getLatestInsight devuelve null para tipo inexistente o el más reciente', async () => {
      const insight = await getLatestInsight('SALES_PREDICTION')
      // Puede ser null si no hay, o un insight con tipo correcto
      if (insight) {
        expect(insight.type).toBe('SALES_PREDICTION')
      }
    })
  })

  // ----------------------------------------------------------
  // AI — predict-sales (función pura: calculatePrediction)
  // ----------------------------------------------------------
  describe('AI / predict-sales (calculatePrediction puro)', () => {
    it('calculatePrediction maneja historial vacío', () => {
      const p = calculatePrediction([])
      expect(p.forecast).toEqual([])
      expect(p.avgDailyRevenue).toBe(0)
      expect(p.totalProjected7d).toBe(0)
      expect(p.confidence).toBe('low')
    })

    it('calculatePrediction detecta tendencia ascendente', () => {
      // Ventas crecientes: 1000, 2000, 3000, ... 30000
      const history = Array.from({ length: 30 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        total: (i + 1) * 1000,
        count: 1,
      }))
      const p = calculatePrediction(history)
      expect(p.trend).toBe('up')
      expect(p.trendPercentage).toBeGreaterThan(0)
    })

    it('calculatePrediction detecta tendencia descendente', () => {
      // Ventas decrecientes: 30000, 29000, ... 1000
      const history = Array.from({ length: 30 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        total: (30 - i) * 1000,
        count: 1,
      }))
      const p = calculatePrediction(history)
      expect(p.trend).toBe('down')
      expect(p.trendPercentage).toBeLessThan(0)
    })

    it('calculatePrediction genera 7 días de pronóstico', () => {
      const history = Array.from({ length: 30 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        total: 5000,
        count: 1,
      }))
      const p = calculatePrediction(history)
      expect(p.forecast).toHaveLength(7)
      for (const f of p.forecast) {
        expect(f.date).toBeTruthy()
        expect(f.label).toBeTruthy()
        expect(f.predictedTotal).toBeGreaterThanOrEqual(0)
        expect(f.predictedCount).toBeGreaterThanOrEqual(0)
      }
    })

    it('calculatePrediction asigna confianza alta con 20+ días', () => {
      const history = Array.from({ length: 30 }, () => ({
        date: '2024-01-01',
        total: 1000,
        count: 1,
      }))
      const p = calculatePrediction(history)
      expect(p.confidence).toBe('high')
    })

    it('calculatePrediction asigna confianza baja con <10 días', () => {
      const history = Array.from({ length: 5 }, () => ({
        date: '2024-01-01',
        total: 1000,
        count: 1,
      }))
      const p = calculatePrediction(history)
      expect(p.confidence).toBe('low')
    })
  })

  // ----------------------------------------------------------
  // AI — detect-anomalies
  // ----------------------------------------------------------
  describe('AI / detect-anomalies (DB)', () => {
    it('detectAnomalies devuelve un reporte válido', async () => {
      const report = await detectAnomalies()
      expect(report.anomalies).toBeInstanceOf(Array)
      expect(report.salesStats).toBeTruthy()
      expect(report.salesStats.mean).toBeGreaterThanOrEqual(0)
      expect(report.salesStats.stdDev).toBeGreaterThanOrEqual(0)
      expect(report.totalAnomalies).toBe(report.anomalies.length)
    })

    it('detectAnomalies etiqueta anomalías con tipos correctos', async () => {
      const report = await detectAnomalies()
      const validTypes = ['SALES_SPIKE', 'SALES_DROP', 'HIGH_RETURNS', 'HIGH_COSTS']
      for (const a of report.anomalies) {
        expect(validTypes).toContain(a.type)
        expect(a.date).toBeTruthy()
        expect(a.description).toBeTruthy()
        expect(typeof a.deviation).toBe('number')
      }
    })
  })
}
