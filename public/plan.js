// Tablero de planeación mensual por marca, alineado con objetivos y ads.
import { api, store, connect, esc } from './common.js';

const $ = (id) => document.getElementById(id);
const COLOR = { reconocimiento: '#8b7bff', trafico: '#4cc9f0', leads: '#ffb547', ventas: '#22c993', fidelizacion: '#ff7eb6', lanzamiento: '#ff5d6c', comunidad: '#b5e48c' };
const ESTADO = { idea: '💡 Idea', en_produccion: '⚙️ En producción', aprobada: '✅ Aprobada', programada: '📅 Programada', publicada: '📣 Publicada' };
let meta = null, mes = new URLSearchParams(location.search).get('mes') || new Date().toISOString().slice(0, 7), clienteId = new URLSearchParams(location.search).get('cliente') || '', data = null;

const shift = (m, d) => { const [y, mm] = m.split('-').map(Number); const t = new Date(y, mm - 1 + d, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; };
const nombreMes = (m) => new Date(+m.slice(0, 4), +m.slice(5) - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

async function cargar() {
  if (!meta) meta = await api('/api/objetivos');
  if (!clienteId && store.clients[0]) clienteId = store.clients[0].id;
  $('cl').innerHTML = store.clients.map((c) => `<option value="${esc(c.id)}" ${c.id === clienteId ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('') || '<option value="">Crea primero un cliente</option>';
  $('mes').textContent = nombreMes(mes);
  if (!clienteId) { $('cal').innerHTML = '<div class="empty">Primero crea un cliente en <a href="clientes.html">Clientes</a>.</div>'; return; }
  data = await api(`/api/plan?mes=${mes}&clientId=${encodeURIComponent(clienteId)}`);
  pinta();
}

function pinta() {
  const c = data.cliente;
  $('meta').innerHTML = `
    <div class="card" style="box-shadow:none"><h2>🎯 Objetivo de la marca</h2><div>${esc(c.objetivo) || '<span class="empty">Sin definir</span>'}</div></div>
    <div class="card" style="box-shadow:none"><h2>📊 Metas del mes</h2><div style="white-space:pre-wrap">${esc(c.metas) || '<span class="empty">Sin definir</span>'}</div></div>
    <div class="card" style="box-shadow:none"><h2>📢 Estrategia de ads</h2><div style="white-space:pre-wrap">${esc(c.ads) || '<span class="empty">Sin definir</span>'}</div><div style="margin-top:6px"><a href="clientes.html">✏️ Editar en el kit de marca</a></div></div>
    ${data.aprendizaje ? `<div class="card" style="box-shadow:none;grid-column:1/-1"><h2>📈 Lo que ya aprendimos</h2><div>${esc(data.aprendizaje)}</div></div>` : ''}`;
  $('leg').innerHTML = Object.entries(meta.objetivos).map(([k, v]) => `<span><i style="--c:${COLOR[k]}"></i>${esc(v.split(' (')[0])}</span>`).join('');
  const [y, m] = mes.split('-').map(Number);
  const primero = new Date(y, m - 1, 1), dias = new Date(y, m, 0).getDate(), off = (primero.getDay() + 6) % 7;
  const hoy = new Date().toISOString().slice(0, 10);
  let h = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < off; i++) h += '<div class="day out"></div>';
  for (let d = 1; d <= dias; d++) {
    const f = `${mes}-${String(d).padStart(2, '0')}`;
    const its = data.items.filter((x) => x.fecha === f);
    h += `<div class="day ${f === hoy ? 'hoy' : ''}" data-f="${f}"><div class="n">${d}</div>${its.map((x) => `<div class="it s-${x.estado}" data-id="${x.id}" style="--c:${COLOR[x.objetivo]}" title="${esc(x.tema)}">${{ reel: '🎬', carrusel: '🖼️', post: '📝', historia: '⭕', anuncio: '📢', texto: '✍️' }[x.formato] || ''}<span> ${esc(x.tema)}</span></div>`).join('')}</div>`;
  }
  $('cal').innerHTML = h;
  $('cal').querySelectorAll('.it').forEach((e) => (e.onclick = (ev) => { ev.stopPropagation(); editar(data.items.find((x) => x.id === e.dataset.id)); }));
  $('cal').querySelectorAll('.day:not(.out)').forEach((e) => (e.onclick = () => editar({ fecha: e.dataset.f })));
  const por = (k) => data.items.reduce((a, x) => ((a[x[k]] = (a[x[k]] || 0) + 1), a), {});
  const lista = (o, lab) => Object.entries(o).map(([k, n]) => `<span class="chip">${esc(lab(k))}: <b>${n}</b></span>`).join(' ') || '<span class="empty">—</span>';
  $('resumen').innerHTML = `<h2>Resumen · ${data.items.length} publicaciones</h2><div style="display:flex;flex-direction:column;gap:8px"><div><b>Por objetivo:</b> ${lista(por('objetivo'), (k) => meta.objetivos[k].split(' (')[0])}</div><div><b>Por plataforma:</b> ${lista(por('plataforma'), (k) => k)}</div><div><b>Por estado:</b> ${lista(por('estado'), (k) => ESTADO[k])}</div></div>`;
}

const opts = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
const optsL = (arr, sel) => arr.map((k) => `<option ${k === sel ? 'selected' : ''}>${esc(k)}</option>`).join('');

function editar(x) {
  const nuevo = !x.id; const dlg = $('dlg');
  x = { objetivo: 'reconocimiento', plataforma: 'instagram', formato: 'post', hora: '10:00', tema: '', notas: '', ...x };
  $('dlgB').innerHTML = `<div class="head"><h3>${nuevo ? 'Nueva idea' : 'Publicación'}</h3><span style="flex:1"></span><button id="x">✕</button></div>
    <label>Idea o tema<input id="f_tema" value="${esc(x.tema)}"></label>
    <div class="g2"><label>Fecha<input type="date" id="f_fecha" value="${esc(x.fecha || '')}"></label><label>Hora<input type="time" id="f_hora" value="${esc(x.hora)}"></label></div>
    <div class="g2"><label>Objetivo<select id="f_obj">${opts(meta.objetivos, x.objetivo)}</select></label><label>Plataforma<select id="f_plat">${optsL(meta.plataformas, x.plataforma)}</select></label></div>
    <div class="g2"><label>Formato<select id="f_fmt">${optsL(meta.formatos, x.formato)}</select></label><label>Estado<select id="f_est">${opts(ESTADO, x.estado || 'idea')}</select></label></div>
    <label>Notas (mensaje clave, llamada a la acción)<textarea id="f_notas" rows="2">${esc(x.notas)}</textarea></label>
    <div class="actions" style="flex-wrap:wrap">
      ${nuevo ? '' : '<button id="del" class="no">🗑️</button>'}
      <span style="flex:1"></span>
      ${!nuevo && !x.campaignId ? '<button id="prod">🎬 Producir ahora</button>' : ''}
      ${x.campaignId ? '<a href="archivo.html"><button>Ver campaña</button></a>' : ''}
      ${x.pieceId ? '<button id="prog">📅 Programar en GoHighLevel</button>' : ''}
      <button class="primary" id="ok">Guardar</button></div>`;
  const val = () => ({ clientId: clienteId, tema: $('f_tema').value, fecha: $('f_fecha').value, hora: $('f_hora').value, objetivo: $('f_obj').value, plataforma: $('f_plat').value, formato: $('f_fmt').value, estado: $('f_est').value, notas: $('f_notas').value });
  $('x').onclick = () => dlg.close();
  $('ok').onclick = async () => { try { await api(nuevo ? '/api/plan' : `/api/plan/${x.id}`, val(), nuevo ? 'POST' : 'PATCH'); dlg.close(); cargar(); } catch (e) { alert(e.message); } };
  if ($('del')) $('del').onclick = async () => { if (confirm('¿Borrar esta idea?')) { await fetch(`/api/plan/${x.id}`, { method: 'DELETE' }); dlg.close(); cargar(); } };
  if ($('prod')) $('prod').onclick = async () => { try { await api(`/api/plan/${x.id}`, val(), 'PATCH'); await api(`/api/plan/${x.id}/producir`, {}); dlg.close(); location.href = './'; } catch (e) { alert(e.message); } };
  if ($('prog')) $('prog').onclick = async () => {
    try { await api(`/api/pieces/${x.pieceId}/programar`, { fecha: $('f_fecha').value, hora: $('f_hora').value }); alert('✅ Programada en GoHighLevel'); dlg.close(); cargar(); } catch (e) { alert(e.message); }
  };
  if (!dlg.open) dlg.showModal();
}

$('gen').onclick = () => {
  const dlg = $('dlg');
  $('dlgB').innerHTML = `<div class="head"><h3>✨ Generar el plan de ${esc(nombreMes(mes))}</h3><span style="flex:1"></span><button id="x">✕</button></div>
    <p class="empty" style="margin:0">El equipo propone el mes completo usando el kit de la marca, sus metas, la estrategia de ads y lo que mejor ha funcionado. Tú lo ajustas y lo mandas a producir.</p>
    <label>¿Cuántas publicaciones?<input type="number" id="g_n" value="12" min="3" max="30"></label>
    <div><b style="font-size:13px">Prioridades del mes</b><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">${Object.entries(meta.objetivos).map(([k, v]) => `<label style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" class="g_o" value="${k}" ${['reconocimiento', 'leads', 'ventas'].includes(k) ? 'checked' : ''}> ${esc(v.split(' (')[0])}</label>`).join('')}</div></div>
    <label style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" id="g_r"> Reemplazar las ideas sin producir de este mes</label>
    <div class="actions"><span style="flex:1"></span><button class="primary" id="go">Generar</button></div>`;
  $('x').onclick = () => dlg.close();
  $('go').onclick = async (e) => { e.target.disabled = true; e.target.textContent = 'Pensando… (puede tardar un minuto)'; try { const r = await api('/api/plan/generar', { clientId: clienteId, mes, cantidad: +$('g_n').value, objetivos: [...document.querySelectorAll('.g_o:checked')].map((i) => i.value), reemplazar: $('g_r').checked }); dlg.close(); cargar(); } catch (err) { alert(err.message); e.target.disabled = false; e.target.textContent = 'Generar'; } };
  dlg.showModal();
};
$('nueva').onclick = () => editar({ fecha: `${mes}-01` });
$('cl').onchange = (e) => { clienteId = e.target.value; cargar(); };
$('prev').onclick = () => { mes = shift(mes, -1); cargar(); };
$('next').onclick = () => { mes = shift(mes, 1); cargar(); };
$('dlg').addEventListener('click', (e) => e.target === $('dlg') && $('dlg').close());
let first = true;
connect(() => { if (first && store.roster.length) { first = false; cargar(); } });
