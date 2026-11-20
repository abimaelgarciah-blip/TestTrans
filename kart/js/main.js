// Pantallas, sala de espera y flujo del Gran Premio (3 carreras).
import { PERSONAJES, personaje, NOMBRES_BOT } from './personajes.js';
import { PISTAS, pistaPorId, construirPista } from './pistas.js';
import { Carrera } from './juego.js';
import { CARRERAS_POR_GP, ordenarCarrera, calcularTotales, codigoSala, limpiarCodigo, limpiarNombre, formatoTiempo, ordinal } from './puntos.js';
import { detectarModo, conectar, NOMBRE_MODO } from './red.js';
import { guardarCarrera, leerHistorial } from './guardado.js';
import { despertar, musica, sfx, alternarSilencio, estaSilenciado } from './audio.js';

const MAX_CORREDORES = 10;
const ICONO_ENLACE = { directo: '⚡', conectando: '⏳', respaldo: '🌐' };
const TEXTO_ENLACE = {
  directo: 'Conexión directa contigo',
  conectando: 'Conectando…',
  respaldo: 'Sin conexión directa: sus datos pasan por internet (un poco más lento)',
};
const $ = (id) => document.getElementById(id);

function el(tag, props = {}, ...hijos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'style') Object.assign(n.style, v);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const h of hijos.flat()) if (h !== null && h !== undefined) n.append(h instanceof Node ? h : String(h));
  return n;
}

// ---------- Estado ----------
const guardado = (() => { try { return JSON.parse(localStorage.getItem('kart-yo') ?? '{}'); } catch { return {}; } })();
const yo = {
  id: Math.random().toString(36).slice(2, 10),
  nombre: guardado.nombre ?? '',
  personaje: guardado.personaje ?? PERSONAJES[Math.floor(Math.random() * PERSONAJES.length)].id,
  unido: 0,
};
let modoDetectado = 'local';
let modoActual = 'local';
let red = null;
let codigo = null;
const miembros = new Map();
let sala = null;
let carrera = null;
let botsDeseados = 0;
let botsLista = [];
let esperandoSala = null;
let temporizadorAuto = null;
let ultimoResultado = null;
let ultimoPodio = null;
const pistasCache = new Map();

function guardarYo() {
  try { localStorage.setItem('kart-yo', JSON.stringify({ nombre: yo.nombre, personaje: yo.personaje })); } catch { /* nada */ }
}

function mostrar(id) {
  for (const p of document.querySelectorAll('.pantalla')) p.classList.toggle('activa', p.id === id);
  window.scrollTo(0, 0);
}

let avisoT = null;
function aviso(texto, ms = 3000) {
  const a = $('aviso');
  a.textContent = texto;
  a.classList.remove('oculto');
  clearTimeout(avisoT);
  avisoT = setTimeout(() => a.classList.add('oculto'), ms);
}

// ---------- Inicio ----------
function pintarPersonajes() {
  const cont = $('personajes');
  cont.replaceChildren(...PERSONAJES.map((p) => el('button', {
    class: `pj${p.id === yo.personaje ? ' elegido' : ''}`,
    style: { background: p.color + '55' },
    type: 'button',
    onclick: () => { yo.personaje = p.id; guardarYo(); sfx('clic'); pintarPersonajes(); },
  }, el('span', { class: 'cara' }, p.emoji), p.nombre)));
}

function validarNombre() {
  yo.nombre = limpiarNombre($('nombre').value);
  if (!yo.nombre) {
    aviso('✏️ Primero escribe tu nombre');
    $('nombre').focus();
    return false;
  }
  guardarYo();
  return true;
}

async function entrarSala(cod, { creador, practica }) {
  if (!validarNombre()) return;
  despertar();
  salirSala(false);
  codigo = cod;
  modoActual = practica ? 'local' : modoDetectado;
  yo.unido = creador ? 1 : Date.now();
  botsDeseados = practica ? 5 : 0;
  botsLista = [];
  sala = null;
  miembros.clear();
  try {
    red = await conectar(modoActual, practica ? `practica-${cod}-${yo.id}` : cod, yo.id, recibir);
  } catch (e) {
    aviso(`😕 ${e.message}`, 6000);
    red = null;
    return;
  }
  red.enviar('hola', datosYo());
  if (creador) actualizarSalaComoAnfitrion();
  else {
    esperandoSala = setTimeout(() => {
      if (!sala) { aviso(`🔍 No encontramos la sala ${cod}. Revisa el código.`, 5000); salirSala(); }
    }, 5000);
  }
  sfx('entra');
  musica('menu');
  mostrar('sala');
  pintarSala();
}

