// Tablero de progreso: cada campaña con su barra, qué falta y quién está trabajando.
import { store, byId, esc, hace, usd } from './common.js';

const PASOS = [['preguntas', '📝 Preguntas', 15], ['junta', '🧠 Junta creativa', 15], ['concepto', '💡 Concepto', 15], ['produccion', '🛠️ Producción', 30], ['aprobacion', '👍 Tus aprobaciones', 20], ['fin', '🏁 Entrega', 5]];

export function calcular(c) {
  const piezas = store.pieces.filter((p) => p.campaignId === c.id && p.estado !== 'expirada');
  const aprobadas = piezas.filter((p) => p.estado === 'aprobada').length;
  const pendientes = piezas.filter((p) => p.estado === 'pendiente');
  const juntaOk = (store.meetings || []).some((m) => m.campaignId === c.id && m.estado === 'terminada');
  const fin = c.estado === 'terminada';
  const fase = c.fase || 'descubrimiento';
  const pasado = (f) => fin || ['concepto', 'produccion', 'terminada'].indexOf(fase) >= ['concepto', 'produccion', 'terminada'].indexOf(f);
  const esperadas = Math.max(3, piezas.length);
  const f = {
    preguntas: fin || fase !== 'descubrimiento' || juntaOk ? 1 : 0,
    junta: fin || juntaOk || ['produccion'].includes(fase) ? 1 : 0,
    concepto: fin || fase === 'produccion' ? 1 : 0,
    produccion: fin ? 1 : Math.min(1, piezas.length / esperadas),
    aprobacion: fin ? 1 : piezas.length ? Math.min(1, aprobadas / esperadas) : 0,
    fin: fin ? 1 : 0,
  };
  const pct = Math.round(PASOS.reduce((n, [k, , w]) => n + w * f[k], 0));
  const pedidos = store.requests.filter((r) => r.campaignId === c.id && r.estado === 'pendiente');
  const trabajando = Object.values(store.agents).filter((a) => a.campaignId === c.id && ['trabajando', 'junta', 'entregando'].includes(a.estado)).map((a) => byId(a.id)?.nombre).filter(Boolean);
  let ahora, tono = 'ok';
  if (fin) ahora = '✅ Terminada';
  else if (c.estado === 'error') { ahora = `⚠️ Se detuvo: ${(c.resumen || '').slice(0, 100)}`; tono = 'no'; }
  else if (c.estado === 'interrumpida') { ahora = '⏸️ Interrumpida (reinicio del servidor)'; tono = 'warn'; }
  else if (c.enCola) { ahora = '⏳ En fila: espera a que termine otra campaña'; tono = 'warn'; }
  else if (pedidos.length) { ahora = `🙋 Esperando TU respuesta: ${pedidos[0].texto.slice(0, 90)}`; tono = 'warn'; }
  else if (pendientes.length) { ahora = `👉 Esperando tu aprobación: ${pendientes.map((p) => p.titulo).join(', ').slice(0, 90)}`; tono = 'warn'; }
  else if (trabajando.length) ahora = `⚙️ Trabajando: ${trabajando.join(', ')}`;
  else ahora = c.activa === false ? '⚠️ Nadie está trabajando en ella (usa Reanudar)' : '⚙️ En marcha';
  return { pct: fin ? 100 : pct, f, ahora, tono, piezas: piezas.length, aprobadas };
}

const OBJ = { reconocimiento: 'Reconocimiento', trafico: 'Tráfico', leads: 'Leads', ventas: 'Ventas', fidelizacion: 'Fidelización', lanzamiento: 'Lanzamiento', comunidad: 'Comunidad' };

