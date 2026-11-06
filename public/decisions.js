// Tarjetas de decisión compartidas: oficina, bandeja de decisiones y avisos.
import { api, byId, avatar, esc, hace } from './common.js';

export const TIPOS = { curso: '🎓 quiere tomar un curso', autorizacion: '🔐 pide autorización', cuestionario: '📝 tiene preguntas', concepto: '💡 presenta el concepto', pregunta: '❓ pregunta' };

export function reqElement(r) {
  const a = byId(r.agente);
  const el = document.createElement('div');
  el.className = `req req-${r.tipo}`;
  el.innerHTML = `<div class="who"></div><div class="txt">${esc(r.texto)}</div>${r.detalle ? `<div class="det">${esc(r.detalle)}</div>` : ''}<div class="row"></div>`;
  el.querySelector('.who').append(avatar(a, 28), `${a?.nombre || r.agente} · ${TIPOS[r.tipo] || r.tipo}`);
  const row = el.querySelector('.row');
  const send = async (body) => { el.querySelectorAll('button').forEach((b) => (b.disabled = true)); try { await api(`/api/requests/${r.id}`, body); } catch (e) { alert(e.message); el.querySelectorAll('button').forEach((b) => (b.disabled = false)); } };
  const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);

  if (r.tipo === 'autorizacion' || r.tipo === 'curso') {
    const inp = mk('input', { placeholder: 'Comentario (opcional)' });
    const ok = mk('button', { className: 'ok', textContent: r.tipo === 'curso' ? '🎓 Aprobar curso' : 'Autorizar', onclick: () => send({ aprobado: true, respuesta: inp.value }) });
    const no = mk('button', { className: 'no', textContent: r.tipo === 'curso' ? 'Ahora no' : 'No', onclick: () => send({ aprobado: false, respuesta: inp.value }) });
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


// Tarjeta compacta de una pieza por aprobar (con los mismos botones del feed)
export function pieceDecision(p, { onDone } = {}) {
  const a = byId(p.agente);
  const el = document.createElement('div');
  el.className = 'req req-pieza';
  const icono = { arte: '🎨', video: '🎬', texto: '✍️' }[p.tipo] || '📦';
  const src = p.tipo === 'arte' ? `/api/pieces/${p.id}/render` : '';
  el.innerHTML = `<div class="who"></div>${src ? `<img src="${src}" alt="" style="width:100%;max-height:260px;object-fit:contain;background:#07070c;border-radius:10px;margin-top:8px">` : ''}<div class="txt"><b>${icono} ${esc(p.titulo)}</b></div><div class="det">${esc(p.descripcion || '')}</div><div class="row"><a href="${p.tipo === 'video' && p.motor === 'v2' ? `/player.html?id=${p.id}` : '/feed.html#' + p.id}"><button>👁️ Ver${p.tipo === 'video' ? ' (con sonido)' : ''}</button></a><button class="no">❌</button><button class="ok">✅ Aprobar</button></div>`;
  el.querySelector('.who').append(avatar(a, 28), `${a?.nombre || p.agente} · entregó ${p.tipo} (v${p.version || 1}) · ${hace(p.creada)}`);
  const send = async (aprobado, comentario = '') => { el.querySelectorAll('button').forEach((b) => (b.disabled = true)); try { await api(`/api/pieces/${p.id}`, { aprobado, comentario }); onDone?.(); } catch (e) { alert(e.message); el.querySelectorAll('button').forEach((b) => (b.disabled = false)); } };
  el.querySelector('.ok').onclick = () => send(true);
  el.querySelector('.no').onclick = () => { const c = prompt('¿Qué le cambiarías? (opcional)'); if (c !== null) send(false, c); };
  return el;
}
