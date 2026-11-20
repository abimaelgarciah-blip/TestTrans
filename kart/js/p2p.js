// Conexión directa entre jugadores (WebRTC) para no gastar mensajes de Supabase.
//
// El transporte "base" (Supabase, o el que sea) solo se usa para:
//   1. presentarse al entrar a la sala (__hola),
//   2. intercambiar la descripción de conexión de cada par (__sdp),
//   3. respaldo (__relay) para los jugadores con los que no se logró conexión directa.
// Todo lo demás (posiciones a 7 por segundo, poderes, resultados) viaja directo entre equipos.
//
// Cada par de jugadores abre dos canales: 'r' (confiable y en orden, para eventos) y
// 'u' (sin reintentos, para posiciones: si una se pierde, la siguiente llega enseguida).
//
// Puente: si alguien no logra conexión directa con otro, no todos le reenvían sus posiciones por
// Supabase (eso multiplicaría los mensajes). El jugador con más conexiones directas hace de puente:
// junta las posiciones de todos y se las manda en un solo paquete (directo si puede, o por Supabase a
// ~2 por segundo). Quien está aislado solo le manda sus posiciones al puente. Las posiciones son
// mensajes 'e' con una lista de [idKart, ...]; el resto de los eventos son poco frecuentes.

const SERVIDORES_ICE = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
const RAPIDOS = new Set(['e']);           // mensajes frecuentes que pueden perderse
const ESPERA_ICE_MS = 2500;               // tiempo para juntar candidatos antes de mandar la oferta
const PLAZO_CONEXION_MS = 12000;          // si no conecta en este tiempo, se usa el respaldo
const INTERVALO_HOLA_MS = 20000;          // presentación periódica (descubre a quien se perdió el primer saludo)
const RESPALDO_RAPIDO_MS = 500;           // en respaldo, las posiciones bajan a 2 por segundo
const MAX_REINTENTOS = 3;
const VIGENCIA_MS = 1500;                 // posiciones guardadas que el puente todavía reenvía
// Latidos que se repiten seguido: por respaldo se mandan con menos frecuencia (salvo a recién llegados).
const LATIDOS_LENTOS = { hola: 8000, sala: 8000 };
const RECIEN_LLEGADO_MS = 15000;

export const hayWebRTC = () => typeof RTCPeerConnection !== 'undefined';

async function esperarIce(pc) {
  if (pc.iceGatheringState === 'complete') return;
  await new Promise((ok) => {
    const t = setTimeout(ok, ESPERA_ICE_MS);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(t); ok(); }
    });
  });
}

export class Malla {
  /**
   * base: { enviar(tipo, datos), cerrar() } — transporte de señalización (difusión a toda la sala).
   * alMensaje(tipo, datos, de) — recibe los mensajes del juego, lleguen directo o por respaldo.
   */
  constructor(base, yo, alMensaje) {
    this.base = base;
    this.yo = yo;
    this.alMensaje = alMensaje;
    this.pares = new Map();
    this.ultimoRespaldoRapido = 0;
    this.ultimoLatido = {};
    this.posiciones = new Map();   // idKart → { e, de, t }: lo último que se sabe de cada kart
    this.ultimoHola = 0;
    this.cerrada = false;
    this.estadisticas = { directos: 0, respaldo: 0, senal: 0 };
  }

  iniciar() {
    this.saludar();
    this.reloj = setInterval(() => this.revisar(), 2000);
  }

  saludar() {
    this.ultimoHola = performance.now();
    this.senal('__hola', {});
  }

  senal(tipo, datos) {
    this.estadisticas.senal += 1;
    this.base.enviar(tipo, datos);
  }

  // ---------- Envío ----------
  enviar(tipo, datos) {
    if (this.cerrada) return;
    if (RAPIDOS.has(tipo)) { this.enviarPosiciones(tipo, datos); return; }
    if (tipo === 'hola') datos = { ...datos, __p2p: { n: this.directos(), f: this.sinDirecto() } };
    const texto = JSON.stringify({ t: tipo, d: datos });
    const sinCanal = [];
    for (const par of this.pares.values()) {
      if (par.r && par.r.readyState === 'open') {
        try { par.r.send(texto); this.estadisticas.directos += 1; continue; } catch { /* usar respaldo */ }
      }
      sinCanal.push(par);
    }
    if (this.pares.size === 0) {
      // Todavía no conocemos a nadie (acabamos de entrar): avisar a toda la sala.
      this.relevo('*', tipo, datos);
      return;
    }
    if (!sinCanal.length) return;
    const ahora = performance.now();
    const espera = LATIDOS_LENTOS[tipo];
    if (espera) {
      const hayNuevo = sinCanal.some((p) => ahora - p.conocido < RECIEN_LLEGADO_MS);
      if (!hayNuevo && ahora - (this.ultimoLatido[tipo] ?? 0) < espera) return;
      this.ultimoLatido[tipo] = ahora;
    }
    this.relevo(sinCanal.map((p) => p.id), tipo, datos);
  }

