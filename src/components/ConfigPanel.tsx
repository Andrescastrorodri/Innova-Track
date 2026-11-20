'use client';

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  PlugZap,
  Save,
} from 'lucide-react';
import { CompanySwitcher } from '@/components/CompanySwitcher';
import { WorkspaceShell } from '@/components/WorkspaceShell';
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
    <WorkspaceShell
      current="/configuracion"
      companyName={currentEmpresa?.nombre}
      context={<CompanySwitcher companies={empresas} current={selectedId} onChange={selectCompany} />}
      toolbar={
        <button
          type="button"
          disabled={isSaving || !currentEmpresa}
          onClick={() => void handleSave()}
          className="ui-button ui-button-primary"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="w-4 h-4" aria-hidden="true" />
          )}
          <span>{isSaving ? 'Guardando…' : 'Guardar configuración'}</span>
        </button>
      }
    >
      <main id="contenido" tabIndex={-1} className="workspace-content flex-1 space-y-(--space-stack)">
        {/* Selector de empresa */}
        <section className="glass-surface rounded-2xl p-5">
          <div>
            <h1 className="page-title">
              Perfil de empresa
            </h1>
            <p className="text-xs text-muted mt-0.5">
              Alterna entre operación con flotilla propia o envíos tercerizados y valida tus
              conectores externos.
            </p>
          </div>


        </section>

        {saveMessage && (
          <div
            role="status"
            className="bg-success-soft border border-success-line rounded-lg px-4 py-3 text-sm font-medium text-success-strong flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{saveMessage}</span>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="bg-danger-soft border border-danger-line rounded-lg px-4 py-3 text-sm text-danger-strong"
          >
            {errorMsg}
          </div>
        )}

        {/* Switch Modo Operativo + Datos Generales */}
        <section className="bg-surface border border-line rounded-lg p-4 sm:p-6 space-y-5">
          <h2 className="section-title">
            Modo logístico
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="cfg-nombre" className="text-xs font-medium text-secondary block">
                Nombre comercial / Razón social
              </label>
              <input
                id="cfg-nombre"
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="ui-field w-full px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="cfg-unidad" className="text-xs font-medium text-secondary block">
                Unidad de carga predeterminada
              </label>
              <select
                id="cfg-unidad"
                value={unidadDefault}
                onChange={(e) => setUnidadDefault(e.target.value as UnidadMedida)}
                className="ui-field w-full px-3 py-2 text-sm"
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
            <span className="text-xs font-medium text-secondary block">
              Modo operativo activo
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                aria-pressed={tipoOperacion === 'distribuidora_flotilla'}
                onClick={() => setTipoOperacion('distribuidora_flotilla')}
                className={`p-4 rounded-lg border text-left space-y-1 transition-colors duration-150 active:scale-[0.98] ${
                  tipoOperacion === 'distribuidora_flotilla'
                    ? 'border-accent bg-accent-soft'
                    : 'border-line bg-surface hover:bg-subtle'
                }`}
              >
                <p className="text-sm font-semibold text-ink">
                  Distribuidora (Flotilla Propia)
                </p>
                <p className="text-xs text-secondary">
                  Asigna rutas internas, habilita App Chofer, odómetro, combustible y costo por
                  unidad.
                </p>
              </button>

              <button
                type="button"
                aria-pressed={tipoOperacion === 'pyme_tercerizada'}
                onClick={() => setTipoOperacion('pyme_tercerizada')}
                className={`p-4 rounded-lg border text-left space-y-1 transition-colors duration-150 active:scale-[0.98] ${
                  tipoOperacion === 'pyme_tercerizada'
                    ? 'border-accent bg-accent-soft'
                    : 'border-line bg-surface hover:bg-subtle'
                }`}
              >
                <p className="text-sm font-semibold text-ink">
                  PyME (Proveedores Externos)
                </p>
                <p className="text-xs text-secondary">
                  Cotiza y despacha mediante API de mensajería externa, guías y seguimiento
                  público.
                </p>
              </button>
            </div>
          </div>
        </section>

        {/* Conectores API Externos con botón Probar conexión */}
        <section className="bg-surface border border-line rounded-lg divide-y divide-line">
          <div className="p-5">
            <h2 className="section-title">
              Conectores externos
            </h2>
            <p className="text-xs text-muted mt-0.5">
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
                      className="text-sm font-semibold text-ink block"
                    >
                      {ep.label}
                    </label>
                    <p id={`api-${ep.key}-ayuda`} className="text-sm text-muted">{ep.hint}</p>
                  </div>

                  <button
                    type="button"
                    disabled={isTesting}
                    onClick={() => void handleTestEndpoint(ep.key, ep.value)}
                    className="ui-button ui-button-secondary self-start sm:self-center"
                  >
                    {isTesting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <PlugZap className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>{isTesting ? 'Probando conexión…' : 'Probar conexión'}</span>
                  </button>
                </div>

                <input
                  id={`api-${ep.key}`}
                  aria-describedby={`api-${ep.key}-ayuda`}
                  type="url"
                  value={ep.value}
                  onChange={(e) => ep.onChange(e.target.value)}
                  placeholder="https://..."
                  className="ui-field w-full px-3 py-2 text-xs font-mono"
                />

                {result && (
                  <div
                    role="status"
                    className={`text-sm flex items-center justify-between gap-3 px-3 py-2 rounded border ${
                      result.ok
                        ? 'bg-success-soft border-success-line text-success-strong'
                        : 'bg-warning-soft border-warning-line text-warning-strong'
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
    </WorkspaceShell>
  );
}
