import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { FRASES_ORTOGRAFIA, alternativas, barajar, prepararExamen, variantes } from '../src/seleccion.js';
import { validarEdicion } from '../src/validador.js';

const leer = (ruta) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), 'utf8'));
const indice = leer('../ediciones/index.json');

/** Generador pseudoaleatorio reproducible (mulberry32). */
function semilla(n) {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('sorteo del examen', () => {
  it('barajar no pierde ni duplica elementos y no modifica la original', () => {
    const original = [1, 2, 3, 4, 5, 6];
    const copia = barajar(original, semilla(1));
    assert.deepEqual([...copia].sort(), original);
    assert.deepEqual(original, [1, 2, 3, 4, 5, 6]);
  });

  it('alternativas siempre devuelve una lista', () => {
    assert.deepEqual(alternativas({ a: 1 }), [{ a: 1 }]);
    assert.deepEqual(alternativas([1, 2]), [1, 2]);
  });

  for (const id of indice.ediciones) {
    const ed = leer(`../ediciones/${id}.json`);

    it(`${id}: cada examen sorteado vale exactamente 100 puntos por ronda`, () => {
      for (let n = 0; n < 50; n++) {
        const ex = prepararExamen(ed, semilla(n));
        assert.equal(ex.r1.length, FRASES_ORTOGRAFIA);
        assert.equal(new Set(ex.r1.map((x) => x.q)).size, FRASES_ORTOGRAFIA, 'sin frases repetidas');
        assert.equal(ex.r2.reduce((a, x) => a + x.pts, 0), 100);
        assert.equal(ex.r4.reduce((a, x) => a + x.pts, 0), 100);
        assert.ok(typeof ex.r3.texto === 'string');
        // El examen concreto también es una edición válida (formato original).
        assert.deepEqual(validarEdicion(ex), []);
      }
    });

    it(`${id}: hay variedad real entre partidas`, () => {
      assert.ok(variantes(ed) > 1000, `solo ${variantes(ed)} variantes`);
      const firmas = new Set();
      for (let n = 0; n < 20; n++) {
        const ex = prepararExamen(ed, semilla(n));
        firmas.add(JSON.stringify([ex.r1.map((x) => x.q).sort(), ex.r2.map((x) => x.es), ex.r3.texto, ex.r4.map((x) => x.t)]));
      }
      assert.ok(firmas.size >= 18, `solo ${firmas.size} exámenes distintos en 20 partidas`);
    });
  }
});
