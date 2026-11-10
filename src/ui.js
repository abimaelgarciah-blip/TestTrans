// Helpers de DOM. Regla del proyecto: nunca innerHTML. Todo texto entra con textContent
// o como nodo de texto, de modo que un nombre como "<img onerror=…>" se muestra literal.
// Este módulo no toca `document` al importarse, para que las pruebas en Node puedan cargarlo.

const PROPIEDADES = new Set(['value', 'checked', 'disabled', 'hidden', 'selected', 'tabIndex']);

/**
 * Crea un elemento.
 *   el('button', { clase: 'primario', onClick: fn, texto: 'Empezar' })
 *   el('p', {}, 'texto', otroNodo)
 * Claves especiales: clase, texto, on<Evento>. Lo demás se asigna como atributo.
 */
export function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos ?? {})) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (clave === 'clase') nodo.className = valor;
    else if (clave === 'texto') nodo.textContent = String(valor);
    else if (/^on[A-Z]/.test(clave) && typeof valor === 'function') {
      nodo.addEventListener(clave.slice(2).toLowerCase(), valor);
    } else if (PROPIEDADES.has(clave)) nodo[clave] = valor;
    else nodo.setAttribute(clave, valor === true ? '' : String(valor));
  }
  agregar(nodo, hijos);
  return nodo;
}

/** Agrega hijos (nodos, textos o listas). Los textos se convierten en nodos de texto. */
export function agregar(nodo, hijos) {
  for (const h of [hijos].flat(Infinity)) {
    if (h === undefined || h === null || h === false) continue;
    nodo.append(typeof h === 'string' || typeof h === 'number' ? document.createTextNode(String(h)) : h);
  }
  return nodo;
}

/** Reemplaza todo el contenido de un nodo. Lo eliminado sale del DOM, no solo se oculta. */
export function reemplazar(nodo, ...hijos) {
  nodo.replaceChildren();
  return agregar(nodo, hijos);
}

/** Envía un mensaje a la región aria-live de la página. */
export function anunciar(mensaje) {
  const region = document.getElementById('anuncios');
  if (!region) return;
  region.textContent = '';
  // El cambio en un tick distinto asegura que el lector de pantalla lo lea aunque se repita.
  setTimeout(() => { region.textContent = mensaje; }, 50);
}

const EVENTOS_BLOQUEADOS = ['paste', 'drop', 'dragover', 'dragstart'];

/** Impide pegar y arrastrar texto dentro de un campo. */
export function bloquearPegado(campo) {
  for (const tipo of EVENTOS_BLOQUEADOS) {
    campo.addEventListener(tipo, (e) => {
      e.preventDefault();
      if (tipo === 'paste' || tipo === 'drop') anunciar('Pegar o arrastrar texto está deshabilitado en el reto.');
    });
  }
  campo.addEventListener('beforeinput', (e) => {
    if (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop' || e.inputType === 'insertFromPasteAsQuotation') {
      e.preventDefault();
    }
  });
  return campo;
}

/**
 * Campo de texto con las protecciones del reto: sin corrector, sin autocompletar,
 * sin mayúscula automática y sin pegado.
 */
export function campoTexto({ multilinea = false, ...atributos } = {}) {
  const campo = el(multilinea ? 'textarea' : 'input', {
    type: multilinea ? undefined : 'text',
    spellcheck: 'false',
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    'data-gramm': 'false',
    ...atributos,
  });
  return bloquearPegado(campo);
}

/** Copia barajada (Fisher–Yates). No modifica la lista original. */
export function barajar(lista, aleatorio = Math.random) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/** 583 → "9:43". */
export function formatearTiempo(segundos) {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Cuenta regresiva visible con barra. Llama a alTerminar una sola vez al llegar a cero.
 * @returns {{elemento: HTMLElement, detener: () => void, restanteMs: () => number}}
 */
export function crearCuentaRegresiva(segundos, alTerminar) {
  const totalMs = segundos * 1000;
  const inicio = performance.now();
  let activo = true;
  const texto = el('span', { clase: 'cuenta-texto' });
  const relleno = el('span', { clase: 'cuenta-relleno' });
  const elemento = el('div', { clase: 'cuenta', role: 'timer', 'aria-label': `Tiempo límite: ${segundos} segundos` },
    el('span', { clase: 'cuenta-barra', 'aria-hidden': 'true' }, relleno),
    texto,
  );
  const restanteMs = () => Math.max(0, totalMs - (performance.now() - inicio));

  function detener() {
    activo = false;
    clearInterval(intervalo);
  }

  function tic() {
    if (!activo) return;
    const resta = restanteMs();
    texto.textContent = `${Math.ceil(resta / 1000)} s`;
    relleno.style.setProperty('transform', `scaleX(${totalMs ? resta / totalMs : 0})`);
    elemento.classList.toggle('urgente', resta <= Math.min(5000, totalMs * 0.25));
    if (resta <= 0) {
      detener();
      alTerminar?.();
    }
  }

  const intervalo = setInterval(tic, 100);
  tic();
  return { elemento, detener, restanteMs };
}

/** Descarga un texto como archivo desde el navegador. */
export function descargarArchivo(nombre, contenido, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const enlace = el('a', { href: url, download: nombre, hidden: true });
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
