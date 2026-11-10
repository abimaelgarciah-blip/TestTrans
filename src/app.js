// Arranque y navegación entre pantallas: inicio → instrucciones → ronda → resumen → … → final.
import config from '../config.js';
import { detenerTodo } from './audio.js';
import { IDS_RONDAS, calcularTotal, crearSlug, limpiarNombre, recortarRonda } from './calificacion.js';
import * as cazaerrores from './rondas/cazaerrores.js';
import * as dictado from './rondas/dictado.js';
import * as memoria from './rondas/memoria.js';
import * as ortografia from './rondas/ortografia.js';
import * as racha from './rondas/racha.js';
import { crearAlmacen } from './storage/adapter.js';
import { leerIntento, marcarIntento } from './storage/local.js';
import { csvAcumulado, csvEdicion, renderAcumulado, renderMedallas, renderTablaEdicion } from './tabla.js';
import { anunciar, campoTexto, descargarArchivo, el, formatearTiempo, reemplazar } from './ui.js';
import { elegirEdiciones, validarEdicion, validarIndice } from './validador.js';

/** Orden de juego. Para agregar, quitar o reordenar rondas solo se toca esta lista. */
const RONDAS = [ortografia, dictado, cazaerrores, memoria, racha];
const ESPERA_EXPLICITA_MS = 10000;
const NOMBRES_RONDA = Object.fromEntries(RONDAS.map((r) => [r.id, r.titulo]));

const parametros = new URLSearchParams(location.search);
const MODO_PRUEBA = parametros.has('prueba');

const app = {
  raiz: null,
  almacen: null,
  indice: null,
  edicion: null,
  publicadas: [],
  titulos: {},
  partida: null,
  cancelarRonda: null,
};

// ---------- Utilidades ----------

async function cargarJSON(ruta) {
  const r = await fetch(ruta, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`No se pudo cargar ${ruta} (${r.status})`);
  return r.json();
}

/** Cambia de pantalla: silencia audio, cancela la ronda activa y mueve el foco al título. */
function pantalla(...hijos) {
  detenerTodo();
  app.cancelarRonda?.();
  app.cancelarRonda = null;
  reemplazar(app.raiz, ...hijos);
  const titulo = app.raiz.querySelector('h2');
  if (titulo) {
    titulo.setAttribute('tabindex', '-1');
    titulo.focus({ preventScroll: true });
  }
  window.scrollTo({ top: 0 });
}

function encabezadoEdicion() {
  const sub = document.getElementById('subtitulo');
  if (sub) sub.textContent = `Edición ${app.edicion.titulo}${MODO_PRUEBA ? ' · modo prueba' : ''}`;
}

function evitarSalida(e) {
  e.preventDefault();
  e.returnValue = '';
}

// ---------- Inicio ----------

async function iniciar() {
  app.raiz = document.getElementById('app');
  try {
    app.indice = await cargarJSON('ediciones/index.json');
    const erroresIndice = validarIndice(app.indice);
    if (erroresIndice.length) throw new Error(erroresIndice.join(' '));
    const { vigente, publicadas } = elegirEdiciones(app.indice.ediciones);
    const pedida = parametros.get('edicion');
    const id = pedida && app.indice.ediciones.includes(pedida) ? pedida : vigente;
    app.publicadas = publicadas.includes(id) ? publicadas : [...publicadas, id].sort();
    app.edicion = await cargarJSON(`ediciones/${id}.json`);
    const errores = validarEdicion(app.edicion);
    if (errores.length) {
      pantallaError('La edición tiene errores y no se puede jugar. Avisa al organizador.', errores);
      return;
    }
    app.titulos[id] = app.edicion.titulo;
  } catch (e) {
    pantallaError('No se pudo cargar el reto. Revisa tu conexión y recarga la página.', [String(e.message ?? e)]);
    return;
  }
  app.almacen = crearAlmacen(config);
  encabezadoEdicion();
  pantallaInicio();
}

