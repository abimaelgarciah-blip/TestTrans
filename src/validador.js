// Validadores puros de ediciones y resultados. Sin DOM.
import {
  ERRORES_CAZA,
  IDS_RONDAS,
  NUMEROS,
  PALABRAS_NUMERO,
  calcularTotal,
  crearSlug,
  erroresCazaErrores,
  limpiarNombre,
  normalizarTermino,
  normalizarTexto,
  palabrasCrudas,
  parsearCazaErrores,
} from './calificacion.js';

const ID_EDICION = /^\d{4}-(0[1-9]|1[0-2])$/;
export const FRASES_ORTOGRAFIA = 10;

const esTexto = (v) => typeof v === 'string' && v.trim() !== '';
const esPositivo = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Números escritos con letra que no están en el diccionario de conversión. */
export function numerosSinDiccionario(texto) {
  return [...new Set(palabrasCrudas(texto).filter((p) => PALABRAS_NUMERO.has(p) && !(p in NUMEROS)))];
}

function revisarNumeros(texto, donde, errores) {
  const faltan = numerosSinDiccionario(texto);
  if (faltan.length) {
    errores.push(`${donde}: usa números con letra que no están en el diccionario NUMEROS (${faltan.join(', ')}). Agrégalos en src/calificacion.js o escríbelos con cifra.`);
  }
}

function revisarSumaPuntos(lista, donde, errores) {
  const suma = lista.reduce((acc, x) => acc + (Number(x?.pts) || 0), 0);
  if (suma !== 100) errores.push(`${donde}: los puntos deben sumar 100 (suman ${suma}).`);
}

/**
 * Revisa una edición completa.
 * @returns {string[]} lista de errores; vacía si la edición es válida.
 */
export function validarEdicion(ed) {
  const errores = [];
  if (!ed || typeof ed !== 'object') return ['La edición no es un objeto JSON.'];

  if (!ID_EDICION.test(ed.id ?? '')) errores.push('id: debe tener la forma AAAA-MM, por ejemplo "2026-11".');
  if (!esTexto(ed.titulo)) errores.push('titulo: falta el título de la edición.');

  // r1: ortografía
  if (!Array.isArray(ed.r1)) {
    errores.push('r1: debe ser una lista de frases.');
  } else {
    if (ed.r1.length !== FRASES_ORTOGRAFIA) errores.push(`r1: debe tener exactamente ${FRASES_ORTOGRAFIA} frases (tiene ${ed.r1.length}).`);
    ed.r1.forEach((item, i) => {
      const donde = `r1[${i}]`;
      if (!esTexto(item?.q) || item.q.split('___').length !== 2) {
        errores.push(`${donde}: "q" debe contener exactamente un hueco "___".`);
      }
      if (!Array.isArray(item?.o) || item.o.length !== 3 || !item.o.every(esTexto)) {
        errores.push(`${donde}: "o" debe tener tres opciones de texto (la primera es la correcta).`);
        return;
      }
      const normalizadas = item.o.map((o) => normalizarTexto(o).trim());
      if (new Set(normalizadas).size !== normalizadas.length) {
        errores.push(`${donde}: hay opciones repetidas (${item.o.join(' / ')}).`);
      }
    });
  }

  // r2: dictado
  if (!Array.isArray(ed.r2) || ed.r2.length === 0) {
    errores.push('r2: debe ser una lista con al menos un dictado.');
  } else {
    ed.r2.forEach((item, i) => {
      const donde = `r2[${i}]`;
      if (!esTexto(item?.di)) errores.push(`${donde}: falta "di" (texto que se dicta).`);
      if (!esTexto(item?.es)) errores.push(`${donde}: falta "es" (texto esperado).`);
      if (!esPositivo(item?.pts)) errores.push(`${donde}: "pts" debe ser un número positivo.`);
      if (item?.audio !== undefined && !esTexto(item.audio)) errores.push(`${donde}: "audio" debe ser una ruta de archivo.`);
      if (item?.nota !== undefined && typeof item.nota !== 'string') errores.push(`${donde}: "nota" debe ser texto.`);
      revisarNumeros(item?.di, `${donde}.di`, errores);
      revisarNumeros(item?.es, `${donde}.es`, errores);
    });
    revisarSumaPuntos(ed.r2, 'r2', errores);
  }

  // r3: caza errores
  if (!ed.r3 || typeof ed.r3 !== 'object') {
    errores.push('r3: debe ser un objeto con "seg" y "texto".');
  } else {
    if (!esPositivo(ed.r3.seg)) errores.push('r3: "seg" debe ser un número positivo.');
    if (!esTexto(ed.r3.texto)) {
      errores.push('r3: falta "texto".');
    } else {
      const texto = ed.r3.texto;
      const llavesAbiertas = (texto.match(/\{/g) ?? []).length;
      const llavesCerradas = (texto.match(/\}/g) ?? []).length;
      const marcasBienFormadas = (texto.match(/\{[^{}]*\}/g) ?? []).length;
      const segmentos = parsearCazaErrores(texto);
      const marcas = erroresCazaErrores(segmentos);
      if (llavesAbiertas !== llavesCerradas || llavesAbiertas !== marcasBienFormadas) {
        errores.push('r3: hay llaves sin cerrar o anidadas.');
      }
      if (marcas.length !== marcasBienFormadas) {
        errores.push('r3: cada {corrección} debe ir pegada a la palabra equivocada, sin espacio.');
      }
      if (marcas.length !== ERRORES_CAZA) {
        errores.push(`r3: debe tener exactamente ${ERRORES_CAZA} marcas de error palabraMal{corrección} (tiene ${marcas.length}).`);
      }
      for (const m of marcas) {
        if (!esTexto(m.correccion)) errores.push(`r3: la marca de "${m.texto}" no tiene corrección.`);
        else if (normalizarTexto(m.correccion) === normalizarTexto(m.texto)) {
          errores.push(`r3: la corrección de "${m.texto}" es igual a la palabra marcada.`);
        }
      }
    }
  }

  // r4: memoria
  if (!Array.isArray(ed.r4) || ed.r4.length === 0) {
    errores.push('r4: debe ser una lista con al menos una frase.');
  } else {
    ed.r4.forEach((item, i) => {
      const donde = `r4[${i}]`;
      if (!esTexto(item?.t)) errores.push(`${donde}: falta "t" (frase a memorizar).`);
      if (!esPositivo(item?.seg)) errores.push(`${donde}: "seg" debe ser un número positivo.`);
      if (!esPositivo(item?.pts)) errores.push(`${donde}: "pts" debe ser un número positivo.`);
      revisarNumeros(item?.t, `${donde}.t`, errores);
    });
    revisarSumaPuntos(ed.r4, 'r4', errores);
  }

  // r5: racha
  if (!Array.isArray(ed.r5) || ed.r5.length < 10) {
    errores.push('r5: debe ser una lista de al menos 10 términos.');
  } else {
    if (!ed.r5.every(esTexto)) errores.push('r5: todos los términos deben ser texto no vacío.');
    const normalizados = ed.r5.map(normalizarTermino);
    const repetidos = normalizados.filter((t, i) => normalizados.indexOf(t) !== i);
    if (repetidos.length) errores.push(`r5: términos repetidos (${[...new Set(repetidos)].join(', ')}).`);
  }

  return errores;
}

