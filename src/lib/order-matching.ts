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
  /** Partes del mensaje que parecen una línea de pedido pero no se pudieron relacionar con el catálogo. */
  lineas_no_entendidas: string[];
}

// ---------------------------------------------------------------------------
// Texto: normalización y coincidencia aproximada
// ---------------------------------------------------------------------------

function stripAccents(input: string): string {
  return input.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalizeText(input: string): string {
  return stripAccents(input.toLowerCase())
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

function stem(token: string): string {
  return token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token;
}

/** Dos palabras se consideran la misma si coinciden tras quitar el plural o difieren en 1–2 letras según su largo. */
export function similarTokens(a: string, b: string): boolean {
  if (a === b) return true;
  const sa = stem(a);
  const sb = stem(b);
  if (sa === sb) return true;
  const longest = Math.max(sa.length, sb.length);
  const allowed = longest >= 8 ? 2 : longest >= 5 ? 1 : 0;
  if (allowed === 0 || Math.abs(sa.length - sb.length) > allowed) return false;
  return levenshtein(sa, sb) <= allowed;
}

// ---------------------------------------------------------------------------
// Unidades
// ---------------------------------------------------------------------------

const UNIT_WORDS: Record<string, UnidadMedida> = {
  saco: 'bultos',
  quintal: 'bultos',
  quintale: 'bultos',
  bulto: 'bultos',
  blt: 'bultos',
  caja: 'cajas',
  cj: 'cajas',
  kilo: 'kg',
  kg: 'kg',
  kilogramo: 'kg',
  unidad: 'unidades',
  unidade: 'unidades',
  und: 'unidades',
  rollo: 'unidades',
  cubeta: 'unidades',
};

/** Palabras de empaque sin unidad propia: se usa la unidad del producto en el catálogo. */
const CONTAINER_WORDS = new Set([
  'paquete', 'paq', 'bolsa', 'galon', 'galone', 'botella', 'lata', 'tarro', 'pieza', 'frasco', 'bloque', 'pichinga',
]);

function unitFromWord(word: string | undefined): UnidadMedida | null {
  if (!word) return null;
  return UNIT_WORDS[word] ?? UNIT_WORDS[stem(word)] ?? null;
}

function isContainerWord(word: string | undefined): boolean {
  return Boolean(word && (CONTAINER_WORDS.has(word) || CONTAINER_WORDS.has(stem(word))));
}

export function normalizeUnidad(rawUnit?: string, fallback: UnidadMedida = 'unidades'): UnidadMedida {
  const u = normalizeText(rawUnit ?? '').split(' ')[0];
  if (u === 'u' || u.startsWith('unid')) return 'unidades';
  return unitFromWord(u) ?? fallback;
}

// ---------------------------------------------------------------------------
// Zonas
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

/** Palabras que describen el tipo de negocio: ayudan, pero no identifican a un cliente por sí solas. */
const GENERIC_CLIENT_WORDS = new Set([
  'abastecedor', 'ferreteria', 'supermercado', 'minisuper', 'restaurante', 'clinica', 'farmacia', 'panaderia',
  'pulperia', 'soda', 'mercado', 'tienda', 'deposito', 'distribuidora', 'hospital', 'laboratorio', 'constructora',
  'insumos', 'centro', 'norte', 'este', 'oeste', 'sede',
]);

const CLIENT_MATCH_THRESHOLD = 0.6;

function clientTokens(name: string): string[] {
  return normalizeText(name)
    .split(' ')
    .filter((t) => t.length >= 4);
}

function toClienteDetectado(c: Cliente): ClienteDetectado {
  return {
    id: c.id,
    nombre: c.nombre,
    cedula_juridica: c.cedula_juridica,
    correo_facturacion: c.correo_facturacion,
    telefono: c.telefono,
    zona: c.zona,
    ventana_inicio: c.ventana_inicio,
    ventana_fin: c.ventana_fin,
  };
}

const NAME_STOP = /\s+(?:m[aá]nd|necesit|ocup|quier|pid|me\s|nos\s|les\s|por\s+favor|porfa|para\s|con\s+c[eé]dula)|\s*\d/i;

function cleanClientName(raw: string): string {
  let name = raw.trim();
  const stopAt = name.search(NAME_STOP);
  if (stopAt > 0) name = name.slice(0, stopAt);
  return name.replace(/[\s\-–:]+$/g, '').trim().slice(0, 60);
}

/** Intenta sacar el nombre de un cliente nuevo de frases como "soy X", "les escribe X", "Cliente: X" o "para X". */
export function extractClientName(rawText: string): string | null {
  const patterns: RegExp[] = [
    /\b(?:soy|somos|les?\s+escribe|le\s+saluda|de\s+parte\s+de)\s+(?:de\s+la\s+|del\s+|de\s+|la\s+|el\s+)?([^,.\n;:!]+)/i,
    /\bhabla\s+(?:[^\s,.]+\s+)?(?:de\s+la\s+|del\s+|de\s+)([^,.\n;:!]+)/i,
    /\b(?:cliente|raz[oó]n\s+social|empresa)\s*[:\-–]?\s*([^,.\n;:!]+)/i,
    /\bpedido\s+(?:para\s+|de\s+(?:la\s+)?|del\s+)?[:\-–]?\s*([A-ZÁÉÍÓÚÑ][^,.\n;:!]+)/,
    /\bpara\s+((?:(?:[A-ZÁÉÍÓÚÑ][\wáéíóúñÁÉÍÓÚÑ.&]*|y|de|la|el|los|las|del)\s?){2,7})/,
  ];
  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    const name = match ? cleanClientName(match[1]) : '';
    if (name.length >= 3 && /[a-záéíóúñ]{3}/i.test(name)) return name;
  }
  return null;
}

export function matchClientFromText(
  clientHintOrRawText: string,
  clientes: Cliente[],
  empresaId?: string
): { cliente_detectado: ClienteDetectado; es_cliente_nuevo: boolean } {
  const pool = empresaId ? clientes.filter((c) => c.empresa_id === empresaId) : clientes;
  const searchPool = pool.length > 0 ? pool : clientes;

  // 1. Cédula jurídica (con o sin guiones).
  const cedulasEnTexto = (clientHintOrRawText.match(/\b\d[-\s]?\d{3}[-\s]?\d{6}\b/g) ?? []).map((c) =>
    c.replace(/\D/g, '')
  );
  if (cedulasEnTexto.length > 0) {
    const byCedula = searchPool.find((c) => cedulasEnTexto.includes(c.cedula_juridica.replace(/\D/g, '')));
    if (byCedula) {
      return { es_cliente_nuevo: false, cliente_detectado: toClienteDetectado(byCedula) };
    }
  }

  // 2. Nombre aproximado: las palabras propias del nombre pesan el doble que las genéricas.
  const queryTokens = normalizeText(clientHintOrRawText)
    .split(' ')
    .filter((t) => t.length >= 4);

  let best: Cliente | null = null;
  let bestScore = 0;
  let tie = false;

  for (const client of searchPool) {
    const tokens = clientTokens(client.nombre);
    if (tokens.length === 0) continue;
    let total = 0;
    let matched = 0;
    let specificMatched = 0;
    for (const token of tokens) {
      const generic = GENERIC_CLIENT_WORDS.has(token);
      const weight = generic ? 1 : 2;
      total += weight;
      if (queryTokens.some((q) => similarTokens(q, token))) {
        matched += weight;
        if (!generic) specificMatched += 1;
      }
    }
    const score = matched / total;
    if (specificMatched === 0 || score < CLIENT_MATCH_THRESHOLD) continue;
    if (score > bestScore) {
      best = client;
      bestScore = score;
      tie = false;
    } else if (score === bestScore) {
      tie = true;
    }
  }

  if (best && !tie) {
    return { es_cliente_nuevo: false, cliente_detectado: toClienteDetectado(best) };
  }

  // 3. Cliente nuevo: se toma el nombre del mensaje si se presenta; si no, queda por confirmar.
  return {
    es_cliente_nuevo: true,
    cliente_detectado: {
      id: null,
      nombre: extractClientName(clientHintOrRawText) ?? 'Cliente Nuevo por Confirmar',
      cedula_juridica: cedulasEnTexto[0]
        ? cedulasEnTexto[0].replace(/^(\d)(\d{3})(\d{6})$/, '$1-$2-$3')
        : '3-101-000000',
      correo_facturacion: 'facturacion@clientenuevo.cr',
      telefono: '+506 2200-0000',
      zona: detectZoneFromText(clientHintOrRawText),
      ventana_inicio: '08:00:00',
      ventana_fin: '16:00:00',
    },
  };
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

const PRODUCT_STOP_WORDS = new Set([
  'del', 'los', 'las', 'para', 'por', 'con', 'una', 'uno', 'unos', 'unas', 'favor', 'porfa', 'porfis', 'gracias',
  'numero', 'num', 'tipo', 'marca', 'que', 'mas', 'tambien', 'ademas', 'hola', 'buenas', 'buenos', 'dias',
  'mande', 'manden', 'mandenme', 'mandame', 'necesito', 'necesitamos', 'ocupo', 'ocupamos', 'quiero', 'queremos',
  'pedido', 'entregar', 'entrega', 'urgente', 'hoy', 'manana', 'temprano', 'tempranito', 'pura', 'vida',
]);

/** Palabras de empaque en los nombres del catálogo que no distinguen un producto de otro. */
const CATALOG_NOISE_WORDS = new Set(['caja', 'saco', 'paquete', 'rollo', 'cubeta', 'galon', 'gal', 'und', 'uso', 'general']);

function productQueryTokens(description: string): string[] {
  return normalizeText(description)
    .split(' ')
    .filter(
      (t) =>
        t.length >= 3 &&
        /^[a-z]+$/.test(t) &&
        !PRODUCT_STOP_WORDS.has(t) &&
        !unitFromWord(t) &&
        !isContainerWord(t)
    );
}

function catalogTokens(name: string): string[] {
  return normalizeText(name)
    .split(' ')
    .filter((t) => t.length >= 3 && /^[a-z]+$/.test(t) && !CATALOG_NOISE_WORDS.has(t));
}

/**
 * Busca en el catálogo el producto que mejor coincide con una descripción libre.
 * Coincidir con la primera palabra del producto ("arroz", "cemento") pesa más que con un adjetivo.
 * Devuelve null si no hay una coincidencia confiable: nunca adivina.
 */
export function findProductByDescription(
  description: string,
  catalog: ProductoInventario[]
): ProductoInventario | null {
  const query = productQueryTokens(description);
  if (query.length === 0) return null;

  const tokenized = catalog.map((prod) => ({ prod, tokens: catalogTokens(prod.nombre) }));
  let best: ProductoInventario | null = null;
  let bestScore = 0;

  for (const { prod, tokens } of tokenized) {
    if (tokens.length === 0) continue;
    let score = 0;
    let hits = 0;
    let headHit = false;
    let lastHitToken = '';
    tokens.forEach((token, idx) => {
      if (query.some((q) => similarTokens(q, token))) {
        hits += 1;
        lastHitToken = token;
        if (idx === 0) {
          headHit = true;
          score += 3;
        } else {
          score += 1;
        }
      }
    });
    if (hits === 0) continue;

    // Un solo acierto en una palabra secundaria solo vale si esa palabra es exclusiva de este producto.
    if (!headHit && hits === 1) {
      const shared = tokenized.filter((other) => other.tokens.includes(lastHitToken)).length;
      if (shared > 1) continue;
    }
    if (score > bestScore) {
      bestScore = score;
      best = prod;
    }
  }
  return best;
}

function toMatchedItem(prod: ProductoInventario, cantidad: number, unidad: UnidadMedida): MatchedPedidoItem {
  return {
    sku: prod.sku,
    nombre: prod.nombre,
    cantidad,
    unidad,
    precio_unitario: prod.precio_unitario,
    stock_actual: prod.stock_actual,
    disponible_en_inventario: prod.stock_actual >= cantidad,
  };
}

/** Relaciona con el catálogo los productos ya extraídos (por la IA o a mano). Lo que no coincide queda como línea manual. */
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
      const matched =
        (normSku ? catalog.find((p) => normalizeText(p.sku) === normSku) : undefined) ??
        findProductByDescription(raw.nombre, catalog);

      const parsedQty = Number(raw.cantidad);
      const cantidad = round2(Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1);

      if (matched) {
        return toMatchedItem(matched, cantidad, normalizeUnidad(raw.unidad, matched.unidad_medida));
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

// ---------------------------------------------------------------------------
// Lector de pedidos sin IA
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  cero: 0, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23, veinticuatro: 24,
  veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40,
  cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, doscientos: 200, quinientos: 500,
};
const TENS = 'treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa';
const UNITS_1_9: Record<string, number> = {
  uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
};
const PACK_WORD = '(?:sacos?|quintal(?:es)?|bultos?|cajas?|kilos?|kgs?|kilogramos?|unidad(?:es)?|und|rollos?|cubetas?|paquetes?|bolsas?|galon(?:es)?|botellas?|latas?|tarros?|piezas?|frascos?|bloques?)';
const NUM = '\\d+(?:\\.\\d+)?';

/** Deja el mensaje en minúsculas, sin tildes y con todas las cantidades en cifras ("un par de" → "2", "media docena" → "6"). */
export function normalizeQuantities(rawText: string): string {
  let t = stripAccents(rawText.toLowerCase());

  // Datos que tienen números pero no son cantidades: cédulas, teléfonos.
  t = t.replace(/\b\d[-\s]?\d{3}[-\s]?\d{6}\b/g, ' ').replace(/(?:\+?506[\s-]?)?\b\d{4}[-\s]?\d{4}\b/g, ' ');

  // Decimales con coma → punto, para que la coma quede solo como separador de líneas.
  t = t.replace(/(\d),(\d)/g, '$1.$2');

  // Números en palabras.
  t = t.replace(new RegExp(`\\b(${TENS}) y (${Object.keys(UNITS_1_9).join('|')})\\b`, 'g'), (_, tens, unit) =>
    String(NUMBER_WORDS[tens] + UNITS_1_9[unit])
  );
  t = t.replace(new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'g'), (word) => String(NUMBER_WORDS[word]));

  // Fechas y horas.
  t = t
    .replace(/\b(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?:\s+\d{1,2})?\b/g, ' ')
    .replace(/\b(?:el|dia)\s+\d{1,2}(?:\s+de\s+[a-z]+)?\b/g, ' ')
    .replace(/\b(?:a\s+|antes\s+de\s+|despues\s+de\s+|tipo\s+)?las?\s+\d{1,2}(?:[:.]\d{2})?(?:\s*(?:a\.?\s?m\.?|p\.?\s?m\.?))?(?![\w.])/g, ' ')
    .replace(/\b\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ');

  // Expresiones de cantidad.
  t = t
    .replace(new RegExp(`\\b(${NUM}) y medi[oa]\\b`, 'g'), (_, n) => String(Number(n) + 0.5))
    .replace(/\b(?:una?\s+)?docena y media(?:\s+de)?\b/g, '18')
    .replace(/\bmedia docena(?:\s+de)?\b/g, '6')
    .replace(new RegExp(`\\b(${NUM}) docenas?(?:\\s+de)?\\b`, 'g'), (_, n) => String(Number(n) * 12))
    .replace(/\b(?:una?\s+)?docena(?:\s+de)?\b/g, '12')
    .replace(new RegExp(`\\b(${NUM}) pares(?:\\s+de)?\\b`, 'g'), (_, n) => String(Number(n) * 2))
    .replace(/\b(?:un\s+)?par\s+de\b/g, '2')
    .replace(new RegExp(`\\bmedi[oa]\\s+(?=${PACK_WORD}\\b)`, 'g'), '0.5 ')
    .replace(new RegExp(`\\bun[oa]?\\s+(?=${PACK_WORD}\\b)`, 'g'), '1 ');

  return t;
}

function splitOrderSegments(normalized: string): string[] {
  return normalized
    .replace(/[\n\r;:•*·]+|,|\s-\s|^\s*-|\.(?=\s|$)|[!?¡¿]+/gm, '\n')
    .replace(new RegExp(`\\s+(?:y|e|mas|\\+|tambien|ademas)\\s+(?=${NUM}\\b)`, 'g'), '\n')
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

interface SegmentParse {
  item: MatchedPedidoItem | null;
  /** true si el segmento parece una línea de pedido (cantidad + unidad) aunque no se haya entendido. */
  looksLikeOrderLine: boolean;
}

function parseSegment(segment: string, catalog: ProductoInventario[]): SegmentParse {
  const numberPattern = new RegExp(`(?<![\\w#.])(${NUM})(?![\\w.]*%)`, 'g');
  let looksLikeOrderLine = false;

  for (const match of segment.matchAll(numberPattern)) {
    const cantidad = round2(Number(match[1]));
    if (!Number.isFinite(cantidad) || cantidad <= 0) continue;

    const before = segment.slice(0, match.index).trim();
    const words = segment.slice((match.index ?? 0) + match[0].length).trim().split(' ').filter(Boolean);

    let unidad: UnidadMedida | null = null;
    let hasPackWord = false;
    if (words[0] && (unitFromWord(words[0]) || isContainerWord(words[0]))) {
      unidad = unitFromWord(words[0]);
      hasPackWord = true;
      words.shift();
    }
    if (words[0] === 'de' || words[0] === 'del') words.shift();
    if (hasPackWord) looksLikeOrderLine = true;

    const after = words.join(' ');
    const product =
      findProductByDescription(after, catalog) ??
      // "arroz 5 sacos", "cemento x 10": el producto va antes de la cantidad.
      findProductByDescription(before.replace(/\s+(?:x|por)$/, ''), catalog);

    if (product) {
      return { item: toMatchedItem(product, cantidad, unidad ?? product.unidad_medida), looksLikeOrderLine: true };
    }
  }

  return { item: null, looksLikeOrderLine };
}

export function parseOrderTextDeterministic(
  rawText: string,
  clientes: Cliente[],
  inventario: ProductoInventario[],
  empresaId?: string,
  modalidad?: 'distribuidora_flotilla' | 'pyme_tercerizada'
): ProcessedOrderResult {
  const { cliente_detectado, es_cliente_nuevo } = matchClientFromText(rawText, clientes, empresaId);

  const pool = empresaId ? inventario.filter((p) => p.empresa_id === empresaId) : inventario;
  const catalog = pool.length > 0 ? pool : inventario;

  const items: MatchedPedidoItem[] = [];
  const lineas_no_entendidas: string[] = [];

  for (const segment of splitOrderSegments(normalizeQuantities(rawText))) {
    const { item, looksLikeOrderLine } = parseSegment(segment, catalog);
    if (item) {
      items.push(item);
    } else if (looksLikeOrderLine) {
      lineas_no_entendidas.push(segment);
    }
  }

  // Sin cantidades reconocibles: se aceptan SKUs escritos tal cual, con cantidad 1.
  if (items.length === 0) {
    const normRaw = normalizeText(rawText);
    for (const prod of catalog) {
      if (normRaw.includes(normalizeText(prod.sku))) {
        items.push(toMatchedItem(prod, 1, prod.unidad_medida));
      }
    }
  }

  const { total_estimado, subtotal, iva } = calculateOrderTotals(items);
  const ventana = `${cliente_detectado.ventana_inicio.slice(0, 5)}–${cliente_detectado.ventana_fin.slice(0, 5)}`;

  const sugerencia_logistica =
    modalidad === 'pyme_tercerizada'
      ? `Despacho tercerizado recomendado hacia zona ${cliente_detectado.zona} vía Moovin CR / Correos de Costa Rica (ventana ${ventana}).`
      : `Asignar a ruta de flotilla propia zona ${cliente_detectado.zona} respetando ventana ${ventana}.`;

  return {
    cliente_detectado,
    es_cliente_nuevo,
    items,
    subtotal,
    iva,
    total_estimado,
    sugerencia_logistica,
    texto_extraido: rawText,
    motor_ia: 'parser-estructurado',
    lineas_no_entendidas,
  };
}
