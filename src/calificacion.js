// Lógica de calificación del reto. Todo es puro: sin DOM, sin red, sin estado global.
// Cada función se prueba en test/calificacion.test.js.

/**
 * Números escritos con letra que se convierten a dígitos antes de comparar.
 * Este diccionario crece con cada edición: si una frase calificable usa un número
 * con letra que no esté aquí, el validador de ediciones la rechaza (y la prueba falla).
 */
export const NUMEROS = Object.freeze({
  tres: '3',
  siete: '7',
  ocho: '8',
  doce: '12',
  quince: '15',
});

/**
 * Palabras numéricas del español que el validador sabe reconocer. Sirve solo para
 * detectar números con letra que falten en NUMEROS. Se excluyen "un", "una" y "uno"
 * porque casi siempre funcionan como artículo ("un quiste", "una lesión").
 */
export const PALABRAS_NUMERO = new Set([
  'cero', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'dieciseis', 'diecisiete',
  'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintiún', 'veintidós', 'veintidos',
  'veintitrés', 'veintitres', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintiseis',
  'veintisiete', 'veintiocho', 'veintinueve', 'treinta', 'cuarenta', 'cincuenta',
  'sesenta', 'setenta', 'ochenta', 'noventa', 'cien', 'ciento', 'doscientos',
  'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos',
  'ochocientos', 'novecientos', 'mil', 'medio', 'media',
]);

const NO_ALFANUMERICO = /[^\p{L}\p{M}\p{N}]+/gu;

/** Paso 1: minúsculas y forma NFC (acentos compuestos). */
export function normalizarTexto(texto) {
  return String(texto ?? '').toLowerCase().normalize('NFC');
}

/** Pasos 1 y 2: normaliza y parte en palabras, descartando puntuación. Sin convertir números. */
export function palabrasCrudas(texto) {
  return normalizarTexto(texto).replace(NO_ALFANUMERICO, ' ').trim().split(' ').filter(Boolean);
}

/** Pasos 1 a 3: palabras listas para comparar, con números en letra convertidos a dígitos. */
export function palabras(texto) {
  return palabrasCrudas(texto).map((p) => NUMEROS[p] ?? p);
}

/** Paso 4: distancia de Levenshtein entre dos listas (aquí, listas de palabras). */
export function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(anterior[j] + 1, actual[j - 1] + 1, anterior[j - 1] + costo);
    }
    anterior = actual;
  }
  return anterior[b.length];
}

/** Paso 5: precisión de una transcripción entre 0 y 1. */
export function precision(transcrito, esperado) {
  const esperadas = palabras(esperado);
  const escritas = palabras(transcrito);
  if (esperadas.length === 0) return escritas.length === 0 ? 1 : 0;
  return Math.max(0, 1 - levenshtein(escritas, esperadas) / esperadas.length);
}

/** Puntos de un reactivo de dictado o memoria: precisión × puntos del reactivo (sin redondear). */
export function puntosReactivo(transcrito, esperado, pts) {
  return precision(transcrito, esperado) * pts;
}

