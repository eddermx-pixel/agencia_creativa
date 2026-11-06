import { api, store, connect, esc, hace } from './common.js';
const $ = (id) => document.getElementById(id);
let meta = null, t = null;

async function buscar() {
  const q = new URLSearchParams({ q: $('q').value, cliente: $('fcl').value, objetivo: $('fob').value, mes: $('fmes').value, estado: $('fes').value });
  for (const [k, v] of [...q]) if (!v) q.delete(k);
  const r = await api(`/api/campaigns/search?${q}`);
  $('n').textContent = `${r.length} campaña${r.length === 1 ? '' : 's'}`;
  $('lista').replaceChildren(...r.map((c) => {
    const el = document.createElement('div'); el.className = 'row2';
    el.innerHTML = `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>${esc(c.cliente)}</b><span class="chip">${esc(c.estado)}</span><span style="flex:1"></span><span class="empty" style="font-size:12px">${hace(c.creada)}</span></div>
      <div style="font-size:14px">${esc(c.brief.slice(0, 220))}${c.brief.length > 220 ? '…' : ''}</div>
      <div class="tags">${c.objetivo ? `<span>${esc(meta.objetivos[c.objetivo] || c.objetivo)}</span>` : ''}${c.mes ? `<span>🗓️ ${esc(c.mes)}</span>` : ''}${(c.etiquetas || []).map((e) => `<span>#${esc(e)}</span>`).join('')}<span>🎨 ${c.piezas} piezas · ✅ ${c.aprobadas}${c.pendientes ? ` · ⏳ ${c.pendientes}` : ''}</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><select data-o><option value="">Sin objetivo</option>${Object.entries(meta.objetivos).map(([k, v]) => `<option value="${k}" ${c.objetivo === k ? 'selected' : ''}>${esc(v.split(' (')[0])}</option>`).join('')}</select><input data-e placeholder="etiquetas separadas por coma" value="${esc((c.etiquetas || []).join(', '))}" style="flex:1;min-width:150px"><button data-s>Guardar</button><a href="archivo.html"><button>Ver piezas</button></a></div>`;
    el.querySelector('[data-s]').onclick = async (e) => { await api(`/api/campaigns/${c.id}`, { objetivo: el.querySelector('[data-o]').value, etiquetas: el.querySelector('[data-e]').value.split(',') }, 'PATCH'); e.target.textContent = '✓'; setTimeout(buscar, 600); };
    return el;
  }));
}
let first = true;
connect(async () => {
  if (!first || !store.roster.length) return; first = false;
  meta = await api('/api/objetivos');
  $('fcl').innerHTML = '<option value="">Todos los clientes</option>' + store.clients.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
  $('fob').innerHTML = '<option value="">Cualquier objetivo</option>' + Object.entries(meta.objetivos).map(([k, v]) => `<option value="${k}">${esc(v.split(' (')[0])}</option>`).join('');
  for (const id of ['q', 'fcl', 'fob', 'fmes', 'fes']) $(id).oninput = () => { clearTimeout(t); t = setTimeout(buscar, 250); };
  buscar();
});
