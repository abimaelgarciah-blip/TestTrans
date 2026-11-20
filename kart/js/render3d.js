// Dibujo 3D sencillo sobre canvas: cámara, mallas de polígonos con luz, karts, poderes y partículas.
// Coordenadas del mundo: x y y sobre el piso (como el mapa), z hacia arriba.

const LUZ = (() => { const v = [-0.45, -0.4, 0.8]; const n = Math.hypot(...v); return v.map((c) => c / n); })();

export function crearCamara({ x, y, h, ang, W, hz, focal, k, kh }) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const rx = -sa, ry = ca;
  return {
    x, y, h, ang, ca, sa, rx, ry, W, hz, focal, k, kh,
    proyectar(X, Y, Z = 0) {
      const dx = X - x, dy = Y - y;
      const z = dx * ca + dy * sa;
      if (z < 4) return null;
      const f = focal / z;
      return { z, sx: (W / 2 + (dx * rx + dy * ry) * f) * k, sy: (hz + (h - Z) * f) * kh, s: f * k };
    },
    profundidad(X, Y) { return (X - x) * ca + (Y - y) * sa; },
  };
}

// ---------- Colores ----------
export function hexARgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export function hslARgb(hue, s, l) {
  s /= 100; l /= 100;
  const f = (n) => { const k = (n + hue / 30) % 12; return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return [f(0), f(8), f(4)];
}
export const mezclar = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
const cacheTono = new Map();
export function tono(rgb, f) {
  const q = Math.round(f * 40) / 40;
  const clave = `${rgb[0]},${rgb[1]},${rgb[2]},${q}`;
  let c = cacheTono.get(clave);
  if (!c) {
    if (cacheTono.size > 4000) cacheTono.clear();
    const m = (v) => Math.max(0, Math.min(255, Math.round(v * q)));
    c = `rgb(${m(rgb[0])},${m(rgb[1])},${m(rgb[2])})`;
    cacheTono.set(clave, c);
  }
  return c;
}

// ---------- Emojis como imágenes (rápidos de dibujar y con sombrita) ----------
const cacheEmoji = new Map();
export function imagenEmoji(e, conSombra = false) {
  const clave = `${e}|${conSombra}`;
  let c = cacheEmoji.get(clave);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    x.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    if (conSombra) { x.shadowColor = 'rgba(30,10,60,0.55)'; x.shadowBlur = 8; x.shadowOffsetY = 4; }
    x.fillText(e, 64, 70);
    cacheEmoji.set(clave, c);
  }
  return c;
}

// ---------- Geometría ----------
function centro(v) {
  const c = [0, 0, 0];
  for (const p of v) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  return c.map((s) => s / v.length);
}
function parte(v, caras, rol, extra = {}) { return { v, caras, rol, c: centro(v), ...extra }; }

function caja(x0, x1, y0, y1, z0, z1, rol, extra) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  return parte(v, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], rol, extra);
}
// Prisma entre una cara trasera y una delantera (4 vértices cada una, mismo orden).
function prisma(atras, adelante, rol, extra) {
  const v = [...atras, ...adelante];
  return parte(v, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], rol, extra);
}
// Cilindro con eje a lo largo de y (ruedas).
function cilindroY(cx, cy, cz, r, ancho, lados, rol, extra) {
  const v = [];
  for (const s of [-1, 1]) for (let i = 0; i < lados; i++) {
    const a = (i / lados) * Math.PI * 2 + Math.PI / lados;
    v.push([cx + Math.cos(a) * r, cy + (s * ancho) / 2, cz + Math.sin(a) * r]);
  }
  const caras = [];
  for (let i = 0; i < lados; i++) caras.push([i, (i + 1) % lados, lados + ((i + 1) % lados), lados + i]);
  caras.push([...Array(lados).keys()]);
  caras.push([...Array(lados).keys()].map((i) => i + lados));
  return parte(v, caras, rol, extra);
}
// Cilindro con eje a lo largo de x, con punta cónica opcional (cohete).
function cilindroX(x0, x1, r, lados, rol, punta = 0) {
  const anillo = (x) => Array.from({ length: lados }, (_, i) => {
    const a = (i / lados) * Math.PI * 2;
    return [x, Math.cos(a) * r, Math.sin(a) * r];
  });
  const caras = [];
  for (let i = 0; i < lados; i++) caras.push([i, (i + 1) % lados, lados + ((i + 1) % lados), lados + i]);
  caras.push([...Array(lados).keys()]);
  caras.push([...Array(lados).keys()].map((i) => i + lados));
  const partes = [parte([...anillo(x0), ...anillo(x1)], caras, rol)];
  if (punta) {
    const triangulos = Array.from({ length: lados }, (_, i) => [i, (i + 1) % lados, lados]);
    partes.push(parte([...anillo(x1), [x1 + punta, 0, 0]], triangulos, 'punta'));
  }
  return partes;
}
const espejo = (p) => parte(p.v.map(([x, y, z]) => [x, -y, z]), p.caras, p.rol, { rueda: p.rueda, detalle: p.detalle, pc: p.pc ? [p.pc[0], -p.pc[1], p.pc[2]] : undefined });

