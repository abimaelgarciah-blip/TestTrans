import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Buffer } from 'node:buffer';
import { ordenarCarrera, calcularTotales, codigoSala, limpiarCodigo, limpiarNombre, sortearItem, pesosItem, formatoTiempo, PUNTOS } from '../kart/js/puntos.js';
import { lineaCentral, indiceCercano, parrilla, PISTAS } from '../kart/js/pistas.js';
import { agrupar } from '../kart/js/guardado.js';
import { leerMarco, crearMarco, registroValido } from '../kart/servidor.js';

const c = (id, tiempo, progreso = 3) => ({ id, nombre: id, personaje: 'rana', tiempo, progreso });

describe('kart: puntos', () => {
  it('ordena por tiempo y luego por progreso a quien no llegó', () => {
    const filas = ordenarCarrera([c('a', 70), c('b', null, 2.5), c('c', 65), c('d', null, 2.9)]);
    assert.deepEqual(filas.map((f) => [f.id, f.posicion, f.puntos]), [['c', 1, 15], ['a', 2, 12], ['d', 3, 10], ['b', 4, 8]]);
  });

  it('suma tres carreras y desempata por victorias', () => {
    const c1 = ordenarCarrera([c('ana', 60), c('beto', 61), c('caro', 62)]);
    const c2 = ordenarCarrera([c('beto', 60), c('ana', 61), c('caro', 62)]);
    const c3 = ordenarCarrera([c('caro', 60), c('ana', 61), c('beto', 62)]);
    const t = calcularTotales([c1, c2, c3]);
    assert.equal(t[0].id, 'ana'); // 15+12+12 = 39
    assert.equal(t[0].total, 39);
    assert.deepEqual(t[0].posiciones, [1, 2, 2]);
    // beto 12+15+10 = 37, caro 10+10+15 = 35
    assert.deepEqual(t.map((x) => x.total), [39, 37, 35]);
    const empate = calcularTotales([ordenarCarrera([c('x', 1), c('y', 2)]), ordenarCarrera([c('y', 1), c('x', 2)])]);
    assert.equal(empate[0].total, empate[1].total);
    assert.equal(empate[0].id, 'y'); // misma suma y victorias: gana quien quedó mejor en la última
  });

  it('da puntos a los 10 lugares', () => {
    assert.equal(PUNTOS.length, 10);
    const filas = ordenarCarrera(Array.from({ length: 10 }, (_, i) => c(`p${i}`, 60 + i)));
    assert.ok(filas.every((f) => f.puntos > 0));
  });

  it('limpia códigos y nombres', () => {
    assert.equal(limpiarCodigo(' ab-c1d9 '), 'ABCD');
    assert.equal(limpiarNombre('   Tío    Juan   Carlos Pérez López '), 'Tío Juan Carlos');
    assert.match(codigoSala(), /^[A-Z]{4}$/);
    assert.equal(formatoTiempo(75.5), '1:15.50');
    assert.equal(formatoTiempo(null), '—');
  });

  it('los de atrás reciben poderes más fuertes', () => {
    assert.equal(pesosItem(0).rayo, 0);
    assert.ok(pesosItem(1).estrella > pesosItem(0).estrella);
    assert.ok(pesosItem(1).platano < pesosItem(0).platano);
    let n = 0;
    const azar = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 200; i++) assert.ok(['platano', 'cohete', 'misil', 'turbo', 'estrella', 'rayo', 'pastel'].includes(sortearItem(i / 200, azar)));
  });
});

describe('kart: pistas', () => {
  for (const p of PISTAS) {
    it(`${p.nombre}: curva cerrada, larga y con parrilla para 10`, () => {
      const pts = lineaCentral(p.puntos);
      assert.ok(pts.length > 350, `muy corta: ${pts.length}`);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        assert.ok(Math.hypot(b.x - a.x, b.y - a.y) < 15, 'saltos en la línea central');
        assert.ok(a.x > 150 && a.y > 150 && a.x < 1900 && a.y < 1900, 'la pista se sale del mundo');
      }
      assert.equal(indiceCercano(pts, pts[42].x + 3, pts[42].y - 2), 42);
      assert.equal(parrilla(pts, p.ancho, 10).length, 10);
    });
  }
});

describe('kart: historial y servidor', () => {
  it('agrupa carreras por Gran Premio y usa los totales de la última', () => {
    const gps = agrupar([
      { gp_id: 'g1', numero: 1, sala: 'ABCD', creado: '2026-11-20T10:00:00Z', totales: [{ nombre: 'A' }] },
      { gp_id: 'g1', numero: 3, sala: 'ABCD', creado: '2026-11-20T10:10:00Z', totales: [{ nombre: 'B' }] },
      { gp_id: 'g2', numero: 1, sala: 'ZZZZ', creado: '2026-11-19T10:00:00Z', totales: [] },
    ]);
    assert.equal(gps.length, 2);
    assert.equal(gps[0].gp_id, 'g1');
    assert.equal(gps[0].carreras, 3);
    assert.equal(gps[0].totales[0].nombre, 'B');
  });

  it('codifica y decodifica marcos WebSocket (con y sin máscara)', () => {
    for (const largo of [5, 300, 70000]) {
      const datos = Buffer.from('x'.repeat(largo));
      const m = leerMarco(crearMarco(datos, 1));
      assert.equal(m.datos.length, largo);
      const mascara = Buffer.from([1, 2, 3, 4]);
      const cab = crearMarco(datos, 1);
      const pos = largo < 126 ? 2 : largo < 65536 ? 4 : 10;
      const enm = Buffer.concat([cab.subarray(0, pos), mascara, Buffer.from(datos.map((b, i) => b ^ mascara[i & 3]))]);
      enm[1] |= 0x80;
      assert.equal(leerMarco(enm).datos.toString(), datos.toString());
      assert.equal(leerMarco(enm.subarray(0, enm.length - 1)), null);
    }
  });

  it('valida registros', () => {
    assert.ok(registroValido({ gp_id: 'x', numero: 1, pista: 'pradera', resultados: [], totales: [] }));
    assert.ok(!registroValido({ gp_id: 'x', numero: 4, pista: 'pradera', resultados: [], totales: [] }));
  });
});
