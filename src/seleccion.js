// Sorteo del examen de cada partida. Puro: recibe la edición (un banco de contenido) y una
// función aleatoria, y devuelve el examen concreto que juega esta persona.
//
// Formato de banco, compatible con el formato original:
//   r1: lista de frases; se juegan FRASES_ORTOGRAFIA al azar (si hay más).
//   r2, r4: lista de "posiciones". Cada posición es un reactivo, o una lista de reactivos
//           alternativos con los mismos puntos; se sortea uno por posición.
//   r3: un reporte, o una lista de reportes alternativos; se sortea uno.
//   r5: lista de términos (se baraja en la ronda).

export const FRASES_ORTOGRAFIA = 10;

/**
 * Ajustes de dificultad que cada edición puede cambiar en su bloque "dificultad".
 *   velocidadVoz: velocidad de la síntesis de voz del dictado (1 = normal del sistema).
 *   segundosOrtografia: tiempo por frase en ortografía relámpago.
 */
export const DIFICULTAD_POR_DEFECTO = Object.freeze({ velocidadVoz: 1, segundosOrtografia: 12 });
export const LIMITES_DIFICULTAD = Object.freeze({ velocidadVoz: [0.7, 1.5], segundosOrtografia: [6, 20] });

/** Copia barajada (Fisher–Yates). */
export function barajar(lista, aleatorio = Math.random) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/** Las alternativas de una posición: siempre una lista. */
export function alternativas(posicion) {
  return Array.isArray(posicion) ? posicion : [posicion];
}

function elegir(lista, aleatorio) {
  return lista[Math.floor(aleatorio() * lista.length)];
}

/** Cuántos exámenes distintos puede generar una edición (orden aparte). Informativo. */
export function variantes(ed) {
  const combinaciones = (n, k) => {
    let r = 1;
    for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
    return Math.round(r);
  };
  const r1 = combinaciones(ed.r1.length, Math.min(FRASES_ORTOGRAFIA, ed.r1.length));
  const productoPosiciones = (lista) => lista.reduce((acc, p) => acc * alternativas(p).length, 1);
  return r1 * productoPosiciones(ed.r2) * alternativas(ed.r3).length * productoPosiciones(ed.r4);
}

/** Arma el examen concreto de una partida. */
export function prepararExamen(ed, aleatorio = Math.random) {
  return {
    id: ed.id,
    titulo: ed.titulo,
    r1: barajar(ed.r1, aleatorio).slice(0, FRASES_ORTOGRAFIA),
    r2: ed.r2.map((p) => elegir(alternativas(p), aleatorio)),
    r3: elegir(alternativas(ed.r3), aleatorio),
    r4: ed.r4.map((p) => elegir(alternativas(p), aleatorio)),
    r5: [...ed.r5],
    consejos: Array.isArray(ed.consejos) ? barajar(ed.consejos, aleatorio) : [],
    dificultad: { ...DIFICULTAD_POR_DEFECTO, ...(ed.dificultad ?? {}) },
  };
}
