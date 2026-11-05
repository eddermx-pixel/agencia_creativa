// Oficina 2D en una estación espacial: astronautas que trabajan, flotan hasta la
// máquina de comida, van a tu escritorio cuando te necesitan y al muro del feed
// cuando entregan. Dibujo vectorial suave (sin pixeles gruesos) a 60 fps.
import { store, byId, esc, drawAstronaut } from './common.js';

const W = 1600, H = 1000;
const CORRIDOR = 505;
const DESKS = {
  investigador: { x: 260, y: 390 }, copy: { x: 560, y: 390 }, disenador: { x: 860, y: 390 },
  video: { x: 260, y: 640 }, calidad: { x: 560, y: 640 }, director: { x: 860, y: 640 },
};
const EXTRA_DESKS = [{ x: 260, y: 860 }, { x: 560, y: 860 }];
const BOSS = { x: 1250, y: 790 };
const BOSS_SLOTS = [{ x: 1150, y: 935 }, { x: 1250, y: 950 }, { x: 1350, y: 935 }, { x: 1060, y: 905 }, { x: 1440, y: 905 }];
const FEED = { x: 1290, y: 52, w: 250, h: 150 };
const FEED_SPOTS = [{ x: 1335, y: 300 }, { x: 1415, y: 305 }, { x: 1495, y: 300 }, { x: 1255, y: 310 }];
const FOOD_SPOTS = [{ x: 150, y: 335 }, { x: 150, y: 430 }, { x: 150, y: 470 }];
const WINDOWS = [{ x: 60, w: 270 }, { x: 370, w: 270 }, { x: 960, w: 270 }];
const LOGO = { x: 660, y: 50, w: 280, h: 140 };

const pendingReqs = (id) => store.requests.filter((r) => r.agente === id && r.estado === 'pendiente');
const pendingPieces = (id) => store.pieces.filter((p) => p.agente === id && p.estado === 'pendiente');
const rr = (ctx, x, y, w, h, r, fill) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); };

