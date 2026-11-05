// Feed tipo Tinder: desliza → para aprobar, ← para rechazar.
import { api, store, byId, connect, avatar, esc, hace } from './common.js';

const $ = (id) => document.getElementById(id);
const deck = $('deck');
let tab = 'pend';
let busy = false;

const pending = () => {
  const list = store.pieces.filter((p) => p.estado === 'pendiente').sort((a, b) => a.creada - b.creada);
  const want = location.hash.slice(1);
  const i = list.findIndex((p) => p.id === want);
  if (i > 0) list.unshift(...list.splice(i, 1));
  return list;
};

function fitIframes(root) {
  for (const f of root.querySelectorAll('iframe')) {
    const box = f.parentElement;
    const s = Math.min(box.clientWidth / 1080, box.clientHeight / 1920) || 0.2;
    const cover = box.classList.contains('th') ? Math.max(box.clientWidth / 1080, box.clientHeight / 1920) : s;
    f.style.transform = `scale(${cover})`;
    f.style.left = `${(box.clientWidth - 1080 * cover) / 2}px`;
    f.style.top = `${(box.clientHeight - 1920 * cover) / 2}px`;
  }
}

function mediaHTML(p) {
  const src = `/api/pieces/${p.id}/render`;
  if (p.tipo === 'arte') return `<img src="${src}" alt="${esc(p.titulo)}">`;
  if (p.tipo === 'video') return `<iframe sandbox="allow-scripts" src="${src}" title="${esc(p.titulo)}" loading="lazy"></iframe>`;
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
    <div class="media">${mediaHTML(p)}</div>
    <div class="meta"><h3>${esc(p.titulo)}</h3><p>${esc(p.descripcion || '')}</p></div>`;
  el.querySelector('.who').prepend(avatar(a, 40));
  if (p.tipo === 'texto') fetch(`/api/pieces/${p.id}/render`).then((r) => r.text()).then((t) => (el.querySelector('pre').textContent = t));
  return el;
}

function renderDeck() {
  const list = pending();
  $('nPend').textContent = list.length || ''; $('nPend').dataset.n = list.length;
  if (tab !== 'pend' || busy) return;
  const top = deck.querySelector('.sc:not(.back)');
  if (top && list[0]?.id === top.dataset.id && deck.children.length === Math.min(2, list.length)) return;
  deck.replaceChildren();
  if (!list.length) {
    deck.innerHTML = '<div class="done"><div style="font-size:48px">🎉</div><b>Todo al día</b><div>Cuando el equipo entregue algo nuevo aparecerá aquí al instante.</div></div>';
    $('bar').style.visibility = 'hidden';
    return;
  }
  $('bar').style.visibility = 'visible';
  if (list[1]) deck.append(cardEl(list[1], true));
  const card = cardEl(list[0], false);
  deck.append(card);
  requestAnimationFrame(() => fitIframes(deck));
  drag(card);
}

function drag(card) {
  let sx = 0, sy = 0, dx = 0, dy = 0, down = false;
  const yes = card.querySelector('.yes'), nope = card.querySelector('.nope');
  card.addEventListener('pointerdown', (e) => {
    down = true; sx = e.clientX; sy = e.clientY; card.setPointerCapture(e.pointerId); card.style.transition = 'none';
  });
  card.addEventListener('pointermove', (e) => {
    if (!down) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    card.style.transform = `translate(${dx}px, ${dy * 0.3}px) rotate(${dx / 18}deg)`;
    yes.style.opacity = Math.max(0, Math.min(1, dx / 100));
    nope.style.opacity = Math.max(0, Math.min(1, -dx / 100));
  });
  const end = () => {
    if (!down) return; down = false;
    if (dx > 110) decide(true);
    else if (dx < -110) decide(false);
    else { card.style.transition = 'transform .25s'; card.style.transform = ''; yes.style.opacity = nope.style.opacity = 0; }
    dx = dy = 0;
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}

async function decide(aprobado, comentario = '') {
  const card = deck.querySelector('.sc:not(.back)');
  if (!card || busy) return;
  busy = true;
  card.style.transition = 'transform .35s ease-in, opacity .35s';
  card.style.transform = `translate(${aprobado ? 140 : -140}vw, 40px) rotate(${aprobado ? 30 : -30}deg)`;
  card.style.opacity = '0';
  try {
    const p = await api(`/api/pieces/${card.dataset.id}`, { aprobado, comentario });
    const i = store.pieces.findIndex((x) => x.id === p.id);
    if (i >= 0) store.pieces[i] = p;
  } catch (e) { console.warn(e); }
  if (location.hash) history.replaceState(null, '', location.pathname);
  setTimeout(() => { busy = false; renderDeck(); }, 300);
}

// Rechazo con comentario
const CHIPS = ['Otra paleta de colores', 'Texto más grande', 'Menos texto', 'Más premium', 'Más divertido', 'Otra idea completamente'];
$('chips').replaceChildren(...CHIPS.map((t) => Object.assign(document.createElement('button'), { textContent: t, onclick: () => { $('com').value = ($('com').value ? `${$('com').value}. ` : '') + t; } })));
const sheet = (on) => { $('sheet').classList.toggle('on', on); if (on) $('com').focus(); };
$('bCom').onclick = () => deck.querySelector('.sc:not(.back)') && sheet(true);
$('sCancel').onclick = () => sheet(false);
$('sSend').onclick = () => { const c = $('com').value.trim(); $('com').value = ''; sheet(false); decide(false, c); };
$('bYes').onclick = () => decide(true);
$('bNo').onclick = () => decide(false);
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowRight') decide(true);
  if (e.key === 'ArrowLeft') decide(false);
});

// Galería de aprobadas
function renderGrid() {
  const list = store.pieces.filter((p) => p.estado === 'aprobada').sort((a, b) => b.creada - a.creada);
  const g = $('grid');
  g.innerHTML = list.length ? '' : '<div class="empty">Aún no apruebas nada.</div>';
  for (const p of list) {
    const t = document.createElement('div');
    t.className = 'tile';
    const inner = p.tipo === 'arte' ? `<img src="/api/pieces/${p.id}/render" alt="">`
      : p.tipo === 'video' ? `<iframe sandbox="allow-scripts" src="/api/pieces/${p.id}/render" loading="lazy"></iframe>` : '<div style="font-size:40px;background:var(--chip);width:100%;height:100%;display:flex;align-items:center;justify-content:center">✍️</div>';
    t.innerHTML = `<div class="th">${inner}</div><div class="t">${esc(p.titulo)}<span>${esc(byId(p.agente)?.nombre || '')} · ${hace(p.creada)}</span></div>`;
    t.onclick = () => window.open(`/api/pieces/${p.id}/render`, '_blank', 'noopener');
    g.append(t);
  }
  requestAnimationFrame(() => fitIframes(g));
}

function setTab(t) {
  tab = t;
  $('tPend').classList.toggle('on', t === 'pend'); $('tOk').classList.toggle('on', t === 'ok');
  deck.style.display = $('bar').style.display = t === 'pend' ? '' : 'none';
  $('grid').classList.toggle('on', t === 'ok');
  t === 'pend' ? renderDeck() : renderGrid();
}
$('tPend').onclick = () => setTab('pend');
$('tOk').onclick = () => setTab('ok');
window.addEventListener('resize', () => { fitIframes(deck); fitIframes($('grid')); });

connect((type) => {
  if (['snapshot', 'piece', 'campaign'].includes(type)) { renderDeck(); if (tab === 'ok') renderGrid(); }
});
