import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  avanzarRacha, calcularTotal, compararResultados, compararTermino, crearEstadoRacha, crearSlug,
  erroresCazaErrores, evaluarCazaErrores, levenshtein, multiplicadorRacha, palabras, parsearCazaErrores, precision,
  puntajeCazaErrores, puntajeOrtografia, puntajeRacha, puntajeTranscripcion, puntosReactivo, recortarRonda,
} from '../src/calificacion.js';

const ESPERADO = 'Riñón derecho de forma y tamaño normales. Se observa un quiste simple de 15 milímetros en el polo inferior.';

describe('precisión de transcripción', () => {
  it('una transcripción idéntica da 1', () => {
    assert.equal(precision(ESPERADO, ESPERADO), 1);
  });

  it('una transcripción vacía da 0', () => {
    assert.equal(precision('', ESPERADO), 0);
    assert.equal(precision('   ', ESPERADO), 0);
  });

  it('mayúsculas y puntuación no bajan la precisión', () => {
    const sinFormato = 'riñón derecho de forma y tamaño normales se observa un quiste simple de 15 milímetros en el polo inferior';
    assert.equal(precision(sinFormato, ESPERADO), 1);
    assert.equal(precision('RIÑÓN DERECHO, DE FORMA; Y TAMAÑO: NORMALES!!! Se observa un quiste simple de 15 milímetros en el polo inferior', ESPERADO), 1);
  });

  it('un acento faltante sí la baja, y cuesta exactamente una palabra', () => {
    const sinAcento = ESPERADO.replace('Riñón', 'Rinon');
    const n = palabras(ESPERADO).length;
    assert.equal(precision(sinAcento, ESPERADO), 1 - 1 / n);
    assert.ok(precision(ESPERADO.replace('milímetros', 'milimetros'), ESPERADO) < 1);
  });

  it('"doce milímetros" y "12 milímetros" se califican igual', () => {
    const esperado = 'Lito de 12 milímetros.';
    assert.equal(precision('lito de doce milímetros', esperado), 1);
    assert.equal(precision('lito de 12 milímetros', esperado), 1);
    assert.equal(precision('Lito de doce milímetros.', 'Lito de doce milímetros.'), precision('Lito de 12 milímetros.', 'Lito de doce milímetros.'));
  });

  it('acepta acentos en forma descompuesta (NFD) igual que compuesta', () => {
    assert.equal(precision('Riñón', 'Riñón'), 1);
  });

  it('la precisión nunca es negativa aunque sobren muchas palabras', () => {
    assert.equal(precision('a b c d e f g h i j k l m n', 'quiste simple'), 0);
  });

  it('los puntos de un reactivo son precisión × pts', () => {
    assert.equal(puntosReactivo(ESPERADO, ESPERADO, 40), 40);
    assert.equal(puntosReactivo('', ESPERADO, 40), 0);
  });
});

describe('levenshtein por palabras', () => {
  it('cuenta inserciones, borrados y sustituciones', () => {
    assert.equal(levenshtein([], []), 0);
    assert.equal(levenshtein(['a'], []), 1);
    assert.equal(levenshtein(['a', 'b', 'c'], ['a', 'x', 'c']), 1);
    assert.equal(levenshtein(['a', 'b'], ['b', 'a']), 2);
    assert.equal(levenshtein(['quiste', 'simple'], ['quiste', 'muy', 'simple']), 1);
  });
});

describe('caza errores', () => {
  it('6 aciertos y 0 falsos positivos da 100', () => {
    assert.equal(puntajeCazaErrores(6, 0), 100);
  });

  it('6 aciertos y 8 falsos positivos da 36', () => {
    assert.equal(puntajeCazaErrores(6, 8), 36);
  });

  it('marcar todo es peor que acertar tres sin penalización', () => {
    assert.equal(puntajeCazaErrores(3, 0), 50);
    assert.ok(puntajeCazaErrores(6, 8) < puntajeCazaErrores(3, 0));
  });

  it('nunca es negativo', () => {
    assert.equal(puntajeCazaErrores(0, 40), 0);
  });

  it('parsea las marcas palabraMal{corrección} y evalúa lo marcado', () => {
    const segmentos = parsearCazaErrores('Páncreas y vaso{bazo} de 3 cm{mm}. Hígado normal.');
    const palabrasTexto = segmentos.filter((s) => s.tipo === 'palabra');
    assert.deepEqual(palabrasTexto.map((s) => s.texto), ['Páncreas', 'y', 'vaso', 'de', '3', 'cm', 'Hígado', 'normal']);
    const errores = palabrasTexto.filter((s) => s.correccion !== null);
    assert.deepEqual(errores.map((s) => [s.texto, s.correccion]), [['vaso', 'bazo'], ['cm', 'mm']]);
    // El texto visible no incluye las correcciones.
    assert.equal(segmentos.map((s) => s.texto).join(''), 'Páncreas y vaso de 3 cm. Hígado normal.');

    const vaso = palabrasTexto[2].indice;
    const higado = palabrasTexto[6].indice;
    const r = evaluarCazaErrores(segmentos, [vaso, higado]);
    assert.equal(r.aciertos, 1);
    assert.equal(r.falsosPositivos, 1);
    assert.equal(r.omitidos, 1);
    assert.equal(r.puntos, Math.round(100 / 2 - 8));
  });

  it('los separadores nunca cuentan como errores', () => {
    const segmentos = parsearCazaErrores('Páncreas y vaso{bazo}. Hígado, normal.');
    assert.deepEqual(erroresCazaErrores(segmentos).map((s) => s.texto), ['vaso']);
  });
});