/** Revisa ediciones/index.json. */
export function validarIndice(indice) {
  const errores = [];
  if (!indice || !Array.isArray(indice.ediciones) || indice.ediciones.length === 0) {
    return ['index.json: debe tener una lista "ediciones" con al menos un id.'];
  }
  for (const id of indice.ediciones) {
    if (!ID_EDICION.test(id)) errores.push(`index.json: id inválido "${id}".`);
  }
  if (new Set(indice.ediciones).size !== indice.ediciones.length) errores.push('index.json: hay ids repetidos.');
  return errores;
}

/**
 * Elige la edición vigente: la más reciente cuyo mes ya empezó.
 * @param {string[]} ids
 * @param {Date} hoy
 */
export function elegirEdiciones(ids, hoy = new Date()) {
  const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const ordenadas = [...ids].sort();
  const publicadas = ordenadas.filter((id) => id <= mes);
  const vigente = publicadas.at(-1) ?? ordenadas[0];
  return { vigente, publicadas: publicadas.length ? publicadas : [vigente] };
}

/** Revisa un resultado antes de enviarlo. Las mismas reglas deben vivir en el servidor. */
export function validarResultado(r) {
  const errores = [];
  if (!r || typeof r !== 'object') return ['El resultado no es un objeto.'];
  if (!ID_EDICION.test(r.edicion ?? '')) errores.push('edicion inválida.');
  const nombre = limpiarNombre(r.nombre);
  if (!nombre) errores.push('nombre vacío.');
  if (nombre.length > 80) errores.push('nombre demasiado largo.');
  if (!r.slug || r.slug !== crearSlug(nombre)) errores.push('slug no corresponde al nombre.');
  for (const id of IDS_RONDAS) {
    const v = r.rondas?.[id];
    if (!Number.isInteger(v) || v < 0 || v > 100) errores.push(`rondas.${id} debe ser un entero entre 0 y 100.`);
  }
  if (!Number.isInteger(r.total) || r.total < 0 || r.total > 500) errores.push('total debe ser un entero entre 0 y 500.');
  else if (r.total !== calcularTotal(r.rondas)) errores.push('total no coincide con la suma de las rondas.');
  if (!Number.isInteger(r.segundos) || r.segundos < 0) errores.push('segundos debe ser un entero no negativo.');
  if (Number.isNaN(Date.parse(r.fecha ?? ''))) errores.push('fecha inválida.');
  return errores;
}

/**
 * Convierte lo que devuelva cualquier backend a la forma canónica de Resultado.
 * Acepta rondas anidadas ({rondas: {r1..r5}}) o en columnas (r1..r5 / R1..R5).
 * Devuelve null si el registro no se puede interpretar.
 */
export function normalizarResultado(crudo) {
  if (!crudo || typeof crudo !== 'object') return null;
  const leer = (k) => crudo[k] ?? crudo[k.toUpperCase()] ?? crudo[k[0].toUpperCase() + k.slice(1)];
  let rondasCrudas = leer('rondas');
  if (typeof rondasCrudas === 'string') {
    try { rondasCrudas = JSON.parse(rondasCrudas); } catch { rondasCrudas = null; }
  }
  const rondas = {};
  for (const id of IDS_RONDAS) {
    rondas[id] = Math.round(Number(rondasCrudas?.[id] ?? leer(id) ?? 0)) || 0;
  }
  const nombre = limpiarNombre(leer('nombre') ?? crudo.Title ?? '');
  const edicion = String(leer('edicion') ?? '');
  if (!nombre || !edicion) return null;
  return {
    edicion,
    slug: String(leer('slug') || crearSlug(nombre)),
    nombre,
    total: Math.round(Number(leer('total'))) || calcularTotal(rondas),
    segundos: Math.round(Number(leer('segundos'))) || 0,
    rondas,
    fecha: String(leer('fecha') ?? ''),
  };
}
