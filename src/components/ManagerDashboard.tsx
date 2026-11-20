'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Clock,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { TableScroll } from '@/components/TableScroll';
import { CompanySwitcher } from '@/components/CompanySwitcher';
import { SegmentedControl } from '@/components/SegmentedControl';
import { WorkspaceShell } from '@/components/WorkspaceShell';
import { AnalyticsTrendChart } from '@/components/AnalyticsTrendChart';
import { formatColones, formatInt } from '@/lib/seed-data';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import type { AiOperationalAlert, ExecutiveDashboardData, SemaforoEstado } from '@/lib/analytics';
import type { EmpresaConfig } from '@/lib/types';

interface ManagerDashboardProps {
  initialEmpresas: EmpresaConfig[];
  initialDashboard: ExecutiveDashboardData;
}

type AuditTab = 'desvios' | 'esperas' | 'devoluciones';

function SemaforoLabel({ estado }: { estado: SemaforoEstado }) {
  if (estado === 'verde') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
        <span className="w-2 h-2 rounded-xs bg-success shrink-0" aria-hidden="true" />
        <span>Óptimo (≤ promedio)</span>
      </span>
    );
  }
  if (estado === 'ambar') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-warning">
        <span className="w-2 h-2 rounded-xs bg-warning shrink-0" aria-hidden="true" />
        <span>Atención (hasta +15%)</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-danger">
      <span className="w-2 h-2 rounded-xs bg-danger shrink-0" aria-hidden="true" />
      <span>Crítico (&gt; +15%)</span>
    </span>
  );
}

