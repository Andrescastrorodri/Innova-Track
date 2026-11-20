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
import { TableScroll } from '@/components/TableScroll';
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
    <div className="min-h-dvh bg-canvas text-ink flex flex-col lg:flex-row">
      {/* Sidebar de navegación */}
      <aside className="w-full lg:w-64 shrink-0 bg-surface border-b lg:border-b-0 lg:border-r border-line flex flex-col lg:sticky lg:top-0 lg:h-dvh">
        <div className="px-6 py-5 border-b border-line">
          <span className="text-lg font-bold tracking-tight text-ink whitespace-nowrap">
            Innova Track
          </span>
        </div>

        <nav
          aria-label="Navegación Fase 1"
          className="p-3 flex flex-wrap lg:flex-col gap-1"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActiveSection(item.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-150 active:scale-[0.98] ${
                  isActive
                    ? 'bg-ink text-on-ink'
                    : 'text-secondary hover:text-ink hover:bg-subtle'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="hidden lg:block my-2 border-t border-line" />

          <Link
            href="/pedidos/nuevo"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium text-accent hover:bg-accent-soft whitespace-nowrap shrink-0 transition-colors duration-150 active:scale-[0.98]"
          >
            <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Copiloto de Pedidos</span>
          </Link>

          <Link
            href="/chofer"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium text-secondary hover:text-ink hover:bg-subtle whitespace-nowrap shrink-0 transition-colors duration-150 active:scale-[0.98]"
          >
            <Truck className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>App Chofer</span>
          </Link>

          <Link
            href="/tracking/IT-8901"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium text-secondary hover:text-ink hover:bg-subtle whitespace-nowrap shrink-0 transition-colors duration-150 active:scale-[0.98]"
          >
            <Route className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Tracking Ejemplo</span>
          </Link>
        </nav>

        <div className="hidden lg:block mt-auto p-4 border-t border-line text-xs text-muted space-y-1.5">
          <p className="font-medium text-secondary">Alcance activo</p>
          <p>Fase 1 (Esquema & Seed), Fase 2 (Copiloto IA & Tracking) y Fase 3 (App Chofer).</p>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb izquierda + 1 acción primaria derecha */}
        <header className="bg-surface border-b border-line px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2 text-sm text-muted">
            <span className="font-medium text-ink whitespace-nowrap">Innova Track</span>
            <span aria-hidden="true">/</span>
            <span className="truncate">Fase 1: Setup, Esquema SQL Multi-Empresa y Seed</span>
          </div>

          <button
            type="button"
            onClick={handleExportSeedJson}
            className="ui-button ui-button-primary shrink-0"
          >
            <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{exportStatus ?? 'Exportar Seed JSON'}</span>
          </button>
        </header>

        <main id="contenido" tabIndex={-1} className="flex-1 p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-8">
          {/* Toolbar de selección de empresa (workspace toolbar below header) */}
          <section
            aria-label="Contexto de empresa"
            className="bg-surface border border-line rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <h1 className="page-title">
                {activeEmpresa?.nombre}
              </h1>
              <p className="text-sm text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  {activeEmpresa?.tipo_operacion === 'distribuidora_flotilla'
                    ? 'Distribuidora con flotilla propia'
                    : 'PyME con envío tercerizado'}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Unidad base: <strong className="font-medium text-secondary">{activeEmpresa?.unidad_medida_default}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>Costa Rica (CRC · IVA 13%)</span>
              </p>
            </div>

            <div
              role="group"
              aria-label="Cambiar perfil de empresa"
              className="inline-flex items-center p-1 bg-subtle border border-line rounded-md shrink-0"
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
                    className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 transition-colors duration-150 active:scale-[0.98] ${
                      isSelected
                        ? 'bg-surface text-ink border border-line'
                        : 'text-secondary hover:text-ink border border-transparent'
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
                  <div className="bg-surface border border-line rounded-lg p-5">
                    <p className="text-xs font-medium text-muted">Pedidos generados (14 días)</p>
                    <p className="mt-2 text-2xl font-semibold text-ink font-mono tabular-nums">
                      {empresaPedidos.length}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Total ecosistema: <span className="font-mono tabular-nums">{dataset.pedidos.length}</span> pedidos
                    </p>
                  </div>

                  <div className="bg-surface border border-line rounded-lg p-5">
                    <p className="text-xs font-medium text-muted">Facturación acumulada (IVA inc.)</p>
                    <p className="mt-2 text-2xl font-semibold text-ink font-mono tabular-nums">
                      {formatColones(totalFacturadoEmpresa)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Clientes activos: <span className="font-mono tabular-nums">{empresaClientes.length}</span> · SKUs:{' '}
                      <span className="font-mono tabular-nums">{empresaProductos.length}</span>
                    </p>
                  </div>

                  <div className="bg-surface border border-line rounded-lg p-5">
                    <p className="text-xs font-medium text-muted">Flotilla y rutas configuradas</p>
                    <p className="mt-2 text-2xl font-semibold text-ink font-mono tabular-nums">
                      {dataset.vehiculos.length} / {dataset.tramos.length}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      <span className="font-mono tabular-nums">{dataset.viajes.length}</span> viajes en{' '}
                      <span className="font-mono tabular-nums">14</span> días
                    </p>
                  </div>

                  <div className="bg-surface border border-line rounded-lg p-5">
                    <p className="text-xs font-medium text-muted">Gastos y entregas registradas</p>
                    <p className="mt-2 text-2xl font-semibold text-ink font-mono tabular-nums">
                      {dataset.entregas.length}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      <span className="font-mono tabular-nums">{dataset.gastos.length}</span> comprobantes de gasto
                    </p>
                  </div>
                </div>
              </section>

              {/* Anomalías plantadas en el seed */}
              <section
                aria-label="Anomalías logísticas plantadas para auditoría"
                className="bg-surface border border-line rounded-lg overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-warning shrink-0" aria-hidden="true" />
                    <h2 className="section-title">
                      Anomalías operativas plantadas en el seed (2 semanas)
                    </h2>
                  </div>
                  <span className="text-xs text-muted font-mono tabular-nums">3 escenarios activos</span>
                </div>

                <div className="divide-y divide-line">
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-ink">
                        Esperas excesivas en recepción de cliente
                      </p>
                      <p className="text-sm text-secondary">
                        {dataset.anomaliesSummary.excessiveWaitClientName} ·{' '}
                        <span className="font-mono tabular-nums">
                          {dataset.anomaliesSummary.excessiveWaitDeliveries}
                        </span>{' '}
                        visitas auditadas
                      </p>
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                      <p className="text-sm font-semibold text-warning font-mono tabular-nums">
                        Máx. {dataset.anomaliesSummary.maxWaitMinutes} min
                      </p>
                      <p className="text-xs text-muted">Promedio normal: 11–22 min</p>
                    </div>
                  </div>

                  <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-ink">
                        Desvío de odómetro superior a +40 km vs tramo planificado
                      </p>
                      <p className="text-sm text-secondary">
                        {dataset.anomaliesSummary.odometerDeviationRoute} · 2 viajes con incidencia
                      </p>
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                      <p className="text-sm font-semibold text-danger font-mono tabular-nums">
                        +{dataset.anomaliesSummary.odometerDeviationMaxKm.toFixed(1)} km
                      </p>
                      <p className="text-xs text-muted">Sobre distancia base de 74.0 km</p>
                    </div>
                  </div>

                  <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-ink">
                        Rechazos recurrentes de mercadería en punto de entrega
                      </p>
                      <p className="text-sm text-secondary">
                        {dataset.anomaliesSummary.recurringRejectionClientName} · Bodega cerrada / empaque
                      </p>
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                      <p className="text-sm font-semibold text-danger font-mono tabular-nums">
                        {dataset.anomaliesSummary.recurringRejectionCount} rechazos
                      </p>
                      <p className="text-xs text-muted">Parciales y totales</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Flotilla y endpoints configurados */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <section className="bg-surface border border-line rounded-lg overflow-hidden">
                  <div className="px-5 py-4 border-b border-line flex items-center gap-2">
                    <Truck className="w-4 h-4 text-secondary shrink-0" aria-hidden="true" />
                    <h2 className="section-title">Flotilla semilla (3 vehículos)</h2>
                  </div>
                  <div className="divide-y divide-line">
                    {dataset.vehiculos.map((v) => (
                      <div key={v.id} className="px-5 py-3.5 flex items-center justify-between gap-4 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium text-ink truncate">
                            <span className="font-mono">{v.placa}</span> · {v.modelo}
                          </p>
                          <p className="text-xs text-muted font-mono tabular-nums">
                            Capacidad: {formatInt(v.capacidad_carga)} {v.unidad_capacidad} ·{' '}
                            {v.rendimiento_km_litro} km/L
                          </p>
                        </div>
                        <div className="text-right shrink-0 font-mono tabular-nums">
                          <p className="text-ink font-medium">{formatColones(v.costo_alquiler_diario)}/día</p>
                          <p className="text-xs text-muted">{formatColones(v.mantenimiento_por_km)}/km</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="bg-surface border border-line rounded-lg overflow-hidden">
                  <div className="px-5 py-4 border-b border-line">
                    <h2 className="section-title">
                      Integraciones API configuradas ({activeEmpresa?.nombre})
                    </h2>
                  </div>
                  <div className="divide-y divide-line text-sm">
                    <div className="px-5 py-3.5 space-y-1">
                      <p className="text-xs font-medium text-muted">ERP Inventario Webhook</p>
                      <p className="font-mono text-xs text-ink break-all">
                        {activeEmpresa?.api_inventario_url}
                      </p>
                    </div>
                    <div className="px-5 py-3.5 space-y-1">
                      <p className="text-xs font-medium text-muted">API Facturación Electrónica CR</p>
                      <p className="font-mono text-xs text-ink break-all">
                        {activeEmpresa?.api_facturacion_url}
                      </p>
                    </div>
                    <div className="px-5 py-3.5 space-y-1">
                      <p className="text-xs font-medium text-muted">API Courier Externo</p>
                      <p className="font-mono text-xs text-ink break-all">
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
              <section className="bg-surface border border-line rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-line flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="section-title">
                      Tablas PostgreSQL en supabase/schema.sql
                    </h2>
                    <p className="text-xs text-muted mt-0.5">
                      Modelo agnóstico al tipo de carga (unidades, cajas, bultos o kg) + bucket público evidencias.
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-secondary">
                    10 tablas · 2 vistas SQL · 1 bucket Storage
                  </span>
                </div>

                <div className="divide-y divide-line">
                  {SCHEMA_TABLES.map((tbl) => (
                    <div key={tbl.name} className="px-5 py-4 space-y-1.5">
                      <div className="flex items-center justify-between gap-4">
                        <h3 className="text-sm font-semibold font-mono text-ink">{tbl.name}</h3>
                      </div>
                      <p className="text-sm text-secondary">{tbl.purpose}</p>
                      <p className="text-xs font-mono text-muted">{tbl.columns}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-surface border border-line rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-line">
                  <h2 className="section-title">Vistas Analíticas SQL</h2>
                </div>
                <div className="divide-y divide-line">
                  {SQL_VIEWS.map((view) => (
                    <div key={view.name} className="px-5 py-4 space-y-1">
                      <h3 className="text-sm font-semibold font-mono text-accent">{view.name}</h3>
                      <p className="text-sm text-secondary">{view.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {(activeSection === 'clientes' || activeSection === 'inventario') && (
            <div className="space-y-4">
              {/* Filtros interactivos */}
              <div className="bg-surface border border-line rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-1 flex-wrap">
                  {(Object.keys(SECTOR_LABELS) as Array<SectorCliente | 'todos'>).map((sec) => {
                    const active = sectorFilter === sec;
                    return (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setSectorFilter(sec)}
                        className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap shrink-0 transition-colors duration-150 active:scale-[0.98] ${
                          active
                            ? 'bg-ink text-on-ink'
                            : 'bg-subtle text-secondary hover:text-ink'
                        }`}
                      >
                        {SECTOR_LABELS[sec]}
                      </button>
                    );
                  })}
                </div>

                <div className="relative w-full md:w-72">
                  <Search
                    className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
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
                    className="ui-field w-full pl-9 pr-3 py-1.5 text-sm placeholder:text-muted"
                  />
                </div>
              </div>

              {activeSection === 'clientes' && (
                <section className="bg-surface border border-line rounded-lg overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-ink">
                      Directorio de clientes semilla
                    </h2>
                    <span className="text-xs text-muted font-mono tabular-nums">
                      {filteredClientes.length} de {dataset.clientes.length} registros
                    </span>
                  </div>

                  {filteredClientes.length === 0 ? (
                    <div className="p-8 text-center space-y-2">
                      <p className="text-sm text-secondary">
                        No hay clientes que coincidan con el filtro aplicado.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSectorFilter('todos');
                          setSearchQuery('');
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-accent hover:underline"
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  ) : (
                    <TableScroll label="Clientes y anomalías">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-line bg-canvas text-xs font-medium text-muted">
                            <th scope="col" className="py-2.5 px-4">Cliente</th>
                            <th scope="col" className="py-2.5 px-4">Sector</th>
                            <th scope="col" className="py-2.5 px-4">Zona</th>
                            <th scope="col" className="py-2.5 px-4">Ventana</th>
                            <th scope="col" className="py-2.5 px-4">Cédula jurídica</th>
                            <th scope="col" className="py-2.5 px-4">Nota operativa</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {filteredClientes.map((c) => {
                            const isWaitAnomaly =
                              c.id === dataset.anomaliesSummary.excessiveWaitClientId;
                            const isRejectAnomaly =
                              c.id === dataset.anomaliesSummary.recurringRejectionClientId;
                            return (
                              <tr key={c.id} className="hover:bg-subtle transition-colors">
                                <td className="py-2.5 px-4 font-medium text-ink whitespace-nowrap">
                                  {c.nombre}
                                </td>
                                <td className="py-2.5 px-4 text-secondary whitespace-nowrap">
                                  {SECTOR_LABELS[c.sector]}
                                </td>
                                <td className="py-2.5 px-4 text-secondary whitespace-nowrap">
                                  {c.zona}
                                </td>
                                <td className="py-2.5 px-4 font-mono tabular-nums text-xs text-secondary whitespace-nowrap">
                                  {c.ventana_inicio.slice(0, 5)}–{c.ventana_fin.slice(0, 5)}
                                </td>
                                <td className="py-2.5 px-4 font-mono tabular-nums text-xs text-secondary whitespace-nowrap">
                                  {c.cedula_juridica}
                                </td>
                                <td className="py-2.5 px-4 text-xs whitespace-nowrap">
                                  {isWaitAnomaly ? (
                                    <span className="font-medium text-warning">
                                      Anomalía: esperas 68–92 min
                                    </span>
                                  ) : isRejectAnomaly ? (
                                    <span className="font-medium text-danger">
                                      Anomalía: rechazos recurrentes
                                    </span>
                                  ) : (
                                    <span className="text-muted">Operación nominal</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </TableScroll>
                  )}
                </section>
              )}

              {activeSection === 'inventario' && (
                <section className="bg-surface border border-line rounded-lg overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-ink">
                      Inventario multisector agnóstico a unidad de carga
                    </h2>
                    <span className="text-xs text-muted font-mono tabular-nums">
                      {filteredProductos.length} de {dataset.productos_inventario.length} SKUs
                    </span>
                  </div>

                  {filteredProductos.length === 0 ? (
                    <div className="p-8 text-center space-y-2">
                      <p className="text-sm text-secondary">
                        No hay productos que coincidan con el filtro aplicado.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSectorFilter('todos');
                          setSearchQuery('');
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-accent hover:underline"
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  ) : (
                    <TableScroll label="Inventario multisector">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-line bg-canvas text-xs font-medium text-muted">
                            <th scope="col" className="py-2.5 px-4">SKU</th>
                            <th scope="col" className="py-2.5 px-4">Producto</th>
                            <th scope="col" className="py-2.5 px-4">Sector</th>
                            <th scope="col" className="py-2.5 px-4">Unidad</th>
                            <th scope="col" className="py-2.5 px-4 text-right">Stock actual</th>
                            <th scope="col" className="py-2.5 px-4 text-right">Precio unitario</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {filteredProductos.map((p) => (
                            <tr key={p.id} className="hover:bg-subtle transition-colors">
                              <td className="py-2.5 px-4 font-mono text-xs text-secondary whitespace-nowrap">
                                {p.sku}
                              </td>
                              <td className="py-2.5 px-4 font-medium text-ink">
                                {p.nombre}
                              </td>
                              <td className="py-2.5 px-4 text-secondary whitespace-nowrap">
                                {SECTOR_LABELS[p.sector]}
                              </td>
                              <td className="py-2.5 px-4 text-secondary whitespace-nowrap">
                                {p.unidad_medida}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-secondary whitespace-nowrap">
                                {formatInt(p.stock_actual)}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-ink whitespace-nowrap">
                                {formatColones(p.precio_unitario)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableScroll>
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
