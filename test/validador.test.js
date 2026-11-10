import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { calcularTotal } from '../src/calificacion.js';
import {
  cifrasNoDictables, elegirEdiciones, normalizarResultado, numerosSinDiccionario, validarEdicion, validarIndice, validarResultado,
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
  const SEIS = 'Páncreas y vaso{bazo|El bazo es el órgano} normales. Pared de 3 cm{mm}. Sin halazgos{hallazgos}. Riñón izquierdo{derecho}. Cavidad perineal{peritoneal}. Ecogenisidad{ecogenicidad} normal.';
  const conReporte = (texto) => ({ ...copia(base), r3: { seg: 90, texto } });

  it('rechaza r3 sin exactamente seis marcas de error', () => {
    assert.deepEqual(validarEdicion(conReporte(SEIS)), []);
    assert.ok(validarEdicion(conReporte(SEIS.replace('vaso{bazo|El bazo es el órgano}', 'bazo'))).some((e) => e.includes('exactamente 6')));
    assert.ok(validarEdicion(conReporte(`${SEIS} Higado{Hígado} normal.`)).some((e) => e.includes('exactamente 6')));
  });

  it('valida cada reporte cuando r3 es una lista de alternativas', () => {
    const ed = copia(base);
    ed.r3 = [{ seg: 90, texto: SEIS }, { seg: 90, texto: 'Solo vaso{bazo}.' }];
    assert.ok(validarEdicion(ed).some((e) => e.startsWith('r3[1]') && e.includes('exactamente 6')));
  });

  it('rechaza llaves mal cerradas o separadas de la palabra', () => {
    assert.ok(validarEdicion(conReporte(SEIS.replace('cm{mm}', 'cm {mm}'))).length > 0);
    assert.ok(validarEdicion(conReporte(SEIS.replace('cm{mm}', 'cm{mm'))).length > 0);
  });

  it('exige los mismos puntos en las alternativas de una posición', () => {
    const ed = copia(base);
    ed.r4 = [[{ t: 'Frase uno.', seg: 8, pts: 40 }, { t: 'Frase dos.', seg: 8, pts: 30 }], { t: 'Frase tres.', seg: 12, pts: 60 }];
    assert.ok(validarEdicion(ed).some((e) => e.startsWith('r4[0]') && e.includes('mismos puntos')));
  });

  it('acepta el formato original sin alternativas', () => {
    const ed = copia(base);
    ed.r1 = ed.r1.slice(0, 10);
    ed.r2 = [{ di: 'Uno.', es: 'Uno.', pts: 30 }, { di: 'Dos.', es: 'Dos.', pts: 30 }, { di: 'Tres.', es: 'Tres.', pts: 40 }];
    ed.r3 = { seg: 90, texto: SEIS };
    ed.r4 = [{ t: 'Frase uno.', seg: 8, pts: 40 }, { t: 'Frase dos.', seg: 12, pts: 60 }];
    assert.deepEqual(validarEdicion(ed), []);
  });

  it('rechaza una opción repetida en r1', () => {
    const ed = copia(base);
    ed.r1[0].o = [ed.r1[0].o[0], ed.r1[0].o[1], ed.r1[0].o[0]];
    assert.ok(validarEdicion(ed).some((e) => e.startsWith('r1[0]') && e.includes('repetidas')));
    const mayusculas = copia(base);
    mayusculas.r1[1].o = [mayusculas.r1[1].o[0], mayusculas.r1[1].o[0].toUpperCase(), mayusculas.r1[1].o[1]];
    assert.ok(validarEdicion(mayusculas).some((e) => e.startsWith('r1[1]')));
  });

  it('rechaza un número en letra que no esté en el diccionario', () => {
    const ed = copia(base);
    const dictado = Array.isArray(ed.r2[0]) ? ed.r2[0][0] : ed.r2[0];
    dictado.es = 'Quiste de ochenta milímetros.';
    dictado.di = 'Quiste de ochenta milímetros.';
    const errores = validarEdicion(ed);
    assert.ok(errores.some((e) => e.includes('ochenta')));

    const memoria = copia(base);
    const frase = Array.isArray(memoria.r4[0]) ? memoria.r4[0][0] : memoria.r4[0];
    frase.t = 'Lesión de sesenta milímetros.';
    assert.ok(validarEdicion(memoria).some((e) => e.startsWith('r4[0]') && e.includes('sesenta')));
  });

  it('acepta los números que sí están en el diccionario y no confunde artículos', () => {
    assert.deepEqual(numerosSinDiccionario('un quiste de doce milímetros y una lesión de tres'), []);
    assert.deepEqual(numerosSinDiccionario('tercio medio y línea media'), []);
    assert.deepEqual(numerosSinDiccionario('setenta quistes de mil mm'), ['setenta', 'mil']);
  });

  it('en dictados rechaza decimales y cifras que no están en el diccionario', () => {
    assert.deepEqual(cifrasNoDictables('quiste de 15 mm y lito de 8 mm'), []);
    assert.deepEqual(cifrasNoDictables('volumen de 22.9 cc y 138 ml'), ['22.9', '138']);
    const ed = copia(base);
    const dictado = Array.isArray(ed.r2[0]) ? ed.r2[0][0] : ed.r2[0];
    dictado.es = 'Volumen prostático de 43.9 cc.';
    assert.ok(validarEdicion(ed).some((e) => e.includes('43.9')));
  });

  it('rechaza puntos que no suman 100 y r1 sin hueco', () => {
    const ed = copia(base);
    ed.r2[2] = { di: 'Texto.', es: 'Texto.', pts: 50 };
    ed.r1[3].q = 'Frase sin hueco.';
    const errores = validarEdicion(ed);
    assert.ok(errores.some((e) => e.startsWith('r2:') && e.includes('100')));
    assert.ok(errores.some((e) => e.startsWith('r1[3]')));
  });

  it('valida los ajustes de dificultad', () => {
    const ed = copia(base);
    ed.dificultad = { velocidadVoz: 1.1, segundosOrtografia: 10 };
    assert.deepEqual(validarEdicion(ed), []);
    ed.dificultad = { velocidadVoz: 3, segundosOrtografia: 2, turbo: true };
    const errores = validarEdicion(ed);
    assert.ok(errores.some((e) => e.startsWith('dificultad.velocidadVoz')));
    assert.ok(errores.some((e) => e.startsWith('dificultad.segundosOrtografia')));
    assert.ok(errores.some((e) => e.startsWith('dificultad.turbo')));
  });

  it('rechaza términos repetidos en r5', () => {
    const ed = copia(base);
    ed.r5.push(ed.r5[0].toUpperCase());
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