describe('racha', () => {
  const jugar = (respuestas) => respuestas.reduce((e, ok) => avanzarRacha(e, ok), crearEstadoRacha());

  it('aplica ×2 desde el tercer acierto consecutivo y ×3 desde el sexto', () => {
    assert.equal(multiplicadorRacha(1), 1);
    assert.equal(multiplicadorRacha(2), 1);
    assert.equal(multiplicadorRacha(3), 2);
    assert.equal(multiplicadorRacha(5), 2);
    assert.equal(multiplicadorRacha(6), 3);
    // 2 + 2 + 4 → 8
    assert.equal(jugar([true, true, true]).puntos, 8);
    // 2 + 2 + 4 + 4 + 4 + 6 → 22
    assert.equal(jugar([true, true, true, true, true, true]).puntos, 22);
  });

  it('un error reinicia la racha en cero', () => {
    const e = jugar([true, true, true, false]);
    assert.equal(e.racha, 0);
    assert.equal(e.puntos, 8);
    // Tras el error vuelve a valer ×1: 8 + 2 + 2 + 4
    assert.equal(jugar([true, true, true, false, true, true, true]).puntos, 16);
  });

  it('no muta el estado anterior', () => {
    const inicial = crearEstadoRacha();
    avanzarRacha(inicial, true);
    assert.deepEqual(inicial, crearEstadoRacha());
  });

  it('se recorta a 100', () => {
    assert.equal(puntajeRacha(jugar(Array(60).fill(true))), 100);
  });

  it('la comparación es exacta tras minúsculas y NFC: los acentos cuentan', () => {
    assert.ok(compararTermino('Páncreas', 'páncreas'));
    assert.ok(compararTermino('  RIÑÓN ', 'riñón'));
    assert.ok(compararTermino('páncreas', 'páncreas'));
    assert.ok(!compararTermino('pancreas', 'páncreas'));
    assert.ok(!compararTermino('rinon', 'riñón'));
  });
});

describe('límites de cada ronda', () => {
  it('ninguna ronda devuelve más de 100 ni menos de 0', () => {
    assert.equal(puntajeOrtografia(15), 100);
    assert.equal(puntajeOrtografia(-1), 0);
    assert.equal(puntajeCazaErrores(9, 0), 100);
    assert.equal(puntajeCazaErrores(0, 99), 0);
    assert.equal(puntajeRacha({ puntos: 500 }), 100);
    assert.equal(puntajeRacha({ puntos: -3 }), 0);
    assert.equal(puntajeTranscripcion([{ escrito: 'a', esperado: 'a', pts: 70 }, { escrito: 'b', esperado: 'b', pts: 70 }]), 100);
    assert.equal(puntajeTranscripcion([{ escrito: '', esperado: 'hola', pts: 40 }]), 0);
    assert.equal(recortarRonda(130), 100);
    assert.equal(recortarRonda(-5), 0);
    assert.equal(recortarRonda(NaN), 0);
    assert.equal(recortarRonda(Infinity), 0);
  });

  it('el total suma rondas ya redondeadas y recortadas', () => {
    assert.equal(calcularTotal({ r1: 90, r2: 77.6, r3: 84.4, r4: 150, r5: -10 }), 90 + 78 + 84 + 100 + 0);
    // Redondear por ronda no es lo mismo que redondear al final: 0.4 × 5 = 2 → 0 + 0 + …
    assert.equal(calcularTotal({ r1: 0.4, r2: 0.4, r3: 0.4, r4: 0.4, r5: 0.4 }), 0);
  });
});

describe('desempates y slug', () => {
  const base = { rondas: { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 } };
  it('ordena por total, luego por menor tiempo, luego por caza errores', () => {
    const a = { ...base, total: 400, segundos: 600 };
    const b = { ...base, total: 410, segundos: 900 };
    const c = { ...base, total: 400, segundos: 500 };
    const d = { total: 400, segundos: 500, rondas: { ...base.rondas, r3: 90 } };
    assert.deepEqual([a, b, c, d].sort(compararResultados), [b, d, c, a]);
  });

  it('el slug quita acentos, mayúsculas y espacios', () => {
    assert.equal(crearSlug('Abimael Pérez'), 'abimael-perez');
    assert.equal(crearSlug('  ABIMAEL   PÉREZ  '), 'abimael-perez');
    assert.equal(crearSlug('María José Núñez'), 'maria-jose-nunez');
    assert.equal(crearSlug('<script>'), 'script');
  });
});