// Kart: x hacia adelante, y hacia la derecha, z hacia arriba. Unidades del mundo.
const KART = (() => {
  const partes = [];
  const par = (p) => { partes.push(p, espejo(p)); };
  partes.push(caja(-10, 11, -6, 6, 1.2, 2.6, 'oscuro'));
  partes.push(prisma(
    [[3, -5, 2.6], [3, 5, 2.6], [3, 5, 6.6], [3, -5, 6.6]],
    [[12.5, -4, 2.0], [12.5, 4, 2.0], [12.5, 4, 3.8], [12.5, -4, 3.8]], 'cuerpo'));
  partes.push(caja(11.5, 14, -7.5, 7.5, 0.9, 2.9, 'acento'));
  par(caja(-2.8, 4.2, 5, 8.4, 1.8, 5.4, 'cuerpo'));
  partes.push(caja(-11.5, -6, -5.2, 5.2, 2.6, 6.4, 'cuerpo'));
  partes.push(caja(-12.2, -11.4, -3.6, 3.6, 3.2, 5.4, 'metal', { detalle: true }));
  par(caja(-14, -11.5, 1.6, 3.4, 4.4, 6.2, 'cromo', { detalle: true }));
  partes.push(caja(-7, -1.5, -4.2, 4.2, 2.6, 4.4, 'asiento'));
  partes.push(caja(-7, -5, -4.2, 4.2, 4.4, 8.2, 'asiento'));
  partes.push(caja(-13.2, -10.2, -8.2, 8.2, 6.4, 7.6, 'acento'));
  par(caja(-13.2, -10.2, 6, 8.2, 2.8, 6.4, 'cuerpo'));
  partes.push(caja(1.8, 3, -0.6, 0.6, 4.4, 8.4, 'metal', { detalle: true }));
  partes.push(caja(1.4, 2.6, -3, 3, 8, 9.4, 'llanta', { detalle: true }));
  partes.push(caja(-4.8, 0.2, -3.3, 3.3, 3.6, 9.6, 'camisa'));
  par(caja(-1.2, 2.2, 2.8, 4.3, 7.2, 8.6, 'camisa', { detalle: true }));
  // Ruedas: traseras más grandes; las delanteras giran con el volante.
  par(cilindroY(-7.5, 9.2, 4, 4, 4.2, 10, 'llanta', { rueda: 'tras' }));
  par(cilindroY(-7.5, 11.5, 4, 2.2, 0.6, 10, 'rin', { rueda: 'tras', detalle: true }));
  par(cilindroY(8.2, 8.4, 3.3, 3.3, 3.4, 10, 'llanta', { rueda: 'del', pc: [8.2, 8.4, 3.3] }));
  par(cilindroY(8.2, 10.3, 3.3, 1.8, 0.5, 10, 'rin', { rueda: 'del', pc: [8.2, 8.4, 3.3], detalle: true }));
  return partes;
})();

const COHETE = (() => {
  const partes = [...cilindroX(-5, 4, 2.2, 8, 'cuerpo', 4)];
  partes.push(caja(-6, -2.5, -0.35, 0.35, -5, 5, 'aleta'));
  partes.push(caja(-6, -2.5, -5, 5, -0.35, 0.35, 'aleta'));
  partes.push(...cilindroX(-6.2, -5, 1.4, 8, 'metal'));
  return partes;
})();

/**
 * Dibuja una malla. aMundo(lx, ly, lz, parte) → [X, Y, Z].
 * extras: objetos { z, dibujar() } que se ordenan junto con las caras (por ejemplo, la cabeza del piloto).
 */
