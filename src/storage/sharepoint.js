// Backend: lista de SharePoint detrás de dos flujos de Power Automate con disparador HTTP.
// Ver docs/power-automate.md para construir los flujos.
import { normalizarResultado } from '../validador.js';
import { errorPorEstado, pedir } from './http.js';

/**
 * @param {{urlGuardar: string, urlListar: string}} config
 * @param {{fetch?: typeof fetch, tiempoEsperaMs?: number}} [deps]
 */
export function crearSharePoint(config, { fetch: fetchFn = globalThis.fetch?.bind(globalThis), tiempoEsperaMs = 10000 } = {}) {
  const { urlGuardar, urlListar } = config ?? {};

  async function listar(edicionId) {
    const url = new URL(urlListar);
    if (edicionId) url.searchParams.set('edicion', edicionId);
    const r = await pedir(fetchFn, url.toString(), { method: 'GET', headers: { Accept: 'application/json' } }, tiempoEsperaMs);
    if (!r.ok) throw errorPorEstado(r.status);
    const datos = await r.json();
    const lista = Array.isArray(datos) ? datos : (datos?.value ?? datos?.resultados ?? []);
    return lista.map(normalizarResultado).filter(Boolean);
  }

  return {
    nombre: 'sharepoint',
    configurado: Boolean(urlGuardar && urlListar),
    listarResultados: (edicionId) => listar(edicionId),
    listarTodos: () => listar(null),
    async guardarResultado(resultado) {
      const r = await pedir(fetchFn, urlGuardar, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resultado),
      }, tiempoEsperaMs);
      if (!r.ok) throw errorPorEstado(r.status);
      return { ok: true, destino: 'remoto' };
    },
  };
}