function salirSala(volver = true) {
  clearTimeout(esperandoSala);
  clearTimeout(temporizadorAuto);
  if (carrera) { carrera.destruir(); carrera = null; }
  if (red) { red.enviar('adios', {}); red.cerrar(); red = null; }
  sala = null;
  codigo = null;
  miembros.clear();
  if (volver) { mostrar('inicio'); musica('menu'); }
}

const datosYo = () => ({ nombre: yo.nombre, personaje: yo.personaje, unido: yo.unido });

// ---------- Anfitrión ----------
function vivos() {
  const ahora = Date.now();
  const lista = [{ id: yo.id, ...datosYo() }];
  for (const m of miembros.values()) if (ahora - m.visto < 12000) lista.push(m);
  lista.sort((a, b) => a.unido - b.unido || a.id.localeCompare(b.id));
  return lista;
}
const anfitrionId = () => vivos()[0]?.id;
const soyAnfitrion = () => !!red && anfitrionId() === yo.id;

function ajustarBots(cupo) {
  const n = Math.max(0, Math.min(botsDeseados, cupo));
  while (botsLista.length < n) {
    const i = botsLista.length;
    botsLista.push({ id: `bot-${i}-${Math.random().toString(36).slice(2, 6)}`, nombre: NOMBRES_BOT[i % NOMBRES_BOT.length], personaje: PERSONAJES[Math.floor(Math.random() * PERSONAJES.length)].id, bot: true });
  }
  botsLista.length = n;
  return botsLista;
}

function actualizarSalaComoAnfitrion() {
  if (!red) return;
  if (!sala) sala = { estado: 'lobby', jugadores: [], numero: 0, carreras: [], gpId: null };
  sala.anfitrion = yo.id;
  if (sala.estado === 'lobby') {
    const humanos = vivos().slice(0, MAX_CORREDORES).map((m) => ({ id: m.id, nombre: m.nombre, personaje: m.personaje, bot: false }));
    sala.jugadores = [...humanos, ...ajustarBots(MAX_CORREDORES - humanos.length)];
  }
  red.enviar('sala', sala);
}

function empezarGP() {
  if (!soyAnfitrion() || !sala) return;
  if (sala.jugadores.length < 2) { aviso('🤖 Agrega al menos un bot o espera a otro jugador'); return; }
  sala.estado = 'carrera';
  sala.numero = 0;
  sala.carreras = [];
  sala.gpId = `${codigo}-${Date.now().toString(36)}`;
  siguienteCarrera();
}

function siguienteCarrera() {
  if (!soyAnfitrion()) return;
  clearTimeout(temporizadorAuto);
  sala.numero += 1;
  sala.estado = 'carrera';
  let orden = [...sala.jugadores];
  if (sala.numero === 1) orden.sort(() => Math.random() - 0.5);
  else {
    // Quien va abajo en la tabla sale adelante.
    const tot = calcularTotales(sala.carreras);
    const lugar = new Map(tot.map((t) => [t.id, t.lugar]));
    orden = orden.sort((a, b) => (lugar.get(b.id) ?? 99) - (lugar.get(a.id) ?? 99));
  }
  const datos = { numero: sala.numero, pista: PISTAS[(sala.numero - 1) % PISTAS.length].id, corredores: orden, gpId: sala.gpId };
  red.enviar('sala', sala);
  red.enviar('empezar', datos);
  iniciarCarrera(datos);
}

