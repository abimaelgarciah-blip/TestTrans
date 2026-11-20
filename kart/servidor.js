// Servidor de la oficina para Kart Fiesta. Sin dependencias: solo Node 20+.
//   node kart/servidor.js            (puerto 8080)
//   PUERTO=3000 node kart/servidor.js
// Sirve el juego, retransmite los mensajes de cada sala por WebSocket y guarda las carreras
// en kart/datos/carreras.json. Todos deben estar en la misma red (Wi-Fi de la oficina o de casa).
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const ARCHIVO_DATOS = path.join(AQUI, 'datos', 'carreras.json');
const PUERTO = Number(process.env.PUERTO || process.env.PORT || 8080);
const MAX_MENSAJE = 64 * 1024;

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon',
};

// ---------- Datos ----------
let cola = Promise.resolve();
async function leerCarreras() {
  try { return JSON.parse(await fs.readFile(ARCHIVO_DATOS, 'utf8')); } catch { return []; }
}
function guardarCarrera(registro) {
  cola = cola.then(async () => {
    const lista = (await leerCarreras()).filter((r) => !(r.gp_id === registro.gp_id && r.numero === registro.numero));
    lista.unshift(registro);
    await fs.mkdir(path.dirname(ARCHIVO_DATOS), { recursive: true });
    await fs.writeFile(ARCHIVO_DATOS, JSON.stringify(lista.slice(0, 1000), null, 1));
  });
  return cola;
}

export function registroValido(r) {
  return r && typeof r.gp_id === 'string' && r.gp_id.length <= 60
    && Number.isInteger(r.numero) && r.numero >= 1 && r.numero <= 3
    && typeof r.pista === 'string' && r.pista.length <= 30
    && Array.isArray(r.resultados) && r.resultados.length <= 10
    && Array.isArray(r.totales) && r.totales.length <= 10;
}

function leerCuerpo(req, limite = MAX_MENSAJE) {
  return new Promise((ok, mal) => {
    let datos = '';
    req.on('data', (c) => { datos += c; if (datos.length > limite) { mal(new Error('muy grande')); req.destroy(); } });
    req.on('end', () => ok(datos));
    req.on('error', mal);
  });
}

// ---------- HTTP ----------
const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/estado') return json(res, 200, { kart: true });
    if (url.pathname === '/api/carreras' && req.method === 'GET') return json(res, 200, (await leerCarreras()).slice(0, 150));
    if (url.pathname === '/api/carreras' && req.method === 'POST') {
      const r = JSON.parse(await leerCuerpo(req));
      if (!registroValido(r)) return json(res, 400, { error: 'registro inválido' });
      await guardarCarrera({ gp_id: r.gp_id, sala: String(r.sala ?? '').slice(0, 10), numero: r.numero, pista: r.pista, resultados: r.resultados, totales: r.totales, creado: new Date().toISOString() });
      return json(res, 201, { ok: true });
    }
    if (url.pathname === '/') { res.writeHead(302, { Location: '/kart/' }); return res.end(); }
    // Archivos estáticos (solo lo que el juego necesita).
    let ruta = decodeURIComponent(url.pathname);
    if (ruta.endsWith('/')) ruta += 'index.html';
    const archivo = path.resolve(RAIZ, `.${ruta}`);
    const permitido = (archivo.startsWith(path.join(RAIZ, 'kart') + path.sep) && !archivo.includes(`${path.sep}datos${path.sep}`)) || archivo === path.join(RAIZ, 'config.js');
    if (!permitido) { res.writeHead(404); return res.end('No encontrado'); }
    const contenido = await fs.readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(contenido);
  } catch {
    res.writeHead(404); res.end('No encontrado');
  }
});

function json(res, codigo, obj) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// ---------- WebSocket mínimo (RFC 6455, solo texto) ----------
const salas = new Map(); // código → Set de sockets

servidor.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://localhost');
  const clave = req.headers['sec-websocket-key'];
  const sala = String(url.searchParams.get('sala') ?? '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 60);
  if (url.pathname !== '/ws' || !clave || !sala) { socket.destroy(); return; }
  const acepta = crypto.createHash('sha1').update(clave + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acepta}\r\n\r\n`);
  socket.setNoDelay(true);
  if (!salas.has(sala)) salas.set(sala, new Set());
  const miembros = salas.get(sala);
  miembros.add(socket);

  let pendiente = Buffer.alloc(0);
  socket.on('data', (trozo) => {
    pendiente = Buffer.concat([pendiente, trozo]);
    for (;;) {
      const marco = leerMarco(pendiente);
      if (!marco) break;
      pendiente = pendiente.subarray(marco.largoTotal);
      if (marco.op === 0x8) { socket.end(crearMarco(Buffer.alloc(0), 0x8)); return; }
      if (marco.op === 0x9) { socket.write(crearMarco(marco.datos, 0xA)); continue; }
      if (marco.op !== 0x1 || marco.datos.length > MAX_MENSAJE) continue;
      const salida = crearMarco(marco.datos, 0x1);
      for (const otro of miembros) if (otro !== socket && !otro.destroyed) otro.write(salida);
    }
    if (pendiente.length > MAX_MENSAJE * 2) socket.destroy();
  });
  const salir = () => {
    miembros.delete(socket);
    if (!miembros.size) salas.delete(sala);
  };
  socket.on('close', salir);
  socket.on('error', salir);
});

export function leerMarco(b) {
  if (b.length < 2) return null;
  const op = b[0] & 0x0f;
  const enmascarado = (b[1] & 0x80) !== 0;
  let largo = b[1] & 0x7f;
  let pos = 2;
  if (largo === 126) { if (b.length < 4) return null; largo = b.readUInt16BE(2); pos = 4; }
  else if (largo === 127) { if (b.length < 10) return null; largo = Number(b.readBigUInt64BE(2)); pos = 10; }
  const mascara = enmascarado ? b.subarray(pos, pos + 4) : null;
  if (enmascarado) pos += 4;
  if (b.length < pos + largo) return null;
  const datos = Buffer.from(b.subarray(pos, pos + largo));
  if (mascara) for (let i = 0; i < datos.length; i++) datos[i] ^= mascara[i & 3];
  return { op, datos, largoTotal: pos + largo };
}

export function crearMarco(datos, op) {
  const n = datos.length;
  let cabecera;
  if (n < 126) cabecera = Buffer.from([0x80 | op, n]);
  else if (n < 65536) { cabecera = Buffer.alloc(4); cabecera[0] = 0x80 | op; cabecera[1] = 126; cabecera.writeUInt16BE(n, 2); }
  else { cabecera = Buffer.alloc(10); cabecera[0] = 0x80 | op; cabecera[1] = 127; cabecera.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([cabecera, datos]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  servidor.listen(PUERTO, () => {
    console.log('\n🏁  Kart Fiesta listo. Pide a todos que abran en su navegador:\n');
    console.log(`    http://localhost:${PUERTO}/kart/   (en esta computadora)`);
    for (const lista of Object.values(os.networkInterfaces())) {
      for (const d of lista ?? []) if (d.family === 'IPv4' && !d.internal) console.log(`    http://${d.address}:${PUERTO}/kart/`);
    }
    console.log('\nLas carreras se guardan en kart/datos/carreras.json. Ctrl+C para apagar.\n');
  });
}

export { servidor };
