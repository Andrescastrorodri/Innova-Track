'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Check, Clock, FileCheck2, MapPin, PackageCheck, Truck } from 'lucide-react';
import { BrandWordmark } from '@/components/BrandWordmark';
import { TableScroll } from '@/components/TableScroll';
import { formatColones } from '@/lib/seed-data';
import type { Cliente, EmpresaConfig, Entrega, Pedido, Vehiculo, Viaje } from '@/lib/types';

interface PublicTrackingViewProps {
  pedido: Pedido;
  empresa: EmpresaConfig;
  cliente: Cliente;
  entrega: Entrega | null;
  viaje: Viaje | null;
  vehiculo: Vehiculo | null;
}

function formatCrDateTime(iso: string | null): string {
  if (!iso) return 'Pendiente';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-CR', {
    timeZone: 'America/Costa_Rica',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PublicTrackingView({
  pedido,
  empresa,
  cliente,
  entrega,
  viaje,
  vehiculo,
}: PublicTrackingViewProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const stages = [
    {
      label: 'Pedido recibido',
      completed: true,
      detail: formatCrDateTime(pedido.created_at),
    },
    {
      label: pedido.estado_factura === 'facturado' ? 'Confirmado y facturado' : 'Confirmado en despacho',
      completed: true,
      detail: pedido.numero_factura_externa || 'Orden validada en inventario',
    },
    {
      label: 'En ruta',
      completed: pedido.estado_entrega === 'en_ruta' || pedido.estado_entrega === 'entregado',
      detail:
        pedido.modalidad_envio === 'proveedor_externo'
          ? pedido.proveedor_externo_nombre || 'Courier externo'
          : viaje?.ruta_nombre || 'Flotilla asignada',
    },
    {
      label: pedido.estado_entrega === 'rechazado' ? 'Entrega rechazada' : 'Entregado',
      completed: pedido.estado_entrega === 'entregado' || pedido.estado_entrega === 'rechazado',
      detail: entrega?.hora_salida
        ? formatCrDateTime(entrega.hora_salida)
        : 'Pendiente de firma en destino',
    },
  ];

  const hasValidPhoto =
    Boolean(entrega?.foto_comprobante) &&
    !entrega?.foto_comprobante?.includes('storage.supabase.co/object/public/evidencias/') &&
    !imgFailed;

  const isCompleted =
    pedido.estado_entrega === 'entregado' ||
    pedido.estado_entrega === 'rechazado' ||
    entrega?.estado === 'entregado' ||
    entrega?.estado === 'rechazo_parcial' ||
    entrega?.estado === 'rechazado';

  return (
    <div className="min-h-dvh text-ink">
      <header className="solo-navbar glass-surface flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <BrandWordmark />
        <span className="pl-1 text-sm font-medium text-secondary">{empresa.nombre}</span>
      </header>

      <main id="contenido" tabIndex={-1} className="site-content max-w-5xl space-y-5">
        {/* Resumen de estado */}
        <section className="glass-surface rounded-2xl p-4 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="page-title">Pedido {pedido.codigo_tracking}</h1>
              <p className="mt-2 text-base font-semibold text-ink">{cliente.nombre}</p>
              <p className="text-xs text-muted mt-1">
                Zona {cliente.zona} · Ventana {cliente.ventana_inicio.slice(0, 5)}–
                {cliente.ventana_fin.slice(0, 5)}
              </p>
            </div>

            <div className="text-left sm:text-right">
              <p className="text-xs text-muted">Estado actual</p>
              <p
                className={`mt-1 inline-flex rounded-md px-2.5 py-1.5 text-sm font-bold ${
                  pedido.estado_entrega === 'entregado'
                    ? 'bg-success-soft text-success'
                    : pedido.estado_entrega === 'rechazado'
                      ? 'bg-danger-soft text-danger'
                      : 'bg-accent-soft text-accent-hover'
                }`}
              >
                {pedido.estado_entrega === 'entregado'
                  ? 'Entregado'
                  : pedido.estado_entrega === 'en_ruta'
                    ? 'En ruta hacia destino'
                    : pedido.estado_entrega === 'rechazado'
                      ? 'Entrega rechazada'
                      : 'Pendiente de despacho'}
              </p>
            </div>
          </div>

          <ol aria-label="Historial de seguimiento" className="grid gap-3 border-t border-line pt-5 sm:grid-cols-2 lg:grid-cols-4">
            {stages.map((stage, index) => {
              const rejected = index === stages.length - 1 && pedido.estado_entrega === 'rechazado';
              const Marker = rejected ? AlertCircle : stage.completed ? Check : Clock;
              return (
                <li key={stage.label} className="flex min-w-0 items-start gap-3 rounded-lg bg-subtle p-3.5">
                  <Marker
                    size={17}
                    className={`mt-0.5 shrink-0 ${rejected ? 'text-danger' : stage.completed ? 'text-success' : 'text-muted'}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink">{stage.label}</p>
                    <p className="mt-0.5 text-sm text-muted [overflow-wrap:anywhere]">{stage.detail}</p>
                    {!stage.completed && <span className="sr-only">Etapa pendiente</span>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Logística y Factura */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="bg-surface border border-line rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-secondary shrink-0" aria-hidden="true" />
              <h2 className="section-title">Modalidad de despacho</h2>
            </div>

            {pedido.modalidad_envio === 'proveedor_externo' ? (
              <div className="space-y-1.5 text-sm">
                <p className="text-ink font-medium">
                  {pedido.proveedor_externo_nombre || 'Proveedor de mensajería externo'}
                </p>
                {pedido.tracking_externo_url && (
                  <p className="text-xs font-mono text-accent break-all">
                    {pedido.tracking_externo_url}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                <p className="text-ink font-medium">
                  {viaje?.ruta_nombre || `Flotilla propia · Zona ${cliente.zona}`}
                </p>
                <p className="text-xs text-secondary">
                  {vehiculo ? `${vehiculo.placa} · ${vehiculo.modelo}` : 'Unidad asignada'}
                  {viaje ? ` · Chofer: ${viaje.chofer_nombre}` : ''}
                </p>
              </div>
            )}
          </section>

          <section className="bg-surface border border-line rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-secondary shrink-0" aria-hidden="true" />
              <h2 className="section-title">Comprobante fiscal</h2>
            </div>

            {pedido.estado_factura === 'facturado' ? (
              <div className="space-y-1 text-sm">
                <p className="font-mono font-medium text-ink [overflow-wrap:anywhere]">
                  {pedido.numero_factura_externa}
                </p>
                <p className="text-xs text-secondary">
                  Cédula receptor: <span className="font-mono">{cliente.cedula_juridica}</span> · Enviada a{' '}
                  {cliente.correo_facturacion}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">
                {pedido.estado_factura === 'no_requiere'
                  ? 'Pedido marcado sin requerimiento de factura electrónica.'
                  : 'Factura electrónica pendiente de emisión.'}
              </p>
            )}
          </section>
        </div>

        {/* Detalle de productos */}
        <section className="bg-surface border border-line rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-line flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">Productos del pedido</h2>
            <span className="text-xs font-mono tabular-nums text-muted">
              {pedido.items_json.length} líneas
            </span>
          </div>

          <TableScroll label="Productos del pedido">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas text-xs font-medium text-muted">
                  <th scope="col" className="py-2.5 px-4">SKU</th>
                  <th scope="col" className="py-2.5 px-4">Producto</th>
                  <th scope="col" className="py-2.5 px-4 text-right">Cantidad</th>
                  <th scope="col" className="py-2.5 px-4 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pedido.items_json.map((it, idx) => (
                  <tr key={`${it.sku}-${idx}`}>
                    <td className="py-2.5 px-4 font-mono text-xs text-secondary">{it.sku}</td>
                    <td className="py-2.5 px-4 text-ink font-medium">{it.nombre}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-secondary">
                      {it.cantidad} {it.unidad}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-ink">
                      {formatColones(it.cantidad * it.precio)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>

          <div className="px-5 py-4 bg-canvas border-t border-line flex flex-wrap justify-end gap-6 text-sm font-mono tabular-nums">
            <span className="text-secondary">Subtotal: {formatColones(pedido.subtotal)}</span>
            <span className="text-secondary">IVA 13%: {formatColones(pedido.iva)}</span>
            <span className="font-semibold text-ink">Total: {formatColones(pedido.total)}</span>
          </div>
        </section>

        {/* Comprobante de entrega con foto */}
        <section className="bg-surface border border-line rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-secondary shrink-0" aria-hidden="true" />
              <h2 className="section-title">Evidencia de entrega</h2>
            </div>
            {entrega?.gps_llegada && (
              <span className="inline-flex items-center gap-1 text-xs font-mono tabular-nums text-muted">
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                {entrega.gps_llegada.lat.toFixed(4)}, {entrega.gps_llegada.lng.toFixed(4)}
              </span>
            )}
          </div>

          {isCompleted && entrega ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="space-y-2 text-sm">
                <p className="text-ink font-medium">
                  Cantidad entregada:{' '}
                  <span className="font-mono tabular-nums">
                    {entrega.cantidad_entregada} {entrega.unidad_medida}
                  </span>
                </p>
                {entrega.cantidad_rechazada > 0 && (
                  <p className="text-danger text-xs">
                    Rechazado: {entrega.cantidad_rechazada} {entrega.unidad_medida} ·{' '}
                    {entrega.motivo_rechazo}
                  </p>
                )}
                <p className="text-xs text-muted">
                  Llegada: <span className="font-mono">{formatCrDateTime(entrega.hora_llegada)}</span>
                </p>
                <p className="text-xs text-muted">
                  Salida: <span className="font-mono">{formatCrDateTime(entrega.hora_salida)}</span>
                </p>
              </div>

              <div className="border border-line rounded-md overflow-hidden bg-canvas">
                {hasValidPhoto ? (
                  <img
                    src={entrega.foto_comprobante!}
                    alt={`Comprobante de entrega ${pedido.codigo_tracking}`}
                    referrerPolicy="no-referrer"
                    onError={() => setImgFailed(true)}
                    className="w-full h-44 object-contain bg-surface p-2"
                  />
                ) : (
                  <div className="h-40 flex flex-col items-center justify-center p-4 text-center space-y-1.5 bg-subtle">
                    <PackageCheck className="w-6 h-6 text-success" aria-hidden="true" />
                    <p className="text-xs font-medium text-ink">
                      Comprobante digital verificado · {pedido.codigo_tracking}
                    </p>
                    <p className="text-sm text-muted">
                      Recepción firmada en {cliente.zona}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">
              La fotografía del comprobante y sello de recibido aparecerán aquí automáticamente al completarse la entrega.
            </p>
          )}
        </section>

        <div className="flex justify-center pt-2">
          <Link
            href="/pedidos/nuevo"
            className="ui-button ui-button-secondary"
          >
            Volver al panel operativo de Innova Track
          </Link>
        </div>
      </main>
    </div>
  );
}
