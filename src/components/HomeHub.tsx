'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  FileText,
  Route,
  Settings,
  Truck,
} from 'lucide-react';
import { CompanySwitcher } from '@/components/CompanySwitcher';
import { TableScroll } from '@/components/TableScroll';
import { WorkspaceShell } from '@/components/WorkspaceShell';
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
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string>(empresas[0]?.id ?? '');

  const activeEmpresa = useMemo(
    () => empresas.find((e) => e.id === selectedEmpresaId) ?? empresas[0],
    [empresas, selectedEmpresaId]
  );

  const activeDashboard = dashboardsByEmpresa[activeEmpresa?.id ?? ''];
  const isFlotilla = activeEmpresa?.tipo_operacion === 'distribuidora_flotilla';

  const modulos = [
    {
      title: 'Copiloto de pedidos',
      href: '/pedidos/nuevo',
      icon: FileText,
      description: 'Registra pedidos a partir de texto, imágenes, PDF o audio.',
      metric: `${pedidosRecientes.length} pedidos recientes`,
    },
    {
      title: 'App chofer',
      href: '/chofer',
      icon: Truck,
      description: 'Registra odómetro, entregas, evidencias y gastos en ruta.',
      metric: `${activeDashboard?.resumenFlotilla.total_viajes ?? 0} viajes registrados`,
    },
    {
      title: 'Tablero gerencial',
      href: '/gerente',
      icon: BarChart3,
      description: 'Consulta costos, cumplimiento de entregas e incidencias.',
      metric: isFlotilla
        ? `${formatColones(activeDashboard?.resumenFlotilla.costo_promedio_por_unidad ?? 0)} / unidad`
        : `${formatColones(activeDashboard?.resumenPyme.costo_promedio_envio ?? 0)} / envío`,
    },
    {
      title: 'Seguimiento público',
      href: `/tracking/${pedidosRecientes[0]?.codigo_tracking ?? 'IT-8901'}`,
      icon: Route,
      description: 'Consulta el estado, la factura y el comprobante de entrega.',
      metric: pedidosRecientes[0]?.codigo_tracking ?? 'IT-8901',
    },
    {
      title: 'Configuración de APIs',
      href: '/configuracion',
      icon: Settings,
      description: 'Ajusta el modo logístico y las conexiones.',

    },
  ];

  const metrics = activeDashboard && [
    {
      label: isFlotilla ? 'Costo operativo de flotilla' : 'Gasto en mensajería',
      value: formatColones(isFlotilla
        ? activeDashboard.resumenFlotilla.costo_total_colones
        : activeDashboard.resumenPyme.costo_total_envios),
    },
    {
      label: isFlotilla ? 'Costo por unidad' : 'Costo por pedido',
      value: formatColones(isFlotilla
        ? activeDashboard.resumenFlotilla.costo_promedio_por_unidad
        : activeDashboard.resumenPyme.costo_promedio_envio),
    },
    {
      label: 'Entregas a tiempo',
      value: `${(isFlotilla
        ? activeDashboard.resumenFlotilla.entregas_a_tiempo_pct
        : activeDashboard.resumenPyme.entregas_a_tiempo_pct).toFixed(1)}%`,
    },
    {
      label: isFlotilla ? 'Volumen entregado' : 'Facturación automática',
      value: isFlotilla
        ? `${formatInt(activeDashboard.resumenFlotilla.total_unidades_entregadas)} ${activeDashboard.resumenFlotilla.unidad_default}`
        : `${activeDashboard.resumenPyme.tasa_facturacion_pct.toFixed(1)}%`,
    },
  ];

  return (
    <WorkspaceShell
      current="/"
      companyName={activeEmpresa?.nombre}
      context={
        <CompanySwitcher
          companies={empresas}
          current={activeEmpresa?.id}
          onChange={(company) => setSelectedEmpresaId(company.id)}
        />
      }
    >
      <main id="contenido" tabIndex={-1} className="workspace-content space-y-(--space-stack)">
        <section className="glass-surface home-overview rounded-3xl px-5 py-6 sm:p-8">
          <div className="min-w-0 space-y-2">
            <h1 className="page-title">{activeEmpresa?.nombre || 'Panel operativo'}</h1>
            <p className="text-secondary">
              {activeEmpresa
                ? (isFlotilla ? 'Operación con flotilla propia' : 'Operación con mensajería externa')
                : 'Pedidos, facturación y entregas'}
            </p>
          </div>
          <Link href="/pedidos/nuevo" className="ui-button ui-button-primary">
            Crear pedido <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </section>

        {metrics && (
          <section aria-labelledby="operacion-title" className="space-y-3">
            <h2 id="operacion-title" className="section-title">Resumen operativo</h2>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
              {metrics.map(({ label, value }) => (
                <div key={label} className="min-w-0 bg-surface px-3.5 py-4 sm:px-5">
                  <dt className="text-sm font-medium text-secondary">{label}</dt>
                  <dd className="mt-1.5 text-lg sm:text-2xl font-bold tabular-nums tracking-tight text-ink [overflow-wrap:anywhere]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section aria-labelledby="modulos-title" className="space-y-3">
          <h2 id="modulos-title" className="section-title">Módulos operativos</h2>
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {modulos.map(({ href, title, description, metric, icon: Icon }) => (
              <li key={href} className="first:rounded-t-lg last:rounded-b-lg">
                <Link
                  href={href}
                  className="group flex min-h-16 items-center gap-3 rounded-[inherit] px-3.5 py-3.5 hover:bg-subtle sm:gap-4 sm:px-5"
                >
                  <Icon size={20} strokeWidth={1.75} className="shrink-0 text-accent" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-ink">{title}</h3>
                    <p className="mt-0.5 text-sm text-muted">{description}</p>
                    {metric && <p className="mt-1 text-xs font-semibold tabular-nums text-secondary lg:hidden">{metric}</p>}
                  </div>
                  {metric && <span className="hidden lg:block px-4 text-right text-sm tabular-nums text-secondary">{metric}</span>}
                  <ArrowRight size={17} className="shrink-0 text-accent motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-ui motion-safe:group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Últimos pedidos con acceso directo a Seguimiento público */}
        <section className="bg-surface border border-line rounded-lg overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
            <h2 className="section-title">Últimos pedidos</h2>
            <Link
              href="/pedidos/nuevo"
              className="ui-button ui-button-secondary"
            >
              Crear nuevo pedido
            </Link>
          </div>
          {pedidosRecientes.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Los pedidos registrados aparecerán aquí.</p>
          ) : (
            <TableScroll label="Últimos pedidos">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line bg-canvas text-xs font-medium text-muted">
                    <th scope="col" className="py-2.5 px-4">Código</th>
                    <th scope="col" className="py-2.5 px-4">Modalidad</th>
                    <th scope="col" className="py-2.5 px-4">Factura CR</th>
                    <th scope="col" className="py-2.5 px-4">Estado</th>
                    <th scope="col" className="py-2.5 px-4 text-right">Total</th>
                    <th scope="col" className="py-2.5 px-4 text-right">Tracking</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pedidosRecientes.map((ped) => (
                    <tr key={ped.id} className="hover:bg-subtle">
                      <td className="py-2.5 px-4 font-mono text-xs font-semibold text-ink">
                        {ped.codigo_tracking}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-secondary">
                        {ped.modalidad_envio === 'flotilla_propia'
                          ? 'Flotilla propia'
                          : ped.proveedor_externo_nombre || 'Courier externo'}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs text-secondary">
                        {ped.numero_factura_externa || 'Pendiente'}
                      </td>
                      <td className="py-2.5 px-4 text-xs font-medium text-secondary">
                        {ped.estado_entrega === 'entregado'
                          ? 'Entregado'
                          : ped.estado_entrega === 'en_ruta'
                            ? 'En ruta'
                            : ped.estado_entrega === 'rechazado'
                              ? 'Rechazado'
                              : 'Pendiente de ruta'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-ink">
                        {formatColones(ped.total)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <Link
                          href={`/tracking/${ped.codigo_tracking}`}
                          aria-label={`Ver detalle del pedido ${ped.codigo_tracking}`}
                          className="inline-flex min-h-9 items-center font-semibold text-accent hover:underline"
                        >
                          Ver detalle
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </section>
      </main>
    </WorkspaceShell>
  );
}
