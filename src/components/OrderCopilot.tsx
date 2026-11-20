'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Home,
  Loader2,
  Mic,
  Plus,
  Receipt,
  Route,
  Settings,
  Square,
  Trash2,
  Truck,
  Upload,
} from 'lucide-react';
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
  { step: 1, title: '01. Ingesta Multimodal' },
  { step: 2, title: '02. Pedido e Inventario' },
  { step: 3, title: '03. Facturación CR' },
  { step: 4, title: '04. Despacho y Tracking' },
];

const UNIDADES: UnidadMedida[] = ['unidades', 'cajas', 'bultos', 'kg'];

const TRANSITION_EASE = [0.22, 1, 0.36, 1] as const;

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Sidebar compartida */}
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
          <span className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium bg-slate-900 text-white whitespace-nowrap shrink-0">
            <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Copiloto de Pedidos</span>
          </span>
          <Link
            href="/chofer"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 whitespace-nowrap shrink-0 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
          >
            <Truck className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>App Chofer</span>
          </Link>
          <Link
            href="/gerente"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 whitespace-nowrap shrink-0 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
          >
            <BarChart3 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Tablero Gerencial</span>
          </Link>
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

        <div className="hidden lg:block mt-auto p-4 border-t border-slate-200 text-xs text-slate-500 space-y-1.5">
          <p className="font-medium text-slate-700">Copiloto de Validación Asistida</p>
          <p>
            Estructura texto, imágenes, PDFs y audio, valida stock ERP, factura en Hacienda CR y coordina despacho.
          </p>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-8">
          <div className="min-w-0 flex items-center gap-2 text-sm text-slate-500">
            <Link href="/" className="font-medium text-slate-900 hover:underline whitespace-nowrap">
              Innova Track
            </Link>
            <span aria-hidden="true">/</span>
            <span className="truncate">Nuevo Pedido · Copiloto IA Multimodal</span>
          </div>

          <button
            type="button"
            onClick={resetCopilot}
            className="px-4 py-2 rounded-md text-sm font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]"
          >
            Nuevo pedido
          </button>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-5xl w-full mx-auto space-y-6">
          {/* Toolbar de contexto multi-empresa */}
          <section
            aria-label="Empresa operadora"
            className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div>
              <h1 className="text-lg font-semibold text-slate-900">{activeEmpresa.nombre}</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {activeEmpresa.tipo_operacion === 'distribuidora_flotilla'
                  ? 'Modo Distribuidora: asignación automática a ruta y flotilla propia'
                  : 'Modo PyME: cotización y despacho vía API de courier externo'}
                {' · '}
                <span className="font-mono tabular-nums">{clientes.filter((c) => c.empresa_id === activeEmpresa.id).length}</span> clientes
                {' · '}
                <span className="font-mono tabular-nums">{empresaCatalog.length}</span> SKUs
              </p>
            </div>

            <div
              role="group"
              aria-label="Cambiar empresa"
              className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-md shrink-0"
            >
              {empresas.map((emp) => {
                const selected = emp.id === activeEmpresa.id;
                return (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => handleSelectEmpresa(emp.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] ${
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
          </section>

          {/* Barra de progreso Human-in-the-Loop */}
          <nav aria-label="Pasos del Copiloto" className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {STEP_LABELS.map((item) => {
              const isCurrent = step === item.step;
              const isDone = step > item.step;
              return (
                <div
                  key={item.step}
                  className={`px-3.5 py-2.5 rounded-md border text-xs font-medium flex items-center justify-between gap-2 transition-colors duration-200 ${
                    isCurrent
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : isDone
                        ? 'bg-white border-emerald-200 text-emerald-800'
                        : 'bg-white border-slate-200 text-slate-500'
                  }`}
                >
                  <span className="truncate">{item.title}</span>
                  {isDone && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />}
                </div>
              );
            })}
          </nav>

          {errorMsg && (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 flex items-center justify-between gap-4"
            >
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-xs font-medium underline shrink-0"
              >
                Cerrar
              </button>
            </div>
          )}

          {/* Contenido animado de los 4 pasos */}
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.section
                key="step-1"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: TRANSITION_EASE }}
                className="bg-white border border-slate-200 rounded-lg p-6 space-y-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      Ingreso de pedido en bruto
                    </h2>
                    <p className="text-sm text-slate-500">
                      Pega un mensaje de WhatsApp, arrastra una foto/PDF de orden de compra o graba una nota de voz.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      type="button"
                      onClick={() => loadSample('distribuidora')}
                      className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 whitespace-nowrap transition-all duration-150 active:scale-[0.98]"
                    >
                      Cargar ejemplo Distribuidora
                    </button>
                    <button
                      type="button"
                      onClick={() => loadSample('pyme')}
                      className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 whitespace-nowrap transition-all duration-150 active:scale-[0.98]"
                    >
                      Cargar ejemplo PyME
                    </button>
                  </div>
                </div>

                {/* Zona única de entrada */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) setSelectedFile(file);
                  }}
                  className={`border rounded-lg p-4 space-y-4 transition-colors duration-150 ${
                    isDragging ? 'border-blue-600 bg-blue-50/40' : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <label htmlFor="pedido-texto" className="sr-only">
                    Texto del pedido o instrucciones
                  </label>
                  <textarea
                    id="pedido-texto"
                    rows={5}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Ejemplo: Hola, para Supermercado San Pedro Plaza enviar 6 cajas de Aceite Vegetal 1L y 5 bultos de Arroz 25kg..."
                    className="w-full bg-white border border-slate-200 rounded-md p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 resize-y"
                  />

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,application/pdf,audio/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          setSelectedFile(file);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap transition-all duration-150 active:scale-[0.98]"
                      >
                        <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Subir imagen, PDF o audio</span>
                      </button>

                      <button
                        type="button"
                        onClick={toggleAudioRecording}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border text-xs font-medium whitespace-nowrap transition-all duration-150 active:scale-[0.98] ${
                          isRecording
                            ? 'border-red-300 bg-red-50 text-red-700'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {isRecording ? (
                          <>
                            <Square className="w-3.5 h-3.5" aria-hidden="true" />
                            <span className="font-mono tabular-nums">
                              Detener audio ({recordingSeconds}s)
                            </span>
                          </>
                        ) : (
                          <>
                            <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Grabar nota de voz</span>
                          </>
                        )}
                      </button>
                    </div>

                    {selectedFile && (
                      <div className="flex items-center gap-2 text-xs text-slate-700 bg-white border border-slate-200 rounded-md px-3 py-1.5">
                        <span className="truncate max-w-[220px] font-medium">
                          {selectedFile.name}
                        </span>
                        <span className="text-slate-400 font-mono tabular-nums">
                          {Math.max(1, Math.round(selectedFile.size / 1024))} KB
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedFile(null)}
                          className="text-slate-500 hover:text-red-600 font-medium"
                        >
                          Quitar
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleProcessIngestion}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]"
                  >
                    {isLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                    <span>{isLoading ? 'Estructurando pedido...' : 'Procesar con Copiloto IA'}</span>
                  </button>
                </div>
              </motion.section>
            )}

            {step === 2 && clienteDetectado && (
              <motion.section
                key="step-2"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: TRANSITION_EASE }}
                className="space-y-6"
              >
                {/* Tarjeta limpia del cliente detectado */}
                <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        Cliente detectado
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
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
                      className="text-xs font-medium text-slate-600 hover:text-slate-900 self-start sm:self-center"
                    >
                      Volver a ingesta
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div className="space-y-1">
                      <label htmlFor="cli-nombre" className="text-xs font-medium text-slate-500 block">
                        Razón social / Nombre
                      </label>
                      <input
                        id="cli-nombre"
                        type="text"
                        value={clienteDetectado.nombre}
                        onChange={(e) =>
                          setClienteDetectado({ ...clienteDetectado, nombre: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-sm text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="cli-cedula" className="text-xs font-medium text-slate-500 block">
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
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="cli-correo" className="text-xs font-medium text-slate-500 block">
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
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-sm text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="cli-zona" className="text-xs font-medium text-slate-500 block">
                        Zona y ventana horaria
                      </label>
                      <div className="flex items-center gap-2">
                        <select
                          id="cli-zona"
                          value={clienteDetectado.zona}
                          onChange={(e) =>
                            setClienteDetectado({ ...clienteDetectado, zona: e.target.value })
                          }
                          className="px-2.5 py-1.5 border border-slate-200 rounded text-sm text-slate-900 bg-white focus:outline-none focus:border-blue-600"
                        >
                          <option value="Oeste">Oeste</option>
                          <option value="Este">Este</option>
                          <option value="Norte">Norte</option>
                        </select>
                        <span className="text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {clienteDetectado.ventana_inicio.slice(0, 5)}–{clienteDetectado.ventana_fin.slice(0, 5)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {sugerenciaLogistica && (
                    <p className="text-xs text-slate-600 pt-1">
                      Sugerencia logística: {sugerenciaLogistica}
                    </p>
                  )}
                </div>

                {/* Tabla editable de productos con validación de stock */}
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        Líneas del pedido y validación de inventario
                      </h2>
                      <p className="text-xs text-slate-500">
                        Ajusta cantidades o unidades antes de reservar stock en el ERP.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        aria-label="Agregar producto del catálogo"
                        value={skuToAdd}
                        onChange={(e) => setSkuToAdd(e.target.value)}
                        className="px-2.5 py-1.5 text-xs border border-slate-200 rounded bg-white text-slate-900 max-w-[230px]"
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
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded bg-slate-50 hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Agregar</span>
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                          <th className="py-2.5 px-4">SKU</th>
                          <th className="py-2.5 px-4">Producto</th>
                          <th className="py-2.5 px-4">Cantidad</th>
                          <th className="py-2.5 px-4">Unidad</th>
                          <th className="py-2.5 px-4">Stock ERP</th>
                          <th className="py-2.5 px-4 text-right">Precio</th>
                          <th className="py-2.5 px-4 text-right">Subtotal</th>
                          <th className="py-2.5 px-4 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {items.map((item, idx) => (
                          <tr key={`${item.sku}-${idx}`} className="hover:bg-slate-50">
                            <td className="py-2.5 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                              {item.sku}
                            </td>
                            <td className="py-2.5 px-4 font-medium text-slate-900 min-w-[200px]">
                              {item.nombre}
                            </td>
                            <td className="py-2.5 px-4">
                              <input
                                type="number"
                                min={1}
                                value={item.cantidad}
                                aria-label={`Cantidad de ${item.nombre}`}
                                onChange={(e) =>
                                  handleUpdateItemQuantity(idx, Number(e.target.value))
                                }
                                className="w-20 px-2 py-1 border border-slate-200 rounded text-sm font-mono tabular-nums text-slate-900"
                              />
                            </td>
                            <td className="py-2.5 px-4">
                              <select
                                value={item.unidad}
                                aria-label={`Unidad de ${item.nombre}`}
                                onChange={(e) =>
                                  handleUpdateItemUnit(idx, e.target.value as UnidadMedida)
                                }
                                className="px-2 py-1 border border-slate-200 rounded text-xs bg-white text-slate-800"
                              >
                                {UNIDADES.map((u) => (
                                  <option key={u} value={u}>
                                    {u}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2.5 px-4 text-xs whitespace-nowrap">
                              <span
                                className={`font-medium font-mono tabular-nums ${
                                  item.disponible_en_inventario
                                    ? 'text-emerald-700'
                                    : 'text-red-700'
                                }`}
                              >
                                {item.disponible_en_inventario
                                  ? `Disponible (${formatInt(item.stock_actual)})`
                                  : `Stock insuficiente (${formatInt(item.stock_actual)})`}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                              {formatColones(item.precio_unitario)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                              {formatColones(item.cantidad * item.precio_unitario)}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <button
                                type="button"
                                aria-label={`Eliminar ${item.nombre}`}
                                onClick={() => handleRemoveItem(idx)}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors"
                              >
                                <Trash2 className="w-4 h-4" aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Resumen financiero + CTA */}
                  <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-mono tabular-nums">
                      <div>
                        <span className="text-slate-500 text-xs block font-sans">Subtotal</span>
                        <span className="font-medium text-slate-900">
                          {formatColones(totals.subtotal)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-xs block font-sans">IVA (13%)</span>
                        <span className="font-medium text-slate-900">
                          {formatColones(totals.iva)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-xs block font-sans">Total CRC</span>
                        <span className="text-base font-semibold text-slate-900">
                          {formatColones(totals.total_estimado)}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isLoading || items.length === 0}
                      onClick={handleConfirmOrderAndReserveStock}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]"
                    >
                      {isLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                      <span>Confirmar Pedido y Reservar Stock</span>
                    </button>
                  </div>
                </div>
              </motion.section>
            )}

            {step === 3 && createdPedido && clienteDetectado && (
              <motion.section
                key="step-3"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: TRANSITION_EASE }}
                className="bg-white border border-slate-200 rounded-lg overflow-hidden"
              >
                <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Receipt className="w-4 h-4 text-slate-700 shrink-0" aria-hidden="true" />
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        ¿Desea emitir factura electrónica ahora?
                      </h2>
                      <p className="text-xs text-slate-500">
                        Pedido <span className="font-mono font-medium text-slate-700">{createdPedido.codigo_tracking}</span> con stock reservado en ERP.
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-slate-500">Hacienda CR v4.3</span>
                </div>

                {/* Preview fiscal exacto */}
                <div className="p-6 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-slate-200 text-sm">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-slate-500">Emisor</p>
                      <p className="font-medium text-slate-900">{activeEmpresa.nombre}</p>
                      <p className="text-xs font-mono text-slate-500">Cédula Jurídica: 3-101-784512</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-slate-500">Receptor</p>
                      <p className="font-medium text-slate-900">{clienteDetectado.nombre}</p>
                      <p className="text-xs font-mono text-slate-500">
                        {clienteDetectado.cedula_juridica} · {clienteDetectado.correo_facturacion}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                          <th className="py-2 pr-4">Código</th>
                          <th className="py-2 pr-4">Descripción</th>
                          <th className="py-2 pr-4 text-right">Cantidad</th>
                          <th className="py-2 pr-4 text-right">Precio unit.</th>
                          <th className="py-2 text-right">Importe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {items.map((it, i) => (
                          <tr key={`${it.sku}-${i}`}>
                            <td className="py-2.5 pr-4 font-mono text-xs text-slate-600">{it.sku}</td>
                            <td className="py-2.5 pr-4 text-slate-900">{it.nombre}</td>
                            <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-700">
                              {it.cantidad} {it.unidad}
                            </td>
                            <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-700">
                              {formatColones(it.precio_unitario)}
                            </td>
                            <td className="py-2.5 text-right font-mono tabular-nums font-medium text-slate-900">
                              {formatColones(it.cantidad * it.precio_unitario)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-4 border-t border-slate-200">
                    <div className="space-y-1 text-sm font-mono tabular-nums">
                      <p className="text-slate-600">
                        Subtotal: <span className="text-slate-900">{formatColones(totals.subtotal)}</span>
                      </p>
                      <p className="text-slate-600">
                        IVA 13%: <span className="text-slate-900">{formatColones(totals.iva)}</span>
                      </p>
                      <p className="text-base font-semibold text-slate-900">
                        Total a facturar: {formatColones(totals.total_estimado)}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleInvoiceStep(true)}
                        className="px-4 py-2.5 rounded-md text-sm font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]"
                      >
                        Omitir facturación
                      </button>
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleInvoiceStep(false)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]"
                      >
                        {isLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                        <span>Emitir Factura vía API</span>
                      </button>
                    </div>
                  </div>
                </div>
              </motion.section>
            )}

            {step === 4 && createdPedido && clienteDetectado && (
              <motion.section
                key="step-4"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: TRANSITION_EASE }}
                className="space-y-6"
              >
                {/* Estado de facturación */}
                {invoiceResult && (
                  <div className="bg-white border border-emerald-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-emerald-800">
                        Factura Electrónica emitida · {createdPedido.numero_factura_externa}
                      </p>
                      <p className="text-xs font-mono text-slate-600 break-all">
                        Clave Hacienda: {invoiceResult.clave_hacienda}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-emerald-700 whitespace-nowrap">
                      Aceptado CR
                    </span>
                  </div>
                )}

                {/* Coordinación de ruta o courier externo */}
                <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
                    <div className="flex items-center gap-2.5">
                      <Truck className="w-4 h-4 text-slate-700 shrink-0" aria-hidden="true" />
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">
                          Coordinación de ruta y tracking
                        </h2>
                        <p className="text-xs text-slate-500">
                          Código asignado:{' '}
                          <span className="font-mono font-semibold text-slate-900">
                            {createdPedido.codigo_tracking}
                          </span>
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-slate-600">
                      {activeEmpresa.tipo_operacion === 'distribuidora_flotilla'
                        ? 'Flotilla Propia'
                        : 'Proveedor Externo'}
                    </span>
                  </div>

                  {activeEmpresa.tipo_operacion === 'distribuidora_flotilla' && fleetSuggestion && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-slate-500">Ruta sugerida</p>
                        <p className="font-medium text-slate-900 mt-0.5">{fleetSuggestion.ruta_nombre}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Unidad y chofer</p>
                        <p className="font-medium text-slate-900 mt-0.5 font-mono">
                          {fleetSuggestion.vehiculo_placa}
                        </p>
                        <p className="text-xs text-slate-600">{fleetSuggestion.chofer_nombre}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Ventana de cliente</p>
                        <p className="font-medium text-slate-900 mt-0.5 font-mono tabular-nums">
                          {fleetSuggestion.ventana_cliente}
                        </p>
                        <p className="text-xs text-slate-600">Zona {clienteDetectado.zona}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Capacidad de unidad</p>
                        <p className="font-medium text-emerald-700 mt-0.5">
                          {fleetSuggestion.capacidad_disponible ? 'Capacidad disponible' : 'Requiere ajuste'}
                        </p>
                        <p className="text-xs font-mono tabular-nums text-slate-600">
                          Tramo: {fleetSuggestion.distancia_planificada_km} km
                        </p>
                      </div>
                    </div>
                  )}

                  {activeEmpresa.tipo_operacion === 'pyme_tercerizada' && (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <label htmlFor="courier-select" className="text-xs font-medium text-slate-600">
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
                          className="px-3 py-1.5 border border-slate-200 rounded-md text-sm bg-white text-slate-900"
                        >
                          <option value="Moovin CR">Moovin CR (Mismo Día GAM)</option>
                          <option value="Correos de Costa Rica">Correos de Costa Rica (EMS Nacional)</option>
                          <option value="DHL Express CR">DHL Express CR</option>
                        </select>
                      </div>

                      {courierQuote && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-sm border-t border-slate-200">
                          <div>
                            <p className="text-xs text-slate-500">Servicio y guía</p>
                            <p className="font-medium text-slate-900 mt-0.5">{courierQuote.servicio}</p>
                            <p className="text-xs font-mono text-slate-600">{courierQuote.guia_externa}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Tarifa cotizada</p>
                            <p className="font-semibold text-slate-900 mt-0.5 font-mono tabular-nums">
                              {formatColones(courierQuote.tarifa_colones)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Tiempo estimado</p>
                            <p className="font-medium text-slate-900 mt-0.5 font-mono tabular-nums">
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
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]"
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
                    <div className="pt-4 border-t border-slate-200 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-emerald-800">
                            Despacho confirmado en ruta
                          </p>
                          <p className="text-xs text-slate-600 font-mono mt-0.5">
                            Enlace público: {getTrackingPath()}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={copyTrackingUrl}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap transition-all duration-150 active:scale-[0.98]"
                          >
                            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{copiedTracking ? 'Enlace copiado' : 'Copiar enlace'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={copyWhatsAppMessage}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap transition-all duration-150 active:scale-[0.98]"
                          >
                            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{copiedWhatsApp ? 'Mensaje copiado' : 'Copiar para WhatsApp'}</span>
                          </button>
                          <Link
                            href={getTrackingPath()}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 whitespace-nowrap transition-all duration-150 active:scale-[0.98]"
                          >
                            <span>Abrir Tracking Público</span>
                            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