export function renderProgreso(box) {
  const todas = [...store.campaigns].sort((a, b) => b.creada - a.creada);
  const activas = todas.filter((c) => c.estado !== 'terminada');
  const hechas = todas.filter((c) => c.estado === 'terminada').slice(0, 4);
  const card = (c) => {
    const r = calcular(c);
    return `<div class="pg"><div class="pgh"><b>${esc(c.cliente)}</b>${c.objetivo ? `<span class="pgt">${esc(OBJ[c.objetivo] || c.objetivo)}</span>` : ''}<span style="flex:1"></span><span class="empty" style="font-size:12px">${hace(c.creada)}${store.demo ? '' : ` · ${usd(c.costo || 0)}`}</span></div>
      <div class="pgb"><i class="${r.tono}" style="width:${r.pct}%"></i><span>${r.pct}%</span></div>
      <div class="pgs">${PASOS.map(([k, l]) => `<span class="${r.f[k] >= 1 ? 'on' : r.f[k] > 0 ? 'mid' : ''}">${r.f[k] >= 1 ? '✓ ' : ''}${l}${k === 'produccion' || k === 'aprobacion' ? ` (${k === 'produccion' ? r.piezas : r.aprobadas})` : ''}</span>`).join('')}</div>
      <div class="pga ${r.tono}">${esc(r.ahora)}</div>
      <div class="empty" style="font-size:12px;margin-top:4px">${esc(c.brief.slice(0, 120))}${c.brief.length > 120 ? '…' : ''} · <a href="archivo.html#c=${c.id}">ver archivo</a></div></div>`;
  };
  box.innerHTML = `<div class="pgstyle"></div>${activas.length ? activas.map(card).join('') : '<div class="empty">No hay campañas en curso. Pulsa “＋ Campaña” en la oficina.</div>'}${hechas.length ? `<h2 style="margin:14px 0 6px;font-size:13px;color:var(--muted)">Terminadas recientes</h2>${hechas.map(card).join('')}` : ''}`;
}

export const ESTILO = `
  .pg { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; margin-bottom: 10px; }
  .pgh { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .pgt { font-size: 11px; background: var(--chip); border-radius: 999px; padding: 2px 8px; }
  .pgb { position: relative; height: 18px; background: var(--chip); border-radius: 9px; overflow: hidden; margin: 10px 0 8px; }
  .pgb i { display: block; height: 100%; border-radius: 9px; background: linear-gradient(90deg, #8b7bff, #22c993); transition: width .6s; }
  .pgb i.warn { background: linear-gradient(90deg, #8b7bff, #ffb547); } .pgb i.no { background: #ff5d6c; }
  .pgb span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.6); }
  .pgs { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12px; } .pgs span { background: var(--chip); border-radius: 999px; padding: 3px 9px; color: var(--muted); }
  .pgs span.on { background: rgba(34,201,147,.16); color: #22c993; } .pgs span.mid { background: rgba(255,181,71,.16); color: #ffb547; }
  .pga { margin-top: 8px; font-size: 14px; } .pga.warn { color: #ffb547; } .pga.no { color: #ff5d6c; }`;

// Ventana que se abre al hacer clic en la TV de la oficina
let dlg = null, timer = 0;
export function openProgreso() {
  if (!dlg) {
    dlg = document.createElement('dialog'); dlg.id = 'dlgProgreso'; dlg.style.width = 'min(760px, calc(100vw - 24px))';
    dlg.innerHTML = `<style>${ESTILO}</style><div class="body" style="max-height:88vh;overflow:auto"><div class="head"><h3>📺 Pixel News · Progreso de campañas</h3><span style="flex:1"></span><a href="progreso.html"><button>Abrir completo</button></a><button id="pgx">✕</button></div><div id="pgbox"></div></div>`;
    document.body.append(dlg);
    dlg.querySelector('#pgx').onclick = () => dlg.close();
    dlg.addEventListener('click', (e) => e.target === dlg && dlg.close());
    dlg.addEventListener('close', () => clearInterval(timer));
  }
  const draw = () => renderProgreso(dlg.querySelector('#pgbox'));
  draw(); clearInterval(timer); timer = setInterval(draw, 2000);
  if (!dlg.open) dlg.showModal();
}
