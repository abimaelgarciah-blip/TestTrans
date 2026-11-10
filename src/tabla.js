// Tabla de posiciones, medallas, acumulado y exportación a CSV.
// La parte de cálculo es pura (probada en test/tabla.test.js); la parte de DOM usa ui.js
// y solo inserta nombres con nodos de texto.
import { IDS_RONDAS, compararResultados } from './calificacion.js';
import { el, formatearTiempo } from './ui.js';

export const MEDALLAS = Object.freeze([
  { ronda: 'r1', nombre: 'Mejor ortografía', corto: 'Ort.' },
  { ronda: 'r2', nombre: 'Mejor oído', corto: 'Dict.' },
  { ronda: 'r3', nombre: 'Mejor ojo clínico', corto: 'Caza' },
  { ronda: 'r4', nombre: 'Mejor memoria', corto: 'Mem.' },
  { ronda: 'r5', nombre: 'Dedos más rápidos', corto: 'Racha' },
]);

const NOMBRES_RONDA = {
  r1: 'Ortografía', r2: 'Dictado', r3: 'Caza errores', r4: 'Memoria', r5: 'Racha',
};

// ---------- Cálculo puro ----------

/** Copia ordenada: total ↓, tiempo ↑, caza errores ↓. Agrega `posicion`. */
export function ordenarEdicion(resultados) {
  return [...resultados].sort(compararResultados).map((r, i) => ({ ...r, posicion: i + 1 }));
}

/**
 * Primer lugar general y mejor puntaje de cada ronda. En empate de ronda gana
 * quien va mejor en la tabla general.
 */
export function calcularMedallas(resultados) {
  const ordenados = ordenarEdicion(resultados);
  if (!ordenados.length) return { general: null, porRonda: [] };
  const porRonda = MEDALLAS.map((m) => {
    let ganador = null;
    for (const r of ordenados) {
      if (!ganador || r.rondas[m.ronda] > ganador.rondas[m.ronda]) ganador = r;
    }
    return { ...m, ganador, puntos: ganador.rondas[m.ronda] };
  });
  return { general: ordenados[0], porRonda };
}

/**
 * Agrupa todas las ediciones por slug. Ordena por promedio y luego por suma,
 * para no castigar a quien se incorporó después.
 */
export function calcularAcumulado(todos, orden = 'promedio') {
  const grupos = new Map();
  for (const r of todos) {
    const g = grupos.get(r.slug) ?? { slug: r.slug, nombre: r.nombre, fechaNombre: '', suma: 0, ediciones: 0, segundos: 0, mejor: 0, soloLocal: false };
    // Si alguien escribió su nombre distinto en otra edición, se muestra el más reciente.
    if ((r.fecha ?? '') >= g.fechaNombre) { g.nombre = r.nombre; g.fechaNombre = r.fecha ?? ''; }
    g.suma += r.total;
    g.ediciones += 1;
    g.segundos += r.segundos;
    g.mejor = Math.max(g.mejor, r.total);
    g.soloLocal ||= Boolean(r.soloLocal);
    grupos.set(r.slug, g);
  }
  const lista = [...grupos.values()].map(({ fechaNombre: _f, ...g }) => ({
    ...g,
    promedio: Math.round((g.suma / g.ediciones) * 10) / 10,
  }));
  const porPromedio = (a, b) => b.promedio - a.promedio || b.suma - a.suma || a.segundos - b.segundos;
  const porSuma = (a, b) => b.suma - a.suma || b.promedio - a.promedio || a.segundos - b.segundos;
  return lista.sort(orden === 'suma' ? porSuma : porPromedio).map((g, i) => ({ ...g, posicion: i + 1 }));
}

