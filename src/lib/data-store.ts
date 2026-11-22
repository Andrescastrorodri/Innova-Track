import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildRouteStopsForDispatch, computeDriverTripSummary, validateDeliveryInput, type DriverTripSummary } from './driver-logic';
import { generateSeedDataset } from './seed-data';
import { getSupabaseAdminClient } from './supabase';
import type {
  Cliente,
  EmpresaConfig,
  Entrega,
  Gasto,
  GpsPoint,
  ModalidadEnvio,
  OrigenInput,
  Pedido,
  PedidoItem,
  ProductoInventario,
  SeedDataset,
  TipoGasto,
  TipoOperacion,
  Tramo,
  UnidadMedida,
  Vehiculo,
  Viaje,
} from './types';

const STORE_DIR = path.resolve(process.cwd(), '.data');
const STORE_FILE = path.join(STORE_DIR, 'innova-track-store.json');
const EVIDENCE_DIR = path.join(STORE_DIR, 'evidencias');

function hasSupabaseConfig(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(
    url &&
      key &&
      !url.includes('your-project-id') &&
      !key.includes('your-supabase-service-role-key')
  );
}

/** Fecha de hoy en Costa Rica (UTC-6, sin horario de verano) como YYYY-MM-DD. */
export function crToday(now: Date = new Date()): string {
  return new Date(now.getTime() - 6 * 3600 * 1000).toISOString().slice(0, 10);
}

