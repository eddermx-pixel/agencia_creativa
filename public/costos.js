import { api, connect, esc } from './common.js';
const $ = (id) => document.getElementById(id);
const d = (n) => (n == null ? '—' : `$${n.toFixed(2)}`);
let rep = null, fijos = [];

function pinta() {
  const t = rep.totales;
  $('aviso').innerHTML = `<b>Estimación.</b> La IA se calcula con los tokens reales de cada llamada × el precio por token configurado en el sistema (no es tu factura). Para cuadrarlo, usa el ajuste de abajo. Total IA del mes: <b>${d(t.ia)}</b> · cargos fijos: <b>${d(t.fijos)}</b> · cobros a clientes: <b>${d(t.cobro)}</b>.`;
  $('tb').innerHTML = `<thead><tr><th>Cliente</th><th>IA</th><th>Fijos</th><th>Total</th><th>Piezas aprob.</th><th>Costo/pieza</th><th>Cobro</th><th>Margen</th></tr></thead><tbody>${rep.filas.map((f) => `<tr><td>${esc(f.cliente)}<div class="empty" style="font-size:11px">${f.campanas} camp. · ${f.llamadas} llamadas${f.busquedas ? ` · ${f.busquedas} búsquedas web` : ''}</div></td><td>${d(f.ia)}</td><td>${d(f.fijos)}</td><td><b>${d(f.total)}</b></td><td>${f.aprobadas}/${f.piezas}</td><td>${d(f.costoPorPieza)}</td><td>${f.cobro ? d(f.cobro) : '<a href="clientes.html" class="empty">definir</a>'}</td><td class="${f.margen == null ? '' : f.margen >= 0 ? 'pos' : 'neg'}">${f.margen == null ? '—' : `${d(f.margen)} (${f.margenPct}%)`}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">Todavía no hay gasto este mes.</td></tr>'}</tbody>`;
  $('factor').value = rep.factor;
  fijos = rep.fijos.map((x) => ({ ...x }));
  pintaFijos();
}
function pintaFijos() {
  $('fijos').innerHTML = fijos.map((x, i) => `<div class="fx"><input data-i="${i}" data-k="nombre" value="${esc(x.nombre)}" placeholder="Ej. Railway"><input type="number" min="0" step="0.01" data-i="${i}" data-k="usd" value="${x.usd}" placeholder="USD al mes"><select data-i="${i}" data-k="reparto"><option value="igual" ${x.reparto === 'igual' ? 'selected' : ''}>Repartir igual</option><option value="uso" ${x.reparto === 'uso' ? 'selected' : ''}>Según uso de IA</option></select><button data-x="${i}">🗑️</button></div>`).join('') || '<div class="empty">Agrega Railway, GoHighLevel, Pexels, etc.</div>';
  $('fijos').querySelectorAll('[data-k]').forEach((e) => (e.oninput = () => { fijos[+e.dataset.i][e.dataset.k] = e.dataset.k === 'usd' ? +e.value : e.value; }));
  $('fijos').querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => { fijos.splice(+b.dataset.x, 1); pintaFijos(); }));
}
async function carga() { rep = await api(`/api/costos?mes=${$('mes').value}`); pinta(); }
$('addFx').onclick = () => { fijos.push({ nombre: '', usd: 0, reparto: 'igual' }); pintaFijos(); };
$('guardar').onclick = async () => { await api('/api/costos/config', { fijos, factor: +$('factor').value }, 'PUT'); $('msg').textContent = '✓ Guardado'; setTimeout(() => ($('msg').textContent = ''), 2000); carga(); };
$('mes').value = new Date().toISOString().slice(0, 7); $('mes').onchange = carga;
let first = true; connect(() => { if (first) { first = false; carga(); } });
