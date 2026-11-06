// La oficina: estación espacial 2D + paneles (solicitudes, campañas, equipo, bitácora).
import { api, store, byId, connect, avatar, esc, hace, usd } from './common.js';
import { createOffice } from './office2d.js';
import { openPC } from './pc.js';
import { reqElement, TIPOS } from './decisions.js';

const pendingReqs = (id) => store.requests.filter((r) => r.agente === id && r.estado === 'pendiente');
const pendingPieces = (id) => store.pieces.filter((p) => p.agente === id && p.estado === 'pendiente');
let office = null;

// ---------- Paneles ----------
const $ = (id) => document.getElementById(id);

function renderJunta() {
  const ms = [...(store.meetings || [])].sort((a, b) => a.creada - b.creada);
  const m = [...ms].reverse().find((x) => x.estado === 'en_curso') || ms.filter((x) => Date.now() - (x.terminada || x.creada) < 10 * 60 * 1000).at(-1);
  $('juntaCard').hidden = !m;
  if (!m) return;
  $('juntaLive').textContent = m.estado === 'en_curso' ? 'EN VIVO' : 'TERMINADA';
  $('juntaLive').className = `live${m.estado === 'en_curso' ? '' : ' off'}`;
  const camp = store.campaigns.find((c) => c.id === m.campaignId);
  const key = `${m.id}|${m.aportes.length}|${m.estado}`;
  if ($('juntaBody').dataset.key === key) return;
  $('juntaBody').dataset.key = key;
  const head = Object.assign(document.createElement('div'), { className: 'jt', innerHTML: `#${m.numero} · ${esc(camp?.cliente || '')} · <b>${esc(m.tema)}</b>` });
  const rows = m.aportes.map((ap) => {
    const a = byId(ap.agente);
    const el = document.createElement('div');
    el.className = 'ap';
    el.innerHTML = `<div style="min-width:0"><div class="who">${esc(a?.nombre || ap.agente)} <span>· ${esc(a?.rol || '')}</span></div><div class="tx">${esc(ap.texto)}</div></div>`;
    el.prepend(avatar(a, 34));
    return el;
  });
  const wait = m.estado === 'en_curso' ? [Object.assign(document.createElement('div'), { className: 'empty', textContent: m.aportes.length ? 'Los demás siguen pensando…' : 'El equipo se está reuniendo en la mesa…' })] : [];
  $('juntaBody').replaceChildren(head, ...rows, ...wait);
}

function renderPanels() {
  renderJunta();
  $('demoTag').hidden = !store.demo;
  const reqs = store.requests.filter((r) => r.estado === 'pendiente');
  const nAlert = reqs.length + store.campaigns.filter((c) => c.estado === 'error').length;
  for (const id of ['reqCount', 'reqCount2']) { $(id).textContent = nAlert || ''; $(id).dataset.n = nAlert; }
  const feedN = store.pieces.filter((p) => p.estado === 'pendiente').length;
  $('feedCount').textContent = feedN || ''; $('feedCount').dataset.n = feedN;

  const list = $('reqList');
  const fallas = store.campaigns.filter((c) => c.estado === 'error' || (c.estado === 'en_curso' && c.activa === false && !store.requests.some((r) => r.campaignId === c.id && r.estado === 'pendiente') && !store.pieces.some((p) => p.campaignId === c.id && p.estado === 'pendiente')));
  const ids = reqs.map((r) => r.id).join() + '|' + fallas.map((c) => `${c.id}:${c.estado}:${c.resumen || ''}`).join();
  if (list.dataset.ids !== ids) {
    list.dataset.ids = ids;
    const alertas = fallas.map((c) => {
      const el = document.createElement('div');
      el.className = 'req req-error';
      el.innerHTML = `<div class="who">⚠️ La campaña de ${esc(c.cliente)} se detuvo</div><div class="det">${esc(c.resumen || 'Nadie está trabajando en ella (pudo detenerse por un reinicio).')}</div><div class="row"><button class="primary">↻ Reintentar desde donde se quedó</button></div>`;
      const b = el.querySelector('button');
      b.onclick = async () => { b.disabled = true; try { await api(`/api/campaigns/${c.id}/retry`, {}); } catch (e) { alert(e.message); b.disabled = false; } };
      return el;
    });
    const items = [...alertas, ...reqs.map(reqElement)];
    list.replaceChildren(...(items.length ? items : [Object.assign(document.createElement('div'), { className: 'empty', textContent: 'Nadie te necesita ahora mismo. ☕' })]));
  }

  $('team').replaceChildren(...store.roster.map((a) => {
    const st = store.agents[a.id] || {};
    const el = document.createElement('div');
    el.className = 'member';
    const espera = pendingReqs(a.id).length ? 'esperando' : pendingPieces(a.id).length ? 'entregando' : st.estado;
    const texto = pendingReqs(a.id)[0]?.texto || (st.pensando ? `🧠 Pensando… ${Math.max(1, Math.round((Date.now() - st.pensando) / 1000))} s` : '') || (pendingPieces(a.id).length ? 'Esperando tu swipe en el feed 📱' : st.burbuja) || (st.estado === 'libre' || !st.estado ? 'Libre' : st.estado);
    el.innerHTML = `<div class="info"><div class="name">${esc(a.nombre)} <span style="color:var(--muted);font-weight:400">· ${esc(a.rol)}</span></div><div class="st">${esc(texto)}</div></div><span class="dot ${espera}"></span>`;
    el.prepend(avatar(a, 36));
    el.onclick = () => openAgent(a.id);
    return el;
  }));

  $('log').replaceChildren(...store.log.slice(-80).reverse().map((l) => {
    const d = document.createElement('div');
    const who = l.agente === 'jefe' ? 'Tú' : byId(l.agente)?.nombre || l.agente;
    d.innerHTML = `<b>${esc(who)}:</b> ${esc(l.texto)} <time>${hace(l.t)}</time>`;
    return d;
  }));
  renderCampaigns();
  if (openAgentId) renderAgent(openAgentId);
}

