'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  BarChart3,
  Clock,
  FileText,
  Home,
  Loader2,
  RefreshCw,
  Route,
  Settings,
  Sparkles,
  Truck,
} from 'lucide-react';
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

const TRANSITION_EASE = [0.22, 1, 0.36, 1] as const;

function SemaforoLabel({ estado }: { estado: SemaforoEstado }) {
  if (estado === 'verde') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
        <span className="w-2 h-2 rounded-xs bg-emerald-600 shrink-0" aria-hidden="true" />
        <span>Óptimo (≤ promedio)</span>
      </span>
    );
  }
  if (estado === 'ambar') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
        <span className="w-2 h-2 rounded-xs bg-amber-500 shrink-0" aria-hidden="true" />
        <span>Atención (hasta +15%)</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
      <span className="w-2 h-2 rounded-xs bg-red-600 shrink-0" aria-hidden="true" />
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

  // Analista IA
  const [alerts, setAlerts] = useState<AiOperationalAlert[]>([]);
  const [alertsMotor, setAlertsMotor] = useState<string | null>(null);
  const [alertsTime, setAlertsTime] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Auditoría en tiempo real
  const [auditTab, setAuditTab] = useState<AuditTab>('desvios');
  const [realtimeChannelActive, setRealtimeChannelActive] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string>('Recién actualizado');

  const fetchDashboard = useCallback(async (empId: string) => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/gerente?empresa_id=${encodeURIComponent(empId)}`);
      if (!res.ok) return;
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
    void fetchDashboard(empId);
  }

  async function handleAnalyzeWeek() {
    setIsAnalyzing(true);
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
      if (res.ok && data.alertas) {
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
    } finally {
      setIsAnalyzing(false);
    }
  }

  const isFlotilla = dashboard.empresa.tipo_operacion === 'distribuidora_flotilla';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Barra lateral */}
      <aside className="w-full lg:w-64 shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col lg:sticky lg:top-0 lg:h-screen">
        <div className="px-6 py-5 border-b border-slate-200">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap hover:text-blue-700 transition-colors"
          >
            Innova Track
          </Link>
        </div>

        <nav aria-label="Navegación principal" className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
          <Link
            href="/"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 whitespace-nowrap shrink-0 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
          >
            <Home className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Inicio</span>
          </Link>
          <Link
            href="/pedidos/nuevo"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 whitespace-nowrap shrink-0 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
          >
            <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Copiloto de Pedidos</span>
          </Link>
          <Link
            href="/chofer"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 whitespace-nowrap shrink-0 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
          >
            <Truck className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>App Chofer</span>
          </Link>
          <span className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium bg-slate-900 text-white whitespace-nowrap shrink-0">
            <BarChart3 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Tablero Gerencial</span>
          </span>
          <Link
            href="/tracking/IT-8901"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 whitespace-nowrap shrink-0 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
          >
            <Route className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Tracking Público</span>
          </Link>
          <Link
            href="/configuracion"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 whitespace-nowrap shrink-0 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
          >
            <Settings className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Configuración APIs</span>
          </Link>
        </nav>

        <div className="hidden lg:block mt-auto p-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
          <p className="font-medium text-slate-700">Sincronización en vivo</p>
          <p>
            {realtimeChannelActive
              ? 'Canal Supabase activo en tiempo real.'
              : 'Lectura operativa consolidada (Costa Rica UTC-6).'}
          </p>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Encabezado superior con switch de modo operativo y actualización */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex items-center gap-2 text-sm text-slate-500">
            <Link href="/" className="font-medium text-slate-900 hover:underline whitespace-nowrap">
              Innova Track
            </Link>
            <span aria-hidden="true">/</span>
            <span className="truncate">Tablero Gerencial Unificado</span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div
              role="group"
              aria-label="Selector de modo operativo"
              className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-md"
            >
              {empresas.map((emp) => {
                const active = emp.id === selectedEmpresaId;
                return (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => handleSwitchEmpresa(emp.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap transition-all duration-150 active:scale-[0.98] ${
                      active
                        ? 'bg-white text-slate-900 border border-slate-200'
                        : 'text-slate-600 hover:text-slate-900 border border-transparent'
                    }`}
                  >
                    {emp.tipo_operacion === 'distribuidora_flotilla'
                      ? 'Distribuidora Flotilla'
                      : 'PyME Tercerizada'}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={isRefreshing}
              onClick={() => void fetchDashboard(selectedEmpresaId)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap transition-all duration-150 active:scale-[0.98]"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Actualizar</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-8">
          {/* Contexto ejecutivo */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                {dashboard.empresa.nombre}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {isFlotilla
                  ? 'Control financiero de flotilla propia, eficiencia por ruta y cumplimiento horario'
                  : 'Control de envíos tercerizados vía proveedores externos y facturación electrónica CR'}
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Corte: {lastSyncAt}
            </span>
          </div>

          {/* 1. KPIs Dinámicos según Modo Operativo */}
          <AnimatePresence mode="wait">
            {isFlotilla ? (
              <motion.section
                key="kpis-flotilla"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: TRANSITION_EASE }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white border border-slate-200 rounded-lg p-5">
                    <p className="text-xs font-medium text-slate-500">Costo operativo total</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                      {formatColones(dashboard.resumenFlotilla.costo_total_colones)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                      {dashboard.resumenFlotilla.total_viajes} viajes ejecutados
                    </p>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg p-5">
                    <p className="text-xs font-medium text-slate-500">
                      Costo promedio por unidad
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                      {formatColones(dashboard.resumenFlotilla.costo_promedio_por_unidad)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                      {formatInt(dashboard.resumenFlotilla.total_unidades_entregadas)}{' '}
                      {dashboard.resumenFlotilla.unidad_default} entregadas
                    </p>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg p-5">
                    <p className="text-xs font-medium text-slate-500">Costo promedio por km</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                      {formatColones(dashboard.resumenFlotilla.costo_promedio_por_km)}/km
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Incluye alquiler, diésel y mantenimiento
                    </p>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg p-5">
                    <p className="text-xs font-medium text-slate-500">Entregas a tiempo</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                      {dashboard.resumenFlotilla.entregas_a_tiempo_pct.toFixed(1)}%
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Cumplimiento de ventana horaria CR
                    </p>
                  </div>
                </div>

                {/* Tarjetas por ruta con semáforo visual */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-base font-semibold text-slate-900">
                      Eficiencia financiera por ruta (semáforo vs. promedio)
                    </h2>
                    <span className="text-xs font-mono tabular-nums text-slate-500">
                      Promedio: {formatColones(dashboard.resumenFlotilla.costo_promedio_por_unidad)} / unidad
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {dashboard.resumenFlotilla.rutas.map((ruta) => (
                      <article
                        key={ruta.ruta_nombre}
                        className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
                      >
                        <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200">
                          <div className="min-w-0">
                            <p className="text-xs text-slate-500">Zona {ruta.zona_destino}</p>
                            <h3 className="text-sm font-semibold text-slate-900 mt-0.5 leading-snug">
                              {ruta.ruta_nombre}
                            </h3>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <p className="text-xs text-slate-500">
                              {ruta.unidad_label === 'cajas'
                                ? 'Costo por caja entregada'
                                : ruta.unidad_label === 'bultos'
                                  ? 'Costo por bulto entregado'
                                  : ruta.unidad_label === 'kg'
                                    ? 'Costo por kg entregado'
                                    : 'Costo por unidad entregada'}
                            </p>
                            <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                              {formatColones(ruta.costo_por_unidad)}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                            <div>
                              <p className="text-slate-500">Costo por km</p>
                              <p className="font-mono font-semibold tabular-nums text-slate-900 mt-0.5">
                                {formatColones(ruta.costo_por_km)}/km
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-500">Entregas a tiempo</p>
                              <p className="font-mono font-semibold tabular-nums text-slate-900 mt-0.5">
                                {ruta.entregas_a_tiempo_pct.toFixed(1)}%
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                          <SemaforoLabel estado={ruta.semaforo} />
                          <span className="text-xs font-mono tabular-nums text-slate-500">
                            {ruta.viajes_count} viajes
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </motion.section>
            ) : (
              <motion.section
                key="kpis-pyme"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: TRANSITION_EASE }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white border border-slate-200 rounded-lg p-5">
                    <p className="text-xs font-medium text-slate-500">
                      Costo promedio por pedido
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                      {formatColones(dashboard.resumenPyme.costo_promedio_envio)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                      Total envíos: {formatColones(dashboard.resumenPyme.costo_total_envios)}
                    </p>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg p-5">
                    <p className="text-xs font-medium text-slate-500">
                      Entregas a tiempo (externos)
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                      {dashboard.resumenPyme.entregas_a_tiempo_pct.toFixed(1)}%
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Consolidado de proveedores contratados
                    </p>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg p-5">
                    <p className="text-xs font-medium text-slate-500">
                      Tasa de facturación automática
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-emerald-700 font-mono tabular-nums">
                      {dashboard.resumenPyme.tasa_facturacion_pct.toFixed(1)}%
                    </p>
                    <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                      {dashboard.resumenPyme.pedidos_facturados} de{' '}
                      {dashboard.resumenPyme.total_pedidos} pedidos
                    </p>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg p-5">
                    <p className="text-xs font-medium text-slate-500">
                      Monto facturado Hacienda CR
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                      {formatColones(dashboard.resumenPyme.total_facturado_colones)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">IVA 13% incluido</p>
                  </div>
                </div>

                {/* Desempeño por proveedor externo */}
                <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-slate-900">
                      Desempeño por proveedor de mensajería externa
                    </h2>
                    <span className="text-xs font-mono tabular-nums text-slate-500">
                      {dashboard.resumenPyme.proveedores.length} proveedores activos
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                          <th className="py-2.5 px-4">Proveedor</th>
                          <th className="py-2.5 px-4 text-right">Pedidos</th>
                          <th className="py-2.5 px-4 text-right">Entregados</th>
                          <th className="py-2.5 px-4 text-right">% A tiempo</th>
                          <th className="py-2.5 px-4 text-right">Costo promedio</th>
                          <th className="py-2.5 px-4 text-right">Gasto acumulado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {dashboard.resumenPyme.proveedores.map((prov) => (
                          <tr key={prov.proveedor} className="hover:bg-slate-50">
                            <td className="py-3 px-4 font-medium text-slate-900">
                              {prov.proveedor}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                              {prov.pedidos_count}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                              {prov.entregados_count}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-emerald-700">
                              {prov.a_tiempo_pct.toFixed(1)}%
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                              {formatColones(prov.costo_promedio_pedido)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                              {formatColones(prov.costo_total_colones)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </motion.section>
            )}
          </AnimatePresence>

          {/* 2. Gráfico de Tendencia Diaria + Panel Analista IA */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Evolución diaria de costos y volumen despachado
                  </h2>
                  <p className="text-xs text-slate-500">
                    Línea azul: costo operativo en colones (₡) · Barras: volumen en{' '}
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
            <section className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        Analista IA Innova Track
                      </h2>
                      <p className="text-xs text-slate-500">
                        Diagnóstico semanal de anomalías e impacto en ₡
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isAnalyzing}
                    onClick={() => void handleAnalyzeWeek()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-blue-700 text-white text-xs font-medium hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap transition-all duration-150 active:scale-[0.98]"
                  >
                    {isAnalyzing && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    )}
                    <span>{isAnalyzing ? 'Analizando...' : 'Analizar operación'}</span>
                  </button>
                </div>

                {alerts.length === 0 ? (
                  <div className="p-5 border border-slate-200 rounded-md bg-slate-50 text-sm text-slate-600 space-y-2">
                    <p className="font-medium text-slate-900">
                      Diagnóstico ejecutivo bajo demanda
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Presiona <strong>Analizar operación</strong> para consolidar las vistas de
                      desvíos de odómetro, esperas en andén y rechazos, identificando las 3
                      prioridades de la semana con su impacto exacto en colones.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {alerts.map((alerta) => (
                      <div key={alerta.id} className="py-3.5 first:pt-1 last:pb-0 space-y-1.5">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900 leading-snug">
                            {alerta.titulo}
                          </p>
                          <span
                            className={`font-mono text-xs font-semibold tabular-nums shrink-0 ${
                              alerta.severidad === 'critica'
                                ? 'text-red-700'
                                : alerta.severidad === 'alta'
                                  ? 'text-amber-700'
                                  : 'text-slate-700'
                            }`}
                          >
                            {alerta.impacto_formateado}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed">
                          {alerta.que_paso}{' '}
                          <span className="font-medium text-slate-900">
                            Acción: {alerta.accion_recomendada}
                          </span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {alertsMotor && (
                <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
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
            className="bg-white border border-slate-200 rounded-lg overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Auditoría operativa en tiempo real
                </h2>
                <p className="text-xs text-slate-500">
                  Incidencias detectadas en desvíos mayores al 10%, esperas en cliente y
                  devoluciones
                </p>
              </div>

              <div
                role="tablist"
                aria-label="Categorías de auditoría"
                className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-md overflow-x-auto"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={auditTab === 'desvios'}
                  onClick={() => setAuditTab('desvios')}
                  className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap transition-all ${
                    auditTab === 'desvios'
                      ? 'bg-white text-slate-900 border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  Desvíos &gt;10% ({dashboard.auditorias.desviosKilometraje.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={auditTab === 'esperas'}
                  onClick={() => setAuditTab('esperas')}
                  className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap transition-all ${
                    auditTab === 'esperas'
                      ? 'bg-white text-slate-900 border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  Esperas críticas ({dashboard.auditorias.esperasCriticas.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={auditTab === 'devoluciones'}
                  onClick={() => setAuditTab('devoluciones')}
                  className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap transition-all ${
                    auditTab === 'devoluciones'
                      ? 'bg-white text-slate-900 border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  Devoluciones ({dashboard.auditorias.devoluciones.length})
                </button>
              </div>
            </div>

            {auditTab === 'desvios' && (
              <div className="overflow-x-auto">
                {dashboard.auditorias.desviosKilometraje.length === 0 ? (
                  <p className="p-6 text-sm text-slate-500">
                    No se registran desvíos superiores al 10% sobre el kilometraje teórico.
                  </p>
                ) : (
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                        <th className="py-2.5 px-4">Fecha</th>
                        <th className="py-2.5 px-4">Ruta</th>
                        <th className="py-2.5 px-4">Chofer y placa</th>
                        <th className="py-2.5 px-4 text-right">Plan vs. Real</th>
                        <th className="py-2.5 px-4 text-right">Desvío</th>
                        <th className="py-2.5 px-4 text-right">Sobrecosto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {dashboard.auditorias.desviosKilometraje.map((d) => (
                        <tr key={d.viaje_id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                            {d.fecha}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900">{d.ruta_nombre}</td>
                          <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                            {d.chofer_nombre} · <span className="font-mono">{d.placa}</span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                            {d.km_planificados} km / {d.km_reales} km
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-red-700 whitespace-nowrap">
                            +{d.desviacion_km.toFixed(1)} km (+{d.desviacion_pct.toFixed(0)}%)
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                            {formatColones(d.sobrecosto_colones)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {auditTab === 'esperas' && (
              <div className="overflow-x-auto">
                {dashboard.auditorias.esperasCriticas.length === 0 ? (
                  <p className="p-6 text-sm text-slate-500">
                    Todos los clientes registran tiempos de espera dentro de lo esperado.
                  </p>
                ) : (
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                        <th className="py-2.5 px-4">Cliente</th>
                        <th className="py-2.5 px-4">Zona</th>
                        <th className="py-2.5 px-4 text-right">Visitas</th>
                        <th className="py-2.5 px-4 text-right">Espera promedio</th>
                        <th className="py-2.5 px-4 text-right">Espera máxima</th>
                        <th className="py-2.5 px-4 text-right">En ventana</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {dashboard.auditorias.esperasCriticas.map((w) => (
                        <tr key={w.cliente_id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-medium text-slate-900">
                            {w.cliente_nombre}
                          </td>
                          <td className="py-3 px-4 text-slate-600">{w.zona}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                            {w.visitas}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-amber-700">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                              {w.espera_promedio_min.toFixed(0)} min
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-red-700">
                            {w.espera_max_min.toFixed(0)} min
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                            {w.cumple_ventana_pct.toFixed(0)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {auditTab === 'devoluciones' && (
              <div className="overflow-x-auto">
                {dashboard.auditorias.devoluciones.length === 0 ? (
                  <p className="p-6 text-sm text-slate-500">
                    No se registran devoluciones o rechazos de mercadería en el período.
                  </p>
                ) : (
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                        <th className="py-2.5 px-4">Fecha</th>
                        <th className="py-2.5 px-4">Código</th>
                        <th className="py-2.5 px-4">Cliente</th>
                        <th className="py-2.5 px-4">Motivo</th>
                        <th className="py-2.5 px-4 text-right">Cantidad</th>
                        <th className="py-2.5 px-4 text-right">Impacto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {dashboard.auditorias.devoluciones.map((r) => (
                        <tr key={r.entrega_id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                            {r.fecha}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs font-medium text-blue-700 whitespace-nowrap">
                            <Link href={`/tracking/${r.codigo_tracking}`} className="hover:underline">
                              {r.codigo_tracking}
                            </Link>
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900">
                            {r.cliente_nombre}
                          </td>
                          <td className="py-3 px-4 text-red-700 font-medium">
                            <span className="inline-flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              {r.motivo_rechazo}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {r.cantidad_rechazada} {r.unidad_medida}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                            {formatColones(r.impacto_colones)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
