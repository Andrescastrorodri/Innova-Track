import type { Cliente, ProductoInventario, UnidadMedida } from './types';

export interface ExtractedRawItem {
  sku?: string;
  nombre: string;
  cantidad: number;
  unidad?: string;
  precio_unitario?: number;
}

export interface MatchedPedidoItem {
  sku: string;
  nombre: string;
  cantidad: number;
  unidad: UnidadMedida;
  precio_unitario: number;
  stock_actual: number;
  disponible_en_inventario: boolean;
}

export interface ClienteDetectado {
  id: string | null;
  nombre: string;
  cedula_juridica: string;
  correo_facturacion: string;
  telefono: string;
  zona: string;
  ventana_inicio: string;
  ventana_fin: string;
}

export interface ProcessedOrderResult {
  cliente_detectado: ClienteDetectado;
  es_cliente_nuevo: boolean;
  items: MatchedPedidoItem[];
  subtotal: number;
  iva: number;
  total_estimado: number;
  sugerencia_logistica: string;
  texto_extraido: string;
  motor_ia: string;
}

export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeUnidad(rawUnit?: string, fallback: UnidadMedida = 'unidades'): UnidadMedida {
  const u = normalizeText(rawUnit ?? '');
  if (u.startsWith('caja') || u === 'cj' || u === 'cajas') return 'cajas';
  if (u.startsWith('bulto') || u.startsWith('saco') || u === 'blt') return 'bultos';
  if (u === 'kg' || u.startsWith('kilo')) return 'kg';
  if (u.startsWith('unid') || u === 'und' || u === 'u' || u.startsWith('paq') || u.startsWith('rollo')) {
    return 'unidades';
  }
  return fallback;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const COSTA_RICA_ZONES: Array<{ keyword: string; zona: 'Oeste' | 'Este' | 'Norte' }> = [
  { keyword: 'escazu', zona: 'Oeste' },
  { keyword: 'santa ana', zona: 'Oeste' },
  { keyword: 'pavas', zona: 'Oeste' },
  { keyword: 'sabana', zona: 'Oeste' },
  { keyword: 'belen', zona: 'Oeste' },
  { keyword: 'rohrmoser', zona: 'Oeste' },
  { keyword: 'lindora', zona: 'Oeste' },
  { keyword: 'ciudad colon', zona: 'Oeste' },
  { keyword: 'curridabat', zona: 'Este' },
  { keyword: 'san pedro', zona: 'Este' },
  { keyword: 'tres rios', zona: 'Este' },
  { keyword: 'cartago', zona: 'Este' },
  { keyword: 'zapote', zona: 'Este' },
  { keyword: 'la union', zona: 'Este' },
  { keyword: 'tibas', zona: 'Norte' },
  { keyword: 'heredia', zona: 'Norte' },
  { keyword: 'alajuela', zona: 'Norte' },
  { keyword: 'guadalupe', zona: 'Norte' },
  { keyword: 'moravia', zona: 'Norte' },
  { keyword: 'santo domingo', zona: 'Norte' },
  { keyword: 'coyol', zona: 'Norte' },
];

export function detectZoneFromText(text: string): 'Oeste' | 'Este' | 'Norte' {
  const norm = normalizeText(text);
  for (const entry of COSTA_RICA_ZONES) {
    if (norm.includes(entry.keyword)) {
      return entry.zona;
    }
  }
  return 'Oeste';
}

export function matchClientFromText(
  clientHintOrRawText: string,
  clientes: Cliente[],
  empresaId?: string
): { cliente_detectado: ClienteDetectado; es_cliente_nuevo: boolean } {
  const pool = empresaId ? clientes.filter((c) => c.empresa_id === empresaId) : clientes;
  const searchPool = pool.length > 0 ? pool : clientes;
  const normQuery = normalizeText(clientHintOrRawText);

  let bestClient: Cliente | null = null;
  let bestScore = 0;

  for (const client of searchPool) {
    const normName = normalizeText(client.nombre);
    const normCedula = normalizeText(client.cedula_juridica);

    if (normQuery.includes(normCedula) && normCedula.length >= 6) {
      bestClient = client;
      bestScore = 100;
      break;
    }

    if (normQuery.includes(normName)) {
      bestClient = client;
      bestScore = 95;
      break;
    }

    const nameTokens = normName
      .split(' ')
      .filter((t) => t.length >= 4 && !['centro', 'norte', 'plaza', 'salud', 'tienda'].includes(t));

    let matchedTokens = 0;
    for (const token of nameTokens) {
      if (normQuery.includes(token)) {
        matchedTokens += 1;
      }
    }

    const score = nameTokens.length > 0 ? (matchedTokens / nameTokens.length) * 80 : 0;
    if (matchedTokens >= 2 && score > bestScore) {
      bestScore = score;
      bestClient = client;
    } else if (matchedTokens === 1 && nameTokens.length <= 2 && score > bestScore) {
      bestScore = score;
      bestClient = client;
    }
  }

  if (bestClient && bestScore >= 40) {
    return {
      es_cliente_nuevo: false,
      cliente_detectado: {
        id: bestClient.id,
        nombre: bestClient.nombre,
        cedula_juridica: bestClient.cedula_juridica,
        correo_facturacion: bestClient.correo_facturacion,
        telefono: bestClient.telefono,
        zona: bestClient.zona,
        ventana_inicio: bestClient.ventana_inicio,
        ventana_fin: bestClient.ventana_fin,
      },
    };
  }

  // Cliente nuevo inferido del texto
  const guessedZone = detectZoneFromText(clientHintOrRawText);
  const cleanNameMatch = clientHintOrRawText.match(
    /(?:cliente|para|empresa|raz[oó]n social)\s*[:\-]?\s*([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s.&]{2,45})/i
  );
  const fallbackName = cleanNameMatch?.[1]?.trim() || 'Cliente Nuevo por Confirmar';

  return {
    es_cliente_nuevo: true,
    cliente_detectado: {
      id: null,
      nombre: fallbackName,
      cedula_juridica: '3-101-000000',
      correo_facturacion: 'facturacion@clientenuevo.cr',
      telefono: '+506 2200-0000',
      zona: guessedZone,
      ventana_inicio: '08:00:00',
      ventana_fin: '16:00:00',
    },
  };
}

export function matchItemsFromExtracted(
  extractedItems: ExtractedRawItem[],
  inventario: ProductoInventario[],
  empresaId?: string
): MatchedPedidoItem[] {
  const pool = empresaId ? inventario.filter((p) => p.empresa_id === empresaId) : inventario;
  const catalog = pool.length > 0 ? pool : inventario;

  return extractedItems
    .filter((item) => item.cantidad > 0 && item.nombre.trim().length > 0)
    .map((raw) => {
      const normSku = normalizeText(raw.sku ?? '');
      const normName = normalizeText(raw.nombre);

      let matched: ProductoInventario | undefined;
      if (normSku) {
        matched = catalog.find((p) => normalizeText(p.sku) === normSku);
      }

      if (!matched) {
        let bestOverlap = 0;
        const queryTokens = normName.split(' ').filter((t) => t.length >= 3);
        for (const prod of catalog) {
          const prodTokens = normalizeText(prod.nombre).split(' ');
          let hits = 0;
          for (const qt of queryTokens) {
            if (prodTokens.some((pt) => pt.includes(qt) || qt.includes(pt))) {
              hits += 1;
            }
          }
          if (hits > bestOverlap) {
            bestOverlap = hits;
            matched = prod;
          }
        }
        if (bestOverlap === 0) {
          matched = undefined;
        }
      }

      const cantidad = round2(Math.max(1, Number(raw.cantidad) || 1));

      if (matched) {
        return {
          sku: matched.sku,
          nombre: matched.nombre,
          cantidad,
          unidad: normalizeUnidad(raw.unidad, matched.unidad_medida),
          precio_unitario: matched.precio_unitario,
          stock_actual: matched.stock_actual,
          disponible_en_inventario: matched.stock_actual >= cantidad,
        };
      }

      return {
        sku: raw.sku?.trim() || 'SKU-MANUAL',
        nombre: raw.nombre.trim(),
        cantidad,
        unidad: normalizeUnidad(raw.unidad, 'unidades'),
        precio_unitario: round2(Number(raw.precio_unitario) || 0),
        stock_actual: 0,
        disponible_en_inventario: false,
      };
    });
}

export function calculateOrderTotals(items: Array<{ cantidad: number; precio_unitario: number }>) {
  const subtotal = round2(
    items.reduce((acc, item) => acc + Number(item.cantidad) * Number(item.precio_unitario), 0)
  );
  const iva = round2(subtotal * 0.13);
  const total_estimado = round2(subtotal + iva);
  return { subtotal, iva, total_estimado };
}

export function parseOrderTextDeterministic(
  rawText: string,
  clientes: Cliente[],
  inventario: ProductoInventario[],
  empresaId?: string,
  modalidad?: 'distribuidora_flotilla' | 'pyme_tercerizada'
): ProcessedOrderResult {
  const { cliente_detectado, es_cliente_nuevo } = matchClientFromText(rawText, clientes, empresaId);

  const lines = rawText
    .split(/[\n,;]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const extracted: ExtractedRawItem[] = [];
  const itemPattern =
    /(\d+(?:[.,]\d+)?)\s*(cajas?|bultos?|sacos?|kg|kilos?|unidades?|und|paquetes?|rollos?)?\s*(?:de\s+)?(.+)/i;

  for (const line of lines) {
    const cleanLine = line.replace(/^[-*•\d.)]+\s*/, (m) => (/^\d+\s+/.test(m) ? m : ''));
    if (/^(hola|buenos|buenas|saludos|cliente|para|entrega|favor|gracias)/i.test(cleanLine) && !/\d/.test(cleanLine)) {
      continue;
    }

    const match = cleanLine.match(itemPattern);
    if (match) {
      const qty = parseFloat(match[1].replace(',', '.'));
      const unit = match[2];
      let productDesc = match[3]
        .replace(/\bpara\s+.+$/i, '')
        .replace(/\b(entregar|urgente|hoy|mañana)\b.*$/i, '')
        .trim();

      if (productDesc.length >= 3 && Number.isFinite(qty) && qty > 0) {
        extracted.push({
          nombre: productDesc,
          cantidad: qty,
          unidad: unit,
        });
      }
    }
  }

  // Si no detectó líneas con cantidad explícita, busca coincidencias directas de SKU o producto
  if (extracted.length === 0) {
    const normRaw = normalizeText(rawText);
    for (const prod of inventario) {
      if (normRaw.includes(normalizeText(prod.sku))) {
        extracted.push({ sku: prod.sku, nombre: prod.nombre, cantidad: 1, unidad: prod.unidad_medida });
      }
    }
  }

  const matchedItems = matchItemsFromExtracted(extracted, inventario, empresaId);
  const { total_estimado, subtotal, iva } = calculateOrderTotals(matchedItems);

  const sugerencia_logistica =
    modalidad === 'pyme_tercerizada'
      ? `Despacho tercerizado recomendado hacia zona ${cliente_detectado.zona} vía Moovin CR / Correos de Costa Rica (ventana ${cliente_detectado.ventana_inicio.slice(0, 5)}–${cliente_detectado.ventana_fin.slice(0, 5)}).`
      : `Asignar a ruta de flotilla propia zona ${cliente_detectado.zona} respetando ventana ${cliente_detectado.ventana_inicio.slice(0, 5)}–${cliente_detectado.ventana_fin.slice(0, 5)}.`;

  return {
    cliente_detectado,
    es_cliente_nuevo,
    items: matchedItems,
    subtotal,
    iva,
    total_estimado,
    sugerencia_logistica,
    texto_extraido: rawText,
    motor_ia: 'parser-estructurado',
  };
}
