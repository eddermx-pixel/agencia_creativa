// Archivo: todas las piezas de todas las campañas, con versiones y descargas.
import { api, store, byId, connect, esc, hace, usd } from './common.js';

const $ = (id) => document.getElementById(id);
let data = { campaigns: [], pieces: [] };
const ESTADO = { aprobada: 'Aprobada', rechazada: 'Rechazada', pendiente: 'Por revisar', expirada: 'Expirada' };
const FASE = { descubrimiento: '📝 Preguntas', concepto: '💡 Concepto', produccion: '🛠️ Producción', terminada: '✅ Terminada' };

async function load() { data = await api('/api/archive'); render(); }

function fitIframes(root) {
  for (const f of root.querySelectorAll('iframe')) {
    const box = f.parentElement;
    const cover = box.classList.contains('th');
    const s = cover ? Math.max(box.clientWidth / 1080, box.clientHeight / 1920) : Math.min(box.clientWidth / 1080, box.clientHeight / 1920);
    f.style.transform = `scale(${s})`;
    f.style.left = `${(box.clientWidth - 1080 * s) / 2}px`;
    f.style.top = `${(box.clientHeight - 1920 * s) / 2}px`;
  }
}

function thumb(p) {
  const src = `/api/pieces/${p.id}/render?t=${p.rt}`;
  if (p.tipo === 'arte') return `<img src="${src}" alt="" loading="lazy">`;
  // Las miniaturas de video no se reproducen (todas sonaban a la vez): solo se ve un cuadro fijo; se reproduce al abrir la pieza.
  if (p.tipo === 'video' && p.motor === 'hf') return `<video src="/api/pieces/${p.id}/media#t=0.5" preload="metadata" muted playsinline tabindex="-1" style="width:100%;height:100%;object-fit:cover;pointer-events:none"></video><span class="play">▶</span>`;
  if (p.tipo === 'video' && p.motor === 'v2') return `<div class="play-ph"><span class="play">▶</span><small>Video</small></div>`;
  if (p.tipo === 'video') return `<iframe sandbox="allow-scripts" src="${src}" loading="lazy" tabindex="-1"></iframe>`;
  return `<pre data-src="${src}">…</pre>`;
}

function render() {
  const sel = $('fCliente');
  const prev = sel.value || (location.hash.startsWith('#cl=') ? location.hash.slice(4) : '');
  const clientes = [...new Map(data.campaigns.map((c) => [c.clientId || `n:${c.cliente}`, c.cliente])).entries()];
  sel.innerHTML = '<option value="">Todos los clientes</option>' + clientes.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('');
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;

  const fC = sel.value, fE = $('fEstado').value, fT = $('fTipo').value, q = $('fBuscar').value.trim().toLowerCase();
  const onlyCamp = location.hash.startsWith('#c=') ? location.hash.slice(3) : null;
  const camps = [...data.campaigns].sort((a, b) => b.creada - a.creada)
    .filter((c) => !onlyCamp || c.id === onlyCamp)
    .filter((c) => !fC || (c.clientId || `n:${c.cliente}`) === fC);

  const out = [];
  for (const c of camps) {
    const ps = data.pieces.filter((p) => p.campaignId === c.id)
      .filter((p) => (!fE || p.estado === fE) && (!fT || p.tipo === fT))
      .filter((p) => !q || `${p.titulo} ${p.descripcion || ''} ${c.cliente} ${c.brief}`.toLowerCase().includes(q))
      .sort((a, b) => b.creada - a.creada);
    if (!ps.length && (fE || fT || q)) continue;
    const total = data.pieces.filter((p) => p.campaignId === c.id);
    const el = document.createElement('section');
    el.className = 'camp';
    el.innerHTML = `
      <div class="hd">
        <div><div class="t">${esc(c.cliente)}</div>
          <div class="s">${new Date(c.creada).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })} · ${FASE[c.fase] || esc(c.estado)} · ${total.filter((p) => p.estado === 'aprobada').length} aprobadas de ${total.length}${store.demo ? '' : ` · ${usd(c.costo)}`}</div>
          ${c.concepto ? `<div class="s">💡 ${esc(c.concepto.titulo)}</div>` : ''}
        </div>
        <div class="acts">
          <a href="/api/campaigns/${c.id}/zip" download><button class="primary">⬇️ ZIP aprobadas</button></a>
          <a href="/api/campaigns/${c.id}/zip?todas=1" download><button>⬇️ ZIP todo</button></a>
          <button class="brief">📄 Brief</button>
        </div>
      </div>
      <div class="grid"></div>`;
    el.querySelector('.brief').onclick = () => showBrief(c);
    const grid = el.querySelector('.grid');
    if (!ps.length) grid.innerHTML = '<div class="empty">Sin piezas todavía.</div>';
    for (const p of ps) {
      const t = document.createElement('div');
      t.className = 'tile';
      t.innerHTML = `<span class="st ${p.estado}">${ESTADO[p.estado] || p.estado}</span><div class="th">${thumb(p)}</div><div class="info">${esc(p.titulo)}<span>${esc(byId(p.agente)?.nombre || '')} · v${p.version || 1} · ${hace(p.creada)}</span></div>`;
      t.onclick = () => showPiece(p, c);
      grid.append(t);
    }
    out.push(el);
  }
  $('list').replaceChildren(...(out.length ? out : [Object.assign(document.createElement('div'), { className: 'empty', textContent: 'No hay piezas con estos filtros.' })]));
  for (const pre of document.querySelectorAll('pre[data-src]')) fetch(pre.dataset.src).then((r) => r.text()).then((t) => (pre.textContent = t));
  requestAnimationFrame(() => fitIframes($('list')));
}

