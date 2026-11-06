// Feed tipo Tinder: desliza → para aprobar, ← para rechazar. Toca una tarjeta para verla
// a pantalla completa (con sonido en los videos).
import { api, store, byId, connect, avatar, esc, hace } from './common.js';

const $ = (id) => document.getElementById(id);
const deck = $('deck');
let tab = 'pend', busy = false, dragging = false, dirty = false;
const ICONO = { arte: '🎨', video: '🎬', texto: '✍️' };
const vibrar = (ms = 14) => { try { navigator.vibrate?.(ms); } catch {} };

const pending = () => {
  const list = store.pieces.filter((p) => p.estado === 'pendiente').sort((a, b) => a.creada - b.creada);
  const want = location.hash.slice(1);
  const i = list.findIndex((p) => p.id === want);
  if (i > 0) list.unshift(...list.splice(i, 1));
  return list;
};

// Los videos del motor viejo (HTML de 1080×1920) se escalan; los nuevos se dibujan a su tamaño.
function fitIframes(root) {
  for (const f of root.querySelectorAll('iframe.v1')) {
    const box = f.parentElement;
    const s = Math.min(box.clientWidth / 1080, box.clientHeight / 1920) || 0.2;
    const cover = box.classList.contains('th') ? Math.max(box.clientWidth / 1080, box.clientHeight / 1920) : s;
    f.style.transform = `scale(${cover})`;
    f.style.left = `${(box.clientWidth - 1080 * cover) / 2}px`;
    f.style.top = `${(box.clientHeight - 1920 * cover) / 2}px`;
  }
}

// Solo la tarjeta de arriba carga el contenido pesado; la de atrás es un cartón ligero.
function mediaHTML(p, arriba) {
  if (!arriba) return `<div class="ph">${ICONO[p.tipo] || '📦'}</div>`;
  const src = `/api/pieces/${p.id}/render`;
  if (p.tipo === 'arte') return `<img src="${src}" alt="${esc(p.titulo)}" decoding="async" draggable="false">`;
  if (p.tipo === 'video') return p.motor === 'v2'
    ? `<iframe class="v2" src="/player.html?id=${p.id}&embed=1&lite=1" title="${esc(p.titulo)}" tabindex="-1"></iframe>`
    : `<iframe class="v1" sandbox="allow-scripts" src="${src}" title="${esc(p.titulo)}" tabindex="-1"></iframe>`;
  return '<pre>Cargando…</pre>';
}

function cardEl(p, back) {
  const a = byId(p.agente);
  const c = store.campaigns.find((x) => x.id === p.campaignId);
  const el = document.createElement('div');
  el.className = `sc${back ? ' back' : ''}`;
  el.dataset.id = p.id;
  el.innerHTML = `
    <div class="stamp yes">APROBAR</div><div class="stamp nope">RECHAZAR</div>
    <div class="who"><div><div class="n">${esc(a?.nombre || p.agente)} · ${esc(a?.rol || '')}</div><div class="c">${esc(c?.cliente || '')} · ${hace(p.creada)}</div></div><span class="v">${{ arte: '🎨 Arte', video: '🎬 Video', texto: '✍️ Texto' }[p.tipo] || p.tipo} · v${p.version || 1}</span></div>
    <div class="media">${mediaHTML(p, !back)}${back ? '' : '<button class="zoom" title="Ver en pantalla completa" aria-label="Pantalla completa">⛶</button>'}</div>
    <div class="meta"><h3>${esc(p.titulo)}</h3><p>${esc(p.descripcion || '')}</p></div>`;
  el.querySelector('.who').prepend(avatar(a, 40));
  if (!back && p.tipo === 'texto') fetch(`/api/pieces/${p.id}/render`).then((r) => r.text()).then((t) => { const pre = el.querySelector('pre'); if (pre) pre.textContent = t; });
  return el;
}

function renderDeck() {
  const list = pending();
  $('nPend').textContent = list.length || ''; $('nPend').dataset.n = list.length;
  if (tab !== 'pend') return;
  // Nunca se reconstruye la tarjeta mientras la estás arrastrando o animando
  if (busy || dragging) { dirty = true; return; }
  dirty = false;
  const top = deck.querySelector('.sc:not(.back)');
  const back = deck.querySelector('.sc.back');
  if (top && list[0]?.id === top.dataset.id) {
    if ((list[1]?.id || '') !== (back?.dataset.id || '')) { back?.remove(); if (list[1]) deck.prepend(cardEl(list[1], true)); }
    return;
  }
  deck.replaceChildren();
  if (!list.length) {
    deck.innerHTML = '<div class="done"><div style="font-size:48px">🎉</div><b>Todo al día</b><div>Cuando el equipo entregue algo nuevo aparecerá aquí al instante.</div></div>';
    $('bar').style.visibility = 'hidden'; $('hint').style.visibility = 'hidden';
    return;
  }
  $('bar').style.visibility = 'visible'; $('hint').style.visibility = 'visible';
  if (list[1]) deck.append(cardEl(list[1], true));
  const card = cardEl(list[0], false);
  deck.append(card);
  requestAnimationFrame(() => fitIframes(deck));
  drag(card, list[0]);
}

