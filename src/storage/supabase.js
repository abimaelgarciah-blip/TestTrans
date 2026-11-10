// Backend: tabla Postgres en Supabase vía su API REST (PostgREST).
// Ver docs/supabase.sql para crear la tabla, las restricciones y las políticas de fila.
import { normalizarResultado } from '../validador.js';
import { errorPorEstado, pedir } from './http.js';

const COLUMNAS = 'edicion,slug,nombre,total,segundos,rondas,fecha';

/**
 * @param {{url: string, claveAnonima: string, tabla?: string}} config
 * @param {{fetch?: typeof fetch, tiempoEsperaMs?: number}} [deps]
 */
export function crearSupabase(config, { fetch: fetchFn = globalThis.fetch?.bind(globalThis), tiempoEsperaMs = 10000 } = {}) {
  const { url, claveAnonima, tabla = 'resultados' } = config ?? {};
  const base = String(url ?? '').replace(/\/+$/, '');
  const encabezados = { apikey: claveAnonima, Accept: 'application/json' };
  // Las claves anónimas antiguas son JWT y también van como Bearer; las nuevas
  // "publishable" (sb_publishable_…) solo necesitan el encabezado apikey.
  if (String(claveAnonima ?? '').startsWith('eyJ')) encabezados.Authorization = `Bearer ${claveAnonima}`;

  async function listar(edicionId) {
    const filtro = edicionId ? `&edicion=eq.${encodeURIComponent(edicionId)}` : '';
    const r = await pedir(fetchFn, `${base}/rest/v1/${tabla}?select=${COLUMNAS}${filtro}&order=total.desc`, {
      method: 'GET',
      headers: encabezados,
    }, tiempoEsperaMs);
    if (!r.ok) throw errorPorEstado(r.status);
    const datos = await r.json();
    return (Array.isArray(datos) ? datos : []).map(normalizarResultado).filter(Boolean);
  }

  return {
    nombre: 'supabase',
    configurado: Boolean(base && claveAnonima),
    listarResultados: (edicionId) => listar(edicionId),
    listarTodos: () => listar(null),
    async guardarResultado(resultado) {
      const r = await pedir(fetchFn, `${base}/rest/v1/${tabla}`, {
        method: 'POST',
        headers: { ...encabezados, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(resultado),
      }, tiempoEsperaMs);
      if (!r.ok) throw errorPorEstado(r.status);
      return { ok: true, destino: 'remoto' };
    },
  };
}
