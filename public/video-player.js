// Reproductor del guion de video (motor v2.1).
//
// Imagen: tomas reales (B-roll) con movimiento de cámara, 11 transiciones, texto animado,
// subtítulos palabra por palabra, looks de color, grano, viñeta, partículas.
// Sonido: música y efectos sintetizados en el navegador (WebAudio, sin derechos de autor)
// que también salen en el video exportado, y voz en off opcional del navegador.
//
// Niveles de edición (como en la guía de 3 niveles):
//   1 básico      → cortes limpios, subtítulos y animaciones simples
//   2 movimiento  → + zoom en cada golpe, textos de distintos estilos, barra de progreso, emojis
//   3 profesional → + partículas, cámara en movimiento, brillo/neón, grano y fugas de luz

const FORMATOS = { '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080], '16:9': [1920, 1080] };
const TR = 0.5;       // duración de las transiciones (s)
const CIERRE = 2.6;   // duración del cierre (s)
const LOOK_AHEAD = 0.28;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const back = (x) => { const c = 1.7; x = clamp01(x); return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// Looks de color: capas de mezcla (funcionan también en Safari) + viñeta + grano
const LOOKS = {
  natural: { capas: [], vineta: 0.18, grano: 0 },
  cine: { capas: [['soft-light', 'rgba(0,110,150,.38)'], ['overlay', 'rgba(255,140,40,.14)']], vineta: 0.5, grano: 0.07 },
  calido: { capas: [['soft-light', 'rgba(255,150,60,.38)']], vineta: 0.3, grano: 0.03 },
  frio: { capas: [['soft-light', 'rgba(70,140,255,.38)']], vineta: 0.3, grano: 0.03 },
  neon: { capas: [['overlay', 'rgba(255,0,200,.20)'], ['screen', 'rgba(0,150,255,.10)']], vineta: 0.45, grano: 0.04 },
  vhs: { capas: [['overlay', 'rgba(255,0,60,.10)']], vineta: 0.4, grano: 0.14, scan: true },
  bn: { capas: [['saturation', '#808080']], vineta: 0.45, grano: 0.08 },
  pastel: { capas: [['screen', 'rgba(255,215,235,.26)'], ['soft-light', 'rgba(255,255,255,.28)']], vineta: 0.1, grano: 0 },
};
export const LOOK_NAMES = Object.keys(LOOKS);

export async function createPlayer(canvas, spec, opts = {}) {
  const { logoUrl = null, fileUrl = (r) => r, onTime = null, audio: wantAudio = true, fps = 60 } = opts;
  const [W, H] = FORMATOS[spec.formato] || FORMATOS['9:16'];
  let K = opts.scale || 1;
  const ctx = canvas.getContext('2d');
  const applySize = () => { canvas.width = Math.round(W * K); canvas.height = Math.round(H * K); };
  applySize();

  const P = spec.paleta || { fondo: '#1d1a4f', texto: '#ffffff', acento: '#ffb547' };
  const nivel = [1, 2, 3].includes(+spec.nivel) ? +spec.nivel : 2;
  const look = LOOKS[spec.look] ? spec.look : nivel >= 3 ? 'cine' : 'natural';
  const L = LOOKS[look];
  const font = (px, w = 900) => `${w} ${px}px "${spec.fuente || 'Arial Black'}", "Arial Black", Impact, sans-serif`;
  const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  // ---------- Línea de tiempo ----------
  const CAMS = ['push', 'der', 'pull', 'izq'];
  let acc = 0;
  const escenas = spec.escenas.map((e, i) => { const s = { ...e, ini: acc, camara: e.camara || (nivel >= 3 && i % 5 === 3 ? 'shake' : CAMS[i % CAMS.length]) }; acc += e.duracion; return s; });
  const total = acc + CIERRE;

  // ---------- Recursos ----------
  const loadImg = (src) => new Promise((ok) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  for (const e of escenas) {
    if (e.fondo?.tipo === 'broll' && e.fondo.clip?.url) {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous'; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
      v.src = `/api/broll/proxy?u=${encodeURIComponent(e.fondo.clip.url)}`;
      e.video = v;
      if (e.fondo.clip.poster) loadImg(`/api/broll/proxy?u=${encodeURIComponent(e.fondo.clip.poster)}`).then((i) => (e.poster = i));
    } else if (e.fondo?.tipo === 'archivo' && e.fondo.ruta) {
      e.img = await loadImg(fileUrl(e.fondo.ruta));
    }
  }
  const logo = logoUrl ? await loadImg(logoUrl) : null;

  // Grano de película y líneas de escaneo (se generan una sola vez)
  const grainTile = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 160;
    const g = c.getContext('2d'); const d = g.createImageData(160, 160);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0); return c;
  })();
  const scanTile = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 4; const g = c.getContext('2d'); g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, 0, 4, 1); return c; })();
  const rnd = mulberry(7);
  const parts = Array.from({ length: 54 }, () => ({ x: rnd(), y: rnd(), s: 0.4 + rnd() * 1.3, v: 0.03 + rnd() * 0.09, ph: rnd() * 6.28, c: rnd() }));

  // ---------- Sonido ----------
  const audio = wantAudio ? makeAudio(spec, escenas, acc, total, nivel) : null;

  // ---------- Dibujo ----------
  function cover(src, sw, sh, zoom = 1, ox = 0, oy = 0) {
    const s = Math.max(W / sw, H / sh) * zoom;
    const w = sw * s, h = sh * s;
    ctx.drawImage(src, (W - w) / 2 + ox, (H - h) / 2 + oy, w, h);
  }
  function camara(e, local) {
    const k = local / e.duracion; let z = 1, ox = 0, oy = 0;
    switch (e.camara) {
      case 'pull': z = 1.14 - 0.12 * k; break;
      case 'izq': z = 1.1; ox = W * 0.04 * (1 - 2 * k); break;
      case 'der': z = 1.1; ox = W * 0.04 * (2 * k - 1); break;
      case 'shake': z = 1.09; ox = Math.sin(local * 21) * W * 0.006 + Math.sin(local * 37 + 1) * W * 0.004; oy = Math.cos(local * 27) * H * 0.004; break;
      case 'fija': z = 1.02; break;
      default: z = 1 + 0.12 * k;
    }
    if (nivel >= 2) z *= 1 + 0.07 * (1 - ease(local / 0.3)); // "golpe" de zoom al entrar
    return { z, ox, oy };
  }
  function degradado(t, local) {
    // Fondo animado de malla cuando no hay toma real
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, P.fondo); g.addColorStop(1, shade(P.fondo, -38));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const [cx, cy, r, c, a] of [[0.8, 0.2, 0.55, P.acento, 0.2], [0.15, 0.85, 0.5, P.acento, 0.14], [0.5, 0.5, 0.4, '#ffffff', 0.05]]) {
      const x = W * (cx + Math.sin(t * 0.5 + r * 5) * 0.06), y = H * (cy + Math.cos(t * 0.4 + r * 3) * 0.05);
      const rg = ctx.createRadialGradient(x, y, 0, x, y, W * r);
      rg.addColorStop(0, hexA(c, a)); rg.addColorStop(1, hexA(c, 0));
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }
  function fondo(e, local, t) {
    const cam = camara(e, local); const v = e.video;
    ctx.save();
    if (v && v.readyState >= 2) cover(v, v.videoWidth, v.videoHeight, cam.z, cam.ox, cam.oy);
    else if (e.poster) cover(e.poster, e.poster.width, e.poster.height, cam.z, cam.ox, cam.oy);
    else if (e.img) cover(e.img, e.img.width, e.img.height, cam.z, cam.ox, cam.oy);
    else degradado(t, local);
    ctx.restore();
    if (v || e.img || e.poster) { // velo para que el texto se lea sobre cualquier toma
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(0.35, 'rgba(0,0,0,.1)'); g.addColorStop(0.65, 'rgba(0,0,0,.15)'); g.addColorStop(1, 'rgba(0,0,0,.6)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  }
  function particulas(t) {
    const tipo = spec.particulas || (nivel >= 3 ? 'polvo' : 'ninguna');
    if (tipo === 'ninguna' || nivel < 2 && !spec.particulas) return;
    ctx.save();
    for (const p of parts) {
      if (tipo === 'polvo') {
        const y = (p.y - t * p.v * 0.5 + 10) % 1, x = p.x + Math.sin(t * 0.7 + p.ph) * 0.02;
        ctx.globalAlpha = 0.18 + 0.4 * p.c; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x * W, y * H, W * 0.0035 * p.s, 0, 6.3); ctx.fill();
      } else if (tipo === 'chispas') {
        const y = (p.y - t * p.v * 2.2 + 10) % 1, x = p.x + Math.sin(t * 2 + p.ph) * 0.015;
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.5 * p.c; ctx.fillStyle = p.c > 0.5 ? P.acento : '#fff';
        ctx.beginPath(); ctx.arc(x * W, y * H, W * 0.004 * p.s, 0, 6.3); ctx.fill();
      } else if (tipo === 'confeti') {
        const y = (p.y + t * p.v * 2.4) % 1, x = p.x + Math.sin(t * 1.4 + p.ph) * 0.03;
        ctx.save(); ctx.translate(x * W, y * H); ctx.rotate(t * 3 * (p.c - 0.5) + p.ph); ctx.globalAlpha = 0.9;
        ctx.fillStyle = [P.acento, '#ffffff', '#ff5d6c', '#36e2c8', '#8b7bff'][Math.floor(p.c * 5) % 5]; ctx.fillRect(-W * 0.008, -W * 0.004, W * 0.016 * p.s, W * 0.008); ctx.restore();
      } else if (tipo === 'bokeh') {
        const y = (p.y - t * p.v * 0.3 + 10) % 1, x = p.x + Math.sin(t * 0.3 + p.ph) * 0.03;
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.12 + 0.12 * p.c;
        const r = W * 0.03 * p.s; const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, r);
        g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x * W, y * H, r, 0, 6.3); ctx.fill();
      }
    }
    ctx.restore();
  }
  function wrap(text, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean); const lines = []; let line = '';
    for (const w of words) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    return lines;
  }
  const estiloTexto = spec.estiloTexto || (nivel >= 3 ? 'neon' : 'impacto');
  function poner(str, x, y, size, hi) {
    const col = hi ? P.acento : P.texto;
    if (estiloTexto === 'caja') {
      const w = ctx.measureText(str).width + size * 0.5;
      ctx.fillStyle = hi ? P.acento : 'rgba(0,0,0,.74)'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - size * 0.62, w, size * 1.24, size * 0.22); ctx.fill();
      ctx.fillStyle = hi ? contrast(P.acento) : '#fff'; ctx.fillText(str, x, y); return;
    }
    if (estiloTexto === 'neon') {
      ctx.save(); ctx.shadowColor = P.acento; ctx.shadowBlur = size * 0.55; ctx.fillStyle = hi ? P.acento : '#fff';
      ctx.fillText(str, x, y); ctx.shadowBlur = size * 0.15; ctx.fillText(str, x, y); ctx.restore(); return;
    }
    if (estiloTexto === 'contorno') { ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.07; ctx.strokeStyle = col; ctx.strokeText(str, x, y); return; }
    ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.14; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(str, x, y);
    ctx.fillStyle = col; ctx.fillText(str, x, y);
  }
  function titulo(e, local) {
    if (!e.texto) return;
    const p = local / Math.min(0.6, e.duracion * 0.4);
    const size = Math.round(W * (e.texto.length > 28 ? 0.085 : 0.11) * (e.escala || 1));
    ctx.font = font(size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let txt = e.texto.toUpperCase();
    if (e.animacion === 'typewriter') txt = txt.slice(0, Math.ceil(txt.length * Math.min(1, local / (e.duracion * 0.6))));
    const lines = wrap(txt, W * 0.84);
    const lh = size * 1.1; const cy = H * (e.posicion === 'abajo' ? 0.62 : e.posicion === 'arriba' ? 0.26 : 0.42);
    const y0 = cy - ((lines.length - 1) * lh) / 2;
    const salida = nivel >= 2 ? clamp01((e.duracion - local) / 0.22) : 1; // sale con un fundido rápido
    ctx.save();
    ctx.globalAlpha = salida;
    if (e.animacion === 'palabras') {
      let n = 0;
      lines.forEach((l, li) => {
        const words = l.split(' '); const sp = ctx.measureText(' ').width;
        const ws = words.map((w) => ctx.measureText(w).width); let x = W / 2 - (ws.reduce((a, b) => a + b, 0) + sp * (words.length - 1)) / 2;
        words.forEach((w, wi) => {
          const pw = (local - n * 0.1) / 0.32; n++;
          if (pw > 0) { const s = back(pw); ctx.save(); ctx.globalAlpha = salida * clamp01(pw * 3); ctx.translate(x + ws[wi] / 2, y0 + li * lh); ctx.scale(s, s); ctx.textAlign = 'center'; poner(w, 0, 0, size, li === lines.length - 1 && lines.length > 1); ctx.restore(); }
          x += ws[wi] + sp;
        });
      });
      ctx.restore(); return;
    }
    let sc = 1, dy = 0, alpha = 1, sy = 1;
    if (e.animacion === 'pop') sc = back(p);
    if (e.animacion === 'zoom') { sc = 0.6 + 0.4 * ease(p); alpha = ease(p); }
    if (e.animacion === 'slide') { dy = (1 - ease(p)) * H * 0.18; alpha = ease(p); }
    if (e.animacion === 'giro') { sy = Math.max(0.02, Math.abs(Math.cos((1 - ease(p)) * 1.5))); alpha = ease(p); }
    ctx.globalAlpha = salida * alpha;
    ctx.translate(W / 2, cy + dy); ctx.scale(sc, sc * sy); ctx.translate(-W / 2, -cy);
    lines.forEach((l, i) => {
      let y = y0 + i * lh;
      if (e.animacion === 'bounce') y -= Math.abs(Math.sin(local * 7 + i)) * size * 0.12;
      poner(l, W / 2, y, size, i === lines.length - 1 && lines.length > 1);
    });
    ctx.restore();
  }
  function sticker(e, local) {
    if (!e.emoji || nivel < 2) return;
    const s = back(local / 0.45) * (1 + Math.sin(local * 5) * 0.05); const sz = W * 0.17;
    ctx.save(); ctx.translate(W * 0.83, H * 0.2 + Math.sin(local * 3) * 10); ctx.rotate(Math.sin(local * 2.5) * 0.12); ctx.scale(s, s);
    ctx.font = `${sz}px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(e.emoji, 0, 0); ctx.restore();
  }
  function subtitulos(e, local) {
    if (spec.subtitulos === 'ninguno' || !e.subtitulo) return;
    const words = e.subtitulo.split(/\s+/).filter(Boolean);
    const size = Math.round(W * 0.055);
    ctx.font = font(size, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const y = H * 0.78;
    if (spec.subtitulos === 'bloque') {
      wrap(e.subtitulo, W * 0.8).forEach((l, i) => { const yy = y + i * size * 1.2; ctx.lineWidth = size * 0.18; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(l, W / 2, yy); ctx.fillStyle = '#fff'; ctx.fillText(l, W / 2, yy); });
      return;
    }
    const per = (e.duracion * 0.92) / words.length;
    const cur = Math.min(words.length - 1, Math.floor(local / per));
    const start = Math.floor(cur / 4) * 4; const win = words.slice(start, start + 4);
    const widths = win.map((w) => ctx.measureText(w.toUpperCase()).width); const gap = size * 0.35;
    let x = W / 2 - (widths.reduce((a, b) => a + b, 0) + gap * (win.length - 1)) / 2;
    win.forEach((w, i) => {
      const active = start + i === cur; const t = w.toUpperCase(); const cx = x + widths[i] / 2;
      const s = active ? 1 + 0.12 * back(((local - cur * per) / per) * 3) - 0.12 : 1;
      ctx.save(); ctx.translate(cx, y); ctx.scale(s, s);
      if (active) { ctx.fillStyle = P.acento; ctx.beginPath(); ctx.roundRect(-widths[i] / 2 - 14, -size * 0.62, widths[i] + 28, size * 1.24, 14); ctx.fill(); }
      ctx.lineWidth = size * 0.16; ctx.strokeStyle = 'rgba(0,0,0,.85)'; if (!active) ctx.strokeText(t, 0, 0);
      ctx.fillStyle = active ? contrast(P.acento) : '#fff'; ctx.fillText(t, 0, 0);
      ctx.restore();
      x += widths[i] + gap;
    });
  }
  function marca(grande) {
    if (!logo) return;
    const w = grande ? W * 0.42 : W * 0.16; const h = (w / logo.width) * logo.height;
    ctx.globalAlpha = grande ? 1 : 0.9;
    ctx.drawImage(logo, grande ? (W - w) / 2 : W * 0.06, grande ? H * 0.2 : H * 0.05, w, h);
    ctx.globalAlpha = 1;
  }
  function credito(e) {
    if (!e.fondo?.clip?.autor) return;
    ctx.font = `600 ${Math.round(W * 0.018)}px Arial, sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillText(`Video: ${e.fondo.clip.autor}${/pexels/i.test(e.fondo.clip.pagina || e.fondo.clip.url) ? " / Pexels" : ""}`, W * 0.96, H * 0.985);
  }
  function progreso(t) {
    if (nivel < 2) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(0, H * 0.003, W * (t / total), H * 0.004); return; }
    const n = escenas.length + 1; const gap = 8; const w = (W * 0.9 - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const ini = i < escenas.length ? escenas[i].ini : acc; const dur = i < escenas.length ? escenas[i].duracion : CIERRE;
      const f = clamp01((t - ini) / dur);
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(W * 0.05 + i * (w + gap), H * 0.02, w, 6);
      ctx.fillStyle = '#fff'; ctx.fillRect(W * 0.05 + i * (w + gap), H * 0.02, w * f, 6);
    }
  }
  function escena(e, local, t) { fondo(e, local, t); particulas(t); titulo(e, local); sticker(e, local); subtitulos(e, local); credito(e); if (e.logo) marca(false); }
  function cierre(local, t) {
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, P.fondo); g.addColorStop(1, shade(P.fondo, -40));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    particulas(t);
    if (spec.cierre?.logo !== false) marca(true);
    const p = back(local / 0.5); const cta = (spec.cierre?.cta || '').toUpperCase();
    if (cta) {
      ctx.font = font(Math.round(W * 0.075)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(cta).width + W * 0.12; const y = H * 0.62;
      ctx.save(); ctx.translate(W / 2, y); ctx.scale(p, p);
      if (nivel >= 3) { ctx.shadowColor = P.acento; ctx.shadowBlur = 40; }
      ctx.fillStyle = P.acento; ctx.beginPath(); ctx.roundRect(-tw / 2, -W * 0.07, tw, W * 0.14, W * 0.07); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = contrast(P.acento); ctx.fillText(cta, 0, 4);
      ctx.restore();
    }
  }

  // Postproducción: color, viñeta, grano y fugas de luz
  function post(t) {
    ctx.save();
    for (const [mode, color] of L.capas) { ctx.globalCompositeOperation = mode; ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); }
    ctx.globalCompositeOperation = 'source-over';
    const v = L.vineta * (nivel >= 2 ? 1 : 0.5);
    if (v > 0) { const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${v})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    if (nivel >= 3 && spec.fugas !== false) { // fuga de luz que pasa de vez en cuando
      const ph = (t * 0.18) % 1; const x = W * (-0.3 + ph * 1.6);
      const g = ctx.createRadialGradient(x, H * 0.3, 0, x, H * 0.3, W * 0.6); g.addColorStop(0, 'rgba(255,170,90,.22)'); g.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    const grano = spec.grano != null ? +spec.grano : nivel >= 3 ? Math.max(L.grano, 0.06) : L.grano;
    if (grano > 0) {
      ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = grano * 3;
      ctx.translate(Math.random() * 160, Math.random() * 160); ctx.fillStyle = ctx.createPattern(grainTile, 'repeat'); ctx.fillRect(-160, -160, W + 320, H + 320);
    }
    ctx.restore();
    if (L.scan) { ctx.save(); ctx.fillStyle = ctx.createPattern(scanTile, 'repeat'); ctx.fillRect(0, 0, W, H); ctx.restore(); }
  }

  // Transiciones: cómo entra la escena actual desde la anterior
  function transicion(tipo, p, dibujaPrev, dibujaAct) {
    const q = ease(p);
    if (tipo === 'fundido') { dibujaPrev(); ctx.globalAlpha = q; dibujaAct(); ctx.globalAlpha = 1; return; }
    if (tipo === 'deslizar') { ctx.save(); ctx.translate(-W * q, 0); dibujaPrev(); ctx.restore(); ctx.save(); ctx.translate(W * (1 - q), 0); dibujaAct(); ctx.restore(); return; }
    if (tipo === 'whip') {
      for (let k = 0; k < 5; k++) { ctx.save(); ctx.globalAlpha = 0.28; ctx.translate(-W * q * 1.05 + k * 26 * q, 0); dibujaPrev(); ctx.restore(); }
      for (let k = 0; k < 5; k++) { ctx.save(); ctx.globalAlpha = q > 0.4 ? 0.32 : 0.12; ctx.translate(W * (1 - q) * 1.05 - k * 26 * (1 - q), 0); dibujaAct(); ctx.restore(); }
      if (p > 0.85) { ctx.globalAlpha = 1; dibujaAct(); } return;
    }
    if (tipo === 'zoom') { dibujaPrev(); ctx.save(); ctx.globalAlpha = q; const s = 1.35 - 0.35 * q; ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2); dibujaAct(); ctx.restore(); ctx.globalAlpha = 1; return; }
    if (tipo === 'zoomblur') {
      for (let k = 0; k < 6; k++) { ctx.save(); ctx.globalAlpha = (1 - q) * 0.3 + 0.05; const s = 1 + q * 0.7 + k * 0.05 * q; ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2); dibujaPrev(); ctx.restore(); }
      for (let k = 0; k < 6; k++) { ctx.save(); ctx.globalAlpha = q * 0.3 + 0.05; const s = 1.5 - q * 0.5 - k * 0.04 * (1 - q); ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2); dibujaAct(); ctx.restore(); }
      if (p > 0.85) { ctx.globalAlpha = 1; dibujaAct(); } return;
    }
    if (tipo === 'barrido') { dibujaPrev(); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W * q, H); ctx.clip(); dibujaAct(); ctx.restore(); ctx.fillStyle = P.acento; ctx.fillRect(W * q - 12, 0, 24, H); return; }
    if (tipo === 'iris') {
      dibujaPrev(); const r = q * Math.hypot(W, H) / 2;
      ctx.save(); ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, 6.3); ctx.clip(); dibujaAct(); ctx.restore();
      ctx.strokeStyle = P.acento; ctx.lineWidth = 10 * (1 - q); ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, 6.3); ctx.stroke(); return;
    }
    if (tipo === 'glitch' || tipo === 'rgb') {
      dibujaAct();
      if (p < 0.6) for (let k = 0; k < 7; k++) { const y = Math.random() * H; const h = 20 + Math.random() * 90; ctx.drawImage(canvas, 0, y * K, W * K, h * K, (Math.random() - 0.5) * 80, y, W, h); }
      if (tipo === 'rgb' && p < 0.7) {
        const d = (1 - p) * 26; ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.45;
        ctx.drawImage(canvas, d * K, 0, (W - d) * K, H * K, 0, 0, W - d, H); ctx.globalAlpha = 0.35; ctx.drawImage(canvas, 0, 0, (W - d) * K, H * K, d, 0, W - d, H); ctx.restore();
        ctx.fillStyle = `rgba(255,0,80,${0.12 * (1 - p)})`; ctx.fillRect(0, 0, W, H);
      }
      if (p < 0.4) { ctx.fillStyle = `rgba(255,0,80,${0.18 * (1 - p)})`; ctx.fillRect(0, 0, W, H); }
      return;
    }
    if (tipo === 'flash') { (p < 0.5 ? dibujaPrev : dibujaAct)(); ctx.fillStyle = `rgba(255,255,255,${1 - Math.abs(p - 0.5) * 2})`; ctx.fillRect(0, 0, W, H); return; }
    dibujaAct();
  }

  function frame(t) {
    ctx.setTransform(K, 0, 0, K, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (t >= acc) {
      const prev = escenas.at(-1); const local = t - acc;
      if (local < TR) transicion('fundido', local / TR, () => escena(prev, prev.duracion, t), () => cierre(local, t));
      else cierre(local, t);
    } else {
      let i = escenas.findIndex((e) => t >= e.ini && t < e.ini + e.duracion);
      if (i < 0) i = escenas.length - 1;
      const e = escenas[i]; const local = Math.min(e.duracion, t - e.ini);
      if (i > 0 && local < TR && e.transicion !== 'corte') {
        const prev = escenas[i - 1];
        transicion(e.transicion, local / TR, () => escena(prev, prev.duracion, t), () => escena(e, local, t));
      } else escena(e, local, t);
    }
    post(t);
    progreso(t);
  }

  // ---------- Reproducción ----------
  let t0 = performance.now(), playing = true, raf = 0, ultimaEscena = -2, pausedAt = 0, lastT = 0, lastDraw = 0, voz = false;
  const minDt = 1000 / fps;
  const curT = () => (playing ? ((performance.now() - t0) / 1000) % total : pausedAt);

  function hablar(e) {
    if (!voz || e?.voz || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const txt = e?.subtitulo || '';
    if (!txt) return;
    const u = new SpeechSynthesisUtterance(txt);
    const v = speechSynthesis.getVoices().find((x) => /^es[-_]MX/i.test(x.lang)) || speechSynthesis.getVoices().find((x) => /^es/i.test(x.lang));
    if (v) u.voice = v; u.lang = v?.lang || 'es-MX';
    u.rate = Math.min(1.5, Math.max(0.9, txt.split(/\s+/).length / (e.duracion * 2.6)));
    speechSynthesis.speak(u);
  }
  function syncVideos(t) {
    const i = t >= acc ? -1 : escenas.findIndex((e) => t >= e.ini && t < e.ini + e.duracion);
    if (i === ultimaEscena) return;
    ultimaEscena = i;
    escenas.forEach((e, k) => {
      if (!e.video) return;
      if (k === i || k === i + 1) { if (k === i) { try { e.video.currentTime = 0; } catch {} } e.video.play().catch(() => {}); }
      else e.video.pause();
    });
    hablar(escenas[i]);
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!playing || now - lastDraw < minDt - 2) return;
    lastDraw = now;
    const t = ((now - t0) / 1000) % total;
    if (t < lastT - 0.5) audio?.reiniciar(t); // el video dio la vuelta: la música también
    lastT = t;
    syncVideos(t); frame(t); onTime?.(t, total);
  }
  raf = requestAnimationFrame(loop);
  const timer = audio ? setInterval(() => playing && audio.programar(curT()), 40) : 0;

  return {
    total, audio: !!audio,
    get sonando() { return !!audio && audio.ac.state === 'running' && !audio.silencio; },
    get silencio() { return audio ? audio.silencio : true; },
    get voz() { return voz; },
    // Activa el sonido (debe llamarse desde un toque del usuario)
    async activarSonido() { if (!audio) return false; await audio.ac.resume().catch(() => {}); audio.silenciar(false); audio.reiniciar(curT()); return audio.ac.state === 'running'; },
    silenciar(s) { audio?.silenciar(s); if (s && 'speechSynthesis' in window) speechSynthesis.cancel(); },
    setVoz(on) { voz = on; if (!on && 'speechSynthesis' in window) speechSynthesis.cancel(); else hablar(escenas[Math.max(0, ultimaEscena)]); },
    setScale(k) { K = k; applySize(); },
    play() { if (!playing) { t0 = performance.now() - pausedAt * 1000; playing = true; audio?.ac.resume(); audio?.reiniciar(pausedAt); } },
    pause() { if (playing) { pausedAt = ((performance.now() - t0) / 1000) % total; playing = false; escenas.forEach((e) => e.video?.pause()); audio?.ac.suspend(); if ('speechSynthesis' in window) speechSynthesis.cancel(); } },
    restart() { t0 = performance.now(); ultimaEscena = -2; lastT = 0; playing = true; audio?.reiniciar(0); },
    destroy() { cancelAnimationFrame(raf); clearInterval(timer); escenas.forEach((e) => { e.video?.pause(); if (e.video) e.video.src = ''; }); audio?.ac.close().catch(() => {}); if ('speechSynthesis' in window) speechSynthesis.cancel(); },
    // Graba una vuelta completa (con música y efectos) y devuelve el archivo.
    async exportar(onProgress) {
      const tipos = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
      const mime = tipos.find((m) => window.MediaRecorder?.isTypeSupported?.(m));
      if (!mime) throw new Error('Este navegador no puede grabar video. Prueba con Chrome o Safari actualizados.');
      const kAntes = K; this.setScale(1);
      const stream = canvas.captureStream(30);
      if (audio) {
        await audio.ac.resume().catch(() => {});
        audio.silenciar(false); audio.parlantes(0); // se graba, pero no suena en tus bocinas
        audio.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
      }
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
      const chunks = []; rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
      const done = new Promise((ok) => (rec.onstop = ok));
      this.restart(); rec.start(250);
      const ti = setInterval(() => onProgress?.(Math.min(1, (performance.now() - t0) / 1000 / total)), 200);
      await new Promise((ok) => setTimeout(ok, total * 1000 + 300));
      rec.stop(); clearInterval(ti); await done;
      audio?.parlantes(1); this.setScale(kAntes);
      return { blob: new Blob(chunks, { type: mime.split(';')[0] }), ext: mime.includes('mp4') ? 'mp4' : 'webm', conAudio: !!audio };
    },
  };
}