// ---------- Deslizar ----------
function drag(card, p) {
  let sx = 0, sy = 0, dx = 0, dy = 0, down = false, id = null, pts = [];
  const yes = card.querySelector('.yes'), nope = card.querySelector('.nope');
  const volver = () => { card.style.transition = 'transform .25s cubic-bezier(.2,.9,.3,1.2)'; card.style.transform = ''; yes.style.opacity = nope.style.opacity = 0; };
  card.querySelector('.zoom')?.addEventListener('pointerdown', (e) => e.stopPropagation());
  card.querySelector('.zoom')?.addEventListener('click', (e) => { e.stopPropagation(); openViewer(p); });
  card.addEventListener('pointerdown', (e) => {
    if (e.button || busy || down) return;
    down = true; dragging = true; id = e.pointerId; sx = e.clientX; sy = e.clientY; dx = dy = 0; pts = [{ x: e.clientX, t: performance.now() }];
    try { card.setPointerCapture(id); } catch {}
    card.style.transition = 'none';
  });
  card.addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== id) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    const now = performance.now(); pts.push({ x: e.clientX, t: now }); while (pts.length > 2 && now - pts[0].t > 110) pts.shift();
    const w = card.offsetWidth || 360;
    card.style.transform = `translate(${dx}px, ${dy * 0.25}px) rotate(${(dx / w) * 14}deg)`;
    yes.style.opacity = Math.max(0, Math.min(1, dx / (w * 0.3)));
    nope.style.opacity = Math.max(0, Math.min(1, -dx / (w * 0.3)));
  });
  const fin = (e, cancelado) => {
    if (!down || (e && e.pointerId !== id)) return;
    down = false; dragging = false;
    try { card.releasePointerCapture(id); } catch {}
    const w = card.offsetWidth || 360;
    const a = pts[0], b = pts.at(-1); const v = b && a && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0; // px por ms
    const tap = Math.hypot(dx, dy) < 9;
    if (cancelado) { volver(); }
    else if (dx > w * 0.25 || (v > 0.5 && dx > 30)) decide(true);
    else if (dx < -w * 0.25 || (v < -0.5 && dx < -30)) decide(false);
    else if (tap) { volver(); openViewer(p); }
    else volver();
    dx = dy = 0;
    if (dirty && !busy) setTimeout(renderDeck, 0);
  };
  card.addEventListener('pointerup', (e) => fin(e, false));
  card.addEventListener('pointercancel', (e) => fin(e, true));
  card.addEventListener('lostpointercapture', (e) => { if (down) fin(e, true); });
}

async function decide(aprobado, comentario = '') {
  const card = deck.querySelector('.sc:not(.back)');
  if (!card || busy) return;
  busy = true; dragging = false; vibrar(aprobado ? 18 : [10, 40, 10]);
  try { localStorage.setItem('feed-hint', '1'); $('hint').classList.add('off'); } catch {}
  card.style.transition = 'transform .32s ease-in, opacity .32s';
  card.style.transform = `translate(${aprobado ? 140 : -140}vw, 40px) rotate(${aprobado ? 28 : -28}deg)`;
  card.style.opacity = '0';
  try {
    const p = await api(`/api/pieces/${card.dataset.id}`, { aprobado, comentario });
    const i = store.pieces.findIndex((x) => x.id === p.id);
    if (i >= 0) store.pieces[i] = p;
  } catch (e) { console.warn(e); }
  if (location.hash) history.replaceState(null, '', location.pathname);
  setTimeout(() => { busy = false; renderDeck(); }, 300);
}

