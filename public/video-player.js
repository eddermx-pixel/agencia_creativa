// Reproductor del guion de video (motor v2): tomas reales (B-roll) con movimiento
// de cámara, transiciones, textos animados, subtítulos palabra por palabra,
// logo y cierre con llamado a la acción. Exporta el video desde el navegador.

const FORMATOS = { '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080], '16:9': [1920, 1080] };
const TR = 0.45; // duración de las transiciones (s)
const CIERRE = 2.6;
const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const back = (x) => { const c = 1.7; x = Math.min(1, Math.max(0, x)); return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

export async function createPlayer(canvas, spec, { logoUrl = null, fileUrl = (r) => r, onTime = null } = {}) {
  const [W, H] = FORMATOS[spec.formato] || FORMATOS['9:16'];
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const P = spec.paleta || { fondo: '#1d1a4f', texto: '#ffffff', acento: '#ffb547' };
  const font = (px, w = 900) => `${w} ${px}px "${spec.fuente || 'Arial Black'}", "Arial Black", Impact, sans-serif`;

  // Línea de tiempo
  let acc = 0;
  const escenas = spec.escenas.map((e) => { const s = { ...e, ini: acc }; acc += e.duracion; return s; });
  const total = acc + CIERRE;

  // Recursos: videos (por el proxy para poder exportar), imágenes y logo
  const loadImg = (src) => new Promise((ok) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  for (const e of escenas) {
    if (e.fondo?.tipo === 'broll' && e.fondo.clip?.url) {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous'; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      v.src = `/api/broll/proxy?u=${encodeURIComponent(e.fondo.clip.url)}`;
      e.video = v;
      if (e.fondo.clip.poster) loadImg(`/api/broll/proxy?u=${encodeURIComponent(e.fondo.clip.poster)}`).then((i) => (e.poster = i));
    } else if (e.fondo?.tipo === 'archivo' && e.fondo.ruta) {
      e.img = await loadImg(fileUrl(e.fondo.ruta));
    }
  }
  const logo = logoUrl ? await loadImg(logoUrl) : null;

  // ---------- Dibujo ----------
  function cover(src, sw, sh, zoom = 1, ox = 0) {
    const s = Math.max(W / sw, H / sh) * zoom;
    const w = sw * s, h = sh * s;
    ctx.drawImage(src, (W - w) / 2 + ox, (H - h) / 2, w, h);
  }
  function fondo(e, local) {
    const k = 1 + 0.12 * (local / e.duracion); // cámara lenta hacia adelante
    const v = e.video;
    if (v && v.readyState >= 2) cover(v, v.videoWidth, v.videoHeight, k);
    else if (e.poster) cover(e.poster, e.poster.width, e.poster.height, k);
    else if (e.img) cover(e.img, e.img.width, e.img.height, k);
    else {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, P.fondo); g.addColorStop(1, shade(P.fondo, -35));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.15; ctx.fillStyle = P.acento;
      ctx.beginPath(); ctx.arc(W * 0.8 - local * 30, H * 0.2, W * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(W * 0.15, H * 0.85 + local * 20, W * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Velo para que el texto se lea sobre cualquier toma
    if (v || e.img || e.poster) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(0.35, 'rgba(0,0,0,.1)'); g.addColorStop(0.65, 'rgba(0,0,0,.15)'); g.addColorStop(1, 'rgba(0,0,0,.6)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  }
  function wrap(text, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean); const lines = []; let line = '';
    for (const w of words) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    return lines;
  }
  function titulo(e, local) {
    if (!e.texto) return;
    const p = local / Math.min(0.6, e.duracion * 0.4);
    const size = Math.round(W * (e.texto.length > 28 ? 0.085 : 0.11));
    ctx.font = font(size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let txt = e.texto.toUpperCase();
    if (e.animacion === 'typewriter') txt = txt.slice(0, Math.ceil(txt.length * Math.min(1, local / (e.duracion * 0.6))));
    const lines = wrap(txt, W * 0.84);
    const lh = size * 1.08; const y0 = H * 0.42 - ((lines.length - 1) * lh) / 2;
    ctx.save();
    let sc = 1, dy = 0, alpha = 1;
    if (e.animacion === 'pop') sc = back(p);
    if (e.animacion === 'zoom') { sc = 0.6 + 0.4 * ease(p); alpha = ease(p); }
    if (e.animacion === 'slide') { dy = (1 - ease(p)) * H * 0.18; alpha = ease(p); }
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, H * 0.42 + dy); ctx.scale(sc, sc); ctx.translate(-W / 2, -H * 0.42);
    lines.forEach((l, i) => {
      let y = y0 + i * lh;
      if (e.animacion === 'bounce') y -= Math.abs(Math.sin(local * 7 + i)) * size * 0.12;
      ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.14; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(l, W / 2, y);
      ctx.fillStyle = i === lines.length - 1 && lines.length > 1 ? P.acento : P.texto; ctx.fillText(l, W / 2, y);
    });
    ctx.restore();
  }
  function subtitulos(e, local) {
    if (spec.subtitulos === 'ninguno' || !e.subtitulo) return;
    const words = e.subtitulo.split(/\s+/).filter(Boolean);
    const size = Math.round(W * 0.055);
    ctx.font = font(size, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const y = H * 0.78;
    if (spec.subtitulos === 'bloque') {
      const lines = wrap(e.subtitulo, W * 0.8);
      lines.forEach((l, i) => { const yy = y + i * size * 1.2; ctx.lineWidth = size * 0.18; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(l, W / 2, yy); ctx.fillStyle = '#fff'; ctx.fillText(l, W / 2, yy); });
      return;
    }
    // Palabra por palabra: ventana de 4 palabras con la actual resaltada
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
  function marca(mostrarGrande) {
    if (!logo) return;
    const w = mostrarGrande ? W * 0.42 : W * 0.16; const h = (w / logo.width) * logo.height;
    ctx.globalAlpha = mostrarGrande ? 1 : 0.9;
    ctx.drawImage(logo, mostrarGrande ? (W - w) / 2 : W * 0.06, mostrarGrande ? H * 0.2 : H * 0.05, w, h);
    ctx.globalAlpha = 1;
  }
  function credito(e) {
    if (!e.fondo?.clip?.autor) return;
    ctx.font = `600 ${Math.round(W * 0.018)}px Arial, sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillText(`Video: ${e.fondo.clip.autor} / Pexels`, W * 0.96, H * 0.985);
  }
  function progreso(t) {
    const n = escenas.length + 1; const gap = 8; const w = (W * 0.9 - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const ini = i < escenas.length ? escenas[i].ini : acc; const dur = i < escenas.length ? escenas[i].duracion : CIERRE;
      const f = Math.min(1, Math.max(0, (t - ini) / dur));
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(W * 0.05 + i * (w + gap), H * 0.02, w, 6);
      ctx.fillStyle = '#fff'; ctx.fillRect(W * 0.05 + i * (w + gap), H * 0.02, w * f, 6);
    }
  }
  function escena(e, local) { fondo(e, local); titulo(e, local); subtitulos(e, local); credito(e); if (e.logo) marca(false); }
  function cierre(local) {
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, P.fondo); g.addColorStop(1, shade(P.fondo, -40));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (spec.cierre?.logo !== false) marca(true);
    const p = back(local / 0.5);
    const cta = (spec.cierre?.cta || '').toUpperCase();
    if (cta) {
      ctx.font = font(Math.round(W * 0.075)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(cta).width + W * 0.12; const y = H * 0.62;
      ctx.save(); ctx.translate(W / 2, y); ctx.scale(p, p);
      ctx.fillStyle = P.acento; ctx.beginPath(); ctx.roundRect(-tw / 2, -W * 0.07, tw, W * 0.14, W * 0.07); ctx.fill();
      ctx.fillStyle = contrast(P.acento); ctx.fillText(cta, 0, 4);
      ctx.restore();
    }
  }

  // Transición: cómo entra la escena actual desde la anterior
  function transicion(tipo, p, dibujaPrev, dibujaAct) {
    const q = ease(p);
    if (tipo === 'fundido') { dibujaPrev(); ctx.globalAlpha = q; dibujaAct(); ctx.globalAlpha = 1; return; }
    if (tipo === 'deslizar') { ctx.save(); ctx.translate(-W * q, 0); dibujaPrev(); ctx.restore(); ctx.save(); ctx.translate(W * (1 - q), 0); dibujaAct(); ctx.restore(); return; }
    if (tipo === 'zoom') { dibujaPrev(); ctx.save(); ctx.globalAlpha = q; const s = 1.35 - 0.35 * q; ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2); dibujaAct(); ctx.restore(); ctx.globalAlpha = 1; return; }
    if (tipo === 'barrido') { dibujaPrev(); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W * q, H); ctx.clip(); dibujaAct(); ctx.restore(); ctx.fillStyle = P.acento; ctx.fillRect(W * q - 12, 0, 24, H); return; }
    if (tipo === 'glitch') {
      dibujaAct();
      if (p < 0.6) for (let k = 0; k < 7; k++) { const y = Math.random() * H; const h = 20 + Math.random() * 90; ctx.drawImage(canvas, 0, y, W, h, (Math.random() - 0.5) * 80, y, W, h); }
      if (p < 0.4) { ctx.fillStyle = `rgba(255,0,80,${0.18 * (1 - p)})`; ctx.fillRect(0, 0, W, H); }
      return;
    }
    if (tipo === 'flash') { (p < 0.5 ? dibujaPrev : dibujaAct)(); ctx.fillStyle = `rgba(255,255,255,${1 - Math.abs(p - 0.5) * 2})`; ctx.fillRect(0, 0, W, H); return; }
    dibujaAct();
  }

  function frame(t) {
    ctx.clearRect(0, 0, W, H);
    if (t >= acc) {
      const prev = escenas.at(-1); const local = t - acc;
      if (local < TR) transicion('fundido', local / TR, () => escena(prev, prev.duracion), () => cierre(local));
      else cierre(local);
    } else {
      let i = escenas.findIndex((e) => t >= e.ini && t < e.ini + e.duracion);
      if (i < 0) i = escenas.length - 1;
      const e = escenas[i]; const local = Math.min(e.duracion, t - e.ini);
      if (i > 0 && local < TR && e.transicion !== 'corte') {
        const prev = escenas[i - 1];
        transicion(e.transicion, local / TR, () => escena(prev, prev.duracion), () => escena(e, local));
      } else escena(e, local);
    }
    progreso(t);
  }

  // ---------- Reproducción ----------
  let t0 = performance.now(), playing = true, raf = 0, ultimaEscena = -1, pausedAt = 0;
  function syncVideos(t) {
    const i = t >= acc ? -1 : escenas.findIndex((e) => t >= e.ini && t < e.ini + e.duracion);
    if (i === ultimaEscena) return;
    ultimaEscena = i;
    escenas.forEach((e, k) => {
      if (!e.video) return;
      if (k === i || k === i + 1) { if (k === i) { try { e.video.currentTime = 0; } catch {} } e.video.play().catch(() => {}); }
      else e.video.pause();
    });
  }
  function loop(now) {
    if (playing) {
      const t = ((now - t0) / 1000) % total;
      syncVideos(t); frame(t); onTime?.(t, total);
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return {
    total,
    play() { if (!playing) { t0 = performance.now() - pausedAt * 1000; playing = true; } },
    pause() { if (playing) { pausedAt = ((performance.now() - t0) / 1000) % total; playing = false; escenas.forEach((e) => e.video?.pause()); } },
    restart() { t0 = performance.now(); ultimaEscena = -1; playing = true; },
    destroy() { cancelAnimationFrame(raf); escenas.forEach((e) => { e.video?.pause(); if (e.video) e.video.src = ''; }); },
    // Graba una vuelta completa del video (en tiempo real) y devuelve el archivo.
    async exportar(onProgress) {
      const tipos = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
      const mime = tipos.find((m) => window.MediaRecorder?.isTypeSupported?.(m));
      if (!mime) throw new Error('Este navegador no puede grabar video. Prueba con Chrome o Safari actualizados.');
      const stream = canvas.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
      const chunks = []; rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
      const done = new Promise((ok) => (rec.onstop = ok));
      this.restart(); rec.start(250);
      const t = setInterval(() => onProgress?.(Math.min(1, (performance.now() - t0) / 1000 / total)), 200);
      await new Promise((ok) => setTimeout(ok, total * 1000 + 200));
      rec.stop(); clearInterval(t); await done;
      return { blob: new Blob(chunks, { type: mime.split(';')[0] }), ext: mime.includes('mp4') ? 'mp4' : 'webm' };
    },
  };
}

function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16); const f = (c) => Math.max(0, Math.min(255, Math.round(c + (pct / 100) * 255)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function contrast(hex) {
  const n = parseInt(hex.slice(1), 16); const l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l > 150 ? '#141414' : '#ffffff';
}