function nextTrackingCode(pedidos: Pedido[]): string {
  const max = pedidos.reduce((acc, p) => {
    const n = Number(p.codigo_tracking.replace(/\D/g, ''));
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 9100);
  return `IT-${max + 1}`;
}

/**
 * Datos de demostración: dos semanas de operación que terminan ayer, más tres pedidos
 * facturados de hoy (uno por zona) esperando ruta, para que el chofer tenga carga real.
 */
export function buildDemoStore(now: Date = new Date()): SeedDataset {
  const today = crToday(now);
  const start = new Date(`${today}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 14);
  const store = generateSeedDataset(start.toISOString().slice(0, 10));

  const empresa = store.empresas_config.find((e) => e.tipo_operacion === 'distribuidora_flotilla');
  if (!empresa) return store;

  const pendientes: Array<{ cliente: string; items: Array<[sku: string, cantidad: number]> }> = [
    { cliente: 'Minisúper Rohrmoser Norte', items: [['ABR-101', 6], ['ABR-102', 4]] },
    { cliente: 'Ferretería El Yunque Curridabat', items: [['FER-201', 20], ['FER-202', 3]] },
    { cliente: 'Clínica Dental Heredia Norte', items: [['MED-301', 12], ['MED-302', 8]] },
  ];

  pendientes.forEach((p, idx) => {
    const cliente = store.clientes.find((c) => c.nombre === p.cliente && c.empresa_id === empresa.id);
    if (!cliente) return;
    const items: PedidoItem[] = [];
    for (const [sku, cantidad] of p.items) {
      const prod = store.productos_inventario.find((x) => x.sku === sku && x.empresa_id === empresa.id);
      if (prod) {
        items.push({ sku, nombre: prod.nombre, cantidad, unidad: prod.unidad_medida, precio: prod.precio_unitario });
      }
    }
    if (items.length === 0) return;
    const subtotal = Math.round(items.reduce((a, it) => a + it.cantidad * it.precio, 0) * 100) / 100;
    const iva = Math.round(subtotal * 0.13 * 100) / 100;
    const codigo = nextTrackingCode(store.pedidos);
    store.pedidos.push({
      id: randomUUID(),
      empresa_id: empresa.id,
      codigo_tracking: codigo,
      cliente_id: cliente.id,
      origen_input: 'texto',
      raw_input_url: null,
      items_json: items,
      subtotal,
      iva,
      total: Math.round((subtotal + iva) * 100) / 100,
      estado_factura: 'facturado',
      numero_factura_externa: `FE-CR-${codigo.replace(/\D/g, '').padStart(10, '0')}`,
      modalidad_envio: 'flotilla_propia',
      proveedor_externo_nombre: null,
      tracking_externo_url: null,
      estado_entrega: 'pendiente_ruta',
      created_at: `${today}T${String(6 + idx).padStart(2, '0')}:15:00-06:00`,
    });
  });

  return store;
}

/** Restaura los datos de demostración y borra las evidencias generadas (fotos y firmas locales). */
export function resetDemoStore(): { pedidos: number; viajes: number; evidencias_borradas: number } {
  const store = buildDemoStore();
  writeLocalStore(store);

  let evidencias_borradas = 0;
  if (fs.existsSync(EVIDENCE_DIR)) {
    for (const file of fs.readdirSync(EVIDENCE_DIR)) {
      fs.rmSync(path.join(EVIDENCE_DIR, file), { force: true });
      evidencias_borradas += 1;
    }
  }
  return { pedidos: store.pedidos.length, viajes: store.viajes.length, evidencias_borradas };
}

function readLocalStore(): SeedDataset {
  if (!fs.existsSync(STORE_FILE)) {
    const seed = buildDemoStore();
    writeLocalStore(seed);
    return seed;
  }
  const raw = fs.readFileSync(STORE_FILE, 'utf-8');
  return JSON.parse(raw) as SeedDataset;
}

function writeLocalStore(data: SeedDataset): void {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function getOperationalContext(empresaId?: string): Promise<{
  empresas: EmpresaConfig[];
  empresa: EmpresaConfig;
  clientes: Cliente[];
  inventario: ProductoInventario[];
  vehiculos: Vehiculo[];
  tramos: Tramo[];
  viajes: Viaje[];
}> {
  if (hasSupabaseConfig()) {
    try {
      const supabase = getSupabaseAdminClient();
      const [empRes, cliRes, invRes, vehRes, traRes, viaRes] = await Promise.all([
        supabase.from('empresas_config').select('*'),
        supabase.from('clientes').select('*'),
        supabase.from('productos_inventario').select('*'),
        supabase.from('vehiculos').select('*'),
        supabase.from('tramos').select('*'),
        supabase.from('viajes').select('*').order('fecha', { ascending: false }).limit(30),
      ]);

      const empresas = (empRes.data ?? []) as EmpresaConfig[];
      if (empresas.length > 0) {
        const empresa = empresas.find((e) => e.id === empresaId) ?? empresas[0];
        return {
          empresas,
          empresa,
          clientes: (cliRes.data ?? []) as Cliente[],
          inventario: (invRes.data ?? []) as ProductoInventario[],
          vehiculos: (vehRes.data ?? []) as Vehiculo[],
          tramos: (traRes.data ?? []) as Tramo[],
          viajes: (viaRes.data ?? []) as Viaje[],
        };
      }
    } catch {
      // Fallback to local store if Supabase schema is not yet applied
    }
  }

  const store = readLocalStore();
  const empresa =
    store.empresas_config.find((e) => e.id === empresaId) ?? store.empresas_config[0];
  return {
    empresas: store.empresas_config,
    empresa,
    clientes: store.clientes,
    inventario: store.productos_inventario,
    vehiculos: store.vehiculos,
    tramos: store.tramos,
    viajes: store.viajes,
  };
}

export async function reserveInventoryStock(
  empresaId: string,
  items: Array<{ sku: string; cantidad: number }>
): Promise<{
  updatedItems: Array<{ sku: string; stock_anterior: number; stock_nuevo: number; reservado: number }>;
}> {
  if (hasSupabaseConfig()) {
    try {
      const supabase = getSupabaseAdminClient();
      const updatedItems: Array<{
        sku: string;
        stock_anterior: number;
        stock_nuevo: number;
        reservado: number;
      }> = [];

      for (const item of items) {
        const { data: prod } = await supabase
          .from('productos_inventario')
          .select('*')
          .eq('empresa_id', empresaId)
          .eq('sku', item.sku)
          .maybeSingle();

        if (prod) {
          const prev = Number(prod.stock_actual);
          const next = Math.max(0, Math.round((prev - item.cantidad) * 100) / 100);
          await supabase
            .from('productos_inventario')
            .update({ stock_actual: next, ultima_sincronizacion_api: new Date().toISOString() })
            .eq('id', prod.id);
          updatedItems.push({
            sku: item.sku,
            stock_anterior: prev,
            stock_nuevo: next,
            reservado: item.cantidad,
          });
        }
      }
      if (updatedItems.length > 0) {
        return { updatedItems };
      }
    } catch {
      // Fall back to local store
    }
  }

  const store = readLocalStore();
  const updatedItems: Array<{
    sku: string;
    stock_anterior: number;
    stock_nuevo: number;
    reservado: number;
  }> = [];

  for (const item of items) {
    // Solo se reserva stock de la empresa del pedido: nunca del catálogo de otra.
    const prod = store.productos_inventario.find(
      (p) => p.sku === item.sku && (p.empresa_id === empresaId || !empresaId)
    );

    if (prod) {
      const prev = prod.stock_actual;
      const next = Math.max(0, Math.round((prev - item.cantidad) * 100) / 100);
      prod.stock_actual = next;
      prod.ultima_sincronizacion_api = new Date().toISOString();
      updatedItems.push({
        sku: prod.sku,
        stock_anterior: prev,
        stock_nuevo: next,
        reservado: item.cantidad,
      });
    }
  }

  writeLocalStore(store);
  return { updatedItems };
}

export interface CreateOrderInput {
  empresa_id: string;
  cliente: {
    id: string | null;
    nombre: string;
    cedula_juridica: string;
    correo_facturacion: string;
    telefono: string;
    zona: string;
    ventana_inicio: string;
    ventana_fin: string;
  };
  origen_input: OrigenInput;
  items: PedidoItem[];
  subtotal: number;
  iva: number;
  total: number;
  modalidad_envio: ModalidadEnvio;
}

export async function createPedidoWithClient(input: CreateOrderInput): Promise<{
  pedido: Pedido;
  cliente: Cliente;
}> {
  const store = readLocalStore();

  let clienteRecord = input.cliente.id
    ? store.clientes.find((c) => c.id === input.cliente.id)
    : undefined;

  if (!clienteRecord) {
    clienteRecord = {
      id: randomUUID(),
      empresa_id: input.empresa_id,
      nombre: input.cliente.nombre,
      cedula_juridica: input.cliente.cedula_juridica,
      correo_facturacion: input.cliente.correo_facturacion,
      telefono: input.cliente.telefono || '+506 2200-0000',
      sector: 'abarrotes',
      zona: input.cliente.zona || 'Oeste',
      ventana_inicio: input.cliente.ventana_inicio || '08:00:00',
      ventana_fin: input.cliente.ventana_fin || '16:00:00',
      lat: 9.9347,
      lng: -84.0875,
    };
    store.clientes.push(clienteRecord);
  }

  const codigo_tracking = nextTrackingCode(store.pedidos);

  const pedido: Pedido = {
    id: randomUUID(),
    empresa_id: input.empresa_id,
    codigo_tracking,
    cliente_id: clienteRecord.id,
    origen_input: input.origen_input,
    raw_input_url: null,
    items_json: input.items,
    subtotal: input.subtotal,
    iva: input.iva,
    total: input.total,
    estado_factura: 'pendiente',
    numero_factura_externa: null,
    modalidad_envio: input.modalidad_envio,
    proveedor_externo_nombre: null,
    tracking_externo_url: null,
    estado_entrega: 'pendiente_ruta',
    created_at: new Date().toISOString(),
  };

  if (hasSupabaseConfig()) {
    try {
      const supabase = getSupabaseAdminClient();
      if (!input.cliente.id) {
        await supabase.from('clientes').upsert(clienteRecord, { onConflict: 'id' });
      }
      const { error } = await supabase.from('pedidos').insert(pedido);
      if (!error) {
        return { pedido, cliente: clienteRecord };
      }
    } catch {
      // Fallback to local store
    }
  }

  store.pedidos.push(pedido);
  writeLocalStore(store);
  return { pedido, cliente: clienteRecord };
}

export async function updatePedidoInvoice(
  pedidoId: string,
  estado_factura: Pedido['estado_factura'],
  numero_factura_externa: string | null
): Promise<Pedido | null> {
  if (hasSupabaseConfig()) {
    try {
      const supabase = getSupabaseAdminClient();
      const { data } = await supabase
        .from('pedidos')
        .update({ estado_factura, numero_factura_externa })
        .eq('id', pedidoId)
        .select('*')
        .maybeSingle();
      if (data) return data as Pedido;
    } catch {
      // Fallback
    }
  }

  const store = readLocalStore();
  const pedido = store.pedidos.find((p) => p.id === pedidoId || p.codigo_tracking === pedidoId);
  if (!pedido) return null;

  pedido.estado_factura = estado_factura;
  pedido.numero_factura_externa = numero_factura_externa;
  writeLocalStore(store);
  return pedido;
}

export async function dispatchPedido(params: {
  pedidoId: string;
  modalidad_envio: ModalidadEnvio;
  proveedor_externo_nombre?: string | null;
  tracking_externo_url?: string | null;
  viaje_id?: string | null;
  courier_tarifa_colones?: number;
}): Promise<{ pedido: Pedido; entrega?: Entrega } | null> {
  const store = readLocalStore();
  const pedido = store.pedidos.find(
    (p) => p.id === params.pedidoId || p.codigo_tracking === params.pedidoId
  );
  if (!pedido) return null;

  // Con flotilla propia el pedido solo está "en ruta" si ya hay un viaje en curso que lo lleve;
  // si no, queda asignado a la ruta y espera a que el chofer la inicie.
  const activeViajeId =
    params.modalidad_envio === 'flotilla_propia' && params.viaje_id
      ? store.viajes.find((v) => v.id === params.viaje_id && v.estado === 'en_curso')?.id ?? null
      : null;

  pedido.modalidad_envio = params.modalidad_envio;
  pedido.estado_entrega =
    params.modalidad_envio === 'proveedor_externo' || activeViajeId ? 'en_ruta' : 'pendiente_ruta';
  pedido.proveedor_externo_nombre = params.proveedor_externo_nombre ?? null;
  pedido.tracking_externo_url = params.tracking_externo_url ?? null;

  let newEntrega: Entrega | undefined;
  const existingEntrega = store.entregas.find((e) => e.pedido_id === pedido.id);

  if (params.modalidad_envio === 'flotilla_propia' && existingEntrega) {
    newEntrega = existingEntrega;
  } else if (params.modalidad_envio === 'flotilla_propia') {
    const existingCount = activeViajeId
      ? store.entregas.filter((e) => e.viaje_id === activeViajeId).length
      : 0;
    newEntrega = {
      id: randomUUID(),
      empresa_id: pedido.empresa_id,
      viaje_id: activeViajeId,
      pedido_id: pedido.id,
      cliente_id: pedido.cliente_id,
      orden: existingCount + 1,
      hora_llegada: null,
      gps_llegada: null,
      hora_salida: null,
      cantidad_entregada: 0,
      cantidad_rechazada: 0,
      unidad_medida: pedido.items_json[0]?.unidad ?? 'unidades',
      motivo_rechazo: null,
      foto_comprobante: null,
      estado: 'pendiente',
    };
    store.entregas.push(newEntrega);
  } else if (params.modalidad_envio === 'proveedor_externo' && params.courier_tarifa_colones) {
    const gasto: Gasto = {
      id: randomUUID(),
      empresa_id: pedido.empresa_id,
      viaje_id: null,
      pedido_id: pedido.id,
      tipo: 'courier_externo',
      litros: null,
      monto_colones: params.courier_tarifa_colones,
      foto_factura: null,
      fecha_gasto: new Date().toISOString(),
    };
    store.gastos.push(gasto);
  }

  if (hasSupabaseConfig()) {
    try {
      const supabase = getSupabaseAdminClient();
      await supabase
        .from('pedidos')
        .update({
          modalidad_envio: pedido.modalidad_envio,
          estado_entrega: pedido.estado_entrega,
          proveedor_externo_nombre: pedido.proveedor_externo_nombre,
          tracking_externo_url: pedido.tracking_externo_url,
        })
        .eq('id', pedido.id);

      if (newEntrega) {
        await supabase.from('entregas').insert(newEntrega);
      }
      return { pedido, entrega: newEntrega };
    } catch {
      // Fallback
    }
  }

  writeLocalStore(store);
  return { pedido, entrega: newEntrega };
}

export async function getTrackingDetailsByCode(codigo: string): Promise<{
  pedido: Pedido;
  empresa: EmpresaConfig;
  cliente: Cliente;
  entrega: Entrega | null;
  viaje: Viaje | null;
  vehiculo: Vehiculo | null;
} | null> {
  const normalizedCode = codigo.trim().toUpperCase();

  if (hasSupabaseConfig()) {
    try {
      const supabase = getSupabaseAdminClient();
      const { data: pedido } = await supabase
        .from('pedidos')
        .select('*')
        .ilike('codigo_tracking', normalizedCode)
        .maybeSingle();

      if (pedido) {
        const [empRes, cliRes, entRes] = await Promise.all([
          supabase.from('empresas_config').select('*').eq('id', pedido.empresa_id).single(),
          supabase.from('clientes').select('*').eq('id', pedido.cliente_id).single(),
          supabase.from('entregas').select('*').eq('pedido_id', pedido.id).maybeSingle(),
        ]);

        let viaje: Viaje | null = null;
        let vehiculo: Vehiculo | null = null;
        if (entRes.data?.viaje_id) {
          const { data: vData } = await supabase
            .from('viajes')
            .select('*')
            .eq('id', entRes.data.viaje_id)
            .maybeSingle();
          viaje = (vData as Viaje | null) ?? null;
          if (viaje?.vehiculo_id) {
            const { data: vehData } = await supabase
              .from('vehiculos')
              .select('*')
              .eq('id', viaje.vehiculo_id)
              .maybeSingle();
            vehiculo = (vehData as Vehiculo | null) ?? null;
          }
        }

        if (empRes.data && cliRes.data) {
          return {
            pedido: pedido as Pedido,
            empresa: empRes.data as EmpresaConfig,
            cliente: cliRes.data as Cliente,
            entrega: (entRes.data as Entrega | null) ?? null,
            viaje,
            vehiculo,
          };
        }
      }
    } catch {
      // Fallback
    }
  }

  const store = readLocalStore();
  const pedido = store.pedidos.find(
    (p) => p.codigo_tracking.toUpperCase() === normalizedCode
  );
  if (!pedido) return null;

  const empresa =
    store.empresas_config.find((e) => e.id === pedido.empresa_id) ?? store.empresas_config[0];
  const cliente = store.clientes.find((c) => c.id === pedido.cliente_id);
  if (!cliente) return null;

  const entrega = store.entregas.find((e) => e.pedido_id === pedido.id) ?? null;
  const viaje = entrega?.viaje_id
    ? store.viajes.find((v) => v.id === entrega.viaje_id) ?? null
    : null;
  const vehiculo = viaje
    ? store.vehiculos.find((vh) => vh.id === viaje.vehiculo_id) ?? null
    : null;

  return { pedido, empresa, cliente, entrega, viaje, vehiculo };
}

// ============================================================================
// Fase 3: Evidencias (Bucket 'evidencias') y App Móvil del Chofer
// ============================================================================

export async function saveEvidenceFile(params: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  folder?: string;
}): Promise<{ url: string; storage: 'supabase' | 'local' }> {
  const ext =
    path.extname(params.originalName).replace(/[^a-zA-Z0-9.]/g, '') ||
    (params.mimeType.includes('png') ? '.png' : '.jpg');
  const safeFolder = (params.folder || 'general').replace(/[^a-zA-Z0-9_-]/g, '');
  const fileName = `${safeFolder}-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;

  if (hasSupabaseConfig()) {
    try {
      const supabase = getSupabaseAdminClient();
      const storagePath = `${safeFolder}/${fileName}`;
      const { error } = await supabase.storage
        .from('evidencias')
        .upload(storagePath, params.buffer, {
          contentType: params.mimeType || 'image/jpeg',
          upsert: true,
        });
      if (!error) {
        const { data: pub } = supabase.storage.from('evidencias').getPublicUrl(storagePath);
        if (pub?.publicUrl) {
          return { url: pub.publicUrl, storage: 'supabase' };
        }
      }
    } catch {
      // Fallback to local evidence store
    }
  }

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE_DIR, fileName), params.buffer);
  return { url: `/api/evidencias/${fileName}`, storage: 'local' };
}

