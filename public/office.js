// La oficina: los agentes como personajes que trabajan, toman café,
// caminan a tu escritorio cuando necesitan algo y al mural cuando entregan.
import { api, store, byId, connect, drawCharacter, avatar, esc, hace, JEFE } from './common.js';

const W = 480, H = 270;
const canvas = document.getElementById('office');
const ctx = canvas.getContext('2d');

// ---------- Mapa ----------
const DESKS = {
  director: { x: 392, y: 112 },
  investigador: { x: 80, y: 95 }, copy: { x: 180, y: 95 }, disenador: { x: 280, y: 95 },
  video: { x: 80, y: 178 }, calidad: { x: 180, y: 178 },
};
const extraDesk = (i) => ({ x: 60 + (i % 4) * 90, y: 95 + Math.floor(i / 4) * 83 });
const BOSS = { x: 312, y: 212 };
const BOSS_SLOTS = [{ x: 280, y: 252 }, { x: 344, y: 252 }, { x: 256, y: 240 }, { x: 368, y: 240 }, { x: 312, y: 258 }];
const COFFEE = { x: 34, y: 66 };
const MURAL = { x: 440, y: 10, w: 34, h: 30 };
const MURAL_SPOTS = [{ x: 436, y: 60 }, { x: 456, y: 62 }, { x: 420, y: 62 }, { x: 466, y: 70 }];

const chars = {};
function ensureChars() {
  store.roster.forEach((a, i) => {
    if (chars[a.id]) return;
    const desk = DESKS[a.id] || extraDesk(i);
    chars[a.id] = { id: a.id, desk, x: desk.x, y: desk.y + 2, path: [], target: null, seated: true, facing: 'down', frame: Math.random() * 100, coffeeUntil: 0, nextCoffee: Date.now() + 8000 + Math.random() * 25000 };
  });
}

const pendingReqs = (id) => store.requests.filter((r) => r.agente === id && r.estado === 'pendiente');
const pendingPieces = (id) => store.pieces.filter((p) => p.agente === id && p.estado === 'pendiente');

function spotFor(ch) {
  const st = store.agents[ch.id] || {};
  const reqIdx = store.requests.filter((r) => r.estado === 'pendiente').findIndex((r) => r.agente === ch.id);
  if (reqIdx >= 0) return { ...BOSS_SLOTS[reqIdx % BOSS_SLOTS.length], lane: 238, facing: 'up', kind: 'boss' };
  if (pendingPieces(ch.id).length) {
    const i = Object.keys(chars).filter((id) => pendingPieces(id).length).indexOf(ch.id);
    return { ...MURAL_SPOTS[i % MURAL_SPOTS.length], lane: 62, facing: 'up', kind: 'mural' };
  }
  const now = Date.now();
  if (st.estado === 'libre' || !st.estado) {
    if (now > ch.nextCoffee && !ch.coffeeUntil) { ch.coffeeUntil = now + 7000; ch.nextCoffee = now + 30000 + Math.random() * 40000; }
    if (ch.coffeeUntil > now) return { x: COFFEE.x + 10 + (ch.id.length % 3) * 9, y: COFFEE.y + 22, lane: COFFEE.y + 22, facing: 'left', kind: 'coffee' };
    ch.coffeeUntil = 0;
  } else ch.coffeeUntil = 0;
  return { x: ch.desk.x, y: ch.desk.y + 2, lane: ch.desk.y - 30, facing: 'down', kind: 'desk' };
}

function update(dt) {
  for (const ch of Object.values(chars)) {
    ch.frame += dt * 60;
    const t = spotFor(ch);
    if (!ch.target || ch.target.kind !== t.kind || ch.target.x !== t.x || ch.target.y !== t.y) {
      ch.target = t;
      const pts = [];
      if (ch.seated) pts.push({ x: ch.x, y: ch.desk.y - 30 });
      const from = pts.at(-1) || ch;
      pts.push({ x: from.x, y: t.lane }, { x: t.x, y: t.lane }, { x: t.x, y: t.y });
      ch.path = pts;
      ch.seated = false;
    }
    const wp = ch.path[0];
    if (wp) {
      const dx = wp.x - ch.x, dy = wp.y - ch.y;
      const d = Math.hypot(dx, dy);
      const v = 55 * dt;
      if (d <= v) { ch.x = wp.x; ch.y = wp.y; ch.path.shift(); } else {
        ch.x += (dx / d) * v; ch.y += (dy / d) * v;
        ch.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      }
      ch.walking = true;
    } else {
      ch.walking = false;
      ch.facing = t.facing;
      ch.seated = t.kind === 'desk';
    }
  }
}

