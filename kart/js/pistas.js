// Definición y construcción de las pistas. Cada carrera del Gran Premio usa una pista distinta.
export const MUNDO = 2048;

export const PISTAS = [
  {
    id: 'pradera', nombre: 'Pradera Feliz', emoji: '🌻', ancho: 120,
    puntos: [[350, 1500], [350, 600], [550, 330], [900, 330], [1050, 600], [1150, 850], [1400, 850], [1550, 550], [1750, 450], [1820, 800], [1750, 1300], [1500, 1650], [1000, 1750], [600, 1750]],
    colores: { pasto: ['#5cc84a', '#4fba3f'], camino: '#6d6d80', linea: '#ffffff', bordillo: ['#ff3b3b', '#ffffff'], muro: '#2e7d32', cielo: ['#3aa6ff', '#c4ecff'], cerros: '#3f9e4c', niebla: [196, 236, 255] },
    deco: ['🌳', '🌷', '🌻', '🍄', '🌳', '🌲'],
    obstaculo: { emoji: '🐄', tam: 34, periodo: 5.2, texto: '🐄 ¡Muuu! Chocaste con una vaca' },
    charco: { nombre: 'lodo', colores: ['#4a2e16', '#6e4a2a', '#9a7450'] },
  },
  {
    id: 'playa', nombre: 'Playa Pirata', emoji: '🏝️', ancho: 115,
    puntos: [[300, 1000], [350, 500], [700, 300], [1000, 550], [1300, 300], [1700, 350], [1800, 750], [1450, 1000], [1750, 1300], [1650, 1750], [1100, 1650], [800, 1800], [400, 1650]],
    colores: { pasto: ['#f4d58d', '#ebc874'], camino: '#7f8796', linea: '#fff2a8', bordillo: ['#ffcc00', '#1d7bff'], muro: '#2aa5df', cielo: ['#ff8a4c', '#ffe1a1'], cerros: '#e2a35c', niebla: [255, 225, 161] },
    deco: ['🌴', '🐢', '⛱️', '🐚', '🌴', '🏴‍☠️'],
    obstaculo: { emoji: '🦀', tam: 30, periodo: 3.6, texto: '🦀 ¡Te pellizcó un cangrejo!' },
    charco: { nombre: 'agua', colores: ['#1667a8', '#2f93d6', '#c4ecff'] },
  },
  {
    id: 'dulce', nombre: 'Reino Dulce', emoji: '🍭', ancho: 115,
    puntos: [[1024, 250], [1600, 300], [1800, 700], [1500, 950], [1700, 1250], [1600, 1750], [1100, 1800], [900, 1450], [600, 1750], [300, 1500], [400, 1050], [250, 650], [550, 350]],
    colores: { pasto: ['#ffb8e1', '#ffa3d6'], camino: '#8c5a3c', linea: '#ffe6f3', bordillo: ['#ffffff', '#ff3d9a'], muro: '#b56fe0', cielo: ['#a77bff', '#ffd3f4'], cerros: '#ff7fc4', niebla: [255, 211, 244] },
    deco: ['🍭', '🎂', '🧁', '🍬', '🍫', '🍦'],
    obstaculo: { emoji: '🍩', tam: 30, periodo: 4.2, rueda: true, texto: '🍩 ¡Te atropelló una dona gigante!' },
    charco: { nombre: 'chocolate', colores: ['#2e1407', '#552a12', '#a8683f'] },
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

// Charcos (frenan), flechas turbo (aceleran) y obstáculos que cruzan la pista.
// Posiciones fijas por pista, a lo largo de la línea central, para que todos los jugadores vean lo mismo.
// (Las esferas "?" van en 0.2, 0.5 y 0.78; la parrilla de salida ocupa el final de la vuelta.)
export const POS_CHARCOS = [[0.12, 0.2], [0.42, -0.22], [0.72, 0.18]];
export const POS_TURBOS = [[0.06, -0.18], [0.28, 0.2], [0.58, -0.2]];
export const POS_OBSTACULOS = [0.35, 0.65, 0.88];

export function elementosPista(def, pts) {
  const N = pts.length;
  const lateral = (p, f) => ({ x: p.x - Math.sin(p.ang) * f * def.ancho, y: p.y + Math.cos(p.ang) * f * def.ancho });
  const charcos = POS_CHARCOS.map(([fr, off]) => {
    const p = pts[Math.floor(fr * N)];
    return { ...lateral(p, off), ang: p.ang, rx: 30, ry: 19 };
  });
  const turbos = POS_TURBOS.map(([fr, off]) => {
    const p = pts[Math.floor(fr * N)];
    return { ...lateral(p, off), ang: p.ang, largo: 46, ancho: 32 };
  });
  const obstaculos = POS_OBSTACULOS.map((fr, i) => {
    const idx = Math.floor(fr * N);
    const p = pts[idx];
    return {
      idx, x: p.x, y: p.y, nx: -Math.sin(p.ang), ny: Math.cos(p.ang),
      amplitud: def.ancho / 2 - 14, periodo: (def.obstaculo?.periodo ?? 4) * (1 + i * 0.15), fase: i * 2.1,
    };
  });
  return { charcos, turbos, obstaculos };
}

// 'charco' | 'turbo' | null según el punto (x, y).
export function zonaEn(el, x, y) {
  const local = (z) => {
    const dx = x - z.x, dy = y - z.y, c = Math.cos(z.ang), s = Math.sin(z.ang);
    return [dx * c + dy * s, -dx * s + dy * c];
  };
  for (const ch of el.charcos) {
    const [lx, ly] = local(ch);
    if ((lx / ch.rx) ** 2 + (ly / ch.ry) ** 2 < 1) return 'charco';
  }
  for (const t of el.turbos) {
    const [lx, ly] = local(t);
    if (Math.abs(lx) < t.largo / 2 && Math.abs(ly) < t.ancho / 2 + 3) return 'turbo';
  }
  return null;
}

// Posición de un obstáculo móvil a los t segundos de iniciada la carrera (igual en todos los equipos).
export function posicionObstaculo(o, t) {
  const a = (2 * Math.PI * Math.max(0, t)) / o.periodo + o.fase;
  const s = Math.sin(a);
  return { x: o.x + o.nx * o.amplitud * s, y: o.y + o.ny * o.amplitud * s, sentido: Math.cos(a) >= 0 ? 1 : -1 };
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

  // Sombra suave del pasto junto a la pista.
  ctx.strokeStyle = 'rgba(0,0,0,0.13)';
  ctx.lineWidth = def.ancho + 70;
  trazar(ctx, pts); ctx.stroke();

  // Bordillo a rayas.
  ctx.lineWidth = def.ancho + 22;
  ctx.strokeStyle = c.bordillo[0];
  trazar(ctx, pts); ctx.stroke();
  ctx.setLineDash([24, 24]);
  ctx.strokeStyle = c.bordillo[1];
  trazar(ctx, pts); ctx.stroke();
  ctx.setLineDash([]);

  // Camino con líneas blancas en las orillas y una franja más oscura por donde pasan las llantas.
  ctx.lineWidth = def.ancho;
  ctx.strokeStyle = '#f4f4f8';
  trazar(ctx, pts); ctx.stroke();
  ctx.lineWidth = def.ancho - 8;
  ctx.strokeStyle = c.camino;
  trazar(ctx, pts); ctx.stroke();
  ctx.lineWidth = def.ancho * 0.45;
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
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

  // Cajones de la parrilla de salida.
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3;
  for (const l of parrilla(pts, def.ancho, 10)) {
    ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.ang);
    ctx.beginPath(); ctx.moveTo(14, -13); ctx.lineTo(-10, -13); ctx.moveTo(14, 13); ctx.lineTo(-10, 13); ctx.moveTo(14, -13); ctx.lineTo(14, 13);
    ctx.stroke();
    ctx.restore();
  }

  // Charcos y flechas turbo pintados en el piso.
  const elementos = elementosPista(def, pts);
  const [chOscuro, chMedio, chClaro] = def.charco.colores;
  for (const ch of elementos.charcos) {
    ctx.save(); ctx.translate(ch.x, ch.y); ctx.rotate(ch.ang);
    ctx.fillStyle = chMedio;
    for (const [dx, dy, fx, fy] of [[0, 0, 1, 1], [-14, -7, 0.45, 0.5], [13, 6, 0.5, 0.55], [8, -9, 0.4, 0.4], [-10, 9, 0.35, 0.45]]) {
      ctx.beginPath(); ctx.ellipse(dx, dy, ch.rx * fx, ch.ry * fy, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = chOscuro;
    ctx.beginPath(); ctx.ellipse(1, 1, ch.rx * 0.72, ch.ry * 0.66, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = chClaro;
    ctx.globalAlpha = 0.8;
    for (const [dx, dy, r] of [[-10, -5, 3.2], [6, 4, 2.4], [12, -3, 1.8], [-3, 7, 1.6]]) {
      ctx.beginPath(); ctx.ellipse(dx, dy, r * 1.6, r, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  for (const t of elementos.turbos) {
    ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.ang);
    ctx.fillStyle = '#2a1052';
    ctx.beginPath(); ctx.roundRect(-t.largo / 2, -t.ancho / 2, t.largo, t.ancho, 6); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffd21f'; ctx.stroke();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 6;
    [-14, 0, 14].forEach((x0, i) => {
      ctx.strokeStyle = ['#ff3d9a', '#ff7a1a', '#ffd21f'][i];
      ctx.beginPath(); ctx.moveTo(x0 - 6, -10); ctx.lineTo(x0 + 6, 0); ctx.lineTo(x0 - 6, 10); ctx.stroke();
    });
    ctx.restore();
  }
  ctx.lineCap = 'round';

  const datos = ctx.getImageData(0, 0, MUNDO, MUNDO);
  // Grano fino (asfalto y pasto con textura) con azar determinista.
  const d = datos.data;
  let ruido = 12345;
  for (let i = 0; i < d.length; i += 4) {
    ruido = (ruido * 1103515245 + 12345) & 0x7fffffff;
    const v = ((ruido >> 16) & 15) - 7;
    d[i] = Math.max(0, Math.min(255, d[i] + v));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + v));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + v));
  }
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

  // Vallas en el límite del área donde se puede manejar (se dibujan en 3D).
  const vallas = [];
  for (const lado of [-1, 1]) {
    let previo = null;
    let n = 0;
    for (let i = 0; i < N; i += 2) {
      const p = pts[i];
      const nx = -Math.sin(p.ang) * lado, ny = Math.cos(p.ang) * lado;
      let punto = null;
      for (let dd = def.ancho / 2 + 40; dd < def.ancho / 2 + 240; dd += 4) {
        if (superficie(p.x + nx * dd, p.y + ny * dd) === MURO) {
          punto = { x: p.x + nx * (dd - 3), y: p.y + ny * (dd - 3) };
          break;
        }
      }
      if (punto && previo && Math.hypot(punto.x - previo.x, punto.y - previo.y) < 60) {
        vallas.push({ a: previo, b: punto, color: n % 2 });
        n++;
      }
      previo = punto;
    }
  }

  // Minimapa.
  const mini = crearCanvas(160, 160);
  const mi = mini.getContext('2d');
  mi.scale(160 / MUNDO, 160 / MUNDO);
  mi.lineJoin = 'round';
  mi.strokeStyle = 'rgba(0,0,0,0.45)'; mi.lineWidth = def.ancho + 90; trazar(mi, pts); mi.stroke();
  mi.strokeStyle = '#ffffff'; mi.lineWidth = def.ancho + 10; trazar(mi, pts); mi.stroke();

  return { def, pts, N, textura, superficie, esferas, deco, vallas, mini, colorMuro: hexAEntero(c.muro), ...elementos, zona: (x, y) => zonaEn(elementos, x, y) };
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