export function readLocalEvidenceFile(fileName: string): { buffer: Buffer; mimeType: string } | null {
  const safeName = path.basename(fileName);
  const fullPath = path.join(EVIDENCE_DIR, safeName);
  if (!fs.existsSync(fullPath)) return null;
  const buffer = fs.readFileSync(fullPath);
  const ext = path.extname(safeName).toLowerCase();
  const mimeType =
    ext === '.png'
      ? 'image/png'
      : ext === '.webp'
        ? 'image/webp'
        : ext === '.pdf'
          ? 'application/pdf'
          : 'image/jpeg';
  return { buffer, mimeType };
}

export interface DriverStopWithDetails {
  entrega: Entrega;
  pedido: Pedido;
  cliente: Cliente;
}

export async function getDriverContext(empresaId?: string): Promise<{
  empresa: EmpresaConfig;
  vehiculos: Vehiculo[];
  tramos: Tramo[];
  choferes: string[];
  activeViaje: Viaje | null;
  activeStops: DriverStopWithDetails[];
  activeGastos: Gasto[];
  pendingByTramo: Record<string, Array<{ pedido: Pedido; cliente: Cliente }>>;
}> {
  const store = readLocalStore();
  const empresa =
    (empresaId ? store.empresas_config.find((e) => e.id === empresaId) : undefined) ??
    store.empresas_config.find((e) => e.tipo_operacion === 'distribuidora_flotilla') ??
    store.empresas_config[0];

  const vehiculos = store.vehiculos.filter((v) => v.empresa_id === empresa.id);
  const tramos = store.tramos.filter((t) => t.empresa_id === empresa.id);
  const choferes = Array.from(
    new Set([
      'Carlos Méndez Mora',
      'Kendall Jiménez Vargas',
      'Minor Solís Alvarado',
      ...store.viajes.filter((v) => v.empresa_id === empresa.id).map((v) => v.chofer_nombre),
    ])
  );

  const clientMap = new Map(store.clientes.map((c) => [c.id, c]));
  const pedidoMap = new Map(store.pedidos.map((p) => [p.id, p]));

  const activeViaje =
    [...store.viajes]
      .reverse()
      .find((v) => v.empresa_id === empresa.id && v.estado === 'en_curso') ?? null;

  const activeStops: DriverStopWithDetails[] = activeViaje
    ? store.entregas
        .filter((e) => e.viaje_id === activeViaje.id)
        .sort((a, b) => a.orden - b.orden)
        .map((entrega) => {
          const pedido = pedidoMap.get(entrega.pedido_id);
          const cliente = clientMap.get(entrega.cliente_id);
          if (!pedido || !cliente) return null;
          return { entrega, pedido, cliente };
        })
        .filter((x): x is DriverStopWithDetails => x !== null)
    : [];

  const activeGastos = activeViaje
    ? store.gastos.filter((g) => g.viaje_id === activeViaje.id)
    : [];

  const pendingByTramo: Record<string, Array<{ pedido: Pedido; cliente: Cliente }>> = {};
  for (const tramo of tramos) {
    const candidates = buildRouteStopsForDispatch(
      tramo,
      store.pedidos,
      store.clientes,
      empresa.id
    ).filter((cand) => {
      // Exclude pedidos already completed/rejected in an entrega
      const ent = store.entregas.find((e) => e.pedido_id === cand.pedido.id);
      return !ent || ent.estado === 'pendiente' || ent.estado === 'en_sitio';
    });

    pendingByTramo[tramo.id] = candidates.map((c) => ({ pedido: c.pedido, cliente: c.cliente }));
  }

  return {
    empresa,
    vehiculos,
    tramos,
    choferes,
    activeViaje,
    activeStops,
    activeGastos,
    pendingByTramo,
  };
}

