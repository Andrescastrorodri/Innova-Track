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

// ============================================================================
// Almacén: un solo camino para todas las operaciones.
//
// - Sin Supabase: los datos viven en .data/innova-track-store.json (demo local).
// - Con Supabase: se leen las tablas, se trabaja en memoria igual que en local,
//   y al guardar se envían solo las filas que cambiaron. No se toca el disco,
//   así que funciona en servicios sin disco persistente como Vercel.
// ============================================================================

const STORE_DIR = path.resolve(process.cwd(), '.data');
const STORE_FILE = path.join(STORE_DIR, 'innova-track-store.json');
const EVIDENCE_DIR = path.join(STORE_DIR, 'evidencias');

/** Tablas en orden de dependencia: una fila solo referencia tablas anteriores. */
export const STORE_TABLES = [
  'empresas_config',
  'productos_inventario',
  'clientes',
  'vehiculos',
  'tramos',
  'parametros_costo',
  'viajes',
  'pedidos',
  'entregas',
  'gastos',
] as const;
export type StoreTable = (typeof STORE_TABLES)[number];
type Row = { id: string } & Record<string, unknown>;

export function hasSupabaseConfig(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(
    url &&
      key &&
      !url.includes('your-project-id') &&
      !key.includes('your-supabase-service-role-key')
  );
}

export function storageMode(): 'supabase' | 'local' {
  return hasSupabaseConfig() ? 'supabase' : 'local';
}

/** Fecha de hoy en Costa Rica (UTC-6, sin horario de verano) como YYYY-MM-DD. */
export function crToday(now: Date = new Date()): string {
  return new Date(now.getTime() - 6 * 3600 * 1000).toISOString().slice(0, 10);
}

// --- Conversión entre filas de Postgres y los tipos de la app ----------------

const EMPTY_GPS: GpsPoint = { lat: 0, lng: 0, timestamp: '' };
const VIAJE_TEXT_FIELDS = ['foto_odometro_inicio', 'hora_salida', 'foto_odometro_fin', 'hora_regreso'] as const;
/** Columnas que agrega la base y que la app no usa. */
const DB_ONLY_COLUMNS = ['updated_at'];
const TABLES_WITHOUT_CREATED_AT: StoreTable[] = STORE_TABLES.filter((t) => t !== 'pedidos');

/** Fila de Postgres → objeto de la app: los NULL de un viaje sin cerrar pasan a texto vacío o cero. */
export function rowFromDb(table: StoreTable, raw: Record<string, unknown>): Row {
  const row: Record<string, unknown> = { ...raw };
  for (const col of DB_ONLY_COLUMNS) delete row[col];
  if (TABLES_WITHOUT_CREATED_AT.includes(table)) delete row.created_at;

  if (table === 'viajes') {
    for (const f of VIAJE_TEXT_FIELDS) row[f] = row[f] ?? '';
    row.odometro_inicio = Number(row.odometro_inicio ?? 0);
    row.odometro_fin = Number(row.odometro_fin ?? row.odometro_inicio ?? 0);
    row.gps_salida = row.gps_salida ?? EMPTY_GPS;
    row.gps_regreso = row.gps_regreso ?? row.gps_salida;
    row.tramo_id = row.tramo_id ?? '';
  }
  if (table === 'clientes') row.telefono = row.telefono ?? '';
  if (table === 'productos_inventario') row.ultima_sincronizacion_api = row.ultima_sincronizacion_api ?? '';
  return row as Row;
}

/** Objeto de la app → fila de Postgres: texto vacío en fechas y fotos pasa a NULL. */
export function rowToDb(table: StoreTable, row: Row): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  if (table === 'viajes') {
    for (const f of VIAJE_TEXT_FIELDS) if (out[f] === '') out[f] = null;
    if (out.tramo_id === '') out.tramo_id = null;
  }
  if (table === 'productos_inventario' && out.ultima_sincronizacion_api === '') {
    out.ultima_sincronizacion_api = null;
  }
  return out;
}

type Snapshot = Map<string, string>;

function takeSnapshot(data: SeedDataset): Snapshot {
  const snap: Snapshot = new Map();
  for (const table of STORE_TABLES) {
    for (const row of data[table] as unknown as Row[]) {
      snap.set(`${table}:${row.id}`, JSON.stringify(row));
    }
  }
  return snap;
}

/** Filas nuevas o modificadas desde la foto tomada al abrir el almacén, por tabla. */
export function diffStore(snapshot: Snapshot, data: SeedDataset): Array<{ table: StoreTable; rows: Row[] }> {
  const changes: Array<{ table: StoreTable; rows: Row[] }> = [];
  for (const table of STORE_TABLES) {
    const rows = (data[table] as unknown as Row[]).filter(
      (row) => snapshot.get(`${table}:${row.id}`) !== JSON.stringify(row)
    );
    if (rows.length > 0) changes.push({ table, rows });
  }
  return changes;
}

// --- Datos de demostración ---------------------------------------------------

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
      // Identificador fijo para que cargar la semilla dos veces no duplique el pedido.
      id: `dd000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`,
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

