// ============================================================
// WebhooksPanel.tsx — Webhooks management panel
// ============================================================
// Componente para la pestaña "Webhooks" de la página de integraciones.

'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Webhook,
  Copy,
  Check,
  Send,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Inbox,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { KPICard } from '@/components/shared/kpi-card'
import { useSession } from 'next-auth/react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

interface WebhookUrlInfo {
  source: string
  url: string
  method: string
  description: string
  topics?: Array<{ topic: string; description: string }>
  providers?: string[]
  note?: string
  bodyExample?: Record<string, unknown>
}

interface WebhookLogRow {
  id: string
  source: string
  event: string | null
  provider: string | null
  payload: string
  status: string
  error: string | null
  createdAt: string
  processedAt: string | null
}

interface WebhookStats {
  total: number
  byStatus: Record<string, number>
  bySource: Record<string, number>
  today: number
  last24h: number
  failed: number
  processed: number
}

const STATUS_BADGES: Record<string, { className: string; icon: typeof CheckCircle2 }> = {
  PROCESSED: { className: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700', icon: CheckCircle2 },
  FAILED: { className: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700', icon: XCircle },
  RECEIVED: { className: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700', icon: Clock },
  DUPLICATE: { className: 'bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800/60 dark:text-zinc-300 dark:border-zinc-600', icon: AlertCircle },
}

const SOURCE_COLORS: Record<string, string> = {
  SHOPIFY: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700',
  PAYMENTS: 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700',
  MASTERSHOP: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700',
}

export function WebhooksPanel() {
  const { data: session } = useSession()
  const qc = useQueryClient()
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const [simSource, setSimSource] = useState<'SHOPIFY' | 'PAYMENTS' | 'MASTERSHOP'>('SHOPIFY')
  const [simPaymentStatus, setSimPaymentStatus] = useState<'APPROVED' | 'DECLINED' | 'PENDING'>('APPROVED')
  const [simGuideStatus, setSimGuideStatus] = useState<'IN_TRANSIT' | 'DELIVERED' | 'RETURNED'>('DELIVERED')
  const [simPaymentMethod, setSimPaymentMethod] = useState<'PREPAID' | 'COD'>('COD')
  const [filterSource, setFilterSource] = useState('ALL')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const canSimulate = session?.user?.role === 'ADMIN' || session?.user?.role === 'GERENCIA' || session?.user?.role === 'BODEGA' || session?.user?.role === 'SERVICIO'

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data: webhookUrls, isLoading: urlsLoading } = useQuery({
    queryKey: ['webhook-urls'],
    queryFn: async () => {
      const res = await fetch('/api/integrations/webhook-urls')
      if (!res.ok) throw new Error('Error al cargar URLs')
      return res.json()
    },
  })

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['webhook-stats'],
    queryFn: async () => {
      const res = await fetch('/api/webhooks/log?stats=true')
      if (!res.ok) throw new Error('Error al cargar stats')
      return res.json() as Promise<WebhookStats>
    },
    refetchInterval: 10000,
  })

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['webhook-logs', filterSource, filterStatus, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '20',
        source: filterSource,
        status: filterStatus,
        search: debouncedSearch,
      })
      const res = await fetch(`/api/webhooks/log?${params}`)
      if (!res.ok) throw new Error('Error al cargar logs')
      return res.json() as Promise<{ logs: WebhookLogRow[]; total: number }>
    },
  })

  const simulateMutation = useMutation({
    mutationFn: async (body: { source: string; paymentStatus?: string; guideStatus?: string; paymentMethod?: string }) => {
      const res = await fetch('/api/webhooks/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      return data
    },
    onSuccess: (data) => {
      toast.success(`Webhook ${data.source} simulado`, {
        description: `HTTP ${data.httpStatus} en ${data.durationMs}ms`,
      })
      void qc.invalidateQueries({ queryKey: ['webhook-logs'] })
      void qc.invalidateQueries({ queryKey: ['webhook-stats'] })
    },
    onError: (err: Error) => {
      toast.error('Error al simular webhook', { description: err.message })
    },
  })

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(url)
      toast.success('URL copiada al portapapeles')
      setTimeout(() => setCopiedUrl(null), 2000)
    })
  }

  function handleSimulate() {
    const body: Record<string, string> = { source: simSource }
    if (simSource === 'SHOPIFY') body.paymentMethod = simPaymentMethod
    if (simSource === 'PAYMENTS') body.paymentStatus = simPaymentStatus
    if (simSource === 'MASTERSHOP') body.guideStatus = simGuideStatus
    simulateMutation.mutate(body as { source: string })
  }

  function formatDate(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <section>
        <h2 className="mb-3 text-lg font-semibold flex items-center gap-2">
          <Webhook className="size-5" /> Resumen de Webhooks
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Total recibidos" value={statsLoading ? '...' : String(stats?.total ?? 0)} icon={<Webhook className="size-5" />} />
          <KPICard title="Procesados" value={statsLoading ? '...' : String(stats?.processed ?? 0)} icon={<CheckCircle2 className="size-5" />} className="border-emerald-200 dark:border-emerald-800" />
          <KPICard title="Fallidos" value={statsLoading ? '...' : String(stats?.failed ?? 0)} icon={<XCircle className="size-5" />} className={(stats?.failed ?? 0) > 0 ? 'border-rose-200 dark:border-rose-800' : ''} />
          <KPICard title="Últimas 24h" value={statsLoading ? '...' : String(stats?.last24h ?? 0)} icon={<Clock className="size-5" />} />
        </div>
      </section>

      {/* Webhook URLs */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">URLs de Webhook</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Configura estas URLs en los paneles de tus integraciones. La URL base es{' '}
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{webhookUrls?.baseUrl ?? '...'}</code>
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {urlsLoading ? (
            <><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" /></>
          ) : (
            webhookUrls?.webhooks?.map((wh: WebhookUrlInfo) => (
              <Card key={wh.source}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{wh.source}</CardTitle>
                    <Badge className={SOURCE_COLORS[wh.source] ?? 'bg-zinc-100'} variant="outline">{wh.method}</Badge>
                  </div>
                  <CardDescription className="text-xs">{wh.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono bg-muted p-2 rounded truncate" title={wh.url}>{wh.url}</code>
                    <Button size="icon" variant="outline" className="size-8 shrink-0" onClick={() => copyUrl(wh.url)} aria-label="Copiar URL">
                      {copiedUrl === wh.url ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                    </Button>
                  </div>
                  {wh.topics && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Topics de Shopify a configurar:</p>
                      {wh.topics.map((t) => (
                        <div key={t.topic} className="flex items-center justify-between text-xs">
                          <code className="font-mono">{t.topic}</code>
                          <span className="text-muted-foreground">{t.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {wh.providers && (
                    <div className="flex flex-wrap gap-1">
                      {wh.providers.map((p) => <Badge key={p} variant="outline" className="text-xs">{p}</Badge>)}
                    </div>
                  )}
                  {wh.note && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">{wh.note}</p>
                  )}
                  {wh.bodyExample && (
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        <ChevronDown className="size-3" /> Ver ejemplo de body
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <pre className="text-xs font-mono bg-muted p-2 rounded mt-1 overflow-x-auto">{JSON.stringify(wh.bodyExample, null, 2)}</pre>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>

      {/* Simulador */}
      {canSimulate && (
        <section>
          <h2 className="mb-3 text-lg font-semibold flex items-center gap-2">
            <Send className="size-5" /> Simulador de Webhooks
          </h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enviar webhook de prueba</CardTitle>
              <CardDescription>Simula el envío de un webhook para probar el flujo completo sin integraciones reales.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Origen del webhook</label>
                  <Select value={simSource} onValueChange={(v) => setSimSource(v as 'SHOPIFY' | 'PAYMENTS' | 'MASTERSHOP')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SHOPIFY">Shopify (nuevo pedido)</SelectItem>
                      <SelectItem value="PAYMENTS">Pasarela (confirmación pago)</SelectItem>
                      <SelectItem value="MASTERSHOP">Mastershop (estado guía)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {simSource === 'SHOPIFY' && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Método de pago</label>
                    <Select value={simPaymentMethod} onValueChange={(v) => setSimPaymentMethod(v as 'PREPAID' | 'COD')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="COD">COD (contra entrega)</SelectItem>
                        <SelectItem value="PREPAID">Prepago</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {simSource === 'PAYMENTS' && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Estado del pago</label>
                    <Select value={simPaymentStatus} onValueChange={(v) => setSimPaymentStatus(v as 'APPROVED' | 'DECLINED' | 'PENDING')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="APPROVED">APPROVED (aprobado)</SelectItem>
                        <SelectItem value="DECLINED">DECLINED (rechazado)</SelectItem>
                        <SelectItem value="PENDING">PENDING (pendiente)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {simSource === 'MASTERSHOP' && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Estado de la guía</label>
                    <Select value={simGuideStatus} onValueChange={(v) => setSimGuideStatus(v as 'IN_TRANSIT' | 'DELIVERED' | 'RETURNED')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IN_TRANSIT">IN_TRANSIT (en tránsito)</SelectItem>
                        <SelectItem value="DELIVERED">DELIVERED (entregado)</SelectItem>
                        <SelectItem value="RETURNED">RETURNED (devuelto)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <Button onClick={handleSimulate} disabled={simulateMutation.isPending}>
                {simulateMutation.isPending ? <><RefreshCw className="size-4 animate-spin" /> Simulando...</> : <><Send className="size-4" /> Simular webhook</>}
              </Button>
              <p className="text-xs text-muted-foreground">El simulador busca datos reales (transacción PENDING, envío existente) o genera un pedido de Shopify de prueba.</p>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Historial */}
      <section>
        <h2 className="mb-3 text-lg font-semibold flex items-center gap-2">
          <Clock className="size-5" /> Historial de Webhooks
        </h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="Buscar por evento, proveedor, payload..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Origen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los orígenes</SelectItem>
              <SelectItem value="SHOPIFY">Shopify</SelectItem>
              <SelectItem value="PAYMENTS">Payments</SelectItem>
              <SelectItem value="MASTERSHOP">Mastershop</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los estados</SelectItem>
              <SelectItem value="PROCESSED">Procesados</SelectItem>
              <SelectItem value="FAILED">Fallidos</SelectItem>
              <SelectItem value="RECEIVED">Recibidos</SelectItem>
              <SelectItem value="DUPLICATE">Duplicados</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Card>
          <CardContent className="p-0">
            {logsLoading ? (
              <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : !logsData?.logs?.length ? (
              <div className="p-8 text-center text-muted-foreground">
                <Inbox className="size-10 mx-auto mb-2 opacity-50" />
                <p>No hay webhooks recibidos.</p>
                <p className="text-xs mt-1">Usa el simulador de arriba para enviar uno de prueba.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr className="text-left">
                      <th className="p-2 font-medium">Fecha</th>
                      <th className="p-2 font-medium">Origen</th>
                      <th className="p-2 font-medium">Evento</th>
                      <th className="p-2 font-medium">Proveedor</th>
                      <th className="p-2 font-medium">Estado</th>
                      <th className="p-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {logsData.logs.map((log) => {
                      const statusInfo = STATUS_BADGES[log.status] ?? STATUS_BADGES.RECEIVED
                      const StatusIcon = statusInfo.icon
                      const isExpanded = expandedLog === log.id
                      return (
                        <>
                          <tr key={log.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedLog(isExpanded ? null : log.id)}>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(log.createdAt)}</td>
                            <td className="p-2"><Badge className={SOURCE_COLORS[log.source] ?? ''} variant="outline">{log.source}</Badge></td>
                            <td className="p-2 font-mono text-xs">{log.event ?? '—'}</td>
                            <td className="p-2 text-xs">{log.provider ?? '—'}</td>
                            <td className="p-2"><Badge className={statusInfo.className} variant="outline"><StatusIcon className="size-3 mr-1" />{log.status}</Badge></td>
                            <td className="p-2">{isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</td>
                          </tr>
                          {isExpanded && (
                            <tr key={log.id + '-detail'} className="bg-muted/20">
                              <td colSpan={6} className="p-3">
                                <div className="space-y-2">
                                  {log.error && (
                                    <div className="text-xs text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 p-2 rounded"><strong>Error:</strong> {log.error}</div>
                                  )}
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Payload recibido:</p>
                                    <pre className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto max-h-60">
                                      {(() => { try { return JSON.stringify(JSON.parse(log.payload), null, 2) } catch { return log.payload.slice(0, 500) } })()}
                                    </pre>
                                  </div>
                                  {log.processedAt && <p className="text-xs text-muted-foreground">Procesado: {formatDate(log.processedAt)}</p>}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        {logsData?.total !== undefined && logsData.total > 0 && (
          <p className="text-xs text-muted-foreground mt-2">Mostrando {logsData.logs.length} de {logsData.total} webhooks</p>
        )}
      </section>
    </div>
  )
}
