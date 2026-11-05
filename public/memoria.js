// Memoria del equipo: ver, agregar, editar y borrar recuerdos.
import { api, store, byId, connect, esc, hace } from './common.js';

const $ = (id) => document.getElementById(id);
let mems = [];
let filtro = 'todo';

async function load() { mems = await api('/api/memories'); render(); }

const ORIGEN = { jefe: 'Tú lo escribiste', feed: 'Tu comentario en el feed', 'comentario del jefe': 'Tu comentario', agente: 'Lo aprendió un agente' };

function render() {
  const sel = $('scope');
  const prev = sel.value;
  sel.innerHTML = '<option value="">🏢 Toda la agencia</option>' + store.clients.map((c) => `<option value="${esc(c.id)}">🏷️ ${esc(c.nombre)}</option>`).join('');
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;

  const opts = [['todo', 'Todo'], ['agencia', 'Agencia'], ...store.clients.map((c) => [c.id, c.nombre])];
  $('filters').replaceChildren(...opts.map(([k, l]) => {
    const n = k === 'todo' ? mems.length : mems.filter((m) => (k === 'agencia' ? !m.clientId : m.clientId === k)).length;
    return Object.assign(document.createElement('button'), { className: filtro === k ? 'on' : '', textContent: `${l} (${n})`, onclick: () => { filtro = k; render(); } });
  }));

  const list = mems.filter((m) => filtro === 'todo' || (filtro === 'agencia' ? !m.clientId : m.clientId === filtro));
  $('count').textContent = list.length;
  if (!list.length) { $('list').innerHTML = '<div class="empty">Todavía no hay recuerdos aquí. Se irán guardando con tus comentarios.</div>'; return; }
  $('list').replaceChildren(...list.map((m) => {
    const el = document.createElement('div');
    el.className = 'mem';
    const cliente = m.clientId ? store.clients.find((c) => c.id === m.clientId)?.nombre || 'Cliente' : 'Agencia';
    const quien = m.agente ? ` · ${byId(m.agente)?.nombre || m.agente}` : '';
    const camp = m.campaignId ? store.campaigns.find((c) => c.id === m.campaignId) : null;
    el.innerHTML = `<div class="txt"><div>${esc(m.texto)}</div><div class="meta"><span class="pill">${esc(cliente)}</span><span class="pill ${m.origen === 'jefe' ? 'jefe' : m.origen === 'feed' ? 'feed' : ''}">${esc(ORIGEN[m.origen] || m.origen)}${esc(quien)}</span>${camp ? `<span>${esc(camp.cliente)}</span>` : ''}<span>${hace(m.creada)}</span></div></div>
      <div class="acts"><button title="Editar">✏️</button><button title="Olvidar">🗑️</button></div>`;
    const [ed, del] = el.querySelectorAll('.acts button');
    ed.onclick = async () => {
      const t = prompt('Editar recuerdo:', m.texto);
      if (t && t.trim() && t !== m.texto) { await api(`/api/memories/${m.id}`, { texto: t }); load(); }
    };
    del.onclick = async () => { if (confirm('¿Olvidar este recuerdo? Los agentes ya no lo tendrán en cuenta.')) { await api(`/api/memories/${m.id}`, { borrar: true }); load(); } };
    return el;
  }));
}

$('addBtn').onclick = async () => {
  const texto = $('txt').value.trim();
  if (!texto) return $('txt').focus();
  try { await api('/api/memories', { clientId: $('scope').value || null, texto }); $('txt').value = ''; load(); } catch (e) { alert(e.message); }
};
$('txt').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('addBtn').click(); });

connect((type) => { if (type === 'snapshot' || type === 'memory') load(); });
