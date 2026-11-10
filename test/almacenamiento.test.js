import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { crearAlmacen } from '../src/storage/adapter.js';
import { crearLocal } from '../src/storage/local.js';
import { crearSharePoint } from '../src/storage/sharepoint.js';
import { crearSupabase } from '../src/storage/supabase.js';

function memoria() {
  const datos = new Map();
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    removeItem: (k) => datos.delete(k),
  };
}

const resultado = (nombre = 'Abimael Pérez', slug = 'abimael-perez', extra = {}) => ({
  edicion: '2026-11', slug, nombre, total: 412, segundos: 583,
  rondas: { r1: 90, r2: 78, r3: 84, r4: 72, r5: 88 }, fecha: '2026-11-18T16:40:12.000Z', ...extra,
});

const respuesta = (status, cuerpo = null) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo });
const fetchQueFalla = async () => { throw new TypeError('Failed to fetch'); };

const configSharePoint = { adaptador: 'sharepoint', sharepoint: { urlGuardar: 'https://flujo.example/guardar?sig=x', urlListar: 'https://flujo.example/listar?sig=y' } };

describe('adaptador con respaldo local', () => {
  it('cae en el respaldo local cuando la petición remota falla, y lo reporta como tal', async () => {
    const storage = memoria();
    const almacen = crearAlmacen(configSharePoint, { storage, fetch: fetchQueFalla });
    assert.equal(almacen.modo, 'sharepoint');
    const r = await almacen.guardarResultado(resultado());
    assert.deepEqual(r, { ok: true, destino: 'local', motivo: 'red' });

    const guardados = await crearLocal({ storage }).listarResultados('2026-11');
    assert.equal(guardados.length, 1);
    assert.equal(guardados[0].enviado, false);

    const lista = await almacen.listarResultados('2026-11');
    assert.equal(lista.estado.remoto, 'error');
    assert.equal(lista.length, 1);
    assert.equal(lista[0].soloLocal, true);
  });

  it('cae en el respaldo local cuando el servicio responde con error 500', async () => {
    const almacen = crearAlmacen(configSharePoint, { storage: memoria(), fetch: async () => respuesta(500) });
    const r = await almacen.guardarResultado(resultado());
    assert.equal(r.destino, 'local');
    assert.equal(r.ok, true);
  });

  it('cae en el respaldo local cuando el servicio no responde a tiempo', async () => {
    const colgado = (_url, { signal }) => new Promise((_, rechazar) => signal.addEventListener('abort', () => rechazar(Object.assign(new Error('abort'), { name: 'AbortError' }))));
    const almacen = crearAlmacen({ ...configSharePoint, tiempoEsperaMs: 20 }, { storage: memoria(), fetch: colgado });
    const r = await almacen.guardarResultado(resultado());
    assert.equal(r.destino, 'local');
  });

  it('reporta destino remoto cuando la escritura remota funciona', async () => {
    const llamadas = [];
    const almacen = crearAlmacen(configSharePoint, {
      storage: memoria(),
      fetch: async (url, opciones) => { llamadas.push({ url, opciones }); return respuesta(201); },
    });
    const r = await almacen.guardarResultado(resultado());
    assert.deepEqual(r, { ok: true, destino: 'remoto' });
    assert.equal(llamadas[0].opciones.method, 'POST');
    assert.deepEqual(JSON.parse(llamadas[0].opciones.body), resultado());
  });

  it('un 409 se reporta como duplicado y no se guarda localmente', async () => {
    const storage = memoria();
    const almacen = crearAlmacen(configSharePoint, { storage, fetch: async () => respuesta(409) });
    const r = await almacen.guardarResultado(resultado());
    assert.deepEqual(r, { ok: false, destino: 'remoto', motivo: 'duplicado' });
    assert.equal((await crearLocal({ storage }).listarTodos()).length, 0);
  });

  it('rechaza localmente un resultado inválido sin enviarlo', async () => {
    let llamado = false;
    const almacen = crearAlmacen(configSharePoint, { storage: memoria(), fetch: async () => { llamado = true; return respuesta(201); } });
    const r = await almacen.guardarResultado(resultado('Abimael Pérez', 'abimael-perez', { total: 999 }));
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'invalido');
    assert.equal(llamado, false);
  });

  it('envía solo los campos oficiales aunque reciba extras', async () => {
    let cuerpo;
    const almacen = crearAlmacen(configSharePoint, { storage: memoria(), fetch: async (_u, o) => { cuerpo = JSON.parse(o.body); return respuesta(201); } });
    await almacen.guardarResultado({ ...resultado(), soloLocal: true, posicion: 3 });
    assert.deepEqual(Object.keys(cuerpo).sort(), ['edicion', 'fecha', 'nombre', 'rondas', 'segundos', 'slug', 'total']);
  });

  it('un reintento exitoso marca la copia local como enviada', async () => {
    const storage = memoria();
    await crearAlmacen(configSharePoint, { storage, fetch: fetchQueFalla }).guardarResultado(resultado());
    const r = await crearAlmacen(configSharePoint, { storage, fetch: async () => respuesta(201) }).guardarResultado(resultado());
    assert.equal(r.destino, 'remoto');
    const [copia] = await crearLocal({ storage }).listarTodos();
    assert.equal(copia.enviado, true);
  });

  it('combina resultados remotos con pendientes que solo existen en este equipo', async () => {
    const storage = memoria();
    await crearLocal({ storage }).guardarResultado(resultado('Luz Ramos', 'luz-ramos'), { enviado: false });
    await crearLocal({ storage }).guardarResultado(resultado(), { enviado: true });
    const remotos = [resultado(), resultado('Ana Díaz', 'ana-diaz')];
    const almacen = crearAlmacen(configSharePoint, { storage, fetch: async () => respuesta(200, remotos) });
    const lista = await almacen.listarResultados('2026-11');
    assert.equal(lista.estado.remoto, 'ok');
    assert.equal(lista.estado.pendientes, 1);
    assert.deepEqual(lista.map((r) => [r.slug, Boolean(r.soloLocal)]), [['abimael-perez', false], ['ana-diaz', false], ['luz-ramos', true]]);
  });

  it('sin backend configurado funciona solo en local y lo indica', async () => {
    const almacen = crearAlmacen({ adaptador: 'sharepoint', sharepoint: { urlGuardar: '', urlListar: '' } }, { storage: memoria() });
    assert.equal(almacen.modo, 'local');
    const r = await almacen.guardarResultado(resultado());
    assert.deepEqual(r, { ok: true, destino: 'local', motivo: 'no-configurado' });
    const lista = await almacen.listarResultados('2026-11');
    assert.equal(lista.estado.remoto, 'no-configurado');
    assert.equal(lista.length, 1);
    const otra = await almacen.guardarResultado(resultado('Abimael Pérez', 'abimael-perez', { fecha: '2026-11-19T10:00:00.000Z' }));
    assert.equal(otra.ok, false);
    assert.equal(otra.motivo, 'duplicado');
  });

  it('las tablas vacías no rompen nada', async () => {
    const almacen = crearAlmacen(configSharePoint, { storage: memoria(), fetch: async () => respuesta(200, []) });
    const lista = await almacen.listarTodos();
    assert.deepEqual([...lista], []);
    assert.equal(lista.estado.remoto, 'ok');
  });
});