// --- Abrir y guardar -----------------------------------------------------------

interface StoreHandle {
  data: SeedDataset;
  /** null en modo local: ahí se reescribe el archivo completo. */
  snapshot: Snapshot | null;
}

function readLocalFile(): SeedDataset {
  if (!fs.existsSync(STORE_FILE)) {
    const seed = buildDemoStore();
    writeLocalFile(seed);
    return seed;
  }
  return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as SeedDataset;
}

function writeLocalFile(data: SeedDataset): void {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

async function fetchAllRows(table: StoreTable): Promise<Row[]> {
  const supabase = getSupabaseAdminClient();
  const pageSize = 1000;
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      throw new Error(`No se pudo leer la tabla ${table} en Supabase: ${error.message}`);
    }
    for (const raw of data ?? []) rows.push(rowFromDb(table, raw as Record<string, unknown>));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function readSupabase(): Promise<SeedDataset> {
  const tables = await Promise.all(STORE_TABLES.map((t) => fetchAllRows(t)));
  const byTable = Object.fromEntries(STORE_TABLES.map((t, i) => [t, tables[i]])) as Record<StoreTable, Row[]>;
  // El resumen de anomalías describe la semilla; no es una tabla.
  const { anomaliesSummary } = generateSeedDataset();
  return { ...(byTable as unknown as Omit<SeedDataset, 'anomaliesSummary'>), anomaliesSummary };
}

async function upsertRows(table: StoreTable, rows: Row[]): Promise<void> {
  const supabase = getSupabaseAdminClient();
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => rowToDb(table, r));
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' });
    if (error) {
      throw new Error(`No se pudo guardar en la tabla ${table} de Supabase: ${error.message}`);
    }
  }
}

async function openStore(): Promise<StoreHandle> {
  if (hasSupabaseConfig()) {
    const data = await readSupabase();
    if (data.empresas_config.length === 0) {
      throw new Error(
        'Supabase está configurado pero no tiene datos. Ejecuta supabase/schema.sql y luego `npm run seed`.'
      );
    }
    return { data, snapshot: takeSnapshot(data) };
  }
  return { data: readLocalFile(), snapshot: null };
}

async function commitStore(handle: StoreHandle): Promise<void> {
  if (handle.snapshot) {
    for (const { table, rows } of diffStore(handle.snapshot, handle.data)) {
      await upsertRows(table, rows);
    }
    return;
  }
  writeLocalFile(handle.data);
}

/** Restaura los datos de demostración y borra las evidencias locales generadas. */
export async function resetDemoStore(): Promise<{
  pedidos: number;
  viajes: number;
  evidencias_borradas: number;
  almacenamiento: 'supabase' | 'local';
}> {
  const store = buildDemoStore();
  let evidencias_borradas = 0;

  if (hasSupabaseConfig()) {
    const supabase = getSupabaseAdminClient();
    // Se vacía en orden inverso de dependencias y se vuelve a cargar la semilla.
    for (const table of [...STORE_TABLES].reverse()) {
      const { error } = await supabase.from(table).delete().not('id', 'is', null);
      if (error) {
        throw new Error(`No se pudo vaciar la tabla ${table} en Supabase: ${error.message}`);
      }
    }
    for (const table of STORE_TABLES) {
      await upsertRows(table, store[table] as unknown as Row[]);
    }

    // Fotos y firmas subidas al bucket: una carpeta por tipo de evidencia.
    const bucket = supabase.storage.from('evidencias');
    const { data: folders } = await bucket.list('', { limit: 100 });
    for (const folder of folders ?? []) {
      const { data: files } = await bucket.list(folder.name, { limit: 1000 });
      const paths = (files ?? []).map((f) => `${folder.name}/${f.name}`);
      if (paths.length > 0) {
        const { error } = await bucket.remove(paths);
        if (!error) evidencias_borradas += paths.length;
      }
    }
  } else {
    writeLocalFile(store);
    if (fs.existsSync(EVIDENCE_DIR)) {
      for (const file of fs.readdirSync(EVIDENCE_DIR)) {
        fs.rmSync(path.join(EVIDENCE_DIR, file), { force: true });
        evidencias_borradas += 1;
      }
    }
  }

  return {
    pedidos: store.pedidos.length,
    viajes: store.viajes.length,
    evidencias_borradas,
    almacenamiento: storageMode(),
  };
}

// ============================================================================
// Pedidos, inventario, factura y despacho
// ============================================================================