function pantallaError(mensaje, detalles = []) {
  pantalla(
    el('h2', {}, 'Algo salió mal'),
    el('p', { clase: 'aviso aviso-error', role: 'alert' }, mensaje),
    detalles.length ? el('ul', { clase: 'lista-revision' }, detalles.map((d) => el('li', {}, d))) : null,
  );
}

function pantallaInicio({ resaltar } = {}) {
  const campoNombre = campoTexto({ id: 'nombre', name: 'nombre', maxlength: '80', required: true, 'aria-describedby': 'nombre-ayuda nombre-error' });
  const error = el('p', { id: 'nombre-error', clase: 'error-campo', role: 'alert' });
  const boton = el('button', { type: 'submit', clase: 'primario' }, 'Comenzar');

  const formulario = el('form', { clase: 'formulario-nombre', novalidate: true, onSubmit: (e) => { e.preventDefault(); comenzar(); } },
    el('label', { for: 'nombre' }, 'Tu nombre y apellido'),
    el('p', { id: 'nombre-ayuda', clase: 'ayuda' }, 'Escríbelo igual cada mes: así se suma tu acumulado.'),
    el('div', { clase: 'fila-campo' }, campoNombre, boton),
    error,
  );

  async function comenzar() {
    const nombre = limpiarNombre(campoNombre.value);
    const slug = crearSlug(nombre);
    error.textContent = '';
    if (nombre.length < 3 || !slug) {
      error.textContent = 'Escribe tu nombre y apellido (al menos 3 letras).';
      campoNombre.focus();
      return;
    }
    if (!MODO_PRUEBA && leerIntento(app.edicion.id, slug)) {
      error.textContent = 'Ya hay un intento con ese nombre en esta edición desde este equipo. Solo se permite uno; si fue un error, avisa al organizador.';
      return;
    }
    boton.disabled = true;
    boton.textContent = 'Verificando…';
    let registrados = [];
    let sinRespuesta = false;
    try {
      registrados = await Promise.race([
        app.almacen.listarResultados(app.edicion.id),
        new Promise((resolver) => setTimeout(() => { sinRespuesta = true; resolver([]); }, ESPERA_EXPLICITA_MS)),
      ]);
    } catch {
      sinRespuesta = true;
    }
    boton.disabled = false;
    boton.textContent = 'Comenzar';
    if (!MODO_PRUEBA && registrados.some((r) => r.slug === slug)) {
      error.textContent = `Ya existe un resultado de «${nombre}» en esta edición. Solo se permite un intento por persona.`;
      return;
    }
    if (sinRespuesta || registrados.estado?.remoto === 'error') {
      anunciar('No se pudo verificar la tabla compartida; la verificación se hará al guardar.');
    }
    empezarPartida(nombre, slug);
  }

  pantalla(
    el('h2', {}, `Reto de transcripción · ${app.edicion.titulo}`),
    MODO_PRUEBA ? el('p', { clase: 'aviso aviso-alerta' }, 'Modo prueba: el resultado no se guarda ni bloquea el nombre.') : null,
    el('section', { clase: 'bienvenida' },
      el('p', {}, 'Cinco rondas cronometradas, unos diez minutos en total. Cada ronda vale 100 puntos.'),
      el('ul', { clase: 'reglas' },
        el('li', {}, 'La precisión manda: el tiempo solo desempata, nunca suma puntos.'),
        el('li', {}, 'Un intento por persona en cada edición. Si recargas la página a mitad de partida, el intento se pierde.'),
        el('li', {}, 'Juega en computadora, con audio y en un lugar tranquilo.'),
        el('li', {}, 'Todo el contenido clínico es inventado para el juego.')),
      formulario),
    seccionTabla({ resaltar }),
  );
  if (!resaltar) campoNombre.focus();
}

// ---------- Tabla de posiciones ----------

