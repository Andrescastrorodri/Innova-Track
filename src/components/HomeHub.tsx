'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BarChart3,
  FileText,
  Route,
  Search,
  Settings,
  Truck,
} from 'lucide-react';
import { formatColones, formatInt } from '@/lib/seed-data';
import type { ExecutiveDashboardData } from '@/lib/analytics';
import type { EmpresaConfig, Pedido } from '@/lib/types';

interface HomeHubProps {
  empresas: EmpresaConfig[];
  pedidosRecientes: Pedido[];
  dashboardsByEmpresa: Record<string, ExecutiveDashboardData>;
}

export function HomeHub({
  empresas,
  pedidosRecientes,
  dashboardsByEmpresa,
}: HomeHubProps) {
  const router = useRouter();
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string>(empresas[0]?.id ?? '');
  const [trackingQuery, setTrackingQuery] = useState('IT-8901');

  const activeEmpresa = useMemo(
    () => empresas.find((e) => e.id === selectedEmpresaId) ?? empresas[0],
    [empresas, selectedEmpresaId]
  );

  const activeDashboard = dashboardsByEmpresa[activeEmpresa?.id ?? ''];
  const isFlotilla = activeEmpresa?.tipo_operacion === 'distribuidora_flotilla';

  function handleOpenTracking(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = trackingQuery.trim().toUpperCase() || 'IT-8901';
    router.push(`/tracking/${encodeURIComponent(cleaned)}`);
  }

  const modulos = [
    {
      num: '01',
      title: 'Copiloto de Pedidos IA',
      href: '/pedidos/nuevo',
      icon: FileText,
      cta: 'Ingresar pedido',
      description:
        'Convierte mensajes de WhatsApp, fotos, PDF o notas de voz en pedidos con reserva ERP, factura Hacienda CR y despacho.',
      metric: `${pedidosRecientes.length} pedidos recientes`,
    },
    {
      num: '02',
      title: 'App Chofer (Móvil)',
      href: '/chofer',
      icon: Truck,
      cta: 'Abrir ruta móvil',
      description:
        'Control en campo de odómetro inicial/final, llegada GPS, firma o foto comprobante, rechazos y gastos en ruta.',
      metric: `${activeDashboard?.resumenFlotilla.total_viajes ?? 0} viajes registrados`,
    },
    {
      num: '03',
      title: 'Tablero Gerencial',
      href: '/gerente',
      icon: BarChart3,
      cta: 'Ver analítica',
      description:
        'KPIs dinámicos por modo operativo, semáforo de costo por unidad, tendencia Recharts, Analista IA y auditoría en vivo.',
      metric: isFlotilla
        ? `${formatColones(activeDashboard?.resumenFlotilla.costo_promedio_por_unidad ?? 0)} / unidad`
        : `${formatColones(activeDashboard?.resumenPyme.costo_promedio_envio ?? 0)} / envío`,
    },
    {
      num: '04',
      title: 'Tracking Público',
      href: `/tracking/${pedidosRecientes[0]?.codigo_tracking ?? 'IT-8901'}`,
      icon: Route,
      cta: 'Consultar guía',
      description:
        'Portal limpio para clientes finales con línea de tiempo en 4 etapas, comprobante fiscal y fotografía de entrega.',
      metric: pedidosRecientes[0]?.codigo_tracking ?? 'IT-8901',
    },
    {
      num: '05',
      title: 'Configuración de APIs',
      href: '/configuracion',
      icon: Settings,
      cta: 'Ajustar conectores',
      description:
        'Alterna entre Distribuidora con flotilla propia o PyME tercerizada y prueba endpoints de ERP, Hacienda y courier.',
      metric: '3 integraciones activas',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Encabezado limpio */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
              Innova Track
            </span>
            <span className="text-slate-300" aria-hidden="true">
              /
            </span>
            <span className="text-sm text-slate-600 truncate">
              Plataforma Logística y Facturación · Costa Rica
            </span>
          </div>

          <div
            role="group"
            aria-label="Cambiar empresa activa"
            className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-md"
          >
            {empresas.map((emp) => {
              const selected = emp.id === activeEmpresa?.id;
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => setSelectedEmpresaId(emp.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap transition-all duration-150 active:scale-[0.98] ${
                    selected
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
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-6 lg:p-10 space-y-8">
        {/* Hero operativo compacto */}
        <section className="bg-white border border-slate-200 rounded-lg p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              {isFlotilla
                ? 'Operación Distribuidora · Flotilla Propia'
                : 'Operación PyME · Envíos Tercerizados'}
            </p>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
              {activeEmpresa?.nombre}
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Centraliza la ingesta multimodal de pedidos, facturación electrónica de Costa Rica,
              despacho en campo o por mensajería externa y auditoría gerencial en colones.
            </p>
          </div>

          {/* Buscador rápido de código de tracking */}
          <form
            onSubmit={handleOpenTracking}
            className="w-full lg:w-80 shrink-0 space-y-2 bg-slate-50 border border-slate-200 rounded-md p-4"
          >
            <label
              htmlFor="hub-tracking-search"
              className="text-xs font-semibold text-slate-700 block"
            >
              Consulta directa de tracking
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="hub-tracking-search"
                  type="text"
                  value={trackingQuery}
                  onChange={(e) => setTrackingQuery(e.target.value)}
                  placeholder="Ej. IT-8901"
                  className="w-full pl-9 pr-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>
              <button
                type="submit"
                className="px-3.5 py-2 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 whitespace-nowrap transition-all active:scale-[0.98]"
              >
                Abrir
              </button>
            </div>
          </form>
        </section>

        {/* Pulso ejecutivo rápido (lectura en <10s) */}
        {activeDashboard && (
          <section
            aria-label="Resumen operativo actual"
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <p className="text-xs font-medium text-slate-500">
                {isFlotilla ? 'Costo operativo flotilla' : 'Gasto en mensajería externa'}
              </p>
              <p className="mt-2 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-900">
                {formatColones(
                  isFlotilla
                    ? activeDashboard.resumenFlotilla.costo_total_colones
                    : activeDashboard.resumenPyme.costo_total_envios
                )}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <p className="text-xs font-medium text-slate-500">
                {isFlotilla ? 'Costo por unidad entregada' : 'Costo promedio por pedido'}
              </p>
              <p className="mt-2 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-900">
                {formatColones(
                  isFlotilla
                    ? activeDashboard.resumenFlotilla.costo_promedio_por_unidad
                    : activeDashboard.resumenPyme.costo_promedio_envio
                )}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <p className="text-xs font-medium text-slate-500">Entregas a tiempo</p>
              <p className="mt-2 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-emerald-700">
                {(isFlotilla
                  ? activeDashboard.resumenFlotilla.entregas_a_tiempo_pct
                  : activeDashboard.resumenPyme.entregas_a_tiempo_pct
                ).toFixed(1)}
                %
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <p className="text-xs font-medium text-slate-500">
                {isFlotilla ? 'Volumen entregado' : 'Facturación automática CR'}
              </p>
              <p className="mt-2 text-xl sm:text-2xl font-semibold font-mono tabular-nums text-slate-900">
                {isFlotilla
                  ? `${formatInt(activeDashboard.resumenFlotilla.total_unidades_entregadas)} ${activeDashboard.resumenFlotilla.unidad_default}`
                  : `${activeDashboard.resumenPyme.tasa_facturacion_pct.toFixed(1)}%`}
              </p>
            </div>
          </section>
        )}

        {/* Accesos directos a los 5 módulos */}
        <section aria-label="Módulos de la plataforma" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Módulos operativos</h2>
            <span className="text-xs text-slate-500">Acceso directo</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {modulos.map((mod) => {
              const Icon = mod.icon;
              return (
                <Link
                  key={mod.num}
                  href={mod.href}
                  className="group bg-white border border-slate-200 hover:border-slate-400 rounded-lg p-5 flex flex-col justify-between gap-5 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs font-semibold text-slate-400">
                        {mod.num}
                      </span>
                      <Icon
                        className="w-4 h-4 text-slate-700 group-hover:text-blue-700 transition-colors"
                        aria-hidden="true"
                      />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                        {mod.title}
                      </h3>
                      <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                        {mod.description}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono tabular-nums text-slate-500">{mod.metric}</span>
                    <span className="inline-flex items-center gap-1 font-medium text-blue-700">
                      <span>{mod.cta}</span>
                      <ArrowRight
                        className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform"
                        aria-hidden="true"
                      />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Últimos pedidos con acceso directo a Tracking Público */}
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Últimos pedidos registrados
            </h2>
            <Link
              href="/pedidos/nuevo"
              className="text-xs font-medium text-blue-700 hover:underline"
            >
              Crear nuevo pedido
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Código</th>
                  <th className="py-2.5 px-4">Modalidad</th>
                  <th className="py-2.5 px-4">Factura CR</th>
                  <th className="py-2.5 px-4">Estado</th>
                  <th className="py-2.5 px-4 text-right">Total</th>
                  <th className="py-2.5 px-4 text-right">Tracking</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pedidosRecientes.map((ped) => (
                  <tr key={ped.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-900">
                      {ped.codigo_tracking}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600">
                      {ped.modalidad_envio === 'flotilla_propia'
                        ? 'Flotilla propia'
                        : ped.proveedor_externo_nombre || 'Courier externo'}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-600">
                      {ped.numero_factura_externa || 'Pendiente'}
                    </td>
                    <td className="py-2.5 px-4 text-xs font-medium text-slate-700">
                      {ped.estado_entrega === 'entregado'
                        ? 'Entregado'
                        : ped.estado_entrega === 'en_ruta'
                          ? 'En ruta'
                          : ped.estado_entrega === 'rechazado'
                            ? 'Rechazado'
                            : 'Pendiente de ruta'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                      {formatColones(ped.total)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <Link
                        href={`/tracking/${ped.codigo_tracking}`}
                        className="text-xs font-medium text-blue-700 hover:underline"
                      >
                        Ver detalle
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
