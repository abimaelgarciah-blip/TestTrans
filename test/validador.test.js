import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { calcularTotal } from '../src/calificacion.js';
import {
  elegirEdiciones, normalizarResultado, numerosSinDiccionario, validarEdicion, validarIndice, validarResultado,
} from '../src/validador.js';

const leer = (ruta) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), 'utf8'));
const indice = leer('../ediciones/index.json');
const copia = (x) => structuredClone(x);
const base = leer('../ediciones/2026-11.json');

describe('ediciones publicadas', () => {
  it('index.json es válido', () => {
    assert.deepEqual(validarIndice(indice), []);
  });

  for (const id of indice.ediciones) {
    it(`ediciones/${id}.json es válida`, () => {
      const ed = leer(`../ediciones/${id}.json`);
      assert.equal(ed.id, id, 'el id del archivo debe coincidir con su nombre');
      assert.deepEqual(validarEdicion(ed), []);
    });
  }
});

describe('validador de ediciones', () => {
  it('rechaza r3 sin exactamente seis marcas de error', () => {
    const cinco = copia(base);
    cinco.r3.texto = cinco.r3.texto.replace('vaso{bazo}', 'bazo');
    assert.ok(validarEdicion(cinco).some((e) => e.includes('exactamente 6')));

    const siete = copia(base);
    siete.r3.texto += ' Higado{Hígado} normal.';
    assert.ok(validarEdicion(siete).some((e) => e.includes('exactamente 6')));
  });

  it('rechaza llaves mal cerradas o separadas de la palabra', () => {
    const ed = copia(base);
    ed.r3.texto = ed.r3.texto.replace('vaso{bazo}', 'vaso {bazo}');
    assert.ok(validarEdicion(ed).length > 0);
    const ed2 = copia(base);
    ed2.r3.texto = ed2.r3.texto.replace('vaso{bazo}', 'vaso{bazo');
    assert.ok(validarEdicion(ed2).length > 0);
  });

  it('rechaza una opción repetida en r1', () => {
    const ed = copia(base);
    ed.r1[0].o = ['absceso', 'acceso', 'absceso'];
    assert.ok(validarEdicion(ed).some((e) => e.startsWith('r1[0]') && e.includes('repetidas')));
    const mayusculas = copia(base);
    mayusculas.r1[1].o = ['engrosamiento', 'Engrosamiento', 'engrozamiento'];
    assert.ok(validarEdicion(mayusculas).some((e) => e.startsWith('r1[1]')));
  });

  it('rechaza un número en letra que no esté en el diccionario', () => {
    const ed = copia(base);
    ed.r2[0].es = 'Quiste de veinte milímetros.';
    ed.r2[0].di = 'Quiste de veinte milímetros.';
    const errores = validarEdicion(ed);
    assert.ok(errores.some((e) => e.includes('veinte')));

    const memoria = copia(base);
    memoria.r4[0].t = 'Lesión de cuatro milímetros.';
    assert.ok(validarEdicion(memoria).some((e) => e.startsWith('r4[0]') && e.includes('cuatro')));
  });

  it('acepta los números que sí están en el diccionario y no confunde artículos', () => {
    assert.deepEqual(numerosSinDiccionario('un quiste de doce milímetros y una lesión de tres'), []);
    assert.deepEqual(numerosSinDiccionario('dos quistes de nueve mm'), ['dos', 'nueve']);
  });

  it('rechaza puntos que no suman 100 y r1 sin hueco', () => {
    const ed = copia(base);
    ed.r2[2].pts = 50;
    ed.r1[3].q = 'Frase sin hueco.';
    const errores = validarEdicion(ed);
    assert.ok(errores.some((e) => e.startsWith('r2:') && e.includes('100')));
    assert.ok(errores.some((e) => e.startsWith('r1[3]')));
  });

  it('rechaza términos repetidos en r5', () => {
    const ed = copia(base);
    ed.r5.push('Páncreas');
    assert.ok(validarEdicion(ed).some((e) => e.startsWith('r5')));
  });
});

describe('validador de resultados', () => {
  const rondas = { r1: 90, r2: 78, r3: 84, r4: 72, r5: 88 };
  const valido = {
    edicion: '2026-11', slug: 'abimael-perez', nombre: 'Abimael Pérez',
    total: calcularTotal(rondas), segundos: 583, rondas, fecha: '2026-11-18T16:40:12.000Z',
  };

  it('acepta el ejemplo de la especificación', () => {
    assert.equal(valido.total, 412);
    assert.deepEqual(validarResultado(valido), []);
  });

  it('rechaza puntajes mayores a 500, nombres vacíos y totales que no cuadran', () => {
    assert.ok(validarResultado({ ...valido, total: 501 }).length);
    assert.ok(validarResultado({ ...valido, total: 413 }).length);
    assert.ok(validarResultado({ ...valido, nombre: '   ', slug: '' }).length);
    assert.ok(validarResultado({ ...valido, rondas: { ...rondas, r1: 101 }, total: 423 }).length);
    assert.ok(validarResultado({ ...valido, slug: 'otra-persona' }).length);
  });

  it('normaliza registros con rondas en columnas (como llegan de SharePoint)', () => {
    const r = normalizarResultado({ Title: 'Abimael Pérez', edicion: '2026-11', slug: 'abimael-perez', total: '412', segundos: '583', r1: 90, r2: 78, r3: 84, r4: 72, r5: 88, fecha: valido.fecha });
    assert.deepEqual(r, valido);
    assert.equal(normalizarResultado({ edicion: '2026-11' }), null);
  });
});

describe('edición vigente', () => {
  it('elige la más reciente cuyo mes ya empezó', () => {
    const ids = ['2026-11', '2026-12', '2027-01'];
    assert.deepEqual(elegirEdiciones(ids, new Date(2026, 11, 3)), { vigente: '2026-12', publicadas: ['2026-11', '2026-12'] });
    assert.deepEqual(elegirEdiciones(ids, new Date(2026, 10, 10)), { vigente: '2026-11', publicadas: ['2026-11'] });
    assert.equal(elegirEdiciones(ids, new Date(2026, 0, 1)).vigente, '2026-11');
  });
});