  enviarPosiciones(tipo, lista) {
    const ahora = performance.now();
    for (const e of lista) this.posiciones.set(e[0], { e, de: this.yo, t: ahora });
    const texto = JSON.stringify({ t: tipo, d: lista });
    const sinCanal = [];
    for (const par of this.pares.values()) {
      if (par.u && par.u.readyState === 'open') {
        if (par.u.bufferedAmount < 64000) { try { par.u.send(texto); this.estadisticas.directos += 1; } catch { /* siguiente */ } }
      } else sinCanal.push(par.id);
    }
    const puente = this.puente();
    const tocaRespaldo = ahora - this.ultimoRespaldoRapido >= RESPALDO_RAPIDO_MS;
    if (puente === this.yo) {
      // Directo y gratis: a quien le falta conexión con alguien, le pasamos las posiciones de ese alguien.
      for (const par of this.pares.values()) {
        if (!par.faltan?.length || !par.u || par.u.readyState !== 'open') continue;
        const paquete = this.paquete((de) => par.faltan.includes(de), ahora);
        if (paquete.length) { try { par.u.send(JSON.stringify({ t: '__eb', d: paquete })); this.estadisticas.directos += 1; } catch { /* nada */ } }
      }
      // Por Supabase, un solo paquete con todo para los que no tienen ninguna conexión con el puente.
      if (sinCanal.length && tocaRespaldo) {
        this.ultimoRespaldoRapido = ahora;
        this.relevo(sinCanal, '__eb', this.paquete(() => true, ahora));
      }
    } else if (sinCanal.includes(puente) && tocaRespaldo) {
      this.ultimoRespaldoRapido = ahora;
      this.relevo([puente], tipo, lista);
    }
  }

  paquete(filtro, ahora) {
    const l = [];
    for (const p of this.posiciones.values()) if (ahora - p.t < VIGENCIA_MS && filtro(p.de)) l.push([p.de, p.e]);
    return l;
  }

  directos() {
    let n = 0;
    for (const par of this.pares.values()) if (par.r?.readyState === 'open') n++;
    return n;
  }

  sinDirecto() {
    return [...this.pares.values()].filter((p) => p.r?.readyState !== 'open').map((p) => p.id);
  }

  // El puente es quien tiene más conexiones directas (empate: el id menor). Todos llegan a la misma cuenta.
  puente() {
    let mejor = this.yo, n = this.directos();
    for (const par of this.pares.values()) {
      const m = par.n ?? 0;
      if (m > n || (m === n && par.id < mejor)) { mejor = par.id; n = m; }
    }
    return mejor;
  }

  relevo(para, tipo, datos) {
    this.estadisticas.respaldo += 1;
    this.base.enviar('__relay', { para, t: tipo, d: datos });
  }

  // ---------- Recepción por el transporte base ----------
  recibirBase(tipo, d, de) {
    if (this.cerrada || de === this.yo) return;
    if (tipo === '__sdp') { if (d?.para === this.yo) this.recibirSdp(de, d); return; }
    const nuevo = !this.pares.has(de);
    if (nuevo) this.conocer(de);
    if (tipo === '__hola') {
      // Contestar a quien acaba de llegar para que también nos conozca (sin repetir de más).
      if (nuevo && performance.now() - this.ultimoHola > 1500) this.saludar();
      const par = this.pares.get(de);
      if (par && par.estado === 'respaldo' && this.yo < de && par.intentos < MAX_REINTENTOS) this.ofrecer(par);
      return;
    }
    if (tipo === '__relay') {
      const para = d?.para;
      if (para === '*' || (Array.isArray(para) && para.includes(this.yo))) this.entregar(d.t, d.d, de);
    }
  }

  entregar(tipo, datos, de) {
    if (tipo === 'e' && Array.isArray(datos)) {
      const ahora = performance.now();
      for (const e of datos) if (Array.isArray(e)) this.posiciones.set(e[0], { e, de, t: ahora });
    } else if (tipo === '__eb') {
      // Paquete del puente: quedarse solo con lo que no nos llega directo.
      if (!Array.isArray(datos)) return;
      const utiles = datos.filter((x) => Array.isArray(x) && x[0] !== this.yo && this.estadoPar(x[0]) !== 'directo').map((x) => x[1]);
      if (utiles.length) this.alMensaje('e', utiles, de);
      return;
    } else if (tipo === 'hola' && datos?.__p2p) {
      const par = this.pares.get(de);
      if (par) {
        par.n = Number(datos.__p2p.n) || 0;
        par.faltan = Array.isArray(datos.__p2p.f) ? datos.__p2p.f.filter((x) => x !== this.yo) : [];
      }
    }
    this.alMensaje(tipo, datos, de);
    if (tipo === 'adios') this.olvidar(de);
  }

