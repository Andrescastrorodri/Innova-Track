'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUp,
  Check,
  CloudUpload,
  Copy,
  ExternalLink,
  FileText,
  Paperclip,
  Loader2,
  Mic,
  Plus,
  Receipt,
  Route,
  Sparkles,
  Square,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { TableScroll } from '@/components/TableScroll';
import { CompanySwitcher } from '@/components/CompanySwitcher';
import { WorkspaceShell } from '@/components/WorkspaceShell';
import { formatColones, formatInt } from '@/lib/seed-data';
import { calculateOrderTotals, type ClienteDetectado, type MatchedPedidoItem } from '@/lib/order-matching';
import type { CourierQuoteResult, FleetRouteSuggestion, HaciendaInvoiceResult } from '@/lib/integrations';
import type {
  Cliente,
  EmpresaConfig,
  Pedido,
  ProductoInventario,
  UnidadMedida,
} from '@/lib/types';

interface OrderCopilotProps {
  initialEmpresas: EmpresaConfig[];
  initialEmpresa: EmpresaConfig;
  initialClientes: Cliente[];
  initialInventario: ProductoInventario[];
}

type StepNumber = 1 | 2 | 3 | 4;

const STEP_LABELS: Array<{ step: StepNumber; title: string }> = [
  { step: 1, title: 'Captura' },
  { step: 2, title: 'Validación' },
  { step: 3, title: 'Facturación' },
  { step: 4, title: 'Despacho' },
];

const UNIDADES: UnidadMedida[] = ['unidades', 'cajas', 'bultos', 'kg'];

