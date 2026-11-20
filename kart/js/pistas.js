// Definición y construcción de las pistas. Cada carrera del Gran Premio usa una pista distinta.
export const MUNDO = 2048;

export const PISTAS = [
  {
    id: 'pradera', nombre: 'Pradera Feliz', emoji: '🌻', ancho: 120,
    puntos: [[350, 1500], [350, 600], [550, 330], [900, 330], [1050, 600], [1150, 850], [1400, 850], [1550, 550], [1750, 450], [1820, 800], [1750, 1300], [1500, 1650], [1000, 1750], [600, 1750]],
    colores: { pasto: ['#5cc84a', '#4fba3f'], camino: '#6d6d80', linea: '#ffffff', bordillo: ['#ff3b3b', '#ffffff'], muro: '#2e7d32', cielo: ['#3aa6ff', '#c4ecff'], cerros: '#3f9e4c', niebla: [196, 236, 255] },
    deco: ['🌳', '🌷', '🌻', '🍄', '🌳', '🌲'],
  },
  {
    id: 'playa', nombre: 'Playa Pirata', emoji: '🏝️', ancho: 115,
    puntos: [[300, 1000], [350, 500], [700, 300], [1000, 550], [1300, 300], [1700, 350], [1800, 750], [1450, 1000], [1750, 1300], [1650, 1750], [1100, 1650], [800, 1800], [400, 1650]],
    colores: { pasto: ['#f4d58d', '#ebc874'], camino: '#7f8796', linea: '#fff2a8', bordillo: ['#ffcc00', '#1d7bff'], muro: '#2aa5df', cielo: ['#ff8a4c', '#ffe1a1'], cerros: '#e2a35c', niebla: [255, 225, 161] },
    deco: ['🌴', '🦀', '⛱️', '🐚', '🌴', '🏴‍☠️'],
  },
  {
    id: 'dulce', nombre: 'Reino Dulce', emoji: '🍭', ancho: 115,
    puntos: [[1024, 250], [1600, 300], [1800, 700], [1500, 950], [1700, 1250], [1600, 1750], [1100, 1800], [900, 1450], [600, 1750], [300, 1500], [400, 1050], [250, 650], [550, 350]],
    colores: { pasto: ['#ffb8e1', '#ffa3d6'], camino: '#8c5a3c', linea: '#ffe6f3', bordillo: ['#ffffff', '#ff3d9a'], muro: '#b56fe0', cielo: ['#a77bff', '#ffd3f4'], cerros: '#ff7fc4', niebla: [255, 211, 244] },
    deco: ['🍭', '🍩', '🧁', '🍬', '🍫', '🍦'],
  },
];

export function pistaPorId(id) {
  return PISTAS.find((p) => p.id === id) ?? PISTAS[0];
}

