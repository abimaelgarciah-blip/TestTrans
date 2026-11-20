// Guarda cada carrera y lee el historial. Siempre deja copia en este navegador.
import config from '../../config.js';

const CLAVE = 'kart-historial';
const TABLA = 'kart_carreras';

function leerLocal() {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? '[]'); } catch { return []; }
}
function guardarLocal(registro) {
  try {
    const lista = leerLocal().filter((r) => !(r.gp_id === registro.gp_id && r.numero === registro.numero));
    lista.unshift(registro);
    localStorage.setItem(CLAVE, JSON.stringify(lista.slice(0, 120)));
  } catch { /* sin almacenamiento */ }
}

function cabecerasSupabase() {
  const k = config.supabase.claveAnonima;
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' };
}

/** registro: { gp_id, sala, numero, pista, resultados, totales } → 'compartido' | 'local' */
export async function guardarCarrera(modo, registro) {
  const r = { ...registro, creado: new Date().toISOString() };
  guardarLocal(r);
  try {
    if (modo === 'servidor') {
      const resp = await fetch('/api/carreras', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) });
      if (resp.ok) return 'compartido';
    } else if (modo === 'supabase') {
      const resp = await fetch(`${config.supabase.url}/rest/v1/${TABLA}`, {
        method: 'POST',
        headers: { ...cabecerasSupabase(), Prefer: 'return=minimal' },
        body: JSON.stringify({ gp_id: r.gp_id, sala: r.sala, numero: r.numero, pista: r.pista, resultados: r.resultados, totales: r.totales }),
      });
      if (resp.ok) return 'compartido';
    }
  } catch { /* se queda en local */ }
  return 'local';
}

/** Devuelve una lista de Grandes Premios: { gp_id, sala, fecha, carreras, totales } (más reciente primero). */
export async function leerHistorial(modo) {
  let registros = [];
  try {
    if (modo === 'servidor') {
      const resp = await fetch('/api/carreras');
      if (resp.ok) registros = await resp.json();
    } else if (modo === 'supabase') {
      const resp = await fetch(`${config.supabase.url}/rest/v1/${TABLA}?select=*&order=creado.desc&limit=150`, { headers: cabecerasSupabase() });
      if (resp.ok) registros = await resp.json();
    }
  } catch { /* usar local */ }
  const vistos = new Set(registros.map((r) => `${r.gp_id}-${r.numero}`));
  for (const r of leerLocal()) if (!vistos.has(`${r.gp_id}-${r.numero}`)) registros.push(r);
  return agrupar(registros);
}

export function agrupar(registros) {
  const gps = new Map();
  for (const r of registros) {
    const g = gps.get(r.gp_id) ?? { gp_id: r.gp_id, sala: r.sala, fecha: r.creado, carreras: 0, totales: [], ultima: 0 };
    g.carreras = Math.max(g.carreras, r.numero);
    if (r.numero >= g.ultima) { g.ultima = r.numero; g.totales = r.totales ?? []; }
    if (r.creado > g.fecha) g.fecha = r.creado;
    gps.set(r.gp_id, g);
  }
  return [...gps.values()].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}
