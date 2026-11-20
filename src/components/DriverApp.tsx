'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
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

const TRANSITION_EASE = [0.22, 1, 0.36, 1] as const;

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
    <div className="min-h-screen bg-slate-100 text-slate-950">
      {/* Compact Sticky Top App Bar (56px) */}
      <header className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-md border-b border-slate-300 px-4">
        <div className="max-w-4xl mx-auto h-full flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/"
              aria-label="Volver al panel principal"
              className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-lg text-slate-800 hover:bg-slate-100 active:scale-[0.98] transition-transform"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </Link>
            <div className="min-w-0">
              <p className="text-base font-bold tracking-tight text-slate-950 truncate">
                Innova Track · Chofer
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            {context.activeViaje ? (
              <span className="font-mono text-xs font-bold text-slate-900 tabular-nums">
                {activeVehiculo?.placa} · {stopsProgress.completed}/{stopsProgress.total}
              </span>
            ) : (
              <span className="text-xs font-semibold text-slate-600 truncate max-w-[140px] block">
                {context.empresa.nombre}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-4 pb-24 space-y-4">
        {/* Alertas de estado de alto contraste */}
        {errorMsg && (
          <div
            role="alert"
            className="bg-red-50 border border-red-400 rounded-xl p-4 text-sm font-semibold text-red-900 flex items-start justify-between gap-3"
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
            className="bg-emerald-50 border border-emerald-400 rounded-xl p-3.5 text-sm font-semibold text-emerald-950 flex items-center justify-between gap-3"
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

        <AnimatePresence mode="wait">
          {/* VISTA 4: RESUMEN INSTANTÁNEO DE CIERRE */}
          {closedSummary ? (
            <motion.section
              key="view-summary"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: TRANSITION_EASE }}
              className="space-y-4"
            >
              <div className="bg-white border border-slate-300 rounded-2xl p-5 space-y-5">
                <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                      Ruta finalizada
                    </p>
                    <h1 className="text-xl font-bold text-slate-950 mt-0.5">
                      {closedSummary.ruta_nombre}
                    </h1>
                    <p className="text-sm font-medium text-slate-600 mt-0.5">
                      Chofer: {closedSummary.chofer_nombre}
                    </p>
                  </div>
                  <CheckCircle2 className="w-8 h-8 text-emerald-700 shrink-0" aria-hidden="true" />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50">
                    <p className="text-xs font-semibold text-slate-600">Km recorridos</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-slate-950 mt-1">
                      {closedSummary.km_recorridos} km
                    </p>
                    <p className="text-xs font-mono tabular-nums text-slate-600 mt-0.5">
                      Plan: {closedSummary.km_planificados} km
                    </p>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50">
                    <p className="text-xs font-semibold text-slate-600">Entregas a tiempo</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-slate-950 mt-1">
                      {closedSummary.entregas_a_tiempo}/{closedSummary.total_paradas}
                    </p>
                    <p className="text-xs font-medium text-slate-600 mt-0.5">
                      Completadas: {closedSummary.paradas_completadas}
                    </p>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50">
                    <p className="text-xs font-semibold text-slate-600">Carga entregada</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-emerald-800 mt-1">
                      {formatInt(closedSummary.carga_entregada)}
                    </p>
                    <p className="text-xs font-mono tabular-nums text-slate-600 mt-0.5">
                      Rechazada: {formatInt(closedSummary.carga_rechazada)}
                    </p>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50">
                    <p className="text-xs font-semibold text-slate-600">Gastos en ruta</p>
                    <p className="text-xl font-bold font-mono tabular-nums text-slate-950 mt-1">
                      {formatColones(closedSummary.total_gastos_colones)}
                    </p>
                    <p className="text-xs font-mono tabular-nums text-slate-600 mt-0.5">
                      Combustible: {closedSummary.total_litros_combustible} L
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={resetToNewRoute}
                  className="w-full h-14 rounded-xl bg-slate-950 text-white text-base font-bold flex items-center justify-center gap-2 hover:bg-slate-800 active:scale-[0.98] transition-all duration-150"
                >
                  <Route className="w-5 h-5" aria-hidden="true" />
                  <span>Preparar Nueva Ruta</span>
                </button>
              </div>
            </motion.section>
          ) : !context.activeViaje ? (
            /* VISTA 1: INICIO DE RUTA */
            <motion.section
              key="view-start"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: TRANSITION_EASE }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-4"
            >
              <div className="lg:col-span-7 bg-white border border-slate-300 rounded-2xl p-5 space-y-5">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
                  <div>
                    <h1 className="text-lg font-bold text-slate-950">Inicio de Ruta</h1>
                    <p className="text-xs font-medium text-slate-600">
                      Selecciona unidad, tramo y registra odómetro de salida
                    </p>
                  </div>
                  <Truck className="w-6 h-6 text-slate-800 shrink-0" aria-hidden="true" />
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="chofer-select"
                      className="text-sm font-bold text-slate-900 block"
                    >
                      Chofer responsable
                    </label>
                    <select
                      id="chofer-select"
                      value={choferNombre}
                      onChange={(e) => setChoferNombre(e.target.value)}
                      className="w-full h-12 px-3 rounded-xl border border-slate-300 bg-white text-base font-medium text-slate-950 focus:outline-none focus:border-blue-700"
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
                        className="text-sm font-bold text-slate-900 block"
                      >
                        Vehículo asignado
                      </label>
                      <select
                        id="vehiculo-select"
                        value={vehiculoId}
                        onChange={(e) => setVehiculoId(e.target.value)}
                        className="w-full h-12 px-3 rounded-xl border border-slate-300 bg-white text-base font-medium text-slate-950 focus:outline-none focus:border-blue-700"
                      >
                        {context.vehiculos.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.placa} · {v.modelo}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="tramo-select"
                        className="text-sm font-bold text-slate-900 block"
                      >
                        Ruta / Tramo
                      </label>
                      <select
                        id="tramo-select"
                        value={tramoId}
                        onChange={(e) => setTramoId(e.target.value)}
                        className="w-full h-12 px-3 rounded-xl border border-slate-300 bg-white text-base font-medium text-slate-950 focus:outline-none focus:border-blue-700"
                      >
                        {context.tramos.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.ruta_nombre} ({t.distancia_planificada_km} km)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="odo-inicio"
                      className="text-sm font-bold text-slate-900 block"
                    >
                      Odómetro inicial (km)
                    </label>
                    <div className="relative">
                      <Gauge
                        className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        id="odo-inicio"
                        type="number"
                        inputMode="numeric"
                        value={odometroInicio}
                        onChange={(e) => setOdometroInicio(e.target.value)}
                        className="w-full h-14 pl-11 pr-4 rounded-xl border border-slate-300 bg-white text-xl font-bold font-mono tabular-nums text-slate-950 focus:outline-none focus:border-blue-700"
                      />
                    </div>
                  </div>

                  {/* Foto obligatoria del odómetro */}
                  <div className="space-y-2">
                    <span className="text-sm font-bold text-slate-900 block">
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
                      className="w-full h-14 rounded-xl border border-slate-400 bg-slate-50 text-slate-950 font-bold text-base flex items-center justify-center gap-2.5 hover:bg-slate-100 active:scale-[0.98] transition-all duration-150"
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
                      <div className="border border-emerald-400 rounded-xl overflow-hidden bg-slate-50">
                        <img
                          src={fotoOdoInicioUrl}
                          alt="Odómetro inicial capturado"
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedImgs((prev) => ({ ...prev, 'odo-start': true }))
                          }
                          className="w-full h-36 object-cover"
                        />
                        <p className="px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 border-t border-emerald-200">
                          Evidencia cargada en bucket evidencias
                        </p>
                      </div>
                    )}
                  </div>

                  {/* GPS de salida */}
                  <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <MapPin className="w-5 h-5 text-blue-700 shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800">
                          Ubicación GPS de salida
                        </p>
                        <p className="text-xs font-mono tabular-nums text-slate-600">
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
                      className="min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800 active:scale-[0.98]"
                    >
                      Actualizar
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isBusy || uploadingOdoInicio}
                  onClick={handleStartRoute}
                  className="w-full h-14 rounded-xl bg-blue-700 text-white text-base font-bold flex items-center justify-center gap-2 hover:bg-blue-800 disabled:opacity-60 active:scale-[0.98] transition-all duration-150"
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
              <div className="lg:col-span-5 bg-white border border-slate-300 rounded-2xl p-5 space-y-4 self-start">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
                  <div>
                    <h2 className="text-base font-bold text-slate-950">
                      Pedidos confirmados en ruta
                    </h2>
                    <p className="text-xs font-medium text-slate-600">
                      Sincronizados desde el Copiloto de Pedidos
                    </p>
                  </div>
                  <span className="font-mono text-sm font-bold tabular-nums text-blue-800">
                    {selectedTramoOrders.length} paradas
                  </span>
                </div>

                {selectedTramoOrders.length === 0 ? (
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700 space-y-2">
                    <p className="font-semibold text-slate-900">
                      Sin pedidos pendientes de Fase 2 en esta zona.
                    </p>
                    <p className="text-xs text-slate-600">
                      Al iniciar ruta se asignarán automáticamente paradas de clientes del tramo o puedes crear un pedido en el Copiloto.
                    </p>
                    <Link
                      href="/pedidos/nuevo"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:underline pt-1"
                    >
                      <span>Ir al Copiloto de Pedidos</span>
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {selectedTramoOrders.map(({ pedido, cliente }, i) => {
                      const totalUnits = pedido.items_json.reduce((a, it) => a + it.cantidad, 0);
                      const unitLabel = pedido.items_json[0]?.unidad ?? 'unidades';
                      return (
                        <div key={pedido.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-slate-950 truncate">
                              0{i + 1}. {cliente.nombre}
                            </p>
                            <span className="font-mono text-xs font-bold text-slate-700 shrink-0">
                              {pedido.codigo_tracking}
                            </span>
                          </div>
                          <p className="text-xs font-mono tabular-nums text-slate-600">
                            Ventana {cliente.ventana_inicio.slice(0, 5)}–{cliente.ventana_fin.slice(0, 5)} ·{' '}
                            {totalUnits} {unitLabel} · {formatColones(pedido.total)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.section>
          ) : activeTab === 'paradas' ? (
            /* VISTA 2 & 3: LISTA DE PARADAS + REGISTRO DE ENTREGA */
            <motion.section
              key="view-stops"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: TRANSITION_EASE }}
              className="space-y-4"
            >
              {/* Resumen compacto de ruta en curso */}
              <div className="bg-white border border-slate-300 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-blue-800 uppercase tracking-wider">
                    Ruta en curso
                  </p>
                  <h1 className="text-lg font-bold text-slate-950">
                    {context.activeViaje.ruta_nombre}
                  </h1>
                  <p className="text-xs font-medium text-slate-600">
                    {context.activeViaje.chofer_nombre} · Salida{' '}
                    <span className="font-mono tabular-nums">
                      {formatInt(context.activeViaje.odometro_inicio)} km
                    </span>
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-2xl font-bold font-mono tabular-nums text-slate-950">
                    {stopsProgress.completed}/{stopsProgress.total}
                  </p>
                  <p className="text-xs font-semibold text-slate-600">Paradas listas</p>
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
                      className={`bg-white border rounded-2xl p-4 sm:p-5 space-y-4 ${
                        isDone
                          ? 'border-emerald-400'
                          : isEnSitio
                            ? 'border-blue-700'
                            : 'border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-bold text-slate-900">
                              #{String(entrega.orden).padStart(2, '0')}
                            </span>
                            <span className="font-mono text-xs font-bold text-blue-800">
                              {pedido.codigo_tracking}
                            </span>
                            <span
                              className={`text-xs font-bold ${
                                entrega.estado === 'entregado'
                                  ? 'text-emerald-800'
                                  : entrega.estado === 'rechazado' ||
                                      entrega.estado === 'rechazo_parcial'
                                    ? 'text-red-700'
                                    : isEnSitio
                                      ? 'text-blue-800'
                                      : 'text-slate-600'
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

                          <h2 className="text-lg font-bold text-slate-950 leading-snug">
                            {cliente.nombre}
                          </h2>
                          <p className="text-sm font-medium text-slate-700 font-mono tabular-nums">
                            Ventana {cliente.ventana_inicio.slice(0, 5)}–{cliente.ventana_fin.slice(0, 5)} ·{' '}
                            {cliente.zona} · Tel {cliente.telefono}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-lg font-bold font-mono tabular-nums text-slate-950">
                            {expectedUnits} {entrega.unidad_medida}
                          </p>
                          <p className="text-xs font-mono tabular-nums text-slate-600">
                            {formatColones(pedido.total)}
                          </p>
                        </div>
                      </div>

                      {/* Desglose de carga */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
                        {pedido.items_json.map((it, idx) => (
                          <div
                            key={`${it.sku}-${idx}`}
                            className="flex items-center justify-between gap-2 text-sm"
                          >
                            <span className="font-semibold text-slate-900 truncate">
                              {it.nombre}
                            </span>
                            <span className="font-mono font-bold tabular-nums text-slate-800 shrink-0">
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
                          className="w-full h-14 rounded-xl bg-slate-950 text-white text-base font-bold flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-60 active:scale-[0.98] transition-all duration-150"
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
                        <div className="pt-3 border-t border-slate-200 space-y-4">
                          {/* Selector rápido 1 toque: Entrega completa vs Rechazo */}
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setDeliveryMode('completa');
                                setCantEntregada(expectedUnits);
                                setCantRechazada(0);
                              }}
                              className={`h-14 px-2.5 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all duration-150 ${
                                deliveryMode === 'completa'
                                  ? 'bg-emerald-700 border-emerald-700 text-white'
                                  : 'bg-white border-slate-300 text-slate-800'
                              }`}
                            >
                              <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                              <span>Entrega completa</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeliveryMode('rechazo');
                                setCantEntregada(Math.max(0, expectedUnits - 1));
                                setCantRechazada(1);
                              }}
                              className={`h-14 px-2.5 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all duration-150 ${
                                deliveryMode === 'rechazo'
                                  ? 'bg-red-700 border-red-700 text-white'
                                  : 'bg-white border-slate-300 text-slate-800'
                              }`}
                            >
                              <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                              <span>Con rechazo</span>
                            </button>
                          </div>

                          {deliveryMode === 'rechazo' && (
                            <div className="bg-red-50/70 border border-red-200 rounded-xl p-4 space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label
                                    htmlFor={`entregado-${entrega.id}`}
                                    className="text-xs font-bold text-slate-800 block"
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
                                    className="w-full h-12 px-3 rounded-lg border border-slate-300 bg-white text-base font-bold font-mono tabular-nums text-slate-950"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label
                                    htmlFor={`rechazado-${entrega.id}`}
                                    className="text-xs font-bold text-red-900 block"
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
                                    className="w-full h-12 px-3 rounded-lg border border-red-300 bg-white text-base font-bold font-mono tabular-nums text-red-900"
                                  />
                                </div>
                              </div>

                              <div className="space-y-1">
                                <label
                                  htmlFor={`motivo-${entrega.id}`}
                                  className="text-xs font-bold text-red-900 block"
                                >
                                  Motivo del rechazo
                                </label>
                                <select
                                  id={`motivo-${entrega.id}`}
                                  value={motivoRechazo}
                                  onChange={(e) => setMotivoRechazo(e.target.value)}
                                  className="w-full h-12 px-3 rounded-lg border border-red-300 bg-white text-sm font-bold text-slate-950"
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
                                onClick={() => setProofMethod('firma')}
                                className={`h-12 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all ${
                                  proofMethod === 'firma'
                                    ? 'bg-slate-950 border-slate-950 text-white'
                                    : 'bg-white border-slate-300 text-slate-800'
                                }`}
                              >
                                <PenTool className="w-4 h-4" aria-hidden="true" />
                                <span>Firma digital</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setProofMethod('foto')}
                                className={`h-12 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all ${
                                  proofMethod === 'foto'
                                    ? 'bg-slate-950 border-slate-950 text-white'
                                    : 'bg-white border-slate-300 text-slate-800'
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
                                  className="w-full h-14 rounded-xl border border-slate-400 bg-slate-50 text-slate-950 text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98]"
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
                                    className="w-full h-36 object-cover rounded-xl border border-slate-300"
                                  />
                                )}
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            disabled={isBusy || uploadingStopPhoto}
                            onClick={() => void handleConfirmDelivery(stop)}
                            className="w-full h-14 rounded-xl bg-emerald-700 text-white text-base font-bold flex items-center justify-center gap-2 hover:bg-emerald-800 disabled:opacity-60 active:scale-[0.98] transition-all duration-150"
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
                        <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3 text-xs">
                          <div className="space-y-0.5">
                            <p className="font-bold text-slate-900 font-mono tabular-nums">
                              Entregado: {entrega.cantidad_entregada} {entrega.unidad_medida}
                              {entrega.cantidad_rechazada > 0
                                ? ` · Rechazado: ${entrega.cantidad_rechazada} (${entrega.motivo_rechazo})`
                                : ''}
                            </p>
                            <p className="text-slate-600">
                              Sincronizado con tracking público
                            </p>
                          </div>
                          <Link
                            href={`/tracking/${pedido.codigo_tracking}`}
                            className="min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white font-bold text-blue-800 inline-flex items-center gap-1.5 shrink-0 active:scale-[0.98]"
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
            </motion.section>
          ) : (
            /* VISTA 4: GASTOS Y CIERRE DE RUTA */
            <motion.section
              key="view-close"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: TRANSITION_EASE }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-4"
            >
              {/* Registro de Combustible y Peajes */}
              <div className="bg-white border border-slate-300 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Gastos en Ruta</h2>
                    <p className="text-xs font-medium text-slate-600">
                      Combustible en litros, peajes y foto de factura
                    </p>
                  </div>
                  <Fuel className="w-6 h-6 text-slate-800 shrink-0" aria-hidden="true" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExpenseType('combustible')}
                    className={`h-14 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all ${
                      expenseType === 'combustible'
                        ? 'bg-slate-950 border-slate-950 text-white'
                        : 'bg-white border-slate-300 text-slate-800'
                    }`}
                  >
                    <Fuel className="w-5 h-5" aria-hidden="true" />
                    <span>Combustible</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpenseType('peaje')}
                    className={`h-14 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all ${
                      expenseType === 'peaje'
                        ? 'bg-slate-950 border-slate-950 text-white'
                        : 'bg-white border-slate-300 text-slate-800'
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
                        className="text-sm font-bold text-slate-900 block"
                      >
                        Litros cargados
                      </label>
                      <input
                        id="gasto-litros"
                        type="number"
                        inputMode="decimal"
                        value={expenseLitros}
                        onChange={(e) => setExpenseLitros(e.target.value)}
                        className="w-full h-12 px-3 rounded-xl border border-slate-300 bg-white text-lg font-bold font-mono tabular-nums text-slate-950"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <label
                      htmlFor="gasto-monto"
                      className="text-sm font-bold text-slate-900 block"
                    >
                      Monto en colones (₡)
                    </label>
                    <input
                      id="gasto-monto"
                      type="number"
                      inputMode="numeric"
                      value={expenseMonto}
                      onChange={(e) => setExpenseMonto(e.target.value)}
                      className="w-full h-12 px-3 rounded-xl border border-slate-300 bg-white text-lg font-bold font-mono tabular-nums text-slate-950"
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
                  className="w-full h-12 rounded-xl border border-slate-300 bg-slate-50 text-sm font-bold text-slate-900 flex items-center justify-center gap-2 active:scale-[0.98]"
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
                  className="w-full h-14 rounded-xl bg-slate-900 text-white text-base font-bold flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-60 active:scale-[0.98] transition-all"
                >
                  <span>Registrar Gasto</span>
                </button>

                {context.activeGastos.length > 0 && (
                  <div className="pt-3 border-t border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span>Comprobantes registrados</span>
                      <span className="font-mono tabular-nums">
                        Total: {formatColones(totalGastosViaje)}
                      </span>
                    </div>
                    <div className="divide-y divide-slate-200">
                      {context.activeGastos.map((g) => (
                        <div
                          key={g.id}
                          className="py-2 flex items-center justify-between text-sm"
                        >
                          <span className="font-semibold text-slate-800 capitalize">
                            {g.tipo}
                            {g.litros ? ` (${g.litros} L)` : ''}
                          </span>
                          <span className="font-mono font-bold tabular-nums text-slate-950">
                            {formatColones(g.monto_colones)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Cierre de Ruta y Odómetro Final */}
              <div className="bg-white border border-slate-300 rounded-2xl p-5 space-y-4 self-start">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Cierre de Ruta</h2>
                    <p className="text-xs font-medium text-slate-600 font-mono tabular-nums">
                      Odómetro inicial: {formatInt(context.activeViaje.odometro_inicio)} km
                    </p>
                  </div>
                  <ClipboardCheck className="w-6 h-6 text-slate-800 shrink-0" aria-hidden="true" />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="odo-fin"
                    className="text-sm font-bold text-slate-900 block"
                  >
                    Odómetro final (km)
                  </label>
                  <input
                    id="odo-fin"
                    type="number"
                    inputMode="numeric"
                    value={odometroFin}
                    onChange={(e) => setOdometroFin(e.target.value)}
                    className="w-full h-14 px-4 rounded-xl border border-slate-300 bg-white text-xl font-bold font-mono tabular-nums text-slate-950"
                  />
                </div>

                <div className="space-y-2">
                  <span className="text-sm font-bold text-slate-900 block">
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
                    className="w-full h-14 rounded-xl border border-slate-400 bg-slate-50 text-slate-950 text-base font-bold flex items-center justify-center gap-2 active:scale-[0.98]"
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
                    <div className="border border-emerald-400 rounded-xl overflow-hidden bg-slate-50">
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
                  className="w-full h-14 rounded-xl bg-blue-700 text-white text-base font-bold flex items-center justify-center gap-2 hover:bg-blue-800 disabled:opacity-60 active:scale-[0.98] transition-all duration-150"
                >
                  {isBusy ? (
                    <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                  )}
                  <span>Cerrar Ruta</span>
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Tab Bar (56px, visible solo cuando hay una ruta activa) */}
      {context.activeViaje && !closedSummary && (
        <nav
          aria-label="Navegación de ruta activa"
          className="fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 backdrop-blur-md border-t border-slate-300"
        >
          <div className="max-w-4xl mx-auto h-full grid grid-cols-2">
            <button
              type="button"
              onClick={() => setActiveTab('paradas')}
              className={`flex items-center justify-center gap-2 text-sm font-bold transition-colors ${
                activeTab === 'paradas' ? 'text-blue-700 bg-blue-50/60' : 'text-slate-600'
              }`}
            >
              <Package className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>
                Paradas ({stopsProgress.completed}/{stopsProgress.total})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('cierre')}
              className={`flex items-center justify-center gap-2 text-sm font-bold border-l border-slate-200 transition-colors ${
                activeTab === 'cierre' ? 'text-blue-700 bg-blue-50/60' : 'text-slate-600'
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