function seccionTabla({ resaltar } = {}) {
  const selector = el('select', { id: 'selector-edicion' },
    [...app.publicadas].reverse().map((id) => el('option', { value: id, selected: id === app.edicion.id },
      id === app.edicion.id ? `${app.titulos[id] ?? id} (actual)` : (app.titulos[id] ?? id))),
    el('option', { value: 'acumulado' }, 'Acumulado de todas las ediciones'));
  const selectorOrden = el('select', { id: 'selector-orden', 'aria-label': 'Ordenar acumulado por' },
    el('option', { value: 'promedio' }, 'Ordenar por promedio'),
    el('option', { value: 'suma' }, 'Ordenar por suma'));
  const aviso = el('p', { clase: 'aviso', role: 'status' });
  const contenido = el('div', { clase: 'contenido-tabla' });
  const medallas = el('div');
  const botonCSV = el('button', { type: 'button', clase: 'secundario', disabled: true }, 'Descargar CSV');
  let datos = [];
  let consulta = 0;

  async function cargar() {
    const vista = selector.value;
    const actual = ++consulta;
    selectorOrden.hidden = vista !== 'acumulado';
    botonCSV.disabled = true;
    aviso.className = 'aviso';
    aviso.textContent = 'Consultando la tabla compartida… mientras tanto la información puede estar incompleta.';
    reemplazar(contenido, el('p', { clase: 'cargando' }, 'Cargando resultados…'));
    reemplazar(medallas);
    const temporizador = setTimeout(() => {
      if (actual !== consulta) return;
      aviso.className = 'aviso aviso-alerta';
      aviso.textContent = 'El servicio de resultados no responde después de 10 segundos. Si sigue así, la tabla mostrará solo lo guardado en este equipo.';
    }, ESPERA_EXPLICITA_MS);

    let lista;
    try {
      lista = vista === 'acumulado' ? await app.almacen.listarTodos() : await app.almacen.listarResultados(vista);
    } catch {
      lista = [];
      lista.estado = { remoto: 'error', pendientes: 0 };
    }
    clearTimeout(temporizador);
    if (actual !== consulta) return;
    datos = lista;
    pintarAviso(lista.estado);
    pintar();
    botonCSV.disabled = false;
  }

  function pintarAviso(estado) {
    aviso.className = 'aviso';
    aviso.textContent = '';
    if (estado?.remoto === 'no-configurado') {
      aviso.className = 'aviso aviso-alerta';
      aviso.textContent = 'La tabla compartida no está configurada: solo se ven los resultados guardados en este equipo.';
    } else if (estado?.remoto === 'error') {
      aviso.className = 'aviso aviso-alerta';
      aviso.textContent = 'No se pudo consultar la tabla compartida. Se muestran solo los resultados guardados en este equipo; la información está incompleta.';
    } else if (estado?.pendientes) {
      aviso.className = 'aviso aviso-alerta';
      aviso.textContent = 'Hay resultados guardados solo en este equipo que no llegaron a la tabla compartida. Usa «Reintentar envío» o avisa al organizador.';
    }
  }

  function pintar() {
    if (selector.value === 'acumulado') {
      reemplazar(contenido, renderAcumulado(datos, { orden: selectorOrden.value, slugActual: resaltar }));
      reemplazar(medallas);
    } else {
      reemplazar(contenido, renderTablaEdicion(datos, { slugActual: resaltar, alReintentar: reintentar }));
      reemplazar(medallas, renderMedallas(datos));
    }
  }

  async function reintentar(resultado) {
    aviso.className = 'aviso';
    aviso.textContent = `Reenviando el resultado de ${resultado.nombre}…`;
    const r = await app.almacen.guardarResultado(resultado);
    if (r.ok && r.destino === 'remoto') {
      anunciar('Resultado enviado a la tabla compartida.');
      await cargar();
    } else {
      aviso.className = 'aviso aviso-error';
      aviso.textContent = r.motivo === 'duplicado'
        ? 'La tabla compartida ya tiene un resultado con ese nombre en esta edición. Avisa al organizador.'
        : 'El reenvío no llegó a la tabla compartida. Avisa al organizador y descarga el CSV como respaldo.';
    }
  }

  botonCSV.addEventListener('click', () => {
    const vista = selector.value;
    const texto = vista === 'acumulado' ? csvAcumulado(datos, selectorOrden.value) : csvEdicion(datos);
    descargarArchivo(`reto-transcripcion-${vista}.csv`, texto);
  });
  selector.addEventListener('change', cargar);
  selectorOrden.addEventListener('change', pintar);
  selectorOrden.hidden = true;
  cargar();

  return el('section', { clase: 'seccion-tabla', 'aria-labelledby': 'titulo-tabla' },
    el('h2', { id: 'titulo-tabla', clase: 'h2-secundario' }, 'Tabla de posiciones'),
    el('div', { clase: 'controles-tabla' },
      el('label', { for: 'selector-edicion' }, 'Edición'), selector, selectorOrden, botonCSV),
    aviso,
    contenido,
    medallas,
  );
}