export async function getOperationalContext(empresaId?: string): Promise<{
  empresas: EmpresaConfig[];
  empresa: EmpresaConfig;
  clientes: Cliente[];
  inventario: ProductoInventario[];
  vehiculos: Vehiculo[];
  tramos: Tramo[];
  viajes: Viaje[];
}> {
  const { data: store } = await openStore();
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
  const handle = await openStore();
  const store = handle.data;
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
      const prev = Number(prod.stock_actual);
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

  await commitStore(handle);
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
  const handle = await openStore();
  const store = handle.data;

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

  const pedido: Pedido = {
    id: randomUUID(),
    empresa_id: input.empresa_id,
    codigo_tracking: nextTrackingCode(store.pedidos),
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

  store.pedidos.push(pedido);
  await commitStore(handle);
  return { pedido, cliente: clienteRecord };
}

export async function updatePedidoInvoice(
  pedidoId: string,
  estado_factura: Pedido['estado_factura'],
  numero_factura_externa: string | null
): Promise<Pedido | null> {
  const handle = await openStore();
  const pedido = handle.data.pedidos.find(
    (p) => p.id === pedidoId || p.codigo_tracking === pedidoId
  );
  if (!pedido) return null;

  pedido.estado_factura = estado_factura;
  pedido.numero_factura_externa = numero_factura_externa;
  await commitStore(handle);
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
  const handle = await openStore();
  const store = handle.data;
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
    // Un solo gasto de mensajería por pedido, aunque se despache dos veces.
    const yaRegistrado = store.gastos.some(
      (g) => g.pedido_id === pedido.id && g.tipo === 'courier_externo'
    );
    if (!yaRegistrado) {
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
  }

  await commitStore(handle);
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
  const { data: store } = await openStore();

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
// Evidencias (fotos y firmas)
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
    const supabase = getSupabaseAdminClient();
    const storagePath = `${safeFolder}/${fileName}`;
    const { error } = await supabase.storage
      .from('evidencias')
      .upload(storagePath, params.buffer, {
        contentType: params.mimeType || 'image/jpeg',
        upsert: true,
      });
    if (error) {
      throw new Error(`No se pudo subir la evidencia a Supabase: ${error.message}`);
    }
    const { data: pub } = supabase.storage.from('evidencias').getPublicUrl(storagePath);
    return { url: pub.publicUrl, storage: 'supabase' };
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

// ============================================================================
// App del chofer
// ============================================================================

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
  const { data: store } = await openStore();
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
      .sort((a, b) => (a.hora_salida || '').localeCompare(b.hora_salida || ''))
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
  const handle = await openStore();
  const store = handle.data;
  const tramo = store.tramos.find((t) => t.id === params.tramo_id) ?? store.tramos[0];
  if (!tramo) {
    throw new Error('No se encontró la ruta seleccionada.');
  }

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

  await commitStore(handle);
  return { viaje, stops: createdStops };
}

export async function recordStopArrival(params: {
  entrega_id: string;
  gps_llegada: GpsPoint;
}): Promise<Entrega> {
  const handle = await openStore();
  const entrega = handle.data.entregas.find((e) => e.id === params.entrega_id);
  if (!entrega) {
    throw new Error('Parada no encontrada.');
  }

  entrega.hora_llegada = new Date().toISOString();
  entrega.gps_llegada = params.gps_llegada;
  entrega.estado = 'en_sitio';

  await commitStore(handle);
  return entrega;
}

export async function recordStopDelivery(params: {
  entrega_id: string;
  cantidad_entregada: number;
  cantidad_rechazada: number;
  motivo_rechazo?: string | null;
  foto_comprobante: string;
}): Promise<{ entrega: Entrega; pedido: Pedido }> {
  const handle = await openStore();
  const store = handle.data;
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

  await commitStore(handle);
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
  const handle = await openStore();
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

  handle.data.gastos.push(gasto);
  await commitStore(handle);
  return gasto;
}

export async function closeDriverRoute(params: {
  viaje_id: string;
  odometro_fin: number;
  foto_odometro_fin: string;
  gps_regreso: GpsPoint;
}): Promise<{ viaje: Viaje; summary: DriverTripSummary }> {
  const handle = await openStore();
  const store = handle.data;
  const viaje = store.viajes.find((v) => v.id === params.viaje_id);
  if (!viaje) {
    throw new Error('Viaje no encontrado.');
  }

  if (params.odometro_fin < viaje.odometro_inicio) {
    throw new Error(
      `El odómetro final (${params.odometro_fin}) no puede ser menor al inicial (${viaje.odometro_inicio}).`
    );
  }

  viaje.odometro_fin = params.odometro_fin;
  viaje.foto_odometro_fin = params.foto_odometro_fin;
  viaje.hora_regreso = new Date().toISOString();
  viaje.gps_regreso = params.gps_regreso;

  const tramo = store.tramos.find((t) => t.id === viaje.tramo_id);
  const entregas = store.entregas.filter((e) => e.viaje_id === viaje.id);
  const gastos = store.gastos.filter((g) => g.viaje_id === viaje.id);
  const summary = computeDriverTripSummary(viaje, tramo, entregas, store.clientes, gastos);
  viaje.estado = summary.estado_cierre;

  await commitStore(handle);
  return { viaje, summary };
}

// ============================================================================
// Analítica y configuración
// ============================================================================

export async function getFullDatasetForAnalytics(): Promise<SeedDataset> {
  const { data } = await openStore();
  return data;
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
  const handle = await openStore();
  const store = handle.data;
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

  await commitStore(handle);
  return { empresa, empresas: store.empresas_config };
}
