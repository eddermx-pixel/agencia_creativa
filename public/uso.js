// Panel de uso de IA: cuánto se gasta, en qué y quién.
import { api, store, byId, connect, avatar, esc, usd } from './common.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => new Intl.NumberFormat('es-MX').format(Math.round(n));
let rep = null;

async function load() {
  try { rep = await api('/api/usage'); render(); } catch (e) { console.warn(e); }
}

function kpi(l, v, s = '', extra = '') {
  return `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}${extra}</div>`;
}

function render() {
  if (!rep) return;
  $('demoNote').hidden = !store.demo;
  const pct = rep.presupuesto ? (rep.mes / rep.presupuesto) * 100 : null;
  const cls = pct >= 100 ? ' over' : pct >= 80 ? ' warn' : '';
  $('kpis').innerHTML = [
    kpi('Gasto este mes', usd(rep.mes), `${fmt(rep.total.llamadas)} llamadas a la IA`),
    kpi('Hoy', usd(rep.hoy)),
    kpi('Proyección fin de mes', rep.proyeccion != null ? usd(rep.proyeccion) : '—', 'Si sigues al mismo ritmo'),
    rep.presupuesto
      ? kpi('Presupuesto mensual', `${Math.round(pct)}%`, `${usd(rep.mes)} de ${usd(rep.presupuesto)} · quedan ${usd(Math.max(0, rep.presupuesto - rep.mes))}`, `<div class="prog${cls}"><i style="width:${Math.min(100, pct)}%"></i></div>`)
      : kpi('Presupuesto mensual', 'Sin límite', 'Agrega MONTHLY_BUDGET en Railway'),
  ].join('');
  renderDaily();
  renderAgents();
  renderCamps();
  const t = rep.total;
  $('tokens').innerHTML = `<table><thead><tr><th>Tipo</th><th class="n">Tokens</th></tr></thead><tbody>
    <tr><td>Entrada (lo que leen los agentes)</td><td class="n">${fmt(t.entrada)}</td></tr>
    <tr><td>Salida (lo que escriben: textos, SVG, HTML)</td><td class="n">${fmt(t.salida)}</td></tr>
    <tr><td>Leídos de caché (más baratos)</td><td class="n">${fmt(t.cache)}</td></tr>
    ${rep.porModelo.map((m) => `<tr><td>Modelo <code>${esc(m.modelo)}</code></td><td class="n">${usd(m.usd)}</td></tr>`).join('')}
  </tbody></table>`;
}

function renderDaily() {
  const box = $('daily');
  const svg = box.querySelector('svg');
  const tip = box.querySelector('.tip');
  const W = box.clientWidth || 600, H = 220, padL = 44, padB = 22, padT = 8;
  const data = rep.porDia;
  const max = Math.max(...data.map((d) => d.usd));
  const nice = max < 0.01 ? 1 : (() => { const p = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / p) * p; })();
  const slot = (W - padL) / data.length;
  const bw = Math.min(24, slot - 2);
  const y = (v) => padT + (H - padT - padB) * (1 - v / nice);
  let s = '';
  for (let i = 0; i <= 3; i++) {
    const v = (nice / 3) * i, yy = y(v);
    s += `<line x1="${padL}" x2="${W}" y1="${yy}" y2="${yy}" stroke="#26263a" stroke-width="1"/>`;
    s += `<text x="${padL - 6}" y="${yy + 4}" text-anchor="end" font-size="11" fill="#9a98ad">${nice < 3 ? v.toFixed(2) : v.toFixed(0)}</text>`;
  }
  data.forEach((d, i) => {
    const x = padL + i * slot + (slot - bw) / 2;
    const h = Math.max(0, y(0) - y(d.usd));
    if (h > 0) {
      const r = Math.min(4, h);
      s += `<path d="M${x},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} z" fill="#8b7bff"/>`;
    }
    s += `<rect x="${padL + i * slot}" y="${padT}" width="${slot}" height="${H - padT - padB}" fill="transparent" data-i="${i}"/>`;
    if (i % 7 === 0 || i === data.length - 1) s += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="#9a98ad">${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}</text>`;
  });
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = s;
  svg.onmousemove = (e) => {
    const i = e.target.dataset?.i;
    if (i === undefined) { tip.style.display = 'none'; return; }
    const d = data[i];
    tip.innerHTML = `<b>${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}</b> · ${usd(d.usd)} · ${d.llamadas} llamadas`;
    const r = box.getBoundingClientRect();
    tip.style.left = `${e.clientX - r.left}px`; tip.style.top = `${e.clientY - r.top}px`; tip.style.display = 'block';
  };
  svg.onmouseleave = () => (tip.style.display = 'none');
}

function hbars(el, rows, label) {
  if (!rows.length) { el.innerHTML = '<div class="empty">Sin gasto todavía.</div>'; return; }
  const max = Math.max(...rows.map((r) => r.usd), 0.0001);
  el.replaceChildren(...rows.map((r) => {
    const d = document.createElement('div');
    d.className = 'hb';
    d.title = `${r.llamadas} llamadas · ${fmt(r.tokens)} tokens`;
    d.innerHTML = `<div class="nm"></div><div class="track"><i style="width:${(r.usd / max) * 100}%"></i></div><div class="val">${usd(r.usd)}</div>`;
    label(d.querySelector('.nm'), r);
    return d;
  }));
}

function renderAgents() {
  hbars($('agents'), rep.porAgente, (el, r) => {
    const a = byId(r.id);
    if (a) el.append(avatar(a, 24));
    el.append(a ? a.nombre : r.id === 'chat' ? 'Chat' : r.id);
  });
}
function renderCamps() {
  hbars($('camps'), rep.porCampana, (el, r) => { el.textContent = r.cliente; });
}

connect((type) => { if (type === 'snapshot' || type === 'usage') load(); else render(); });
window.addEventListener('resize', () => rep && renderDaily());
