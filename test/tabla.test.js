import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calcularTotal } from '../src/calificacion.js';
import { aCSV, calcularAcumulado, calcularMedallas, campoCSV, csvEdicion, ordenarEdicion } from '../src/tabla.js';

function res(nombre, rondas, segundos = 600, edicion = '2026-11', fecha = `${edicion}-15T10:00:00.000Z`) {
  const slug = nombre.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, '-');
  const [r1, r2, r3, r4, r5] = rondas;
  const obj = { r1, r2, r3, r4, r5 };
  return { edicion, slug, nombre, total: calcularTotal(obj), segundos, rondas: obj, fecha };
}

describe('tabla por edición', () => {
  it('ordena por total y desempata por tiempo y caza errores', () => {
    const a = res('Ana', [80, 80, 80, 80, 80], 500);
    const b = res('Beto', [80, 80, 80, 80, 80], 400);
    const c = res('Caro', [100, 100, 100, 100, 100], 900);
    assert.deepEqual(ordenarEdicion([a, b, c]).map((r) => [r.nombre, r.posicion]), [['Caro', 1], ['Beto', 2], ['Ana', 3]]);
  });

  it('funciona con una sola persona y con ninguna', () => {
    assert.equal(ordenarEdicion([]).length, 0);
    assert.deepEqual(calcularMedallas([]), { general: null, porRonda: [] });
    const solo = res('Ana', [10, 20, 30, 40, 50]);
    const m = calcularMedallas([solo]);
    assert.equal(m.general.nombre, 'Ana');
    assert.ok(m.porRonda.every((x) => x.ganador.nombre === 'Ana'));
  });

  it('las medallas por ronda pueden repartirse entre seis personas distintas', () => {
    const lista = [
      res('General', [90, 90, 90, 90, 90]),
      res('Ortografía', [100, 0, 0, 0, 0]),
      res('Oído', [0, 100, 0, 0, 0]),
      res('Ojo', [0, 0, 100, 0, 0]),
      res('Memoria', [0, 0, 0, 100, 0]),
      res('Dedos', [0, 0, 0, 0, 100]),
    ];
    const m = calcularMedallas(lista);
    const ganadores = new Set([m.general.nombre, ...m.porRonda.map((x) => x.ganador.nombre)]);
    assert.equal(ganadores.size, 6);
  });
});

describe('acumulado', () => {
  const todos = [
    res('Ana Díaz', [90, 90, 90, 90, 90], 600, '2026-11'),
    res('Ana Díaz', [50, 50, 50, 50, 50], 600, '2026-12'),
    res('Beto Ruiz', [80, 80, 80, 80, 80], 600, '2026-12'),
  ];

  it('agrupa por slug con suma, ediciones jugadas y promedio', () => {
    const [ana] = calcularAcumulado(todos).filter((g) => g.slug === 'ana-diaz');
    assert.equal(ana.ediciones, 2);
    assert.equal(ana.suma, 700);
    assert.equal(ana.promedio, 350);
  });

  it('por promedio no castiga a quien se incorporó después', () => {
    assert.deepEqual(calcularAcumulado(todos, 'promedio').map((g) => g.nombre), ['Beto Ruiz', 'Ana Díaz']);
    assert.deepEqual(calcularAcumulado(todos, 'suma').map((g) => g.nombre), ['Ana Díaz', 'Beto Ruiz']);
  });
});

describe('CSV', () => {
  it('escapa comas, comillas y saltos de línea', () => {
    assert.equal(campoCSV('Pérez, Ana'), '"Pérez, Ana"');
    assert.equal(campoCSV('Ana "la rápida"'), '"Ana ""la rápida"""');
    assert.equal(campoCSV(412), '412');
  });

  it('neutraliza fórmulas en nombres', () => {
    assert.equal(campoCSV('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
    assert.equal(campoCSV('@SUMA'), "'@SUMA");
  });

  it('incluye BOM, encabezados y CRLF', () => {
    const texto = aCSV(['a', 'b'], [[1, 2]]);
    assert.equal(texto, '﻿a,b\r\n1,2\r\n');
    const csv = csvEdicion([res('Ana Díaz', [90, 78, 84, 72, 88], 583)]);
    const lineas = csv.replace('﻿', '').trim().split('\r\n');
    assert.equal(lineas.length, 2);
    assert.ok(lineas[1].startsWith('1,Ana Díaz,ana-diaz,2026-11,412,90,78,84,72,88,583,9:43'));
  });
});