// ---------- Dibujo ----------
function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

function drawRoom(time) {
  for (let y = 44; y < H; y += 8) for (let x = 0; x < W; x += 32) {
    const off = (y / 8) % 2 ? 16 : 0;
    rect(x - off, y, 32, 8, ((x + off + y) / 8) % 3 ? '#c8a27a' : '#bf9870');
    rect(x - off, y + 7, 32, 1, '#a9845e');
  }
  rect(0, 0, W, 44, '#e8e1d4'); rect(0, 40, W, 4, '#9c8f7a'); rect(0, 0, W, 3, '#cfc5b3');
  for (const wx of [70, 170, 270]) {
    rect(wx - 26, 8, 52, 26, '#7a6a55');
    const sky = (time / 60000) % 1;
    rect(wx - 23, 11, 46, 20, sky < .7 ? '#8fd3ff' : '#ffb27a');
    rect(wx - 23, 25, 46, 6, '#b8e6ff');
    rect(wx - 1, 11, 2, 20, '#7a6a55'); rect(wx - 23, 20, 46, 2, '#7a6a55');
    ctx.fillStyle = 'rgba(255,255,220,.10)';
    ctx.beginPath(); ctx.moveTo(wx - 23, 44); ctx.lineTo(wx + 23, 44); ctx.lineTo(wx + 40, 110); ctx.lineTo(wx - 10, 110); ctx.fill();
  }
  // Rótulo
  ctx.fillStyle = '#6c5ce7'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
  ctx.fillText('AGENCIA IA', 370, 26);
  // Mural del feed
  rect(MURAL.x - 2, MURAL.y - 2, MURAL.w + 4, MURAL.h + 4, '#6b4f2f');
  rect(MURAL.x, MURAL.y, MURAL.w, MURAL.h, '#d9b88f');
  const n = store.pieces.filter((p) => p.estado === 'pendiente').length;
  const cols = ['#ff7675', '#74b9ff', '#55efc4', '#ffeaa7', '#a29bfe', '#fd79a8'];
  for (let i = 0; i < Math.min(n, 6); i++) rect(MURAL.x + 3 + (i % 3) * 10, MURAL.y + 3 + Math.floor(i / 3) * 13, 8, 10, cols[i]);
  if (!n) { ctx.fillStyle = '#6b4f2f'; ctx.font = '7px monospace'; ctx.fillText('FEED', MURAL.x + MURAL.w / 2, MURAL.y + 18); }
  // Cafetera
  rect(COFFEE.x - 12, COFFEE.y - 14, 26, 30, '#636e72'); rect(COFFEE.x - 10, COFFEE.y - 12, 22, 10, '#2d3436');
  rect(COFFEE.x - 4, COFFEE.y, 8, 6, '#dfe6e9'); rect(COFFEE.x - 12, COFFEE.y + 16, 26, 4, '#4b5559');
  if (Math.floor(time / 400) % 2) rect(COFFEE.x + 5, COFFEE.y - 9, 3, 3, '#e17055');
  // Alfombra del jefe
  rect(BOSS.x - 70, BOSS.y - 22, 140, 64, '#7d5ba6'); rect(BOSS.x - 66, BOSS.y - 18, 132, 56, '#8e6bb8');
  // Plantas y sofá
  for (const [px, py] of [[12, 262], [468, 262], [12, 120], [468, 100]]) {
    rect(px - 6, py - 8, 12, 10, '#b5651d'); rect(px - 8, py - 20, 16, 13, '#27ae60'); rect(px - 4, py - 26, 8, 8, '#2ecc71');
  }
  rect(100, 236, 70, 22, '#c0392b'); rect(100, 230, 70, 8, '#e74c3c'); rect(96, 232, 6, 26, '#a93226'); rect(168, 232, 6, 26, '#a93226');
}