export async function startDriverRoute(params: {
  empresa_id: string;
  chofer_nombre: string;
  vehiculo_id: string;
  tramo_id: string;
  odometro_inicio: number;
  foto_odometro_inicio: string;
  gps_salida: GpsPoint;
}): Promise<{
  viaje: Viaje;
  stops: DriverStopWithDetails[];
}> {
  const store = readLocalStore();
  const tramo = store.tramos.find((t) => t.id === params.tramo_id) ?? store.tramos[0];
  if (!tramo) {
    throw new Error('No se encontró la ruta seleccionada.');
  }

  // Close any stale in-progress trips only if requested; normally create fresh active trip
  const candidates = buildRouteStopsForDispatch(
    tramo,
    store.pedidos,
    store.clientes,
    params.empresa_id
  ).filter((cand) => {
    const existingEnt = store.entregas.find((e) => e.pedido_id === cand.pedido.id);
    return !existingEnt || existingEnt.estado === 'pendiente';
  });

  const stopsToCreate: Array<{ pedido: Pedido; cliente: Cliente }> = candidates.map((c) => ({
    pedido: c.pedido,
    cliente: c.cliente,
  }));

  // Una ruta sin pedidos no se inicia: no se inventan paradas.
  if (stopsToCreate.length === 0) {
    throw new Error(
      `No hay pedidos pendientes para ${tramo.ruta_nombre}. Despacha un pedido de esa zona desde el copiloto o elige otra ruta.`
    );
  }

  const cargaTotal = stopsToCreate.reduce(
    (sum, s) => sum + s.pedido.items_json.reduce((a, it) => a + it.cantidad, 0),
    0
  );

  const nowIso = new Date().toISOString();
  const viaje: Viaje = {
    id: randomUUID(),
    empresa_id: params.empresa_id,
    fecha: crToday(),
    ruta_nombre: tramo.ruta_nombre,
    tramo_id: tramo.id,
    vehiculo_id: params.vehiculo_id,
    chofer_nombre: params.chofer_nombre,
    estado: 'en_curso',
    odometro_inicio: params.odometro_inicio,
    foto_odometro_inicio: params.foto_odometro_inicio,
    hora_salida: nowIso,
    gps_salida: params.gps_salida,
    carga_total_inicial: cargaTotal,
    unidad_carga: stopsToCreate[0]?.pedido.items_json[0]?.unidad ?? 'cajas',
    odometro_fin: params.odometro_inicio,
    foto_odometro_fin: '',
    hora_regreso: '',
    gps_regreso: params.gps_salida,
  };

  store.viajes.push(viaje);

  const createdStops: DriverStopWithDetails[] = stopsToCreate.map(({ pedido, cliente }, idx) => {
    pedido.estado_entrega = 'en_ruta';
    const expectedUnits = pedido.items_json.reduce((a, it) => a + it.cantidad, 0);
    const existingPending = store.entregas.find(
      (e) => e.pedido_id === pedido.id && e.estado === 'pendiente'
    );

    if (existingPending) {
      existingPending.viaje_id = viaje.id;
      existingPending.orden = idx + 1;
      return { entrega: existingPending, pedido, cliente };
    }

    const entrega: Entrega = {
      id: randomUUID(),
      empresa_id: params.empresa_id,
      viaje_id: viaje.id,
      pedido_id: pedido.id,
      cliente_id: cliente.id,
      orden: idx + 1,
      hora_llegada: null,
      gps_llegada: null,
      hora_salida: null,
      cantidad_entregada: 0,
      cantidad_rechazada: 0,
      unidad_medida: pedido.items_json[0]?.unidad ?? 'unidades',
      motivo_rechazo: null,
      foto_comprobante: null,
      estado: 'pendiente',
    };
    store.entregas.push(entrega);
    return { entrega, pedido, cliente };
  });

  if (hasSupabaseConfig()) {
    try {
      const supabase = getSupabaseAdminClient();
      // Un viaje en curso aún no tiene cierre: en Postgres esos campos van como NULL, no como texto vacío.
      await supabase.from('viajes').insert({
        ...viaje,
        foto_odometro_fin: viaje.foto_odometro_fin || null,
        hora_regreso: viaje.hora_regreso || null,
      });
      for (const st of createdStops) {
        await supabase.from('pedidos').upsert(st.pedido, { onConflict: 'id' });
        await supabase.from('entregas').upsert(st.entrega, { onConflict: 'id' });
      }
    } catch {
      // Fallback persisted locally below
    }
  }

  writeLocalStore(store);
  return { viaje, stops: createdStops };
}

