'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Building2,
  Database,
  Download,
  FileText,
  Package,
  Route,
  Search,
  Truck,
  Users,
} from 'lucide-react';
import { formatColones, formatInt } from '@/lib/seed-data';
import type { SectorCliente, SeedDataset } from '@/lib/types';

type ActiveSection = 'resumen' | 'esquema' | 'clientes' | 'inventario';

interface PhaseOneOverviewProps {
  dataset: SeedDataset;
}

const SECTOR_LABELS: Record<SectorCliente | 'todos', string> = {
  todos: 'Todos los sectores',
  abarrotes: 'Abarrotes',
  ferreteria: 'Ferretería',
  insumos_medicos: 'Insumos médicos',
  alimentos: 'Alimentos',
};

const SCHEMA_TABLES = [
  {
    name: 'empresas_config',
    purpose: 'Configuración multi-empresa, tipo de operación y URLs de webhooks ERP/Facturación/Courier.',
    columns: 'id · nombre · tipo_operacion · unidad_medida_default · api_inventario_url · api_facturacion_url · api_courier_url',
  },
  {
    name: 'productos_inventario',
    purpose: 'Catálogo agnóstico de carga (unidades, cajas, bultos, kg) sincronizable vía API.',
    columns: 'id · empresa_id · sku · nombre · sector · unidad_medida · precio_unitario · stock_actual',
  },
  {
    name: 'clientes',
    purpose: 'Directorio comercial con cédula jurídica, correo de facturación, zona, ventana horaria y coordenadas.',
    columns: 'id · empresa_id · nombre · cedula_juridica · correo_facturacion · zona · ventana_inicio · ventana_fin · lat · lng',
  },
  {
    name: 'pedidos',
    purpose: 'Ingesta multimodal (texto, imagen OCR, PDF, audio), desglose de IVA 13% y modalidad de envío.',
    columns: 'id · codigo_tracking · cliente_id · origen_input · items_json · subtotal · iva · total · estado_factura · modalidad_envio',
  },
  {
    name: 'vehiculos',
    purpose: 'Flotilla propia con capacidad de carga, rendimiento km/litro, alquiler diario y mantenimiento por km.',
    columns: 'id · placa · modelo · capacidad_carga · rendimiento_km_litro · costo_alquiler_diario · mantenimiento_por_km',
  },
  {
    name: 'tramos & parametros_costo',
    purpose: 'Rutas planificadas con distancia base y parámetros de salarios, viáticos y combustible en colones.',
    columns: 'ruta_nombre · distancia_planificada_km · tiempo_estimado_min · salario_chofer_diario · precio_combustible_litro',
  },
  {
    name: 'viajes',
    purpose: 'Control de salida y regreso de flotilla con lectura de odómetro, fotografías y trazas GPS.',
    columns: 'id · fecha · ruta_nombre · vehiculo_id · chofer_nombre · odometro_inicio · odometro_fin · carga_total_inicial',
  },
  {
    name: 'entregas',
    purpose: 'Bitácora de paradas con hora de llegada/salida, entregas parciales, rechazos y comprobante.',
    columns: 'id · viaje_id · pedido_id · cliente_id · orden · hora_llegada · hora_salida · cantidad_entregada · cantidad_rechazada',
  },
  {
    name: 'gastos',
    purpose: 'Registro de combustible en litros, peajes y tarifas de courier externo con respaldo de factura.',
    columns: 'id · viaje_id · pedido_id · tipo · litros · monto_colones · foto_factura',
  },
];

const SQL_VIEWS = [
  {
    name: 'vista_metricas_entrega',
    description:
      'Calcula tiempo_espera_min por parada, hora_llegada_local en America/Costa_Rica, cumple_ventana y tasa_rechazo_pct.',
  },
  {
    name: 'vista_costos_operacion',
    description:
      'Consolida alquiler, mantenimiento, mano de obra y gastos para calcular costo_total_colones, costo_por_km, costo_por_unidad_entregada y desviacion_odometro_km.',
  },
];