export function createOffice(container, { onAgent, onBoss, onFeed }) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  container.append(canvas);
  const overlay = document.createElement('div');
  overlay.className = 'ov';
  container.append(overlay);

  // ---------- Cámara: encaja la estación; en celular se arrastra ----------
  const cam = { s: 1, ox: 0, oy: 0 };
  let dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = container.clientWidth, ch = container.clientHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;
    const portrait = ch > cw;
    cam.s = portrait ? ch / H : Math.min(cw / W, ch / H);
    resetCamera();
  }
  function clamp() {
    const cw = container.clientWidth, ch = container.clientHeight;
    const vw = W * cam.s, vh = H * cam.s;
    cam.ox = vw <= cw ? (cw - vw) / 2 : Math.min(0, Math.max(cw - vw, cam.ox));
    cam.oy = vh <= ch ? (ch - vh) / 2 : Math.min(0, Math.max(ch - vh, cam.oy));
  }
  function resetCamera() {
    const cw = container.clientWidth;
    cam.ox = cw / 2 - 640 * cam.s; cam.oy = 0;
    clamp();
  }
  const toWorld = (sx, sy) => ({ x: (sx - cam.ox) / cam.s, y: (sy - cam.oy) / cam.s });

  // ---------- Estrellas ----------
  const stars = Array.from({ length: 170 }, () => ({ x: Math.random() * W, y: 40 + Math.random() * 150, r: Math.random() * 1.6 + 0.3, v: 4 + Math.random() * 10, p: Math.random() * 6 }));

  // ---------- Logo de la agencia ----------
  let logoImg = null, logoKey = '';
  function refreshLogo() {
    const a = store.agencia || {};
    const key = `${a.tieneLogo}-${a.actualizado}`;
    if (key === logoKey) return; logoKey = key;
    if (!a.tieneLogo) { logoImg = null; return; }
    const img = new Image();
    img.onload = () => { logoImg = img; };
    img.src = `/api/agency/logo?v=${a.actualizado}`;
  }

  // ---------- Personajes ----------
  const chars = {};
  function ensureChars() {
    store.roster.forEach((a, i) => {
      if (chars[a.id]) return;
      const desk = DESKS[a.id] || EXTRA_DESKS[i % EXTRA_DESKS.length];
      chars[a.id] = { id: a.id, desk, x: desk.x, y: desk.y + 24, path: [], target: null, seated: true, facing: 0, t: Math.random() * 10, nextSnack: performance.now() + 9000 + Math.random() * 30000, snackUntil: 0 };
    });
  }

  function spotFor(ch) {
    const st = store.agents[ch.id] || {};
    const reqs = store.requests.filter((r) => r.estado === 'pendiente');
    const ri = reqs.findIndex((r) => r.agente === ch.id);
    if (ri >= 0) {
      const s = BOSS_SLOTS[ri % BOSS_SLOTS.length];
      return { kind: 'boss', x: s.x, y: s.y, via: [{ x: 1000, y: CORRIDOR }, { x: 1000, y: s.y }], face: 'back' };
    }
    if (pendingPieces(ch.id).length) {
      const i = Object.keys(chars).filter((id) => pendingPieces(id).length).indexOf(ch.id);
      const s = FEED_SPOTS[i % FEED_SPOTS.length];
      return { kind: 'feed', x: s.x, y: s.y, via: [{ x: s.x, y: CORRIDOR }], face: 'back' };
    }
    const now = performance.now();
    if (!st.estado || st.estado === 'libre') {
      if (now > ch.nextSnack && !ch.snackUntil) { ch.snackUntil = now + 9000; ch.nextSnack = now + 35000 + Math.random() * 40000; }
      if (ch.snackUntil > now) {
        const s = FOOD_SPOTS[Object.keys(chars).indexOf(ch.id) % FOOD_SPOTS.length];
        return { kind: 'food', x: s.x, y: s.y, via: [{ x: s.x, y: CORRIDOR }], face: -1 };
      }
      ch.snackUntil = 0;
    } else ch.snackUntil = 0;
    const d = ch.desk;
    return { kind: 'desk', x: d.x, y: d.y + 24, via: [{ x: d.x + 125, y: CORRIDOR }, { x: d.x + 125, y: d.y + 24 }], face: 0 };
  }

  function route(ch, t) {
    const pts = [];
    if (ch.seated) pts.push({ x: ch.desk.x + 125, y: ch.y });
    const sx = pts.length ? pts[0].x : ch.x;
    pts.push({ x: sx, y: CORRIDOR }, ...t.via, { x: t.x, y: t.y });
    return pts;
  }

  function update(dt) {
    for (const ch of Object.values(chars)) {
      ch.t += dt;
      const t = spotFor(ch);
      if (!ch.target || ch.target.kind !== t.kind || ch.target.x !== t.x || ch.target.y !== t.y) {
        ch.target = t; ch.path = route(ch, t); ch.seated = false;
      }
      const wp = ch.path[0];
      if (wp) {
        const dx = wp.x - ch.x, dy = wp.y - ch.y, d = Math.hypot(dx, dy);
        // Acelera y frena suave en cada punto
        ch.v = Math.min(190, (ch.v || 0) + 600 * dt);
        const v = Math.min(ch.v, 60 + d * 4) * dt;
        if (d <= v || d < 0.5) { ch.x = wp.x; ch.y = wp.y; ch.path.shift(); }
        else { ch.x += (dx / d) * v; ch.y += (dy / d) * v; }
        if (Math.abs(dx) > 2) ch.facing = dx < 0 ? -1 : 1;
        else if (dy < 0) ch.facing = 'back';
        else ch.facing = 0;
        ch.walking = true;
      } else {
        ch.v = 0;
        ch.walking = false;
        ch.facing = t.face;
        ch.seated = t.kind === 'desk';
      }
    }
  }

  // ---------- Escenario ----------
  function drawRoom(time) {
    // Piso de estación
    const fg = ctx.createLinearGradient(0, 230, 0, H);
    fg.addColorStop(0, '#1d2036'); fg.addColorStop(1, '#141626');
    ctx.fillStyle = fg; ctx.fillRect(0, 230, W, H - 230);
    ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 2;
    for (let x = 0; x <= W; x += 100) { ctx.beginPath(); ctx.moveTo(x, 230); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 300; y <= H; y += 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // Pasillo con luces guía
    ctx.fillStyle = 'rgba(139,123,255,.06)'; ctx.fillRect(0, CORRIDOR - 30, W, 60);
    for (let x = 30; x < W; x += 80) {
      const a = 0.25 + 0.25 * Math.sin(time / 600 - x / 120);
      ctx.fillStyle = `rgba(139,123,255,${a})`; ctx.beginPath(); ctx.roundRect(x, CORRIDOR + 30, 26, 4, 2); ctx.fill();
    }
    // Pared
    const wg = ctx.createLinearGradient(0, 0, 0, 230);
    wg.addColorStop(0, '#262a44'); wg.addColorStop(1, '#1f2238');
    ctx.fillStyle = wg; ctx.fillRect(0, 0, W, 230);
    ctx.fillStyle = '#30345a'; ctx.fillRect(0, 222, W, 10);
    ctx.fillStyle = 'rgba(54,226,200,.65)'; ctx.fillRect(0, 230, W, 2);
    for (let x = 0; x < W; x += 160) { ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fillRect(x, 0, 2, 222); }

    // Ventanas al espacio
    for (const w of WINDOWS) {
      rr(ctx, w.x - 8, 32, w.w + 16, 166, 26, '#3a3f66');
      ctx.save();
      ctx.beginPath(); ctx.roundRect(w.x, 40, w.w, 150, 20); ctx.clip();
      const sg = ctx.createLinearGradient(0, 40, 0, 190); sg.addColorStop(0, '#05051a'); sg.addColorStop(1, '#130b33');
      ctx.fillStyle = sg; ctx.fillRect(w.x, 40, w.w, 150);
      for (const s of stars) {
        const sx = ((s.x - (time / 1000) * s.v) % W + W) % W;
        if (sx < w.x || sx > w.x + w.w) continue;
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time / 500 + s.p);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    // Planeta en la primera ventana
    ctx.save(); ctx.beginPath(); ctx.roundRect(WINDOWS[0].x, 40, WINDOWS[0].w, 150, 20); ctx.clip();
    const px = 230 + Math.sin(time / 9000) * 6;
    const pg = ctx.createRadialGradient(px - 18, 120, 6, px, 135, 60); pg.addColorStop(0, '#8be9ff'); pg.addColorStop(0.6, '#4b6cff'); pg.addColorStop(1, '#22195e');
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, 135, 55, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,140,.55)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(px, 138, 86, 16, -0.25, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    // Luna en la tercera
    ctx.save(); ctx.beginPath(); ctx.roundRect(WINDOWS[2].x, 40, WINDOWS[2].w, 150, 20); ctx.clip();
    ctx.fillStyle = '#d9d4ff'; ctx.beginPath(); ctx.arc(1175, 85, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.arc(1168, 80, 5, 0, Math.PI * 2); ctx.arc(1182, 92, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Logo en la pared (blanco sobre muro oscuro)
    rr(ctx, LOGO.x, LOGO.y, LOGO.w, LOGO.h, 18, 'rgba(10,10,24,.55)');
    if (logoImg) {
      const ar = (logoImg.naturalWidth || 3) / (logoImg.naturalHeight || 1);
      let w = LOGO.w - 40, h = w / ar;
      if (h > LOGO.h - 30) { h = LOGO.h - 30; w = h * ar; }
      ctx.shadowColor = 'rgba(139,123,255,.8)'; ctx.shadowBlur = 18;
      ctx.drawImage(logoImg, LOGO.x + (LOGO.w - w) / 2, LOGO.y + (LOGO.h - h) / 2, w, h);
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = '#fff'; ctx.font = '800 40px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(139,123,255,.9)'; ctx.shadowBlur = 16;
      ctx.fillText((store.agencia?.nombre || 'AGENCIA IA').toUpperCase(), LOGO.x + LOGO.w / 2, LOGO.y + LOGO.h / 2);
      ctx.shadowBlur = 0;
    }

    // Muro del feed (holograma)
    const pend = store.pieces.filter((p) => p.estado === 'pendiente');
    rr(ctx, FEED.x - 8, FEED.y - 8, FEED.w + 16, FEED.h + 16, 18, '#3a3f66');
    const hg = ctx.createLinearGradient(FEED.x, FEED.y, FEED.x + FEED.w, FEED.y + FEED.h);
    hg.addColorStop(0, '#1b1450'); hg.addColorStop(1, '#0b3340');
    rr(ctx, FEED.x, FEED.y, FEED.w, FEED.h, 12, hg);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#c9c7da'; ctx.font = '700 18px system-ui, sans-serif'; ctx.fillText('FEED', FEED.x + 16, FEED.y + 30);
    ctx.fillStyle = pend.length ? '#ffb547' : '#6f6d85'; ctx.font = '800 64px system-ui, sans-serif'; ctx.fillText(String(pend.length), FEED.x + 16, FEED.y + 100);
    ctx.fillStyle = '#9a98ad'; ctx.font = '500 14px system-ui, sans-serif'; ctx.fillText('por revisar', FEED.x + 18, FEED.y + 128);
    const cols = { arte: '#e84393', video: '#0984e3', texto: '#fdcb6e' };
    pend.slice(0, 6).forEach((p, i) => {
      const bob = Math.sin(time / 400 + i) * 2;
      rr(ctx, FEED.x + 130 + (i % 3) * 38, FEED.y + 22 + Math.floor(i / 3) * 58 + bob, 30, 46, 6, cols[p.tipo] || '#8b7bff');
    });
    ctx.fillStyle = 'rgba(255,255,255,.05)'; for (let y = FEED.y; y < FEED.y + FEED.h; y += 6) ctx.fillRect(FEED.x, y + ((time / 40) % 6), FEED.w, 1);

    // Dispensador de comida espacial
    rr(ctx, 30, 250, 80, 150, 16, '#3a3f66');
    rr(ctx, 42, 266, 56, 60, 10, '#0c0f22');
    ctx.fillStyle = `rgba(54,226,200,${0.5 + 0.3 * Math.sin(time / 300)})`; ctx.beginPath(); ctx.arc(70, 296, 10, 0, Math.PI * 2); ctx.fill();
    rr(ctx, 46, 340, 48, 40, 8, '#262a44');
    ctx.fillStyle = '#c9c7da'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('SNACKS', 70, 395);

    // Sala de descanso: cápsulas y plantas con luz
    ctx.fillStyle = 'rgba(139,123,255,.08)'; ctx.beginPath(); ctx.ellipse(330, 905, 230, 70, 0, 0, Math.PI * 2); ctx.fill();
    rr(ctx, 170, 860, 320, 70, 34, '#4b3fb3');
    rr(ctx, 170, 845, 320, 30, 15, '#5b4bd6');
    rr(ctx, 300, 900, 60, 26, 10, '#262a44');
    for (const [x, y] of [[40, 960], [1560, 960], [1560, 440], [960, 300]]) plant(x, y, time);
  }

  function plant(x, y, time) {
    rr(ctx, x - 22, y - 34, 44, 36, 10, '#e9e6f2');
    ctx.fillStyle = 'rgba(54,226,200,.6)'; ctx.fillRect(x - 22, y - 30, 44, 3);
    const sway = Math.sin(time / 900 + x) * 3;
    ctx.fillStyle = '#3ccf8e';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.ellipse(x + (i - 2) * 9 + sway * (i / 4), y - 48 - (i % 2) * 14, 9, 22, (i - 2) * 0.35, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawChair(d, big = false) {
    const w = big ? 70 : 56;
    rr(ctx, d.x - w / 2, d.y - 78, w, 60, 16, big ? '#5b4bd6' : '#3d4266');
    rr(ctx, d.x - w / 2 + 6, d.y - 72, w - 12, 8, 4, 'rgba(255,255,255,.08)');
  }

  function drawDesk(d, working, accent, time, big = false) {
    const w = big ? 220 : 170;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(d.x, d.y + 62, w * 0.45, 10, 0, 0, Math.PI * 2); ctx.fill();
    // Holograma de pantalla a un lado (no tapa la cara)
    const hx = d.x - w / 2 + 8, hy = d.y - 92;
    ctx.save();
    ctx.globalAlpha = working ? 0.85 + 0.1 * Math.sin(time / 200) : 0.35;
    const g = ctx.createLinearGradient(hx, hy, hx, hy + 62);
    g.addColorStop(0, working ? 'rgba(94,200,255,.55)' : 'rgba(120,120,160,.25)'); g.addColorStop(1, 'rgba(94,200,255,.05)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + 54, hy - 8); ctx.lineTo(hx + 54, hy + 52); ctx.lineTo(hx, hy + 60); ctx.closePath(); ctx.fill();
    if (working) {
      ctx.fillStyle = 'rgba(220,245,255,.8)';
      for (let i = 0; i < 5; i++) { const ly = hy + 8 + ((i * 11 + time / 50) % 48); ctx.fillRect(hx + 6, ly, 12 + ((i * 17) % 28), 2); }
    }
    ctx.restore();
    // Cubierta
    const top = ctx.createLinearGradient(0, d.y - 14, 0, d.y + 16);
    top.addColorStop(0, '#4a5079'); top.addColorStop(1, '#2f3352');
    rr(ctx, d.x - w / 2, d.y - 14, w, 30, 12, top);
    rr(ctx, d.x - w / 2 + 6, d.y - 12, w - 12, 4, 2, 'rgba(255,255,255,.12)');
    // Frente con tira de luz del color del agente
    rr(ctx, d.x - w / 2 + 8, d.y + 14, w - 16, 40, 10, '#1d2036');
    ctx.globalAlpha = working ? 0.75 + 0.25 * Math.sin(time / 250) : 0.25;
    rr(ctx, d.x - w / 2 + 20, d.y + 30, w - 40, 4, 2, accent);
    ctx.globalAlpha = 1;
    // Teclado de luz y taza
    rr(ctx, d.x - 26, d.y - 8, 52, 8, 3, working ? 'rgba(139,123,255,.7)' : 'rgba(139,123,255,.25)');
    rr(ctx, d.x + w / 2 - 30, d.y - 26, 14, 16, 4, '#e9e6f2');
  }

  // ---------- Etiquetas HTML ----------
  const tags = {};
  function tagFor(id) {
    if (tags[id]) return tags[id];
    const el = document.createElement('div');
    el.className = 'atag';
    el.innerHTML = '<div class="bub"></div><div class="nm"></div>';
    el.onclick = (e) => { e.stopPropagation(); id === 'boss' ? onBoss() : onAgent(id); };
    overlay.append(el);
    return (tags[id] = el);
  }
  function placeTags() {
    const small = container.clientWidth < 640;
    const list = [...Object.values(chars).map((c) => ({ id: c.id, x: c.x, y: c.y - 172 })), { id: 'boss', x: BOSS.x, y: BOSS.y - 150 }];
    for (const it of list) {
      const el = tagFor(it.id);
      el.style.transform = `translate(${it.x * cam.s + cam.ox}px, ${it.y * cam.s + cam.oy}px) translate(-50%, -100%)`;
      el.style.zIndex = String(Math.round(it.y));
      let name, bub = '', cls = '';
      if (it.id === 'boss') {
        const n = store.requests.filter((r) => r.estado === 'pendiente').length;
        name = `Tú${n ? ` · ${n}` : ''}`; cls = n ? 'boss alert' : 'boss';
      } else {
        const a = byId(it.id); const st = store.agents[it.id] || {};
        name = a?.nombre || it.id;
        const req = pendingReqs(it.id)[0];
        if (req) {
          const icon = { autorizacion: '🔐', cuestionario: '📝', concepto: '💡' }[req.tipo] || '❓';
          bub = `<b>${icon}</b> ${esc(small ? '' : req.texto)}`; cls = 'alert';
        } else if (pendingPieces(it.id).length) { bub = small ? '📱' : '📱 Esperando tu swipe'; cls = 'feed'; }
        else if (st.estado === 'trabajando' && st.burbuja) { bub = small ? '💬' : esc(st.burbuja); cls = 'work'; }
        else if (!st.estado || st.estado === 'libre') cls = 'idle';
      }
      const key = `${name}|${bub}|${cls}`;
      if (el.dataset.key !== key) {
        el.dataset.key = key;
        el.className = `atag ${cls}`;
        el.querySelector('.nm').textContent = name;
        const b = el.querySelector('.bub');
        b.innerHTML = bub; b.hidden = !bub;
      }
    }
  }

  // ---------- Clic y arrastre ----------
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ox: cam.ox, oy: cam.oy, moved: false }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    cam.ox = drag.ox + dx; cam.oy = drag.oy + dy; clamp();
  });
  canvas.addEventListener('pointerup', (e) => {
    const d = drag; drag = null;
    if (!d || d.moved) return;
    const r = canvas.getBoundingClientRect();
    const p = toWorld(e.clientX - r.left, e.clientY - r.top);
    let best = null, bd = 70;
    for (const ch of Object.values(chars)) { const dist = Math.hypot(ch.x - p.x, ch.y - 80 - p.y); if (dist < bd) { bd = dist; best = ch; } }
    if (best) return onAgent(best.id);
    if (p.x > FEED.x - 10 && p.x < FEED.x + FEED.w + 10 && p.y < FEED.y + FEED.h + 10) return onFeed();
    if (Math.abs(p.x - BOSS.x) < 120 && Math.abs(p.y - BOSS.y + 40) < 100) return onBoss();
  });
  canvas.addEventListener('pointercancel', () => { drag = null; });

  // ---------- Bucle ----------
  new ResizeObserver(resize).observe(container);
  resize();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ensureChars(); update(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0b12'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(cam.s * dpr, 0, 0, cam.s * dpr, cam.ox * dpr, cam.oy * dpr);
    drawRoom(now);
    const items = [];
    for (const [id, ch] of Object.entries(chars)) {
      const d = ch.desk, a = byId(id), working = store.agents[id]?.estado === 'trabajando';
      items.push({ y: d.y - 1, draw: () => drawChair(d) });
      items.push({ y: d.y + 30, draw: () => drawDesk(d, working, a?.look.camisa || '#8b7bff', now) });
      items.push({ y: ch.y, draw: () => drawAstronaut(ctx, ch.x, ch.y, a.look, { t: ch.t, walking: ch.walking, facing: ch.facing, sitting: ch.seated, typing: ch.seated && working, wave: !ch.walking && ch.target?.kind === 'boss', glow: working || pendingReqs(id).length > 0, scale: 1.15 }) });
      if (!ch.walking && pendingReqs(id).length) items.push({ y: ch.y - 0.5, draw: () => { ctx.strokeStyle = `rgba(255,181,71,${0.5 + 0.4 * Math.sin(now / 180)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(ch.x, ch.y, 34, 10, 0, 0, Math.PI * 2); ctx.stroke(); } });
    }
    const alert = store.requests.some((r) => r.estado === 'pendiente');
    items.push({ y: BOSS.y - 1, draw: () => drawChair(BOSS, true) });
    items.push({ y: BOSS.y + 24, draw: () => drawAstronaut(ctx, BOSS.x, BOSS.y + 24, { camisa: '#8b7bff', piel: '#e0ac69', pelo: '#1b1b1b', peinado: 'corto' }, { t: now / 1000, sitting: true, typing: true, glow: alert, scale: 1.15 }) });
    items.push({ y: BOSS.y + 30, draw: () => drawDesk(BOSS, alert, alert ? '#ffb547' : '#8b7bff', now, true) });
    items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());
    placeTags();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { refresh() { refreshLogo(); }, resetCamera };
}