export async function recordStopArrival(params: {
  entrega_id: string;
  gps_llegada: GpsPoint;
}): Promise<Entrega> {
  const store = readLocalStore();
  const entrega = store.entregas.find((e) => e.id === params.entrega_id);
  if (!entrega) {
    throw new Error('Parada no encontrada.');
  }

  const nowIso = new Date().toISOString();
  entrega.hora_llegada = nowIso;
  entrega.gps_llegada = params.gps_llegada;
  entrega.estado = 'en_sitio';

  if (hasSupabaseConfig()) {
    try {
      const supabase = getSupabaseAdminClient();
      await supabase
        .from('entregas')
        .update({ hora_llegada: nowIso, gps_llegada: params.gps_llegada, estado: 'en_sitio' })
        .eq('id', entrega.id);
    } catch {
      // Fallback
    }
  }

  writeLocalStore(store);
  return entrega;
}

export async function recordStopDelivery(params: {
  entrega_id: string;
  cantidad_entregada: number;
  cantidad_rechazada: number;
  motivo_rechazo?: string | null;
  foto_comprobante: string;
}): Promise<{ entrega: Entrega; pedido: Pedido }> {
  const store = readLocalStore();
  const entrega = store.entregas.find((e) => e.id === params.entrega_id);
  if (!entrega) {
    throw new Error('Parada no encontrada.');
  }
  const pedido = store.pedidos.find((p) => p.id === entrega.pedido_id);
  if (!pedido) {
    throw new Error('Pedido asociado no encontrado.');
  }

  const expected = pedido.items_json.reduce((a, it) => a + it.cantidad, 0);
  const validation = validateDeliveryInput({
    cantidadEsperada: expected,
    cantidadEntregada: params.cantidad_entregada,
    cantidadRechazada: params.cantidad_rechazada,
    motivoRechazo: params.motivo_rechazo,
    hasProof: Boolean(params.foto_comprobante),
  });

  if (!validation.valid) {
    throw new Error(validation.error || 'Datos de entrega inválidos.');
  }

  const nowIso = new Date().toISOString();
  if (!entrega.hora_llegada) {
    entrega.hora_llegada = nowIso;
  }
  entrega.hora_salida = nowIso;
  entrega.cantidad_entregada = params.cantidad_entregada;
  entrega.cantidad_rechazada = params.cantidad_rechazada;
  entrega.motivo_rechazo =
    params.cantidad_rechazada > 0 ? params.motivo_rechazo ?? null : null;
  entrega.foto_comprobante = params.foto_comprobante;
  entrega.estado = validation.estado_parada;

  pedido.estado_entrega = validation.estado_pedido;

  if (hasSupabaseConfig()) {
    try {
      const supabase = getSupabaseAdminClient();
      await supabase.from('entregas').update(entrega).eq('id', entrega.id);
      await supabase
        .from('pedidos')
        .update({ estado_entrega: pedido.estado_entrega })
        .eq('id', pedido.id);
    } catch {
      // Fallback
    }
  }

  writeLocalStore(store);
  return { entrega, pedido };
}

