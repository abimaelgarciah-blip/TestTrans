// Motor de la carrera: física arcade, pseudo-3D estilo "modo 7", ítems, bots y dibujo.
import { indiceCercano, parrilla, MUNDO, MURO, PASTO } from './pistas.js';
import { personaje } from './personajes.js';
import { VUELTAS, sortearItem, ordinal, formatoTiempo } from './puntos.js';
import { sfx, apurarMusica } from './audio.js';
import { crearCamara, dibujarKart3D, dibujarCohete3D, dibujarPlatano, dibujarBolaFuego, dibujarEsfera, Particulas, imagenEmoji, puntoKart, COLORES_CONFETI, hexARgb, mezclar, tono } from './render3d.js';

const ALTURA_CAM = 26;
const DIST_CAM = 92;
const LEJOS = 1500;
const ENVIOS_POR_SEG = 7;

export const INFO_ITEMS = {
  platano: { emoji: '🍌', nombre: 'Plátano' },
  cohete: { emoji: '🔥', nombre: 'Bola de fuego' },
  misil: { emoji: '🚀', nombre: 'Cohete buscador' },
  turbo: { emoji: '🍄', nombre: 'Hongo turbo' },
  estrella: { emoji: '⭐', nombre: 'Súper estrella' },
  rayo: { emoji: '⚡', nombre: 'Rayo encogedor' },
  pastel: { emoji: '🥧', nombre: 'Pastelazo' },
};
const LISTA_EMOJIS = Object.values(INFO_ITEMS).map((i) => i.emoji);

const normalizar = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
let contadorId = 0;

export class Carrera {
  /**
   * opciones: { pista (construida), canvas, controles (div táctil), yo, corredores, soyAnfitrion,
   *             enviar(tipo, datos), alTerminarLocal(lugar), alFinCarrera(filas) }
   */
  constructor(op) {
    Object.assign(this, op);
    this.ctx = this.canvas.getContext('2d');
    this.buf = document.createElement('canvas');
    this.bctx = this.buf.getContext('2d');
    this.karts = new Map();
    this.proyectiles = new Map();
    this.esferas = this.pista.esferas.map((e) => ({ ...e, vuelve: 0 }));
    this.teclas = new Set();
    this.tactil = { izq: false, der: false, freno: false, usar: false };
    this.mensajes = [];
    this.splats = [];
    this.destello = 0;
    this.sacudida = 0;
    this.ultimoEnvio = 0;
    this.fase = 'cuenta';
    this.inicio = performance.now() + 3600;
    this.cuentaMostrada = 4;
    this.finalizada = false;
    this.primeraMeta = null;
    this.ultimaVueltaAvisada = false;
    this.particulas = new Particulas();
    this.rayos = null;
    this.botonUsar = this.controles?.querySelector('[data-control="usar"]') ?? null;
    this.itemMostrado = '';
    this.coloresValla = this.pista.def.colores.bordillo.map(hexARgb);
    this.colorNiebla = [...this.pista.def.colores.niebla];

    const lugares = parrilla(this.pista.pts, this.pista.def.ancho, this.corredores.length);
    this.corredores.forEach((c, i) => {
      const l = lugares[i];
      const local = c.id === this.yo || (c.bot && this.soyAnfitrion);
      this.karts.set(c.id, {
        id: c.id, nombre: c.nombre, pj: personaje(c.personaje), bot: !!c.bot, local,
        x: l.x, y: l.y, ang: l.ang, vel: 0, idx: l.idx, vuelta: -1, prog: -1 + l.idx / this.pista.N,
        terminado: false, tiempo: null, lugar: i + 1, item: null, ruleta: 0, flags: 0,
        ef: { turbo: 0, estrella: 0, giro: 0, encogido: 0, pastel: 0 },
        red: { x: l.x, y: l.y, ang: l.ang, vel: 0, t: performance.now() }, visto: performance.now(),
        ia: { carril: (Math.random() - 0.5) * 0.5, habilidad: 0.86 + Math.random() * 0.1, usarEn: 0, cambio: 0 },
        autopiloto: !!c.bot,
      });
    });
    this.yoKart = this.karts.get(this.yo) ?? null;
    this.camAng = this.yoKart ? this.yoKart.ang : this.pista.pts[0].ang;

    this._tecla = (e) => this.manejarTecla(e);
    window.addEventListener('keydown', this._tecla);
    window.addEventListener('keyup', this._tecla);
    this._redimensionar = () => this.redimensionar();
    window.addEventListener('resize', this._redimensionar);
    this.prepararTactil();
    this.redimensionar();
    this.tAnterior = performance.now();
    this._bucle = (t) => this.bucle(t);
    this.raf = requestAnimationFrame(this._bucle);
  }

