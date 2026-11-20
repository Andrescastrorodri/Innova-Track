'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Fuel,
  Gauge,
  Loader2,
  MapPin,
  Navigation,
  Package,
  PenTool,
  Receipt,
  Route,
  Truck,
  XCircle,
} from 'lucide-react';
import { SignaturePad } from '@/components/SignaturePad';
import { formatColones, formatInt } from '@/lib/seed-data';
import type { DriverStopWithDetails } from '@/lib/data-store';
import type { DriverTripSummary } from '@/lib/driver-logic';
import type {
  Cliente,
  EmpresaConfig,
  Gasto,
  GpsPoint,
  Pedido,
  Tramo,
  Vehiculo,
  Viaje,
} from '@/lib/types';

interface DriverContextPayload {
  empresa: EmpresaConfig;
  vehiculos: Vehiculo[];
  tramos: Tramo[];
  choferes: string[];
  activeViaje: Viaje | null;
  activeStops: DriverStopWithDetails[];
  activeGastos: Gasto[];
  pendingByTramo: Record<string, Array<{ pedido: Pedido; cliente: Cliente }>>;
}

interface DriverAppProps {
  initialContext: DriverContextPayload;
}

const MOTIVOS_RECHAZO = [
  'Temperatura',
  'Daño en empaque',
  'Pedido equivocado',
  'Local cerrado',
] as const;

function captureGpsPoint(fallbackLat = 9.9512, fallbackLng = -84.0998): Promise<{
  point: GpsPoint;
  source: 'device' | 'fallback';
}> {
  return new Promise((resolve) => {
    const nowIso = new Date().toISOString();
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({
        point: { lat: fallbackLat, lng: fallbackLng, timestamp: nowIso },
        source: 'fallback',
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          point: {
            lat: Number(pos.coords.latitude.toFixed(5)),
            lng: Number(pos.coords.longitude.toFixed(5)),
            timestamp: new Date().toISOString(),
          },
          source: 'device',
        });
      },
      () => {
        resolve({
          point: { lat: fallbackLat, lng: fallbackLng, timestamp: new Date().toISOString() },
          source: 'fallback',
        });
      },
      { enableHighAccuracy: true, timeout: 2200, maximumAge: 30000 }
    );
  });
}

async function uploadFileEvidence(file: File, folder: string): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('folder', folder);
  const res = await fetch('/api/evidencias/upload', { method: 'POST', body: form });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'No se pudo subir la imagen a evidencias.');
  }
  return data.url;
}

async function uploadDataUrlEvidence(dataUrl: string, folder: string): Promise<string> {
  const res = await fetch('/api/evidencias/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, fileName: 'firma-receptor.png', folder }),
  });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'No se pudo guardar la firma digital.');
  }
  return data.url;
}

