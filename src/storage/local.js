// Adaptador local (localStorage). Funciona como respaldo de cualquier backend remoto
// y como único almacenamiento cuando no hay backend configurado.
import { normalizarResultado } from '../validador.js';
import { ErrorAlmacen } from './http.js';

const CLAVE_RESULTADOS = 'reto-transcripcion:resultados';
const CLAVE_INTENTOS = 'reto-transcripcion:intentos';

/** Almacenamiento en memoria para cuando localStorage no existe o está bloqueado. */
function crearMemoria() {
  const datos = new Map();
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => { datos.set(k, String(v)); },
    removeItem: (k) => { datos.delete(k); },
  };
}

/** Devuelve localStorage si se puede usar; si no, un sustituto en memoria. */
export function obtenerStorage() {
  try {
    const s = globalThis.localStorage;
    const prueba = '__reto_prueba__';
    s.setItem(prueba, '1');
    s.removeItem(prueba);
    return s;
  } catch {
    return crearMemoria();
  }
}

function leerJSON(storage, clave, porDefecto) {
  try {
    const crudo = storage.getItem(clave);
    return crudo ? JSON.parse(crudo) : porDefecto;
  } catch {
    return porDefecto;
  }
}

const llave = (r) => `${r.edicion}:${r.slug}`;

/**
 * @param {{storage?: Storage}} [opciones]
 */
export function crearLocal({ storage } = {}) {
  const s = storage ?? obtenerStorage();

  const leer = () => {
    const lista = leerJSON(s, CLAVE_RESULTADOS, []);
    return Array.isArray(lista) ? lista : [];
  };
  const escribir = (lista) => s.setItem(CLAVE_RESULTADOS, JSON.stringify(lista));
  const publicar = (r) => {
    const n = normalizarResultado(r);
    return n && { ...n, enviado: Boolean(r.enviado) };
  };

  return {
    nombre: 'local',

    async listarResultados(edicionId) {
      return leer().filter((r) => r.edicion === edicionId).map(publicar).filter(Boolean);
    },

    async listarTodos() {
      return leer().map(publicar).filter(Boolean);
    },

    /**
     * Guarda una copia local. `enviado` indica si ya llegó a la tabla remota.
     * Guardar dos veces el mismo resultado (mismo nombre, edición y fecha) solo actualiza `enviado`.
     */
    async guardarResultado(resultado, { enviado = false } = {}) {
      const lista = leer();
      const i = lista.findIndex((r) => llave(r) === llave(resultado));
      if (i >= 0) {
        if (lista[i].fecha !== resultado.fecha) {
          throw new ErrorAlmacen('Ya hay un resultado con ese nombre en esta edición', 'duplicado');
        }
        lista[i] = { ...lista[i], enviado: Boolean(lista[i].enviado || enviado) };
      } else {
        lista.push({ ...resultado, enviado });
      }
      escribir(lista);
      return { ok: true, destino: 'local' };
    },
  };
}

// ---------- Marcas de intento (antitrampa local) ----------
// No forman parte de la interfaz de almacenamiento: solo evitan que alguien recargue
// la página a mitad de partida para volver a empezar desde el mismo navegador.

export function leerIntento(edicion, slug, storage = obtenerStorage()) {
  return leerJSON(storage, CLAVE_INTENTOS, {})[`${edicion}:${slug}`] ?? null;
}

export function marcarIntento(edicion, slug, estado, storage = obtenerStorage()) {
  const intentos = leerJSON(storage, CLAVE_INTENTOS, {});
  intentos[`${edicion}:${slug}`] = { estado, fecha: new Date().toISOString() };
  try { storage.setItem(CLAVE_INTENTOS, JSON.stringify(intentos)); } catch { /* sin espacio: no bloquea el juego */ }
}
