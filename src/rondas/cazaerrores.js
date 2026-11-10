// Ronda 3 — Caza errores: un reporte con 6 errores ocultos; se marcan las palabras equivocadas.
import { PENALIZACION_FALSO_POSITIVO, erroresCazaErrores, evaluarCazaErrores, parsearCazaErrores } from '../calificacion.js';
import { animar, crearCuentaRegresiva, el, reemplazar } from '../ui.js';

export const id = 'r3';
export const titulo = 'Caza errores';
export const icono = '🔍';
export const lema = 'Revisa el reporte como lo haría un médico exigente.';

export function instrucciones(datos) {
  const n = erroresCazaErrores(parsearCazaErrores(datos.r3.texto)).length;
  return [
    `Verás un reporte con ${n} errores ocultos: ortografía, unidades, lateralidad contradictoria entre hallazgos y conclusiones, y palabras parecidas que cambian el sentido (como vaso y bazo).`,
    'Toca cada palabra equivocada para marcarla; tócala otra vez para desmarcarla. Con teclado: Tab para moverte, Enter o espacio para marcar.',
    `Tienes ${datos.r3.seg} segundos. Puedes terminar antes con el botón «Terminar».`,
    `Cada error encontrado suma ${(100 / n).toFixed(1)} puntos; cada palabra correcta marcada resta ${PENALIZACION_FALSO_POSITIVO}. Marcar todo no conviene.`,
  ];
}

export function jugar(contenedor, datos, terminar) {
  const segmentos = parsearCazaErrores(datos.r3.texto);
  const totalErrores = erroresCazaErrores(segmentos).length;
  const marcados = new Set();
  let terminado = false;

  const contador = el('span', { clase: 'chip chip-puntos', 'aria-live': 'polite' });
  const pintarContador = () => { contador.textContent = `🚩 ${marcados.size} marcadas · buscas ${totalErrores}`; };

  function alternar(span, indice) {
    if (terminado) return;
    if (marcados.has(indice)) marcados.delete(indice);
    else marcados.add(indice);
    const marcado = marcados.has(indice);
    span.setAttribute('aria-pressed', String(marcado));
    span.classList.toggle('marcada', marcado);
    if (marcado) animar(span, 'pop');
    pintarContador();
  }

  const reporte = el('p', { clase: 'reporte', 'aria-label': 'Reporte a revisar' },
    segmentos.map((s) => {
      if (s.tipo === 'separador') return s.texto;
      const span = el('span', {
        clase: 'palabra', role: 'button', tabindex: '0', 'aria-pressed': 'false',
        onClick: () => alternar(span, s.indice),
        onKeydown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(span, s.indice); }
        },
      }, s.texto);
      return span;
    }));

  const cuenta = crearCuentaRegresiva(datos.r3.seg, finalizar);
  pintarContador();
  reemplazar(contenedor,
    cuenta.elemento,
    el('div', { clase: 'barra-ronda' },
      el('p', { clase: 'progreso' }, datos.r3.titulo ? `📄 ${datos.r3.titulo}` : '📄 Reporte'),
      contador),
    el('div', { clase: 'hoja-reporte entrar' }, reporte),
    el('div', { clase: 'acciones' }, el('button', { type: 'button', clase: 'primario', onClick: finalizar }, 'Terminar')),
  );

  function finalizar() {
    if (terminado) return;
    terminado = true;
    cuenta.detener();
    const r = evaluarCazaErrores(segmentos, marcados);
    terminar(r.puntos, revisar(r));
  }

  function revisar(r) {
    const texto = el('p', { clase: 'reporte revision' }, segmentos.map((s) => {
      if (s.tipo === 'separador') return s.texto;
      const marcada = marcados.has(s.indice);
      if (s.correccion && marcada) {
        return el('span', { clase: 'acierto' }, `✓ ${s.texto} → ${s.correccion}`);
      }
      if (s.correccion) {
        return el('span', { clase: 'omitido' }, el('s', {}, s.texto), ` → ${s.correccion} (no encontrado)`);
      }
      if (marcada) return el('s', { clase: 'falso', title: 'Palabra correcta marcada' }, `✗ ${s.texto}`);
      return s.texto;
    }));
    const errores = erroresCazaErrores(segmentos);
    return el('div', {},
      el('p', {}, `Encontraste ${r.aciertos} de ${r.totalErrores} errores. Palabras correctas marcadas: ${r.falsosPositivos} (−${r.falsosPositivos * PENALIZACION_FALSO_POSITIVO} puntos).`),
      el('p', { clase: 'leyenda' },
        el('span', { clase: 'acierto' }, '✓ encontrado'), ' · ',
        el('span', { clase: 'omitido' }, 'no encontrado'), ' · ',
        el('s', { clase: 'falso' }, '✗ marcada sin ser error')),
      el('div', { clase: 'hoja-reporte' }, texto),
      el('h3', {}, '📚 Los errores del reporte y por qué'),
      el('ul', { clase: 'lista-aprendizaje' }, errores.map((e) => el('li', { clase: marcados.has(e.indice) ? 'encontrado' : 'no-encontrado' },
        el('p', {},
          el('s', { clase: 'mal' }, e.texto), ' → ', el('strong', {}, e.correccion),
          marcados.has(e.indice) ? el('span', { clase: 'ok' }, ' ✓ encontrado') : el('span', { clase: 'pendiente' }, ' · no encontrado')),
        e.explicacion ? el('p', { clase: 'regla' }, `💡 ${e.explicacion}`) : null))),
    );
  }

  return () => cuenta.detener();
}
