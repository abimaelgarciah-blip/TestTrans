// Reproductor de dictados: audio grabado (preferido) o síntesis de voz (respaldo).
// Reglas: máximo dos reproducciones con contador visible, botón de detener, y si en
// tres segundos no suena nada se muestra el texto unos segundos como último recurso.
import { el, reemplazar } from './ui.js';

const limpiezas = new Set();

/** Silencia todo y cancela temporizadores. Se llama al cambiar de pantalla o al terminar una ronda. */
export function detenerTodo() {
  for (const fn of [...limpiezas]) {
    try { fn(); } catch { /* seguir limpiando */ }
  }
  limpiezas.clear();
  try { globalThis.speechSynthesis?.cancel(); } catch { /* sin síntesis */ }
}

/** Primera voz cuyo idioma empiece con "es"; prefiere es-MX si existe. */
function elegirVoz() {
  const voces = globalThis.speechSynthesis?.getVoices?.() ?? [];
  const espanol = voces.filter((v) => v.lang?.toLowerCase().startsWith('es'));
  return espanol.find((v) => v.lang.toLowerCase() === 'es-mx') ?? espanol[0] ?? null;
}

// Algunos navegadores cargan las voces de forma asíncrona; pedirlas pronto ayuda.
try { globalThis.speechSynthesis?.getVoices(); } catch { /* sin síntesis */ }

/** Segundos que se muestra el texto de respaldo, según su longitud. */
export function segundosRespaldo(texto) {
  const n = String(texto).split(/\s+/).filter(Boolean).length;
  return Math.min(20, Math.max(6, Math.round(n * 0.5 + 3)));
}

/**
 * @param {{di: string, audio?: string}} item reactivo de r2
 * @param {{maxReproducciones?: number, esperaInicioMs?: number}} [opciones]
 * @returns {{elemento: HTMLElement}}
 */
export function crearReproductor(item, { maxReproducciones = 2, esperaInicioMs = 3000 } = {}) {
  let usadas = 0;
  let sonando = false;
  let detenerActual = null;
  let elemento = null;

  const botonReproducir = el('button', { type: 'button', clase: 'primario', onClick: reproducir });
  const botonDetener = el('button', { type: 'button', clase: 'secundario', disabled: true, onClick: () => detenerActual?.('usuario') }, '■ Detener');
  const contador = el('span', { clase: 'contador-audio', 'aria-live': 'polite' });
  const estado = el('p', { clase: 'estado-audio', role: 'status' });
  const respaldo = el('div', { clase: 'respaldo-texto' });

  function pintar() {
    const restantes = maxReproducciones - usadas;
    botonReproducir.textContent = usadas === 0 ? '▶ Reproducir' : '▶ Volver a reproducir';
    botonReproducir.disabled = sonando || restantes <= 0;
    botonDetener.disabled = !sonando;
    contador.textContent = `Reproducciones: ${usadas} de ${maxReproducciones}`;
    elemento?.classList.toggle('sonando', sonando);
    if (restantes <= 0 && !sonando) estado.textContent = 'Ya usaste las dos reproducciones de este audio.';
  }

  function reproducir() {
    if (sonando || usadas >= maxReproducciones) return;
    usadas++;
    sonando = true;
    estado.textContent = 'Reproduciendo…';
    pintar();

    let empezo = false;
    let terminado = false;
    let audio = null;
    const temporizador = setTimeout(() => { if (!empezo) fallo(); }, esperaInicioMs);

    const marcarInicio = () => { empezo = true; estado.textContent = 'Reproduciendo…'; };

    function fin() {
      if (terminado) return;
      terminado = true;
      clearTimeout(temporizador);
      limpiezas.delete(cortar);
      sonando = false;
      detenerActual = null;
      if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
      try { globalThis.speechSynthesis?.cancel(); } catch { /* nada */ }
      if (estado.textContent === 'Reproduciendo…') estado.textContent = 'Audio terminado.';
      pintar();
    }

    function cortar(motivo) {
      if (motivo === 'usuario') estado.textContent = 'Audio detenido.';
      fin();
    }

    function fallo() {
      if (terminado) return;
      fin();
      mostrarRespaldo();
    }

    function intentarVoz() {
      const sintesis = globalThis.speechSynthesis;
      const Utterance = globalThis.SpeechSynthesisUtterance;
      if (!sintesis || !Utterance) { fallo(); return; }
      const frase = new Utterance(item.di);
      frase.lang = 'es-MX';
      frase.rate = 0.9;
      const voz = elegirVoz();
      if (voz) frase.voice = voz;
      frase.onstart = marcarInicio;
      frase.onend = () => { if (empezo) fin(); };
      frase.onerror = () => { if (!empezo) fallo(); else fin(); };
      sintesis.cancel();
      sintesis.speak(frase);
    }

    detenerActual = cortar;
    limpiezas.add(cortar);

    if (item.audio) {
      audio = new Audio(item.audio);
      audio.addEventListener('playing', marcarInicio);
      audio.addEventListener('ended', fin);
      // Si el archivo no carga, se intenta con síntesis de voz dentro del mismo intento.
      audio.addEventListener('error', () => { if (!empezo && !terminado) { audio = null; intentarVoz(); } });
      audio.play().catch(() => { /* el evento error o el temporizador deciden */ });
    } else {
      intentarVoz();
    }
  }

  function mostrarRespaldo() {
    const segundos = segundosRespaldo(item.di);
    estado.textContent = '';
    reemplazar(respaldo,
      el('p', { clase: 'aviso aviso-alerta' },
        `⚠ No se detectó audio en este equipo. Como último recurso, el texto se muestra ${segundos} segundos. Avisa al organizador que tu equipo no reprodujo el audio.`),
      el('blockquote', { clase: 'texto-respaldo' }, item.di),
    );
    const t = setTimeout(quitar, segundos * 1000);
    function quitar() {
      clearTimeout(t);
      limpiezas.delete(quitar);
      // El texto sale del DOM, no solo se oculta.
      reemplazar(respaldo, el('p', { clase: 'aviso' }, 'El texto de respaldo ya no está disponible.'));
    }
    limpiezas.add(quitar);
  }

  const ondas = el('span', { clase: 'ondas', 'aria-hidden': 'true' }, el('i'), el('i'), el('i'), el('i'), el('i'));
  elemento = el('div', { clase: 'reproductor' },
    el('div', { clase: 'reproductor-controles' }, el('span', { clase: 'icono-audio', 'aria-hidden': 'true' }, '🎧'), botonReproducir, botonDetener, ondas, contador),
    estado,
    respaldo,
  );
  pintar();
  return { elemento };
}