// ---------- Partida ----------

function empezarPartida(nombre, slug) {
  app.partida = { nombre, slug, rondas: {}, segundos: 0, indice: 0, revisiones: {} };
  if (!MODO_PRUEBA) marcarIntento(app.edicion.id, slug, 'iniciado');
  window.addEventListener('beforeunload', evitarSalida);
  pantallaInstrucciones();
}

function pantallaInstrucciones() {
  const ronda = RONDAS[app.partida.indice];
  const boton = el('button', { type: 'button', clase: 'primario grande', onClick: () => jugarRonda(ronda) }, 'Empezar');
  pantalla(
    el('p', { clase: 'progreso' }, `Ronda ${app.partida.indice + 1} de ${RONDAS.length}`),
    el('h2', {}, ronda.titulo),
    el('ul', { clase: 'instrucciones' }, ronda.instrucciones(app.edicion).map((t) => el('li', {}, t))),
    el('p', { clase: 'ayuda' }, 'El cronómetro arranca cuando presiones «Empezar».'),
    el('div', { clase: 'acciones' }, boton),
  );
}

function jugarRonda(ronda) {
  const zona = el('div', { clase: `ronda ronda-${ronda.id}` });
  pantalla(
    el('p', { clase: 'progreso' }, `Ronda ${app.partida.indice + 1} de ${RONDAS.length}`),
    el('h2', {}, ronda.titulo),
    zona,
  );
  const inicio = performance.now();
  let terminada = false;
  const terminar = (puntos, revision) => {
    if (terminada) return;
    terminada = true;
    app.partida.segundos += (performance.now() - inicio) / 1000;
    app.partida.rondas[ronda.id] = recortarRonda(puntos);
    // Se pospone un tick para no desmontar la ronda dentro de su propio manejador de eventos.
    setTimeout(() => pantallaResumen(ronda, revision), 0);
  };
  app.cancelarRonda = ronda.jugar(zona, app.edicion, terminar) ?? null;
}

function pantallaResumen(ronda, revision) {
  const ultima = app.partida.indice === RONDAS.length - 1;
  const boton = el('button', {
    type: 'button', clase: 'primario',
    onClick: () => {
      app.partida.indice++;
      if (ultima) pantallaFinal();
      else pantallaInstrucciones();
    },
  }, ultima ? 'Ver resultado final' : 'Siguiente ronda');
  pantalla(
    el('p', { clase: 'progreso' }, `Ronda ${app.partida.indice + 1} de ${RONDAS.length} terminada`),
    el('h2', {}, `${ronda.titulo}: ${app.partida.rondas[ronda.id]} / 100`),
    revision ? el('section', { clase: 'revision-ronda' }, revision) : null,
    el('div', { clase: 'acciones' }, boton),
  );
  anunciar(`${ronda.titulo}: ${app.partida.rondas[ronda.id]} de 100 puntos.`);
}

