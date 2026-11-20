// Puntos y clasificación del Gran Premio. Sin DOM: se prueba con node:test.

export const CARRERAS_POR_GP = 3;
export const VUELTAS = 3;
// Puntos por posición (1º … 10º). Todos suman algo para que nadie se quede en cero.
export const PUNTOS = [15, 12, 10, 8, 7, 6, 5, 4, 3, 2];

export function puntosPorPosicion(posicion) {
  return PUNTOS[posicion - 1] ?? 1;
}

/**
 * Ordena a los corredores de una carrera.
 * corredores: [{ id, nombre, personaje, bot, tiempo (s, null si no terminó), progreso }]
 * Primero quienes terminaron (menor tiempo), luego el resto por progreso.
 */
export function ordenarCarrera(corredores) {
  const lista = corredores.map((c) => ({ ...c }));
  lista.sort((a, b) => {
    const ta = a.tiempo ?? Infinity;
    const tb = b.tiempo ?? Infinity;
    if (ta !== tb) return ta - tb;
    return (b.progreso ?? 0) - (a.progreso ?? 0);
  });
  return lista.map((c, i) => ({ ...c, posicion: i + 1, puntos: puntosPorPosicion(i + 1) }));
}

/**
 * Suma las carreras de un GP. carreras: [[filas de ordenarCarrera], …]
 * Desempate: más victorias, luego mejor posición en la última carrera.
 */
export function calcularTotales(carreras) {
  const mapa = new Map();
  carreras.forEach((filas, n) => {
    for (const f of filas) {
      const t = mapa.get(f.id) ?? { id: f.id, nombre: f.nombre, personaje: f.personaje, bot: !!f.bot, total: 0, victorias: 0, ultima: 99, posiciones: [] };
      t.nombre = f.nombre;
      t.personaje = f.personaje;
      t.total += f.puntos;
      if (f.posicion === 1) t.victorias += 1;
      t.ultima = f.posicion;
      t.posiciones[n] = f.posicion;
      mapa.set(f.id, t);
    }
  });
  const lista = [...mapa.values()];
  lista.sort((a, b) => b.total - a.total || b.victorias - a.victorias || a.ultima - b.ultima);
  return lista.map((t, i) => ({ ...t, lugar: i + 1 }));
}

export function formatoTiempo(seg) {
  if (seg === null || seg === undefined || !Number.isFinite(seg)) return '—';
  const m = Math.floor(seg / 60);
  const s = seg - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export function ordinal(n) {
  return `${n}º`;
}

// Código de sala: 4 letras fáciles de dictar (sin I, O, Q ni Ñ).
const LETRAS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
export function codigoSala(azar = Math.random) {
  let c = '';
  for (let i = 0; i < 4; i++) c += LETRAS[Math.floor(azar() * LETRAS.length)];
  return c;
}

export function limpiarCodigo(texto) {
  return String(texto ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

export function limpiarNombre(texto) {
  return String(texto ?? '').replace(/\s+/g, ' ').trim().slice(0, 16).trim();
}

// Ítem según la posición: los de atrás reciben cosas más poderosas.
// fraccion: 0 = primer lugar, 1 = último.
export const ITEMS = ['platano', 'cohete', 'misil', 'turbo', 'estrella', 'rayo', 'pastel'];
export function pesosItem(fraccion) {
  const f = Math.min(1, Math.max(0, fraccion));
  return {
    platano: 40 - 30 * f,
    cohete: 25 - 5 * f,
    misil: 4 + 22 * f,
    turbo: 15 + 10 * f,
    estrella: 1 + 14 * f,
    rayo: f > 0.5 ? 6 * f : 0,
    pastel: 10,
  };
}

export function sortearItem(fraccion, azar = Math.random) {
  const pesos = pesosItem(fraccion);
  const total = ITEMS.reduce((s, k) => s + pesos[k], 0);
  let r = azar() * total;
  for (const k of ITEMS) {
    r -= pesos[k];
    if (r < 0) return k;
  }
  return 'platano';
}
