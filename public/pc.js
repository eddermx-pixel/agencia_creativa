// "Computadora" de cada agente: resumen de lo que hace + sus archivos y los compartidos.
import { api, esc, hace, byId, avatar } from './common.js';
import { subir } from './archivos-cliente.js';

const fmt = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

export async function openPC(agentId) {
  let dlg = document.getElementById('dlgPC');
  if (!dlg) {
    dlg = document.createElement('dialog'); dlg.id = 'dlgPC'; dlg.style.width = 'min(920px, calc(100vw - 24px))';
    document.body.append(dlg);
    dlg.addEventListener('click', (e) => e.target === dlg && dlg.close());
  }
  let tab = 'resumen', visor = null, d = null;
  dlg.innerHTML = '<div class="body">Encendiendo la computadora…</div>';
  if (!dlg.open) dlg.showModal();
  try { d = await api(`/api/agents/${agentId}/pc`); } catch (e) { dlg.innerHTML = `<div class="body">${esc(e.message)}</div>`; return; }
  const a = d.agente;

  const archivos = (espacio, lista) => {
    const todo = lista.flatMap((c) => [...c.archivos.map((x) => ({ ...x, c: c.carpeta })), ...c.subcarpetas.flatMap((s) => s.archivos.map((x) => ({ ...x, c: `${c.carpeta}/${s.nombre}` })))]);
    if (!todo.length) return '<div class="empty">Todavía no hay archivos aquí.</div>';
    const grupos = {};
    for (const f of todo) (grupos[f.c || '(raíz)'] ||= []).push(f);
    return Object.entries(grupos).map(([c, fs]) => `<div style="margin-bottom:10px"><b>📂 ${esc(c)}</b>${fs.map((f) => `<div class="pcf" data-e="${esc(espacio)}" data-r="${esc(f.ruta)}" data-t="${f.texto ? 1 : 0}" style="display:flex;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer;align-items:center">${f.imagen ? `<img src="/api/espacios/${esc(espacio)}/archivo?path=${encodeURIComponent(f.ruta)}" alt="" style="width:34px;height:34px;object-fit:cover;border-radius:6px;background:#0b0b12">` : `<span>${f.texto ? '📝' : '📎'}</span>`}<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.nombre)}</span><span class="empty" style="font-size:12px">${fmt(f.tam)} · ${hace(f.mod)}</span></div>`).join('')}</div>`).join('');
  };

  const bloqueSubir = () => `<div id="pcUp" style="border:2px dashed var(--line);border-radius:12px;padding:12px;text-align:center"><label class="primary-like" style="cursor:pointer;display:inline-block"><b>⬆️ Subir archivos para ${esc(a.nombre)}</b><input type="file" id="pcFile" multiple hidden></label><div class="empty" style="font-size:12px;margin-top:4px">Logo, fotos, audio, video, PDF o fuentes (máx. 100 MB). También puedes arrastrarlos aquí. Quedan en su carpeta <b>subidos</b>, y ${esc(a.nombre)} los puede ver y usar.</div><div id="pcProg" class="empty" style="font-size:13px"></div></div>`;
  const enlazarSubida = (m) => {
    const subirTodos = async (lista) => {
      const prog = m.querySelector('#pcProg');
      for (const f of lista) { try { await subir(`/api/espacios/${a.id}/subir?nombre=${encodeURIComponent(f.name)}`, f, (p) => (prog.textContent = `Subiendo ${f.name}… ${Math.round(p * 100)}%`)); } catch (e) { alert(`${f.name}: ${e.message}`); } }
      prog.textContent = '✓ Listo'; d = await api(`/api/agents/${agentId}/pc`); tab = 'propios'; draw();
    };
    m.querySelector('#pcFile').onchange = (e) => subirTodos([...e.target.files]);
    const z = m.querySelector('#pcUp');
    z.ondragover = (e) => { e.preventDefault(); z.style.borderColor = 'var(--accent)'; };
    z.ondragleave = () => (z.style.borderColor = '');
    z.ondrop = (e) => { e.preventDefault(); z.style.borderColor = ''; subirTodos([...e.dataTransfer.files]); };
  };
  const draw = () => {
    const ahora = d.ahora;
    const tabs = [['resumen', '🖥️ Resumen'], ['propios', `📁 Mis archivos`], ['compartido', '🤝 Compartido']];
    dlg.innerHTML = `<div class="body" style="max-height:88vh">
      <div class="head"><div id="pcAv"></div><div><h3>Computadora de ${esc(a.nombre)}</h3><div class="sub">${esc(a.rol)}</div></div><span style="flex:1"></span><button id="pcX">✕</button></div>
      <div class="opts" style="display:flex;gap:6px;flex-wrap:wrap">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'primary' : ''}">${l}</button>`).join('')}</div>
      <div id="pcMain" style="overflow:auto;display:flex;flex-direction:column;gap:10px"></div></div>`;
    dlg.querySelector('#pcAv').append(avatar(a, 56));
    dlg.querySelector('#pcX').onclick = () => dlg.close();
    dlg.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; visor = null; draw(); }));
    const m = dlg.querySelector('#pcMain');
    if (tab === 'resumen') {
      m.innerHTML = `${bloqueSubir()}
        <div class="card" style="box-shadow:none"><h2>Ahora mismo</h2><div>${esc(ahora.burbuja || (ahora.estado === 'libre' ? 'Libre, esperando trabajo' : ahora.estado))}</div></div>
        ${d.campana ? `<div class="card" style="box-shadow:none"><h2>Campaña</h2><div><b>${esc(d.campana.cliente)}</b> · ${esc(d.campana.fase || d.campana.estado)}</div><div class="empty" style="font-size:13px">${esc(d.campana.brief)}</div></div>` : ''}
        ${d.tarea ? `<div class="card" style="box-shadow:none"><h2>Su tarea</h2><div style="white-space:pre-wrap;font-size:14px">${esc(d.tarea)}</div></div>` : ''}
        ${d.ultimaTarea ? `<div class="card" style="box-shadow:none"><h2>Última tarea terminada</h2><div class="empty">${esc(d.ultimaTarea.tarea)}</div><div style="margin-top:6px;white-space:pre-wrap;font-size:14px">${esc(d.ultimaTarea.resultado)}</div></div>` : ''}
        ${d.dicho ? `<div class="card" style="box-shadow:none"><h2>Lo último que pensó${d.herramientas.length ? ` · usó ${esc(d.herramientas.join(', '))}` : ''}</h2><div style="white-space:pre-wrap;font-size:14px">${esc(d.dicho)}</div></div>` : ''}
        <div class="card" style="box-shadow:none"><h2>Entregas</h2><div>${d.entregas.total} en total · ✅ ${d.entregas.aprobadas} aprobadas · ❌ ${d.entregas.rechazadas} rechazadas${d.esperando.piezas.length ? ` · ⏳ esperando tu OK: ${esc(d.esperando.piezas.join(', '))}` : ''}</div>${d.esperando.solicitudes.length ? `<div style="margin-top:6px">❓ Esperando tu respuesta: ${d.esperando.solicitudes.map((s) => esc(s.texto)).join(' · ')}</div>` : ''}</div>
        <div class="card" style="box-shadow:none"><h2>Actividad reciente</h2><div class="log">${d.reciente.length ? d.reciente.map((l) => `<div>${esc(l.texto)} <time>${hace(l.t)}</time></div>`).join('') : '<div class="empty">Sin actividad.</div>'}</div></div>`;
      enlazarSubida(m);
    } else {
      const espacio = tab === 'propios' ? a.id : 'compartido';
      m.innerHTML = `${tab === 'propios' ? bloqueSubir() : ''}<div class="empty" style="font-size:13px">${tab === 'propios' ? `Archivos de la computadora de ${esc(a.nombre)} (notas, briefs, resultados).` : 'Carpeta compartida: todos los agentes escriben y leen aquí (briefs, conceptos, juntas, entregas por campaña).'}</div><div id="pcList">${archivos(espacio, tab === 'propios' ? d.espacio : d.compartido)}</div><div id="pcView"></div>`;
      if (tab === 'propios') enlazarSubida(m);
      m.querySelectorAll('.pcf').forEach((row) => (row.onclick = async () => {
        const url = `/api/espacios/${encodeURIComponent(row.dataset.e)}/archivo?path=${encodeURIComponent(row.dataset.r)}`;
        const v = m.querySelector('#pcView');
        if (row.dataset.t === '1') { const t = await (await fetch(url)).text(); v.innerHTML = `<div class="card" style="box-shadow:none"><h2>${esc(row.dataset.r)} <a href="${url}" download><button>⬇️</button></a></h2><pre style="white-space:pre-wrap;font:14px/1.5 ui-monospace,monospace;margin:0">${esc(t)}</pre></div>`; }
        else if (/\.(png|jpe?g|webp|gif|svg)$/i.test(row.dataset.r)) v.innerHTML = `<div class="card" style="box-shadow:none"><img src="${url}" alt="" style="max-width:100%;max-height:320px;background:#fff;border-radius:8px"></div>`;
        else v.innerHTML = `<a href="${url}" target="_blank" rel="noopener"><button>Abrir ${esc(row.dataset.r)}</button></a>`;
        v.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }));
    }
  };
  draw();
}
