// Ronda 1 — Ortografía relámpago: 10 frases, tres opciones, 12 s por frase, 10 puntos por acierto.
import { puntajeOrtografia } from '../calificacion.js';
import { anunciar, barajar, crearCuentaRegresiva, el, reemplazar } from '../ui.js';

export const id = 'r1';
export const titulo = 'Ortografía relámpago';
export const SEGUNDOS_POR_FRASE = 12;
const PAUSA_RESPUESTA_MS = 1100;

export function instrucciones(datos) {
  return [
    `Verás ${datos.r1.length} frases médicas con un hueco y tres opciones. Solo una está bien escrita.`,
    'Elige con el ratón o con las teclas 1, 2 y 3.',
    `Tienes ${SEGUNDOS_POR_FRASE} segundos por frase. Si se acaba el tiempo cuenta como error.`,
    'Cada acierto vale 10 puntos.',
  ];
}

export function jugar(contenedor, datos, terminar) {
  // En el JSON la correcta siempre es la primera; en pantalla se barajan preguntas y opciones.
  const preguntas = barajar(datos.r1).map((p) => ({ q: p.q, correcta: p.o[0], opciones: barajar(p.o) }));
  let indice = 0;
  let aciertos = 0;
  let cuenta = null;
  let respondida = false;
  let espera = null;
  let botones = [];
  const fallos = [];

  const progreso = el('p', { clase: 'progreso' });
  const zona = el('div', { clase: 'ortografia' });
  const retro = el('p', { clase: 'retro', role: 'status' });
  reemplazar(contenedor, progreso, zona, retro);

  function alTeclear(e) {
    if (respondida || e.altKey || e.ctrlKey || e.metaKey) return;
    const n = Number(e.key);
    if (n >= 1 && n <= botones.length) {
      e.preventDefault();
      responder(botones[n - 1]);
    }
  }
  document.addEventListener('keydown', alTeclear);

  function mostrar() {
    if (indice >= preguntas.length) { finalizar(); return; }
    const p = preguntas[indice];
    respondida = false;
    progreso.textContent = `Frase ${indice + 1} de ${preguntas.length} · Aciertos: ${aciertos}`;
    retro.textContent = '';
    const [antes, despues] = p.q.split('___');
    botones = p.opciones.map((opcion, i) => el('button', {
      type: 'button', clase: 'opcion', 'data-opcion': opcion, onClick: (e) => responder(e.currentTarget),
    }, el('span', { clase: 'tecla', 'aria-hidden': 'true' }, String(i + 1)), ' ', opcion));
    cuenta = crearCuentaRegresiva(SEGUNDOS_POR_FRASE, () => responder(null));
    reemplazar(zona,
      cuenta.elemento,
      el('p', { clase: 'frase' }, antes, el('span', { clase: 'hueco', 'aria-label': 'hueco' }, '_____'), despues),
      el('div', { clase: 'opciones', role: 'group', 'aria-label': 'Opciones' }, botones),
    );
    botones[0].focus();
  }

  function responder(boton) {
    if (respondida) return;
    respondida = true;
    cuenta?.detener();
    const p = preguntas[indice];
    const elegida = boton?.dataset.opcion ?? null;
    const acierto = elegida === p.correcta;
    if (acierto) aciertos++;
    else fallos.push({ frase: p.q, correcta: p.correcta, elegida });

    for (const b of botones) {
      b.disabled = true;
      if (b.dataset.opcion === p.correcta) {
        b.classList.add('correcta');
        b.append(el('span', { clase: 'marca' }, ' ✓'));
      } else if (b === boton) {
        b.classList.add('incorrecta');
        b.append(el('span', { clase: 'marca' }, ' ✗'));
      }
    }
    retro.textContent = acierto ? '✓ Correcto' : elegida === null ? `⏱ Tiempo agotado. Era «${p.correcta}».` : `✗ Era «${p.correcta}».`;
    anunciar(retro.textContent);
    espera = setTimeout(() => { indice++; mostrar(); }, PAUSA_RESPUESTA_MS);
  }

  function finalizar() {
    cancelar();
    const revision = fallos.length
      ? el('div', {}, el('h3', {}, 'Frases falladas'), el('ul', { clase: 'lista-revision' },
        fallos.map((f) => el('li', {}, f.frase.replace('___', f.correcta), ' — ',
          el('span', { clase: 'ok' }, `✓ ${f.correcta}`),
          f.elegida ? [' · elegiste ', el('s', { clase: 'mal' }, f.elegida)] : ' · sin respuesta'))))
      : el('p', {}, '¡Sin errores!');
    terminar(puntajeOrtografia(aciertos), revision);
  }

  function cancelar() {
    cuenta?.detener();
    clearTimeout(espera);
    document.removeEventListener('keydown', alTeclear);
  }

  mostrar();
  return cancelar;
}