// ===================== Sonido sintetizado =====================
function makeAudio(spec, escenas, acc, total, nivel) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const musica = spec.musica === undefined ? 'pop' : spec.musica;
  const conSfx = spec.sfx !== false;
  const ac = new AC();
  const master = ac.createGain(); master.gain.value = 0.85;
  const spk = ac.createGain(); spk.gain.value = 1;
  const dest = ac.createMediaStreamDestination();
  master.connect(spk); spk.connect(ac.destination); master.connect(dest);
  const hayVoz = escenas.some((e) => e.voz);
  const MUS = hayVoz ? 0.26 : 0.5; // la música baja cuando hay locución
  const mus = ac.createGain(); mus.gain.value = MUS; mus.connect(master);
  const vozG = ac.createGain(); vozG.gain.value = 1.25; vozG.connect(master);
  const fx = ac.createGain(); fx.gain.value = 0.9; fx.connect(master);

  const noiseBuf = (() => { const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const env = (g, t, a, d, peak) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const osc = (type, f, t, dur, peak, out, f2) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); env(g, t, 0.005, dur, peak); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05); };
  const noise = (t, dur, type, freq, peak, out, q = 1, f2) => { const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur); f.Q.value = q; const g = ac.createGain(); env(g, t, 0.004, dur, peak); s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 0.4); s.stop(t + dur + 0.05); };
  const tono = (type, m, t, dur, peak, lp = 2400, atk = 0.01) => { const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(); o.type = type; o.frequency.value = hz(m); f.type = 'lowpass'; f.frequency.value = lp; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + Math.min(atk, dur * 0.4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(f); f.connect(g); g.connect(mus); o.start(t); o.stop(t + dur + 0.05); };

  const kick = (t, v = 1) => osc('sine', 150, t, 0.22, 0.85 * v, mus, 42);
  const snare = (t, v = 1) => { noise(t, 0.16, 'bandpass', 1900, 0.5 * v, mus, 0.8); osc('triangle', 190, t, 0.09, 0.3 * v, mus, 120); };
  const clap = (t, v = 1) => { for (let i = 0; i < 3; i++) noise(t + i * 0.011, 0.09, 'bandpass', 1500, 0.38 * v, mus, 1.2); };
  const hat = (t, abierto = false, v = 1) => noise(t, abierto ? 0.18 : 0.04, 'highpass', 7500, 0.2 * v, mus);
  const bajo = (t, m, dur, type = 'sawtooth', lp = 420) => tono(type, m, t, dur, 0.5, lp);
  const PROG = [[45, [57, 60, 64]], [41, [53, 57, 60]], [36, [55, 60, 64]], [43, [55, 59, 62]]]; // La menor · Fa · Do · Sol
  const PROG2 = [[41, [60, 64, 67, 71]], [43, [59, 62, 67, 71]], [45, [60, 64, 69, 72]], [40, [59, 64, 67, 71]]];

  const PRESETS = {
    pop: { bpm: 112, fn(i, t, st) { const s = i % 16, [r, ch] = PROG[Math.floor(i / 16) % 4]; if (s % 4 === 0) kick(t); if (s === 4 || s === 12) clap(t, 0.9); if (s % 2 === 0) hat(t, s === 14, 0.8); if (s % 8 === 0) bajo(t, r, st * 7); if (s % 2 === 0) tono('square', ch[[0, 1, 2, 1][(s / 2) % 4]] + 12, t, st * 1.6, 0.07, 3000); } },
    energia: { bpm: 126, fn(i, t, st) { const s = i % 16, [r, ch] = PROG[Math.floor(i / 16) % 4]; if (s % 4 === 0) kick(t); if (s === 4 || s === 12) clap(t); hat(t, s % 4 === 2, 0.7); if (s % 4 === 2) bajo(t, r, st * 1.8); if (s % 2 === 1) tono('sawtooth', ch[(s >> 1) % 3] + 12, t, st, 0.05, 3600); } },
    lofi: { bpm: 80, fn(i, t, st) { const s = i % 16, [r, ch] = PROG2[Math.floor(i / 16) % 4]; if (s === 0 || s === 10) kick(t, 0.8); if (s === 4 || s === 12) snare(t, 0.5); if (s % 2 === 0) hat(t + (s % 4 === 2 ? st * 0.2 : 0), false, 0.5); if (s === 0) ch.forEach((m) => tono('sine', m, t, st * 15, 0.1, 1600, 0.2)); if (s === 0 || s === 8) bajo(t, r, st * 6, 'triangle', 300); if (s === 6 || s === 14) tono('triangle', ch[(s >> 1) % 4] + 12, t, st * 2, 0.09, 1800); } },
    epica: { bpm: 100, fn(i, t, st) { const s = i % 16, [r, ch] = PROG[Math.floor(i / 16) % 4]; if (s % 8 === 0) { kick(t, 1.1); osc('sine', 110, t, 0.5, 0.5, mus, 55); } if (s === 4 || s === 12) osc('sine', 95, t, 0.3, 0.35, mus, 60); if (s === 0) ch.forEach((m) => tono('sawtooth', m, t, st * 16, 0.07, 1400, 0.5)); if (s % 2 === 0) tono('triangle', ch[(s / 2) % 3] + 24, t, st * 1.5, 0.06, 4000); if (s === 0) bajo(t, r, st * 15, 'sawtooth', 300); } },
    urbano: { bpm: 140, fn(i, t, st) { const s = i % 16, [r] = PROG[Math.floor(i / 16) % 4]; if (s === 0 || s === 7 || s === 10) kick(t, 1.1); if (s === 8) { clap(t); snare(t, 0.5); } hat(t, false, 0.4 + ((i * 7) % 5) / 10); if (s === 14) { hat(t + st / 2, false, 0.5); hat(t + st * 0.75, false, 0.6); } if (s === 0 || s === 10) osc('sine', hz(r - 12 + 12), t, st * 6, 0.7, mus, hz(r - 12 + 12) * 0.85); } },
    suave: { bpm: 84, fn(i, t, st) { const s = i % 16, [r, ch] = PROG2[Math.floor(i / 16) % 4]; if (s === 0) { kick(t, 0.5); ch.forEach((m) => tono('sine', m, t, st * 16, 0.08, 1500, 0.3)); bajo(t, r, st * 8, 'sine', 260); } if (s % 4 === 0) tono('triangle', ch[(s >> 2) % 4] + 12, t, st * 3, 0.07, 2200); } },
  };
  const preset = PRESETS[musica] || null;

  // Efectos de sonido sincronizados con la edición
  const whoosh = (t) => noise(t, 0.38, 'bandpass', 500, 0.5, fx, 0.7, 4200);
  const whooshCorto = (t) => noise(t, 0.22, 'bandpass', 900, 0.35, fx, 0.8, 3200);
  const glitchSfx = (t) => { for (let i = 0; i < 4; i++) noise(t + i * 0.05, 0.05, 'highpass', 3000 + i * 1500, 0.35, fx); osc('sawtooth', 220, t, 0.18, 0.18, fx, 60); };
  const impacto = (t) => { osc('sine', 120, t, 0.45, 0.9, fx, 38); noise(t, 0.3, 'lowpass', 900, 0.4, fx); };
  const pop = (t) => osc('sine', 520, t, 0.1, 0.4, fx, 880);
  const tick = (t) => osc('square', 1400, t, 0.03, 0.12, fx);
  const ding = (t) => [76, 81, 85, 88].forEach((m, k) => osc('triangle', hz(m), t + k * 0.07, 0.7, 0.22, fx));
  const sfx = [];
  if (conSfx) {
    escenas.forEach((e, i) => {
      const tr = e.transicion;
      if (i > 0) {
        if (['deslizar', 'barrido', 'whip', 'zoomblur', 'iris'].includes(tr)) sfx.push({ t: e.ini - 0.05, f: whoosh });
        else if (['glitch', 'rgb'].includes(tr)) sfx.push({ t: e.ini, f: glitchSfx });
        else if (tr === 'flash') sfx.push({ t: e.ini + TR / 2, f: impacto });
        else if (tr === 'zoom') sfx.push({ t: e.ini, f: whooshCorto });
      }
      if (['pop', 'bounce', 'zoom', 'giro'].includes(e.animacion) && e.texto) sfx.push({ t: e.ini + 0.06, f: pop });
      if (e.animacion === 'typewriter' && e.texto) for (let k = 0; k < Math.min(18, e.texto.length); k++) sfx.push({ t: e.ini + (k / e.texto.length) * e.duracion * 0.6, f: tick });
      if (e.animacion === 'palabras' && e.texto) e.texto.split(' ').forEach((_, k) => sfx.push({ t: e.ini + k * 0.1 + 0.03, f: pop }));
      if (spec.estilo === 'cuenta-regresiva') sfx.push({ t: e.ini, f: tick });
    });
    sfx.push({ t: acc + 0.15, f: ding });
    sfx.sort((a, b) => a.t - b.t);
  }

  // Locución (ElevenLabs): se descarga y se programa al inicio de cada escena
  const vozBuf = new Map();
  for (const e of escenas) if (e.voz && !vozBuf.has(e.voz)) {
    vozBuf.set(e.voz, null);
    fetch(e.voz).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status)))).then((ab) => ac.decodeAudioData(ab)).then((b) => vozBuf.set(e.voz, b)).catch((err) => console.warn('[voz]', err.message || err));
  }
  for (const e of escenas) if (e.voz) sfx.push({ t: e.ini + 0.12, f: (when) => { const b = vozBuf.get(e.voz); if (!b) return; const src = ac.createBufferSource(); src.buffer = b; src.connect(vozG); src.start(when); } });
  sfx.sort((a, b) => a.t - b.t);
  let nextI = 0, sfxI = 0, silencio = false;
  const st = preset ? 60 / preset.bpm / 4 : 1;
  function reiniciar(v0) {
    nextI = preset ? Math.ceil(v0 / st) : 0;
    sfxI = Math.max(0, sfx.findIndex((x) => x.t >= v0 - 0.01)); if (sfx.findIndex((x) => x.t >= v0 - 0.01) < 0) sfxI = sfx.length;
    const n = ac.currentTime;
    mus.gain.cancelScheduledValues(n); mus.gain.setValueAtTime(MUS, n);
    mus.gain.setValueAtTime(MUS, n + Math.max(0, total - 0.8 - v0)); mus.gain.linearRampToValueAtTime(0.0001, n + Math.max(0.01, total - v0));
  }
  function programar(vNow) {
    if (silencio || ac.state !== 'running') return;
    if (preset) while (nextI * st < vNow + LOOK_AHEAD) { const vt = nextI * st; if (vt >= vNow - 0.02 && vt < total - 0.1) preset.fn(nextI, ac.currentTime + Math.max(0, vt - vNow), st); nextI++; }
    while (sfxI < sfx.length && sfx[sfxI].t < vNow + LOOK_AHEAD) { if (sfx[sfxI].t >= vNow - 0.02) sfx[sfxI].f(ac.currentTime + Math.max(0, sfx[sfxI].t - vNow)); sfxI++; }
  }
  return {
    ac, stream: dest.stream, reiniciar, programar,
    get silencio() { return silencio; },
    silenciar(s) { silencio = s; master.gain.setTargetAtTime(s ? 0 : 0.85, ac.currentTime, 0.02); },
    parlantes(v) { spk.gain.value = v; },
  };
}

function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16); const f = (c) => Math.max(0, Math.min(255, Math.round(c + (pct / 100) * 255)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function contrast(hex) {
  const n = parseInt(hex.slice(1), 16); const l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l > 150 ? '#141414' : '#ffffff';
}
