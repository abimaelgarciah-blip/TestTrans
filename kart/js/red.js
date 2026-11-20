// Transporte de mensajes entre jugadores de una sala. Tres modos con la misma interfaz:
//   'servidor' → WebSocket al servidor de la oficina (node kart/servidor.js)
//   'supabase' → Supabase Realtime (por internet, sitio en GitHub Pages)
//   'local'    → BroadcastChannel: pestañas del mismo navegador (pruebas y modo práctica)
import config from '../../config.js';
import { Malla, hayWebRTC } from './p2p.js';

export async function detectarModo() {
  const forzado = new URLSearchParams(location.search).get('red') ?? window.KART_RED;
  if (['servidor', 'supabase', 'local'].includes(forzado)) return forzado;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch('/api/estado', { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok && (await r.json()).kart) return 'servidor';
  } catch { /* no hay servidor propio */ }
  if (config.supabase?.url && config.supabase?.claveAnonima) return 'supabase';
  return 'local';
}

export const NOMBRE_MODO = {
  servidor: '🖥️ Servidor de la oficina',
  supabase: '🌐 Internet (Supabase)',
  local: '🧪 Solo este navegador',
};

/**
 * Conecta a una sala. Devuelve { enviar(tipo, datos), cerrar(), estadoPar?(id) }. alMensaje(tipo, datos, de).
 * Por internet (Supabase) los jugadores se conectan directo entre sí (WebRTC) y Supabase solo los presenta;
 * así una sala de 10 cabe de sobra en el plan gratuito. ?p2p=1 lo fuerza en otros modos (pruebas) y ?p2p=0 lo apaga.
 */
export async function conectar(modo, sala, yo, alMensaje) {
  const pedido = new URLSearchParams(location.search).get('p2p');
  const usarMalla = hayWebRTC() && (pedido === '1' || (pedido !== '0' && modo === 'supabase'));
  if (!usarMalla) return conectarBase(modo, sala, yo, alMensaje);
  let malla = null;
  const pendientes = [];
  const base = await conectarBase(modo, sala, yo, (t, d, de) => (malla ? malla.recibirBase(t, d, de) : pendientes.push([t, d, de])));
  malla = new Malla(base, yo, alMensaje);
  for (const m of pendientes) malla.recibirBase(...m);
  malla.iniciar();
  return malla;
}

async function conectarBase(modo, sala, yo, alMensaje) {
  const sobre = (tipo, datos) => ({ t: tipo, de: yo, d: datos });
  const entregar = (m) => { if (m && m.de !== yo) alMensaje(m.t, m.d, m.de); };

  if (modo === 'local') {
    const canal = new BroadcastChannel(`kart-${sala}`);
    canal.onmessage = (ev) => entregar(ev.data);
    return { enviar: (t, d) => canal.postMessage(sobre(t, d)), cerrar: () => canal.close() };
  }

  if (modo === 'servidor') {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws?sala=${encodeURIComponent(sala)}`);
    await new Promise((ok, mal) => {
      ws.onopen = ok;
      ws.onerror = () => mal(new Error('No se pudo conectar con el servidor de la oficina.'));
    });
    ws.onmessage = (ev) => { try { entregar(JSON.parse(ev.data)); } catch { /* ignorar */ } };
    return {
      enviar: (t, d) => { if (ws.readyState === 1) ws.send(JSON.stringify(sobre(t, d))); },
      cerrar: () => ws.close(),
    };
  }

  // Supabase Realtime (broadcast).
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const cliente = createClient(config.supabase.url, config.supabase.claveAnonima, {
    realtime: { params: { eventsPerSecond: 20 } },
  });
  const canal = cliente.channel(`kart-${sala}`, { config: { broadcast: { self: false, ack: false } } });
  canal.on('broadcast', { event: 'm' }, ({ payload }) => entregar(payload));
  await new Promise((ok, mal) => {
    const t = setTimeout(() => mal(new Error('Supabase no respondió. ¿El proyecto está pausado?')), 10000);
    canal.subscribe((estado) => {
      if (estado === 'SUBSCRIBED') { clearTimeout(t); ok(); }
      if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') { clearTimeout(t); mal(new Error('No se pudo abrir la sala en Supabase.')); }
    });
  });
  return {
    enviar: (t, d) => canal.send({ type: 'broadcast', event: 'm', payload: sobre(t, d) }),
    cerrar: () => { cliente.removeChannel(canal); },
  };
}
