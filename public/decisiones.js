// Bandeja de decisiones: todo lo que espera tu respuesta, en un solo lugar.
import { api, store, connect, esc, hace } from './common.js';
import { reqElement, pieceDecision } from './decisions.js';
import { permisoNotif, pedirPermisoNotif, sonidoActivo, setSonido, pendientes } from './notify.js';

const $ = (id) => document.getElementById(id);

function opciones() {
  const p = permisoNotif();
  $('bNotif').textContent = p === 'granted' ? '🔔 Avisos activados' : p === 'denied' ? '🔕 Bloqueados (actívalos en el navegador)' : p === 'no-soportado' ? '🔔 Avisos no disponibles aquí (usa Telegram)' : '🔔 Activar avisos en este dispositivo';
  $('bNotif').disabled = p !== 'default';
  $('bSnd').textContent = sonidoActivo() ? '🔊 Sonido: sí' : '🔇 Sonido: no';
}
$('bNotif').onclick = async () => { await pedirPermisoNotif(); opciones(); };
$('bSnd').onclick = () => { setSonido(!sonidoActivo()); opciones(); };

let sig = '';
function render() {
  const p = pendientes(store);
  const s = JSON.stringify([p.reqs.map((r) => r.id), p.piezas.map((x) => x.id), p.fallas.map((c) => c.id + c.resumen)]);
  const box = $('lista');
  if (s === sig) return;
  if (box.contains(document.activeElement) && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  sig = s;
  if (!p.total) { box.innerHTML = '<div class="big0">✅ Todo al día.<br>Nadie está esperando tu decisión.</div>'; return; }
  const nodes = [];
  if (p.fallas.length) {
    const sec = document.createElement('div'); sec.className = 'sec'; sec.innerHTML = '<h2>⚠️ Campañas detenidas</h2>';
    for (const c of p.fallas) {
      const f = document.createElement('div'); f.className = 'fail';
      f.innerHTML = `<b>${esc(c.cliente)}</b><div class="empty" style="font-size:13px">${esc(String(c.resumen || '').slice(0, 300))}</div><div><button class="primary">🔄 Reintentar</button></div>`;
      f.querySelector('button').onclick = async (e) => { e.target.disabled = true; try { await api(`/api/campaigns/${c.id}/retry`, {}); } catch (err) { alert(err.message); e.target.disabled = false; } };
      sec.append(f);
    }
    nodes.push(sec);
  }
  if (p.reqs.length) { const sec = document.createElement('div'); sec.className = 'sec'; sec.innerHTML = '<h2>💬 Te preguntan o piden permiso</h2>'; sec.append(...p.reqs.map(reqElement)); nodes.push(sec); }
  if (p.piezas.length) { const sec = document.createElement('div'); sec.className = 'sec'; sec.innerHTML = '<h2>🎬 Por aprobar</h2>'; sec.append(...p.piezas.map((x) => pieceDecision(x))); nodes.push(sec); }
  box.replaceChildren(...nodes);
}
connect(() => { render(); opciones(); });
opciones();
