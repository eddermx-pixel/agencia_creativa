// Avisos de decisiones pendientes en TODAS las páginas:
//  · campana 🔔 con el número en el encabezado
//  · número en el título de la pestaña y en el ícono (favicon)
//  · sonido suave y vibración cuando llega algo nuevo
//  · notificación del navegador (si la activas) cuando la pestaña está en segundo plano
import { esc } from './common.js';

const vistos = new Set();
let inicial = true, ultimoN = 0, ctxAudio = null;
const tituloBase = document.title.replace(/^\(\d+\)\s*/, '');
const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

export const permisoNotif = () => ('Notification' in window ? Notification.permission : 'no-soportado');
export async function pedirPermisoNotif() { if (!('Notification' in window)) return 'no-soportado'; const r = await Notification.requestPermission(); return r; }
export const sonidoActivo = () => pref('aviso-sonido', '1') === '1';
export const setSonido = (v) => guardar('aviso-sonido', v ? '1' : '0');

export function pendientes(store) {
  const reqs = store.requests.filter((r) => r.estado === 'pendiente');
  const piezas = store.pieces.filter((p) => p.estado === 'pendiente');
  const fallas = store.campaigns.filter((c) => c.estado === 'error');
  return { reqs, piezas, fallas, total: reqs.length + piezas.length + fallas.length };
}

function ping() {
  if (!sonidoActivo()) return;
  try {
    ctxAudio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctxAudio.state === 'suspended') ctxAudio.resume();
    const t = ctxAudio.currentTime;
    [[784, 0], [1047, 0.12]].forEach(([f, d]) => { const o = ctxAudio.createOscillator(), g = ctxAudio.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.18, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.35); o.connect(g); g.connect(ctxAudio.destination); o.start(t + d); o.stop(t + d + 0.4); });
  } catch {}
}

function favicon(n) {
  let l = document.querySelector('link[rel~="icon"]');
  if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.append(l); }
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#8b7bff'; g.beginPath(); g.roundRect(4, 4, 56, 56, 14); g.fill();
  g.fillStyle = '#fff'; g.font = '700 34px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🚀', 32, 34);
  if (n) { g.fillStyle = '#ff5d6c'; g.beginPath(); g.arc(46, 18, 17, 0, 6.3); g.fill(); g.fillStyle = '#fff'; g.font = '800 22px system-ui'; g.fillText(n > 9 ? '9+' : String(n), 46, 19); }
  l.href = c.toDataURL('image/png');
}

function campana(n) {
  let b = document.getElementById('bell');
  if (!b) {
    const h = document.querySelector('header.top'); if (!h) return;
    b = document.createElement('a'); b.id = 'bell'; b.className = 'chip bell'; b.href = 'decisiones.html'; b.title = 'Decisiones pendientes';
    const chip = document.getElementById('usageChip');
    chip ? chip.after(b) : h.append(b);
  }
  b.className = `chip bell${n ? ' on' : ''}`;
  b.innerHTML = `🔔<span class="bn">${n || ''}</span>`;
}

function avisar(titulo, cuerpo, url) {
  ping(); try { navigator.vibrate?.([120, 60, 120]); } catch {}
  if (document.hidden && permisoNotif() === 'granted') {
    try { const n = new Notification(titulo, { body: cuerpo, tag: titulo, icon: document.querySelector('link[rel~="icon"]')?.href }); n.onclick = () => { window.focus(); location.href = url || 'decisiones.html'; n.close(); }; } catch {}
  }
}

export function notifyTick(store, type, data, byId) {
  const p = pendientes(store);
  // Quita de "vistos" lo que ya se resolvió, para poder avisar si vuelve a pasar
  campana(p.total);
  document.title = `${p.total ? `(${p.total}) ` : ''}${tituloBase}`;
  if (p.total !== ultimoN) { favicon(p.total); ultimoN = p.total; }
  const items = [...p.reqs.map((r) => ({ id: r.id, t: `${byId(r.agente)?.nombre || r.agente} necesita tu decisión`, b: r.texto, u: 'decisiones.html' })), ...p.piezas.map((x) => ({ id: x.id, t: `${byId(x.agente)?.nombre || x.agente} entregó algo para aprobar`, b: x.titulo, u: x.tipo === 'video' && x.motor === 'v2' ? `player.html?id=${x.id}` : `feed.html#${x.id}` })), ...p.fallas.map((c) => ({ id: `${c.id}:${c.resumen}`, t: 'Una campaña se detuvo', b: c.cliente, u: 'decisiones.html' }))];
  if (inicial) { items.forEach((i) => vistos.add(i.id)); if (store.roster.length) inicial = false; return; }
  for (const i of items) if (!vistos.has(i.id)) { vistos.add(i.id); avisar(i.t, i.b, i.u); break; }
  for (const i of items) vistos.add(i.id);
  document.dispatchEvent(new CustomEvent('decisiones', { detail: p }));
}