function showBrief(c) {
  $('dlgBody').innerHTML = `<div class="head"><h3>${esc(c.cliente)}</h3><span style="flex:1"></span><button id="x">✕</button></div>
    <div class="kv"><div><b>BRIEF</b>${esc(c.brief).replace(/\n/g, '<br>')}</div>
    ${c.respuestas ? `<div><b>TUS RESPUESTAS</b><pre style="white-space:pre-wrap;margin:0;font:inherit">${esc(c.respuestas)}</pre></div>` : ''}
    ${c.concepto ? `<div><b>CONCEPTO APROBADO · ${esc(c.concepto.titulo)}</b><pre style="white-space:pre-wrap;margin:0;font:inherit">${esc(c.concepto.detalle)}</pre></div>` : ''}</div>`;
  $('dlgBody').querySelector('#x').onclick = () => $('dlg').close();
  $('dlg').showModal();
}

// Botones de descarga: lo principal es SIEMPRE el archivo final listo (MP4 o JPG); las fuentes editables quedan aparte.
function descargas(p) {
  const dl = (href, txt, primary) => `<a href="${href}" download><button${primary ? ' class="primary"' : ''}>${txt}</button></a>`;
  if (p.tipo === 'arte') return dl(`/api/pieces/${p.id}/jpg`, '⬇️ JPG (listo para subir)', true) + dl(`/api/pieces/${p.id}/png`, 'PNG') + dl(`/api/pieces/${p.id}/download`, 'SVG (fuente editable)');
  if (p.tipo === 'texto') return dl(`/api/pieces/${p.id}/final`, '⬇️ TXT', true);
  if (p.motor === 'hf') return dl(`/api/pieces/${p.id}/media?dl=1`, '⬇️ Descargar MP4', true);
  if (p.motor === 'v2') {
    const listo = p.mediaRuta || p.render?.estado === 'listo';
    const enCurso = ['en_cola', 'grabando'].includes(p.render?.estado);
    return (listo ? dl(`/api/pieces/${p.id}/media?dl=1`, '⬇️ Descargar MP4', true) : enCurso ? '<button disabled>⏳ Creando el MP4…</button>' : '<button class="primary" id="mkmp4">🎞️ Crear MP4</button>')
      + `<a href="/player.html?id=${p.id}" target="_blank"><button>Exportar desde el navegador</button></a>` + dl(`/api/pieces/${p.id}/download`, 'Guion (fuente)');
  }
  return dl(`/api/pieces/${p.id}/download`, 'HTML (versión antigua)');
}

