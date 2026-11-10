// Piezas visuales compartidas por varias rondas.
import { el } from '../ui.js';

/** Barra de precisión con porcentaje y texto (no depende solo del color). */
export function medidor(etiqueta, precision) {
  const pct = Math.round(precision * 100);
  const nivel = pct >= 90 ? 'alto' : pct >= 60 ? 'medio' : 'bajo';
  const relleno = el('span', { clase: 'medidor-relleno' });
  relleno.style.setProperty('width', `${pct}%`);
  return el('div', { clase: `medidor medidor-${nivel}` },
    el('p', { clase: 'etiqueta' }, `${etiqueta}: ${pct} % de precisión ${pct >= 90 ? '🌟' : pct >= 60 ? '👍' : '💪'}`),
    el('span', { clase: 'medidor-barra', 'aria-hidden': 'true' }, relleno));
}
