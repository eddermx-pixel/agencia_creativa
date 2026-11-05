// Clientes y sus kits de marca.
import { api, store, connect, esc } from './common.js';

const $ = (id) => document.getElementById(id);
let editing = null;   // id del cliente en edición (null = nuevo)
let colores = [];
let logo;             // undefined = sin cambios, null = quitar, string = nuevo

function render() {
  const g = $('grid');
  g.replaceChildren(...store.clients.map((c) => {
    const el = document.createElement('div');
    el.className = 'cl';
    el.innerHTML = `
      <div class="logo">${c.tieneLogo ? `<img src="/api/clients/${esc(c.id)}/logo?v=${esc(String(c.actualizado || ''))}" alt="">` : esc(c.nombre.slice(0, 2).toUpperCase())}</div>
      <div><div class="n">${esc(c.nombre)}</div><div class="r">${esc(c.rubro || 'Sin rubro')}${c.tono ? ` · ${esc(c.tono)}` : ''}</div></div>
      <div class="sw">${(c.colores || []).map((h) => `<span style="background:${esc(h)}"></span>`).join('')}</div>`;
    el.onclick = () => open(c);
    return el;
  }), Object.assign(document.createElement('button'), { className: 'cl new', textContent: '＋ Nuevo cliente', onclick: () => open(null) }));
}

function renderColors() {
  const box = $('colors');
  box.replaceChildren(...colores.map((h, i) => {
    const w = document.createElement('div');
    w.className = 'c';
    w.innerHTML = `<input type="color" value="${h}"><button type="button" class="x" title="Quitar">✕</button>`;
    w.querySelector('input').oninput = (e) => (colores[i] = e.target.value);
    w.querySelector('.x').onclick = () => { colores.splice(i, 1); renderColors(); };
    return w;
  }));
  if (colores.length < 5) {
    const add = Object.assign(document.createElement('button'), { type: 'button', textContent: '＋ Color' });
    add.onclick = () => { colores.push('#6c5ce7'); renderColors(); };
    box.append(add);
  }
}

function renderLogo(src) {
  const p = $('logoPrev');
  p.innerHTML = '';
  if (!src) return;
  const img = Object.assign(document.createElement('img'), { src, alt: 'Logo' });
  const rm = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Quitar logo' });
  rm.onclick = () => { logo = null; $('logoFile').value = ''; renderLogo(''); };
  p.append(img, rm);
}

function open(c) {
  editing = c?.id || null;
  logo = undefined;
  $('dlgTitle').textContent = c ? `Editar ${c.nombre}` : 'Nuevo cliente';
  const f = $('form');
  f.reset();
  for (const k of ['nombre', 'rubro', 'tono', 'publico', 'tipografia', 'notas']) f.elements[k].value = c?.[k] || '';
  colores = [...(c?.colores || [])];
  renderColors();
  renderLogo(c?.tieneLogo ? `/api/clients/${c.id}/logo?v=${Date.now()}` : '');
  $('dlg').showModal();
}

$('logoFile').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 500_000) { alert('El logo pesa más de 500 KB. Usa una versión más ligera.'); e.target.value = ''; return; }
  const r = new FileReader();
  r.onload = () => { logo = r.result; renderLogo(logo); };
  r.readAsDataURL(file);
};

$('cancel').onclick = () => $('dlg').close();
$('form').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const body = { colores };
  for (const k of ['nombre', 'rubro', 'tono', 'publico', 'tipografia', 'notas']) body[k] = f[k].value;
  if (logo !== undefined) body.logo = logo;
  body.actualizado = Date.now();
  try {
    await api(editing ? `/api/clients/${editing}` : '/api/clients', body);
    $('dlg').close();
  } catch (err) { alert(err.message); }
};

// ---- Mi agencia ----
let agLogo; // undefined = sin cambios, null = quitar, string = nuevo
function renderAgency(force) {
  const a = store.agencia || {};
  if (force || document.activeElement !== $('agName')) $('agName').value = a.nombre || '';
  const box = $('agLogo');
  const src = agLogo || (agLogo === null ? '' : a.tieneLogo ? `/api/agency/logo?v=${a.actualizado}` : '');
  box.innerHTML = src ? `<img src="${src}" alt="Logo">` : 'Sube tu logo<br>(blanco se ve mejor)';
}
$('agFile').onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  if (f.size > 500_000) { alert('El logo pesa más de 500 KB.'); e.target.value = ''; return; }
  const r = new FileReader(); r.onload = () => { agLogo = r.result; renderAgency(); }; r.readAsDataURL(f);
};
$('agRemove').onclick = () => { agLogo = null; $('agFile').value = ''; renderAgency(); };
$('agSave').onclick = async () => {
  const body = { nombre: $('agName').value };
  if (agLogo !== undefined) body.logo = agLogo;
  try { await api('/api/agency', body); agLogo = undefined; $('agMsg').textContent = '✓ Guardado'; setTimeout(() => ($('agMsg').textContent = ''), 2500); } catch (e) { alert(e.message); }
};

let first = true;
connect((type) => { render(); if (first || type === 'agency') { renderAgency(first); first = false; } });
