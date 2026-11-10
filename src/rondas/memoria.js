// Ronda 4 — Memoria: cada frase se muestra unos segundos, desaparece del DOM y se escribe de memoria.
import { precision, puntajeTranscripcion } from '../calificacion.js';
import { campoTexto, crearCuentaRegresiva, el, reemplazar } from '../ui.js';

export const id = 'r4';
export const titulo = 'Memoria';

export function instrucciones(datos) {
  const seg = datos.r4.map((f) => f.seg).join(' y ');
  const pts = datos.r4.map((f) => f.pts).join(' + ');
  return [
    `Verás ${datos.r4.length} frases, una a la vez, durante ${seg} segundos.`,
    'Cuando desaparezca, escríbela de memoria lo más exacta posible.',
    'No se califican comas, puntos ni mayúsculas. Los acentos sí.',
    `Vale ${pts} puntos según la precisión.`,
  ];
}

export function jugar(contenedor, datos, terminar) {
  const items = datos.r4;
  const respuestas = [];
  let indice = 0;
  let cuenta = null;

  function preparar() {
    const item = items[indice];
    const boton = el('button', { type: 'button', clase: 'primario', onClick: exhibir }, 'Mostrar la frase');
    reemplazar(contenedor,
      el('p', { clase: 'progreso' }, `Frase ${indice + 1} de ${items.length} · ${item.pts} puntos`),
      el('p', {}, `La frase se mostrará durante ${item.seg} segundos.`),
      el('div', { clase: 'acciones' }, boton),
    );
    boton.focus();
  }

  function exhibir() {
    const item = items[indice];
    cuenta = crearCuentaRegresiva(item.seg, escribir);
    reemplazar(contenedor,
      el('p', { clase: 'progreso' }, `Frase ${indice + 1} de ${items.length} · memoriza`),
      cuenta.elemento,
      el('p', { clase: 'frase-memoria', 'aria-live': 'polite' }, item.t),
    );
  }

  function escribir() {
    const item = items[indice];
    const ultimo = indice === items.length - 1;
    const campo = campoTexto({ multilinea: true, rows: 3, id: 'memoria-campo', clase: 'campo-largo' });
    function enviar() {
      respuestas.push({ escrito: campo.value, esperado: item.t, pts: item.pts });
      indice++;
      if (indice < items.length) preparar();
      else finalizar();
    }
    // reemplazar() saca la frase del DOM: no queda en el inspector.
    reemplazar(contenedor,
      el('p', { clase: 'progreso' }, `Frase ${indice + 1} de ${items.length} · escribe`),
      el('label', { for: 'memoria-campo' }, 'Escribe la frase de memoria'),
      campo,
      el('div', { clase: 'acciones' }, el('button', { type: 'button', clase: 'primario', onClick: enviar },
        ultimo ? 'Terminar ronda' : 'Siguiente frase')),
    );
    campo.focus();
  }

  function finalizar() {
    const revision = el('div', {}, el('h3', {}, 'Revisión'),
      respuestas.map((r, i) => el('div', { clase: 'comparacion' },
        el('p', { clase: 'etiqueta' }, `Frase ${i + 1}: ${Math.round(precision(r.escrito, r.esperado) * 100)} % de precisión`),
        el('p', {}, el('strong', {}, 'Original: '), r.esperado),
        el('p', {}, el('strong', {}, 'Escribiste: '), r.escrito.trim() || '(vacío)'))));
    terminar(puntajeTranscripcion(respuestas), revision);
  }

  preparar();
  return () => cuenta?.detener();
}