// ---------- Visor a pantalla completa ----------
const viewer = $('viewer');
let visto = null;
function openViewer(p, { acciones } = {}) {
  visto = p;
  const body = $('vBody'); body.innerHTML = '';
  $('vTitle').textContent = p.titulo;
  const src = `/api/pieces/${p.id}/render`;
  if (p.tipo === 'video' && p.motor === 'v2') body.innerHTML = `<iframe class="v2" src="/player.html?id=${p.id}&embed=1&full=1" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe>`;
  else if (p.tipo === 'video') { body.innerHTML = `<iframe class="v1" sandbox="allow-scripts" src="${src}"></iframe><div class="nosound">Este video no tiene sonido (versión anterior)</div>`; fitViewer(); }
  else if (p.tipo === 'arte') body.innerHTML = `<img src="${src}" alt="${esc(p.titulo)}">`;
  else { body.innerHTML = '<pre>Cargando…</pre>'; fetch(src).then((r) => r.text()).then((t) => { const pre = body.querySelector('pre'); if (pre) pre.textContent = t; }); }
  const act = acciones ?? p.estado === 'pendiente';
  $('vActs').style.display = act ? 'flex' : 'none';
  viewer.classList.add('on');
  try { history.pushState({ v: 1 }, ''); } catch {}
  try { (viewer.requestFullscreen || viewer.webkitRequestFullscreen)?.call(viewer, { navigationUI: 'hide' })?.catch?.(() => {}); } catch {}
}
function fitViewer() {
  const f = $('vBody').querySelector('iframe.v1'); if (!f) return;
  const s = Math.min(innerWidth / 1080, innerHeight / 1920);
  f.style.transform = `scale(${s})`; f.style.left = `${(innerWidth - 1080 * s) / 2}px`; f.style.top = '0px';
}
function closeViewer(desdeAtras) {
  if (!viewer.classList.contains('on')) return;
  viewer.classList.remove('on'); $('vBody').innerHTML = '';
  try { if (document.fullscreenElement) document.exitFullscreen?.(); } catch {}
  if (!desdeAtras && history.state?.v) history.back();
}
$('vClose').onclick = () => closeViewer();
addEventListener('popstate', () => closeViewer(true));
addEventListener('resize', fitViewer);
$('vOk').onclick = () => { closeViewer(); decide(true); };
$('vNo').onclick = () => { closeViewer(); decide(false); };
$('vCom').onclick = () => { closeViewer(); setTimeout(() => sheet(true), 120); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeViewer(); });

// ---------- Rechazo con comentario ----------
const CHIPS = ['Otra paleta de colores', 'Texto más grande', 'Menos texto', 'Más premium', 'Más divertido', 'Otra idea completamente'];
$('chips').replaceChildren(...CHIPS.map((t) => Object.assign(document.createElement('button'), { textContent: t, onclick: () => { $('com').value = ($('com').value ? `${$('com').value}. ` : '') + t; } })));
const sheet = (on) => { $('sheet').classList.toggle('on', on); if (on) $('com').focus(); };
$('bCom').onclick = () => deck.querySelector('.sc:not(.back)') && sheet(true);
$('sCancel').onclick = () => sheet(false);
$('sSend').onclick = () => { const c = $('com').value.trim(); $('com').value = ''; sheet(false); decide(false, c); };
$('bYes').onclick = () => decide(true);
$('bNo').onclick = () => decide(false);
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || viewer.classList.contains('on')) return;
  if (e.key === 'ArrowRight') decide(true);
  if (e.key === 'ArrowLeft') decide(false);
});
try { if (localStorage.getItem('feed-hint')) $('hint').classList.add('off'); } catch {}

// ---------- Galería de aprobadas ----------
function renderGrid() {
  const list = store.pieces.filter((p) => p.estado === 'aprobada').sort((a, b) => b.creada - a.creada);
  const g = $('grid');
  g.innerHTML = list.length ? '' : '<div class="empty">Aún no apruebas nada.</div>';
  for (const p of list) {
    const t = document.createElement('div');
    t.className = 'tile';
    const inner = p.tipo === 'arte' ? `<img src="/api/pieces/${p.id}/render" alt="" loading="lazy">`
      : p.tipo === 'video' && p.motor !== 'v2' ? `<iframe class="v1" sandbox="allow-scripts" src="/api/pieces/${p.id}/render" loading="lazy" tabindex="-1"></iframe>`
      : `<div class="ph" style="font-size:40px">${ICONO[p.tipo] || '📦'}</div>`;
    t.innerHTML = `<div class="th">${inner}</div><div class="t">${esc(p.titulo)}<span>${esc(byId(p.agente)?.nombre || '')} · ${hace(p.creada)}</span></div>`;
    t.onclick = () => openViewer(p, { acciones: false });
    g.append(t);
  }
  requestAnimationFrame(() => fitIframes(g));
}

function setTab(t) {
  tab = t;
  $('tPend').classList.toggle('on', t === 'pend'); $('tOk').classList.toggle('on', t === 'ok');
  deck.style.display = $('bar').style.display = $('hint').style.display = t === 'pend' ? '' : 'none';
  $('grid').classList.toggle('on', t === 'ok');
  t === 'pend' ? renderDeck() : renderGrid();
}
$('tPend').onclick = () => setTab('pend');
$('tOk').onclick = () => setTab('ok');
window.addEventListener('resize', () => { fitIframes(deck); fitIframes($('grid')); });

connect((type) => {
  if (['snapshot', 'piece', 'campaign'].includes(type)) { renderDeck(); if (tab === 'ok') renderGrid(); }
});
