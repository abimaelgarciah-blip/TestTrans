// Ronda 1 — Ortografía relámpago: 10 frases, tres opciones, 12 s por frase, 10 puntos por acierto.
import { puntajeOrtografia } from '../calificacion.js';
import { animar, anunciar, barajar, crearCuentaRegresiva, el, flotar, reemplazar } from '../ui.js';

export const id = 'r1';
export const titulo = 'Ortografía relámpago';
export const icono = '🔤';
export const lema = 'Elige la palabra bien escrita antes de que se acabe el tiempo.';
export const SEGUNDOS_POR_FRASE = 12;
const PAUSA_RESPUESTA_MS = 1100;

export function instrucciones(datos) {
  return [
    `Verás ${datos.r1.length} frases médicas con un hueco y tres opciones. Solo una está bien escrita.`,
    'Elige con el ratón o con las teclas 1, 2 y 3.',
    `Tienes ${SEGUNDOS_POR_FRASE} segundos por frase. Si se acaba el tiempo cuenta como error.`,
    'Cada acierto vale 10 puntos. Al final verás la regla de cada palabra que fallaste.',
  ];
}

export function jugar(contenedor, datos, terminar) {
  // En el JSON la correcta siempre es la primera; en pantalla se barajan preguntas y opciones.
  const preguntas = barajar(datos.r1).map((p) => ({ q: p.q, nota: p.nota, correcta: p.o[0], opciones: barajar(p.o) }));
  let indice = 0;
  let aciertos = 0;
  let cuenta = null;
  let respondida = false;
  let espera = null;
  let botones = [];
  const fallos = [];
  const aprendidas = [];

  const puntos = el('span', { clase: 'chip chip-puntos' });
  const progreso = el('p', { clase: 'progreso' });
  const puntitos = el('ol', { clase: 'puntitos', 'aria-hidden': 'true' }, preguntas.map(() => el('li')));
  const zona = el('div', { clase: 'ortografia' });
  const retro = el('p', { clase: 'retro', role: 'status' });
  reemplazar(contenedor, el('div', { clase: 'barra-ronda' }, progreso, puntos), puntitos, zona, retro);

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
    progreso.textContent = `Frase ${indice + 1} de ${preguntas.length}`;
    puntos.textContent = `⭐ ${aciertos * 10} pts`;
    puntitos.children[indice]?.classList.add('actual');
    retro.textContent = '';
    retro.className = 'retro';
    const [antes, despues] = p.q.split('___');
    botones = p.opciones.map((opcion, i) => el('button', {
      type: 'button', clase: 'opcion', 'data-opcion': opcion, onClick: (e) => responder(e.currentTarget),
    }, el('span', { clase: 'tecla', 'aria-hidden': 'true' }, String(i + 1)), el('span', { clase: 'opcion-texto' }, opcion)));
    cuenta = crearCuentaRegresiva(SEGUNDOS_POR_FRASE, () => responder(null));
    const tarjeta = el('div', { clase: 'tarjeta-frase entrar' },
      el('p', { clase: 'frase' }, antes, el('span', { clase: 'hueco', 'aria-label': 'hueco' }, '_____'), despues));
    reemplazar(zona,
      cuenta.elemento,
      tarjeta,
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
    const punto = puntitos.children[indice];
    punto?.classList.remove('actual');
    punto?.classList.add(acierto ? 'bien' : 'mal');
    if (acierto) {
      aciertos++;
      if (p.nota) aprendidas.push(p);
    } else {
      fallos.push({ frase: p.q, correcta: p.correcta, elegida, nota: p.nota });
    }

    for (const b of botones) {
      b.disabled = true;
      if (b.dataset.opcion === p.correcta) {
        b.classList.add('correcta');
        b.append(el('span', { clase: 'marca' }, ' ✓'));
        if (acierto) { animar(b, 'pop'); flotar(b, '+10'); }
      } else if (b === boton) {
        b.classList.add('incorrecta');
        b.append(el('span', { clase: 'marca' }, ' ✗'));
        animar(b, 'sacudir');
      }
    }
    puntos.textContent = `⭐ ${aciertos * 10} pts`;
    retro.className = `retro ${acierto ? 'ok' : 'mal'}`;
    retro.textContent = acierto ? '✓ ¡Correcto!' : elegida === null ? `⏱ Tiempo agotado. Era «${p.correcta}».` : `✗ Era «${p.correcta}».`;
    anunciar(retro.textContent);
    espera = setTimeout(() => { indice++; mostrar(); }, PAUSA_RESPUESTA_MS);
  }

  function finalizar() {
    cancelar();
    const revision = fallos.length
      ? el('div', {}, el('h3', {}, '📚 Aprende de tus errores'), el('ul', { clase: 'lista-aprendizaje' },
        fallos.map((f) => el('li', {},
          el('p', { clase: 'aprende-frase' }, f.frase.replace('___', f.correcta)),
          el('p', {}, el('span', { clase: 'ok' }, `✓ ${f.correcta}`),
            f.elegida ? [' · elegiste ', el('s', { clase: 'mal' }, f.elegida)] : ' · sin respuesta'),
          f.nota ? el('p', { clase: 'regla' }, `💡 ${f.nota}`) : null))))
      : el('div', {}, el('p', { clase: 'perfecto' }, '🎯 ¡Ortografía perfecta!'),
        aprendidas[0] ? el('p', { clase: 'regla' }, `💡 Para recordar: ${aprendidas[0].nota}`) : null);
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
