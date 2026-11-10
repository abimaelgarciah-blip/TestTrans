// Interfaz única de persistencia. El resto de la aplicación solo conoce estos tres métodos:
//
//   listarResultados(edicionId)  -> Promise<Resultado[]>
//   guardarResultado(resultado)  -> Promise<{ok: boolean, destino: 'remoto'|'local', motivo?: string}>
//   listarTodos()                -> Promise<Resultado[]>   (para el acumulado)
//
// El backend remoto se elige en config.js. El adaptador local siempre actúa como respaldo:
// si la escritura remota falla por red, el resultado se guarda en localStorage y se
// devuelve {ok: true, destino: 'local'} para que la interfaz avise al participante.
//
// Las listas devueltas traen además una propiedad `estado`:
//   { remoto: 'ok'|'error'|'no-configurado', pendientes: number }
// y cada resultado que solo existe en este equipo lleva `soloLocal: true`.
import { validarResultado } from '../validador.js';
import { crearLocal } from './local.js';
import { crearSharePoint } from './sharepoint.js';
import { crearSupabase } from './supabase.js';

const FABRICAS = {
  sharepoint: (config, deps) => crearSharePoint(config.sharepoint, deps),
  supabase: (config, deps) => crearSupabase(config.supabase, deps),
};

/** Crea el backend remoto indicado en la configuración, o null si no hay uno usable. */
export function crearRemoto(config, deps = {}) {
  const fabrica = FABRICAS[config?.adaptador];
  if (!fabrica) return null;
  const remoto = fabrica(config, { tiempoEsperaMs: config.tiempoEsperaMs, ...deps });
  return remoto.configurado ? remoto : null;
}

const llave = (r) => `${r.edicion}:${r.slug}`;

function limpiar(r, soloLocal) {
  const { enviado: _enviado, ...resto } = r;
  return soloLocal ? { ...resto, soloLocal: true } : resto;
}

/** Solo los campos del formato oficial; descarta extras como `posicion` o `soloLocal`. */
function canonico(r) {
  const { edicion, slug, nombre, total, segundos, rondas, fecha } = r ?? {};
  return { edicion, slug, nombre, total, segundos, rondas: rondas && { ...rondas }, fecha };
}

function conEstado(lista, estado) {
  lista.estado = estado;
  return lista;
}

/**
 * @param {object} config contenido de config.js
 * @param {{remoto?: object|null, local?: object, storage?: Storage, fetch?: typeof fetch}} [deps]
 *   inyección para pruebas; en producción se omite.
 */
export function crearAlmacen(config, deps = {}) {
  const local = deps.local ?? crearLocal({ storage: deps.storage });
  const remoto = 'remoto' in deps ? deps.remoto : crearRemoto(config, deps);

  async function leerLocal(fn) {
    try { return await fn(); } catch { return []; }
  }

  async function combinar(leerRemoto, leerLocales) {
    const locales = await leerLocal(leerLocales);
    if (!remoto) {
      const lista = locales.map((r) => limpiar(r, false));
      return conEstado(lista, { remoto: 'no-configurado', pendientes: 0 });
    }
    let remotos;
    try {
      remotos = await leerRemoto();
    } catch {
      const lista = locales.map((r) => limpiar(r, true));
      return conEstado(lista, { remoto: 'error', pendientes: locales.filter((r) => !r.enviado).length });
    }
    const presentes = new Set(remotos.map(llave));
    const pendientes = locales.filter((r) => !r.enviado && !presentes.has(llave(r))).map((r) => limpiar(r, true));
    return conEstado([...remotos, ...pendientes], { remoto: 'ok', pendientes: pendientes.length });
  }

  return {
    /** Nombre del backend en uso: 'sharepoint', 'supabase' o 'local'. Solo informativo. */
    modo: remoto ? remoto.nombre : 'local',

    listarResultados(edicionId) {
      return combinar(() => remoto.listarResultados(edicionId), () => local.listarResultados(edicionId));
    },

    listarTodos() {
      return combinar(() => remoto.listarTodos(), () => local.listarTodos());
    },

    async guardarResultado(entrada) {
      const resultado = canonico(entrada);
      const errores = validarResultado(resultado);
      if (errores.length) {
        return { ok: false, destino: remoto ? 'remoto' : 'local', motivo: 'invalido', errores };
      }

      if (!remoto) {
        try {
          await local.guardarResultado(resultado, { enviado: false });
          return { ok: true, destino: 'local', motivo: 'no-configurado' };
        } catch (e) {
          return { ok: false, destino: 'local', motivo: e?.codigo === 'duplicado' ? 'duplicado' : 'sin-almacenamiento' };
        }
      }

      try {
        await remoto.guardarResultado(resultado);
        // Copia local de cortesía: permite al participante ver su resultado aunque falle la consulta.
        try { await local.guardarResultado(resultado, { enviado: true }); } catch { /* no es crítico */ }
        return { ok: true, destino: 'remoto' };
      } catch (e) {
        if (e?.codigo === 'duplicado' || e?.codigo === 'rechazado') {
          return { ok: false, destino: 'remoto', motivo: e.codigo };
        }
        try {
          await local.guardarResultado(resultado, { enviado: false });
          return { ok: true, destino: 'local', motivo: 'red' };
        } catch {
          return { ok: false, destino: 'local', motivo: 'sin-almacenamiento' };
        }
      }
    },
  };
}