  // ---------- Pares ----------
  conocer(id) {
    const par = { id, pc: null, r: null, u: null, estado: 'conectando', desde: performance.now(), conocido: performance.now(), intentos: 0 };
    this.pares.set(id, par);
    // Para no chocar, siempre ofrece la conexión el de id menor.
    if (this.yo < id) this.ofrecer(par);
    return par;
  }

  olvidar(id) {
    const par = this.pares.get(id);
    if (!par) return;
    try { par.pc?.close(); } catch { /* nada */ }
    this.pares.delete(id);
  }

  nuevaConexion(par) {
    try { par.pc?.close(); } catch { /* nada */ }
    const pc = new RTCPeerConnection({ iceServers: SERVIDORES_ICE });
    par.pc = pc;
    par.r = null;
    par.u = null;
    par.estado = 'conectando';
    par.desde = performance.now();
    pc.ondatachannel = (ev) => this.prepararCanal(par, ev.channel);
    pc.onconnectionstatechange = () => {
      if (par.pc !== pc) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') par.estado = 'respaldo';
    };
    return pc;
  }

  prepararCanal(par, canal) {
    if (canal.label === 'u') par.u = canal; else par.r = canal;
    canal.onopen = () => { if (par.r?.readyState === 'open') par.estado = 'directo'; };
    canal.onclose = () => { if (this.pares.get(par.id) === par && par.r === canal) par.estado = 'respaldo'; };
    canal.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m && typeof m.t === 'string') this.entregar(m.t, m.d, par.id);
    };
  }

  async ofrecer(par) {
    par.intentos += 1;
    try {
      const pc = this.nuevaConexion(par);
      this.prepararCanal(par, pc.createDataChannel('r', { ordered: true }));
      this.prepararCanal(par, pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 }));
      await pc.setLocalDescription(await pc.createOffer());
      await esperarIce(pc);
      if (par.pc !== pc || this.cerrada) return;
      this.senal('__sdp', { para: par.id, tipo: 'offer', sdp: pc.localDescription.sdp });
    } catch { par.estado = 'respaldo'; }
  }

  async recibirSdp(de, d) {
    try {
      if (d.tipo === 'offer') {
        const par = this.pares.get(de) ?? this.conocerSinOfrecer(de);
        const pc = this.nuevaConexion(par);
        await pc.setRemoteDescription({ type: 'offer', sdp: d.sdp });
        await pc.setLocalDescription(await pc.createAnswer());
        await esperarIce(pc);
        if (par.pc !== pc || this.cerrada) return;
        this.senal('__sdp', { para: de, tipo: 'answer', sdp: pc.localDescription.sdp });
      } else if (d.tipo === 'answer') {
        const par = this.pares.get(de);
        if (par?.pc && par.pc.signalingState === 'have-local-offer') await par.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
      }
    } catch {
      const par = this.pares.get(de);
      if (par) par.estado = 'respaldo';
    }
  }

  conocerSinOfrecer(id) {
    const par = { id, pc: null, r: null, u: null, estado: 'conectando', desde: performance.now(), conocido: performance.now(), intentos: 0 };
    this.pares.set(id, par);
    return par;
  }

  revisar() {
    if (this.cerrada) return;
    const ahora = performance.now();
    if (ahora - this.ultimoHola > INTERVALO_HOLA_MS) this.saludar();
    for (const par of this.pares.values()) {
      if (par.estado === 'conectando' && ahora - par.desde > PLAZO_CONEXION_MS) par.estado = 'respaldo';
      // Reintentar de vez en cuando (por ejemplo, si alguien cambió de red).
      if (par.estado === 'respaldo' && this.yo < par.id && par.intentos < MAX_REINTENTOS && ahora - par.desde > 20000) this.ofrecer(par);
    }
  }

  // 'directo' | 'conectando' | 'respaldo' | null
  estadoPar(id) {
    const par = this.pares.get(id);
    if (!par) return null;
    if (par.r?.readyState === 'open') return 'directo';
    return par.estado === 'directo' ? 'respaldo' : par.estado;
  }

  cerrar() {
    this.cerrada = true;
    clearInterval(this.reloj);
    for (const par of this.pares.values()) { try { par.pc?.close(); } catch { /* nada */ } }
    this.pares.clear();
    this.base.cerrar();
  }
}
