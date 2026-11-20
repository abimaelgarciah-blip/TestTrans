// Música alegre y efectos con Web Audio. Todo se sintetiza: no hay archivos de audio.
let ctx = null;
let maestro = null;
let musicaGain = null;
let silencio = false;
try { silencio = localStorage.getItem('kart-silencio') === '1'; } catch { /* sin almacenamiento */ }

function asegurar() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  maestro = ctx.createGain();
  maestro.gain.value = silencio ? 0 : 0.6;
  maestro.connect(ctx.destination);
  musicaGain = ctx.createGain();
  musicaGain.gain.value = 0.32;
  musicaGain.connect(maestro);
  return ctx;
}

export function despertar() {
  const c = asegurar();
  if (c && c.state === 'suspended') c.resume();
}

export function estaSilenciado() { return silencio; }
export function alternarSilencio() {
  silencio = !silencio;
  try { localStorage.setItem('kart-silencio', silencio ? '1' : '0'); } catch { /* nada */ }
  if (maestro) maestro.gain.value = silencio ? 0 : 0.6;
  return silencio;
}

const frec = (m) => 440 * 2 ** ((m - 69) / 12);

function tono(destino, { tipo = 'square', nota, t, dur, vol = 0.2, desliz = 0 }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(frec(nota), t);
  if (desliz) o.frequency.exponentialRampToValueAtTime(frec(nota + desliz), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(destino);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let bufferRuido = null;
function ruido(destino, t, dur, vol, filtro = 'highpass', corte = 6000) {
  if (!bufferRuido) {
    bufferRuido = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = bufferRuido.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = bufferRuido;
  const f = ctx.createBiquadFilter();
  f.type = filtro; f.frequency.value = corte;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(destino);
  s.start(t); s.stop(t + dur + 0.02);
}

function bombo(destino, t) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
  o.connect(g).connect(destino);
  o.start(t); o.stop(t + 0.2);
}

// Canciones: 4 compases de 16 pasos. 0 = silencio.
const CANCIONES = {
  menu: {
    tempo: 126,
    acordes: [48, 45, 41, 43],
    melodia: [
      72, 0, 76, 0, 79, 0, 76, 0, 84, 0, 79, 0, 76, 0, 74, 0,
      72, 0, 76, 0, 81, 0, 79, 0, 76, 0, 72, 0, 74, 0, 76, 0,
      77, 0, 81, 0, 84, 0, 81, 0, 77, 0, 76, 0, 74, 0, 72, 0,
      74, 0, 79, 0, 83, 0, 86, 0, 83, 0, 79, 0, 77, 76, 74, 0,
    ],
  },
  carrera: {
    tempo: 152,
    acordes: [48, 41, 43, 48, 45, 41, 43, 43],
    melodia: [
      79, 0, 79, 81, 0, 79, 76, 0, 72, 0, 74, 76, 0, 74, 72, 0,
      77, 0, 77, 79, 0, 77, 74, 0, 81, 0, 79, 77, 0, 76, 74, 0,
      74, 0, 76, 77, 0, 79, 0, 83, 0, 81, 79, 0, 77, 0, 74, 0,
      76, 0, 79, 84, 0, 79, 76, 0, 72, 76, 79, 0, 84, 0, 0, 0,
      76, 0, 76, 77, 0, 76, 72, 0, 69, 0, 72, 76, 0, 81, 0, 0,
      77, 0, 81, 84, 0, 81, 77, 0, 72, 0, 77, 81, 0, 84, 0, 0,
      79, 0, 83, 86, 0, 83, 79, 0, 74, 0, 79, 83, 0, 86, 0, 0,
      91, 0, 89, 0, 88, 0, 86, 0, 84, 0, 83, 0, 81, 0, 79, 0,
    ],
  },
  victoria: {
    tempo: 140,
    acordes: [48, 41, 43, 48],
    melodia: [
      72, 0, 72, 72, 76, 0, 79, 0, 84, 0, 0, 0, 79, 0, 84, 0,
      81, 0, 81, 81, 84, 0, 81, 0, 77, 0, 0, 0, 81, 0, 77, 0,
      79, 0, 79, 79, 83, 0, 86, 0, 91, 0, 0, 0, 86, 0, 83, 0,
      84, 0, 79, 0, 76, 0, 79, 0, 84, 0, 0, 0, 0, 0, 0, 0,
    ],
  },
};

let cancion = null;
let paso = 0;
let siguiente = 0;
let reloj = null;
let factorTempo = 1;

function programar() {
  if (!cancion || !ctx) return;
  const segPaso = 60 / (cancion.tempo * factorTempo) / 4;
  while (siguiente < ctx.currentTime + 0.12) {
    const t = siguiente;
    const largo = cancion.melodia.length;
    const i = paso % largo;
    const compas = Math.floor(i / 16) % cancion.acordes.length;
    const p16 = i % 16;
    const raiz = cancion.acordes[compas];
    const m = cancion.melodia[i];
    if (m) tono(musicaGain, { tipo: 'square', nota: m, t, dur: segPaso * 1.8, vol: 0.13 });
    if (p16 % 2 === 0) {
      const patronBajo = [0, 0, 12, 0, 7, 0, 12, 0];
      tono(musicaGain, { tipo: 'triangle', nota: raiz + patronBajo[p16 / 2], t, dur: segPaso * 1.6, vol: 0.34 });
    }
    if (p16 % 4 === 2) {
      // Acorde "chiquito" a contratiempo.
      for (const iv of [12, 16, 19]) tono(musicaGain, { tipo: 'sawtooth', nota: raiz + iv + (compas === 1 && cancion === CANCIONES.menu ? -1 : 0), t, dur: segPaso * 0.9, vol: 0.025 });
    }
    if (p16 % 4 === 0) bombo(musicaGain, t);
    if (p16 === 4 || p16 === 12) ruido(musicaGain, t, 0.12, 0.25, 'bandpass', 1800);
    if (p16 % 2 === 1) ruido(musicaGain, t, 0.04, 0.12);
    paso += 1;
    siguiente += segPaso;
  }
}

export function musica(nombre) {
  if (!asegurar()) return;
  const nueva = CANCIONES[nombre] ?? null;
  if (nueva === cancion) return;
  cancion = nueva;
  paso = 0;
  factorTempo = 1;
  siguiente = ctx.currentTime + 0.08;
  if (!reloj) reloj = setInterval(programar, 40);
}

export function apurarMusica(f = 1.12) { factorTempo = f; }

export function detenerMusica() { cancion = null; }

// Efectos de sonido.
export function sfx(nombre) {
  if (!asegurar() || silencio) return;
  const t = ctx.currentTime;
  const d = maestro;
  switch (nombre) {
    case 'cuenta': tono(d, { nota: 69, t, dur: 0.25, vol: 0.25 }); break;
    case 'ya': tono(d, { nota: 81, t, dur: 0.6, vol: 0.3 }); tono(d, { nota: 88, t, dur: 0.6, vol: 0.15 }); break;
    case 'esfera': [76, 81, 86, 93].forEach((n, k) => tono(d, { nota: n, t: t + k * 0.05, dur: 0.12, vol: 0.15 })); break;
    case 'ruleta': tono(d, { tipo: 'triangle', nota: 84 + Math.floor(Math.random() * 6), t, dur: 0.05, vol: 0.12 }); break;
    case 'item': tono(d, { nota: 79, t, dur: 0.1, vol: 0.2 }); tono(d, { nota: 91, t: t + 0.08, dur: 0.18, vol: 0.2 }); break;
    case 'lanzar': ruido(d, t, 0.3, 0.4, 'bandpass', 900); tono(d, { tipo: 'sawtooth', nota: 60, t, dur: 0.3, vol: 0.12, desliz: 24 }); break;
    case 'golpe': tono(d, { tipo: 'sawtooth', nota: 70, t, dur: 0.5, vol: 0.25, desliz: -30 }); ruido(d, t, 0.3, 0.5, 'lowpass', 1500); break;
    case 'turbo': tono(d, { tipo: 'sawtooth', nota: 48, t, dur: 0.6, vol: 0.2, desliz: 24 }); ruido(d, t, 0.6, 0.3, 'bandpass', 600); break;
    case 'estrella': [72, 76, 79, 84, 88, 91, 96].forEach((n, k) => tono(d, { nota: n, t: t + k * 0.04, dur: 0.1, vol: 0.12 })); break;
    case 'rayo': ruido(d, t, 0.8, 0.7, 'lowpass', 3000); tono(d, { tipo: 'square', nota: 96, t, dur: 0.6, vol: 0.15, desliz: -48 }); break;
    case 'pastel': ruido(d, t, 0.25, 0.6, 'lowpass', 500); tono(d, { tipo: 'sine', nota: 55, t, dur: 0.3, vol: 0.3, desliz: -12 }); break;
    case 'choque': ruido(d, t, 0.12, 0.35, 'lowpass', 800); break;
    case 'charco': ruido(d, t, 0.35, 0.5, 'lowpass', 700); tono(d, { tipo: 'sine', nota: 50, t, dur: 0.25, vol: 0.2, desliz: -7 }); break;
    case 'vuelta': [84, 88].forEach((n, k) => tono(d, { nota: n, t: t + k * 0.1, dur: 0.15, vol: 0.2 })); break;
    case 'meta': [72, 76, 79, 84, 79, 84].forEach((n, k) => tono(d, { nota: n, t: t + k * 0.12, dur: 0.2, vol: 0.22 })); break;
    case 'clic': tono(d, { tipo: 'triangle', nota: 88, t, dur: 0.06, vol: 0.2 }); break;
    case 'entra': [79, 84].forEach((n, k) => tono(d, { tipo: 'triangle', nota: n, t: t + k * 0.07, dur: 0.12, vol: 0.2 })); break;
    default: break;
  }
}