  destruir() {
    this.finalizada = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this._tecla);
    window.removeEventListener('keyup', this._tecla);
    window.removeEventListener('resize', this._redimensionar);
  }

  // ---------- Entrada ----------
  manejarTecla(e) {
    const k = e.key.toLowerCase();
    const juego = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'shift', 'e', 'z', 'x'];
    if (!juego.includes(k)) return;
    e.preventDefault();
    if (e.type === 'keydown') {
      if ((k === ' ' || k === 'shift' || k === 'e' || k === 'z') && !this.teclas.has(k)) this.usarItem(this.yoKart);
      this.teclas.add(k);
    } else this.teclas.delete(k);
  }

  prepararTactil() {
    if (!this.controles) return;
    for (const b of this.controles.querySelectorAll('[data-control]')) {
      const nombre = b.dataset.control;
      const on = (ev) => {
        ev.preventDefault();
        if (nombre === 'usar') this.usarItem(this.yoKart);
        else this.tactil[nombre] = true;
      };
      const off = (ev) => { ev.preventDefault(); this.tactil[nombre] = false; };
      b.onpointerdown = on;
      b.onpointerup = off;
      b.onpointerleave = off;
      b.onpointercancel = off;
    }
  }

  entradaJugador() {
    const t = this.teclas;
    const tactilActivo = this.tactil.izq || this.tactil.der || this.tactil.freno || document.body.classList.contains('es-tactil');
    let giro = 0;
    if (t.has('arrowleft') || t.has('a') || this.tactil.izq) giro -= 1;
    if (t.has('arrowright') || t.has('d') || this.tactil.der) giro += 1;
    const freno = t.has('arrowdown') || t.has('s') || t.has('x') || this.tactil.freno;
    // En pantallas táctiles el kart acelera solo; con teclado se acelera con ↑ o W.
    const acel = t.has('arrowup') || t.has('w') || (tactilActivo && !freno);
    return { acel, freno, giro };
  }

  entradaBot(k, ahora) {
    const p = this.pista.pts;
    const N = this.pista.N;
    if (ahora > k.ia.cambio) {
      k.ia.carril = limitar(k.ia.carril + (Math.random() - 0.5) * 0.4, -0.3, 0.3);
      k.ia.cambio = ahora + 1500 + Math.random() * 2500;
    }
    const adelante = Math.round(7 + Math.abs(k.vel) / 40);
    const obj = p[(k.idx + adelante) % N];
    const nx = -Math.sin(obj.ang), ny = Math.cos(obj.ang);
    const tx = obj.x + nx * k.ia.carril * this.pista.def.ancho;
    const ty = obj.y + ny * k.ia.carril * this.pista.def.ancho;
    const deseado = Math.atan2(ty - k.y, tx - k.x);
    const dif = normalizar(deseado - k.ang);
    // Ítems: los usa después de un ratito.
    if (k.item && !k.ruleta && ahora > k.ia.usarEn) this.usarItem(k);
    return { acel: true, freno: Math.abs(dif) > 1.2 && k.vel > 150, giro: limitar(dif * 2.6, -1, 1) };
  }

  // ---------- Bucle ----------
  bucle(t) {
    if (this.finalizada) return;
    const dt = Math.min(0.05, (t - this.tAnterior) / 1000);
    this.tAnterior = t;
    this.dtUltimo = dt;
    this.actualizar(dt, t);
    this.dibujar(t);
    this.raf = requestAnimationFrame(this._bucle);
  }

  actualizar(dt, ahora) {
    if (this.fase === 'cuenta') {
      const falta = Math.ceil((this.inicio - ahora) / 1000);
      if (falta < this.cuentaMostrada && falta >= 1 && falta <= 3) {
        this.cuentaMostrada = falta;
        sfx('cuenta');
        this.aviso(String(falta), 900, 'cuenta');
      }
      if (ahora >= this.inicio) {
        this.fase = 'carrera';
        sfx('ya');
        this.aviso('¡YA!', 900, 'cuenta');
      }
    }
    const corriendo = this.fase === 'carrera';

    for (const k of this.karts.values()) {
      if (k.local) {
        let entrada = { acel: false, freno: false, giro: 0 };
        if (corriendo) entrada = k.autopiloto ? this.entradaBot(k, ahora) : this.entradaJugador();
        this.fisica(k, entrada, dt, ahora);
      } else {
        this.interpolar(k, dt, ahora);
      }
      for (const e of Object.keys(k.ef)) if (k.ef[e] > 0) k.ef[e] = Math.max(0, k.ef[e] - dt);
      // Volante visual (ruedas e inclinación) a partir de cuánto gira el kart.
      const dAng = normalizar(k.ang - (k.angAnt ?? k.ang));
      k.angAnt = k.ang;
      const objetivo = k.ef.giro > 0 ? 0 : limitar(dAng / Math.max(dt, 0.001) / 2.2, -1, 1);
      k.volante = (k.volante ?? 0) + (objetivo - (k.volante ?? 0)) * Math.min(1, dt * 10);
      k.altura = k.ef.giro > 0 ? Math.abs(Math.sin(k.ef.giro * 5.2)) * 5 : (k.sobrePasto && Math.abs(k.vel) > 40 ? Math.abs(Math.sin(ahora / 55 + k.x * 0.01)) * 0.8 : 0);
      this.efectosKart(k, dt);
      if (k.ruleta > 0) {
        k.ruleta -= dt;
        if (k === this.yoKart && Math.random() < 0.3) sfx('ruleta');
        if (k.ruleta <= 0) {
          k.ruleta = 0;
          const n = this.karts.size;
          k.item = sortearItem(n > 1 ? (k.lugar - 1) / (n - 1) : 0.5);
          k.ia.usarEn = ahora + 800 + Math.random() * 3500;
          if (k === this.yoKart) sfx('item');
        }
      }
    }

    this.actualizarProyectiles(dt, ahora);
    this.particulas.actualizar(dt);
    this.actualizarBoton(ahora);
    this.calcularLugares();
    if (corriendo) this.revisarColisiones(ahora);

    if (ahora - this.ultimoEnvio > 1000 / ENVIOS_POR_SEG) {
      this.ultimoEnvio = ahora;
      this.enviarEstado();
    }
    if (corriendo && (this.esAnfitrion ? this.esAnfitrion() : this.soyAnfitrion)) this.revisarFin(ahora);

    for (const s of this.splats) s.vida -= dt;
    this.splats = this.splats.filter((s) => s.vida > 0);
    this.destello = Math.max(0, this.destello - dt * 2);
    this.sacudida = Math.max(0, this.sacudida - dt * 3);
    this.mensajes = this.mensajes.filter((m) => m.hasta > ahora);
  }

  fisica(k, ent, dt, ahora) {
    const sup = this.pista.superficie(k.x, k.y);
    k.sobrePasto = sup === PASTO;
    let vmax = 275 * (k.bot || k.autopiloto ? k.ia.habilidad : 1);
    if (k.bot) vmax *= this.bandaElastica(k);
    if (k.ef.estrella) vmax = 340;
    if (k.ef.turbo) vmax = 420;
    if (k.ef.encogido) vmax *= 0.6;
    if (k.ef.pastel && k.bot) vmax *= 0.85;
    if (sup === PASTO && !k.ef.estrella) vmax = k.ef.turbo ? 260 : 115;

    if (k.ef.giro > 0) {
      k.ang += 10 * dt;
      k.vel *= 1 - 2.5 * dt;
    } else {
      if (ent.acel) k.vel += (k.vel < vmax ? 220 : -260) * dt;
      else if (ent.freno) k.vel -= 420 * dt;
      else k.vel -= Math.sign(k.vel) * Math.min(Math.abs(k.vel), 110 * dt);
      if (ent.acel && ent.freno) k.vel -= 300 * dt;
      if (k.vel > vmax && !ent.acel) k.vel -= 260 * dt;
      k.vel = limitar(k.vel, -90, 440);
      if (k.ef.turbo) k.vel = Math.max(k.vel, 400);
      const agarre = 0.55 + 0.45 * limitar(Math.abs(k.vel) / 90, 0, 1); // se puede girar aun casi parado
      k.ang += ent.giro * 2.5 * dt * agarre * Math.sign(k.vel || 1);
    }

    const nx = k.x + Math.cos(k.ang) * k.vel * dt;
    const ny = k.y + Math.sin(k.ang) * k.vel * dt;
    if (this.pista.superficie(nx, ny) !== MURO) { k.x = nx; k.y = ny; }
    else if (this.pista.superficie(nx, k.y) !== MURO) { k.x = nx; k.vel *= 0.7; }
    else if (this.pista.superficie(k.x, ny) !== MURO) { k.y = ny; k.vel *= 0.7; }
    else {
      if (Math.abs(k.vel) > 60) this.chispas(...puntoKart(k, 13, 0, 3), 8);
      k.vel *= -0.35;
      if (k === this.yoKart) { sfx('choque'); this.sacudida = 0.4; }
    }

    // Rescate: si alguien se queda atorado (contra un muro o en el pasto), lo regresamos a la pista.
    if (this.fase === 'carrera' && Math.abs(k.vel) < 45 && k.ef.giro <= 0 && (ent.acel || ent.freno)) k.atorado = (k.atorado ?? 0) + dt;
    else k.atorado = 0;
    if (k.atorado > 2.5) {
      const p = this.pista.pts[k.idx];
      k.x = p.x; k.y = p.y; k.ang = p.ang; k.vel = 0; k.atorado = 0;
      if (k === this.yoKart) { this.camAng = p.ang; this.aviso('🎈 ¡Te rescatamos!', 1500, 'mal'); }
    }

    this.avanzarVuelta(k, ahora);
  }

  bandaElastica(k) {
    // Los bots se acomodan un poco al ritmo de los humanos para que siempre haya pelea.
    let mejorHumano = -Infinity;
    for (const o of this.karts.values()) if (!o.bot) mejorHumano = Math.max(mejorHumano, o.prog);
    if (!Number.isFinite(mejorHumano)) return 1;
    const dif = k.prog - mejorHumano;
    if (dif < -0.25) return 1.08;
    if (dif > 0.3) return 0.88;
    return 1;
  }

  avanzarVuelta(k, ahora) {
    const N = this.pista.N;
    const nuevo = indiceCercano(this.pista.pts, k.x, k.y, k.idx);
    if (k.idx > N * 0.75 && nuevo < N * 0.25) {
      k.vuelta += 1;
      if (!k.terminado && k.vuelta >= VUELTAS) this.cruzarMeta(k, ahora);
      else if (k === this.yoKart && k.vuelta > 0) {
        sfx('vuelta');
        if (k.vuelta === VUELTAS - 1) {
          this.aviso('¡Última vuelta!', 2000, 'grande');
          if (!this.ultimaVueltaAvisada) { apurarMusica(1.14); this.ultimaVueltaAvisada = true; }
        } else this.aviso(`Vuelta ${k.vuelta + 1}`, 1500, 'grande');
      }
    } else if (k.idx < N * 0.25 && nuevo > N * 0.75) {
      k.vuelta -= 1;
    }
    k.idx = nuevo;
    k.prog = k.terminado ? VUELTAS + 1 - (k.lugar / 100) : k.vuelta + nuevo / N;
  }

  cruzarMeta(k, ahora) {
    k.terminado = true;
    k.tiempo = (ahora - this.inicio) / 1000;
    this.enviar('meta', { id: k.id, tiempo: k.tiempo });
    this.registrarMeta(k.id, k.tiempo);
    if (k === this.yoKart) {
      k.autopiloto = true;
      sfx('meta');
      for (let i = 0; i < 3; i++) this.confeti(k.x, k.y, 20, 30);
      this.alTerminarLocal?.(k.lugar);
      this.aviso(`¡Llegaste ${ordinal(k.lugar)}!`, 4000, 'grande');
    }
  }

  registrarMeta(id, tiempo) {
    const k = this.karts.get(id);
    if (!k) return;
    k.terminado = true;
    k.tiempo = tiempo;
    if (this.primeraMeta === null) this.primeraMeta = performance.now();
  }

  interpolar(k, dt, ahora) {
    const r = k.red;
    const desde = Math.min(0.35, (ahora - r.t) / 1000);
    const px = r.x + Math.cos(r.ang) * r.vel * desde;
    const py = r.y + Math.sin(r.ang) * r.vel * desde;
    const f = Math.min(1, dt * 10);
    if (Math.hypot(px - k.x, py - k.y) > 200) { k.x = px; k.y = py; }
    k.x += (px - k.x) * f;
    k.y += (py - k.y) * f;
    k.ang += normalizar(r.ang - k.ang) * f;
    k.vel = r.vel;
    k.sobrePasto = this.pista.superficie(k.x, k.y) === PASTO;
    k.idx = indiceCercano(this.pista.pts, k.x, k.y, k.idx);
  }

  calcularLugares() {
    const lista = [...this.karts.values()];
    lista.sort((a, b) => {
      if (a.terminado && b.terminado) return a.tiempo - b.tiempo;
      if (a.terminado !== b.terminado) return a.terminado ? -1 : 1;
      return b.prog - a.prog;
    });
    lista.forEach((k, i) => { k.lugar = i + 1; });
    this.orden = lista;
  }

  // ---------- Ítems ----------
  usarItem(k) {
    if (!k || !k.item || this.fase !== 'carrera' || k.ef.giro > 0) return;
    const tipo = k.item;
    k.item = null;
    const dx = Math.cos(k.ang), dy = Math.sin(k.ang);
    const esYo = k === this.yoKart;
    if (tipo === 'turbo') {
      k.ef.turbo = 1.6;
      for (let i = 0; i < 3; i++) this.efectosKart(k, 0.05);
      if (esYo) sfx('turbo');
      return;
    }
    if (tipo === 'estrella') { k.ef.estrella = 7; this.confeti(k.x, k.y, 12, 16); if (esYo) sfx('estrella'); return; }
    if (tipo === 'rayo') {
      this.enviar('rayo', { de: k.id });
      this.recibirRayo(k.id);
      return;
    }
    if (tipo === 'pastel') {
      this.enviar('pastel', { de: k.id, prog: k.prog });
      this.recibirPastel(k.id, k.prog);
      if (esYo) sfx('lanzar');
      return;
    }
    const p = { id: `${k.id}-${++contadorId}`, tipo, dueno: k.id, edad: 0 };
    if (tipo === 'platano') Object.assign(p, { x: k.x - dx * 30, y: k.y - dy * 30, ang: k.ang, vel: 0, vida: 90 });
    if (tipo === 'cohete') Object.assign(p, { x: k.x + dx * 34, y: k.y + dy * 34, ang: k.ang, vel: Math.max(560, k.vel + 260), vida: 3 });
    if (tipo === 'misil') {
      const objetivo = this.orden?.find((o) => o.lugar === k.lugar - 1);
      Object.assign(p, { x: k.x + dx * 34, y: k.y + dy * 34, ang: k.ang, vel: 500, vida: 7, obj: objetivo?.id ?? null, idx: k.idx });
    }
    this.proyectiles.set(p.id, p);
    this.enviar('item', p);
    if (esYo) sfx('lanzar');
  }

  recibirItem(p) {
    if (!this.proyectiles.has(p.id)) this.proyectiles.set(p.id, { ...p, edad: 0 });
  }

  recibirGolpe(idProyectil) {
    const p = this.proyectiles.get(idProyectil);
    if (p) this.efectoImpacto(p);
    this.proyectiles.delete(idProyectil);
  }

  efectoImpacto(p) {
    if (p.tipo === 'platano') {
      this.chispas(p.x, p.y, 4, 6);
      for (let i = 0; i < 6; i++) this.particulas.emitir({ tipo: 'confeti', color: '#ffd21f', x: p.x, y: p.y, z: 4, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, vz: 60 + Math.random() * 60, g: 160, vida: 0.8, tam: 1.4, giro: 0 });
    } else this.explosion(p.x, p.y, 7);
  }

  recibirEsfera(i) {
    const e = this.esferas[i];
    if (!e) return;
    if (e.vuelve <= performance.now()) this.confeti(e.x, e.y, 13, 18);
    e.vuelve = performance.now() + 3000;
  }

  recibirRayo(deId) {
    this.destello = 1;
    this.rayos = { de: deId, hasta: performance.now() + 550 };
    for (const k of this.karts.values()) if (k.id !== deId && !k.ef.estrella) this.chispas(k.x, k.y, 10, 8);
    sfx('rayo');
    for (const k of this.karts.values()) {
      if (!k.local || k.id === deId || k.ef.estrella) continue;
      k.ef.encogido = 4;
      k.ef.giro = Math.max(k.ef.giro, 0.6);
      k.vel *= 0.5;
      k.item = null;
      if (k === this.yoKart) this.aviso('⚡ ¡Te encogieron!', 1800, 'mal');
    }
  }

  recibirPastel(deId, prog) {
    this.lanzarPastelVisual(deId);
    for (const k of this.karts.values()) {
      if (!k.local || k.id === deId || k.prog <= prog || k.ef.estrella) continue;
      k.ef.pastel = 4.5;
      if (k === this.yoKart) {
        sfx('pastel');
        this.aviso('🥧 ¡Pastelazo!', 1500, 'mal');
        for (let i = 0; i < 7; i++) {
          this.splats.push({ x: 0.15 + Math.random() * 0.7, y: 0.2 + Math.random() * 0.6, r: 0.08 + Math.random() * 0.1, vida: 4.5, tono: Math.random() < 0.5 ? '#f7e3c2' : '#ff9ccf' });
        }
      }
    }
  }

  actualizarProyectiles(dt, _ahora) {
    for (const p of this.proyectiles.values()) {
      p.edad += dt;
      p.vida -= dt;
      if (p.vida <= 0) { this.proyectiles.delete(p.id); continue; }
      if (p.tipo === 'misil') {
        const obj = p.obj ? this.karts.get(p.obj) : null;
        let tx, ty;
        if (obj && Math.hypot(obj.x - p.x, obj.y - p.y) < 220) { tx = obj.x; ty = obj.y; }
        else {
          p.idx = indiceCercano(this.pista.pts, p.x, p.y, p.idx ?? 0);
          const sig = this.pista.pts[(p.idx + 4) % this.pista.N];
          tx = sig.x; ty = sig.y;
        }
        const dif = normalizar(Math.atan2(ty - p.y, tx - p.x) - p.ang);
        p.ang += limitar(dif, -6 * dt, 6 * dt);
      }
      if (p.vel) {
        p.x += Math.cos(p.ang) * p.vel * dt;
        p.y += Math.sin(p.ang) * p.vel * dt;
        if (this.pista.superficie(p.x, p.y) === MURO) { this.explosion(p.x, p.y, 6); this.proyectiles.delete(p.id); continue; }
        const bx = p.x - Math.cos(p.ang) * 8, by = p.y - Math.sin(p.ang) * 8;
        const r = Math.random;
        if (p.tipo === 'cohete') {
          this.particulas.emitir({ tipo: 'fuego', x: bx, y: by, z: 6, vx: (r() - 0.5) * 30, vy: (r() - 0.5) * 30, vz: 10, vida: 0.3, tam: 4.5, crece: -0.6 });
        } else {
          this.particulas.emitir({ tipo: 'fuego', x: bx, y: by, z: 7, vx: (r() - 0.5) * 20, vy: (r() - 0.5) * 20, vz: 4, vida: 0.18, tam: 3, crece: -0.5 });
          if (r() < 0.6) this.particulas.emitir({ tipo: 'humo', x: bx, y: by, z: 7, vx: (r() - 0.5) * 10, vy: (r() - 0.5) * 10, vz: 6, vida: 0.8, tam: 1.6, crece: 2.5, alfa: 0.5 });
        }
      }
    }
  }

  revisarColisiones(ahora) {
    for (const k of this.karts.values()) {
      if (!k.local) continue;
      const radio = k.ef.encogido ? 12 : 18;
      // Esferas "?"
      this.esferas.forEach((e, i) => {
        if (e.vuelve > ahora) return;
        if ((e.x - k.x) ** 2 + (e.y - k.y) ** 2 < (radio + 12) ** 2) {
          e.vuelve = ahora + 3000;
          this.confeti(e.x, e.y, 13, 18);
          this.enviar('esfera', { i });
          if (!k.item && !k.ruleta) { k.ruleta = 1.1; }
          if (k === this.yoKart) sfx('esfera');
        }
      });
      // Proyectiles
      for (const p of this.proyectiles.values()) {
        if (p.dueno === k.id && p.edad < 0.8) continue;
        if ((p.x - k.x) ** 2 + (p.y - k.y) ** 2 < (radio + 10) ** 2) {
          this.proyectiles.delete(p.id);
          this.efectoImpacto(p);
          this.enviar('golpe', { p: p.id });
          if (!k.ef.estrella) this.golpear(k, p.tipo === 'platano' ? '🍌 ¡Resbalaste!' : '💥 ¡Te dieron!');
        }
      }
      // Otros karts
      for (const o of this.karts.values()) {
        if (o === k) continue;
        const dx = k.x - o.x, dy = k.y - o.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.01 && d < 26) {
          const empuje = (26 - d) * 0.6;
          const nx = k.x + (dx / d) * empuje, ny = k.y + (dy / d) * empuje;
          if (this.pista.superficie(nx, ny) !== MURO) { k.x = nx; k.y = ny; }
          if (o.ef.estrella && !k.ef.estrella) this.golpear(k, '⭐ ¡Te arrolló una estrella!');
          else if (k === this.yoKart && Math.random() < 0.1) sfx('choque');
        }
      }
    }
  }

  golpear(k, texto) {
    if (k.ef.giro > 0) return;
    k.ef.giro = 1.2;
    k.vel *= 0.3;
    if (k === this.yoKart) {
      sfx('golpe');
      this.sacudida = 1;
      this.aviso(texto, 1500, 'mal');
    }
  }

  // ---------- Red ----------
  enviarEstado() {
    const lista = [];
    for (const k of this.karts.values()) {
      if (!k.local) continue;
      const f = (k.ef.estrella ? 1 : 0) | (k.ef.giro ? 2 : 0) | (k.ef.encogido ? 4 : 0) | (k.ef.turbo ? 8 : 0) | (k.terminado ? 16 : 0);
      lista.push([k.id, Math.round(k.x), Math.round(k.y), Math.round(k.ang * 100), Math.round(k.vel), Math.round(k.prog * 1000), f]);
    }
    if (lista.length) this.enviar('e', lista);
  }

  recibirEstado(lista) {
    const ahora = performance.now();
    for (const [id, x, y, a, v, prog, f] of lista) {
      const k = this.karts.get(id);
      if (!k || k.local) continue;
      k.red = { x, y, ang: a / 100, vel: v, t: ahora };
      k.prog = prog / 1000;
      k.visto = ahora;
      k.ef.estrella = f & 1 ? 1 : 0;
      k.ef.giro = f & 2 ? 0.2 : 0;
      k.ef.encogido = f & 4 ? 1 : 0;
      k.ef.turbo = f & 8 ? 0.2 : 0;
    }
  }

  revisarFin(ahora) {
    const todos = [...this.karts.values()];
    const conectados = todos.filter((k) => k.local || ahora - k.visto < 6000);
    const humanos = conectados.filter((k) => !k.bot);
    const todosLlegaron = conectados.every((k) => k.terminado);
    const humanosLlegaron = humanos.length > 0 && humanos.every((k) => k.terminado);
    if (!conectados.length) return;
    const tiempoExtra = this.primeraMeta !== null && ahora - this.primeraMeta > 25000;
    const limite = ahora - this.inicio > 6 * 60 * 1000;
    if (todosLlegaron || (humanosLlegaron && ahora - this.primeraMeta > 3000) || tiempoExtra || limite) {
      this.fase = 'fin';
      setTimeout(() => this.alFinCarrera?.(this.filas()), 1500);
    }
  }

  filas() {
    return this.orden.map((k) => ({ id: k.id, nombre: k.nombre, personaje: k.pj.id, bot: k.bot, tiempo: k.tiempo, progreso: k.terminado ? VUELTAS : Math.max(0, k.prog) }));
  }

  aviso(texto, ms, clase = '') {
    this.mensajes = this.mensajes.filter((m) => m.clase !== clase || clase === '');
    this.mensajes.push({ texto, hasta: performance.now() + ms, desde: performance.now(), clase });
  }

  // ---------- Dibujo ----------
  redimensionar() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.alto = Math.round(limitar(h * 0.55, 240, 380));
    const ancho = Math.round(limitar(this.alto * (w / h), 120, 720));
    this.buf.width = ancho;
    this.buf.height = this.alto;
    this.img = this.bctx.createImageData(ancho, this.alto);
    this.pix = new Uint32Array(this.img.data.buffer);
    const vertical = ancho / this.alto < 0.8;
    this.horizonte = Math.round(this.alto * (vertical ? 0.42 : 0.36));
    this.focalBase = Math.min(1.22 * this.alto, Math.max(ancho * 1.1, this.alto * 0.5));
    // Viñeta suave en las orillas (da profundidad).
    this.vineta = document.createElement('canvas');
    this.vineta.width = this.canvas.width;
    this.vineta.height = this.canvas.height;
    const vc = this.vineta.getContext('2d');
    const g = vc.createRadialGradient(this.canvas.width / 2, this.canvas.height * 0.55, Math.min(this.canvas.width, this.canvas.height) * 0.35, this.canvas.width / 2, this.canvas.height * 0.55, Math.max(this.canvas.width, this.canvas.height) * 0.75);
    g.addColorStop(0, 'rgba(20,0,40,0)');
    g.addColorStop(1, 'rgba(20,0,40,0.38)');
    vc.fillStyle = g;
    vc.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  camara() {
    return this.yoKart ?? this.orden?.[0] ?? [...this.karts.values()][0];
  }

  dibujar(ahora) {
    const ctx = this.ctx;
    const W = this.buf.width, H = this.alto, hz = this.horizonte;
    const sujeto = this.camara();
    if (!sujeto) return;
    const dt = this.dtUltimo ?? 0.016;
    // La cámara sigue suave al kart (y no gira loca cuando el kart da vueltas por un golpe).
    const angObjetivo = sujeto.ef.giro > 0 && sujeto.local ? this.camAng : sujeto.ang;
    this.camAng += normalizar(angObjetivo - this.camAng) * Math.min(1, dt * 7);
    // Con turbo o estrella la cámara "abre" el lente: sensación de velocidad.
    const rapido = sujeto.ef.turbo > 0 || sujeto.ef.estrella > 0;
    this.zoom = (this.zoom ?? 1) + ((rapido ? 0.84 : 1) - (this.zoom ?? 1)) * Math.min(1, dt * 4);
    const focal = this.focalBase * this.zoom;
    const ca = Math.cos(this.camAng), sa = Math.sin(this.camAng);
    const temblor = this.sacudida * 4;
    const camx = sujeto.x - ca * DIST_CAM + (Math.random() - 0.5) * temblor;
    const camy = sujeto.y - sa * DIST_CAM + (Math.random() - 0.5) * temblor;
    const rx = -sa, ry = ca;

    // Piso (modo 7).
    const tex = this.pista.textura, muro = this.pista.colorMuro, pix = this.pix;
    const [nr, ng, nb] = this.pista.def.colores.niebla;
    for (let y = 0; y < hz; y++) pix.fill(0, y * W, y * W + W);
    for (let y = hz; y < H; y++) {
      const dy = y - hz + 0.5;
      const z = (ALTURA_CAM * focal) / dy;
      const fila = y * W;
      if (z > LEJOS) { pix.fill((255 << 24) | (nb << 16) | (ng << 8) | nr, fila, fila + W); continue; }
      const esc = z / focal;
      let wx = camx + ca * z - rx * (W / 2) * esc;
      let wy = camy + sa * z - ry * (W / 2) * esc;
      const px = rx * esc, py = ry * esc;
      const a = Math.min(0.85, (z / LEJOS) ** 2);
      const b = 1 - a;
      const fr = nr * a, fg = ng * a, fb = nb * a;
      for (let x = 0; x < W; x++) {
        const ix = wx | 0, iy = wy | 0;
        let c = (ix >= 0 && iy >= 0 && ix < MUNDO && iy < MUNDO) ? tex[iy * MUNDO + ix] : muro;
        if (a > 0.02) {
          c = (255 << 24) | (((c >> 16 & 255) * b + fb) << 16) | (((c >> 8 & 255) * b + fg) << 8) | ((c & 255) * b + fr);
        }
        pix[fila + x] = c;
        wx += px; wy += py;
      }
    }
    this.bctx.putImageData(this.img, 0, 0);

    const CW = this.canvas.width, CH = this.canvas.height;
    const k = CW / W;
    const kh = CH / H;
    this.dibujarCielo(ctx, CW, hz * kh, focal * k, ahora);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(this.buf, 0, 0, CW, CH);

    const cam = crearCamara({ x: camx, y: camy, h: ALTURA_CAM, ang: this.camAng, W, hz, focal, k, kh });
    this.cam = cam;
    const escena = [];
    for (const v of this.pista.vallas) {
      const z = cam.profundidad((v.a.x + v.b.x) / 2, (v.a.y + v.b.y) / 2);
      if (z > 8 && z < LEJOS) escena.push({ z, dibujar: () => this.dibujarValla(cam, v, z) });
    }
    for (const d of this.pista.deco) {
      const p = cam.proyectar(d.x, d.y, 0);
      if (!p || p.z < DIST_CAM * 0.8 || p.z > LEJOS) continue;
      escena.push({
        z: p.z,
        dibujar: () => {
          const t = d.tam * p.s;
          if (t < 2) return;
          ctx.fillStyle = 'rgba(20,10,40,0.2)';
          ctx.beginPath(); ctx.ellipse(p.sx, p.sy, t * 0.32, t * 0.09, 0, 0, Math.PI * 2); ctx.fill();
          ctx.drawImage(imagenEmoji(d.emoji), p.sx - t / 2, p.sy - t * 0.93, t, t);
        },
      });
    }
    for (const e of this.esferas) {
      if (e.vuelve > ahora) continue;
      const z = cam.profundidad(e.x, e.y);
      if (z > 6 && z < LEJOS) escena.push({ z, dibujar: () => dibujarEsfera(ctx, cam, e, ahora) });
    }
    for (const pr of this.proyectiles.values()) {
      const z = cam.profundidad(pr.x, pr.y);
      if (z < 6 || z > LEJOS) continue;
      const fn = pr.tipo === 'platano' ? dibujarPlatano : pr.tipo === 'misil' ? dibujarCohete3D : dibujarBolaFuego;
      escena.push({ z, dibujar: () => fn(ctx, cam, pr, ahora) });
    }
    for (const kt of this.karts.values()) {
      const z = cam.profundidad(kt.x, kt.y);
      if (z < 8 || z > LEJOS) continue;
      // Un kart que pasa pegado a la cámara se vuelve medio transparente para no tapar la vista.
      const tapa = kt !== sujeto && z < DIST_CAM * 0.75;
      escena.push({
        z,
        dibujar: () => {
          if (tapa) ctx.globalAlpha = 0.45;
          const pc = dibujarKart3D(ctx, cam, kt, ahora);
          ctx.globalAlpha = 1;
          this.etiqueta(kt, pc);
        },
      });
    }
    escena.push(...this.particulas.elementos(ctx, cam));
    escena.sort((a, b) => b.z - a.z);
    for (const s of escena) s.dibujar();

    this.dibujarRayos(cam, ahora);
    ctx.drawImage(this.vineta, 0, 0);
    if (rapido && sujeto === this.yoKart) this.lineasVelocidad(ctx, CW, CH, hz * kh);
    this.dibujarHud(ctx, CW, CH, ahora);
  }

  dibujarValla(cam, v, z) {
    const ALT = 9;
    const a0 = cam.proyectar(v.a.x, v.a.y, 0), b0 = cam.proyectar(v.b.x, v.b.y, 0);
    const a1 = cam.proyectar(v.a.x, v.a.y, ALT), b1 = cam.proyectar(v.b.x, v.b.y, ALT);
    if (!a0 || !b0 || !a1 || !b1) return;
    const ctx = this.ctx;
    const nx = -(v.b.y - v.a.y), ny = v.b.x - v.a.x;
    const l = Math.hypot(nx, ny) || 1;
    const luz = 0.72 + 0.3 * Math.abs((nx * 0.6 + ny * 0.5) / l);
    const niebla = Math.min(0.85, (z / LEJOS) ** 2);
    const col = mezclar(this.coloresValla[v.color], this.colorNiebla, niebla);
    ctx.beginPath();
    ctx.moveTo(a0.sx, a0.sy); ctx.lineTo(b0.sx, b0.sy); ctx.lineTo(b1.sx, b1.sy); ctx.lineTo(a1.sx, a1.sy);
    ctx.closePath();
    ctx.fillStyle = tono(col, luz);
    ctx.fill();
    ctx.strokeStyle = tono(col, luz * 0.8);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.strokeStyle = tono(mezclar([255, 255, 255], this.colorNiebla, niebla), 1);
    ctx.lineWidth = Math.max(1, a1.s * 1.6);
    ctx.beginPath(); ctx.moveTo(a1.sx, a1.sy); ctx.lineTo(b1.sx, b1.sy); ctx.stroke();
  }

  etiqueta(kt, pc) {
    if (!pc || kt === this.yoKart || pc.z > 650) return;
    const ctx = this.ctx;
    const tam = Math.max(11, Math.min(22, 5 * pc.s));
    ctx.font = `800 ${Math.round(tam)}px "Baloo 2", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,0,50,0.75)'; ctx.lineJoin = 'round';
    const texto = `${kt.bot ? '🤖 ' : ''}${kt.nombre}`;
    const y = pc.sy - 9 * pc.s;
    ctx.strokeText(texto, pc.sx, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(texto, pc.sx, y);
  }

  dibujarCielo(ctx, CW, base, fd, ahora) {
    const c = this.pista.def.colores;
    const cielo = ctx.createLinearGradient(0, 0, 0, base);
    cielo.addColorStop(0, c.cielo[0]);
    cielo.addColorStop(1, c.cielo[1]);
    ctx.fillStyle = cielo;
    ctx.fillRect(0, 0, CW, base + 2);
    // Sol con resplandor.
    const relSol = normalizar(-2.3 - this.camAng);
    if (Math.abs(relSol) < 1.3) {
      const sx = CW / 2 + Math.tan(relSol) * fd, sy = base * 0.32, r = base * 0.11;
      const g = ctx.createRadialGradient(sx, sy, r * 0.3, sx, sy, r * 4);
      g.addColorStop(0, 'rgba(255,250,210,0.9)');
      g.addColorStop(1, 'rgba(255,250,210,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - r * 4, sy - r * 4, r * 8, r * 8);
      ctx.fillStyle = '#fff8d6';
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    }
    // Nubes esponjosas que se mueven despacio.
    for (let i = 0; i < 7; i++) {
      const th = (i / 7) * Math.PI * 2 + ahora / 90000;
      const rel = normalizar(th - this.camAng);
      if (Math.abs(rel) > 1.25) continue;
      const sx = CW / 2 + Math.tan(rel) * fd;
      this.nube(ctx, sx, base * (0.22 + (i % 3) * 0.13), base * (0.12 + (i % 2) * 0.05));
    }
    // Dos capas de cerros: la lejana más pálida.
    const cerro = hexARgb(c.cerros);
    for (const [capa, alto, mezcla] of [[0, 1, 0.45], [1, 0.62, 0]]) {
      const col = mezclar(cerro, this.colorNiebla, mezcla);
      const g = ctx.createLinearGradient(0, base * 0.55, 0, base);
      g.addColorStop(0, tono(col, 1.08));
      g.addColorStop(1, tono(col, 0.82));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, base);
      for (let sx = 0; sx <= CW + 8; sx += 8) {
        const th = this.camAng + Math.atan((sx - CW / 2) / fd);
        const h = (Math.sin(th * 3 + capa * 2) * 0.5 + Math.sin(th * 7 + 1 + capa) * 0.3 + Math.sin(th * 13 + capa * 4) * 0.2 + 1) * 0.5;
        ctx.lineTo(sx, base - (h * 0.18 + 0.03) * base * alto * 1.3);
      }
      ctx.lineTo(CW, base + 2);
      ctx.lineTo(0, base + 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  nube(ctx, x, y, r) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const [dx, dy, f] of [[-1.1, 0.2, 0.7], [-0.4, -0.25, 0.95], [0.5, -0.1, 0.85], [1.2, 0.25, 0.6], [0, 0.3, 0.8]]) {
      ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, r * f, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(200,210,240,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.75, r * 1.7, r * 0.25, 0, 0, Math.PI * 2); ctx.fill();
  }

  dibujarRayos(cam, ahora) {
    if (!this.rayos || ahora > this.rayos.hasta) return;
    const ctx = this.ctx;
    for (const kt of this.karts.values()) {
      if (kt.id === this.rayos.de) continue;
      const p = cam.proyectar(kt.x, kt.y, 14);
      if (!p) continue;
      const puntos = [[p.sx + (Math.random() - 0.5) * 80, 0]];
      for (let i = 1; i < 8; i++) puntos.push([p.sx + (Math.random() - 0.5) * 60 * (1 - i / 8), (p.sy * i) / 8]);
      puntos.push([p.sx, p.sy]);
      for (const [ancho, color] of [[14, 'rgba(255,240,120,0.35)'], [6, 'rgba(255,250,180,0.8)'], [2.5, '#ffffff']]) {
        ctx.strokeStyle = color; ctx.lineWidth = ancho; ctx.lineJoin = 'miter';
        ctx.beginPath(); ctx.moveTo(puntos[0][0], puntos[0][1]);
        for (const q of puntos) ctx.lineTo(q[0], q[1]);
        ctx.stroke();
      }
    }
  }

  lineasVelocidad(ctx, CW, CH, cy) {
    const cx = CW / 2;
    const R = Math.hypot(CW, CH) / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = R * (0.55 + Math.random() * 0.25);
      ctx.lineWidth = 1 + Math.random() * 3;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * (r0 + R * 0.3), cy + Math.sin(a) * (r0 + R * 0.3));
      ctx.stroke();
    }
  }

  // ---------- Efectos ----------
  efectosKart(k, dt) {
    if (!this.cam || Math.hypot(k.x - this.cam.x, k.y - this.cam.y) > 900) return;
    const P = this.particulas, r = Math.random;
    const v = Math.abs(k.vel);
    const atras = (lx, ly, lz) => puntoKart(k, lx, ly, lz);
    const fx = -Math.cos(k.ang), fy = -Math.sin(k.ang);
    if (k.ef.turbo > 0) {
      for (const lado of [-2.5, 2.5]) {
        const [x, y, z] = atras(-14.5, lado, 5.3);
        P.emitir({ tipo: 'fuego', x, y, z, vx: fx * 70 + (r() - 0.5) * 25, vy: fy * 70 + (r() - 0.5) * 25, vz: 8 + r() * 14, vida: 0.22 + r() * 0.15, tam: 3.4, crece: -0.5 });
      }
    } else if (v > 20 && r() < dt * 10) {
      const [x, y, z] = atras(-14.5, r() < 0.5 ? -2.5 : 2.5, 5.3);
      P.emitir({ tipo: 'humo', x, y, z, vx: fx * 20, vy: fy * 20, vz: 10, vida: 0.6, tam: 1.4, crece: 2.5, alfa: 0.45 });
    }
    if (k.sobrePasto && v > 45 && r() < dt * 30) {
      const [x, y, z] = atras(-8, (r() - 0.5) * 18, 1);
      P.emitir({ tipo: 'polvo', x, y, z, vx: fx * 30 + (r() - 0.5) * 30, vy: fy * 30 + (r() - 0.5) * 30, vz: 15 + r() * 15, vida: 0.7, tam: 2.2, crece: 1.8, alfa: 0.7 });
      P.emitir({ tipo: 'confeti', color: this.pista.def.colores.pasto[1], x, y, z, vx: fx * 40 + (r() - 0.5) * 40, vy: fy * 40 + (r() - 0.5) * 40, vz: 30 + r() * 30, g: 140, vida: 0.6, tam: 0.7, giro: r() * 6 });
    }
    if (!k.sobrePasto && v > 170 && Math.abs(k.volante ?? 0) > 0.7 && r() < dt * 30) {
      const [x, y, z] = atras(-7.5, r() < 0.5 ? -9 : 9, 0.5);
      P.emitir({ tipo: 'humo', x, y, z, vx: (r() - 0.5) * 15, vy: (r() - 0.5) * 15, vz: 8, vida: 0.7, tam: 2.4, crece: 2, alfa: 0.55 });
    }
    if (k.ef.estrella > 0 && r() < dt * 45) {
      const [x, y, z] = atras((r() - 0.5) * 28, (r() - 0.5) * 22, 3 + r() * 14);
      P.emitir({ tipo: 'magia', x, y, z, vz: 10, vida: 0.5, tam: 2, crece: -0.6 });
    }
  }

  explosion(x, y, z = 6) {
    const P = this.particulas, r = Math.random;
    for (let i = 0; i < 14; i++) P.emitir({ tipo: 'fuego', x, y, z, vx: (r() - 0.5) * 160, vy: (r() - 0.5) * 160, vz: r() * 120, g: 60, vida: 0.35 + r() * 0.25, tam: 4, crece: -0.3 });
    for (let i = 0; i < 8; i++) P.emitir({ tipo: 'humoOscuro', x, y, z, vx: (r() - 0.5) * 70, vy: (r() - 0.5) * 70, vz: 20 + r() * 40, vida: 0.9 + r() * 0.4, tam: 3, crece: 2.2, alfa: 0.6 });
    for (let i = 0; i < 10; i++) P.emitir({ tipo: 'chispa', x, y, z, vx: (r() - 0.5) * 260, vy: (r() - 0.5) * 260, vz: 60 + r() * 120, g: 260, vida: 0.5, tam: 1.2 });
  }

  confeti(x, y, z = 10, n = 22) {
    const r = Math.random;
    for (let i = 0; i < n; i++) {
      this.particulas.emitir({ tipo: 'confeti', color: COLORES_CONFETI[i % COLORES_CONFETI.length], x, y, z, vx: (r() - 0.5) * 140, vy: (r() - 0.5) * 140, vz: 50 + r() * 90, g: 150, vida: 0.9 + r() * 0.5, tam: 1.1, giro: r() * 6 });
    }
    for (let i = 0; i < 8; i++) this.particulas.emitir({ tipo: 'magia', x, y, z, vx: (r() - 0.5) * 90, vy: (r() - 0.5) * 90, vz: r() * 60, vida: 0.5, tam: 2.2, crece: -0.5 });
  }

  chispas(x, y, z, n = 10) {
    const r = Math.random;
    for (let i = 0; i < n; i++) this.particulas.emitir({ tipo: 'chispa', x, y, z, vx: (r() - 0.5) * 200, vy: (r() - 0.5) * 200, vz: 40 + r() * 100, g: 240, vida: 0.4 + r() * 0.2, tam: 1.3 });
  }

  lanzarPastelVisual(deId) {
    const k = this.karts.get(deId);
    if (!k) return;
    const [x, y, z] = puntoKart(k, 14, 0, 12);
    this.particulas.emitir({ tipo: 'emoji', emoji: '🥧', x, y, z, vx: Math.cos(k.ang) * (Math.abs(k.vel) + 260), vy: Math.sin(k.ang) * (Math.abs(k.vel) + 260), vz: 70, g: 110, vida: 1.1, tam: 5 });
  }

  actualizarBoton(ahora) {
    if (!this.botonUsar) return;
    const yo = this.yoKart;
    let estado = 'vacio', emoji = '🎁';
    if (yo?.ruleta > 0) { estado = 'girando'; emoji = LISTA_EMOJIS[Math.floor(ahora / 70) % LISTA_EMOJIS.length]; }
    else if (yo?.item) { estado = 'listo'; emoji = INFO_ITEMS[yo.item].emoji; }
    const clave = estado + emoji;
    if (clave === this.itemMostrado) return;
    this.itemMostrado = clave;
    this.botonUsar.dataset.estado = estado;
    const icono = this.botonUsar.querySelector('.icono');
    if (icono) icono.textContent = emoji;
  }

  dibujarHud(ctx, CW, CH, ahora) {
    const u = Math.min(CW, CH) / 100; // unidad relativa
    const yo = this.yoKart;
    // Pastelazos en la cara.
    for (const s of this.splats) {
      ctx.globalAlpha = Math.min(1, s.vida / 1.2) * 0.95;
      ctx.fillStyle = s.tono;
      ctx.beginPath(); ctx.arc(s.x * CW, s.y * CH, s.r * Math.min(CW, CH) * 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(s.x * CW + s.r * CW * 0.6, s.y * CH + s.r * CH * 0.5, s.r * Math.min(CW, CH) * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (this.destello > 0) {
      ctx.fillStyle = `rgba(255,255,200,${this.destello * 0.7})`;
      ctx.fillRect(0, 0, CW, CH);
    }

    ctx.textBaseline = 'top';
    const texto = (t, x, y, tam, alin = 'left', color = '#fff') => {
      ctx.font = `800 ${Math.round(tam)}px "Baloo 2", system-ui, sans-serif`;
      ctx.textAlign = alin;
      ctx.textBaseline = 'alphabetic';
      ctx.lineWidth = Math.max(3, tam / 7);
      ctx.strokeStyle = 'rgba(20,0,60,0.85)';
      ctx.lineJoin = 'round';
      const yb = y + tam * 0.82; // y = borde superior del texto
      ctx.strokeText(t, x, yb);
      ctx.fillStyle = color;
      ctx.fillText(t, x, yb);
    };

    if (yo) {
      // Caja del ítem.
      const caja = 15 * u, m = 3 * u;
      const listo = yo.item && !yo.ruleta;
      if (listo) {
        ctx.save();
        ctx.shadowColor = `hsl(${(ahora / 4) % 360},100%,65%)`;
        ctx.shadowBlur = 4 * u * (0.7 + 0.3 * Math.sin(ahora / 120));
      }
      const fondo = ctx.createLinearGradient(0, m, 0, m + caja);
      fondo.addColorStop(0, 'rgba(255,255,255,0.95)');
      fondo.addColorStop(1, 'rgba(225,210,255,0.95)');
      ctx.fillStyle = fondo;
      redondeado(ctx, m, m, caja, caja, 3 * u); ctx.fill();
      if (listo) ctx.restore();
      ctx.lineWidth = u * 0.8; ctx.strokeStyle = '#2a1052'; ctx.stroke();
      let em = '';
      if (yo.ruleta > 0) em = LISTA_EMOJIS[Math.floor(ahora / 70) % LISTA_EMOJIS.length];
      else if (yo.item) em = INFO_ITEMS[yo.item].emoji;
      if (em) {
        const t = caja * (listo ? 0.82 + Math.sin(ahora / 150) * 0.04 : 0.78);
        ctx.drawImage(imagenEmoji(em, true), m + caja / 2 - t / 2, m + caja / 2 - t / 2, t, t);
      }

      // Lugar y vuelta.
      const lugarColor = ['#ffd700', '#e0e0e0', '#ff9f5a'][yo.lugar - 1] ?? '#ffffff';
      texto(ordinal(yo.lugar), CW - m, m, 15 * u, 'right', lugarColor);
      texto(`de ${this.karts.size}`, CW - m, m + 15 * u, 4 * u, 'right');
      const vuelta = Math.min(VUELTAS, Math.max(1, yo.vuelta + 1));
      texto(`Vuelta ${vuelta}/${VUELTAS}`, m + caja + 3 * u, m, 5.5 * u);
      const tCarrera = this.fase === 'cuenta' ? 0 : yo.terminado ? yo.tiempo : (ahora - this.inicio) / 1000;
      texto(`⏱ ${formatoTiempo(tCarrera)}`, m + caja + 3 * u, m + 6.5 * u, 4.2 * u);
      // Velocímetro sencillo.
      const vel = Math.max(0, Math.round(Math.abs(yo.vel) / 3));
      const escCss = CW / (this.canvas.clientWidth || CW);
      const libre = (document.body.classList.contains('es-tactil') ? 170 : 130) * escCss;
      texto(`${vel} km/h`, CW - m, CH - m - 6 * u - libre, 5 * u, 'right', yo.ef.turbo ? '#ffdd33' : '#ffffff');
    }

    // Minimapa.
    const tam = Math.min(22 * u, 170);
    const tactil = document.body.classList.contains('es-tactil');
    const extraAbajo = tactil ? 170 * (CW / (this.canvas.clientWidth || CW)) : 0; // dejar libre la zona de botones
    const mx = 3 * u, my = CH - tam - 3 * u - extraAbajo;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(this.pista.mini, mx, my, tam, tam);
    ctx.globalAlpha = 1;
    for (const kt of this.karts.values()) {
      const x = mx + (kt.x / MUNDO) * tam, y = my + (kt.y / MUNDO) * tam;
      ctx.fillStyle = kt.pj.color;
      ctx.strokeStyle = kt === yo ? '#fff' : '#000';
      ctx.lineWidth = kt === yo ? 3 : 1.5;
      ctx.beginPath(); ctx.arc(x, y, kt === yo ? tam * 0.045 : tam * 0.032, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    // Lista de posiciones a la derecha (top 10, chiquita).
    if (this.orden && CW > 500) {
      const fila = 4.2 * u;
      let y = 24 * u;
      for (const kt of this.orden) {
        const resalta = kt === yo;
        ctx.fillStyle = resalta ? 'rgba(255,61,154,0.85)' : 'rgba(30,0,70,0.45)';
        redondeado(ctx, CW - 3 * u - 30 * u, y, 30 * u, fila - 0.6 * u, u); ctx.fill();
        ctx.font = `700 ${Math.round(fila * 0.62)}px "Baloo 2", system-ui, sans-serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
        ctx.fillText(`${kt.lugar}. ${kt.pj.emoji} ${kt.nombre}${kt.terminado ? ' 🏁' : ''}`.slice(0, 26), CW - 32 * u, y + fila * 0.45);
        y += fila;
      }
      ctx.textBaseline = 'top';
    }

    // Mensajes grandes al centro.
    for (const msg of this.mensajes) {
      const vida = (ahora - msg.desde) / 1000;
      const rebote = 1 + Math.max(0, 0.4 - vida) * 1.2;
      const tamMsg = (msg.clase === 'cuenta' ? 24 : msg.clase === 'grande' ? 11 : 8) * u * rebote;
      const color = msg.clase === 'mal' ? '#ff6b6b' : msg.clase === 'cuenta' ? '#ffe14d' : '#ffffff';
      const yMsg = msg.clase === 'mal' ? 0.55 : msg.clase === 'titulo' || msg.clase === 'espectador' ? 0.14 : 0.3;
      texto(msg.texto, CW / 2, CH * yMsg - tamMsg / 2, tamMsg, 'center', color);
    }
  }
}

function redondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