async function pantallaFinal() {
  window.removeEventListener('beforeunload', evitarSalida);
  const p = app.partida;
  const rondas = Object.fromEntries(IDS_RONDAS.map((id) => [id, p.rondas[id] ?? 0]));
  const resultado = {
    edicion: app.edicion.id,
    slug: p.slug,
    nombre: p.nombre,
    total: calcularTotal(rondas),
    segundos: Math.round(p.segundos),
    rondas,
    fecha: new Date().toISOString(),
  };
  const estado = el('div', { clase: 'estado-guardado', role: 'status' }, el('p', {}, 'Guardando tu resultado…'));
  const acciones = el('div', { clase: 'acciones' });

  pantalla(
    el('h2', {}, `Tu resultado: ${resultado.total} / 500`),
    el('p', { clase: 'total-grande' }, `${resultado.total}`, el('span', {}, ' / 500')),
    el('p', {}, `Tiempo empleado: ${formatearTiempo(resultado.segundos)} (solo cuenta para desempatar).`),
    el('table', { clase: 'tabla desglose' },
      el('caption', {}, 'Desglose por ronda'),
      el('tbody', {}, IDS_RONDAS.map((id) => el('tr', {},
        el('th', { scope: 'row' }, NOMBRES_RONDA[id]),
        el('td', { clase: 'num' }, `${rondas[id]} / 100`))))),
    estado,
    acciones,
  );

  const verTabla = el('button', { type: 'button', clase: 'primario', onClick: () => { app.partida = null; pantallaInicio({ resaltar: resultado.slug }); } }, 'Ver tabla de posiciones');

  if (MODO_PRUEBA) {
    reemplazar(estado, el('p', { clase: 'aviso' }, 'Modo prueba: el resultado no se guardó.'));
    reemplazar(acciones, verTabla);
    return;
  }

  async function guardar() {
    reemplazar(estado, el('p', {}, 'Guardando tu resultado…'));
    reemplazar(acciones);
    const r = await app.almacen.guardarResultado(resultado);
    marcarIntento(resultado.edicion, resultado.slug, 'terminado');
    mostrarEstado(r);
  }

  function mostrarEstado(r) {
    const reintentar = el('button', { type: 'button', clase: 'secundario', onClick: guardar }, 'Reintentar envío');
    if (r.ok && r.destino === 'remoto') {
      reemplazar(estado, el('p', { clase: 'aviso aviso-ok' }, '✓ Tu resultado quedó registrado en la tabla compartida.'));
      reemplazar(acciones, verTabla);
    } else if (r.ok && r.motivo === 'no-configurado') {
      reemplazar(estado, el('p', { clase: 'aviso aviso-alerta' },
        '⚠ La tabla compartida no está configurada: tu resultado se guardó solo en este equipo. Avisa al organizador y toma una captura de esta pantalla.'));
      reemplazar(acciones, verTabla);
    } else if (r.ok) {
      reemplazar(estado, el('div', { clase: 'aviso aviso-error' },
        el('p', {}, el('strong', {}, '⚠ Tu puntaje NO llegó a la tabla compartida.')),
        el('p', {}, 'Quedó guardado solo en este equipo. Avisa al organizador y toma una captura de esta pantalla. Puedes reintentar el envío ahora o más tarde desde la tabla, en este mismo equipo.')));
      reemplazar(acciones, reintentar, verTabla);
    } else if (r.motivo === 'duplicado') {
      reemplazar(estado, el('p', { clase: 'aviso aviso-error' },
        '⚠ Ya existe un resultado con tu nombre en esta edición, así que este no se registró. Solo se permite un intento. Si crees que es un error, avisa al organizador.'));
      reemplazar(acciones, verTabla);
    } else {
      reemplazar(estado, el('p', { clase: 'aviso aviso-error' },
        '⚠ Tu puntaje NO se pudo guardar. Avisa al organizador y toma una captura de esta pantalla con tu desglose.'));
      reemplazar(acciones, reintentar, verTabla);
    }
    anunciar(estado.textContent);
  }

  guardar();
}

iniciar();
