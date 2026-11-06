// Administrador de archivos de un cliente: carpetas fijas + subcarpetas, subir
// (arrastrando o con botón), ver, mover y borrar. Se usa en "Clientes".
import { api, esc } from './common.js';

const ICON = { imagen: '🖼️', video: '🎬', pdf: '📄', archivo: '📎' };
const tam = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

// Sube un archivo con barra de progreso.
export function subir(url, file, onProgress) {
  return new Promise((ok, fail) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('Content-Type', 'application/octet-stream');
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch {} x.status < 300 ? ok(j) : fail(new Error(j.error || x.statusText)); };
    x.onerror = () => fail(new Error('Error de red'));
    x.send(file);
  });
}

export function openFiles(cliente) {
  let dlg = document.getElementById('dlgFiles');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'dlgFiles';
    dlg.style.width = 'min(1000px, calc(100vw - 24px))';
    document.body.append(dlg);
    dlg.addEventListener('click', (e) => e.target === dlg && dlg.close());
  }
  let data = [], actual = { carpeta: 'Logos', sub: '' };
  const base = `/api/clients/${cliente.id}`;

  async function load() { data = (await api(`${base}/files`)).carpetas; render(); }

  function render() {
    const c = data.find((x) => x.carpeta === actual.carpeta) || data[0];
    const sub = c.subcarpetas.find((s) => s.nombre === actual.sub);
    const lista = sub ? sub.archivos : c.archivos;
    const destinos = data.flatMap((x) => [x.carpeta, ...x.subcarpetas.map((s) => `${x.carpeta}/${s.nombre}`)]);
    dlg.innerHTML = `<div class="body" style="max-height:86vh">
      <div class="head"><h3>📁 Archivos de ${esc(cliente.nombre)}</h3><span style="flex:1"></span><button id="fx">✕</button></div>
      <div class="fm">
        <nav class="fm-side">${data.map((x) => `
          <button class="fm-f ${x.carpeta === actual.carpeta && !actual.sub ? 'on' : ''}" data-c="${esc(x.carpeta)}">📂 ${esc(x.carpeta)} <span>${x.archivos.length + x.subcarpetas.reduce((n, s) => n + s.archivos.length, 0)}</span></button>
          ${x.subcarpetas.map((s) => `<button class="fm-s ${x.carpeta === actual.carpeta && s.nombre === actual.sub ? 'on' : ''}" data-c="${esc(x.carpeta)}" data-s="${esc(s.nombre)}">↳ ${esc(s.nombre)} <span>${s.archivos.length}</span></button>`).join('')}`).join('')}
        </nav>
        <section class="fm-main">
          <div class="fm-path"><b>${esc(c.carpeta)}${sub ? ` / ${esc(sub.nombre)}` : ''}</b><div class="empty" style="font-size:13px">${esc(c.ayuda || '')}</div></div>
          <div class="fm-acts">
            <label class="fm-up primary-like">⬆️ Subir archivos<input type="file" multiple hidden id="fin"></label>
            ${sub ? `<button id="fdel">🗑️ Borrar subcarpeta</button>` : `<button id="fnew">＋ Subcarpeta</button>`}
          </div>
          <div class="fm-drop" id="fdrop">Arrastra aquí tus archivos · imágenes, videos, PDF, documentos o fuentes · máx. 250 MB c/u</div>
          <div class="fm-prog" id="fprog"></div>
          <div class="fm-grid">${lista.length ? lista.map((a) => `
            <div class="fm-item">
              <a class="fm-th" href="${base}/files/raw?path=${encodeURIComponent(a.ruta)}" target="_blank" rel="noopener">${a.tipo === 'imagen' ? `<img src="${base}/files/raw?path=${encodeURIComponent(a.ruta)}" loading="lazy" alt="">` : a.tipo === 'video' ? `<video src="${base}/files/raw?path=${encodeURIComponent(a.ruta)}#t=0.5" muted preload="metadata"></video>` : `<span>${ICON[a.tipo]}</span>`}</a>
              <div class="fm-n" title="${esc(a.nombre)}">${esc(a.nombre)}</div>
              <div class="fm-m">${tam(a.tam)}</div>
              <div class="fm-b"><select data-mv="${esc(a.ruta)}"><option value="">Mover a…</option>${destinos.filter((d) => d !== (sub ? `${c.carpeta}/${sub.nombre}` : c.carpeta)).map((d) => `<option>${esc(d)}</option>`).join('')}</select><button data-del="${esc(a.ruta)}" title="Borrar">🗑️</button></div>
            </div>`).join('') : '<div class="empty">Esta carpeta está vacía.</div>'}</div>
        </section>
      </div></div>`;
    dlg.querySelector('#fx').onclick = () => dlg.close();
    dlg.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { actual = { carpeta: b.dataset.c, sub: b.dataset.s || '' }; render(); }));
    const subirTodos = async (lista) => {
      const prog = dlg.querySelector('#fprog');
      for (const f of lista) {
        try {
          await subir(`${base}/files?carpeta=${encodeURIComponent(c.carpeta)}&sub=${encodeURIComponent(actual.sub)}&nombre=${encodeURIComponent(f.name)}`, f, (p) => (prog.textContent = `Subiendo ${f.name}… ${Math.round(p * 100)}%`));
        } catch (e) { alert(`${f.name}: ${e.message}`); }
      }
      prog.textContent = '';
      load();
    };
    dlg.querySelector('#fin').onchange = (e) => subirTodos([...e.target.files]);
    const drop = dlg.querySelector('#fdrop');
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); subirTodos([...e.dataTransfer.files]); };
    const nb = dlg.querySelector('#fnew');
    if (nb) nb.onclick = async () => { const n = prompt(`Nombre de la subcarpeta dentro de "${c.carpeta}" (ej. Navidad 2026):`); if (n) { try { const r = await api(`${base}/folders`, { carpeta: c.carpeta, nombre: n }); actual.sub = r.ruta.split('/')[1]; load(); } catch (e) { alert(e.message); } } };
    const db = dlg.querySelector('#fdel');
    if (db) db.onclick = async () => { try { const r = await fetch(`${base}/files?path=${encodeURIComponent(`${c.carpeta}/${actual.sub}`)}`, { method: 'DELETE' }); const j = await r.json(); if (!r.ok) throw new Error(j.error); actual.sub = ''; load(); } catch (e) { alert(e.message); } };
    dlg.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { if (!confirm('¿Borrar este archivo?')) return; await fetch(`${base}/files?path=${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' }); load(); }));
    dlg.querySelectorAll('[data-mv]').forEach((s) => (s.onchange = async () => { if (!s.value) return; try { await api(`${base}/files/move`, { ruta: s.dataset.mv, destino: s.value }); load(); } catch (e) { alert(e.message); } }));
  }

  if (!dlg.open) dlg.showModal();
  dlg.innerHTML = '<div class="body">Cargando…</div>';
  load();
}
