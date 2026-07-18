// ============================================================
// /api/shopify/sync-inventory — Sync inventory from Shopify
// ============================================================
// POST — sincroniza el inventario desde Shopify Admin API.
// Actualiza product.inventoryQty para cada producto.
// ADMIN only.

import { NextResponse } from 'next/server'
import { getCurrentUser, requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import {
  getShopifyConfig,
  getShopifyInventoryLevels,
  getShopifyProductInventoryIds,
} from '@/integrations/shopify/client'

export async function POST() {
  let user
  try {
    user = requireRole(await getCurrentUser(), 'ADMIN')
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 403
    return NextResponse.json({ error: (err as Error).message }, { status: statusCode })
  }

  try {
    const cfg = await getShopifyConfig()
    if (!cfg) {
      return NextResponse.json(
        { error: 'Shopify no está configurado. Configura las credenciales en Integraciones.' },
        { status: 400 },
      )
    }

    // 1. Obtener inventory_item_id por producto desde Shopify.
    const productInventoryMap = await getShopifyProductInventoryIds(cfg)
    if (productInventoryMap.size === 0) {
      return NextResponse.json({ ok: true, updated: 0, message: 'No hay productos en Shopify' })
    }

    // 2. Obtener niveles de inventario desde Shopify.
    const inventoryLevels = await getShopifyInventoryLevels(cfg)
    if (inventoryLevels.length === 0) {
      return NextResponse.json({ ok: true, updated: 0, message: 'No hay niveles de inventario en Shopify' })
    }

    // 3. Crear map de inventory_item_id → available.
    const inventoryMap = new Map<number, number>()
    for (const level of inventoryLevels) {
      if (level.available !== null && level.available !== undefined) {
        // Sumar si hay múltiples locations.
        const existing = inventoryMap.get(level.inventory_item_id) ?? 0
        inventoryMap.set(level.inventory_item_id, existing + level.available)
      }
    }

    // 4. Actualizar productos en la DB.
    const products = await db.product.findMany({
      where: { shopifyId: { not: null } },
      select: { id: true, shopifyId: true, title: true, inventoryQty: true },
    })

    let updated = 0
    let skipped = 0
    for (const product of products) {
      if (!product.shopifyId) continue
      const inventoryItemId = productInventoryMap.get(product.shopifyId)
      if (!inventoryItemId) {
        skipped++
        continue
      }
      const available = inventoryMap.get(inventoryItemId) ?? 0
      if (available !== product.inventoryQty) {
        await db.product.update({
          where: { id: product.id },
          data: { inventoryQty: available },
        })
        updated++
      }
    }

    logger.info('shopify.sync-inventory success', {
      userId: user.id,
      totalProducts: products.length,
      updated,
      skipped,
    })

    void audit.log({
      userId: user.id,
      action: 'INVENTORY_SYNC',
      entity: 'Product',
      metadata: { totalProducts: products.length, updated, skipped },
    })

    return NextResponse.json({
      ok: true,
      totalProducts: products.length,
      updated,
      skipped,
      message: `${updated} productos actualizados, ${skipped} sin cambios`,
    })
  } catch (err) {
    logger.error('api.shopify.sync-inventory error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Error al sincronizar inventario' }, { status: 500 })
  }
}