export async function addDriverExpense(params: {
  empresa_id: string;
  viaje_id: string;
  tipo: Extract<TipoGasto, 'combustible' | 'peaje'>;
  litros?: number | null;
  monto_colones: number;
  foto_factura: string | null;
}): Promise<Gasto> {
  const store = readLocalStore();
  const gasto: Gasto = {
    id: randomUUID(),
    empresa_id: params.empresa_id,
    viaje_id: params.viaje_id,
    pedido_id: null,
    tipo: params.tipo,
    litros: params.tipo === 'combustible' ? params.litros ?? 0 : null,
    monto_colones: params.monto_colones,
    foto_factura: params.foto_factura,
    fecha_gasto: new Date().toISOString(),
  };

  store.gastos.push(gasto);

  if (hasSupabaseConfig()) {
    try {
      const supabase = getSupabaseAdminClient();
      await supabase.from('gastos').insert(gasto);
    } catch {
      // Fallback
    }
  }

  writeLocalStore(store);
  return gasto;
}

export async function closeDriverRoute(params: {
  viaje_id: string;
  odometro_fin: number;
  foto_odometro_fin: string;
  gps_regreso: GpsPoint;
}): Promise<{ viaje: Viaje; summary: DriverTripSummary }> {
  const store = readLocalStore();
  const viaje = store.viajes.find((v) => v.id === params.viaje_id);
  if (!viaje) {
    throw new Error('Viaje no encontrado.');
  }

  if (params.odometro_fin < viaje.odometro_inicio) {
    throw new Error(
      `El odómetro final (${params.odometro_fin}) no puede ser menor al inicial (${viaje.odometro_inicio}).`
    );
  }

  const nowIso = new Date().toISOString();
  viaje.odometro_fin = params.odometro_fin;
  viaje.foto_odometro_fin = params.foto_odometro_fin;
  viaje.hora_regreso = nowIso;
  viaje.gps_regreso = params.gps_regreso;

  const tramo = store.tramos.find((t) => t.id === viaje.tramo_id);
  const entregas = store.entregas.filter((e) => e.viaje_id === viaje.id);
  const gastos = store.gastos.filter((g) => g.viaje_id === viaje.id);
  const summary = computeDriverTripSummary(viaje, tramo, entregas, store.clientes, gastos);
  viaje.estado = summary.estado_cierre;

  if (hasSupabaseConfig()) {
    try {
      const supabase = getSupabaseAdminClient();
      await supabase
        .from('viajes')
        .update({
          odometro_fin: viaje.odometro_fin,
          foto_odometro_fin: viaje.foto_odometro_fin,
          hora_regreso: viaje.hora_regreso,
          gps_regreso: viaje.gps_regreso,
          estado: viaje.estado,
        })
        .eq('id', viaje.id);
    } catch {
      // Fallback
    }
  }

  writeLocalStore(store);
  return { viaje, summary };
}

