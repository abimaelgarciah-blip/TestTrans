// Ronda 5 — Racha perfecta: escribir términos con acentos durante 45 s; multiplicador por racha.
import { avanzarRacha, compararTermino, crearEstadoRacha, multiplicadorRacha, puntajeRacha } from '../calificacion.js';
import { barajar, campoTexto, crearCuentaRegresiva, el, reemplazar } from '../ui.js';

export const id = 'r5';
export const titulo = 'Racha perfecta';
export const SEGUNDOS = 45;

export function instrucciones() {
  return [
    'Aparecerá un término médico: escríbelo exactamente igual, con acentos, y presiona Enter.',
    `Tienes ${SEGUNDOS} segundos para escribir todos los que puedas.`,
    'Cada acierto vale 2 puntos. Desde 3 aciertos seguidos valen ×2 y desde 6 seguidos ×3.',
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
  const marcador = el('p', { clase: 'marcador' });
  const retro = el('p', { clase: 'retro', role: 'status' });
  const campo = campoTexto({ id: 'racha-campo', clase: 'campo-racha', 'aria-label': 'Escribe el término y presiona Enter' });
  // Los términos se recorren en ciclo: nadie se queda sin palabras.
  const actual = () => terminos[posicion % terminos.length];

  function pintar() {
    termino.textContent = actual();
    const mult = multiplicadorRacha(estado.racha + 1);
    marcador.textContent = `Puntos: ${puntajeRacha(estado)} · Racha: ${estado.racha} · Siguiente acierto ×${mult}`;
  }

  campo.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || terminado) return;
    e.preventDefault();
    const escrito = campo.value;
    if (!escrito.trim()) return;
    const esperado = actual();
    const correcto = compararTermino(escrito, esperado);
    estado = avanzarRacha(estado, correcto);
    if (correcto) {
      retro.textContent = `✓ ${esperado}`;
      retro.className = 'retro ok';
    } else {
      errores.push({ escrito, esperado });
      retro.textContent = `✗ Era «${esperado}». Racha reiniciada.`;
      retro.className = 'retro mal';
    }
    posicion++;
    campo.value = '';
    pintar();
  });

  const cuenta = crearCuentaRegresiva(SEGUNDOS, finalizar);
  pintar();
  reemplazar(contenedor, cuenta.elemento, marcador, termino, campo, retro);
  campo.focus();

  function finalizar() {
    if (terminado) return;
    terminado = true;
    cuenta.detener();
    campo.disabled = true;
    const revision = el('div', {},
      el('p', {}, `Aciertos: ${estado.aciertos} · Errores: ${estado.errores}`),
      errores.length ? el('ul', { clase: 'lista-revision' }, errores.map((x) => el('li', {},
        el('s', { clase: 'mal' }, x.escrito), ' → ', el('strong', {}, x.esperado)))) : null,
    );
    terminar(puntajeRacha(estado), revision);
  }

  return () => cuenta.detener();
}