// Curva cerrada Catmull-Rom remuestreada cada `paso` unidades.
export function lineaCentral(puntos, paso = 10) {
  const densos = [];
  const n = puntos.length;
  for (let i = 0; i < n; i++) {
    const p0 = puntos[(i - 1 + n) % n], p1 = puntos[i], p2 = puntos[(i + 1) % n], p3 = puntos[(i + 2) % n];
    for (let k = 0; k < 30; k++) {
      const t = k / 30, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      densos.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  // Remuestreo por longitud de arco.
  const salida = [];
  let acumulado = 0;
  salida.push({ x: densos[0][0], y: densos[0][1] });
  for (let i = 1; i <= densos.length; i++) {
    const a = densos[i - 1], b = densos[i % densos.length];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let resto = d;
    let px = a[0], py = a[1];
    while (acumulado + resto >= paso) {
      const falta = paso - acumulado;
      px += (b[0] - px) * (falta / resto);
      py += (b[1] - py) * (falta / resto);
      resto -= falta;
      acumulado = 0;
      salida.push({ x: px, y: py });
    }
    acumulado += resto;
  }
  if (salida.length > 2) {
    const u = salida[salida.length - 1];
    if (Math.hypot(u.x - salida[0].x, u.y - salida[0].y) < paso * 0.5) salida.pop();
  }
  const N = salida.length;
  const angulos = (lista) => {
    for (let i = 0; i < N; i++) {
      const a = lista[(i - 1 + N) % N], b = lista[(i + 1) % N];
      lista[i].ang = Math.atan2(b.y - a.y, b.x - a.x);
    }
  };
  angulos(salida);
  // La meta va en la parte más recta de la pista, para que la parrilla de salida no quede en curva.
  let mejor = 0, menor = Infinity;
  for (let i = 0; i < N; i++) {
    let curva = 0;
    for (let k = -45; k < 20; k++) {
      const a = salida[(i + k + N) % N].ang, b = salida[(i + k + 1 + N) % N].ang;
      curva += Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
    }
    if (curva < menor - 1e-9) { menor = curva; mejor = i; }
  }
  return [...salida.slice(mejor), ...salida.slice(0, mejor)];
}

// Índice más cercano buscando cerca del anterior (rápido) o en toda la pista.
export function indiceCercano(pts, x, y, previo = -1, ventana = 25) {
  const N = pts.length;
  let mejor = 0, dmin = Infinity;
  if (previo < 0) {
    for (let i = 0; i < N; i++) {
      const d = (pts[i].x - x) ** 2 + (pts[i].y - y) ** 2;
      if (d < dmin) { dmin = d; mejor = i; }
    }
    return mejor;
  }
  for (let k = -ventana; k <= ventana; k++) {
    const i = (previo + k + N) % N;
    const d = (pts[i].x - x) ** 2 + (pts[i].y - y) ** 2;
    if (d < dmin) { dmin = d; mejor = i; }
  }
  return mejor;
}

// Superficie: 0 muro, 1 pasto (lento), 2 camino, 3 bordillo.
export const MURO = 0, PASTO = 1, CAMINO = 2;
const ESCALA_MASCARA = 2;

function hexAEntero(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (255 << 24) | (b << 16) | (g << 8) | r; // little-endian RGBA
}

function trazar(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

// Construye texturas y datos de juego. Solo en navegador (usa canvas).
export function construirPista(def, crearCanvas) {
  const pts = lineaCentral(def.puntos);
  const N = pts.length;
  const c = def.colores;
  const lienzo = crearCanvas(MUNDO, MUNDO);
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });

  // Muro (fondo).
  ctx.fillStyle = c.muro;
  ctx.fillRect(0, 0, MUNDO, MUNDO);
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#ffffff';
  for (let y = 0; y < MUNDO; y += 48) for (let x = (y / 48) % 2 ? 24 : 0; x < MUNDO; x += 48) ctx.fillRect(x, y, 10, 10);
  ctx.globalAlpha = 1;

  // Pasto: un trazo ancho alrededor de la pista con cuadros de dos tonos.
  const patron = crearCanvas(128, 128);
  const pc = patron.getContext('2d');
  pc.fillStyle = c.pasto[0]; pc.fillRect(0, 0, 128, 128);
  pc.fillStyle = c.pasto[1]; pc.fillRect(0, 0, 64, 64); pc.fillRect(64, 64, 64, 64);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = ctx.createPattern(patron, 'repeat');
  ctx.lineWidth = def.ancho + 340;
  trazar(ctx, pts); ctx.stroke();

  // Bordillo a rayas.
  ctx.lineWidth = def.ancho + 22;
  ctx.strokeStyle = c.bordillo[0];
  trazar(ctx, pts); ctx.stroke();
  ctx.setLineDash([24, 24]);
  ctx.strokeStyle = c.bordillo[1];
  trazar(ctx, pts); ctx.stroke();
  ctx.setLineDash([]);

  // Camino.
  ctx.lineWidth = def.ancho;
  ctx.strokeStyle = c.camino;
  trazar(ctx, pts); ctx.stroke();
  ctx.lineWidth = 4;
  ctx.setLineDash([30, 40]);
  ctx.strokeStyle = c.linea;
  ctx.globalAlpha = 0.7;
  trazar(ctx, pts); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Flechas de dirección pintadas en el piso.
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 25; i < N; i += 60) {
    const p = pts[i];
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang);
    ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(-10, -18); ctx.lineTo(-2, 0); ctx.lineTo(-10, 18); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Línea de meta a cuadros.
  const p0 = pts[0];
  ctx.save(); ctx.translate(p0.x, p0.y); ctx.rotate(p0.ang);
  const cuadro = 10;
  for (let fila = 0; fila < 2; fila++) {
    for (let k = -def.ancho / 2; k < def.ancho / 2; k += cuadro) {
      ctx.fillStyle = (Math.round(k / cuadro) + fila) % 2 ? '#111' : '#fff';
      ctx.fillRect(-cuadro + fila * cuadro, k, cuadro, cuadro);
    }
  }
  ctx.restore();

  const datos = ctx.getImageData(0, 0, MUNDO, MUNDO);
  const textura = new Uint32Array(datos.data.buffer);

  // Máscara de superficie a media resolución.
  const M = MUNDO / ESCALA_MASCARA;
  const lm = crearCanvas(M, M);
  const mc = lm.getContext('2d', { willReadFrequently: true });
  mc.fillStyle = '#000'; mc.fillRect(0, 0, M, M);
  mc.scale(1 / ESCALA_MASCARA, 1 / ESCALA_MASCARA);
  mc.lineJoin = 'round'; mc.lineCap = 'round';
  mc.strokeStyle = '#555'; mc.lineWidth = def.ancho + 330; trazar(mc, pts); mc.stroke();
  mc.strokeStyle = '#aaa'; mc.lineWidth = def.ancho + 26; trazar(mc, pts); mc.stroke();
  const md = mc.getImageData(0, 0, M, M).data;
  const mascara = new Uint8Array(M * M);
  for (let i = 0; i < M * M; i++) {
    const r = md[i * 4];
    mascara[i] = r < 40 ? MURO : r < 120 ? PASTO : CAMINO;
  }

  function superficie(x, y) {
    if (x < 0 || y < 0 || x >= MUNDO || y >= MUNDO) return MURO;
    return mascara[((y / ESCALA_MASCARA) | 0) * M + ((x / ESCALA_MASCARA) | 0)];
  }

  // Esferas "?" en tres franjas de la pista.
  const esferas = [];
  for (const fr of [0.2, 0.5, 0.78]) {
    const p = pts[Math.floor(fr * N)];
    const nx = -Math.sin(p.ang), ny = Math.cos(p.ang);
    for (const o of [-0.33, -0.11, 0.11, 0.33]) {
      esferas.push({ x: p.x + nx * o * def.ancho, y: p.y + ny * o * def.ancho, vuelve: 0 });
    }
  }

  // Decoración en el pasto (determinista para que todos vean lo mismo).
  let semilla = def.id.length * 9301 + 49297;
  const azar = () => ((semilla = (semilla * 9301 + 49297) % 233280) / 233280);
  const deco = [];
  for (let intentos = 0; intentos < 4000 && deco.length < 140; intentos++) {
    const x = azar() * MUNDO, y = azar() * MUNDO;
    if (superficie(x, y) !== PASTO) continue;
    const i = indiceCercano(pts, x, y);
    if (Math.hypot(pts[i].x - x, pts[i].y - y) < def.ancho / 2 + 50) continue;
    deco.push({ x, y, emoji: def.deco[Math.floor(azar() * def.deco.length)], tam: 40 + azar() * 30 });
  }

  // Minimapa.
  const mini = crearCanvas(160, 160);
  const mi = mini.getContext('2d');
  mi.scale(160 / MUNDO, 160 / MUNDO);
  mi.lineJoin = 'round';
  mi.strokeStyle = 'rgba(0,0,0,0.45)'; mi.lineWidth = def.ancho + 90; trazar(mi, pts); mi.stroke();
  mi.strokeStyle = '#ffffff'; mi.lineWidth = def.ancho + 10; trazar(mi, pts); mi.stroke();

  return { def, pts, N, textura, superficie, esferas, deco, mini, colorMuro: hexAEntero(c.muro) };
}

// Posiciones de salida detrás de la meta, en filas de dos.
export function parrilla(pts, ancho, cantidad) {
  const N = pts.length;
  const lugares = [];
  for (let k = 0; k < cantidad; k++) {
    const fila = Math.floor(k / 2);
    const idx = (N - 3 - fila * 4 + N * 10) % N;
    const p = pts[idx];
    const lado = k % 2 ? 1 : -1;
    const nx = -Math.sin(p.ang), ny = Math.cos(p.ang);
    lugares.push({ x: p.x + nx * lado * ancho * 0.22, y: p.y + ny * lado * ancho * 0.22, ang: p.ang, idx });
  }
  return lugares;
}