async function terminarCarreraComoAnfitrion(filas) {
  if (!soyAnfitrion() || !carrera) return;
  const numero = sala.numero;
  const ordenadas = ordenarCarrera(filas);
  sala.carreras[numero - 1] = ordenadas;
  sala.estado = 'resultados';
  const totales = calcularTotales(sala.carreras);
  const datos = { numero, pista: carrera.pista.def.id, filas: ordenadas, totales, carreras: sala.carreras, gpId: sala.gpId };
  red.enviar('resultado', datos);
  red.enviar('sala', sala);
  mostrarResultados(datos);
  const donde = await guardarCarrera(modoActual, { gp_id: sala.gpId, sala: codigo, numero, pista: datos.pista, resultados: ordenadas, totales });
  $('res-guardado').textContent = donde === 'compartido' ? '✅ Carrera guardada en el historial compartido.' : '💾 Carrera guardada en este equipo.';
}

function mostrarPodioComoAnfitrion() {
  if (!soyAnfitrion()) return;
  clearTimeout(temporizadorAuto);
  sala.estado = 'podio';
  const datos = { totales: calcularTotales(sala.carreras), carreras: sala.carreras };
  red.enviar('podio', datos);
  red.enviar('sala', sala);
  mostrarPodio(datos);
}

function volverALobbyComoAnfitrion() {
  if (!soyAnfitrion()) return;
  sala.estado = 'lobby';
  sala.carreras = [];
  sala.numero = 0;
  red.enviar('lobby', {});
  actualizarSalaComoAnfitrion();
  irALobby();
}

// ---------- Mensajes ----------
function recibir(tipo, d, de) {
  const m = miembros.get(de);
  if (m) m.visto = Date.now();
  switch (tipo) {
    case 'hola': {
      const nuevo = !miembros.has(de);
      miembros.set(de, { id: de, nombre: limpiarNombre(d.nombre) || '???', personaje: d.personaje, unido: Number(d.unido) || Date.now(), visto: Date.now() });
      if (nuevo) {
        red?.enviar('hola', datosYo());
        if (sala?.estado === 'lobby') sfx('entra');
      }
      if (soyAnfitrion()) actualizarSalaComoAnfitrion();
      pintarSala();
      break;
    }
    case 'adios':
      miembros.delete(de);
      if (soyAnfitrion()) actualizarSalaComoAnfitrion();
      pintarSala();
      break;
    case 'sala':
      if (de !== anfitrionId() && sala) break;
      clearTimeout(esperandoSala);
      sala = d;
      pintarSala();
      break;
    case 'empezar': iniciarCarrera(d); break;
    case 'resultado': mostrarResultados(d); break;
    case 'podio': mostrarPodio(d); break;
    case 'lobby': if (sala) { sala.estado = 'lobby'; sala.carreras = []; } irALobby(); break;
    case 'e': carrera?.recibirEstado(d); break;
    case 'item': carrera?.recibirItem(d); break;
    case 'golpe': carrera?.recibirGolpe(d.p); break;
    case 'esfera': carrera?.recibirEsfera(d.i); break;
    case 'rayo': carrera?.recibirRayo(d.de); break;
    case 'pastel': carrera?.recibirPastel(d.de, d.prog); break;
    case 'meta': carrera?.registrarMeta(d.id, d.tiempo); break;
    default: break;
  }
}

setInterval(() => {
  if (!red) return;
  red.enviar('hola', datosYo());
  const ahora = Date.now();
  for (const [id, m] of miembros) if (ahora - m.visto > 20000) miembros.delete(id);
  if (soyAnfitrion()) actualizarSalaComoAnfitrion();
  pintarSala();
  pintarBotonesAnfitrion();
}, 2000);

