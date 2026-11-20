'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  CheckCircle2,
  FileText,
  Home,
  Loader2,
  PlugZap,
  Route,
  Save,
  Settings,
  Truck,
} from 'lucide-react';
import type { EmpresaConfig, TipoOperacion, UnidadMedida } from '@/lib/types';

interface ConfigPanelProps {
  initialEmpresas: EmpresaConfig[];
}

interface EndpointTestResult {
  ok: boolean;
  estado: string;
  latencia_ms: number;
  mensaje: string;
}

const UNIDADES: UnidadMedida[] = ['unidades', 'cajas', 'bultos', 'kg'];

export function ConfigPanel({ initialEmpresas }: ConfigPanelProps) {
  const [empresas, setEmpresas] = useState<EmpresaConfig[]>(initialEmpresas);
  const [selectedId, setSelectedId] = useState<string>(initialEmpresas[0]?.id ?? '');

  const currentEmpresa = useMemo(
    () => empresas.find((e) => e.id === selectedId) ?? empresas[0],
    [empresas, selectedId]
  );

  const [nombre, setNombre] = useState(currentEmpresa?.nombre ?? '');
  const [tipoOperacion, setTipoOperacion] = useState<TipoOperacion>(
    currentEmpresa?.tipo_operacion ?? 'distribuidora_flotilla'
  );
  const [unidadDefault, setUnidadDefault] = useState<UnidadMedida>(
    currentEmpresa?.unidad_medida_default ?? 'cajas'
  );
  const [apiInventario, setApiInventario] = useState(currentEmpresa?.api_inventario_url ?? '');
  const [apiFacturacion, setApiFacturacion] = useState(
    currentEmpresa?.api_facturacion_url ?? ''
  );
  const [apiCourier, setApiCourier] = useState(currentEmpresa?.api_courier_url ?? '');

  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, EndpointTestResult>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function selectCompany(emp: EmpresaConfig) {
    setSelectedId(emp.id);
    setNombre(emp.nombre);
    setTipoOperacion(emp.tipo_operacion);
    setUnidadDefault(emp.unidad_medida_default);
    setApiInventario(emp.api_inventario_url ?? '');
    setApiFacturacion(emp.api_facturacion_url ?? '');
    setApiCourier(emp.api_courier_url ?? '');
    setTestResults({});
    setSaveMessage(null);
    setErrorMsg(null);
  }

  async function handleTestEndpoint(
    tipo: 'inventario' | 'facturacion' | 'courier',
    url: string
  ) {
    setTestingKey(tipo);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/configuracion/probar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, url }),
      });
      const data = (await res.json()) as EndpointTestResult;
      setTestResults((prev) => ({ ...prev, [tipo]: data }));
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [tipo]: {
          ok: false,
          estado: 'error_red',
          latencia_ms: 0,
          mensaje: 'No se pudo completar la prueba de conectividad.',
        },
      }));
    } finally {
      setTestingKey(null);
    }
  }

  async function handleSave() {
    if (!currentEmpresa) return;
    setIsSaving(true);
    setSaveMessage(null);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/configuracion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentEmpresa.id,
          nombre,
          tipo_operacion: tipoOperacion,
          unidad_medida_default: unidadDefault,
          api_inventario_url: apiInventario,
          api_facturacion_url: apiFacturacion,
          api_courier_url: apiCourier,
        }),
      });
      const data = (await res.json()) as {
        empresa?: EmpresaConfig;
        empresas?: EmpresaConfig[];
        error?: string;
      };
      if (!res.ok || !data.empresas) {
        throw new Error(data.error || 'No se pudo guardar la configuración.');
      }
      setEmpresas(data.empresas);
      setSaveMessage('Configuración operativa y conectores API guardados.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error guardando configuración.');
    } finally {
      setIsSaving(false);
    }
  }

  const endpoints = [
    {
      key: 'inventario' as const,
      label: 'API Inventario ERP',
      hint: 'Consulta y reserva automática de existencias al confirmar pedidos.',
      value: apiInventario,
      onChange: setApiInventario,
    },
    {
      key: 'facturacion' as const,
      label: 'API Facturación Electrónica CR',
      hint: 'Emisión de comprobantes ante Ministerio de Hacienda (IVA 13%).',
      value: apiFacturacion,
      onChange: setApiFacturacion,
    },
    {
      key: 'courier' as const,
      label: 'API Courier Externo',
      hint: 'Cotización de tarifas, guías y enlaces de rastreo para envíos tercerizados.',
      value: apiCourier,
      onChange: setApiCourier,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
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
          <span className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium bg-slate-900 text-white whitespace-nowrap shrink-0">
            <Settings className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Configuración APIs</span>
          </span>
        </nav>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex items-center gap-2 text-sm text-slate-500">
            <Link href="/" className="font-medium text-slate-900 hover:underline whitespace-nowrap">
              Innova Track
            </Link>
            <span aria-hidden="true">/</span>
            <span className="truncate">Configuración de Modo Operativo e Integraciones</span>
          </div>

          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap transition-all duration-150 active:scale-[0.98]"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="w-4 h-4" aria-hidden="true" />
            )}
            <span>Guardar configuración</span>
          </button>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-5xl w-full mx-auto space-y-6">
          {/* Selector de empresa */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                Perfil de empresa y modo logístico
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Alterna entre operación con flotilla propia o envíos tercerizados y valida tus
                conectores externos.
              </p>
            </div>

            <div
              role="group"
              aria-label="Seleccionar empresa a configurar"
              className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-md shrink-0"
            >
              {empresas.map((emp) => {
                const selected = emp.id === selectedId;
                return (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => selectCompany(emp)}
                    className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap transition-all ${
                      selected
                        ? 'bg-white text-slate-900 border border-slate-200'
                        : 'text-slate-600 hover:text-slate-900 border border-transparent'
                    }`}
                  >
                    {emp.nombre.split(' ')[0]} ·{' '}
                    {emp.tipo_operacion === 'distribuidora_flotilla' ? 'Flotilla' : 'PyME'}
                  </button>
                );
              })}
            </div>
          </section>

          {saveMessage && (
            <div
              role="status"
              className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm font-medium text-emerald-800 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{saveMessage}</span>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800"
            >
              {errorMsg}
            </div>
          )}

          {/* Switch Modo Operativo + Datos Generales */}
          <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
            <h2 className="text-base font-semibold text-slate-900">
              Parámetros generales de la operación
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="cfg-nombre" className="text-xs font-medium text-slate-600 block">
                  Nombre comercial / Razón social
                </label>
                <input
                  id="cfg-nombre"
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm text-slate-900 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="cfg-unidad" className="text-xs font-medium text-slate-600 block">
                  Unidad de carga predeterminada
                </label>
                <select
                  id="cfg-unidad"
                  value={unidadDefault}
                  onChange={(e) => setUnidadDefault(e.target.value as UnidadMedida)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm text-slate-900 bg-white focus:outline-none focus:border-blue-600"
                >
                  {UNIDADES.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-600 block">
                Modo operativo activo
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTipoOperacion('distribuidora_flotilla')}
                  className={`p-4 rounded-lg border text-left space-y-1 transition-all active:scale-[0.98] ${
                    tipoOperacion === 'distribuidora_flotilla'
                      ? 'border-blue-700 bg-blue-50/40'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">
                    Distribuidora (Flotilla Propia)
                  </p>
                  <p className="text-xs text-slate-600">
                    Asigna rutas internas, habilita App Chofer, odómetro, combustible y costo por
                    unidad.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setTipoOperacion('pyme_tercerizada')}
                  className={`p-4 rounded-lg border text-left space-y-1 transition-all active:scale-[0.98] ${
                    tipoOperacion === 'pyme_tercerizada'
                      ? 'border-blue-700 bg-blue-50/40'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">
                    PyME (Proveedores Externos)
                  </p>
                  <p className="text-xs text-slate-600">
                    Cotiza y despacha mediante API de mensajería externa, guías y seguimiento
                    público.
                  </p>
                </button>
              </div>
            </div>
          </section>

          {/* Conectores API Externos con botón Probar conexión */}
          <section className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
            <div className="p-5">
              <h2 className="text-base font-semibold text-slate-900">
                Endpoints de integración externa (webhooks y APIs)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Prueba la conectividad en tiempo real o utiliza los adaptadores demostrativos de
                Innova Track.
              </p>
            </div>

            {endpoints.map((ep) => {
              const result = testResults[ep.key];
              const isTesting = testingKey === ep.key;
              return (
                <div key={ep.key} className="p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <label
                        htmlFor={`api-${ep.key}`}
                        className="text-sm font-semibold text-slate-900 block"
                      >
                        {ep.label}
                      </label>
                      <p className="text-xs text-slate-500">{ep.hint}</p>
                    </div>

                    <button
                      type="button"
                      disabled={isTesting}
                      onClick={() => void handleTestEndpoint(ep.key, ep.value)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap self-start sm:self-center active:scale-[0.98] transition-all"
                    >
                      {isTesting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <PlugZap className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      <span>Probar conexión</span>
                    </button>
                  </div>

                  <input
                    id={`api-${ep.key}`}
                    type="url"
                    value={ep.value}
                    onChange={(e) => ep.onChange(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs font-mono text-slate-900 focus:outline-none focus:border-blue-600"
                  />

                  {result && (
                    <div
                      className={`text-xs flex items-center justify-between gap-3 px-3 py-2 rounded border ${
                        result.ok
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-amber-50 border-amber-200 text-amber-800'
                      }`}
                    >
                      <span>{result.mensaje}</span>
                      <span className="font-mono tabular-nums shrink-0">
                        {result.latencia_ms} ms
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </main>
      </div>
    </div>
  );
}