const ESTADOS = { en_curso: '🟢 En curso', terminada: '✅ Terminada', interrumpida: '⏸️ Interrumpida', error: '⚠️ Se detuvo por un error' };
const FASES = { descubrimiento: '📝 Fase 1 · Preguntas', concepto: '💡 Fase 2 · Concepto', produccion: '🛠️ Fase 3 · Producción', terminada: '✅ Terminada' };
function renderCampaigns() {
  const all = [...store.campaigns].sort((a, b) => b.creada - a.creada);
  const abiertas = all.filter((c) => c.estado !== 'terminada');
  const list = [...abiertas, ...all.filter((c) => c.estado === 'terminada').slice(0, Math.max(0, 6 - abiertas.length))];
  const el = $('camps');
  if (!list.length) { el.innerHTML = '<div class="empty">Aún no hay campañas. Pulsa “＋ Campaña”.</div>'; return; }
  const mes = new Date(); mes.setDate(1); mes.setHours(0, 0, 0, 0);
  const totalMes = store.campaigns.filter((c) => c.creada >= mes.getTime()).reduce((s, c) => s + (c.costo || 0), 0);
  el.innerHTML = list.map((c) => {
    const piezas = store.pieces.filter((p) => p.campaignId === c.id);
    const ok = piezas.filter((p) => p.estado === 'aprobada').length;
    const tusResp = store.requests.filter((r) => r.campaignId === c.id && r.estado === 'pendiente').length;
    const tusSwipes = piezas.filter((p) => p.estado === 'pendiente').length;
    const trabajando = Object.values(store.agents).filter((a) => a.campaignId === c.id && a.estado === 'trabajando').map((a) => byId(a.id)?.nombre).filter(Boolean);
    let espera = '';
    if (c.estado === 'en_curso') {
      const partes = [];
      if (tusResp) partes.push(`<a href="#" class="goReq">⏳ ${tusResp} respuesta${tusResp > 1 ? 's' : ''} tuya${tusResp > 1 ? 's' : ''}</a>`);
      if (tusSwipes) partes.push(`<a href="feed.html">📱 ${tusSwipes} pieza${tusSwipes > 1 ? 's' : ''} por revisar</a>`);
      if (trabajando.length) partes.push(`🛠️ ${esc(trabajando.join(', '))} trabajando`);
      espera = partes.length ? `<div class="s">${partes.join(' · ')}</div>` : '';
    }
    const fase = c.estado === 'en_curso' && c.fase ? FASES[c.fase] : ESTADOS[c.estado] || esc(c.estado);
    const atorada = c.estado === 'en_curso' && c.activa === false && !tusResp && !tusSwipes;
    const accion = atorada ? `<div class="s" style="color:var(--warn)">⚠️ Nadie está trabajando en esta campaña (pudo detenerse por un reinicio).</div><button class="mini retry" data-id="${c.id}">↻ Reanudar</button>`
      : c.estado === 'error' ? `<button class="mini retry" data-id="${c.id}">↻ Reintentar</button>${c.resumen ? `<div class="s" style="color:var(--no)">${esc(c.resumen).slice(0, 140)}</div>` : ''}`
      : c.estado === 'interrumpida' ? `<button class="mini retry" data-id="${c.id}">↻ Volver a empezar</button>` : '';
    return `<div class="camp"><div style="min-width:0"><div class="n">${esc(c.cliente)}</div><div class="s">${fase} · ${ok}/${piezas.length} aprobadas · ${hace(c.creada)} · <a href="archivo.html#c=${c.id}">ver archivo</a></div>${espera}${accion}</div><div class="usd" title="Costo aproximado de la API de Claude">${store.demo ? 'demo' : usd(c.costo)}</div></div>`;
  }).join('') + (store.demo ? '' : `<div class="total"><span>Gasto de IA este mes (aprox.)</span><b>${usd(totalMes)}</b></div>`);
  el.querySelectorAll('.goReq').forEach((a) => (a.onclick = (e) => { e.preventDefault(); $('reqCard').scrollIntoView({ behavior: 'smooth' }); }));
  el.querySelectorAll('.retry').forEach((b) => (b.onclick = async () => { b.disabled = true; try { await api(`/api/campaigns/${b.dataset.id}/retry`, {}); } catch (e) { alert(e.message); b.disabled = false; } }));
}