// ---------- Sala de espera ----------
function pintarSala() {
  if (!$('sala').classList.contains('activa')) return;
  $('sala-codigo').textContent = codigo ?? '----';
  const jugadores = sala?.jugadores ?? vivos().map((m) => ({ ...m, bot: false }));
  const anf = sala?.anfitrion ?? anfitrionId();
  $('sala-cuantos').textContent = String(jugadores.length);
  $('sala-lista').replaceChildren(...jugadores.map((j) => {
    const p = personaje(j.personaje);
    const enlace = !j.bot && j.id !== yo.id ? red?.estadoPar?.(j.id) : null;
    return el('li', { style: { background: p.color + '44' } },
      el('span', { class: 'cara' }, p.emoji),
      el('span', {}, `${j.bot ? '🤖 ' : ''}${j.nombre}${j.id === yo.id ? ' (tú)' : ''}`),
      enlace ? el('span', { class: `enlace ${enlace}`, title: TEXTO_ENLACE[enlace] }, ICONO_ENLACE[enlace]) : null,
      j.id === anf ? el('span', { class: 'anfitrion', title: 'Anfitrión' }, '👑') : null);
  }));
  const host = soyAnfitrion();
  $('sala-anfitrion').classList.toggle('oculto', !host);
  const enLista = jugadores.some((j) => j.id === yo.id);
  const espera = $('sala-espera');
  espera.classList.toggle('oculto', host);
  if (!enLista && sala) espera.textContent = sala.estado === 'lobby' ? '😢 La sala está llena (10 corredores).' : '🏎️ Hay una carrera en curso; entrarás cuando terminen.';
  else espera.textContent = '⏳ Esperando a que el anfitrión empiece…';
  $('btn-empezar').disabled = jugadores.length < 2;
}

function irALobby() {
  clearTimeout(temporizadorAuto);
  if (carrera) { carrera.destruir(); carrera = null; }
  document.querySelectorAll('.confeti').forEach((c) => c.remove());
  mostrar('sala');
  musica('menu');
  pintarSala();
}

// ---------- Carrera ----------
function obtenerPista(id) {
  if (!pistasCache.has(id)) {
    pistasCache.set(id, construirPista(pistaPorId(id), (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }));
  }
  return pistasCache.get(id);
}

function iniciarCarrera(d) {
  clearTimeout(temporizadorAuto);
  if (carrera) carrera.destruir();
  if (sala) { sala.estado = 'carrera'; sala.numero = d.numero; sala.gpId = d.gpId; }
  document.querySelectorAll('.confeti').forEach((c) => c.remove());
  mostrar('juego');
  musica('carrera');
  carrera = new Carrera({
    pista: obtenerPista(d.pista),
    canvas: $('lienzo'),
    controles: $('controles'),
    yo: yo.id,
    corredores: d.corredores,
    soyAnfitrion: soyAnfitrion(),
    esAnfitrion: soyAnfitrion,
    enviar: (t, datos) => red?.enviar(t, datos),
    alFinCarrera: terminarCarreraComoAnfitrion,
  });
  const pj = d.corredores.find((c) => c.id === yo.id);
  carrera.aviso(`Carrera ${d.numero}/${CARRERAS_POR_GP} · ${pistaPorId(d.pista).nombre} ${pistaPorId(d.pista).emoji}`, 3300, 'titulo');
  if (!pj) carrera.aviso('👀 Estás de espectador', 4000, 'espectador');
}

function filaTabla(fila, celdas, clase = '') {
  return el('tr', { class: clase }, celdas.map((c) => el('td', typeof c === 'object' && c && c.clase ? { class: c.clase } : {}, typeof c === 'object' && c && 'texto' in c ? c.texto : c)));
}
const medalla = (lugar) => ['oro', 'plata', 'bronce'][lugar - 1] ?? '';
const quien = (f) => `${personaje(f.personaje).emoji} ${f.bot ? '🤖 ' : ''}${f.nombre}`;

function tablaTotales(tbody, totales) {
  tbody.replaceChildren(...totales.map((t) => filaTabla(t, [
    t.lugar, quien(t),
    ...[0, 1, 2].map((i) => (t.posiciones[i] ? ordinal(t.posiciones[i]) : '—')),
    { texto: String(t.total), clase: 'total' },
  ], `${medalla(t.lugar)} ${t.id === yo.id ? 'yo' : ''}`)));
}