export function dibujarMalla(ctx, cam, partes, aMundo, colores, { extras = [], lejos = false, contorno = 0 } = {}) {
  const caras = [];
  const cpx = cam.x, cpy = cam.y, cpz = cam.h;
  for (const p of partes) {
    if (lejos && p.detalle) continue;
    const mw = p.v.map((v) => aMundo(v[0], v[1], v[2], p));
    const pr = mw.map((w) => cam.proyectar(w[0], w[1], w[2]));
    const c = aMundo(p.c[0], p.c[1], p.c[2], p);
    const base = colores[p.rol];
    for (const cara of p.caras) {
      let valida = true;
      for (const i of cara) if (!pr[i]) { valida = false; break; }
      if (!valida) continue;
      let nx = 0, ny = 0, nz = 0, fx = 0, fy = 0, fz = 0, zs = 0;
      const n = cara.length;
      for (let j = 0; j < n; j++) {
        const a = mw[cara[j]], b = mw[cara[(j + 1) % n]];
        nx += (a[1] - b[1]) * (a[2] + b[2]);
        ny += (a[2] - b[2]) * (a[0] + b[0]);
        nz += (a[0] - b[0]) * (a[1] + b[1]);
        fx += a[0]; fy += a[1]; fz += a[2];
        zs += pr[cara[j]].z;
      }
      fx /= n; fy /= n; fz /= n;
      if (nx * (fx - c[0]) + ny * (fy - c[1]) + nz * (fz - c[2]) < 0) { nx = -nx; ny = -ny; nz = -nz; }
      if (nx * (fx - cpx) + ny * (fy - cpy) + nz * (fz - cpz) >= 0) continue;
      const largo = Math.hypot(nx, ny, nz) || 1;
      const d = (nx * LUZ[0] + ny * LUZ[1] + nz * LUZ[2]) / largo;
      const luz = 0.62 + 0.48 * Math.max(0, d) + Math.min(0, d) * 0.12;
      caras.push({ z: zs / n, pts: cara.map((i) => pr[i]), color: tono(base, luz) });
    }
  }
  for (const e of extras) caras.push(e);
  caras.sort((a, b) => b.z - a.z);
  ctx.lineJoin = 'round';
  for (const f of caras) {
    if (f.dibujar) { f.dibujar(); continue; }
    const pts = f.pts;
    ctx.beginPath();
    ctx.moveTo(pts[0].sx, pts[0].sy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
    ctx.closePath();
    ctx.fillStyle = f.color;
    ctx.fill();
    if (contorno) {
      ctx.strokeStyle = 'rgba(25,10,45,0.55)';
      ctx.lineWidth = contorno;
      ctx.stroke();
    } else {
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }
}

// ---------- Kart con piloto ----------
const OSCURO = [30, 18, 52];
function paletaKart(kt, ahora) {
  const base = kt.ef.estrella ? hslARgb((ahora / 3) % 360, 100, 60) : (kt.rgb ??= hexARgb(kt.pj.color));
  const claro = base[0] + base[1] + base[2] > 600;
  return {
    cuerpo: base,
    oscuro: mezclar(base, OSCURO, 0.55),
    acento: claro ? [255, 92, 160] : [255, 255, 255],
    camisa: mezclar(base, [255, 255, 255], 0.3),
    llanta: [58, 52, 70],
    rin: [235, 235, 245],
    metal: [140, 140, 160],
    cromo: [215, 220, 232],
    asiento: [70, 44, 100],
  };
}

export function puntoKart(kt, lx, ly, lz) {
  const ca = Math.cos(kt.ang), sa = Math.sin(kt.ang);
  const e = kt.ef.encogido ? 0.55 : 1;
  return [kt.x + (ca * lx - sa * ly) * e, kt.y + (sa * lx + ca * ly) * e, lz * e + (kt.altura ?? 0)];
}

export function dibujarKart3D(ctx, cam, kt, ahora) {
  const esc = kt.ef.encogido ? 0.55 : 1;
  const ca = Math.cos(kt.ang), sa = Math.sin(kt.ang);
  const z0 = kt.altura ?? 0;
  const volante = kt.volante ?? 0;
  const inclina = volante * 0.08;
  const ci = Math.cos(inclina), si = Math.sin(inclina);
  const dir = volante * 0.45;
  const cd = Math.cos(dir), sd = Math.sin(dir);
  const aMundo = (lx, ly, lz, p) => {
    if (p && p.rueda === 'del') {
      const dx = lx - p.pc[0], dy = ly - p.pc[1];
      lx = p.pc[0] + dx * cd - dy * sd;
      ly = p.pc[1] + dx * sd + dy * cd;
    } else if (!p || !p.rueda) {
      const y2 = ly * ci - (lz - 2) * si;
      lz = ly * si + (lz - 2) * ci + 2;
      ly = y2;
    }
    lx *= esc; ly *= esc; lz *= esc;
    return [kt.x + ca * lx - sa * ly, kt.y + sa * lx + ca * ly, lz + z0];
  };

  // Sombra en el piso.
  const sombra = [[15, -11], [15, 11], [-15, 11], [-15, -11]].map(([lx, ly]) => cam.proyectar(kt.x + (ca * lx - sa * ly) * esc, kt.y + (sa * lx + ca * ly) * esc, 0));
  if (sombra.every(Boolean)) {
    ctx.beginPath();
    ctx.moveTo(sombra[0].sx, sombra[0].sy);
    for (const p of sombra) ctx.lineTo(p.sx, p.sy);
    ctx.closePath();
    ctx.fillStyle = `rgba(20,10,40,${0.32 - Math.min(0.2, z0 * 0.03)})`;
    ctx.fill();
  }
  if (kt.ef.estrella) {
    const c = cam.proyectar(kt.x, kt.y, 8 * esc + z0);
    if (c) {
      const r = 26 * esc * c.s;
      const g = ctx.createRadialGradient(c.sx, c.sy, 0, c.sx, c.sy, r);
      g.addColorStop(0, `hsla(${(ahora / 3) % 360},100%,70%,0.55)`);
      g.addColorStop(1, 'hsla(0,0%,100%,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c.sx, c.sy, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Cabeza del piloto (el avatar) y estrellitas cuando le pegan.
  const extras = [];
  const cabeza = aMundo(-2.2, 0, 15.5, null);
  const pc = cam.proyectar(cabeza[0], cabeza[1], cabeza[2]);
  if (pc) {
    const tam = 16.5 * esc * pc.s;
    const rot = kt.ef.giro > 0 ? Math.sin(ahora / 50) * 0.5 : -volante * 0.15;
    extras.push({
      z: pc.z,
      dibujar: () => {
        ctx.save();
        ctx.translate(pc.sx, pc.sy);
        ctx.rotate(rot);
        ctx.drawImage(imagenEmoji(kt.pj.emoji, true), -tam / 2, -tam / 2, tam, tam);
        ctx.restore();
      },
    });
    if (kt.ef.giro > 0) {
      for (let i = 0; i < 3; i++) {
        const a = ahora / 160 + (i * Math.PI * 2) / 3;
        const w = aMundo(-2.2 + Math.cos(a) * 9, Math.sin(a) * 9, 21, null);
        const p = cam.proyectar(w[0], w[1], w[2]);
        if (p) extras.push({ z: p.z, dibujar: () => { const t = 6 * p.s; ctx.drawImage(imagenEmoji('⭐'), p.sx - t / 2, p.sy - t / 2, t, t); } });
      }
    }
  }
  const cerca = pc ? pc.z : 999;
  dibujarMalla(ctx, cam, KART, aMundo, paletaKart(kt, ahora), {
    extras,
    lejos: cerca > 420,
    contorno: cerca < 520 ? Math.max(0.8, Math.min(2.2, (pc?.s ?? 1) * 0.18)) : 0,
  });
  return pc;
}

// ---------- Poderes ----------
const COLORES_COHETE = { cuerpo: [235, 48, 70], punta: [255, 255, 255], aleta: [255, 200, 40], metal: [120, 120, 140] };

export function dibujarCohete3D(ctx, cam, pr, ahora) {
  const ca = Math.cos(pr.ang), sa = Math.sin(pr.ang);
  const giro = ahora / 90;
  const cg = Math.cos(giro), sg = Math.sin(giro);
  const z0 = 9 + Math.sin(ahora / 120) * 0.8;
  const E = 1.75;
  const aMundo = (lx, ly, lz) => {
    const y2 = ly * cg - lz * sg, z2 = ly * sg + lz * cg;
    return [pr.x + (ca * lx - sa * y2) * E, pr.y + (sa * lx + ca * y2) * E, z2 * E + z0];
  };
  const s = cam.proyectar(pr.x, pr.y, 0);
  if (s) sombraSuelo(ctx, s, 7);
  dibujarMalla(ctx, cam, COHETE, aMundo, COLORES_COHETE, { contorno: s && s.z < 500 ? 1.2 : 0 });
}

function sombraSuelo(ctx, p, radio) {
  ctx.fillStyle = 'rgba(20,10,40,0.28)';
  ctx.beginPath();
  ctx.ellipse(p.sx, p.sy, radio * p.s, radio * p.s * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Cáscara de plátano: cuerpo y tres "hojas" caídas.
export function dibujarPlatano(ctx, cam, pr, ahora) {
  const p = cam.proyectar(pr.x, pr.y, 0);
  if (!p) return;
  sombraSuelo(ctx, p, 7);
  const u = p.s * 0.72;
  ctx.save();
  ctx.translate(p.sx, p.sy);
  ctx.rotate(Math.sin(ahora / 300 + pr.x) * 0.08);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, 0.9 * u);
  ctx.strokeStyle = '#8a5a00';
  const hoja = (ang) => {
    ctx.save();
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(-2.2 * u, -7 * u);
    ctx.bezierCurveTo(-4.5 * u, -2 * u, -3 * u, 1 * u, 0, 1.2 * u);
    ctx.bezierCurveTo(3 * u, 1 * u, 4.5 * u, -2 * u, 2.2 * u, -7 * u);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -7 * u, 0, 1 * u);
    g.addColorStop(0, '#fff3a0');
    g.addColorStop(1, '#f2b705');
    ctx.fillStyle = g;
    ctx.fill(); ctx.stroke();
    ctx.restore();
  };
  ctx.translate(0, -1.5 * u);
  hoja(-1.15); hoja(1.15);
  // Cuerpo.
  ctx.beginPath();
  ctx.ellipse(0, -8 * u, 3.1 * u, 6 * u, 0, 0, Math.PI * 2);
  const gc = ctx.createLinearGradient(-3 * u, 0, 3 * u, 0);
  gc.addColorStop(0, '#ffe45c'); gc.addColorStop(0.6, '#ffd21f'); gc.addColorStop(1, '#d99a00');
  ctx.fillStyle = gc;
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#6b3d00';
  ctx.beginPath(); ctx.ellipse(0, -14 * u, 1.1 * u, 1.4 * u, 0, 0, Math.PI * 2); ctx.fill();
  hoja(0);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ctx.ellipse(-1.2 * u, -9.5 * u, 0.7 * u, 2.6 * u, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function dibujarBolaFuego(ctx, cam, pr, ahora) {
  const z = 6;
  const p = cam.proyectar(pr.x, pr.y, z);
  const s = cam.proyectar(pr.x, pr.y, 0);
  if (!p) return;
  if (s) sombraSuelo(ctx, s, 6);
  const r = (7 + Math.sin(ahora / 40) * 0.8) * p.s;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r * 2.2);
  halo.addColorStop(0, 'rgba(255,200,80,0.7)');
  halo.addColorStop(1, 'rgba(255,80,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(p.sx, p.sy, r * 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  const g = ctx.createRadialGradient(p.sx - r * 0.3, p.sy - r * 0.3, r * 0.1, p.sx, p.sy, r);
  g.addColorStop(0, '#fffbe0');
  g.addColorStop(0.35, '#ffd34d');
  g.addColorStop(0.75, '#ff7a1a');
  g.addColorStop(1, '#d93a00');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2); ctx.fill();
}

export function dibujarEsfera(ctx, cam, e, ahora) {
  const aparece = Math.min(1, Math.max(0, (ahora - e.vuelve) / 350));
  if (aparece <= 0) return;
  const escala = aparece < 1 ? 1 + Math.sin(aparece * Math.PI) * 0.35 : 1;
  const flota = 13 + Math.sin(ahora / 260 + e.x) * 2.2;
  const p = cam.proyectar(e.x, e.y, flota);
  const s = cam.proyectar(e.x, e.y, 0);
  if (!p) return;
  if (s) sombraSuelo(ctx, s, 8 * escala);
  const r = 8.5 * p.s * escala * aparece;
  const hue = (ahora / 7 + e.x) % 360;
  // Halo de colores.
  const halo = ctx.createRadialGradient(p.sx, p.sy, r * 0.8, p.sx, p.sy, r * 1.6);
  halo.addColorStop(0, `hsla(${hue},100%,70%,0.5)`);
  halo.addColorStop(1, `hsla(${hue},100%,70%,0)`);
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(p.sx, p.sy, r * 1.6, 0, Math.PI * 2); ctx.fill();
  // Esfera de cristal.
  const g = ctx.createRadialGradient(p.sx - r * 0.35, p.sy - r * 0.4, r * 0.05, p.sx, p.sy, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, `hsl(${hue},100%,78%)`);
  g.addColorStop(0.8, `hsl(${(hue + 50) % 360},95%,55%)`);
  g.addColorStop(1, `hsl(${(hue + 90) % 360},90%,38%)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();
  // Signo de interrogación que gira.
  const giro = Math.cos(ahora / 400 + e.y);
  ctx.save();
  ctx.translate(p.sx, p.sy + r * 0.05);
  ctx.scale(Math.max(0.15, Math.abs(giro)), 1);
  ctx.font = `900 ${Math.round(r * 1.35)}px "Baloo 2", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(1.5, r * 0.2);
  ctx.strokeStyle = 'rgba(70,0,110,0.8)';
  ctx.strokeText('?', 0, r * 0.08);
  ctx.fillStyle = giro > 0 ? '#ffffff' : '#ffe14d';
  ctx.fillText('?', 0, r * 0.08);
  ctx.restore();
  // Brillo.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath(); ctx.ellipse(p.sx - r * 0.38, p.sy - r * 0.45, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2); ctx.fill();
}

// ---------- Partículas ----------
const texturas = new Map();
function texturaSuave(nombre, centro, borde) {
  let c = texturas.get(nombre);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, centro);
    g.addColorStop(0.45, borde);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    texturas.set(nombre, c);
  }
  return c;
}
const TEXTURA = {
  fuego: () => texturaSuave('fuego', 'rgba(255,255,220,1)', 'rgba(255,140,20,0.8)'),
  humo: () => texturaSuave('humo', 'rgba(235,235,240,0.9)', 'rgba(200,200,210,0.5)'),
  humoOscuro: () => texturaSuave('humoOscuro', 'rgba(90,85,100,0.9)', 'rgba(70,65,80,0.5)'),
  polvo: () => texturaSuave('polvo', 'rgba(190,150,100,0.9)', 'rgba(160,120,80,0.5)'),
  chispa: () => texturaSuave('chispa', 'rgba(255,255,255,1)', 'rgba(255,230,90,0.9)'),
  magia: () => texturaSuave('magia', 'rgba(255,255,255,1)', 'rgba(140,220,255,0.9)'),
};

export class Particulas {
  constructor() { this.lista = []; }
  emitir(p) {
    if (this.lista.length > 900) return;
    this.lista.push({ vx: 0, vy: 0, vz: 0, g: 0, crece: 0, alfa: 1, ...p, max: p.vida });
  }
  actualizar(dt) {
    for (const p of this.lista) {
      p.vida -= dt;
      p.vz -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.35; p.vx *= 0.7; p.vy *= 0.7; }
      if (p.giro !== undefined) p.giro += dt * 8;
    }
    this.lista = this.lista.filter((p) => p.vida > 0);
  }
  // Devuelve objetos { z, dibujar } para ordenarlos con el resto de la escena.
  elementos(ctx, cam) {
    const salida = [];
    for (const p of this.lista) {
      const pr = cam.proyectar(p.x, p.y, p.z);
      if (!pr || pr.z < 30 || pr.z > 1300) continue; // muy cerca de la cámara se verían como manchas gigantes
      salida.push({
        z: pr.z,
        dibujar: () => {
          const t = 1 - p.vida / p.max;
          const r = p.tam * pr.s * (1 + p.crece * t);
          if (r < 0.4) return;
          ctx.globalAlpha = Math.max(0, Math.min(1, (p.vida / p.max) * 1.4)) * p.alfa;
          if (p.tipo === 'confeti') {
            ctx.fillStyle = p.color;
            ctx.save();
            ctx.translate(pr.sx, pr.sy);
            ctx.rotate(p.giro ?? 0);
            ctx.fillRect(-r, -r * 0.5, r * 2, r);
            ctx.restore();
          } else if (p.tipo === 'emoji') {
            ctx.drawImage(imagenEmoji(p.emoji, true), pr.sx - r, pr.sy - r, r * 2, r * 2);
          } else {
            const aditivo = p.tipo === 'fuego' || p.tipo === 'chispa' || p.tipo === 'magia';
            if (aditivo) ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(TEXTURA[p.tipo](), pr.sx - r, pr.sy - r, r * 2, r * 2);
            if (aditivo) ctx.globalCompositeOperation = 'source-over';
          }
          ctx.globalAlpha = 1;
        },
      });
    }
    return salida;
  }
}

export const COLORES_CONFETI = ['#ff3d9a', '#ffd21f', '#35d04a', '#2f8bff', '#b26cff', '#ff7a1a', '#5ce1e6'];