/** Escapa un campo CSV y neutraliza fórmulas (=, +, -, @) al abrir en Excel o Calc. */
export function campoCSV(valor) {
  let texto = valor === null || valor === undefined ? '' : String(valor);
  if (/^[=+\-@\t\r]/.test(texto) && !/^-?\d+(\.\d+)?$/.test(texto)) texto = `'${texto}`;
  return /[",\n\r;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** CSV en UTF-8 con BOM y fin de línea CRLF, que Excel y LibreOffice abren sin preguntar codificación. */
export function aCSV(encabezados, filas) {
  const lineas = [encabezados, ...filas].map((fila) => fila.map(campoCSV).join(','));
  return `\uFEFF${lineas.join('\r\n')}\r\n`;
}

export function csvEdicion(resultados) {
  const ordenados = ordenarEdicion(resultados);
  return aCSV(
    ['Posición', 'Nombre', 'Slug', 'Edición', 'Total', ...IDS_RONDAS.map((id) => NOMBRES_RONDA[id]), 'Segundos', 'Tiempo', 'Fecha', 'Solo en este equipo'],
    ordenados.map((r) => [r.posicion, r.nombre, r.slug, r.edicion, r.total, ...IDS_RONDAS.map((id) => r.rondas[id]),
      r.segundos, formatearTiempo(r.segundos), r.fecha, r.soloLocal ? 'sí' : '']),
  );
}

export function csvAcumulado(todos, orden) {
  return aCSV(
    ['Posición', 'Nombre', 'Slug', 'Ediciones jugadas', 'Suma', 'Promedio', 'Mejor total', 'Segundos totales'],
    calcularAcumulado(todos, orden).map((g) => [g.posicion, g.nombre, g.slug, g.ediciones, g.suma, g.promedio, g.mejor, g.segundos]),
  );
}

// ---------- DOM ----------

function etiquetaLocal() {
  return el('span', { clase: 'etiqueta-local', title: 'Este resultado solo está guardado en este equipo' }, ' (solo en este equipo)');
}

/**
 * @param {object[]} resultados
 * @param {{slugActual?: string, alReintentar?: (r: object) => void}} [opciones]
 */
export function renderTablaEdicion(resultados, { slugActual, alReintentar } = {}) {
  if (!resultados.length) {
    return el('p', { clase: 'vacio' }, 'Nadie ha jugado esta edición todavía. ¡Sé la primera persona!');
  }
  const ordenados = ordenarEdicion(resultados);
  const cuerpo = ordenados.map((r) => {
    const propia = slugActual && r.slug === slugActual;
    return el('tr', { clase: propia ? 'fila-propia' : undefined, 'aria-current': propia ? 'true' : undefined },
      el('td', { clase: 'num' }, String(r.posicion)),
      el('th', { scope: 'row' }, r.nombre, propia ? el('span', { clase: 'etiqueta-propia' }, ' (tú)') : null,
        r.soloLocal ? etiquetaLocal() : null,
        r.soloLocal && alReintentar
          ? el('button', { type: 'button', clase: 'enlace', onClick: () => alReintentar(r) }, 'Reintentar envío')
          : null),
      el('td', { clase: 'num total' }, String(r.total)),
      IDS_RONDAS.map((id) => el('td', { clase: 'num' }, String(r.rondas[id]))),
      el('td', { clase: 'num' }, formatearTiempo(r.segundos)),
    );
  });
  return el('div', { clase: 'tabla-desplazable', tabindex: '0', role: 'region', 'aria-label': 'Tabla de posiciones' },
    el('table', { clase: 'tabla' },
      el('thead', {}, el('tr', {},
        el('th', { scope: 'col', clase: 'num' }, '#'),
        el('th', { scope: 'col' }, 'Nombre'),
        el('th', { scope: 'col', clase: 'num' }, 'Total'),
        MEDALLAS.map((m) => el('th', { scope: 'col', clase: 'num', title: NOMBRES_RONDA[m.ronda] }, m.corto)),
        el('th', { scope: 'col', clase: 'num' }, 'Tiempo'))),
      el('tbody', {}, cuerpo)));
}

export function renderMedallas(resultados) {
  const { general, porRonda } = calcularMedallas(resultados);
  if (!general) return null;
  return el('section', { clase: 'medallas', 'aria-labelledby': 'titulo-medallas' },
    el('h3', { id: 'titulo-medallas' }, 'Medallas'),
    el('ul', {},
      el('li', { clase: 'medalla medalla-general' },
        el('span', { clase: 'medalla-nombre' }, '🏆 Primer lugar general'),
        el('span', { clase: 'medalla-ganador' }, general.nombre),
        el('span', { clase: 'medalla-puntos' }, `${general.total} / 500`)),
      porRonda.map((m) => el('li', { clase: 'medalla' },
        el('span', { clase: 'medalla-nombre' }, `🏅 ${m.nombre}`),
        el('span', { clase: 'medalla-ganador' }, m.ganador.nombre),
        el('span', { clase: 'medalla-puntos' }, `${m.puntos} / 100 en ${NOMBRES_RONDA[m.ronda].toLowerCase()}`)))));
}

export function renderAcumulado(todos, { orden = 'promedio', slugActual } = {}) {
  const grupos = calcularAcumulado(todos, orden);
  if (!grupos.length) return el('p', { clase: 'vacio' }, 'Todavía no hay resultados en ninguna edición.');
  return el('div', { clase: 'tabla-desplazable', tabindex: '0', role: 'region', 'aria-label': 'Acumulado' },
    el('table', { clase: 'tabla' },
      el('thead', {}, el('tr', {},
        el('th', { scope: 'col', clase: 'num' }, '#'),
        el('th', { scope: 'col' }, 'Nombre'),
        el('th', { scope: 'col', clase: 'num' }, 'Ediciones'),
        el('th', { scope: 'col', clase: 'num', 'aria-sort': orden === 'suma' ? 'descending' : 'none' }, 'Suma'),
        el('th', { scope: 'col', clase: 'num', 'aria-sort': orden === 'promedio' ? 'descending' : 'none' }, 'Promedio'),
        el('th', { scope: 'col', clase: 'num' }, 'Mejor'))),
      el('tbody', {}, grupos.map((g) => {
        const propia = slugActual && g.slug === slugActual;
        return el('tr', { clase: propia ? 'fila-propia' : undefined },
          el('td', { clase: 'num' }, String(g.posicion)),
          el('th', { scope: 'row' }, g.nombre, g.soloLocal ? etiquetaLocal() : null),
          el('td', { clase: 'num' }, String(g.ediciones)),
          el('td', { clase: 'num' }, String(g.suma)),
          el('td', { clase: 'num' }, g.promedio.toFixed(1)),
          el('td', { clase: 'num' }, String(g.mejor)));
      }))));
}