function mostrarResultados(d) {
  ultimoResultado = d;
  if (carrera) { carrera.destruir(); carrera = null; }
  if (sala) { sala.carreras = d.carreras; sala.numero = d.numero; sala.estado = 'resultados'; sala.gpId = d.gpId; }
  mostrar('resultados');
  musica('menu');
  const pista = pistaPorId(d.pista);
  $('res-titulo').textContent = `Carrera ${d.numero}/${CARRERAS_POR_GP} · ${pista.nombre} ${pista.emoji}`;
  $('res-carrera').replaceChildren(...d.filas.map((f) => filaTabla(f, [
    f.posicion, quien(f), f.tiempo === null ? '🐢 no llegó' : formatoTiempo(f.tiempo), { texto: `+${f.puntos}`, clase: 'mas' },
  ], `${medalla(f.posicion)} ${f.id === yo.id ? 'yo' : ''}`)));
  tablaTotales($('res-total'), d.totales);
  $('res-guardado').textContent = '';
  const mia = d.filas.find((f) => f.id === yo.id);
  if (mia) aviso(mia.posicion === 1 ? '🥇 ¡Ganaste esta carrera!' : `Llegaste ${ordinal(mia.posicion)} · +${mia.puntos} puntos`, 4000);
  pintarBotonesAnfitrion();
  if (soyAnfitrion()) {
    clearTimeout(temporizadorAuto);
    temporizadorAuto = setTimeout(() => (d.numero >= CARRERAS_POR_GP ? mostrarPodioComoAnfitrion() : siguienteCarrera()), 30000);
  }
}

function pintarBotonesAnfitrion() {
  const host = soyAnfitrion();
  const ultima = (sala?.numero ?? 0) >= CARRERAS_POR_GP;
  const b = $('btn-siguiente');
  b.classList.toggle('oculto', !host);
  b.textContent = ultima ? '🏆 ¡Ver al campeón!' : '▶ Siguiente carrera';
  $('res-espera').classList.toggle('oculto', host);
  $('btn-otra').classList.toggle('oculto', !host);
}

function mostrarPodio(d) {
  ultimoPodio = d;
  if (carrera) { carrera.destruir(); carrera = null; }
  if (sala) sala.estado = 'podio';
  mostrar('podio');
  musica('victoria');
  for (const n of [1, 2, 3]) {
    const t = d.totales[n - 1];
    $(`podio-${n}`).replaceChildren(...(t ? [el('span', { class: 'cara' }, personaje(t.personaje).emoji), `${t.bot ? '🤖 ' : ''}${t.nombre}`, el('br'), `${t.total} pts`] : []));
  }
  tablaTotales($('podio-tabla'), d.totales);
  pintarBotonesAnfitrion();
  lanzarConfeti();
  if (d.totales[0]?.id === yo.id) aviso('👑 ¡Eres el campeón del Gran Premio!', 6000);
}

function lanzarConfeti() {
  const piezas = ['🎉', '🎊', '⭐', '🏆', '🍬', '✨', '🎈'];
  for (let i = 0; i < 60; i++) {
    const c = el('div', { class: 'confeti', style: { left: `${Math.random() * 100}vw`, animationDuration: `${2.5 + Math.random() * 3}s`, animationDelay: `${Math.random() * 2}s` } }, piezas[i % piezas.length]);
    document.body.append(c);
    setTimeout(() => c.remove(), 8000);
  }
}

// ---------- Historial ----------
async function verHistorial() {
  mostrar('historial');
  const cont = $('hist-lista');
  cont.replaceChildren(el('p', { class: 'nota' }, 'Cargando…'));
  const gps = await leerHistorial(modoDetectado);
  if (!gps.length) { cont.replaceChildren(el('p', { class: 'nota grande-nota' }, 'Todavía no hay carreras guardadas. ¡Organiza la primera! 🏁')); return; }
  cont.replaceChildren(...gps.slice(0, 40).map((g) => {
    const top = g.totales[0];
    const fecha = new Date(g.fecha);
    return el('div', { class: 'gp' },
      el('div', { class: 'ganador' }, top ? `🏆 ${personaje(top.personaje).emoji} ${top.nombre} · ${top.total} pts` : 'Sin datos'),
      el('div', { class: 'detalle' }, `${Number.isNaN(fecha.getTime()) ? '' : fecha.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })} · Sala ${g.sala ?? '—'} · ${g.carreras}/${CARRERAS_POR_GP} carreras${g.carreras < CARRERAS_POR_GP ? ' (sin terminar)' : ''}`),
      el('div', { class: 'detalle' }, g.totales.slice(1, 6).map((t) => `${t.lugar}. ${t.nombre} (${t.total})`).join(' · ')));
  }));
}