function fillClientSelect() {
  const sel = $('selClient');
  const prev = sel.value;
  sel.innerHTML = store.clients.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('') + '<option value="">Otro cliente (sin kit de marca)</option>';
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
  syncClientFields();
}
function syncClientFields() {
  const c = store.clients.find((x) => x.id === $('selClient').value);
  $('lblOtro').hidden = !!c;
  $('lblOtro').querySelector('input').required = !c;
  $('kitHint').innerHTML = c
    ? `Los agentes usarán el kit de marca: ${(c.colores || []).map((h) => `<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${esc(h)};vertical-align:middle"></span>`).join(' ')} ${c.tieneLogo ? '· logo ✓' : ''} ${c.tono ? `· tono ${esc(c.tono)}` : ''}`
    : '¿Cliente recurrente? Créale un <a href="clientes.html">kit de marca</a> para que los agentes usen sus colores y su logo.';
}
$('selClient').addEventListener('change', syncClientFields);

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
  if (body.contains(document.activeElement) && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && !force) return;
  body.dataset.sig = sig;
  body.innerHTML = `
    <div class="head"><div id="agAv"></div><div><h3>${esc(a.nombre)} <span style="font-size:20px">${a.icono || ''}</span></h3><div class="sub">${esc(a.rol)} · <a href="equipo.html#${a.id}">📄 Ver currículum</a></div></div><span class="sp" style="flex:1"></span><button id="agPC" title="Ver en qué trabaja y sus archivos">🖥️ Su computadora</button><button id="agClose">✕</button></div>
    <div><b>Ahora:</b> ${esc(st.burbuja || (st.estado === 'libre' || !st.estado ? 'Libre, esperando trabajo' : st.estado))}</div>
    <div class="empty" style="font-size:13px">${esc(a.personalidad || '')}</div>
    <div id="agReqs"></div>
    <div class="card" style="box-shadow:none"><h2>Chat</h2><div class="log" id="agChat" style="max-height:180px;flex-direction:column"></div>
      <div class="row" style="display:flex;gap:8px;margin-top:8px"><input id="agMsg" placeholder="Habla con ${esc(a.nombre)}…"><button class="primary" id="agSend">Enviar</button></div></div>
    <div class="card" style="box-shadow:none"><h2>Lo último que hizo</h2><div class="log" id="agLog"></div></div>`;
  body.querySelector('#agAv').append(avatar(a, 64));
  body.querySelector('#agClose').onclick = () => $('dlgAgent').close();
  body.querySelector('#agPC').onclick = () => openPC(id);
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
  inp.onkeydown = (e) => { if (e.key === 'Enter') send(); };
}

// Nueva campaña
$('btnNew').onclick = () => { fillClientSelect(); $('dlgNew').showModal(); };
$('btnReqs').onclick = () => $('reqCard').scrollIntoView({ behavior: 'smooth' });
$('formNew').addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'ok') return;
  const f = new FormData(e.target);
  try { await api('/api/campaigns', { clientId: f.get('clientId'), cliente: f.get('cliente'), brief: f.get('brief') }); e.target.reset(); }
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
  if (!office && store.roster.length) {
    try {
      office = createOffice($('office'), {
        onAgent: openAgent,
        onPC: (id) => openPC(id),
        onBoss: () => $('reqCard').scrollIntoView({ behavior: 'smooth' }),
        onFeed: () => (location.href = 'feed.html'),
      });
    } catch (e) {
      console.error(e);
      $('office').innerHTML = '<div class="empty" style="padding:24px">Tu navegador no pudo mostrar la oficina. Todo lo demás funciona normal.</div>';
    }
  }
  office?.refresh();
  renderPanels();
});
setInterval(renderPanels, 5000);
$('camReset').onclick = () => office?.resetCamera();
// Cierra el menú al tocar fuera.
document.addEventListener('click', (e) => { const m = document.querySelector('details.menu'); if (m?.open && !m.contains(e.target)) m.open = false; });
