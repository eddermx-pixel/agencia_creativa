import { api, store, connect, esc } from './common.js';
const $ = (id) => document.getElementById(id);
let meta = null;
const f = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));

function barras(titulo, arr, lab = (x) => x) {
  if (!arr.length) return `<div class="card"><h2>${titulo}</h2><div class="empty">Sin datos todavía.</div></div>`;
  const max = Math.max(...arr.map((a) => a.er), 0.1);
  return `<div class="card"><h2>${titulo}</h2>${arr.map((a, i) => `<div class="bar"><span class="l" title="${esc(lab(a.clave))}">${i === 0 ? '🏆 ' : ''}${esc(lab(a.clave))}</span><span class="t"><i style="width:${(a.er / max) * 100}%"></i></span><span class="v">${a.er}% · ${a.piezas}</span></div>`).join('')}</div>`;
}
async function cargar() {
  const r = await api(`/api/metricas?clientId=${encodeURIComponent($('fcl').value)}&mes=${$('fmes').value}`);
  const s = r.resumen, t = s.totales;
  $('kp').innerHTML = [['Alcance', f(t.alcance)], ['Interacciones', f(t.interacciones)], ['Clics', f(t.clics)], ['Leads', f(t.leads)], ['Ventas', f(t.ventas)], ['Gasto', `$${f(t.gasto)}`], ['Costo/lead', t.leads && t.gasto ? `$${(t.gasto / t.leads).toFixed(1)}` : '—']].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
  $('top').innerHTML = `<h2>🏆 Lo que mejor resultó</h2>${s.mejores.length ? s.mejores.map((m) => `<div class="bar"><span class="l" style="width:auto;flex:1">${esc(m.titulo)} <span class="empty">· ${esc(m.plataforma)}</span></span><span class="v" style="width:auto">${m.er}% interacción · alcance ${f(m.alcance)}</span><button data-d="${m.id}" title="Borrar">🗑️</button></div>`).join('') : '<div class="empty">Registra resultados de tus publicaciones para ver qué funcionó mejor.</div>'}`;
  $('top').querySelectorAll('[data-d]').forEach((b) => (b.onclick = async () => { await fetch(`/api/metricas/${b.dataset.d}`, { method: 'DELETE' }); cargar(); }));
  $('g').innerHTML = barras('Por estilo de video', s.porEstilo) + barras('Por tipo de pieza', s.porTipo) + barras('Por objetivo', s.porObjetivo, (k) => meta.objetivos[k]?.split(' (')[0] || k) + barras('Por plataforma', s.porPlataforma) + barras('Por agente', s.porAgente, (k) => store.roster.find((a) => a.id === k)?.nombre || k);
}
async function registrar() {
  const piezas = await api('/api/metricas/piezas'); const dlg = $('dlg');
  const n = (id, l) => `<label>${l}<input type="number" min="0" id="m_${id}" value="0"></label>`;
  $('dlgB').innerHTML = `<div class="head"><h3>Registrar resultados</h3><span style="flex:1"></span><button id="x">✕</button></div>
    <label>Pieza aprobada<select id="m_p">${piezas.map((p) => `<option value="${p.id}">${esc(p.cliente)} · ${esc(p.titulo)}</option>`).join('')}</select></label>
    <div class="g2"><label>Plataforma<select id="m_pl">${meta.plataformas.map((x) => `<option>${x}</option>`).join('')}</select></label><label>Fecha<input type="date" id="m_fe" value="${new Date().toISOString().slice(0, 10)}"></label></div>
    <div class="g2">${n('alcance', 'Alcance')}${n('interacciones', 'Interacciones (likes, comentarios, guardados…)')}${n('clics', 'Clics')}${n('leads', 'Leads')}${n('ventas', 'Ventas')}${n('gasto', 'Gasto en ads ($)')}</div>
    <div class="actions"><span style="flex:1"></span><button class="primary" id="ok">Guardar</button></div>`;
  $('x').onclick = () => dlg.close();
  $('ok').onclick = async () => { try { await api('/api/metricas', { pieceId: $('m_p').value, plataforma: $('m_pl').value, fecha: $('m_fe').value, ...Object.fromEntries(['alcance', 'interacciones', 'clics', 'leads', 'ventas', 'gasto'].map((k) => [k, +$(`m_${k}`).value])) }); dlg.close(); cargar(); } catch (e) { alert(e.message); } };
  dlg.showModal();
}
$('nueva').onclick = registrar;
$('dlg').addEventListener('click', (e) => e.target === $('dlg') && $('dlg').close());
let first = true;
connect(async () => {
  if (!first || !store.roster.length) return; first = false;
  meta = await api('/api/objetivos');
  $('fcl').innerHTML = '<option value="">Todos los clientes</option>' + store.clients.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
  $('fcl').onchange = $('fmes').onchange = cargar; cargar();
});