// ---------- Arranque ----------
function iniciarUI() {
  pintarPersonajes();
  $('nombre').value = yo.nombre;
  const params = new URLSearchParams(location.search);
  const codUrl = limpiarCodigo(params.get('sala'));
  if (codUrl) { $('codigo').value = codUrl; }
  $('codigo').addEventListener('input', (e) => { e.target.value = limpiarCodigo(e.target.value); });
  $('nombre').addEventListener('change', () => { yo.nombre = limpiarNombre($('nombre').value); guardarYo(); });
  $('btn-crear').onclick = () => entrarSala(codigoSala(), { creador: true, practica: false });
  $('btn-unirse').onclick = () => {
    const c = limpiarCodigo($('codigo').value);
    if (c.length !== 4) { aviso('🔤 El código tiene 4 letras'); $('codigo').focus(); return; }
    entrarSala(c, { creador: false, practica: false });
  };
  $('codigo').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-unirse').click(); });
  $('btn-practica').onclick = () => entrarSala(codigoSala(), { creador: true, practica: true });
  $('btn-historial').onclick = () => { despertar(); verHistorial(); };
  $('btn-hist-volver').onclick = () => mostrar('inicio');
  $('btn-salir').onclick = () => salirSala();
  $('btn-inicio').onclick = () => salirSala();
  $('btn-mas-bot').onclick = () => { botsDeseados = Math.min(MAX_CORREDORES - 1, botsDeseados + 1); sfx('clic'); actualizarSalaComoAnfitrion(); pintarSala(); };
  $('btn-menos-bot').onclick = () => { botsDeseados = Math.max(0, botsDeseados - 1); sfx('clic'); actualizarSalaComoAnfitrion(); pintarSala(); };
  $('btn-empezar').onclick = () => empezarGP();
  $('btn-siguiente').onclick = () => ((sala?.numero ?? 0) >= CARRERAS_POR_GP ? mostrarPodioComoAnfitrion() : siguienteCarrera());
  $('btn-otra').onclick = () => volverALobbyComoAnfitrion();
  $('btn-copiar').onclick = async () => {
    const url = `${location.origin}${location.pathname}?sala=${codigo}${params.get('red') ? `&red=${params.get('red')}` : ''}`;
    try { await navigator.clipboard.writeText(url); aviso('📋 Enlace copiado. ¡Pégalo en el chat del equipo!'); } catch { aviso(url, 8000); }
  };
  // Doble toque o clic sostenido en la carrera: que no seleccione texto, no haga zoom ni abra menús.
  for (const ev of ['selectstart', 'dblclick', 'contextmenu']) $('juego').addEventListener(ev, (e) => e.preventDefault());
  const bSonido = $('btn-sonido');
  bSonido.textContent = estaSilenciado() ? '🔇' : '🔊';
  bSonido.onclick = () => { bSonido.textContent = alternarSilencio() ? '🔇' : '🔊'; };
  document.addEventListener('pointerdown', (e) => {
    despertar();
    musica($('juego').classList.contains('activa') ? 'carrera' : $('podio').classList.contains('activa') ? 'victoria' : 'menu');
    if (e.pointerType === 'touch') document.body.classList.add('es-tactil');
  }, { once: false });
  if (window.matchMedia?.('(pointer: coarse)').matches) document.body.classList.add('es-tactil');
  window.addEventListener('beforeunload', () => red?.enviar('adios', {}));
  window.kartDepuracion = { get sala() { return sala; }, get carrera() { return carrera; }, get resultado() { return ultimoResultado; }, get podio() { return ultimoPodio; }, get red() { return red; }, yo };
}

iniciarUI();
detectarModo().then((m) => {
  modoDetectado = m;
  $('modo-red').textContent = `Conexión: ${NOMBRE_MODO[m]}${m === 'local' ? ' — para jugar entre varias computadoras usa el servidor de la oficina o Supabase.' : ''}`;
});
