// Ronda 5 — Racha perfecta: escribir términos con acentos durante 45 s; multiplicador por racha.
import { avanzarRacha, compararTermino, crearEstadoRacha, multiplicadorRacha, puntajeRacha } from '../calificacion.js';
import { animar, barajar, campoTexto, crearCuentaRegresiva, el, flotar, reemplazar } from '../ui.js';

export const id = 'r5';
export const titulo = 'Racha perfecta';
export const icono = '⚡';
export const lema = 'Velocidad con precisión: encadena aciertos y multiplica tus puntos.';
export const SEGUNDOS = 45;

export function instrucciones() {
  return [
    'Aparecerá un término médico: escríbelo exactamente igual, con acentos, y presiona Enter.',
    `Tienes ${SEGUNDOS} segundos para escribir todos los que puedas.`,
    'Cada acierto vale 2 puntos. Desde 3 aciertos seguidos valen ×2 🔥 y desde 6 seguidos ×3 🔥🔥.',
    'Un error reinicia la racha. El máximo de la ronda es 100 puntos.',
  ];
}

export function jugar(contenedor, datos, terminar) {
  const terminos = barajar(datos.r5);
  let posicion = 0;
  let estado = crearEstadoRacha();
  let terminado = false;
  const errores = [];

  const termino = el('p', { clase: 'termino', 'aria-live': 'polite' });
  const tarjeta = el('div', { clase: 'tarjeta-termino' }, termino);
  const puntos = el('span', { clase: 'chip chip-puntos' });
  const fuego = el('span', { clase: 'chip chip-fuego' });
  const retro = el('p', { clase: 'retro', role: 'status' });
  const campo = campoTexto({ id: 'racha-campo', clase: 'campo-racha', 'aria-label': 'Escribe el término y presiona Enter' });
  // Los términos se recorren en ciclo: nadie se queda sin palabras.
  const actual = () => terminos[posicion % terminos.length];

  function pintar() {
    termino.textContent = actual();
    const mult = multiplicadorRacha(estado.racha + 1);
    puntos.textContent = `⭐ ${puntajeRacha(estado)} pts`;
    fuego.textContent = `${estado.racha >= 6 ? '🔥🔥' : estado.racha >= 3 ? '🔥' : '✨'} Racha ${estado.racha} · siguiente ×${mult}`;
    fuego.dataset.nivel = String(multiplicadorRacha(estado.racha));
  }

  campo.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || terminado) return;
    e.preventDefault();
    const escrito = campo.value;
    if (!escrito.trim()) return;
    const esperado = actual();
    const correcto = compararTermino(escrito, esperado);
    const antes = estado.puntos;
    estado = avanzarRacha(estado, correcto);
    if (correcto) {
      retro.textContent = `✓ ${esperado}`;
      retro.className = 'retro ok';
      flotar(tarjeta, `+${estado.puntos - antes}`);
      if (estado.racha === 3 || estado.racha === 6) {
        flotar(fuego, estado.racha === 3 ? '¡Combo ×2!' : '¡Combo ×3!', 'combo');
        animar(fuego, 'pop');
      }
      animar(tarjeta, 'pop');
    } else {
      errores.push({ escrito, esperado });
      retro.textContent = `✗ Era «${esperado}». Racha reiniciada.`;
      retro.className = 'retro mal';
      animar(tarjeta, 'sacudir');
    }
    posicion++;
    campo.value = '';
    pintar();
  });

  const cuenta = crearCuentaRegresiva(SEGUNDOS, finalizar);
  pintar();
  reemplazar(contenedor, cuenta.elemento, el('div', { clase: 'barra-ronda' }, fuego, puntos), tarjeta, campo, retro);
  campo.focus();

  function finalizar() {
    if (terminado) return;
    terminado = true;
    cuenta.detener();
    campo.disabled = true;
    const revision = el('div', {},
      el('p', {}, `✓ Aciertos: ${estado.aciertos} · ✗ Errores: ${estado.errores}`),
      errores.length ? [el('h3', {}, '📚 Revisa estos términos'), el('ul', { clase: 'lista-revision' }, errores.map((x) => el('li', {},
        el('s', { clase: 'mal' }, x.escrito), ' → ', el('strong', {}, x.esperado))))] : el('p', { clase: 'perfecto' }, '🎯 ¡Sin un solo error!'),
    );
    terminar(puntajeRacha(estado), revision);
  }

  return () => cuenta.detener();
}