// ============================================================================
// Fase 4: Analítica Gerencial Unificada y Configuración de APIs
// ============================================================================

export async function getFullDatasetForAnalytics(): Promise<SeedDataset> {
  const local = readLocalStore();

  if (hasSupabaseConfig()) {
    try {
      const supabase = getSupabaseAdminClient();
      const [
        empRes,
        prodRes,
        cliRes,
        vehRes,
        traRes,
        parRes,
        pedRes,
        viaRes,
        entRes,
        gasRes,
      ] = await Promise.all([
        supabase.from('empresas_config').select('*'),
        supabase.from('productos_inventario').select('*'),
        supabase.from('clientes').select('*'),
        supabase.from('vehiculos').select('*'),
        supabase.from('tramos').select('*'),
        supabase.from('parametros_costo').select('*'),
        supabase.from('pedidos').select('*'),
        supabase.from('viajes').select('*'),
        supabase.from('entregas').select('*'),
        supabase.from('gastos').select('*'),
      ]);

      if (empRes.data && empRes.data.length > 0) {
        return {
          ...local,
          empresas_config: empRes.data as EmpresaConfig[],
          productos_inventario: (prodRes.data ?? local.productos_inventario) as ProductoInventario[],
          clientes: (cliRes.data ?? local.clientes) as Cliente[],
          vehiculos: (vehRes.data ?? local.vehiculos) as Vehiculo[],
          tramos: (traRes.data ?? local.tramos) as Tramo[],
          parametros_costo: (parRes.data ?? local.parametros_costo) as SeedDataset['parametros_costo'],
          pedidos: (pedRes.data ?? local.pedidos) as Pedido[],
          viajes: (viaRes.data ?? local.viajes) as Viaje[],
          entregas: (entRes.data ?? local.entregas) as Entrega[],
          gastos: (gasRes.data ?? local.gastos) as Gasto[],
        };
      }
    } catch {
      // Fallback to local store
    }
  }

  return local;
}