function showPiece(p, c) {
  const src = `/api/pieces/${p.id}/render?t=${p.rt}`;
  const versiones = data.pieces.filter((x) => x.campaignId === p.campaignId && x.agente === p.agente && x.tipo === p.tipo).sort((a, b) => a.creada - b.creada);
  const media = p.tipo === 'arte' ? `<img src="${src}" alt="">` : p.tipo === 'video' ? (p.motor === 'hf' ? `<video src="/api/pieces/${p.id}/media" controls playsinline autoplay style="width:100%;height:100%;object-fit:contain;background:#000"></video>` : p.motor === 'v2' ? `<iframe src="/player.html?id=${p.id}&embed=1&full=1" allow="autoplay; fullscreen"></iframe>` : `<iframe sandbox="allow-scripts" src="${src}"></iframe>`) : `<pre data-src="${src}">…</pre>`;
  $('dlgBody').innerHTML = `
    <div class="head"><h3>${esc(p.titulo)}</h3><span style="flex:1"></span><button id="x">✕</button></div>
    <div class="det">
      <div class="prev" style="${p.tipo === 'video' ? 'aspect-ratio:9/16;max-height:70vh' : ''}">${media}</div>
      <div class="kv">
        <div><b>ESTADO</b>${ESTADO[p.estado] || p.estado}${p.comentario ? ` — “${esc(p.comentario)}”` : ''}</div>
        <div><b>CAMPAÑA</b>${esc(c.cliente)}</div>
        <div><b>HECHO POR</b>${esc(byId(p.agente)?.nombre || p.agente)} · versión ${p.version || 1} · ${new Date(p.creada).toLocaleString('es-MX')}</div>
        ${p.descripcion ? `<div><b>DESCRIPCIÓN</b>${esc(p.descripcion)}</div>` : ''}
        <div><b>DESCARGAR</b><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
          ${descargas(p)}
          <a href="${src}" target="_blank" rel="noopener"><button>Abrir</button></a>
        </div></div>
        ${versiones.length > 1 ? `<div><b>VERSIONES</b><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">${versiones.map((v) => `<button data-v="${v.id}" ${v.id === p.id ? 'class="primary"' : ''}>v${v.version || 1} · ${ESTADO[v.estado] || v.estado}</button>`).join('')}</div></div>` : ''}
      </div>
    </div>`;
  const body = $('dlgBody');
  body.querySelector('#x').onclick = () => $('dlg').close();
  body.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => showPiece(data.pieces.find((x) => x.id === b.dataset.v), c)));
  const mk = body.querySelector('#mkmp4');
  if (mk) mk.onclick = async () => { mk.disabled = true; mk.textContent = '⏳ Creando el MP4…'; try { await api(`/api/pieces/${p.id}/render`, {}); } catch (e) { mk.textContent = e.message.slice(0, 60); } };
  const png = body.querySelector('#png');
  if (png) png.onclick = async () => { try { const r = await fetch(`/api/pieces/${p.id}/png`); if (!r.ok) throw 0; const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await r.blob()), download: `${(p.titulo.replace(/[^\w\- ]+/g, '').trim() || 'arte')}-v${p.version || 1}.png` }); a.click(); } catch { toPng(p); } };
  const pre = body.querySelector('pre[data-src]');
  if (pre) fetch(src).then((r) => r.text()).then((t) => (pre.textContent = t));
  if (!$('dlg').open) $('dlg').showModal();
  requestAnimationFrame(() => fitIframes(body));
}

// Convierte el SVG en PNG 1080×1350 en el navegador.
async function toPng(p) {
  try {
    const svg = await (await fetch(`/api/pieces/${p.id}/download`)).text();
    const img = new Image();
    img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    await img.decode();
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
    c.getContext('2d').drawImage(img, 0, 0, 1080, 1350);
    URL.revokeObjectURL(img.src);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${(() => { const t = p.titulo.replace(/[^\w\- ]+/g, '').trim() || 'arte'; return /v\d+$/.test(t) ? t : `${t}-v${p.version || 1}`; })()}.png` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (e) {
    alert('No se pudo convertir a PNG en este navegador. Descarga el SVG.');
  }
}

for (const id of ['fCliente', 'fEstado', 'fTipo']) $(id).addEventListener('change', render);
$('fBuscar').addEventListener('input', render);
window.addEventListener('hashchange', render);
window.addEventListener('resize', () => fitIframes($('list')));
$('dlg').addEventListener('click', (e) => e.target === $('dlg') && $('dlg').close());
$('dlg').addEventListener('close', () => $('dlgBody').replaceChildren()); // corta audio y video al cerrar

connect((type) => { if (['snapshot', 'piece', 'campaign'].includes(type)) load(); });
