// Oficina 2D en una estación espacial: astronautas que trabajan, flotan hasta la
// máquina de comida, van a tu escritorio cuando te necesitan y al muro del feed
// cuando entregan. Dibujo vectorial suave (sin pixeles gruesos) a 60 fps.
import { store, byId, esc, drawCrew, JEFE } from './common.js';

const W = 1600, H = 1000;
const CORRIDOR = 505;
// Distribución inspirada en la oficina real: estaciones de trabajo al centro,
// cafetería con barra a la izquierda, sala de juntas y lounge con TV abajo,
// acuario a la derecha y tu escritorio abajo a la derecha.
const DESKS = {
  investigador: { x: 400, y: 390 }, copy: { x: 660, y: 390 }, disenador: { x: 920, y: 390 },
  video: { x: 400, y: 640 }, calidad: { x: 660, y: 640 }, director: { x: 920, y: 640 }, editor2: { x: 1180, y: 390 },
};
const EXTRA_DESKS = [{ x: 1180, y: 390 }, { x: 1180, y: 640 }];
const BOSS = { x: 1250, y: 790 };
const BOSS_SLOTS = [{ x: 1150, y: 935 }, { x: 1250, y: 950 }, { x: 1350, y: 935 }, { x: 1080, y: 905 }, { x: 1440, y: 905 }];
const FEED = { x: 1290, y: 52, w: 250, h: 150 };
const FEED_SPOTS = [{ x: 1335, y: 300 }, { x: 1415, y: 305 }, { x: 1495, y: 300 }, { x: 1255, y: 310 }];
const WINDOWS = [{ x: 60, w: 270 }, { x: 370, w: 270 }, { x: 960, w: 270 }];
const LOGO = { x: 660, y: 50, w: 280, h: 140 };
// Cafetería: barra con 3 bancos (como la oficina real)
const BAR = { x: 140, y: 300, w: 46, h: 250 };
const STOOLS = [{ x: 238, y: 365 }, { x: 238, y: 445 }, { x: 238, y: 525 }];
// Sala de juntas: mesa larga con 8 sillas, pantalla de proyector y bocina
const TABLE = { x: 300, y: 885, rx: 205, ry: 40 };
const SCREEN = { x: 175, y: 712, w: 250, h: 62 };
const SEATS = [
  { x: 300, y: 838, face: 0 }, { x: 175, y: 840, face: 0 }, { x: 425, y: 840, face: 0 },
  { x: 70, y: 890, face: 1 }, { x: 530, y: 890, face: -1 }, { x: 205, y: 948, face: 'back' }, { x: 395, y: 948, face: 'back' },
];
const CHAIRS = [[175, 828], [300, 826], [425, 828], [205, 940], [395, 940], [300, 944], [70, 882], [530, 882]];
// Lounge con TV y lámparas
const TV = { x: 700, y: 712, w: 200, h: 100 };
const SOFA = { x: 690, y: 920, w: 220, h: 60 };
const SOFA_SPOTS = [{ x: 735, y: 945 }, { x: 800, y: 948 }, { x: 865, y: 945 }];
// Acuario espacial
const AQUA = { x: 1470, y: 560, w: 115, h: 160 };
const AQUA_SPOTS = [{ x: 1500, y: 790 }, { x: 1560, y: 795 }];
const fish = Array.from({ length: 6 }, (_, i) => ({ y: AQUA.y + 30 + i * 21, v: 12 + Math.random() * 18, p: Math.random() * 100, c: ['#ff9f43', '#36e2c8', '#ff6fae', '#ffd166', '#8b7bff', '#4aa3ff'][i] }));

const pendingReqs = (id) => store.requests.filter((r) => r.agente === id && r.estado === 'pendiente');
const pendingPieces = (id) => store.pieces.filter((p) => p.agente === id && p.estado === 'pendiente');
const rr = (ctx, x, y, w, h, r, fill) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); };