export async function updateEmpresaConfig(input: {
  id: string;
  nombre?: string;
  tipo_operacion?: TipoOperacion;
  unidad_medida_default?: UnidadMedida;
  api_inventario_url?: string | null;
  api_facturacion_url?: string | null;
  api_courier_url?: string | null;
}): Promise<{ empresa: EmpresaConfig; empresas: EmpresaConfig[] }> {
  const store = readLocalStore();
  const empresa = store.empresas_config.find((e) => e.id === input.id);
  if (!empresa) {
    throw new Error('Empresa no encontrada.');
  }

  if (input.nombre !== undefined && input.nombre.trim()) {
    empresa.nombre = input.nombre.trim();
  }
  if (input.tipo_operacion !== undefined) {
    empresa.tipo_operacion = input.tipo_operacion;
  }
  if (input.unidad_medida_default !== undefined) {
    empresa.unidad_medida_default = input.unidad_medida_default;
  }
  if (input.api_inventario_url !== undefined) {
    empresa.api_inventario_url = input.api_inventario_url?.trim() || null;
  }
  if (input.api_facturacion_url !== undefined) {
    empresa.api_facturacion_url = input.api_facturacion_url?.trim() || null;
  }
  if (input.api_courier_url !== undefined) {
    empresa.api_courier_url = input.api_courier_url?.trim() || null;
  }

  if (hasSupabaseConfig()) {
    try {
      const supabase = getSupabaseAdminClient();
      await supabase
        .from('empresas_config')
        .update({
          nombre: empresa.nombre,
          tipo_operacion: empresa.tipo_operacion,
          unidad_medida_default: empresa.unidad_medida_default,
          api_inventario_url: empresa.api_inventario_url,
          api_facturacion_url: empresa.api_facturacion_url,
          api_courier_url: empresa.api_courier_url,
        })
        .eq('id', empresa.id);
    } catch {
      // Fallback persisted locally
    }
  }

  writeLocalStore(store);
  return { empresa, empresas: store.empresas_config };
}