export function ManagerDashboard({
  initialEmpresas,
  initialDashboard,
}: ManagerDashboardProps) {
  const [empresas, setEmpresas] = useState<EmpresaConfig[]>(initialEmpresas);
  const [dashboard, setDashboard] = useState<ExecutiveDashboardData>(initialDashboard);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string>(initialDashboard.empresa.id);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);

  // Analista IA
  const [alerts, setAlerts] = useState<AiOperationalAlert[]>([]);
  const [alertsMotor, setAlertsMotor] = useState<string | null>(null);
  const [alertsTime, setAlertsTime] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(false);

  // Auditoría en tiempo real
  const [auditTab, setAuditTab] = useState<AuditTab>('desvios');
  const [realtimeChannelActive, setRealtimeChannelActive] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string>('Recién actualizado');

  const fetchDashboard = useCallback(async (empId: string) => {
    setIsRefreshing(true);
    setRefreshError(false);
    try {
      const res = await fetch(`/api/gerente?empresa_id=${encodeURIComponent(empId)}`);
      if (!res.ok) {
        setRefreshError(true);
        return;
      }
      const data = (await res.json()) as {
        empresas: EmpresaConfig[];
        dashboard: ExecutiveDashboardData;
      };
      setEmpresas(data.empresas);
      setDashboard(data.dashboard);
      setLastSyncAt(
        new Date().toLocaleTimeString('es-CR', {
          timeZone: 'America/Costa_Rica',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    } catch {
      setRefreshError(true);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Suscripción en tiempo real vía supabase.channel cuando Supabase está configurado
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel('tablero-gerencial-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, () => {
        void fetchDashboard(selectedEmpresaId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, () => {
        void fetchDashboard(selectedEmpresaId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos' }, () => {
        void fetchDashboard(selectedEmpresaId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
        void fetchDashboard(selectedEmpresaId);
      })
      .subscribe((status) => {
        setRealtimeChannelActive(status === 'SUBSCRIBED');
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchDashboard, selectedEmpresaId]);

  function handleSwitchEmpresa(empId: string) {
    setSelectedEmpresaId(empId);
    setAlerts([]);
    setAlertsMotor(null);
    setAnalysisError(false);
    void fetchDashboard(empId);
  }

  async function handleAnalyzeWeek() {
    setIsAnalyzing(true);
    setAnalysisError(false);
    try {
      const res = await fetch('/api/analizar-semana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: selectedEmpresaId }),
      });
      const data = (await res.json()) as {
        alertas?: AiOperationalAlert[];
        motor?: string;
        generado_en?: string;
      };
      if (!res.ok || !data.alertas) {
        setAnalysisError(true);
      } else {
        setAlerts(data.alertas);
        setAlertsMotor(data.motor ?? 'respaldo_sql_local');
        if (data.generado_en) {
          setAlertsTime(
            new Date(data.generado_en).toLocaleTimeString('es-CR', {
              timeZone: 'America/Costa_Rica',
              hour: '2-digit',
              minute: '2-digit',
            })
          );
        }
      }
    } catch {
      setAnalysisError(true);
    } finally {
      setIsAnalyzing(false);
    }
  }

  const isFlotilla = dashboard.empresa.tipo_operacion === 'distribuidora_flotilla';

  return (
    <WorkspaceShell
      current="/gerente"
      sidebarNote={realtimeChannelActive ? 'Sincronización en tiempo real' : 'Lectura consolidada · Costa Rica'}
      toolbar={
        <div className="flex flex-wrap items-center gap-2.5">
          <CompanySwitcher companies={empresas} current={selectedEmpresaId} onChange={(company) => handleSwitchEmpresa(company.id)} />
          <button
            type="button"
            disabled={isRefreshing}
            onClick={() => void fetchDashboard(selectedEmpresaId)}
            className="ui-button ui-button-secondary"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{isRefreshing ? 'Actualizando…' : 'Actualizar'}</span>
          </button>
        </div>
      }
    >
      <main id="contenido" tabIndex={-1} className="workspace-content flex-1 space-y-(--space-stack)">
        {/* Contexto ejecutivo */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h1 className="page-title">
              {dashboard.empresa.nombre}
            </h1>
            <p className="text-sm text-muted mt-0.5">
              {isFlotilla
                ? 'Control financiero de flotilla propia, eficiencia por ruta y cumplimiento horario'
                : 'Control de envíos tercerizados vía proveedores externos y facturación electrónica CR'}
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-muted">
            Corte: {lastSyncAt}
          </span>
        </div>

        {refreshError && (
          <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger-strong">
            No se pudo actualizar el tablero. Usa Actualizar para volver a intentarlo.
          </p>
        )}

        {/* 1. KPIs Dinámicos según Modo Operativo */}
        {isFlotilla ? (
          <section
            key="kpis-flotilla"
            className="space-y-6"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-surface border border-line rounded-lg p-5">
                <p className="text-xs font-medium text-muted">Costo operativo total</p>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-ink [overflow-wrap:anywhere]">
                  {formatColones(dashboard.resumenFlotilla.costo_total_colones)}
                </p>
                <p className="mt-1 text-xs text-muted font-mono tabular-nums">
                  {dashboard.resumenFlotilla.total_viajes} viajes ejecutados
                </p>
              </div>

              <div className="bg-surface border border-line rounded-lg p-5">
                <p className="text-xs font-medium text-muted">
                  Costo promedio por unidad
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-ink [overflow-wrap:anywhere]">
                  {formatColones(dashboard.resumenFlotilla.costo_promedio_por_unidad)}
                </p>
                <p className="mt-1 text-xs text-muted font-mono tabular-nums">
                  {formatInt(dashboard.resumenFlotilla.total_unidades_entregadas)}{' '}
                  {dashboard.resumenFlotilla.unidad_default} entregadas
                </p>
              </div>

              <div className="bg-surface border border-line rounded-lg p-5">
                <p className="text-xs font-medium text-muted">Costo promedio por km</p>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-ink [overflow-wrap:anywhere]">
                  {formatColones(dashboard.resumenFlotilla.costo_promedio_por_km)}/km
                </p>
                <p className="mt-1 text-xs text-muted">
                  Incluye alquiler, diésel y mantenimiento
                </p>
              </div>

              <div className="bg-surface border border-line rounded-lg p-5">
                <p className="text-xs font-medium text-muted">Entregas a tiempo</p>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-ink [overflow-wrap:anywhere]">
                  {dashboard.resumenFlotilla.entregas_a_tiempo_pct.toFixed(1)}%
                </p>
                <p className="mt-1 text-xs text-muted">
                  Cumplimiento de ventana horaria CR
                </p>
              </div>
            </div>

            {/* Tarjetas por ruta con semáforo visual */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <h2 className="section-title">
                  Eficiencia financiera por ruta (semáforo vs. promedio)
                </h2>
                <span className="text-xs font-mono tabular-nums text-muted">
                  Promedio: {formatColones(dashboard.resumenFlotilla.costo_promedio_por_unidad)} / unidad
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {dashboard.resumenFlotilla.rutas.map((ruta) => (
                  <article
                    key={ruta.ruta_nombre}
                    className="bg-surface border border-line rounded-lg p-5 space-y-4"
                  >
                    <div className="flex items-start justify-between gap-2 pb-3 border-b border-line">
                      <div className="min-w-0">
                        <p className="text-xs text-muted">Zona {ruta.zona_destino}</p>
                        <h3 className="text-sm font-semibold text-ink mt-0.5 leading-snug">
                          {ruta.ruta_nombre}
                        </h3>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-muted">
                          {ruta.unidad_label === 'cajas'
                            ? 'Costo por caja entregada'
                            : ruta.unidad_label === 'bultos'
                              ? 'Costo por bulto entregado'
                              : ruta.unidad_label === 'kg'
                                ? 'Costo por kg entregado'
                                : 'Costo por unidad entregada'}
                        </p>
                        <p className="text-2xl font-semibold font-mono tabular-nums text-ink mt-0.5">
                          {formatColones(ruta.costo_por_unidad)}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-line text-xs">
                        <div>
                          <p className="text-muted">Costo por km</p>
                          <p className="font-mono font-semibold tabular-nums text-ink mt-0.5">
                            {formatColones(ruta.costo_por_km)}/km
                          </p>
                        </div>
                        <div>
                          <p className="text-muted">Entregas a tiempo</p>
                          <p className="font-mono font-semibold tabular-nums text-ink mt-0.5">
                            {ruta.entregas_a_tiempo_pct.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-line flex items-center justify-between gap-2">
                      <SemaforoLabel estado={ruta.semaforo} />
                      <span className="text-xs font-mono tabular-nums text-muted">
                        {ruta.viajes_count} viajes
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <section
            key="kpis-pyme"
            className="space-y-6"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-surface border border-line rounded-lg p-5">
                <p className="text-xs font-medium text-muted">
                  Costo promedio por pedido
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-ink [overflow-wrap:anywhere]">
                  {formatColones(dashboard.resumenPyme.costo_promedio_envio)}
                </p>
                <p className="mt-1 text-xs text-muted font-mono tabular-nums">
                  Total envíos: {formatColones(dashboard.resumenPyme.costo_total_envios)}
                </p>
              </div>

              <div className="bg-surface border border-line rounded-lg p-5">
                <p className="text-xs font-medium text-muted">
                  Entregas a tiempo (externos)
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-ink [overflow-wrap:anywhere]">
                  {dashboard.resumenPyme.entregas_a_tiempo_pct.toFixed(1)}%
                </p>
                <p className="mt-1 text-xs text-muted">
                  Consolidado de proveedores contratados
                </p>
              </div>

              <div className="bg-surface border border-line rounded-lg p-5">
                <p className="text-xs font-medium text-muted">
                  Tasa de facturación automática
                </p>
                <p className="mt-2 text-2xl font-semibold text-success font-mono tabular-nums">
                  {dashboard.resumenPyme.tasa_facturacion_pct.toFixed(1)}%
                </p>
                <p className="mt-1 text-xs text-muted font-mono tabular-nums">
                  {dashboard.resumenPyme.pedidos_facturados} de{' '}
                  {dashboard.resumenPyme.total_pedidos} pedidos
                </p>
              </div>

              <div className="bg-surface border border-line rounded-lg p-5">
                <p className="text-xs font-medium text-muted">
                  Monto facturado Hacienda CR
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-ink [overflow-wrap:anywhere]">
                  {formatColones(dashboard.resumenPyme.total_facturado_colones)}
                </p>
                <p className="mt-1 text-xs text-muted">IVA 13% incluido</p>
              </div>
            </div>

            {/* Desempeño por proveedor externo */}
            <section className="bg-surface border border-line rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-line flex items-center justify-between">
                <h2 className="section-title">
                  Desempeño por proveedor de mensajería externa
                </h2>
                <span className="text-xs font-mono tabular-nums text-muted">
                  {dashboard.resumenPyme.proveedores.length} proveedores activos
                </span>
              </div>
              <TableScroll label="Envíos por proveedor">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line bg-canvas text-xs font-medium text-muted">
                      <th scope="col" className="py-2.5 px-4">Proveedor</th>
                      <th scope="col" className="py-2.5 px-4 text-right">Pedidos</th>
                      <th scope="col" className="py-2.5 px-4 text-right">Entregados</th>
                      <th scope="col" className="py-2.5 px-4 text-right">% A tiempo</th>
                      <th scope="col" className="py-2.5 px-4 text-right">Costo promedio</th>
                      <th scope="col" className="py-2.5 px-4 text-right">Gasto acumulado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {dashboard.resumenPyme.proveedores.map((prov) => (
                      <tr key={prov.proveedor} className="hover:bg-subtle">
                        <td className="py-3 px-4 font-medium text-ink">
                          {prov.proveedor}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-secondary">
                          {prov.pedidos_count}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-secondary">
                          {prov.entregados_count}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-success">
                          {prov.a_tiempo_pct.toFixed(1)}%
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-ink">
                          {formatColones(prov.costo_promedio_pedido)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-ink">
                          {formatColones(prov.costo_total_colones)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </section>
          </section>
        )}

        {/* 2. Gráfico de Tendencia Diaria + Panel Analista IA */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <section className="min-w-0 xl:col-span-7 bg-surface border border-line rounded-lg p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-line">
              <div>
                <h2 className="section-title">
                  Evolución diaria de costos y volumen despachado
                </h2>
                <p className="text-xs text-muted">
                  Línea: costo operativo en colones (₡) · Barras: volumen en{' '}
                  {dashboard.empresa.unidad_medida_default}
                </p>
              </div>
            </div>

            <AnalyticsTrendChart
              data={dashboard.tendenciaDiaria}
              unidadLabel={dashboard.empresa.unidad_medida_default}
            />
          </section>

          {/* Panel Analista IA Innova Track */}
          <section className="min-w-0 xl:col-span-5 bg-surface border border-line rounded-lg p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
                  <div>
                    <h2 className="section-title">
                      Analista IA Innova Track
                    </h2>
                    <p className="text-xs text-muted">
                      Diagnóstico semanal de anomalías e impacto en ₡
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isAnalyzing}
                  onClick={() => void handleAnalyzeWeek()}
                  className="ui-button ui-button-primary shrink-0"
                >
                  {isAnalyzing && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  )}
                  <span>{isAnalyzing ? 'Analizando...' : 'Analizar operación'}</span>
                </button>
              </div>

              {analysisError && (
                <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong">
                  No se pudo generar el análisis. Vuelve a seleccionar Analizar operación.
                </p>
              )}

              {alerts.length === 0 ? (
                <div className="p-4 rounded-md bg-subtle text-sm text-secondary space-y-2">
                  <p className="font-medium text-ink">
                    Diagnóstico ejecutivo bajo demanda
                  </p>
                  <p className="text-xs text-secondary leading-relaxed">
                    Presiona <strong>Analizar operación</strong> para consolidar las vistas de
                    desvíos de odómetro, esperas en andén y rechazos, identificando las 3
                    prioridades de la semana con su impacto exacto en colones.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {alerts.map((alerta) => (
                    <div key={alerta.id} className="py-3.5 first:pt-1 last:pb-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-ink leading-snug">
                          {alerta.titulo}
                        </p>
                        <span
                          className={`font-mono text-xs font-semibold tabular-nums shrink-0 ${
                            alerta.severidad === 'critica'
                              ? 'text-danger'
                              : alerta.severidad === 'alta'
                                ? 'text-warning'
                                : 'text-secondary'
                          }`}
                        >
                          {alerta.impacto_formateado}
                        </span>
                      </div>
                      <p className="text-xs text-secondary leading-relaxed">
                        {alerta.que_paso}{' '}
                        <span className="font-medium text-ink">
                          Acción: {alerta.accion_recomendada}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {alertsMotor && (
              <div className="pt-3 border-t border-line flex items-center justify-between text-sm text-muted">
                <span>
                  Motor:{' '}
                  {alertsMotor === 'claude-3-5-sonnet-latest'
                    ? 'Claude Sonnet'
                    : 'Respaldo analítico SQL'}
                </span>
                {alertsTime && <span className="font-mono tabular-nums">{alertsTime} CR</span>}
              </div>
            )}
          </section>
        </div>

        {/* 3. Tablas de Auditoría en Tiempo Real */}
        <section
          aria-label="Auditoría operativa en tiempo real"
          className="bg-surface border border-line rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-line flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="section-title">
                Auditoría operativa en tiempo real
              </h2>
              <p className="text-xs text-muted">
                Incidencias detectadas en desvíos mayores al 10%, esperas en cliente y
                devoluciones
              </p>
            </div>

            <SegmentedControl
              label="Categorías de auditoría"
              value={auditTab}
              onChange={setAuditTab}
              options={[
                { id: 'desvios', label: `Desvíos >10% (${dashboard.auditorias.desviosKilometraje.length})` },
                { id: 'esperas', label: `Esperas críticas (${dashboard.auditorias.esperasCriticas.length})` },
                { id: 'devoluciones', label: `Devoluciones (${dashboard.auditorias.devoluciones.length})` },
              ]}
            />
          </div>

          {auditTab === 'desvios' && (
            <TableScroll label="Desvíos de kilometraje">
              {dashboard.auditorias.desviosKilometraje.length === 0 ? (
                <p className="p-6 text-sm text-muted">
                  No se registran desvíos superiores al 10% sobre el kilometraje teórico.
                </p>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line bg-canvas text-xs font-medium text-muted">
                      <th scope="col" className="py-2.5 px-4">Fecha</th>
                      <th scope="col" className="py-2.5 px-4">Ruta</th>
                      <th scope="col" className="py-2.5 px-4">Chofer y placa</th>
                      <th scope="col" className="py-2.5 px-4 text-right">Plan vs. Real</th>
                      <th scope="col" className="py-2.5 px-4 text-right">Desvío</th>
                      <th scope="col" className="py-2.5 px-4 text-right">Sobrecosto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {dashboard.auditorias.desviosKilometraje.map((d) => (
                      <tr key={d.viaje_id} className="hover:bg-subtle">
                        <td className="py-3 px-4 font-mono text-xs text-secondary whitespace-nowrap">
                          {d.fecha}
                        </td>
                        <td className="py-3 px-4 font-medium text-ink">{d.ruta_nombre}</td>
                        <td className="py-3 px-4 text-secondary whitespace-nowrap">
                          {d.chofer_nombre} · <span className="font-mono">{d.placa}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-secondary whitespace-nowrap">
                          {d.km_planificados} km / {d.km_reales} km
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-danger whitespace-nowrap">
                          +{d.desviacion_km.toFixed(1)} km (+{d.desviacion_pct.toFixed(0)}%)
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-ink whitespace-nowrap">
                          {formatColones(d.sobrecosto_colones)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TableScroll>
          )}

          {auditTab === 'esperas' && (
            <TableScroll label="Tiempos de espera">
              {dashboard.auditorias.esperasCriticas.length === 0 ? (
                <p className="p-6 text-sm text-muted">
                  Todos los clientes registran tiempos de espera dentro de lo esperado.
                </p>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line bg-canvas text-xs font-medium text-muted">
                      <th scope="col" className="py-2.5 px-4">Cliente</th>
                      <th scope="col" className="py-2.5 px-4">Zona</th>
                      <th scope="col" className="py-2.5 px-4 text-right">Visitas</th>
                      <th scope="col" className="py-2.5 px-4 text-right">Espera promedio</th>
                      <th scope="col" className="py-2.5 px-4 text-right">Espera máxima</th>
                      <th scope="col" className="py-2.5 px-4 text-right">En ventana</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {dashboard.auditorias.esperasCriticas.map((w) => (
                      <tr key={w.cliente_id} className="hover:bg-subtle">
                        <td className="py-3 px-4 font-medium text-ink">
                          {w.cliente_nombre}
                        </td>
                        <td className="py-3 px-4 text-secondary">{w.zona}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-secondary">
                          {w.visitas}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-warning">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                            {w.espera_promedio_min.toFixed(0)} min
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-danger">
                          {w.espera_max_min.toFixed(0)} min
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-secondary">
                          {w.cumple_ventana_pct.toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TableScroll>
          )}

          {auditTab === 'devoluciones' && (
            <TableScroll label="Devoluciones">
              {dashboard.auditorias.devoluciones.length === 0 ? (
                <p className="p-6 text-sm text-muted">
                  No se registran devoluciones o rechazos de mercadería en el período.
                </p>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line bg-canvas text-xs font-medium text-muted">
                      <th scope="col" className="py-2.5 px-4">Fecha</th>
                      <th scope="col" className="py-2.5 px-4">Código</th>
                      <th scope="col" className="py-2.5 px-4">Cliente</th>
                      <th scope="col" className="py-2.5 px-4">Motivo</th>
                      <th scope="col" className="py-2.5 px-4 text-right">Cantidad</th>
                      <th scope="col" className="py-2.5 px-4 text-right">Impacto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {dashboard.auditorias.devoluciones.map((r) => (
                      <tr key={r.entrega_id} className="hover:bg-subtle">
                        <td className="py-3 px-4 font-mono text-xs text-secondary whitespace-nowrap">
                          {r.fecha}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs font-medium text-accent whitespace-nowrap">
                          <Link href={`/tracking/${r.codigo_tracking}`} className="hover:underline">
                            {r.codigo_tracking}
                          </Link>
                        </td>
                        <td className="py-3 px-4 font-medium text-ink">
                          {r.cliente_nombre}
                        </td>
                        <td className="py-3 px-4 text-danger font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            {r.motivo_rechazo}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-secondary whitespace-nowrap">
                          {r.cantidad_rechazada} {r.unidad_medida}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-ink whitespace-nowrap">
                          {formatColones(r.impacto_colones)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TableScroll>
          )}
        </section>
      </main>
    </WorkspaceShell>
  );
}