export function createOffice(container, { onAgent, onBoss, onFeed, onPC, onTV }) {
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
      chars[a.id] = { id: a.id, desk, x: desk.x, y: desk.y + 24, path: [], target: null, seated: true, facing: 0, t: Math.random() * 10, nextBreak: performance.now() + 8000 + Math.random() * 30000, breakUntil: 0, breakKind: null };
    });
  }

  function spotFor(ch) {
    const st = store.agents[ch.id] || {};
    const ids = Object.keys(chars);
    const reqs = store.requests.filter((r) => r.estado === 'pendiente');
    const ri = reqs.findIndex((r) => r.agente === ch.id);
    if (ri >= 0) {
      const s = BOSS_SLOTS[ri % BOSS_SLOTS.length];
      return { kind: 'boss', x: s.x, y: s.y, via: [{ x: 1060, y: CORRIDOR }, { x: 1060, y: s.y }], face: 'back' };
    }
    if (pendingPieces(ch.id).length) {
      const i = ids.filter((id) => pendingPieces(id).length).indexOf(ch.id);
      const s = FEED_SPOTS[i % FEED_SPOTS.length];
      return { kind: 'feed', x: s.x, y: s.y, via: [{ x: s.x, y: CORRIDOR }], face: 'back' };
    }
    if (st.estado === 'junta') {
      const s = SEATS[Math.max(0, store.roster.findIndex((a) => a.id === ch.id)) % SEATS.length];
      const lane = s.face === 'back' ? [{ x: 545, y: 800 }, { x: 545, y: 990 }, { x: s.x, y: 990 }] : [{ x: 545, y: 800 }, { x: s.x, y: 800 }];
      return { kind: 'junta', x: s.x, y: s.y, via: [{ x: 545, y: CORRIDOR }, ...lane], face: s.face };
    }
    const now = performance.now();
    if (!st.estado || st.estado === 'libre') {
      if (now > ch.nextBreak && !ch.breakUntil) {
        ch.breakKind = ['cafe', 'cafe', 'tv', 'acuario'][Math.floor(Math.random() * 4)];
        ch.breakUntil = now + 10000 + Math.random() * 6000;
        ch.nextBreak = now + 30000 + Math.random() * 40000;
      }
      if (ch.breakUntil > now) {
        const i = ids.indexOf(ch.id);
        if (ch.breakKind === 'cafe') { const s = STOOLS[i % STOOLS.length]; return { kind: 'cafe', x: s.x, y: s.y, via: [{ x: s.x, y: CORRIDOR }], face: -1 }; }
        if (ch.breakKind === 'tv') { const s = SOFA_SPOTS[i % SOFA_SPOTS.length]; return { kind: 'tv', x: s.x, y: s.y, via: [{ x: 1045, y: CORRIDOR }, { x: 1045, y: 880 }, { x: s.x, y: 880 }], face: 'back' }; }
        const s = AQUA_SPOTS[i % AQUA_SPOTS.length]; return { kind: 'acuario', x: s.x, y: s.y, via: [{ x: 1420, y: CORRIDOR }, { x: 1420, y: s.y }], face: 'back' };
      }
      ch.breakUntil = 0;
    } else ch.breakUntil = 0;
    const d = ch.desk;
    return { kind: 'desk', x: d.x, y: d.y + 24, via: [{ x: d.x + 125, y: CORRIDOR }, { x: d.x + 125, y: d.y + 24 }], face: 0 };
  }

  // Para salir de un lugar se deshace el camino de llegada (así nadie atraviesa muebles).
  function route(ch, t) {
    const back = ch.target ? [...ch.target.via].reverse() : [{ x: ch.x, y: CORRIDOR }];
    return [...back, ...t.via, { x: t.x, y: t.y }];
  }

  function update(dt) {
    for (const ch of Object.values(chars)) {
      ch.t += dt;
      const t = spotFor(ch);
      if (!ch.target || ch.target.kind !== t.kind || ch.target.x !== t.x || ch.target.y !== t.y) {
        ch.path = route(ch, t); ch.target = t; ch.seated = false;
      }
      const wp = ch.path[0];
      if (wp) {
        const dx = wp.x - ch.x, dy = wp.y - ch.y, d = Math.hypot(dx, dy);
        // Acelera y frena suave en cada punto
        ch.v = Math.min(240, (ch.v || 0) + 700 * dt);
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
        ch.seated = ['desk', 'cafe', 'tv'].includes(t.kind);
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

    // Zona de juntas, lounge y cafetería: alfombras de luz y letreros
    const enJunta = Object.values(store.agents).some((a) => a.estado === 'junta');
    ctx.fillStyle = enJunta ? `rgba(139,123,255,${0.13 + 0.05 * Math.sin(time / 400)})` : 'rgba(139,123,255,.06)';
    ctx.beginPath(); ctx.roundRect(20, 700, 560, 292, 30); ctx.fill();
    ctx.fillStyle = 'rgba(54,226,200,.05)'; ctx.beginPath(); ctx.roundRect(615, 700, 340, 292, 30); ctx.fill();
    ctx.fillStyle = 'rgba(255,181,71,.05)'; ctx.beginPath(); ctx.roundRect(10, 240, 290, 330, 24); ctx.fill();
    ctx.fillStyle = 'rgba(201,199,218,.5)'; ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('☕ CAFETERÍA', 22, 590); ctx.fillText('🗣️ SALA DE JUNTAS', 34, 724); ctx.fillText('📺 LOUNGE', 630, 984);
    drawKitchen(time);
    drawScreen(time, enJunta);
    drawTV(time);
    drawAquarium(time);
    // Bocina de la sala de juntas
    rr(ctx, 30, 760, 34, 52, 8, '#262a44');
    for (const [cy, r] of [[776, 8], [798, 6]]) { ctx.fillStyle = '#141626'; ctx.beginPath(); ctx.arc(47, cy, r, 0, Math.PI * 2); ctx.fill(); }
    if (enJunta) for (let k = 1; k <= 2; k++) { ctx.strokeStyle = `rgba(139,123,255,${0.5 - ((time / 900 + k / 2) % 1) * 0.5})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(47, 786, 20 + ((time / 900 + k / 2) % 1) * 22, -0.6, 0.6); ctx.stroke(); }
    // Plantas: palmera, monstera, dracena y macetas como en la oficina real
    palm(565, 995, time); monstera(1555, 990, time); dracena(1565, 470, time);
    for (const [x, y] of [[1385, 1000], [990, 1000]]) plant(x, y, time);
    lamp(632, 900, time); lamp(940, 900, time);
  }

  // ---------- Amenidades ----------
  function drawKitchen(time) {
    // Refrigerador con imanes
    rr(ctx, 18, 248, 82, 150, 12, '#dfe3f0');
    ctx.fillStyle = '#c3c9db'; ctx.fillRect(18, 300, 82, 3);
    rr(ctx, 88, 260, 5, 30, 2, '#9aa1bb'); rr(ctx, 88, 312, 5, 50, 2, '#9aa1bb');
    for (const [x, y, c] of [[34, 270, '#8b7bff'], [52, 280, '#ff6fae'], [40, 330, '#36e2c8']]) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); }
    // Barra lateral con cafetera, microondas y galletas
    rr(ctx, 18, 410, 92, 150, 12, '#3a3f66');
    rr(ctx, 18, 410, 92, 10, 6, '#4a5079');
    rr(ctx, 30, 428, 66, 36, 6, '#1a1c2c');
    ctx.fillStyle = `rgba(255,214,120,${0.25 + 0.15 * Math.sin(time / 500)})`; ctx.fillRect(36, 434, 40, 24);
    rr(ctx, 80, 436, 10, 20, 3, '#2b2e45');
    rr(ctx, 36, 480, 34, 46, 7, '#1a1c2c');
    ctx.fillStyle = '#ff5d6c'; ctx.beginPath(); ctx.arc(62, 490, 3, 0, Math.PI * 2); ctx.fill();
    rr(ctx, 46, 512, 14, 12, 3, '#e9e6f2');
    // Vapor de la cafetera cuando hay alguien en la barra
    const hayCafe = Object.values(chars).some((c) => c.target?.kind === 'cafe' && !c.walking);
    if (hayCafe) for (let k = 0; k < 3; k++) { const ph = (time / 1200 + k / 3) % 1; ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - ph)})`; ctx.beginPath(); ctx.arc(53 + Math.sin(ph * 6 + k) * 4, 508 - ph * 34, 4 + ph * 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#e9e6f2'; ctx.beginPath(); ctx.ellipse(90, 540, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c98b4f'; for (const dx of [-6, 0, 6]) { ctx.beginPath(); ctx.arc(90 + dx, 536, 4, 0, Math.PI * 2); ctx.fill(); }
    // Barra con 3 bancos
    const bg = ctx.createLinearGradient(BAR.x, 0, BAR.x + BAR.w, 0); bg.addColorStop(0, '#4a5079'); bg.addColorStop(1, '#353a5e');
    rr(ctx, BAR.x, BAR.y, BAR.w, BAR.h, 14, bg);
    ctx.fillStyle = `rgba(255,181,71,${0.4 + 0.2 * Math.sin(time / 700)})`; ctx.fillRect(BAR.x + BAR.w - 4, BAR.y + 14, 3, BAR.h - 28);
    // Tazas, vasos y el pequeño Cthulhu de la barra
    for (const y of [340, 470]) { rr(ctx, BAR.x + 14, y, 16, 14, 4, '#e9e6f2'); }
    for (const y of [400, 410]) { ctx.fillStyle = 'rgba(190,230,255,.6)'; ctx.fillRect(BAR.x + 12 + (y - 400) * 1.5, y, 8, 14); }
    cthulhu(BAR.x + 23, 535, time);
  }

  function cthulhu(x, y, time) {
    const b = Math.sin(time / 600) * 1.5;
    ctx.fillStyle = '#5fbf8a';
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.ellipse(x + k * 3.5, y + 3 + Math.abs(k), 1.8, 6 + Math.sin(time / 300 + k) * 1.2, k * 0.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(x, y - 6 + b, 8, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1b1b2a'; for (const dx of [-3, 3]) { ctx.beginPath(); ctx.arc(x + dx, y - 6 + b, 1.6, 0, Math.PI * 2); ctx.fill(); }
  }

  function drawScreen(time, enJunta) {
    rr(ctx, SCREEN.x - 6, SCREEN.y - 6, SCREEN.w + 12, SCREEN.h + 12, 10, '#3a3f66');
    const g = ctx.createLinearGradient(SCREEN.x, SCREEN.y, SCREEN.x + SCREEN.w, SCREEN.y + SCREEN.h);
    g.addColorStop(0, enJunta ? '#2a1f78' : '#14163a'); g.addColorStop(1, enJunta ? '#0b3a4a' : '#101226');
    rr(ctx, SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h, 6, g);
    rr(ctx, SCREEN.x + SCREEN.w / 2 - 3, SCREEN.y + SCREEN.h + 6, 6, 40, 3, '#3a3f66');
    const m = [...(store.meetings || [])].reverse().find((x) => x.estado === 'en_curso');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (enJunta && m) {
      ctx.fillStyle = '#fff'; ctx.font = '800 14px system-ui, sans-serif'; ctx.fillText(`💡 JUNTA CREATIVA #${m.numero}`, SCREEN.x + SCREEN.w / 2, SCREEN.y + 20);
      ctx.fillStyle = '#c9c7da'; ctx.font = '500 12px system-ui, sans-serif';
      let t = m.tema; while (ctx.measureText(t).width > SCREEN.w - 24 && t.length > 3) t = t.slice(0, -2);
      ctx.fillText(t === m.tema ? t : `${t}…`, SCREEN.x + SCREEN.w / 2, SCREEN.y + 40);
      ctx.fillStyle = '#36e2c8'; ctx.fillRect(SCREEN.x + 12, SCREEN.y + SCREEN.h - 8, (SCREEN.w - 24) * Math.min(1, m.aportes.length / 5), 3);
    } else {
      ctx.fillStyle = 'rgba(201,199,218,.6)'; ctx.font = '700 13px system-ui, sans-serif'; ctx.fillText('PROYECTOR · SALA DE JUNTAS', SCREEN.x + SCREEN.w / 2, SCREEN.y + SCREEN.h / 2);
    }
  }

  function drawTV(time) {
    rr(ctx, TV.x - 6, TV.y - 6, TV.w + 12, TV.h + 12, 10, '#0d0e18');
    const g = ctx.createLinearGradient(0, TV.y, 0, TV.y + TV.h); g.addColorStop(0, '#0b1550'); g.addColorStop(1, '#2a1f78');
    rr(ctx, TV.x, TV.y, TV.w, TV.h, 6, g);
    ctx.save(); ctx.beginPath(); ctx.roundRect(TV.x, TV.y, TV.w, TV.h, 6); ctx.clip();
    // Noticiero de la agencia con la Tierra girando
    const ex = TV.x + 46, ey = TV.y + 46;
    const eg = ctx.createRadialGradient(ex - 8, ey - 8, 4, ex, ey, 26); eg.addColorStop(0, '#8be9ff'); eg.addColorStop(1, '#1f6fd1');
    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(ex, ey, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3ccf8e'; for (let k = 0; k < 3; k++) { const ox = ((time / 60 + k * 30) % 70) - 35; ctx.beginPath(); ctx.ellipse(ex + ox, ey - 6 + k * 9, 7, 4, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.font = '800 13px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('PIXEL NEWS', TV.x + 84, TV.y + 26);
    const enCurso = store.campaigns.filter((c) => c.estado === 'en_curso').length;
    const pend = store.pieces.filter((p) => p.estado === 'pendiente').length;
    ctx.fillStyle = '#c9c7da'; ctx.font = '500 11px system-ui, sans-serif';
    ctx.fillText(`${enCurso} campaña${enCurso === 1 ? '' : 's'} en curso · toca para ver`, TV.x + 84, TV.y + 46);
    ctx.fillText(`${pend} pieza${pend === 1 ? '' : 's'} por revisar`, TV.x + 84, TV.y + 62);
    const ticker = '  ★ La tripulación Pixel trabaja para ti  ★  Aprueba en el feed  ★  ';
    ctx.fillStyle = '#ffb547'; ctx.fillRect(TV.x, TV.y + TV.h - 18, TV.w, 18);
    ctx.fillStyle = '#1b1406'; ctx.font = '700 11px system-ui, sans-serif';
    const tw = ctx.measureText(ticker).width; const off = (time / 30) % tw;
    ctx.fillText(ticker + ticker, TV.x - off, TV.y + TV.h - 9);
    ctx.restore();
    rr(ctx, TV.x + TV.w / 2 - 50, TV.y + TV.h + 6, 100, 16, 6, '#262a44');
  }

  function drawAquarium(time) {
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(AQUA.x + AQUA.w / 2, AQUA.y + AQUA.h + 26, 70, 9, 0, 0, Math.PI * 2); ctx.fill();
    rr(ctx, AQUA.x - 6, AQUA.y + AQUA.h, AQUA.w + 12, 24, 6, '#262a44');
    const g = ctx.createLinearGradient(0, AQUA.y, 0, AQUA.y + AQUA.h); g.addColorStop(0, 'rgba(80,200,255,.55)'); g.addColorStop(1, 'rgba(40,60,200,.65)');
    rr(ctx, AQUA.x, AQUA.y, AQUA.w, AQUA.h, 10, g);
    ctx.save(); ctx.beginPath(); ctx.roundRect(AQUA.x, AQUA.y, AQUA.w, AQUA.h, 10); ctx.clip();
    // Algas
    ctx.strokeStyle = '#3ccf8e'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (const ax of [AQUA.x + 18, AQUA.x + 40, AQUA.x + 92]) { ctx.beginPath(); ctx.moveTo(ax, AQUA.y + AQUA.h); for (let k = 1; k <= 4; k++) ctx.lineTo(ax + Math.sin(time / 700 + k + ax) * 5, AQUA.y + AQUA.h - k * 18); ctx.stroke(); }
    // Peces alienígenas
    for (const f of fish) {
      const span = AQUA.w + 40; const px = ((time / 1000) * f.v + f.p) % span; const dir = Math.floor(((time / 1000) * f.v + f.p) / span) % 2 ? -1 : 1;
      const fx = dir > 0 ? AQUA.x - 20 + px : AQUA.x + AQUA.w + 20 - px; const fy = f.y + Math.sin(time / 500 + f.p) * 4;
      ctx.fillStyle = f.c; ctx.beginPath(); ctx.ellipse(fx, fy, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(fx - dir * 8, fy); ctx.lineTo(fx - dir * 15, fy - 5); ctx.lineTo(fx - dir * 15, fy + 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1b1b2a'; ctx.beginPath(); ctx.arc(fx + dir * 4, fy - 1, 1.3, 0, Math.PI * 2); ctx.fill();
    }
    // Burbujas
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (let k = 0; k < 7; k++) { const ph = (time / 2500 + k / 7) % 1; ctx.beginPath(); ctx.arc(AQUA.x + 20 + ((k * 37) % (AQUA.w - 30)), AQUA.y + AQUA.h - ph * AQUA.h, 2 + (k % 3), 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(AQUA.x + 8, AQUA.y + 8, 6, AQUA.h - 16);
    rr(ctx, AQUA.x - 4, AQUA.y - 8, AQUA.w + 8, 10, 4, '#3a3f66');
  }

  function palm(x, y, time) {
    rr(ctx, x - 22, y - 36, 44, 38, 10, '#e9e6f2');
    const sway = Math.sin(time / 1100) * 4;
    ctx.strokeStyle = '#8a6a4f'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x, y - 34); ctx.quadraticCurveTo(x + 6, y - 90, x + sway, y - 140); ctx.stroke();
    ctx.fillStyle = '#2fb57a';
    for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + (k - 2.5) * 0.55; ctx.save(); ctx.translate(x + sway, y - 140); ctx.rotate(a + Math.sin(time / 900 + k) * 0.05); ctx.beginPath(); ctx.ellipse(0, -30, 9, 34, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  }

  function monstera(x, y, time) {
    rr(ctx, x - 24, y - 38, 48, 40, 10, '#e9e6f2');
    ctx.fillStyle = '#25a466';
    for (let k = 0; k < 5; k++) {
      ctx.save(); ctx.translate(x + (k - 2) * 12, y - 52 - (k % 2) * 16); ctx.rotate((k - 2) * 0.35 + Math.sin(time / 1000 + k) * 0.04);
      ctx.beginPath(); ctx.ellipse(0, 0, 17, 22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#141626'; ctx.fillRect(-1, -14, 2, 28); ctx.fillStyle = '#25a466'; ctx.restore();
    }
  }

  function dracena(x, y, time) {
    rr(ctx, x - 16, y - 30, 32, 32, 8, '#e9e6f2');
    ctx.strokeStyle = '#8a6a4f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y - 28); ctx.lineTo(x, y - 90); ctx.stroke();
    ctx.fillStyle = '#7bd389';
    for (let k = 0; k < 7; k++) { ctx.save(); ctx.translate(x, y - 90); ctx.rotate((k - 3) * 0.45 + Math.sin(time / 1000) * 0.05); ctx.beginPath(); ctx.ellipse(0, -18, 4, 22, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  }

  function lamp(x, y, time) {
    rr(ctx, x - 10, y - 2, 20, 6, 3, '#262a44');
    rr(ctx, x - 3, y - 110, 6, 110, 3, '#3a3f66');
    const glow = 0.55 + 0.15 * Math.sin(time / 800 + x);
    ctx.fillStyle = `rgba(255,214,140,${glow})`; rr(ctx, x - 9, y - 140, 18, 34, 8, `rgba(255,214,140,${glow})`);
    const lg = ctx.createRadialGradient(x, y - 123, 4, x, y - 123, 60); lg.addColorStop(0, 'rgba(255,214,140,.18)'); lg.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(x, y - 123, 60, 0, Math.PI * 2); ctx.fill();
  }

  function drawStool(s) {
    rr(ctx, s.x - 3, s.y - 34, 6, 34, 3, '#3a3f66');
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(s.x, s.y + 2, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffb547'; ctx.beginPath(); ctx.ellipse(s.x, s.y - 36, 20, 7, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawSofaBack() {
    rr(ctx, SOFA.x, SOFA.y, SOFA.w, SOFA.h, 22, '#4b3fb3');
    rr(ctx, SOFA.x - 10, SOFA.y + 10, 24, SOFA.h - 6, 10, '#5b4bd6');
    rr(ctx, SOFA.x + SOFA.w - 14, SOFA.y + 10, 24, SOFA.h - 6, 10, '#5b4bd6');
  }

  function drawMeetChair([x, y]) {
    rr(ctx, x - 20, y - 48, 40, 44, 12, '#3d4266');
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

  function drawTable(time) {
    const enJunta = Object.values(store.agents).some((a) => a.estado === 'junta');
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(TABLE.x, TABLE.y + 44, TABLE.rx * 0.8, 12, 0, 0, Math.PI * 2); ctx.fill();
    for (const dx of [-120, 120]) rr(ctx, TABLE.x + dx - 10, TABLE.y, 20, 42, 6, '#262a44');
    rr(ctx, TABLE.x - TABLE.rx, TABLE.y - TABLE.ry + 10, TABLE.rx * 2, TABLE.ry * 2, 30, '#2f3352');
    const g = ctx.createLinearGradient(0, TABLE.y - TABLE.ry, 0, TABLE.y + TABLE.ry);
    g.addColorStop(0, '#5a618f'); g.addColorStop(1, '#3a4070');
    rr(ctx, TABLE.x - TABLE.rx, TABLE.y - TABLE.ry, TABLE.rx * 2, TABLE.ry * 2, 30, g);
    ctx.strokeStyle = enJunta ? `rgba(139,123,255,${0.6 + 0.3 * Math.sin(time / 300)})` : 'rgba(139,123,255,.3)';
    ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(TABLE.x - TABLE.rx + 12, TABLE.y - TABLE.ry + 8, TABLE.rx * 2 - 24, TABLE.ry * 2 - 16, 22); ctx.stroke();
    for (const dx of [-140, -40, 60, 150]) rr(ctx, TABLE.x + dx, TABLE.y - 6 + (dx % 3), 26, 16, 3, 'rgba(233,230,242,.85)');
    if (enJunta) {
      const hy = TABLE.y - 40 + Math.sin(time / 500) * 4;
      ctx.save(); ctx.translate(TABLE.x, hy); ctx.scale(Math.cos(time / 700), 1);
      ctx.font = '30px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('💡', 0, 0);
      ctx.restore();
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
          const icon = { curso: '🎓', autorizacion: '🔐', cuestionario: '📝', concepto: '💡' }[req.tipo] || '❓';
          bub = `<b>${icon}</b> ${esc(small ? '' : req.texto)}`; cls = 'alert';
        } else if (pendingPieces(it.id).length) { bub = small ? '📱' : '📱 Esperando tu swipe'; cls = 'feed'; }
        else if (st.estado === 'junta') {
          // En la mesa solo habla (con burbuja completa) quien acaba de aportar; el resto muestra 💬
          const m = [...(store.meetings || [])].reverse().find((x) => x.estado === 'en_curso');
          const ultimo = m?.aportes?.at(-1)?.agente;
          bub = it.id === ultimo && !small ? esc(st.burbuja) : st.burbuja?.startsWith('🤔') ? '🤔' : '💬';
          cls = 'junta';
        }
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
    if (onPC) for (const ch of Object.values(chars)) { const d = ch.desk; if (Math.abs(p.x - d.x) < 95 && p.y > d.y - 40 && p.y < d.y + 40) return onPC(ch.id); }
    if (onTV && p.x > TV.x - 14 && p.x < TV.x + TV.w + 14 && p.y > TV.y - 14 && p.y < TV.y + TV.h + 14) return onTV();
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
      items.push({ y: d.y + 30, draw: () => drawDesk(d, working, a?.color || '#8b7bff', now) });
      items.push({ y: ch.y, draw: () => drawCrew(ctx, ch.x, ch.y, a, { t: ch.t, walking: ch.walking, facing: ch.facing, sitting: ch.seated, typing: ch.seated && working, wave: !ch.walking && (ch.target?.kind === 'boss' || (ch.target?.kind === 'junta' && [...(store.meetings || [])].reverse().find((x) => x.estado === 'en_curso')?.aportes?.at(-1)?.agente === id)), glow: working || pendingReqs(id).length > 0, scale: 1.15 }) });
      if (!ch.walking && pendingReqs(id).length) items.push({ y: ch.y - 0.5, draw: () => { ctx.strokeStyle = `rgba(255,181,71,${0.5 + 0.4 * Math.sin(now / 180)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(ch.x, ch.y, 34, 10, 0, 0, Math.PI * 2); ctx.stroke(); } });
    }
    items.push({ y: TABLE.y + 6, draw: () => drawTable(now) });
    for (const c of CHAIRS) items.push({ y: c[1] - 2, draw: () => drawMeetChair(c) });
    for (const st of STOOLS) items.push({ y: st.y - 1, draw: () => drawStool(st) });
    items.push({ y: SOFA.y + 40, draw: () => drawSofaBack() });
    const alert = store.requests.some((r) => r.estado === 'pendiente');
    items.push({ y: BOSS.y - 1, draw: () => drawChair(BOSS, true) });
    items.push({ y: BOSS.y + 24, draw: () => drawCrew(ctx, BOSS.x, BOSS.y + 24, JEFE, { t: now / 1000, sitting: true, typing: true, glow: alert, scale: 1.15 }) });
    items.push({ y: BOSS.y + 30, draw: () => drawDesk(BOSS, alert, alert ? '#ffb547' : '#8b7bff', now, true) });
    items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());
    placeTags();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { refresh() { refreshLogo(); }, resetCamera };
}