describe('backends', () => {
  it('SharePoint agrega la edición a la URL del flujo sin perder la firma', async () => {
    let pedida;
    const sp = crearSharePoint(configSharePoint.sharepoint, { fetch: async (url) => { pedida = new URL(url); return respuesta(200, { value: [] }); } });
    await sp.listarResultados('2026-11');
    assert.equal(pedida.searchParams.get('sig'), 'y');
    assert.equal(pedida.searchParams.get('edicion'), '2026-11');
  });

  it('Supabase filtra por edición y manda la clave anónima', async () => {
    let pedida;
    const sb = crearSupabase({ url: 'https://abc.supabase.co/', claveAnonima: 'eyJclave' }, {
      fetch: async (url, opciones) => { pedida = { url, opciones }; return respuesta(200, [resultado()]); },
    });
    const lista = await sb.listarResultados('2026-11');
    assert.ok(pedida.url.startsWith('https://abc.supabase.co/rest/v1/resultados?'));
    assert.ok(pedida.url.includes('edicion=eq.2026-11'));
    assert.equal(pedida.opciones.headers.apikey, 'eyJclave');
    assert.equal(pedida.opciones.headers.Authorization, 'Bearer eyJclave');
    assert.deepEqual(lista, [resultado()]);
  });

  it('Supabase traduce la violación de unicidad (409) a duplicado', async () => {
    const almacen = crearAlmacen({ adaptador: 'supabase', supabase: { url: 'https://abc.supabase.co', claveAnonima: 'sb_publishable_x' } }, {
      storage: memoria(), fetch: async () => respuesta(409),
    });
    assert.equal(almacen.modo, 'supabase');
    assert.equal((await almacen.guardarResultado(resultado())).motivo, 'duplicado');
  });
});