export function DriverApp({ initialContext }: DriverAppProps) {
  const [context, setContext] = useState<DriverContextPayload>(initialContext);
  const [activeTab, setActiveTab] = useState<'paradas' | 'cierre'>('paradas');
  const [isBusy, setIsBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Fase 3.1: Inicio de Ruta
  const [choferNombre, setChoferNombre] = useState(
    initialContext.choferes[0] ?? 'Carlos Méndez Mora'
  );
  const [vehiculoId, setVehiculoId] = useState(initialContext.vehiculos[0]?.id ?? '');
  const [tramoId, setTramoId] = useState(initialContext.tramos[0]?.id ?? '');
  const [odometroInicio, setOdometroInicio] = useState('48250');
  const [fotoOdoInicioUrl, setFotoOdoInicioUrl] = useState<string | null>(null);
  const [uploadingOdoInicio, setUploadingOdoInicio] = useState(false);
  const [gpsSalida, setGpsSalida] = useState<GpsPoint | null>(null);
  const [gpsSource, setGpsSource] = useState<'device' | 'fallback' | null>(null);
  const odoStartInputRef = useRef<HTMLInputElement | null>(null);

  // Fase 3.2 & 3.3: Paradas y Comprobante
  const [expandedStopId, setExpandedStopId] = useState<string | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<'completa' | 'rechazo'>('completa');
  const [cantEntregada, setCantEntregada] = useState<number>(0);
  const [cantRechazada, setCantRechazada] = useState<number>(0);
  const [motivoRechazo, setMotivoRechazo] = useState<string>(MOTIVOS_RECHAZO[0]);
  const [proofMethod, setProofMethod] = useState<'firma' | 'foto'>('firma');
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [stopPhotoUrl, setStopPhotoUrl] = useState<string | null>(null);
  const [uploadingStopPhoto, setUploadingStopPhoto] = useState(false);
  const stopPhotoInputRef = useRef<HTMLInputElement | null>(null);

  // Fase 3.4: Gastos y Cierre de Ruta
  const [expenseType, setExpenseType] = useState<'combustible' | 'peaje'>('combustible');
  const [expenseLitros, setExpenseLitros] = useState('45');
  const [expenseMonto, setExpenseMonto] = useState('29500');
  const [expensePhotoUrl, setExpensePhotoUrl] = useState<string | null>(null);
  const [uploadingExpensePhoto, setUploadingExpensePhoto] = useState(false);
  const expensePhotoInputRef = useRef<HTMLInputElement | null>(null);

  const [odometroFin, setOdometroFin] = useState(
    String((initialContext.activeViaje?.odometro_inicio ?? 48250) + 72)
  );
  const [fotoOdoFinUrl, setFotoOdoFinUrl] = useState<string | null>(null);
  const [uploadingOdoFin, setUploadingOdoFin] = useState(false);
  const odoFinInputRef = useRef<HTMLInputElement | null>(null);

  const [closedSummary, setClosedSummary] = useState<DriverTripSummary | null>(null);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const currentView = closedSummary ? 'resumen' : context.activeViaje ? activeTab : 'inicio';
  const previousView = useRef(currentView);

  useEffect(() => {
    if (previousView.current !== currentView) pageHeading.current?.focus();
    previousView.current = currentView;
  }, [currentView]);

  const [failedImgs, setFailedImgs] = useState<Record<string, boolean>>({});

  const refreshGps = useCallback(async () => {
    const res = await captureGpsPoint();
    setGpsSalida(res.point);
    setGpsSource(res.source);
    return res.point;
  }, []);

  useEffect(() => {
    void refreshGps();
  }, [refreshGps]);

  const reloadContext = useCallback(async () => {
    const res = await fetch(
      `/api/chofer?empresa_id=${encodeURIComponent(context.empresa.id)}`
    );
    if (!res.ok) return;
    const data = (await res.json()) as DriverContextPayload;
    setContext(data);
    if (data.activeViaje) {
      setOdometroFin(String(data.activeViaje.odometro_inicio + 72));
    }
  }, [context.empresa.id]);

  const selectedTramo = context.tramos.find((tramo) => tramo.id === tramoId);

  const selectedTramoOrders = useMemo(
    () => context.pendingByTramo[tramoId] ?? [],
    [context.pendingByTramo, tramoId]
  );

  const activeVehiculo = useMemo(
    () =>
      context.vehiculos.find(
        (v) => v.id === (context.activeViaje?.vehiculo_id ?? vehiculoId)
      ) ?? context.vehiculos[0],
    [context.vehiculos, context.activeViaje, vehiculoId]
  );

  const stopsProgress = useMemo(() => {
    const total = context.activeStops.length;
    const completed = context.activeStops.filter((s) =>
      ['entregado', 'rechazo_parcial', 'rechazado'].includes(s.entrega.estado)
    ).length;
    return { total, completed };
  }, [context.activeStops]);

  const totalGastosViaje = useMemo(
    () => context.activeGastos.reduce((acc, g) => acc + Number(g.monto_colones || 0), 0),
    [context.activeGastos]
  );

  function openStopForm(stop: DriverStopWithDetails) {
    const expected = stop.pedido.items_json.reduce((a, it) => a + it.cantidad, 0);
    setExpandedStopId(stop.entrega.id);
    setDeliveryMode('completa');
    setCantEntregada(expected);
    setCantRechazada(0);
    setMotivoRechazo(MOTIVOS_RECHAZO[0]);
    setProofMethod('firma');
    setSignatureDataUrl(null);
    setStopPhotoUrl(null);
    setErrorMsg(null);
  }

  async function handleOdoStartFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setUploadingOdoInicio(true);
    try {
      const url = await uploadFileEvidence(file, 'odometro-inicio');
      setFotoOdoInicioUrl(url);
      setFeedbackMsg('Foto de odómetro inicial guardada en evidencias.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error subiendo foto.');
    } finally {
      setUploadingOdoInicio(false);
    }
  }

  async function handleStartRoute() {
    setErrorMsg(null);
    setFeedbackMsg(null);
    const odoVal = Number(odometroInicio);
    if (!Number.isFinite(odoVal) || odoVal <= 0) {
      setErrorMsg('Ingresa un odómetro inicial válido en kilómetros.');
      return;
    }
    if (!fotoOdoInicioUrl) {
      setErrorMsg('Sube la fotografía obligatoria del odómetro inicial antes de salir.');
      return;
    }

    setIsBusy(true);
    try {
      const gpsPoint = gpsSalida ?? (await refreshGps());
      const res = await fetch('/api/chofer/ruta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'iniciar',
          empresa_id: context.empresa.id,
          chofer_nombre: choferNombre,
          vehiculo_id: vehiculoId,
          tramo_id: tramoId,
          odometro_inicio: odoVal,
          foto_odometro_inicio: fotoOdoInicioUrl,
          gps_salida: gpsPoint,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar la ruta.');

      setClosedSummary(null);
      setActiveTab('paradas');
      await reloadContext();
      setFeedbackMsg('Ruta iniciada. Paradas cargadas en orden de atención.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al iniciar ruta.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleArrival(stop: DriverStopWithDetails) {
    setErrorMsg(null);
    setFeedbackMsg(null);
    setIsBusy(true);
    try {
      const { point } = await captureGpsPoint(stop.cliente.lat, stop.cliente.lng);
      const res = await fetch('/api/chofer/parada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'llegada',
          entrega_id: stop.entrega.id,
          gps_llegada: point,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo registrar la llegada.');

      await reloadContext();
      openStopForm(stop);
      setFeedbackMsg(`Llegada registrada en ${stop.cliente.nombre}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error registrando llegada.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleStopPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setUploadingStopPhoto(true);
    try {
      const url = await uploadFileEvidence(file, 'comprobantes');
      setStopPhotoUrl(url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error subiendo comprobante.');
    } finally {
      setUploadingStopPhoto(false);
    }
  }

  async function handleConfirmDelivery(stop: DriverStopWithDetails) {
    setErrorMsg(null);
    setFeedbackMsg(null);
    const expected = stop.pedido.items_json.reduce((a, it) => a + it.cantidad, 0);
    const delivered = deliveryMode === 'completa' ? expected : Number(cantEntregada);
    const rejected = deliveryMode === 'completa' ? 0 : Number(cantRechazada);

    if (rejected > 0 && !motivoRechazo) {
      setErrorMsg('Selecciona el motivo del rechazo.');
      return;
    }

    setIsBusy(true);
    try {
      let proofUrl = stopPhotoUrl;
      if (proofMethod === 'firma') {
        if (!signatureDataUrl) {
          throw new Error('Solicita la firma del receptor o cambia a foto de comprobante.');
        }
        proofUrl = await uploadDataUrlEvidence(signatureDataUrl, 'firmas');
      } else if (!proofUrl) {
        throw new Error('Captura o sube la foto de comprobante antes de cerrar la parada.');
      }

      const res = await fetch('/api/chofer/parada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'entregar',
          entrega_id: stop.entrega.id,
          cantidad_entregada: delivered,
          cantidad_rechazada: rejected,
          motivo_rechazo: rejected > 0 ? motivoRechazo : null,
          foto_comprobante: proofUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo completar la entrega.');

      setExpandedStopId(null);
      await reloadContext();
      setFeedbackMsg(
        `Parada ${stop.pedido.codigo_tracking} cerrada y sincronizada en tracking público.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error cerrando parada.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleExpensePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setUploadingExpensePhoto(true);
    try {
      const url = await uploadFileEvidence(file, 'facturas-gastos');
      setExpensePhotoUrl(url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error subiendo factura de gasto.');
    } finally {
      setUploadingExpensePhoto(false);
    }
  }

  async function handleAddExpense() {
    if (!context.activeViaje) return;
    setErrorMsg(null);
    setFeedbackMsg(null);
    const montoVal = Number(expenseMonto);
    const litrosVal = expenseType === 'combustible' ? Number(expenseLitros) : null;

    if (!Number.isFinite(montoVal) || montoVal <= 0) {
      setErrorMsg('Ingresa un monto en colones mayor a cero.');
      return;
    }
    if (expenseType === 'combustible' && (!Number.isFinite(litrosVal) || (litrosVal ?? 0) <= 0)) {
      setErrorMsg('Ingresa los litros cargados de combustible.');
      return;
    }

    setIsBusy(true);
    try {
      const res = await fetch('/api/chofer/parada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'gasto',
          empresa_id: context.empresa.id,
          viaje_id: context.activeViaje.id,
          tipo: expenseType,
          litros: litrosVal,
          monto_colones: montoVal,
          foto_factura: expensePhotoUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error guardando gasto.');

      setExpensePhotoUrl(null);
      await reloadContext();
      setFeedbackMsg(
        `Gasto de ${expenseType === 'combustible' ? 'combustible' : 'peaje'} registrado (${formatColones(montoVal)}).`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error registrando gasto.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleOdoFinFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setUploadingOdoFin(true);
    try {
      const url = await uploadFileEvidence(file, 'odometro-fin');
      setFotoOdoFinUrl(url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error subiendo foto de odómetro final.');
    } finally {
      setUploadingOdoFin(false);
    }
  }

  async function handleCloseRoute() {
    if (!context.activeViaje) return;
    setErrorMsg(null);
    setFeedbackMsg(null);
    const odoFinVal = Number(odometroFin);
    if (!Number.isFinite(odoFinVal) || odoFinVal < context.activeViaje.odometro_inicio) {
      setErrorMsg(
        `El odómetro final debe ser mayor o igual a ${formatInt(context.activeViaje.odometro_inicio)} km.`
      );
      return;
    }
    if (!fotoOdoFinUrl) {
      setErrorMsg('Sube la foto obligatoria del odómetro final para cerrar la ruta.');
      return;
    }

    setIsBusy(true);
    try {
      const { point } = await captureGpsPoint();
      const res = await fetch('/api/chofer/ruta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cerrar',
          viaje_id: context.activeViaje.id,
          odometro_fin: odoFinVal,
          foto_odometro_fin: fotoOdoFinUrl,
          gps_regreso: point,
        }),
      });
      const data = (await res.json()) as { summary?: DriverTripSummary; error?: string };
      if (!res.ok || !data.summary) throw new Error(data.error || 'Error cerrando ruta.');

      setClosedSummary(data.summary);
      setFotoOdoInicioUrl(null);
      setFotoOdoFinUrl(null);
      await reloadContext();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error cerrando ruta.');
    } finally {
      setIsBusy(false);
    }
  }

  function resetToNewRoute() {
    setClosedSummary(null);
    setFotoOdoInicioUrl(null);
    setFotoOdoFinUrl(null);
    setErrorMsg(null);
    setFeedbackMsg(null);
    void reloadContext();
  }

  return (
    <div className="min-h-dvh text-ink-strong">
      {/* Compact Sticky Top App Bar (56px) */}
      <header className="solo-navbar glass-surface sticky top-[max(0.5rem,env(safe-area-inset-top))] z-30">
        <div className="max-w-4xl mx-auto flex min-h-11 items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/"
              aria-label="Volver al panel principal"
              className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-lg text-ink hover:bg-subtle active:scale-[0.98] transition-transform"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </Link>
            <div className="min-w-0">
              <p className="font-display text-base font-bold tracking-tight text-ink-strong">
                Innova Track · Chofer
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            {context.activeViaje ? (
              <span className="font-mono text-xs font-bold text-ink tabular-nums">
                {activeVehiculo?.placa} · {stopsProgress.completed}/{stopsProgress.total}
              </span>
            ) : (
              <span className="block max-w-[11ch] break-words text-xs font-semibold text-secondary sm:max-w-[24ch]">
                {context.empresa.nombre}
              </span>
            )}
          </div>
        </div>
      </header>

      <main id="contenido" tabIndex={-1} className="max-w-4xl mx-auto px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] space-y-4 sm:px-6 sm:pt-6">
        {/* Alertas de estado de alto contraste */}
        {errorMsg && (
          <div
            role="alert"
            className="bg-danger-soft border border-danger-line rounded-xl p-4 text-sm font-semibold text-danger-strong flex items-start justify-between gap-3"
          >
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-xs font-bold underline shrink-0 min-h-[44px] px-2 -my-2"
            >
              Cerrar
            </button>
          </div>
        )}

        {feedbackMsg && (
          <div
            role="status"
            className="bg-success-soft border border-success-line rounded-xl p-3.5 text-sm font-semibold text-success-strong flex items-center justify-between gap-3"
          >
            <span>{feedbackMsg}</span>
            <button
              type="button"
              onClick={() => setFeedbackMsg(null)}
              className="text-xs font-bold underline shrink-0 min-h-[44px] px-2 -my-2"
            >
              OK
            </button>
          </div>
        )}

        {/* VISTA 4: RESUMEN INSTANTÁNEO DE CIERRE */}
        {closedSummary ? (
          <section
            key="view-summary"
            className="space-y-4"
          >
            <div className="bg-surface border border-line-strong rounded-2xl p-5 space-y-5">
              <div className="flex items-start justify-between gap-3 pb-4 border-b border-line">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-success-strong">
                    Ruta finalizada
                  </p>
                  <h1 ref={pageHeading} tabIndex={-1} className="page-title mt-0.5">
                    {closedSummary.ruta_nombre}
                  </h1>
                  <p className="text-sm font-medium text-secondary mt-0.5">
                    Chofer: {closedSummary.chofer_nombre}
                  </p>
                </div>
                <CheckCircle2 className="w-8 h-8 text-success shrink-0" aria-hidden="true" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="border border-line rounded-xl p-3.5 bg-canvas">
                  <p className="text-xs font-semibold text-secondary">Km recorridos</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-ink-strong mt-1">
                    {closedSummary.km_recorridos} km
                  </p>
                  <p className="text-xs font-mono tabular-nums text-secondary mt-0.5">
                    Plan: {closedSummary.km_planificados} km
                  </p>
                </div>

                <div className="border border-line rounded-xl p-3.5 bg-canvas">
                  <p className="text-xs font-semibold text-secondary">Entregas a tiempo</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-ink-strong mt-1">
                    {closedSummary.entregas_a_tiempo}/{closedSummary.total_paradas}
                  </p>
                  <p className="text-xs font-medium text-secondary mt-0.5">
                    Completadas: {closedSummary.paradas_completadas}
                  </p>
                </div>

                <div className="border border-line rounded-xl p-3.5 bg-canvas">
                  <p className="text-xs font-semibold text-secondary">Carga entregada</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-success-strong mt-1">
                    {formatInt(closedSummary.carga_entregada)}
                  </p>
                  <p className="text-xs font-mono tabular-nums text-secondary mt-0.5">
                    Rechazada: {formatInt(closedSummary.carga_rechazada)}
                  </p>
                </div>

                <div className="border border-line rounded-xl p-3.5 bg-canvas">
                  <p className="text-xs font-semibold text-secondary">Gastos en ruta</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-ink-strong mt-1">
                    {formatColones(closedSummary.total_gastos_colones)}
                  </p>
                  <p className="text-xs font-mono tabular-nums text-secondary mt-0.5">
                    Combustible: {closedSummary.total_litros_combustible} L
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={resetToNewRoute}
                className="ui-button ui-button-primary w-full h-14 text-base"
              >
                <Route className="w-5 h-5" aria-hidden="true" />
                <span>Preparar Nueva Ruta</span>
              </button>
            </div>
          </section>
        ) : !context.activeViaje ? (
          /* VISTA 1: INICIO DE RUTA */
          <section
            key="view-start"
            className="grid grid-cols-1 lg:grid-cols-12 gap-4"
          >
            <div className="lg:col-span-7 bg-surface border border-line-strong rounded-2xl p-5 space-y-5">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-line">
                <div>
                  <h1 ref={pageHeading} tabIndex={-1} className="page-title">Inicio de ruta</h1>
                  <p className="text-xs font-medium text-secondary">
                    Elige la unidad y la ruta. Registra el odómetro.
                  </p>
                </div>
                <Truck className="w-6 h-6 text-ink shrink-0" aria-hidden="true" />
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="chofer-select"
                    className="text-sm font-bold text-ink block"
                  >
                    Chofer responsable
                  </label>
                  <select
                    id="chofer-select"
                    value={choferNombre}
                    onChange={(e) => setChoferNombre(e.target.value)}
                    className="ui-field w-full h-12 px-3 text-base font-medium focus:border-accent"
                  >
                    {context.choferes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="vehiculo-select"
                      className="text-sm font-bold text-ink block"
                    >
                      Vehículo asignado
                    </label>
                    <select
                      id="vehiculo-select"
                      aria-describedby={activeVehiculo ? "vehiculo-detalle" : undefined}
                      value={vehiculoId}
                      onChange={(e) => setVehiculoId(e.target.value)}
                      className="ui-field w-full h-12 px-3 text-base font-medium focus:border-accent"
                    >
                      {context.vehiculos.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.placa}
                        </option>
                      ))}
                    </select>
                    {activeVehiculo && (
                      <p id="vehiculo-detalle" className="text-sm text-muted">{activeVehiculo.modelo}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="tramo-select"
                      className="text-sm font-bold text-ink block"
                    >
                      Ruta / Tramo
                    </label>
                    <select
                      id="tramo-select"
                      aria-describedby={selectedTramo ? "tramo-detalle" : undefined}
                      value={tramoId}
                      onChange={(e) => setTramoId(e.target.value)}
                      className="ui-field w-full h-12 px-3 text-base font-medium focus:border-accent"
                    >
                      {context.tramos.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.ruta_nombre.split(' — ')[0]} ({t.distancia_planificada_km} km)
                        </option>
                      ))}
                    </select>
                    {selectedTramo && (
                      <p id="tramo-detalle" className="text-sm text-muted">{selectedTramo.ruta_nombre}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="odo-inicio"
                    className="text-sm font-bold text-ink block"
                  >
                    Odómetro inicial (km)
                  </label>
                  <div className="relative">
                    <Gauge
                      className="w-5 h-5 text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="odo-inicio"
                      type="number"
                      inputMode="numeric"
                      value={odometroInicio}
                      onChange={(e) => setOdometroInicio(e.target.value)}
                      className="ui-field w-full h-14 pl-11 pr-4 text-xl font-bold font-mono tabular-nums focus:border-accent"
                    />
                  </div>
                </div>

                {/* Foto obligatoria del odómetro */}
                <div className="space-y-2">
                  <span className="text-sm font-bold text-ink block">
                    Foto obligatoria de odómetro inicial
                  </span>
                  <input
                    ref={odoStartInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    aria-label="Subir foto de odómetro inicial"
                    onChange={handleOdoStartFile}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => odoStartInputRef.current?.click()}
                    disabled={uploadingOdoInicio}
                    className="ui-button ui-button-secondary w-full h-14 text-ink-strong text-base"
                  >
                    {uploadingOdoInicio ? (
                      <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Camera className="w-5 h-5" aria-hidden="true" />
                    )}
                    <span>
                      {fotoOdoInicioUrl ? 'Cambiar foto de odómetro' : 'Tomar / Subir foto de odómetro'}
                    </span>
                  </button>

                  {fotoOdoInicioUrl && !failedImgs['odo-start'] && (
                    <div className="border border-success-line rounded-xl overflow-hidden bg-canvas">
                      <img
                        src={fotoOdoInicioUrl}
                        alt="Odómetro inicial capturado"
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedImgs((prev) => ({ ...prev, 'odo-start': true }))
                        }
                        className="w-full h-36 object-cover"
                      />
                      <p className="px-3 py-1.5 text-xs font-bold text-success-strong bg-success-soft border-t border-success-line">
                        Evidencia cargada en bucket evidencias
                      </p>
                    </div>
                  )}
                </div>

                {/* GPS de salida */}
                <div className="border border-line rounded-xl p-3.5 bg-canvas flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MapPin className="w-5 h-5 text-accent shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-ink">
                        Ubicación GPS de salida
                      </p>
                      <p className="text-xs font-mono tabular-nums text-secondary">
                        {gpsSalida
                          ? `${gpsSalida.lat.toFixed(4)}, ${gpsSalida.lng.toFixed(4)}`
                          : 'Obteniendo coordenadas...'}
                        {gpsSource === 'fallback' ? ' (CR)' : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshGps()}
                    className="min-h-[44px] px-3 rounded-lg border border-line-strong bg-surface text-xs font-bold text-ink active:scale-[0.98]"
                  >
                    Actualizar
                  </button>
                </div>
              </div>

              <button
                type="button"
                disabled={isBusy || uploadingOdoInicio}
                onClick={handleStartRoute}
                className="ui-button ui-button-primary w-full h-14 text-base"
              >
                {isBusy ? (
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                ) : (
                  <Navigation className="w-5 h-5" aria-hidden="true" />
                )}
                <span>Iniciar Ruta</span>
              </button>
            </div>

            {/* Pedidos confirmados auto-cargados para el tramo */}
            <div className="lg:col-span-5 bg-surface border border-line-strong rounded-2xl p-5 space-y-4 self-start">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-line">
                <div>
                  <h2 className="text-base font-bold text-ink-strong">
                    Pedidos confirmados en ruta
                  </h2>
                  <p className="text-xs font-medium text-secondary">
                    Sincronizados desde el copiloto
                  </p>
                </div>
                <span className="font-mono text-sm font-bold tabular-nums text-accent-hover">
                  {selectedTramoOrders.length} paradas
                </span>
              </div>

              {selectedTramoOrders.length === 0 ? (
                <div className="text-sm text-secondary space-y-2">
                  <p className="font-semibold text-ink">
                    Sin pedidos pendientes en esta zona.
                  </p>
                  <p className="text-xs text-secondary">
                    Al iniciar ruta se asignarán automáticamente paradas de clientes del tramo o puedes crear un pedido en el Copiloto.
                  </p>
                  <Link
                    href="/pedidos/nuevo"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-accent hover:underline pt-1"
                  >
                    <span>Ir al Copiloto de Pedidos</span>
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {selectedTramoOrders.map(({ pedido, cliente }, i) => {
                    const totalUnits = pedido.items_json.reduce((a, it) => a + it.cantidad, 0);
                    const unitLabel = pedido.items_json[0]?.unidad ?? 'unidades';
                    return (
                      <div key={pedido.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-ink-strong truncate">
                            0{i + 1}. {cliente.nombre}
                          </p>
                          <span className="font-mono text-xs font-bold text-secondary shrink-0">
                            {pedido.codigo_tracking}
                          </span>
                        </div>
                        <p className="text-xs font-mono tabular-nums text-secondary">
                          Ventana {cliente.ventana_inicio.slice(0, 5)}–{cliente.ventana_fin.slice(0, 5)} ·{' '}
                          {totalUnits} {unitLabel} · {formatColones(pedido.total)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        ) : activeTab === 'paradas' ? (
          /* VISTA 2 & 3: LISTA DE PARADAS + REGISTRO DE ENTREGA */
          <section
            key="view-stops"
            className="space-y-4"
          >
            {/* Resumen compacto de ruta en curso */}
            <div className="bg-surface border border-line-strong rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-accent-hover uppercase tracking-wider">
                  Ruta en curso
                </p>
                <h1 ref={pageHeading} tabIndex={-1} className="page-title">
                  {context.activeViaje.ruta_nombre}
                </h1>
                <p className="text-xs font-medium text-secondary">
                  {context.activeViaje.chofer_nombre} · Salida{' '}
                  <span className="font-mono tabular-nums">
                    {formatInt(context.activeViaje.odometro_inicio)} km
                  </span>
                </p>
              </div>

              <div className="text-right">
                <p className="text-2xl font-bold font-mono tabular-nums text-ink-strong">
                  {stopsProgress.completed}/{stopsProgress.total}
                </p>
                <p className="text-xs font-semibold text-secondary">Paradas listas</p>
              </div>
            </div>

            {/* Tarjetas de cada parada */}
            <div className="space-y-4">
              {context.activeStops.map((stop) => {
                const { entrega, pedido, cliente } = stop;
                const isPendiente = entrega.estado === 'pendiente';
                const isEnSitio = entrega.estado === 'en_sitio';
                const isDone =
                  entrega.estado === 'entregado' ||
                  entrega.estado === 'rechazo_parcial' ||
                  entrega.estado === 'rechazado';
                const isExpanded = expandedStopId === entrega.id || isEnSitio;
                const expectedUnits = pedido.items_json.reduce((a, it) => a + it.cantidad, 0);

                return (
                  <article
                    key={entrega.id}
                    className={`bg-surface border rounded-2xl p-4 sm:p-5 space-y-4 ${
                      isDone
                        ? 'border-success-line'
                        : isEnSitio
                          ? 'border-accent'
                          : 'border-line-strong'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-bold text-ink">
                            #{String(entrega.orden).padStart(2, '0')}
                          </span>
                          <span className="font-mono text-xs font-bold text-accent-hover">
                            {pedido.codigo_tracking}
                          </span>
                          <span
                            className={`text-xs font-bold ${
                              entrega.estado === 'entregado'
                                ? 'text-success-strong'
                                : entrega.estado === 'rechazado' ||
                                    entrega.estado === 'rechazo_parcial'
                                  ? 'text-danger'
                                  : isEnSitio
                                    ? 'text-accent-hover'
                                    : 'text-secondary'
                            }`}
                          >
                            ·{' '}
                            {entrega.estado === 'pendiente'
                              ? 'Pendiente'
                              : entrega.estado === 'en_sitio'
                                ? 'En sitio'
                                : entrega.estado === 'entregado'
                                  ? 'Entregado'
                                  : entrega.estado === 'rechazo_parcial'
                                    ? 'Entrega parcial'
                                    : 'Rechazado'}
                          </span>
                        </div>

                        <h2 className="text-lg font-bold text-ink-strong leading-snug">
                          {cliente.nombre}
                        </h2>
                        <p className="text-sm font-medium text-secondary font-mono tabular-nums">
                          Ventana {cliente.ventana_inicio.slice(0, 5)}–{cliente.ventana_fin.slice(0, 5)} ·{' '}
                          {cliente.zona} · Tel {cliente.telefono}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold font-mono tabular-nums text-ink-strong">
                          {expectedUnits} {entrega.unidad_medida}
                        </p>
                        <p className="text-xs font-mono tabular-nums text-secondary">
                          {formatColones(pedido.total)}
                        </p>
                      </div>
                    </div>

                    {/* Desglose de carga */}
                    <div className="bg-canvas border border-line rounded-xl p-3 space-y-1.5">
                      {pedido.items_json.map((it, idx) => (
                        <div
                          key={`${it.sku}-${idx}`}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="min-w-0 font-semibold text-ink [overflow-wrap:anywhere]">
                            {it.nombre}
                          </span>
                          <span className="font-mono font-bold tabular-nums text-ink shrink-0">
                            {it.cantidad} {it.unidad}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Acción 1: Llegué (1 toque) */}
                    {isPendiente && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleArrival(stop)}
                        className="ui-button ui-button-primary w-full h-14 text-base"
                      >
                        {isBusy ? (
                          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                        ) : (
                          <MapPin className="w-5 h-5" aria-hidden="true" />
                        )}
                        <span>Llegué</span>
                      </button>
                    )}

                    {/* Acción 2 & 3: Confirmar entrega / rechazo + Comprobante */}
                    {isEnSitio && isExpanded && (
                      <div className="pt-3 border-t border-line space-y-4">
                        {/* Selector rápido 1 toque: Entrega completa vs Rechazo */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            aria-pressed={deliveryMode === 'completa'}
                            onClick={() => {
                              setDeliveryMode('completa');
                              setCantEntregada(expectedUnits);
                              setCantRechazada(0);
                            }}
                            className={`h-14 px-2.5 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors duration-150 ${
                              deliveryMode === 'completa'
                                ? 'bg-success border-success text-on-ink'
                                : 'bg-surface border-control text-ink hover:bg-subtle'
                            }`}
                          >
                            <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span>Entrega completa</span>
                          </button>
                          <button
                            type="button"
                            aria-pressed={deliveryMode === 'rechazo'}
                            onClick={() => {
                              setDeliveryMode('rechazo');
                              setCantEntregada(Math.max(0, expectedUnits - 1));
                              setCantRechazada(1);
                            }}
                            className={`h-14 px-2.5 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors duration-150 ${
                              deliveryMode === 'rechazo'
                                ? 'bg-danger border-danger text-on-ink'
                                : 'bg-surface border-control text-ink hover:bg-subtle'
                            }`}
                          >
                            <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span>Con rechazo</span>
                          </button>
                        </div>

                        {deliveryMode === 'rechazo' && (
                          <div className="bg-danger-soft/70 border border-danger-line rounded-xl p-4 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label
                                  htmlFor={`entregado-${entrega.id}`}
                                  className="text-xs font-bold text-ink block"
                                >
                                  Cant. entregada
                                </label>
                                <input
                                  id={`entregado-${entrega.id}`}
                                  type="number"
                                  min={0}
                                  max={expectedUnits}
                                  value={cantEntregada}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value));
                                    setCantEntregada(val);
                                    setCantRechazada(Math.max(0, expectedUnits - val));
                                  }}
                                  className="ui-field w-full h-12 px-3 text-base font-bold font-mono tabular-nums"
                                />
                              </div>
                              <div className="space-y-1">
                                <label
                                  htmlFor={`rechazado-${entrega.id}`}
                                  className="text-xs font-bold text-danger-strong block"
                                >
                                  Cant. rechazada
                                </label>
                                <input
                                  id={`rechazado-${entrega.id}`}
                                  type="number"
                                  min={0}
                                  max={expectedUnits}
                                  value={cantRechazada}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value));
                                    setCantRechazada(val);
                                    setCantEntregada(Math.max(0, expectedUnits - val));
                                  }}
                                  className="ui-field w-full h-12 px-3 border-danger text-base font-bold font-mono tabular-nums text-danger-strong"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label
                                htmlFor={`motivo-${entrega.id}`}
                                className="text-xs font-bold text-danger-strong block"
                              >
                                Motivo del rechazo
                              </label>
                              <select
                                id={`motivo-${entrega.id}`}
                                value={motivoRechazo}
                                onChange={(e) => setMotivoRechazo(e.target.value)}
                                className="ui-field w-full h-12 px-3 border-danger text-sm font-bold"
                              >
                                {MOTIVOS_RECHAZO.map((m) => (
                                  <option key={m} value={m}>
                                    {m}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}

                        {/* Selector de comprobante: Firma digital o Foto */}
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              aria-pressed={proofMethod === 'firma'}
                              onClick={() => setProofMethod('firma')}
                              className={`h-12 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-colors duration-150 ${
                                proofMethod === 'firma'
                                  ? 'bg-accent-soft border-accent text-accent-hover'
                                  : 'bg-surface border-control text-ink hover:bg-subtle'
                              }`}
                            >
                              <PenTool className="w-4 h-4" aria-hidden="true" />
                              <span>Firma digital</span>
                            </button>
                            <button
                              type="button"
                              aria-pressed={proofMethod === 'foto'}
                              onClick={() => setProofMethod('foto')}
                              className={`h-12 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-colors duration-150 ${
                                proofMethod === 'foto'
                                  ? 'bg-accent-soft border-accent text-accent-hover'
                                  : 'bg-surface border-control text-ink hover:bg-subtle'
                              }`}
                            >
                              <Camera className="w-4 h-4" aria-hidden="true" />
                              <span>Foto comprobante</span>
                            </button>
                          </div>

                          {proofMethod === 'firma' ? (
                            <SignaturePad onChange={setSignatureDataUrl} disabled={isBusy} />
                          ) : (
                            <div className="space-y-2">
                              <input
                                ref={stopPhotoInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                aria-label="Subir foto de comprobante de entrega"
                                onChange={handleStopPhotoFile}
                                className="hidden"
                              />
                              <button
                                type="button"
                                disabled={uploadingStopPhoto}
                                onClick={() => stopPhotoInputRef.current?.click()}
                                className="w-full h-14 rounded-xl border border-control bg-canvas text-ink-strong text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98]"
                              >
                                {uploadingStopPhoto ? (
                                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                                ) : (
                                  <Camera className="w-5 h-5" aria-hidden="true" />
                                )}
                                <span>
                                  {stopPhotoUrl ? 'Cambiar foto de comprobante' : 'Tomar / Subir foto'}
                                </span>
                              </button>
                              {stopPhotoUrl && !failedImgs[entrega.id] && (
                                <img
                                  src={stopPhotoUrl}
                                  alt={`Comprobante ${pedido.codigo_tracking}`}
                                  referrerPolicy="no-referrer"
                                  onError={() =>
                                    setFailedImgs((prev) => ({ ...prev, [entrega.id]: true }))
                                  }
                                  className="w-full h-36 object-cover rounded-xl border border-line-strong"
                                />
                              )}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={isBusy || uploadingStopPhoto}
                          onClick={() => void handleConfirmDelivery(stop)}
                          className="ui-button ui-button-primary w-full h-14 text-base"
                        >
                          {isBusy ? (
                            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                          ) : (
                            <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                          )}
                          <span>Entregado</span>
                        </button>
                      </div>
                    )}

                    {/* Estado final cuando la parada ya se cerró */}
                    {isDone && (
                      <div className="pt-3 border-t border-line flex items-center justify-between gap-3 text-xs">
                        <div className="space-y-0.5">
                          <p className="font-bold text-ink font-mono tabular-nums">
                            Entregado: {entrega.cantidad_entregada} {entrega.unidad_medida}
                            {entrega.cantidad_rechazada > 0
                              ? ` · Rechazado: ${entrega.cantidad_rechazada} (${entrega.motivo_rechazo})`
                              : ''}
                          </p>
                          <p className="text-secondary">
                            Sincronizado con tracking público
                          </p>
                        </div>
                        <Link
                          href={`/tracking/${pedido.codigo_tracking}`}
                          className="min-h-[44px] px-3 rounded-lg border border-line-strong bg-surface font-bold text-accent-hover inline-flex items-center gap-1.5 shrink-0 active:scale-[0.98]"
                        >
                          <span>Ver tracking</span>
                          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        </Link>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          /* VISTA 4: GASTOS Y CIERRE DE RUTA */
          <section
            key="view-close"
            className="grid grid-cols-1 lg:grid-cols-2 gap-4"
          >
            <h1 ref={pageHeading} tabIndex={-1} className="page-title lg:col-span-2">Gastos y cierre de ruta</h1>
            {/* Registro de Combustible y Peajes */}
            <div className="bg-surface border border-line-strong rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-line">
                <div>
                  <h2 className="text-lg font-bold text-ink-strong">Gastos en Ruta</h2>
                  <p className="text-xs font-medium text-secondary">
                    Combustible en litros, peajes y foto de factura
                  </p>
                </div>
                <Fuel className="w-6 h-6 text-ink shrink-0" aria-hidden="true" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={expenseType === 'combustible'}
                  onClick={() => setExpenseType('combustible')}
                  className={`h-14 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-colors duration-150 ${
                    expenseType === 'combustible'
                      ? 'bg-accent-soft border-accent text-accent-hover'
                      : 'bg-surface border-control text-ink hover:bg-subtle'
                  }`}
                >
                  <Fuel className="w-5 h-5" aria-hidden="true" />
                  <span>Combustible</span>
                </button>
                <button
                  type="button"
                  aria-pressed={expenseType === 'peaje'}
                  onClick={() => setExpenseType('peaje')}
                  className={`h-14 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-colors duration-150 ${
                    expenseType === 'peaje'
                      ? 'bg-accent-soft border-accent text-accent-hover'
                      : 'bg-surface border-control text-ink hover:bg-subtle'
                  }`}
                >
                  <Receipt className="w-5 h-5" aria-hidden="true" />
                  <span>Peaje</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {expenseType === 'combustible' && (
                  <div className="space-y-1">
                    <label
                      htmlFor="gasto-litros"
                      className="text-sm font-bold text-ink block"
                    >
                      Litros cargados
                    </label>
                    <input
                      id="gasto-litros"
                      type="number"
                      inputMode="decimal"
                      value={expenseLitros}
                      onChange={(e) => setExpenseLitros(e.target.value)}
                      className="ui-field w-full h-12 px-3 text-lg font-bold font-mono tabular-nums"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label
                    htmlFor="gasto-monto"
                    className="text-sm font-bold text-ink block"
                  >
                    Monto en colones (₡)
                  </label>
                  <input
                    id="gasto-monto"
                    type="number"
                    inputMode="numeric"
                    value={expenseMonto}
                    onChange={(e) => setExpenseMonto(e.target.value)}
                    className="ui-field w-full h-12 px-3 text-lg font-bold font-mono tabular-nums"
                  />
                </div>
              </div>

              <input
                ref={expensePhotoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                aria-label="Subir foto de factura de gasto"
                onChange={handleExpensePhotoFile}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploadingExpensePhoto}
                onClick={() => expensePhotoInputRef.current?.click()}
                className="w-full h-12 rounded-xl border border-line-strong bg-canvas text-sm font-bold text-ink flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                {uploadingExpensePhoto ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Camera className="w-4 h-4" aria-hidden="true" />
                )}
                <span>
                  {expensePhotoUrl ? 'Factura adjunta (cambiar)' : 'Adjuntar foto de factura'}
                </span>
              </button>

              <button
                type="button"
                disabled={isBusy || uploadingExpensePhoto}
                onClick={() => void handleAddExpense()}
                className="ui-button ui-button-primary w-full h-14 text-base"
              >
                <span>Registrar Gasto</span>
              </button>

              {context.activeGastos.length > 0 && (
                <div className="pt-3 border-t border-line space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-secondary">
                    <span>Comprobantes registrados</span>
                    <span className="font-mono tabular-nums">
                      Total: {formatColones(totalGastosViaje)}
                    </span>
                  </div>
                  <div className="divide-y divide-line">
                    {context.activeGastos.map((g) => (
                      <div
                        key={g.id}
                        className="py-2 flex items-center justify-between text-sm"
                      >
                        <span className="font-semibold text-ink capitalize">
                          {g.tipo}
                          {g.litros ? ` (${g.litros} L)` : ''}
                        </span>
                        <span className="font-mono font-bold tabular-nums text-ink-strong">
                          {formatColones(g.monto_colones)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Cierre de Ruta y Odómetro Final */}
            <div className="bg-surface border border-line-strong rounded-2xl p-5 space-y-4 self-start">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-line">
                <div>
                  <h2 className="text-lg font-bold text-ink-strong">Cierre de Ruta</h2>
                  <p className="text-xs font-medium text-secondary font-mono tabular-nums">
                    Odómetro inicial: {formatInt(context.activeViaje.odometro_inicio)} km
                  </p>
                </div>
                <ClipboardCheck className="w-6 h-6 text-ink shrink-0" aria-hidden="true" />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="odo-fin"
                  className="text-sm font-bold text-ink block"
                >
                  Odómetro final (km)
                </label>
                <input
                  id="odo-fin"
                  type="number"
                  inputMode="numeric"
                  value={odometroFin}
                  onChange={(e) => setOdometroFin(e.target.value)}
                  className="ui-field w-full h-14 px-4 text-xl font-bold font-mono tabular-nums"
                />
              </div>

              <div className="space-y-2">
                <span className="text-sm font-bold text-ink block">
                  Foto obligatoria de odómetro final
                </span>
                <input
                  ref={odoFinInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  aria-label="Subir foto de odómetro final"
                  onChange={handleOdoFinFile}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploadingOdoFin}
                  onClick={() => odoFinInputRef.current?.click()}
                  className="w-full h-14 rounded-xl border border-control bg-canvas text-ink-strong text-base font-bold flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  {uploadingOdoFin ? (
                    <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Camera className="w-5 h-5" aria-hidden="true" />
                  )}
                  <span>
                    {fotoOdoFinUrl ? 'Cambiar foto final' : 'Tomar / Subir foto odómetro final'}
                  </span>
                </button>

                {fotoOdoFinUrl && !failedImgs['odo-fin'] && (
                  <div className="border border-success-line rounded-xl overflow-hidden bg-canvas">
                    <img
                      src={fotoOdoFinUrl}
                      alt="Odómetro final capturado"
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedImgs((prev) => ({ ...prev, 'odo-fin': true }))
                      }
                      className="w-full h-36 object-cover"
                    />
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={isBusy || uploadingOdoFin}
                onClick={() => void handleCloseRoute()}
                className="ui-button ui-button-primary w-full h-14 text-base"
              >
                {isBusy ? (
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                )}
                <span>Cerrar Ruta</span>
              </button>
            </div>
          </section>
        )}
      </main>

      {/* Bottom Tab Bar (56px, visible solo cuando hay una ruta activa) */}
      {context.activeViaje && !closedSummary && (
        <nav
          aria-label="Navegación de ruta activa"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
        >
          <div className="mx-auto grid max-w-4xl grid-cols-2">
            <button
              type="button"
              aria-pressed={activeTab === 'paradas'}
              onClick={() => setActiveTab('paradas')}
              className={`flex min-h-16 items-center justify-center gap-2 px-2 text-sm font-bold focus-visible:outline-offset-[-3px] transition-colors ${
                activeTab === 'paradas' ? 'text-accent bg-accent-soft/60' : 'text-secondary'
              }`}
            >
              <Package className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>
                Paradas ({stopsProgress.completed}/{stopsProgress.total})
              </span>
            </button>

            <button
              type="button"
              aria-pressed={activeTab === 'cierre'}
              onClick={() => setActiveTab('cierre')}
              className={`flex min-h-16 items-center justify-center gap-2 px-2 text-sm font-bold focus-visible:outline-offset-[-3px] border-l border-line transition-colors ${
                activeTab === 'cierre' ? 'text-accent bg-accent-soft/60' : 'text-secondary'
              }`}
            >
              <Fuel className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>Gastos y Cierre</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