function drawDesk(d, glow, time, wide = false) {
  const w = wide ? 64 : 46;
  rect(d.x - w / 2, d.y - 4, w, 12, '#8d6e63'); rect(d.x - w / 2, d.y - 4, w, 3, '#a1887f');
  rect(d.x - w / 2 + 2, d.y + 8, 4, 6, '#6d4c41'); rect(d.x + w / 2 - 6, d.y + 8, 4, 6, '#6d4c41');
  rect(d.x - 21, d.y - 15, 13, 11, '#2d3436'); rect(d.x - 16, d.y - 5, 3, 2, '#2d3436');
  if (glow) { ctx.fillStyle = `rgba(120,200,255,${0.25 + 0.15 * Math.sin(time / 200)})`; ctx.fillRect(d.x - 24, d.y - 4, 20, 6); }
  rect(d.x - 6, d.y - 2, 12, 3, '#dfe6e9');
  rect(d.x + 12, d.y - 6, 5, 5, '#ecf0f1'); rect(d.x + 13, d.y - 5, 3, 2, '#6f4e37');
}

function fitText(text, max) {
  if (ctx.measureText(text).width <= max) return text;
  while (text.length && ctx.measureText(text + '…').width > max) text = text.slice(0, -1);
  return text + '…';
}

function drawOverlay(scale, time) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const dpr = window.devicePixelRatio || 1;
  const s = scale * dpr;
  const small = canvas.clientWidth < 640;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const bubbles = [];
  for (const ch of Object.values(chars)) {
    const a = byId(ch.id); if (!a) continue;
    const st = store.agents[ch.id] || {};
    const sx = ch.x * s, sy = ch.y * s;
    ctx.font = `600 ${10 * dpr}px system-ui, sans-serif`;
    const tw = ctx.measureText(a.nombre).width + 8 * dpr;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.beginPath(); ctx.roundRect(sx - tw / 2, sy + 2 * dpr, tw, 14 * dpr, 7 * dpr); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(a.nombre, sx, sy + 9 * dpr);

    const req = pendingReqs(ch.id)[0];
    const piece = pendingPieces(ch.id)[0];
    const headY = (ch.y - (ch.seated ? 19 : 22)) * s;
    if (req) {
      const bob = Math.sin(time / 150) * 3 * dpr;
      ctx.fillStyle = '#f5a524';
      ctx.beginPath(); ctx.arc(sx, headY - 12 * dpr + bob, 9 * dpr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1f1d1a'; ctx.font = `900 ${13 * dpr}px system-ui`; ctx.fillText(req.tipo === 'autorizacion' ? '🔐' : '!', sx, headY - 11 * dpr + bob);
      if (!small) bubbles.push({ x: sx, y: headY - 26 * dpr, text: req.texto, color: '#fff3d6' });
    } else if (piece) {
      ctx.font = `${14 * dpr}px system-ui`;
      ctx.fillText('📱', sx, headY - 10 * dpr + Math.sin(time / 200) * 2 * dpr);
    } else if (st.estado === 'trabajando' && st.burbuja) {
      if (!small) bubbles.push({ x: sx, y: headY - 6 * dpr, text: st.burbuja, color: '#ffffff' });
      else { ctx.font = `${12 * dpr}px system-ui`; ctx.fillText('💬', sx, headY - 6 * dpr); }
    } else if (!st.estado || st.estado === 'libre') {
      if (ch.seated) { ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = `700 ${9 * dpr}px system-ui`; ctx.fillText('z', sx + 8 * dpr, headY - 2 * dpr - (time / 300 % 6) * dpr); }
    }
  }
  // Burbujas al final para que queden encima
  for (const b of bubbles) {
    ctx.font = `${11 * dpr}px system-ui, sans-serif`;
    const maxW = 150 * dpr;
    const words = b.text.split(/\s+/); const lines = []; let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
      if (lines.length === 2) break;
    }
    if (lines.length < 2 && line) lines.push(line);
    if (lines.length === 2) lines[1] = fitText(lines[1] + (words.join(' ').length > lines.join(' ').length ? '…' : ''), maxW);
    const bw = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width))) + 14 * dpr;
    const bh = lines.length * 14 * dpr + 8 * dpr;
    const bx = Math.max(4 * dpr, Math.min(canvas.width - bw - 4 * dpr, b.x - bw / 2));
    const by = Math.max(4 * dpr, b.y - bh);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.roundRect(bx + 2 * dpr, by + 2 * dpr, bw, bh, 8 * dpr); ctx.fill();
    ctx.fillStyle = b.color; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8 * dpr); ctx.fill();
    ctx.beginPath(); ctx.moveTo(b.x - 5 * dpr, by + bh); ctx.lineTo(b.x + 5 * dpr, by + bh); ctx.lineTo(b.x, by + bh + 6 * dpr); ctx.fill();
    ctx.fillStyle = '#1f1d1a';
    lines.forEach((l, i) => ctx.fillText(l, bx + bw / 2, by + 11 * dpr + i * 14 * dpr));
  }
  // Jefe
  const n = store.requests.filter((r) => r.estado === 'pendiente').length;
  const bx = BOSS.x * s, by = (BOSS.y + 2) * s;
  ctx.font = `700 ${10 * dpr}px system-ui`;
  ctx.fillStyle = 'rgba(108,92,231,.9)'; ctx.beginPath(); ctx.roundRect(bx - 14 * dpr, by - 34 * dpr, 28 * dpr, 14 * dpr, 7 * dpr); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText('TÚ', bx, by - 27 * dpr);
  if (n) {
    ctx.fillStyle = '#e5484d'; ctx.beginPath(); ctx.arc(bx + 20 * dpr, by - 30 * dpr, 9 * dpr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(String(n), bx + 20 * dpr, by - 29 * dpr);
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 600;
  const scale = cssW / W;
  const pw = Math.round(cssW * dpr), ph = Math.round(cssW * (H / W) * dpr);
  if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
  ensureChars();
  update(dt);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  drawRoom(now);

  const items = [];
  for (const [id, d] of Object.entries(chars).map(([id, c]) => [id, c.desk])) {
    items.push({ y: d.y + 6, draw: () => drawDesk(d, (store.agents[id]?.estado === 'trabajando'), now) });
  }
  items.push({ y: BOSS.y + 6, draw: () => drawDesk(BOSS, store.requests.some((r) => r.estado === 'pendiente'), now, true) });
  items.push({ y: BOSS.y + 2, draw: () => drawCharacter(ctx, BOSS.x, BOSS.y + 2, JEFE, { frame: now / 16, sitting: true, typing: true }) });
  for (const ch of Object.values(chars)) {
    const a = byId(ch.id); if (!a) continue;
    const st = store.agents[ch.id] || {};
    items.push({ y: ch.y, draw: () => drawCharacter(ctx, ch.x, ch.y, a.look, { frame: ch.frame, walking: ch.walking, facing: ch.facing, sitting: ch.seated, typing: ch.seated && st.estado === 'trabajando' }) });
  }
  items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());
  drawOverlay(scale, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

canvas.addEventListener('click', (ev) => {
  const r = canvas.getBoundingClientRect();
  const wx = ((ev.clientX - r.left) / r.width) * W, wy = ((ev.clientY - r.top) / r.height) * H;
  let best = null, bestD = 18;
  for (const ch of Object.values(chars)) {
    const d = Math.hypot(ch.x - wx, ch.y - 10 - wy);
    if (d < bestD) { best = ch; bestD = d; }
  }
  if (best) return openAgent(best.id);
  if (wx > MURAL.x - 10 && wy < 50) return (location.href = 'feed.html');
  if (Math.abs(wx - BOSS.x) < 40 && Math.abs(wy - BOSS.y) < 25) document.getElementById('reqCard').scrollIntoView({ behavior: 'smooth' });
});

// ---------- Paneles ----------
const $ = (id) => document.getElementById(id);

function reqElement(r) {
  const a = byId(r.agente);
  const el = document.createElement('div');
  el.className = 'req';
  el.innerHTML = `<div class="who"></div><div class="txt">${esc(r.texto)}</div>${r.detalle ? `<div class="det">${esc(r.detalle)}</div>` : ''}<div class="row"></div>`;
  el.querySelector('.who').append(avatar(a?.look, 28), `${a?.nombre || r.agente} · ${r.tipo === 'autorizacion' ? '🔐 pide autorización' : '❓ pregunta'}`);
  const row = el.querySelector('.row');
  const send = async (body) => { row.querySelectorAll('button').forEach((b) => (b.disabled = true)); try { await api(`/api/requests/${r.id}`, body); } catch (e) { alert(e.message); } };
  if (r.tipo === 'autorizacion') {
    row.innerHTML = '<input placeholder="Comentario (opcional)"><button class="ok">Autorizar</button><button class="no">No</button>';
    const inp = row.querySelector('input');
    row.querySelector('.ok').onclick = () => send({ aprobado: true, respuesta: inp.value });
    row.querySelector('.no').onclick = () => send({ aprobado: false, respuesta: inp.value });
  } else {
    for (const o of r.opciones || []) {
      const b = document.createElement('button'); b.textContent = o; b.onclick = () => send({ respuesta: o }); row.append(b);
    }
    const inp = document.createElement('input'); inp.placeholder = 'Escribe tu respuesta…';
    const ok = document.createElement('button'); ok.className = 'primary'; ok.textContent = 'Enviar';
    ok.onclick = () => inp.value.trim() && send({ respuesta: inp.value.trim() });
    inp.onkeydown = (e) => e.key === 'Enter' && ok.click();
    row.append(inp, ok);
  }
  return el;
}

function renderPanels() {
  $('demoTag').hidden = !store.demo;
  const reqs = store.requests.filter((r) => r.estado === 'pendiente');
  for (const id of ['reqCount', 'reqCount2']) { $(id).textContent = reqs.length || ''; $(id).dataset.n = reqs.length; }
  const feedN = store.pieces.filter((p) => p.estado === 'pendiente').length;
  $('feedCount').textContent = feedN || ''; $('feedCount').dataset.n = feedN;

  const list = $('reqList');
  const ids = reqs.map((r) => r.id).join();
  if (list.dataset.ids !== ids) {
    list.dataset.ids = ids;
    list.replaceChildren(...(reqs.length ? reqs.map(reqElement) : [Object.assign(document.createElement('div'), { className: 'empty', textContent: 'Nadie te necesita ahora mismo. ☕' })]));
  }

  $('team').replaceChildren(...store.roster.map((a) => {
    const st = store.agents[a.id] || {};
    const el = document.createElement('div');
    el.className = 'member';
    const espera = pendingReqs(a.id).length ? 'esperando' : pendingPieces(a.id).length ? 'entregando' : st.estado;
    const texto = pendingReqs(a.id)[0]?.texto || (pendingPieces(a.id).length ? 'Esperando tu swipe en el feed 📱' : st.burbuja) || (st.estado === 'libre' || !st.estado ? 'Libre' : st.estado);
    el.innerHTML = `<div class="info"><div class="name">${esc(a.nombre)} <span style="color:var(--muted);font-weight:400">· ${esc(a.rol)}</span></div><div class="st">${esc(texto)}</div></div><span class="dot ${espera}"></span>`;
    el.prepend(avatar(a.look, 36));
    el.onclick = () => openAgent(a.id);
    return el;
  }));

  $('log').replaceChildren(...store.log.slice(-80).reverse().map((l) => {
    const d = document.createElement('div');
    const who = l.agente === 'jefe' ? 'Tú' : byId(l.agente)?.nombre || l.agente;
    d.innerHTML = `<b>${esc(who)}:</b> ${esc(l.texto)} <time>${hace(l.t)}</time>`;
    return d;
  }));
  if (openAgentId) renderAgent(openAgentId);
}

let openAgentId = null;
const chatHistory = {};
function openAgent(id) {
  openAgentId = id;
  renderAgent(id, true);
  if (!$('dlgAgent').open) $('dlgAgent').showModal();
}
$('dlgAgent').addEventListener('close', () => (openAgentId = null));
$('dlgAgent').addEventListener('click', (e) => e.target === $('dlgAgent') && $('dlgAgent').close());

function renderAgent(id, force = false) {
  const a = byId(id); if (!a) return;
  const body = $('agentBody');
  const st = store.agents[id] || {};
  const reqs = pendingReqs(id);
  const sig = JSON.stringify([st, reqs.map((r) => r.id), store.log.length, chatHistory[id]?.length]);
  if (!force && body.dataset.sig === sig) return;
  if (body.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && !force) return;
  body.dataset.sig = sig;
  body.innerHTML = `
    <div class="head"><div id="agAv"></div><div><h3>${esc(a.nombre)}</h3><div class="sub">${esc(a.rol)}</div></div><span class="sp" style="flex:1"></span><button id="agClose">✕</button></div>
    <div><b>Ahora:</b> ${esc(st.burbuja || (st.estado === 'libre' || !st.estado ? 'Libre, esperando trabajo' : st.estado))}</div>
    <div id="agReqs"></div>
    <div class="card" style="box-shadow:none"><h2>Chat</h2><div class="log" id="agChat" style="max-height:180px;flex-direction:column"></div>
      <div class="row" style="display:flex;gap:8px;margin-top:8px"><input id="agMsg" placeholder="Habla con ${esc(a.nombre)}…"><button class="primary" id="agSend">Enviar</button></div></div>
    <div class="card" style="box-shadow:none"><h2>Lo último que hizo</h2><div class="log" id="agLog"></div></div>`;
  body.querySelector('#agAv').append(avatar(a.look, 64));
  body.querySelector('#agClose').onclick = () => $('dlgAgent').close();
  body.querySelector('#agReqs').append(...reqs.map(reqElement));
  body.querySelector('#agChat').replaceChildren(...(chatHistory[id] || []).map(([who, t]) => Object.assign(document.createElement('div'), { innerHTML: `<b>${who === 'yo' ? 'Tú' : esc(a.nombre)}:</b> ${esc(t)}` })));
  body.querySelector('#agLog').replaceChildren(...store.log.filter((l) => l.agente === id).slice(-12).reverse().map((l) => Object.assign(document.createElement('div'), { innerHTML: `${esc(l.texto)} <time>${hace(l.t)}</time>` })));
  const inp = body.querySelector('#agMsg');
  const sendBtn = body.querySelector('#agSend');
  const send = async () => {
    const m = inp.value.trim(); if (!m) return;
    (chatHistory[id] ||= []).push(['yo', m]); inp.value = ''; sendBtn.disabled = true;
    renderAgent(id, true);
    try { const { respuesta } = await api(`/api/agents/${id}/chat`, { mensaje: m }); chatHistory[id].push(['el', respuesta]); }
    catch (e) { chatHistory[id].push(['el', `(error: ${e.message})`]); }
    renderAgent(id, true);
  };
  sendBtn.onclick = send;
  inp.onkeydown = (e) => e.key === 'Enter' && send();
}

// Nueva campaña
$('btnNew').onclick = () => $('dlgNew').showModal();
$('btnReqs').onclick = () => $('reqCard').scrollIntoView({ behavior: 'smooth' });
$('formNew').addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'ok') return;
  const f = new FormData(e.target);
  try { await api('/api/campaigns', { cliente: f.get('cliente'), brief: f.get('brief') }); e.target.reset(); }
  catch (err) { e.preventDefault(); alert(err.message); }
});

// Aviso cuando alguien viene a tu escritorio
function toast(r) {
  const a = byId(r.agente);
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = `${a?.nombre || r.agente} ${r.tipo === 'autorizacion' ? 'necesita tu autorización 🔐' : 'tiene una pregunta ❓'}: ${r.texto}`;
  t.onclick = () => { openAgent(r.agente); t.remove(); };
  document.body.append(t);
  setTimeout(() => t.remove(), 7000);
}

connect((type, data) => {
  if (type === 'request' && data.estado === 'pendiente') toast(data);
  renderPanels();
});
setInterval(renderPanels, 15000);
