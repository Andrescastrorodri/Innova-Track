'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Clock, FileCheck2, MapPin, PackageCheck, Truck } from 'lucide-react';
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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
              Innova Track
            </span>
            <span className="text-slate-300" aria-hidden="true">
              /
            </span>
            <span className="text-sm text-slate-600 truncate">{empresa.nombre}</span>
          </div>

          <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums shrink-0">
            {pedido.codigo_tracking}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Resumen de estado */}
        <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-500">Destinatario</p>
              <h1 className="text-xl font-semibold text-slate-900 mt-0.5">{cliente.nombre}</h1>
              <p className="text-xs text-slate-500 mt-1">
                Zona {cliente.zona} · Ventana {cliente.ventana_inicio.slice(0, 5)}–
                {cliente.ventana_fin.slice(0, 5)}
              </p>
            </div>

            <div className="text-left sm:text-right">
              <p className="text-xs text-slate-500">Estado actual</p>
              <p
                className={`text-sm font-semibold mt-0.5 ${
                  pedido.estado_entrega === 'entregado'
                    ? 'text-emerald-700'
                    : pedido.estado_entrega === 'rechazado'
                      ? 'text-red-700'
                      : 'text-blue-700'
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

          {/* Línea de tiempo 4 etapas */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
            {stages.map((st, idx) => (
              <div
                key={st.label}
                className={`p-3.5 rounded-md border text-xs space-y-1.5 ${
                  st.completed
                    ? 'bg-slate-50 border-slate-300 text-slate-900'
                    : 'bg-white border-slate-200 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px]">0{idx + 1}</span>
                  {st.completed ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-slate-300 shrink-0" aria-hidden="true" />
                  )}
                </div>
                <p className="font-medium text-sm">{st.label}</p>
                <p className="text-[11px] text-slate-500 truncate">{st.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Logística y Factura */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-slate-700 shrink-0" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900">Modalidad de despacho</h2>
            </div>

            {pedido.modalidad_envio === 'proveedor_externo' ? (
              <div className="space-y-1.5 text-sm">
                <p className="text-slate-900 font-medium">
                  {pedido.proveedor_externo_nombre || 'Proveedor de mensajería externo'}
                </p>
                {pedido.tracking_externo_url && (
                  <p className="text-xs font-mono text-blue-700 break-all">
                    {pedido.tracking_externo_url}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                <p className="text-slate-900 font-medium">
                  {viaje?.ruta_nombre || `Flotilla propia · Zona ${cliente.zona}`}
                </p>
                <p className="text-xs text-slate-600">
                  {vehiculo ? `${vehiculo.placa} · ${vehiculo.modelo}` : 'Unidad asignada'}
                  {viaje ? ` · Chofer: ${viaje.chofer_nombre}` : ''}
                </p>
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-slate-700 shrink-0" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900">Comprobante fiscal</h2>
            </div>

            {pedido.estado_factura === 'facturado' ? (
              <div className="space-y-1 text-sm">
                <p className="font-mono font-medium text-slate-900">
                  {pedido.numero_factura_externa}
                </p>
                <p className="text-xs text-slate-600">
                  Cédula receptor: <span className="font-mono">{cliente.cedula_juridica}</span> · Enviada a{' '}
                  {cliente.correo_facturacion}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                {pedido.estado_factura === 'no_requiere'
                  ? 'Pedido marcado sin requerimiento de factura electrónica.'
                  : 'Factura electrónica pendiente de emisión.'}
              </p>
            )}
          </section>
        </div>

        {/* Detalle de productos */}
        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Productos del pedido</h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {pedido.items_json.length} líneas
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">SKU</th>
                  <th className="py-2.5 px-4">Producto</th>
                  <th className="py-2.5 px-4 text-right">Cantidad</th>
                  <th className="py-2.5 px-4 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pedido.items_json.map((it, idx) => (
                  <tr key={`${it.sku}-${idx}`}>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-600">{it.sku}</td>
                    <td className="py-2.5 px-4 text-slate-900 font-medium">{it.nombre}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {it.cantidad} {it.unidad}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                      {formatColones(it.cantidad * it.precio)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap justify-end gap-6 text-sm font-mono tabular-nums">
            <span className="text-slate-600">Subtotal: {formatColones(pedido.subtotal)}</span>
            <span className="text-slate-600">IVA 13%: {formatColones(pedido.iva)}</span>
            <span className="font-semibold text-slate-900">Total: {formatColones(pedido.total)}</span>
          </div>
        </section>

        {/* Comprobante de entrega con foto */}
        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-slate-700 shrink-0" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900">Evidencia de entrega</h2>
            </div>
            {entrega?.gps_llegada && (
              <span className="inline-flex items-center gap-1 text-xs font-mono tabular-nums text-slate-500">
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                {entrega.gps_llegada.lat.toFixed(4)}, {entrega.gps_llegada.lng.toFixed(4)}
              </span>
            )}
          </div>

          {isCompleted && entrega ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="space-y-2 text-sm">
                <p className="text-slate-900 font-medium">
                  Cantidad entregada:{' '}
                  <span className="font-mono tabular-nums">
                    {entrega.cantidad_entregada} {entrega.unidad_medida}
                  </span>
                </p>
                {entrega.cantidad_rechazada > 0 && (
                  <p className="text-red-700 text-xs">
                    Rechazado: {entrega.cantidad_rechazada} {entrega.unidad_medida} ·{' '}
                    {entrega.motivo_rechazo}
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  Llegada: <span className="font-mono">{formatCrDateTime(entrega.hora_llegada)}</span>
                </p>
                <p className="text-xs text-slate-500">
                  Salida: <span className="font-mono">{formatCrDateTime(entrega.hora_salida)}</span>
                </p>
              </div>

              <div className="border border-slate-200 rounded-md overflow-hidden bg-slate-50">
                {hasValidPhoto ? (
                  <img
                    src={entrega.foto_comprobante!}
                    alt={`Comprobante de entrega ${pedido.codigo_tracking}`}
                    referrerPolicy="no-referrer"
                    onError={() => setImgFailed(true)}
                    className="w-full h-44 object-contain bg-white p-2"
                  />
                ) : (
                  <div className="h-40 flex flex-col items-center justify-center p-4 text-center space-y-1.5 bg-gradient-to-br from-slate-50 to-slate-100">
                    <PackageCheck className="w-6 h-6 text-emerald-700" aria-hidden="true" />
                    <p className="text-xs font-medium text-slate-800">
                      Comprobante digital verificado · {pedido.codigo_tracking}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500">
                      Recepción firmada en {cliente.zona}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              La fotografía del comprobante y sello de recibido aparecerán aquí automáticamente al completarse la entrega.
            </p>
          )}
        </section>

        <div className="flex justify-center pt-2">
          <Link
            href="/pedidos/nuevo"
            className="text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            Volver al panel operativo de Innova Track
          </Link>
        </div>
      </main>
    </div>
  );
}
