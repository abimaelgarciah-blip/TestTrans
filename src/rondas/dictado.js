// Ronda 2 — Dictado: 3 audios, máximo dos reproducciones cada uno, calificación por precisión.
import { detenerTodo, crearReproductor } from '../audio.js';
import { precision, puntajeTranscripcion } from '../calificacion.js';
import { campoTexto, el, reemplazar } from '../ui.js';
import { medidor } from './comunes.js';

export const id = 'r2';
export const titulo = 'Dictado';
export const icono = '🎧';
export const lema = 'Escucha con atención y transcribe como en un reporte real.';

export function instrucciones(datos) {
  const pts = datos.r2.map((d) => d.pts).join(' + ');
  return [
    `Escucharás ${datos.r2.length} dictados cortos. Escribe lo que oigas.`,
    'Cada audio se puede reproducir como máximo dos veces.',
    'No se califican comas, puntos ni mayúsculas. Los acentos y la ortografía sí.',
    'Los números se pueden escribir con cifra o con letra ("doce" o "12").',
    'Atención: en el último audio el médico se corrige a mitad de la frase ("no, perdón, …"). Escribe solo la versión final, sin la parte que corrigió.',
    'No hay límite de tiempo, pero el tiempo total desempata.',
    `Vale ${pts} puntos según la precisión de cada transcripción.`,
  ];
}

export function jugar(contenedor, datos, terminar) {
  const items = datos.r2;
  const respuestas = [];
  let indice = 0;

  function mostrar() {
    detenerTodo();
    const item = items[indice];
    const ultimo = indice === items.length - 1;
    const campo = campoTexto({ multilinea: true, rows: 5, id: 'dictado-campo', clase: 'campo-largo' });
    const reproductor = crearReproductor(item, { velocidad: datos.dificultad?.velocidadVoz ?? 1 });
    const siguiente = el('button', { type: 'button', clase: 'primario', onClick: avanzar },
      ultimo ? 'Terminar ronda' : 'Siguiente dictado');

    function avanzar() {
      respuestas.push({ escrito: campo.value, esperado: item.es, pts: item.pts });
      indice++;
      if (indice < items.length) mostrar();
      else finalizar();
    }

    reemplazar(contenedor,
      el('div', { clase: 'barra-ronda' },
        el('p', { clase: 'progreso' }, `Dictado ${indice + 1} de ${items.length}`),
        el('span', { clase: 'chip chip-puntos' }, `🎯 ${item.pts} pts`)),
      item.nota ? el('p', { clase: 'aviso aviso-alerta' }, `⚠ ${item.nota}`) : null,
      reproductor.elemento,
      el('label', { for: 'dictado-campo' }, 'Tu transcripción'),
      campo,
      el('div', { clase: 'acciones' }, siguiente),
    );
    campo.focus();
  }

  function finalizar() {
    detenerTodo();
    const revision = el('div', {}, el('h3', {}, '🔎 Compara tu transcripción'),
      respuestas.map((r, i) => el('div', { clase: 'comparacion' },
        medidor(`Dictado ${i + 1}`, precision(r.escrito, r.esperado)),
        el('p', {}, el('strong', {}, 'Esperado: '), r.esperado),
        el('p', {}, el('strong', {}, 'Escribiste: '), r.escrito.trim() || '(vacío)'))));
    terminar(puntajeTranscripcion(respuestas), revision);
  }

  mostrar();
  return detenerTodo;
}
