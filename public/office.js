// La oficina: estación espacial 2D + paneles (solicitudes, campañas, equipo, bitácora).
import { api, store, byId, connect, avatar, esc, hace, usd } from './common.js';
import { createOffice } from './office2d.js';

const pendingReqs = (id) => store.requests.filter((r) => r.agente === id && r.estado === 'pendiente');
const pendingPieces = (id) => store.pieces.filter((p) => p.agente === id && p.estado === 'pendiente');
let office = null;

// ---------- Paneles ----------
const $ = (id) => document.getElementById(id);

const TIPOS = { autorizacion: '🔐 pide autorización', cuestionario: '📝 tiene preguntas', concepto: '💡 presenta el concepto', pregunta: '❓ pregunta' };

function reqElement(r) {
  const a = byId(r.agente);
  const el = document.createElement('div');
  el.className = `req req-${r.tipo}`;
  el.innerHTML = `<div class="who"></div><div class="txt">${esc(r.texto)}</div>${r.detalle ? `<div class="det">${esc(r.detalle)}</div>` : ''}<div class="row"></div>`;
  el.querySelector('.who').append(avatar(a?.look, 28), `${a?.nombre || r.agente} · ${TIPOS[r.tipo] || r.tipo}`);
  const row = el.querySelector('.row');
  const send = async (body) => { el.querySelectorAll('button').forEach((b) => (b.disabled = true)); try { await api(`/api/requests/${r.id}`, body); } catch (e) { alert(e.message); el.querySelectorAll('button').forEach((b) => (b.disabled = false)); } };
  const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);

  if (r.tipo === 'autorizacion') {
    const inp = mk('input', { placeholder: 'Comentario (opcional)' });
    const ok = mk('button', { className: 'ok', textContent: 'Autorizar', onclick: () => send({ aprobado: true, respuesta: inp.value }) });
    const no = mk('button', { className: 'no', textContent: 'No', onclick: () => send({ aprobado: false, respuesta: inp.value }) });
    row.append(inp, ok, no);
  } else if (r.tipo === 'concepto') {
    row.classList.add('col');
    const ta = mk('textarea', { placeholder: '¿Qué le cambiarías? (para pedir cambios)', rows: 2 });
    const ok = mk('button', { className: 'ok', textContent: '✅ Aprobar concepto', onclick: () => send({ aprobado: true, respuesta: ta.value.trim() }) });
    const no = mk('button', { className: 'no', textContent: '✏️ Pedir cambios', onclick: () => (ta.value.trim() ? send({ aprobado: false, respuesta: ta.value.trim() }) : (ta.focus(), ta.placeholder = 'Escribe qué cambiarías y vuelve a pulsar')) });
    const btns = mk('div', { className: 'row' }); btns.append(ok, no);
    row.append(ta, btns);
  } else if (r.tipo === 'cuestionario') {
    row.classList.add('col');
    const campos = (r.preguntas || []).map((q, i) => {
      const box = mk('div', { className: 'q' });
      box.append(mk('div', { className: 'ql', textContent: `${i + 1}. ${q.pregunta}` }));
      const inp = mk('textarea', { rows: 1, placeholder: 'Tu respuesta…' });
      if (q.opciones?.length) {
        const chips = mk('div', { className: 'chips' });
        for (const o of q.opciones) chips.append(mk('button', { type: 'button', textContent: o, onclick: () => { inp.value = o; } }));
        box.append(chips);
      }
      box.append(inp);
      row.append(box);
      return inp;
    });
    const ok = mk('button', { className: 'primary', textContent: 'Enviar respuestas', onclick: () => {
      if (!campos.some((c) => c.value.trim())) return campos[0]?.focus();
      send({ respuestas: campos.map((c) => c.value.trim()) });
    } });
    row.append(ok);
  } else {
    for (const o of r.opciones || []) row.append(mk('button', { textContent: o, onclick: () => send({ respuesta: o }) }));
    const inp = mk('input', { placeholder: 'Escribe tu respuesta…' });
    const ok = mk('button', { className: 'primary', textContent: 'Enviar', onclick: () => inp.value.trim() && send({ respuesta: inp.value.trim() }) });
    inp.onkeydown = (e) => { if (e.key === 'Enter') ok.click(); };
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
  renderCampaigns();
  if (openAgentId) renderAgent(openAgentId);
}

const ESTADOS = { en_curso: '🟢 En curso', terminada: '✅ Terminada', interrumpida: '⏸️ Interrumpida', error: '⚠️ Error' };
function renderCampaigns() {
  const list = [...store.campaigns].sort((a, b) => b.creada - a.creada).slice(0, 8);
  const el = $('camps');
  if (!list.length) { el.innerHTML = '<div class="empty">Aún no hay campañas. Pulsa “＋ Campaña”.</div>'; return; }
  const mes = new Date(); mes.setDate(1); mes.setHours(0, 0, 0, 0);
  const totalMes = store.campaigns.filter((c) => c.creada >= mes.getTime()).reduce((s, c) => s + (c.costo || 0), 0);
  el.innerHTML = list.map((c) => {
    const piezas = store.pieces.filter((p) => p.campaignId === c.id);
    const ok = piezas.filter((p) => p.estado === 'aprobada').length;
    return `<div class="camp"><div><div class="n">${esc(c.cliente)}</div><div class="s">${ESTADOS[c.estado] || esc(c.estado)} · ${ok}/${piezas.length} piezas aprobadas · ${hace(c.creada)}</div></div><div class="usd" title="Costo aproximado de la API de Claude">${store.demo ? 'demo' : usd(c.costo)}</div></div>`;
  }).join('') + (store.demo ? '' : `<div class="total"><span>Gasto de IA este mes (aprox.)</span><b>${usd(totalMes)}</b></div>`);
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
setInterval(renderPanels, 15000);
$('camReset').onclick = () => office?.resetCamera();