/** Redondea y recorta al rango 0–100. Se aplica a cada ronda antes de sumar. */
export function recortarRonda(puntos) {
  const n = Number(puntos);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

// ---------- Ronda 1: ortografía ----------

export const PUNTOS_POR_ACIERTO_ORTOGRAFIA = 10;

export function puntajeOrtografia(aciertos) {
  return recortarRonda(aciertos * PUNTOS_POR_ACIERTO_ORTOGRAFIA);
}

// ---------- Ronda 2 y 4: dictado y memoria ----------

/**
 * Suma los puntos de varios reactivos de transcripción.
 * @param {{escrito: string, esperado: string, pts: number}[]} respuestas
 */
export function puntajeTranscripcion(respuestas) {
  const suma = respuestas.reduce((acc, r) => acc + puntosReactivo(r.escrito, r.esperado, r.pts), 0);
  return recortarRonda(suma);
}

// ---------- Ronda 3: caza errores ----------

export const ERRORES_CAZA = 6;
export const PENALIZACION_FALSO_POSITIVO = 8;

export function puntajeCazaErrores(aciertos, falsosPositivos, totalErrores = ERRORES_CAZA) {
  const bruto = (aciertos * 100) / totalErrores - falsosPositivos * PENALIZACION_FALSO_POSITIVO;
  return recortarRonda(Math.max(0, bruto));
}

const TOKEN_CAZA = /([\p{L}\p{M}\p{N}]+)(?:\{([^{}]*)\})?|([^\p{L}\p{M}\p{N}]+)/gu;

/**
 * Convierte el texto de r3 en segmentos. Una palabra seguida de {corrección} es un error.
 * @returns {{tipo: 'palabra'|'separador', texto: string, correccion?: string|null, indice?: number}[]}
 */
export function parsearCazaErrores(texto) {
  const segmentos = [];
  let indice = 0;
  for (const m of String(texto ?? '').normalize('NFC').matchAll(TOKEN_CAZA)) {
    if (m[1] !== undefined) {
      segmentos.push({
        tipo: 'palabra',
        texto: m[1],
        correccion: m[2] !== undefined ? m[2].trim() : null,
        indice: indice++,
      });
    } else {
      segmentos.push({ tipo: 'separador', texto: m[3] });
    }
  }
  return segmentos;
}

/** Solo las palabras marcadas como error en el texto (excluye separadores y palabras correctas). */
export function erroresCazaErrores(segmentos) {
  return segmentos.filter((s) => s.tipo === 'palabra' && s.correccion !== null);
}

/**
 * Califica las palabras marcadas por el jugador.
 * @param {ReturnType<typeof parsearCazaErrores>} segmentos
 * @param {Iterable<number>} marcados índices de palabra marcados
 */
export function evaluarCazaErrores(segmentos, marcados) {
  const marcadas = new Set(marcados);
  const palabrasTexto = segmentos.filter((s) => s.tipo === 'palabra');
  const errores = erroresCazaErrores(segmentos);
  let aciertos = 0;
  let falsosPositivos = 0;
  for (const p of palabrasTexto) {
    if (!marcadas.has(p.indice)) continue;
    if (p.correccion !== null) aciertos++;
    else falsosPositivos++;
  }
  return {
    aciertos,
    falsosPositivos,
    omitidos: errores.length - aciertos,
    totalErrores: errores.length,
    puntos: puntajeCazaErrores(aciertos, falsosPositivos, errores.length || ERRORES_CAZA),
  };
}

// ---------- Ronda 5: racha ----------

export const PUNTOS_BASE_RACHA = 2;

/** Multiplicador para una racha ya incrementada: ×2 desde 3 seguidos, ×3 desde 6. */
export function multiplicadorRacha(racha) {
  if (racha >= 6) return 3;
  if (racha >= 3) return 2;
  return 1;
}

export function crearEstadoRacha() {
  return { racha: 0, puntos: 0, aciertos: 0, errores: 0 };
}

/** Devuelve el nuevo estado tras una respuesta. No muta el estado recibido. */
export function avanzarRacha(estado, correcto) {
  if (!correcto) return { ...estado, racha: 0, errores: estado.errores + 1 };
  const racha = estado.racha + 1;
  return {
    ...estado,
    racha,
    aciertos: estado.aciertos + 1,
    puntos: estado.puntos + PUNTOS_BASE_RACHA * multiplicadorRacha(racha),
  };
}

export function puntajeRacha(estado) {
  return recortarRonda(estado.puntos);
}

/** Normalización de la racha: minúsculas, NFC y espacios recortados. Los acentos cuentan. */
export function normalizarTermino(texto) {
  return normalizarTexto(texto).trim().replace(/\s+/g, ' ');
}

export function compararTermino(escrito, esperado) {
  return normalizarTermino(escrito) === normalizarTermino(esperado);
}

// ---------- Totales, desempates y llaves ----------

export const IDS_RONDAS = Object.freeze(['r1', 'r2', 'r3', 'r4', 'r5']);

/** Suma de las cinco rondas, cada una redondeada y recortada a 0–100. */
export function calcularTotal(rondas) {
  return IDS_RONDAS.reduce((acc, id) => acc + recortarRonda(rondas?.[id] ?? 0), 0);
}

/**
 * Orden de la tabla: total descendente; empate → menos segundos; empate → más puntos en caza errores.
 */
export function compararResultados(a, b) {
  return (
    b.total - a.total ||
    a.segundos - b.segundos ||
    (b.rondas?.r3 ?? 0) - (a.rondas?.r3 ?? 0)
  );
}

/** "Abimael Pérez" → "abimael-perez". Llave para el intento único y el acumulado. */
export function crearSlug(nombre) {
  return String(nombre ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Limpia espacios repetidos en un nombre visible. */
export function limpiarNombre(nombre) {
  return String(nombre ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
}