export function PhaseOneOverview({ dataset }: PhaseOneOverviewProps) {
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string>(
    dataset.empresas_config[0]?.id ?? ''
  );
  const [activeSection, setActiveSection] = useState<ActiveSection>('resumen');
  const [sectorFilter, setSectorFilter] = useState<SectorCliente | 'todos'>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const activeEmpresa = useMemo(
    () =>
      dataset.empresas_config.find((e) => e.id === selectedEmpresaId) ??
      dataset.empresas_config[0],
    [dataset.empresas_config, selectedEmpresaId]
  );

  const empresaPedidos = useMemo(
    () => dataset.pedidos.filter((p) => p.empresa_id === activeEmpresa?.id),
    [dataset.pedidos, activeEmpresa]
  );

  const empresaClientes = useMemo(
    () => dataset.clientes.filter((c) => c.empresa_id === activeEmpresa?.id),
    [dataset.clientes, activeEmpresa]
  );

  const empresaProductos = useMemo(
    () => dataset.productos_inventario.filter((p) => p.empresa_id === activeEmpresa?.id),
    [dataset.productos_inventario, activeEmpresa]
  );

  const totalFacturadoEmpresa = useMemo(
    () => empresaPedidos.reduce((sum, p) => sum + p.total, 0),
    [empresaPedidos]
  );

  const filteredClientes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return dataset.clientes.filter((cliente) => {
      const matchesSector = sectorFilter === 'todos' || cliente.sector === sectorFilter;
      const matchesSearch =
        !q ||
        cliente.nombre.toLowerCase().includes(q) ||
        cliente.zona.toLowerCase().includes(q) ||
        cliente.cedula_juridica.toLowerCase().includes(q);
      return matchesSector && matchesSearch;
    });
  }, [dataset.clientes, sectorFilter, searchQuery]);

  const filteredProductos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return dataset.productos_inventario.filter((prod) => {
      const matchesSector = sectorFilter === 'todos' || prod.sector === sectorFilter;
      const matchesSearch =
        !q ||
        prod.nombre.toLowerCase().includes(q) ||
        prod.sku.toLowerCase().includes(q);
      return matchesSector && matchesSearch;
    });
  }, [dataset.productos_inventario, sectorFilter, searchQuery]);

  function handleExportSeedJson() {
    const blob = new Blob([JSON.stringify(dataset, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'innova-track-seed-fase1.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setExportStatus('JSON descargado');
    setTimeout(() => setExportStatus(null), 2500);
  }

  const navItems: Array<{ id: ActiveSection; label: string; icon: typeof Database }> = [
    { id: 'resumen', label: 'Resumen Fase 1', icon: Building2 },
    { id: 'esquema', label: 'Esquema SQL', icon: Database },
    { id: 'clientes', label: 'Clientes y anomalías', icon: Users },
    { id: 'inventario', label: 'Inventario multisector', icon: Package },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Sidebar de navegación */}
      <aside className="w-full lg:w-64 shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col lg:sticky lg:top-0 lg:h-screen">
        <div className="px-6 py-5 border-b border-slate-200">
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Innova Track
          </span>
        </div>

        <nav
          aria-label="Navegación Fase 1"
          className="p-3 flex lg:flex-col gap-1 overflow-x-auto"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium whitespace-nowrap shrink-0 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="hidden lg:block my-2 border-t border-slate-200" />

          <Link
            href="/pedidos/nuevo"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium text-blue-700 hover:bg-blue-50 whitespace-nowrap shrink-0 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]"
          >
            <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Copiloto de Pedidos</span>
          </Link>

          <Link
            href="/chofer"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 whitespace-nowrap shrink-0 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]"
          >
            <Truck className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>App Chofer</span>
          </Link>

          <Link
            href="/tracking/IT-8901"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 whitespace-nowrap shrink-0 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]"
          >
            <Route className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Tracking Ejemplo</span>
          </Link>
        </nav>

        <div className="hidden lg:block mt-auto p-4 border-t border-slate-200 text-xs text-slate-500 space-y-1.5">
          <p className="font-medium text-slate-700">Alcance activo</p>
          <p>Fase 1 (Esquema & Seed), Fase 2 (Copiloto IA & Tracking) y Fase 3 (App Chofer).</p>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb izquierda + 1 acción primaria derecha */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-8">
          <div className="min-w-0 flex items-center gap-2 text-sm text-slate-500">
            <span className="font-medium text-slate-900 whitespace-nowrap">Innova Track</span>
            <span aria-hidden="true">/</span>
            <span className="truncate">Fase 1: Setup, Esquema SQL Multi-Empresa y Seed</span>
          </div>

          <button
            type="button"
            onClick={handleExportSeedJson}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-blue-700 text-white hover:bg-blue-800 whitespace-nowrap shrink-0 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]"
          >
            <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{exportStatus ?? 'Exportar Seed JSON'}</span>
          </button>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-8">
          {/* Toolbar de selección de empresa (workspace toolbar below header) */}
          <section
            aria-label="Contexto de empresa"
            className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                {activeEmpresa?.nombre}
              </h1>
              <p className="text-sm text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  {activeEmpresa?.tipo_operacion === 'distribuidora_flotilla'
                    ? 'Distribuidora con flotilla propia'
                    : 'PyME con envío tercerizado'}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Unidad base: <strong className="font-medium text-slate-700">{activeEmpresa?.unidad_medida_default}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>Costa Rica (CRC · IVA 13%)</span>
              </p>
            </div>

            <div
              role="group"
              aria-label="Cambiar perfil de empresa"
              className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-md shrink-0"
            >
              {dataset.empresas_config.map((empresa) => {
                const isSelected = empresa.id === activeEmpresa?.id;
                const shortLabel =
                  empresa.tipo_operacion === 'distribuidora_flotilla'
                    ? 'Distribuidora Flotilla'
                    : 'PyME Tercerizada';
                return (
                  <button
                    key={empresa.id}
                    type="button"
                    onClick={() => setSelectedEmpresaId(empresa.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] ${
                      isSelected
                        ? 'bg-white text-slate-900 border border-slate-200'
                        : 'text-slate-600 hover:text-slate-900 border border-transparent'
                    }`}
                  >
                    {shortLabel}
                  </button>
                );
              })}
            </div>
          </section>

          {activeSection === 'resumen' && (
            <div className="space-y-8">
              {/* Grilla de métricas clave del seed */}
              <section aria-label="Indicadores del dataset semilla">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white border border-slate-200 rounded-lg p-5">
                    <p className="text-xs font-medium text-slate-500">Pedidos generados (14 días)</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                      {empresaPedidos.length}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Total ecosistema: <span className="font-mono tabular-nums">{dataset.pedidos.length}</span> pedidos
                    </p>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg p-5">
                    <p className="text-xs font-medium text-slate-500">Facturación acumulada (IVA inc.)</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                      {formatColones(totalFacturadoEmpresa)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Clientes activos: <span className="font-mono tabular-nums">{empresaClientes.length}</span> · SKUs:{' '}
                      <span className="font-mono tabular-nums">{empresaProductos.length}</span>
                    </p>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg p-5">
                    <p className="text-xs font-medium text-slate-500">Flotilla y rutas configuradas</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                      {dataset.vehiculos.length} / {dataset.tramos.length}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      <span className="font-mono tabular-nums">{dataset.viajes.length}</span> viajes en{' '}
                      <span className="font-mono tabular-nums">14</span> días
                    </p>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg p-5">
                    <p className="text-xs font-medium text-slate-500">Gastos y entregas registradas</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                      {dataset.entregas.length}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      <span className="font-mono tabular-nums">{dataset.gastos.length}</span> comprobantes de gasto
                    </p>
                  </div>
                </div>
              </section>

              {/* Anomalías plantadas en el seed */}
              <section
                aria-label="Anomalías logísticas plantadas para auditoría"
                className="bg-white border border-slate-200 rounded-lg overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                    <h2 className="text-base font-semibold text-slate-900">
                      Anomalías operativas plantadas en el seed (2 semanas)
                    </h2>
                  </div>
                  <span className="text-xs text-slate-500 font-mono tabular-nums">3 escenarios activos</span>
                </div>

                <div className="divide-y divide-slate-200">
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-900">
                        Esperas excesivas en recepción de cliente
                      </p>
                      <p className="text-sm text-slate-600">
                        {dataset.anomaliesSummary.excessiveWaitClientName} ·{' '}
                        <span className="font-mono tabular-nums">
                          {dataset.anomaliesSummary.excessiveWaitDeliveries}
                        </span>{' '}
                        visitas auditadas
                      </p>
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                      <p className="text-sm font-semibold text-amber-700 font-mono tabular-nums">
                        Máx. {dataset.anomaliesSummary.maxWaitMinutes} min
                      </p>
                      <p className="text-xs text-slate-500">Promedio normal: 11–22 min</p>
                    </div>
                  </div>

                  <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-900">
                        Desvío de odómetro superior a +40 km vs tramo planificado
                      </p>
                      <p className="text-sm text-slate-600">
                        {dataset.anomaliesSummary.odometerDeviationRoute} · 2 viajes con incidencia
                      </p>
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                      <p className="text-sm font-semibold text-red-700 font-mono tabular-nums">
                        +{dataset.anomaliesSummary.odometerDeviationMaxKm.toFixed(1)} km
                      </p>
                      <p className="text-xs text-slate-500">Sobre distancia base de 74.0 km</p>
                    </div>
                  </div>

                  <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-900">
                        Rechazos recurrentes de mercadería en punto de entrega
                      </p>
                      <p className="text-sm text-slate-600">
                        {dataset.anomaliesSummary.recurringRejectionClientName} · Bodega cerrada / empaque
                      </p>
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                      <p className="text-sm font-semibold text-red-700 font-mono tabular-nums">
                        {dataset.anomaliesSummary.recurringRejectionCount} rechazos
                      </p>
                      <p className="text-xs text-slate-500">Parciales y totales</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Flotilla y endpoints configurados */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-slate-700 shrink-0" aria-hidden="true" />
                    <h2 className="text-base font-semibold text-slate-900">Flotilla semilla (3 vehículos)</h2>
                  </div>
                  <div className="divide-y divide-slate-200">
                    {dataset.vehiculos.map((v) => (
                      <div key={v.id} className="px-5 py-3.5 flex items-center justify-between gap-4 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 truncate">
                            <span className="font-mono">{v.placa}</span> · {v.modelo}
                          </p>
                          <p className="text-xs text-slate-500 font-mono tabular-nums">
                            Capacidad: {formatInt(v.capacidad_carga)} {v.unidad_capacidad} ·{' '}
                            {v.rendimiento_km_litro} km/L
                          </p>
                        </div>
                        <div className="text-right shrink-0 font-mono tabular-nums">
                          <p className="text-slate-900 font-medium">{formatColones(v.costo_alquiler_diario)}/día</p>
                          <p className="text-xs text-slate-500">{formatColones(v.mantenimiento_por_km)}/km</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200">
                    <h2 className="text-base font-semibold text-slate-900">
                      Integraciones API configuradas ({activeEmpresa?.nombre})
                    </h2>
                  </div>
                  <div className="divide-y divide-slate-200 text-sm">
                    <div className="px-5 py-3.5 space-y-1">
                      <p className="text-xs font-medium text-slate-500">ERP Inventario Webhook</p>
                      <p className="font-mono text-xs text-slate-800 break-all">
                        {activeEmpresa?.api_inventario_url}
                      </p>
                    </div>
                    <div className="px-5 py-3.5 space-y-1">
                      <p className="text-xs font-medium text-slate-500">API Facturación Electrónica CR</p>
                      <p className="font-mono text-xs text-slate-800 break-all">
                        {activeEmpresa?.api_facturacion_url}
                      </p>
                    </div>
                    <div className="px-5 py-3.5 space-y-1">
                      <p className="text-xs font-medium text-slate-500">API Courier Externo</p>
                      <p className="font-mono text-xs text-slate-800 break-all">
                        {activeEmpresa?.api_courier_url}
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}

          {activeSection === 'esquema' && (
            <div className="space-y-6">
              <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      Tablas PostgreSQL en supabase/schema.sql
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Modelo agnóstico al tipo de carga (unidades, cajas, bultos o kg) + bucket público evidencias.
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-slate-600">
                    10 tablas · 2 vistas SQL · 1 bucket Storage
                  </span>
                </div>

                <div className="divide-y divide-slate-200">
                  {SCHEMA_TABLES.map((tbl) => (
                    <div key={tbl.name} className="px-5 py-4 space-y-1.5">
                      <div className="flex items-center justify-between gap-4">
                        <h3 className="text-sm font-semibold font-mono text-slate-900">{tbl.name}</h3>
                      </div>
                      <p className="text-sm text-slate-600">{tbl.purpose}</p>
                      <p className="text-xs font-mono text-slate-500">{tbl.columns}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h2 className="text-base font-semibold text-slate-900">Vistas Analíticas SQL</h2>
                </div>
                <div className="divide-y divide-slate-200">
                  {SQL_VIEWS.map((view) => (
                    <div key={view.name} className="px-5 py-4 space-y-1">
                      <h3 className="text-sm font-semibold font-mono text-blue-700">{view.name}</h3>
                      <p className="text-sm text-slate-600">{view.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {(activeSection === 'clientes' || activeSection === 'inventario') && (
            <div className="space-y-4">
              {/* Filtros interactivos */}
              <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-1 flex-wrap">
                  {(Object.keys(SECTOR_LABELS) as Array<SectorCliente | 'todos'>).map((sec) => {
                    const active = sectorFilter === sec;
                    return (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setSectorFilter(sec)}
                        className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap shrink-0 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] ${
                          active
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {SECTOR_LABELS[sec]}
                      </button>
                    );
                  })}
                </div>

                <div className="relative w-full md:w-72">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={
                      activeSection === 'clientes'
                        ? 'Buscar cliente, zona o cédula...'
                        : 'Buscar producto o SKU...'
                    }
                    aria-label="Buscar registros"
                    className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              {activeSection === 'clientes' && (
                <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">
                      Directorio de clientes semilla
                    </h2>
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      {filteredClientes.length} de {dataset.clientes.length} registros
                    </span>
                  </div>

                  {filteredClientes.length === 0 ? (
                    <div className="p-8 text-center space-y-2">
                      <p className="text-sm text-slate-600">
                        No hay clientes que coincidan con el filtro aplicado.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSectorFilter('todos');
                          setSearchQuery('');
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-blue-700 hover:underline"
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                            <th className="py-2.5 px-4">Cliente</th>
                            <th className="py-2.5 px-4">Sector</th>
                            <th className="py-2.5 px-4">Zona</th>
                            <th className="py-2.5 px-4">Ventana</th>
                            <th className="py-2.5 px-4">Cédula jurídica</th>
                            <th className="py-2.5 px-4">Nota operativa</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {filteredClientes.map((c) => {
                            const isWaitAnomaly =
                              c.id === dataset.anomaliesSummary.excessiveWaitClientId;
                            const isRejectAnomaly =
                              c.id === dataset.anomaliesSummary.recurringRejectionClientId;
                            return (
                              <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                                <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                                  {c.nombre}
                                </td>
                                <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                                  {SECTOR_LABELS[c.sector]}
                                </td>
                                <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                                  {c.zona}
                                </td>
                                <td className="py-2.5 px-4 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                                  {c.ventana_inicio.slice(0, 5)}–{c.ventana_fin.slice(0, 5)}
                                </td>
                                <td className="py-2.5 px-4 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                                  {c.cedula_juridica}
                                </td>
                                <td className="py-2.5 px-4 text-xs whitespace-nowrap">
                                  {isWaitAnomaly ? (
                                    <span className="font-medium text-amber-700">
                                      Anomalía: esperas 68–92 min
                                    </span>
                                  ) : isRejectAnomaly ? (
                                    <span className="font-medium text-red-700">
                                      Anomalía: rechazos recurrentes
                                    </span>
                                  ) : (
                                    <span className="text-slate-500">Operación nominal</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}

              {activeSection === 'inventario' && (
                <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">
                      Inventario multisector agnóstico a unidad de carga
                    </h2>
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      {filteredProductos.length} de {dataset.productos_inventario.length} SKUs
                    </span>
                  </div>

                  {filteredProductos.length === 0 ? (
                    <div className="p-8 text-center space-y-2">
                      <p className="text-sm text-slate-600">
                        No hay productos que coincidan con el filtro aplicado.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSectorFilter('todos');
                          setSearchQuery('');
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-blue-700 hover:underline"
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                            <th className="py-2.5 px-4">SKU</th>
                            <th className="py-2.5 px-4">Producto</th>
                            <th className="py-2.5 px-4">Sector</th>
                            <th className="py-2.5 px-4">Unidad</th>
                            <th className="py-2.5 px-4 text-right">Stock actual</th>
                            <th className="py-2.5 px-4 text-right">Precio unitario</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {filteredProductos.map((p) => (
                            <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                              <td className="py-2.5 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                                {p.sku}
                              </td>
                              <td className="py-2.5 px-4 font-medium text-slate-900">
                                {p.nombre}
                              </td>
                              <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                                {SECTOR_LABELS[p.sector]}
                              </td>
                              <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                                {p.unidad_medida}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                                {formatInt(p.stock_actual)}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                                {formatColones(p.precio_unitario)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