export function OrderCopilot({
  initialEmpresas,
  initialEmpresa,
  initialClientes,
  initialInventario,
}: OrderCopilotProps) {
  const [empresas] = useState<EmpresaConfig[]>(initialEmpresas);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string>(initialEmpresa.id);
  const [clientes, setClientes] = useState<Cliente[]>(initialClientes);
  const [inventario, setInventario] = useState<ProductoInventario[]>(initialInventario);

  const [step, setStep] = useState<StepNumber>(1);
  const previousStep = useRef(step);
  const stepHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (step !== previousStep.current) stepHeading.current?.focus();
    previousStep.current = step;
  }, [step]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Paso 1: Ingesta
  const [rawText, setRawText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Paso 2: Confirmación de pedido
  const [motorIa, setMotorIa] = useState<string>('');
  const [origenInput, setOrigenInput] = useState<'texto' | 'imagen_ocr' | 'pdf' | 'audio'>('texto');
  const [clienteDetectado, setClienteDetectado] = useState<ClienteDetectado | null>(null);
  const [esClienteNuevo, setEsClienteNuevo] = useState(false);
  const [items, setItems] = useState<MatchedPedidoItem[]>([]);
  const [sugerenciaLogistica, setSugerenciaLogistica] = useState('');
  const [skuToAdd, setSkuToAdd] = useState('');

  // Paso 3 & 4: Pedido creado, factura, despacho y tracking
  const [createdPedido, setCreatedPedido] = useState<Pedido | null>(null);
  const [invoiceResult, setInvoiceResult] = useState<HaciendaInvoiceResult | null>(null);
  const [selectedCourier, setSelectedCourier] = useState<string>('Moovin CR');
  const [courierQuote, setCourierQuote] = useState<CourierQuoteResult | null>(null);
  const [fleetSuggestion, setFleetSuggestion] = useState<FleetRouteSuggestion | null>(null);
  const [dispatchedDone, setDispatchedDone] = useState(false);
  const [copiedTracking, setCopiedTracking] = useState(false);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);

  const activeEmpresa = useMemo(
    () => empresas.find((e) => e.id === selectedEmpresaId) ?? empresas[0],
    [empresas, selectedEmpresaId]
  );

  const empresaCatalog = useMemo(
    () => inventario.filter((p) => p.empresa_id === activeEmpresa.id),
    [inventario, activeEmpresa.id]
  );

  const totals = useMemo(() => calculateOrderTotals(items), [items]);

  const refreshContext = useCallback(async (empId: string) => {
    try {
      const res = await fetch(`/api/pedidos?empresa_id=${encodeURIComponent(empId)}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        clientes: Cliente[];
        inventario: ProductoInventario[];
      };
      setClientes(data.clientes);
      setInventario(data.inventario);
    } catch {
      // Retain existing state if network fails
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function handleSelectEmpresa(empId: string) {
    setSelectedEmpresaId(empId);
    setErrorMsg(null);
    if (step > 1) {
      resetCopilot();
    }
    void refreshContext(empId);
  }

  function resetCopilot() {
    setStep(1);
    setErrorMsg(null);
    setRawText('');
    setSelectedFile(null);
    setClienteDetectado(null);
    setItems([]);
    setCreatedPedido(null);
    setInvoiceResult(null);
    setCourierQuote(null);
    setFleetSuggestion(null);
    setDispatchedDone(false);
  }

  function loadSample(type: 'distribuidora' | 'pyme') {
    setErrorMsg(null);
    setSelectedFile(null);
    if (type === 'distribuidora') {
      const distEmpresa = empresas.find((e) => e.tipo_operacion === 'distribuidora_flotilla');
      if (distEmpresa) setSelectedEmpresaId(distEmpresa.id);
      setRawText(
        'Hola equipo, habla don Luis de Supermercado San Pedro Plaza. Por favor despachar para hoy:\n- 8 cajas de Aceite Vegetal 1L\n- 6 bultos de Arroz Grano Entero 25kg\n- 4 cajas de Leche UHT Entera\nFavor facturar al correo de siempre.'
      );
    } else {
      const pymeEmpresa = empresas.find((e) => e.tipo_operacion === 'pyme_tercerizada');
      if (pymeEmpresa) setSelectedEmpresaId(pymeEmpresa.id);
      setRawText(
        'Buenas tardes, pedido para Farmacia Pozos Medical (Zona Oeste):\n- 12 unidades de Gasa Estéril Hospitalaria (MED-305)\n- 3 cajas de Salsa Tomate Foodservice (ALI-405)\nEnviar por mensajería express hoy.'
      );
    }
  }

  async function toggleAudioRecording() {
    setErrorMsg(null);
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setErrorMsg('Tu navegador no soporta grabación de audio directa; puedes subir un archivo .mp3, .wav u .ogg.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const audioFile = new File([blob], `nota-voz-${Date.now()}.webm`, {
          type: blob.type || 'audio/webm',
        });
        setSelectedFile(audioFile);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingSeconds(0);
      setIsRecording(true);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      setErrorMsg('No se pudo acceder al micrófono. Verifica los permisos o adjunta un archivo de audio.');
    }
  }

  async function handleProcessIngestion() {
    setErrorMsg(null);
    if (!rawText.trim() && !selectedFile) {
      setErrorMsg('Ingresa texto del pedido o adjunta una foto, PDF o nota de voz.');
      return;
    }

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('empresa_id', activeEmpresa.id);
      if (rawText.trim()) formData.append('texto', rawText.trim());
      if (selectedFile) formData.append('archivo', selectedFile);

      let inferredOrigen: 'texto' | 'imagen_ocr' | 'pdf' | 'audio' = 'texto';
      if (selectedFile) {
        if (selectedFile.type.startsWith('image/')) inferredOrigen = 'imagen_ocr';
        else if (selectedFile.type === 'application/pdf' || selectedFile.name.endsWith('.pdf')) {
          inferredOrigen = 'pdf';
        } else if (selectedFile.type.startsWith('audio/')) {
          inferredOrigen = 'audio';
        }
      }
      setOrigenInput(inferredOrigen);

      const res = await fetch('/api/ia/procesar-pedido', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo estructurar el pedido.');
      }

      setClienteDetectado(data.cliente_detectado);
      setEsClienteNuevo(Boolean(data.es_cliente_nuevo));
      setItems(data.items ?? []);
      setSugerenciaLogistica(data.sugerencia_logistica || '');
      setMotorIa(data.motor_ia || 'ia');
      if (data.texto_extraido && !rawText.trim()) {
        setRawText(data.texto_extraido);
      }
      setStep(2);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error procesando ingesta.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleUpdateItemQuantity(index: number, nextQty: number) {
    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const cantidad = Math.max(1, Number.isFinite(nextQty) ? nextQty : 1);
        return {
          ...item,
          cantidad,
          disponible_en_inventario: item.stock_actual >= cantidad,
        };
      })
    );
  }

  function handleUpdateItemUnit(index: number, unidad: UnidadMedida) {
    setItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, unidad } : item))
    );
  }

  function handleRemoveItem(index: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  }

  function handleAddCatalogItem() {
    if (!skuToAdd) return;
    const prod = empresaCatalog.find((p) => p.sku === skuToAdd);
    if (!prod) return;

    setItems((prev) => {
      const existingIdx = prev.findIndex((i) => i.sku === prod.sku);
      if (existingIdx >= 0) {
        return prev.map((it, idx) =>
          idx === existingIdx
            ? {
                ...it,
                cantidad: it.cantidad + 1,
                disponible_en_inventario: it.stock_actual >= it.cantidad + 1,
              }
            : it
        );
      }
      return [
        ...prev,
        {
          sku: prod.sku,
          nombre: prod.nombre,
          cantidad: 1,
          unidad: prod.unidad_medida,
          precio_unitario: prod.precio_unitario,
          stock_actual: prod.stock_actual,
          disponible_en_inventario: prod.stock_actual >= 1,
        },
      ];
    });
    setSkuToAdd('');
  }

  async function handleConfirmOrderAndReserveStock() {
    if (!clienteDetectado) return;
    if (items.length === 0) {
      setErrorMsg('Agrega al menos un producto antes de confirmar el pedido.');
      return;
    }

    setErrorMsg(null);
    setIsLoading(true);
    try {
      const modalidad =
        activeEmpresa.tipo_operacion === 'pyme_tercerizada'
          ? 'proveedor_externo'
          : 'flotilla_propia';

      const orderRes = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: activeEmpresa.id,
          cliente: clienteDetectado,
          origen_input: origenInput,
          items: items.map((it) => ({
            sku: it.sku,
            nombre: it.nombre,
            cantidad: it.cantidad,
            unidad: it.unidad,
            precio: it.precio_unitario,
          })),
          subtotal: totals.subtotal,
          iva: totals.iva,
          total: totals.total_estimado,
          modalidad_envio: modalidad,
        }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        throw new Error(orderData.error || 'No se pudo guardar el pedido.');
      }

      const invRes = await fetch('/api/integraciones/inventario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: activeEmpresa.id,
          codigo_tracking: orderData.pedido.codigo_tracking,
          items: items.map((it) => ({ sku: it.sku, cantidad: it.cantidad })),
        }),
      });

      if (!invRes.ok) {
        const invErr = await invRes.json();
        throw new Error(invErr.error || 'Error al reservar inventario en ERP.');
      }

      setCreatedPedido(orderData.pedido);
      await refreshContext(activeEmpresa.id);
      setStep(3);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error confirmando pedido.');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDispatchPreview(pedido: Pedido, courierOverride?: string) {
    const modalidad =
      activeEmpresa.tipo_operacion === 'pyme_tercerizada'
        ? 'proveedor_externo'
        : 'flotilla_propia';

    const res = await fetch('/api/integraciones/despacho', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pedido_id: pedido.id,
        codigo_tracking: pedido.codigo_tracking,
        empresa_id: activeEmpresa.id,
        modalidad_envio: modalidad,
        proveedor_externo_nombre: courierOverride ?? selectedCourier,
        action: 'cotizar',
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.cotizacion) setCourierQuote(data.cotizacion);
      if (data.asignacion_flotilla) setFleetSuggestion(data.asignacion_flotilla);
    }
  }

  async function handleInvoiceStep(omitir: boolean) {
    if (!createdPedido || !clienteDetectado) return;
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/integraciones/facturar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pedido_id: createdPedido.id,
          omitir,
          cliente_nombre: clienteDetectado.nombre,
          cliente_cedula: clienteDetectado.cedula_juridica,
          cliente_correo: clienteDetectado.correo_facturacion,
          subtotal: totals.subtotal,
          iva: totals.iva,
          total: totals.total_estimado,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error en facturación electrónica.');
      }

      if (data.pedido) {
        setCreatedPedido(data.pedido);
      }
      if (!omitir && data.clave_hacienda) {
        setInvoiceResult({
          clave_hacienda: data.clave_hacienda,
          consecutivo: data.consecutivo,
          fecha_emision: data.fecha_emision,
          estado_hacienda: data.estado_hacienda,
          modo_integracion: data.modo_integracion,
        });
      }

      await loadDispatchPreview(data.pedido ?? createdPedido);
      setStep(4);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error en paso de facturación.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConfirmDispatch() {
    if (!createdPedido) return;
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const modalidad =
        activeEmpresa.tipo_operacion === 'pyme_tercerizada'
          ? 'proveedor_externo'
          : 'flotilla_propia';

      const res = await fetch('/api/integraciones/despacho', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pedido_id: createdPedido.id,
          codigo_tracking: createdPedido.codigo_tracking,
          empresa_id: activeEmpresa.id,
          modalidad_envio: modalidad,
          proveedor_externo_nombre: selectedCourier,
          viaje_id: fleetSuggestion?.viaje_id ?? null,
          action: 'despachar',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al coordinar el despacho.');
      }

      if (data.pedido) setCreatedPedido(data.pedido);
      if (data.cotizacion) setCourierQuote(data.cotizacion);
      if (data.asignacion_flotilla) setFleetSuggestion(data.asignacion_flotilla);
      setDispatchedDone(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error confirmando despacho.');
    } finally {
      setIsLoading(false);
    }
  }

  function getTrackingPath(): string {
    return `/tracking/${createdPedido?.codigo_tracking ?? ''}`;
  }

  async function copyTrackingUrl() {
    if (!createdPedido) return;
    const fullUrl = `${window.location.origin}${getTrackingPath()}`;
    await navigator.clipboard.writeText(fullUrl);
    setCopiedTracking(true);
    setTimeout(() => setCopiedTracking(false), 2000);
  }

  async function copyWhatsAppMessage() {
    if (!createdPedido || !clienteDetectado) return;
    const fullUrl = `${window.location.origin}${getTrackingPath()}`;
    const msg = `Hola ${clienteDetectado.nombre}, tu pedido ${createdPedido.codigo_tracking} por ${formatColones(totals.total_estimado)} ha sido coordinado. Sigue el estado en tiempo real aquí: ${fullUrl}`;
    await navigator.clipboard.writeText(msg);
    setCopiedWhatsApp(true);
    setTimeout(() => setCopiedWhatsApp(false), 2000);
  }

  const progress = (
    <ol aria-label="Pasos del copiloto" className="copilot-steps">
      {STEP_LABELS.map((item) => {
        const isCurrent = step === item.step;
        const isDone = step > item.step;
        return (
          <li
            key={item.step}
            aria-current={isCurrent ? 'step' : undefined}
            className="copilot-step"
          >
            <span className="copilot-step-number" aria-hidden="true">
              {isDone ? <Check size={14} className="text-success" /> : item.step}
            </span>
            {item.title}
            {isDone && <span className="sr-only"> (completado)</span>}
          </li>
        );
      })}
    </ol>
  );

  return (
    <WorkspaceShell
      current="/pedidos/nuevo"
      companyName={activeEmpresa.nombre}
      context={
        <CompanySwitcher
          companies={empresas}
          current={activeEmpresa.id}
          onChange={(company) => handleSelectEmpresa(company.id)}
        />
      }
      toolbar={
        <button
          type="button"
          onClick={resetCopilot}
          className="ui-button ui-button-secondary shrink-0"
        >
          Nuevo pedido
        </button>
      }
    >
      <main id="contenido" tabIndex={-1} className={`workspace-content flex-1 ${step === 1 ? 'copilot-canvas' : 'space-y-(--space-stack)'}`}>
        {step !== 1 && (
          <>
            <div className="space-y-1">
              <h1 className="page-title">Copiloto de pedidos</h1>
              <p className="text-sm text-muted">{activeEmpresa.nombre}</p>
            </div>
            {progress}
          </>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="bg-danger-soft border border-danger-line rounded-lg px-4 py-3 text-sm text-danger-strong flex items-center justify-between gap-4"
          >
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="min-h-11 shrink-0 px-2 text-sm font-semibold underline"
            >
              Cerrar
            </button>
          </div>
        )}

        {step === 1 && (
          <section key="step-1" className="copilot-intro" aria-labelledby="copilot-heading">
            <div className="copilot-intro-heading">
              <h1 id="copilot-heading" ref={stepHeading} tabIndex={-1} className="hero-title">
                Captura tu próximo <em>pedido</em>
              </h1>
              <p className="hero-description">
                Pega un mensaje, adjunta un archivo o graba un audio.
                Revisa el pedido antes de confirmarlo.
              </p>
            </div>

            <form
              className="copilot-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!isLoading) void handleProcessIngestion();
              }}
            >
              <div className="command-pill glass-surface">
                <Sparkles className="command-sparkle" size={22} strokeWidth={1.65} aria-hidden="true" />
                <label htmlFor="pedido-texto" className="sr-only">Texto del pedido o instrucciones</label>
                <textarea
                  id="pedido-texto"
                  rows={rawText.includes('\n') ? 4 : 1}
                  value={rawText}
                  onChange={(event) => setRawText(event.target.value)}
                  placeholder="Escribe tu pedido…"
                  className="command-input"
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  aria-label="Procesar con Copiloto IA"
                  className="command-submit"
                >
                  {isLoading
                    ? <Loader2 size={21} className="animate-spin" aria-hidden="true" />
                    : <ArrowUp size={22} strokeWidth={2.1} aria-hidden="true" />}
                </button>
              </div>

              <div className="copilot-status" role="status">
                {isLoading && 'Preparando el pedido…'}
              </div>

              <div
                className="copilot-dropzone"
                data-dragging={isDragging || undefined}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={(event) => {
                  if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
                    setIsDragging(false);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  const file = event.dataTransfer.files[0];
                  if (file) setSelectedFile(file);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf,audio/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) setSelectedFile(file);
                    event.target.value = '';
                  }}
                />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="dropzone-trigger">
                  <span className="dropzone-icon" aria-hidden="true">
                    <CloudUpload size={27} strokeWidth={1.6} />
                  </span>
                  <span className="text-base font-bold text-ink">Arrastra un archivo o selecciónalo</span>
                  <span className="text-sm text-secondary">Imágenes, PDF o audio</span>
                </button>
              </div>

              {selectedFile && (
                <div className="copilot-attachment glass-inset">
                  <Paperclip size={16} strokeWidth={1.7} className="shrink-0 text-accent" aria-hidden="true" />
                  <span className="min-w-0 break-words text-sm font-semibold">{selectedFile.name}</span>
                  <span className="text-xs font-mono tabular-nums text-muted">
                    {Math.max(1, Math.round(selectedFile.size / 1024))} KB
                  </span>
                  <button
                    type="button"
                    className="nav-icon-button"
                    onClick={() => setSelectedFile(null)}
                    aria-label="Quitar archivo"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              )}

              <div className="copilot-tools">
                <button
                  type="button"
                  onClick={toggleAudioRecording}
                  className={`copilot-tool ${isRecording ? 'text-danger' : ''}`}
                >
                  {isRecording ? <Square size={14} aria-hidden="true" /> : <Mic size={15} strokeWidth={1.65} aria-hidden="true" />}
                  {isRecording ? `Detener audio (${recordingSeconds}s)` : 'Grabar audio'}
                </button>
                <button type="button" onClick={() => loadSample('distribuidora')} className="copilot-tool">
                  Ejemplo flotilla
                </button>
                <button type="button" onClick={() => loadSample('pyme')} className="copilot-tool">
                  Ejemplo PyME
                </button>
              </div>
            </form>

            {progress}
            <p className="copilot-context">
              {activeEmpresa.nombre} · {clientes.filter((cliente) => cliente.empresa_id === activeEmpresa.id).length} clientes · {empresaCatalog.length} SKUs
            </p>
          </section>
        )}

        {step === 2 && clienteDetectado && (
          <section
            key="step-2"
            className="space-y-6"
          >
            {/* Tarjeta limpia del cliente detectado */}
            <div className="bg-surface border border-line rounded-lg p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-line">
                <div>
                  <h2 ref={stepHeading} tabIndex={-1} className="section-title">
                    Cliente detectado
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    {esClienteNuevo
                      ? 'Cliente nuevo detectado: verifica cédula y correo de facturación'
                      : 'Coincidencia exacta en maestro de clientes'}
                    {' · '}
                    Motor: <span className="font-mono">{motorIa}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="ui-button ui-button-secondary self-start sm:self-center"
                >
                  Volver a ingesta
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div className="space-y-1">
                  <label htmlFor="cli-nombre" className="text-xs font-medium text-muted block">
                    Razón social / Nombre
                  </label>
                  <input
                    id="cli-nombre"
                    type="text"
                    value={clienteDetectado.nombre}
                    onChange={(e) =>
                      setClienteDetectado({ ...clienteDetectado, nombre: e.target.value })
                    }
                    className="ui-field w-full px-2.5 py-1.5 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="cli-cedula" className="text-xs font-medium text-muted block">
                    Cédula jurídica
                  </label>
                  <input
                    id="cli-cedula"
                    type="text"
                    value={clienteDetectado.cedula_juridica}
                    onChange={(e) =>
                      setClienteDetectado({
                        ...clienteDetectado,
                        cedula_juridica: e.target.value,
                      })
                    }
                    className="ui-field w-full px-2.5 py-1.5 text-sm font-mono tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="cli-correo" className="text-xs font-medium text-muted block">
                    Correo facturación
                  </label>
                  <input
                    id="cli-correo"
                    type="email"
                    value={clienteDetectado.correo_facturacion}
                    onChange={(e) =>
                      setClienteDetectado({
                        ...clienteDetectado,
                        correo_facturacion: e.target.value,
                      })
                    }
                    className="ui-field w-full px-2.5 py-1.5 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="cli-zona" className="text-xs font-medium text-muted block">
                    Zona y ventana horaria
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      id="cli-zona"
                      value={clienteDetectado.zona}
                      onChange={(e) =>
                        setClienteDetectado({ ...clienteDetectado, zona: e.target.value })
                      }
                      className="ui-field px-2.5 py-1.5 text-sm"
                    >
                      <option value="Oeste">Oeste</option>
                      <option value="Este">Este</option>
                      <option value="Norte">Norte</option>
                    </select>
                    <span className="text-xs font-mono tabular-nums text-secondary whitespace-nowrap">
                      {clienteDetectado.ventana_inicio.slice(0, 5)}–{clienteDetectado.ventana_fin.slice(0, 5)}
                    </span>
                  </div>
                </div>
              </div>

              {sugerenciaLogistica && (
                <p className="text-xs text-secondary pt-1">
                  Sugerencia logística: {sugerenciaLogistica}
                </p>
              )}
            </div>

            {/* Tabla editable de productos con validación de stock */}
            <div className="bg-surface border border-line rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="section-title">
                    Líneas del pedido y validación de inventario
                  </h2>
                  <p className="text-xs text-muted">
                    Ajusta cantidades o unidades antes de reservar stock en el ERP.
                  </p>
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <select
                    aria-label="Producto del catálogo"
                    value={skuToAdd}
                    onChange={(e) => setSkuToAdd(e.target.value)}
                    className="ui-field w-full px-2.5 py-1.5 text-sm sm:max-w-[16rem]"
                  >
                    <option value="">Agregar producto al pedido...</option>
                    {empresaCatalog.map((prod) => (
                      <option key={prod.sku} value={prod.sku}>
                        {prod.sku} · {prod.nombre} ({formatColones(prod.precio_unitario)})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddCatalogItem}
                    disabled={!skuToAdd}
                    className="ui-button ui-button-secondary"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Agregar</span>
                  </button>
                </div>
              </div>

              <TableScroll label="Productos y existencias">
                <table role="table" className="order-lines w-full border-collapse text-left text-sm">
                  <thead role="rowgroup">
                    <tr role="row" className="border-b border-line bg-canvas text-xs font-medium text-muted">
                      <th role="columnheader" scope="col" className="py-2.5 px-4">SKU</th>
                      <th role="columnheader" scope="col" className="py-2.5 px-4">Producto</th>
                      <th role="columnheader" scope="col" className="py-2.5 px-4">Cantidad</th>
                      <th role="columnheader" scope="col" className="py-2.5 px-4">Unidad</th>
                      <th role="columnheader" scope="col" className="py-2.5 px-4">Stock ERP</th>
                      <th role="columnheader" scope="col" className="py-2.5 px-4 text-right">Precio</th>
                      <th role="columnheader" scope="col" className="py-2.5 px-4 text-right">Subtotal</th>
                      <th role="columnheader" scope="col" className="py-2.5 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody role="rowgroup" className="divide-y divide-line">
                    {items.map((item, idx) => (
                      <tr role="row" key={`${item.sku}-${idx}`} className="hover:bg-subtle">
                        <td role="cell" data-field="sku" className="py-2.5 px-4 font-mono text-xs text-secondary whitespace-nowrap">
                          {item.sku}
                        </td>
                        <td role="cell" data-field="product" className="py-2.5 px-4 font-medium text-ink md:min-w-[12rem]">
                          {item.nombre}
                        </td>
                        <td role="cell" data-field="quantity" data-label="Cantidad" className="py-2.5 px-4">
                          <input
                            type="number"
                            min={1}
                            value={item.cantidad}
                            aria-label={`Cantidad de ${item.nombre}`}
                            onChange={(e) =>
                              handleUpdateItemQuantity(idx, Number(e.target.value))
                            }
                            className="ui-field w-20 px-2 py-1 text-sm font-mono tabular-nums"
                          />
                        </td>
                        <td role="cell" data-field="unit" data-label="Unidad" className="py-2.5 px-4">
                          <select
                            value={item.unidad}
                            aria-label={`Unidad de ${item.nombre}`}
                            onChange={(e) =>
                              handleUpdateItemUnit(idx, e.target.value as UnidadMedida)
                            }
                            className="ui-field px-2 py-1 text-xs"
                          >
                            {UNIDADES.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td role="cell" data-field="stock" data-label="Stock ERP" className="py-2.5 px-4 text-xs whitespace-nowrap">
                          <span
                            className={`font-medium font-mono tabular-nums ${
                              item.disponible_en_inventario
                                ? 'text-success'
                                : 'text-danger'
                            }`}
                          >
                            {item.disponible_en_inventario
                              ? `Disponible (${formatInt(item.stock_actual)})`
                              : `Stock insuficiente (${formatInt(item.stock_actual)})`}
                          </span>
                        </td>
                        <td role="cell" data-field="price" data-label="Precio" className="py-2.5 px-4 text-right font-mono tabular-nums text-secondary whitespace-nowrap">
                          {formatColones(item.precio_unitario)}
                        </td>
                        <td role="cell" data-field="subtotal" data-label="Subtotal" className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-ink whitespace-nowrap">
                          {formatColones(item.cantidad * item.precio_unitario)}
                        </td>
                        <td role="cell" data-field="remove" className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            aria-label={`Eliminar ${item.nombre}`}
                            onClick={() => handleRemoveItem(idx)}
                            className="inline-grid size-11 place-items-center rounded-md text-muted hover:bg-danger-soft hover:text-danger"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>

              {/* Resumen financiero + CTA */}
              <div className="px-5 py-4 bg-canvas border-t border-line flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-mono tabular-nums">
                  <div>
                    <span className="text-muted text-xs block font-sans">Subtotal</span>
                    <span className="font-medium text-ink">
                      {formatColones(totals.subtotal)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted text-xs block font-sans">IVA (13%)</span>
                    <span className="font-medium text-ink">
                      {formatColones(totals.iva)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted text-xs block font-sans">Total CRC</span>
                    <span className="section-title">
                      {formatColones(totals.total_estimado)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isLoading || items.length === 0}
                  onClick={handleConfirmOrderAndReserveStock}
                  className="ui-button ui-button-primary"
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                  <span>Confirmar Pedido y Reservar Stock</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {step === 3 && createdPedido && clienteDetectado && (
          <section
            key="step-3"
            className="bg-surface border border-line rounded-lg overflow-hidden"
          >
            <div className="px-4 py-5 sm:px-6 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Receipt className="w-4 h-4 text-secondary shrink-0" aria-hidden="true" />
                <div>
                  <h2 ref={stepHeading} tabIndex={-1} className="section-title">
                    ¿Desea emitir factura electrónica ahora?
                  </h2>
                  <p className="text-xs text-muted">
                    Pedido <span className="font-mono font-medium text-secondary">{createdPedido.codigo_tracking}</span> con stock reservado en ERP.
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono text-muted">Hacienda CR v4.3</span>
            </div>

            {/* Preview fiscal exacto */}
            <div className="p-4 sm:p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-line text-sm">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted">Emisor</p>
                  <p className="font-medium text-ink">{activeEmpresa.nombre}</p>
                  <p className="text-xs font-mono text-muted">Cédula Jurídica: 3-101-784512</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted">Receptor</p>
                  <p className="font-medium text-ink">{clienteDetectado.nombre}</p>
                  <p className="text-xs font-mono text-muted">
                    {clienteDetectado.cedula_juridica} · {clienteDetectado.correo_facturacion}
                  </p>
                </div>
              </div>

              <TableScroll label="Detalle de factura">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs font-medium text-muted">
                      <th scope="col" className="py-2 pr-4">Código</th>
                      <th scope="col" className="py-2 pr-4">Descripción</th>
                      <th scope="col" className="py-2 pr-4 text-right">Cantidad</th>
                      <th scope="col" className="py-2 pr-4 text-right">Precio unit.</th>
                      <th scope="col" className="py-2 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {items.map((it, i) => (
                      <tr key={`${it.sku}-${i}`}>
                        <td className="py-2.5 pr-4 font-mono text-xs text-secondary">{it.sku}</td>
                        <td className="py-2.5 pr-4 text-ink">{it.nombre}</td>
                        <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-secondary">
                          {it.cantidad} {it.unidad}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-secondary">
                          {formatColones(it.precio_unitario)}
                        </td>
                        <td className="py-2.5 text-right font-mono tabular-nums font-medium text-ink">
                          {formatColones(it.cantidad * it.precio_unitario)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>

              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-4 border-t border-line">
                <div className="space-y-1 text-sm font-mono tabular-nums">
                  <p className="text-secondary">
                    Subtotal: <span className="text-ink">{formatColones(totals.subtotal)}</span>
                  </p>
                  <p className="text-secondary">
                    IVA 13%: <span className="text-ink">{formatColones(totals.iva)}</span>
                  </p>
                  <p className="section-title">
                    Total a facturar: {formatColones(totals.total_estimado)}
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleInvoiceStep(true)}
                    className="ui-button ui-button-secondary"
                  >
                    Omitir facturación
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleInvoiceStep(false)}
                    className="ui-button ui-button-primary"
                  >
                    {isLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                    <span>Emitir Factura vía API</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {step === 4 && createdPedido && clienteDetectado && (
          <section
            key="step-4"
            className="space-y-6"
          >
            {/* Estado de facturación */}
            {invoiceResult && (
              <div className="bg-surface border border-success-line rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-success-strong">
                    Factura Electrónica emitida · {createdPedido.numero_factura_externa}
                  </p>
                  <p className="text-xs font-mono text-secondary break-all">
                    Clave Hacienda: {invoiceResult.clave_hacienda}
                  </p>
                </div>
                <span className="text-xs font-medium text-success whitespace-nowrap">
                  Aceptado CR
                </span>
              </div>
            )}

            {/* Coordinación de ruta o courier externo */}
            <div className="bg-surface border border-line rounded-lg p-4 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-line">
                <div className="flex items-center gap-2.5">
                  <Truck className="w-4 h-4 text-secondary shrink-0" aria-hidden="true" />
                  <div>
                    <h2 ref={stepHeading} tabIndex={-1} className="section-title">
                      Coordinar despacho
                    </h2>
                    <p className="text-xs text-muted">
                      Código asignado:{' '}
                      <span className="font-mono font-semibold text-ink">
                        {createdPedido.codigo_tracking}
                      </span>
                    </p>
                  </div>
                </div>
                <span className="text-xs font-medium text-secondary">
                  {activeEmpresa.tipo_operacion === 'distribuidora_flotilla'
                    ? 'Flotilla Propia'
                    : 'Proveedor Externo'}
                </span>
              </div>

              {activeEmpresa.tipo_operacion === 'distribuidora_flotilla' && fleetSuggestion && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted">Ruta sugerida</p>
                    <p className="font-medium text-ink mt-0.5">{fleetSuggestion.ruta_nombre}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Unidad y chofer</p>
                    <p className="font-medium text-ink mt-0.5 font-mono">
                      {fleetSuggestion.vehiculo_placa}
                    </p>
                    <p className="text-xs text-secondary">{fleetSuggestion.chofer_nombre}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Ventana de cliente</p>
                    <p className="font-medium text-ink mt-0.5 font-mono tabular-nums">
                      {fleetSuggestion.ventana_cliente}
                    </p>
                    <p className="text-xs text-secondary">Zona {clienteDetectado.zona}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Capacidad de unidad</p>
                    <p className="font-medium text-success mt-0.5">
                      {fleetSuggestion.capacidad_disponible ? 'Capacidad disponible' : 'Requiere ajuste'}
                    </p>
                    <p className="text-xs font-mono tabular-nums text-secondary">
                      Tramo: {fleetSuggestion.distancia_planificada_km} km
                    </p>
                  </div>
                </div>
              )}

              {activeEmpresa.tipo_operacion === 'pyme_tercerizada' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <label htmlFor="courier-select" className="text-xs font-medium text-secondary">
                      Proveedor de mensajería:
                    </label>
                    <select
                      id="courier-select"
                      disabled={dispatchedDone}
                      value={selectedCourier}
                      onChange={(e) => {
                        const next = e.target.value;
                        setSelectedCourier(next);
                        void loadDispatchPreview(createdPedido, next);
                      }}
                      className="ui-field px-3 py-1.5 text-sm"
                    >
                      <option value="Moovin CR">Moovin CR (Mismo Día GAM)</option>
                      <option value="Correos de Costa Rica">Correos de Costa Rica (EMS Nacional)</option>
                      <option value="DHL Express CR">DHL Express CR</option>
                    </select>
                  </div>

                  {courierQuote && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-sm border-t border-line">
                      <div>
                        <p className="text-xs text-muted">Servicio y guía</p>
                        <p className="font-medium text-ink mt-0.5">{courierQuote.servicio}</p>
                        <p className="text-xs font-mono text-secondary">{courierQuote.guia_externa}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted">Tarifa cotizada</p>
                        <p className="font-semibold text-ink mt-0.5 font-mono tabular-nums">
                          {formatColones(courierQuote.tarifa_colones)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted">Tiempo estimado</p>
                        <p className="font-medium text-ink mt-0.5 font-mono tabular-nums">
                          {courierQuote.tiempo_estimado_horas} horas
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!dispatchedDone ? (
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleConfirmDispatch}
                    className="ui-button ui-button-primary"
                  >
                    {isLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                    <span>
                      {activeEmpresa.tipo_operacion === 'distribuidora_flotilla'
                        ? 'Asignar a Ruta y Generar Tracking'
                        : 'Despachar con Courier y Generar Guía'}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="pt-4 border-t border-line space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-success-strong">
                        Despacho confirmado en ruta
                      </p>
                      <p className="mt-0.5 break-all font-mono text-xs text-secondary">
                        Enlace público: {getTrackingPath()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={copyTrackingUrl}
                        className="ui-button ui-button-secondary"
                      >
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        <span aria-live="polite">{copiedTracking ? 'Enlace copiado' : 'Copiar enlace'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={copyWhatsAppMessage}
                        className="ui-button ui-button-secondary"
                      >
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        <span aria-live="polite">{copiedWhatsApp ? 'Mensaje copiado' : 'Copiar para WhatsApp'}</span>
                      </button>
                      <Link
                        href={getTrackingPath()}
                        className="ui-button ui-button-primary"
                      >
                        <span>Abrir Tracking Público</span>
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </WorkspaceShell>
  );
}
