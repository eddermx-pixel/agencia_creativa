// Utilidades compartidas: conexión en vivo, API y dibujo de personajes pixel-art.

export async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

// Estado compartido que se mantiene sincronizado con el servidor.
export const store = { demo: false, agencia: {}, uso: {}, roster: [], clients: [], agents: {}, campaigns: [], requests: [], pieces: [], log: [] };
export const byId = (id) => store.roster.find((a) => a.id === id);

export function connect(onChange) {
  let retry = 1000;
  const open = () => {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => { retry = 1000; document.body.classList.remove('offline'); };
    ws.onmessage = (ev) => {
      const { type, data } = JSON.parse(ev.data);
      if (type === 'snapshot') {
        Object.assign(store, data, { agents: Object.fromEntries(data.agents.map((a) => [a.id, a])) });
      } else if (type === 'agent') store.agents[data.id] = data;
      else if (type === 'log') { store.log.push(data); store.log = store.log.slice(-200); }
      else if (type === 'request') upsert(store.requests, data, (r) => r.estado === 'pendiente');
      else if (type === 'piece') upsert(store.pieces, data);
      else if (type === 'campaign') upsert(store.campaigns, data);
      else if (type === 'client') upsert(store.clients, data);
      else if (type === 'usage') store.uso = data;
      else if (type === 'agency') store.agencia = data;
      paintHeader();
      onChange(type, data);
    };
    ws.onclose = () => {
      document.body.classList.add('offline');
      setTimeout(open, retry);
      retry = Math.min(retry * 2, 15000);
    };
  };
  open();
}

function upsert(list, item, keep = () => true) {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list.splice(i, 1);
  if (keep(item)) list.push(item);
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const hace = (t) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return new Date(t).toLocaleDateString();
};

// ---------- Personajes pixel-art ----------
// (x, y) = punto entre los pies. Mide ~12×20 px "de mundo".
export function drawCharacter(ctx, x, y, look, { frame = 0, walking = false, facing = 'down', typing = false, sitting = false } = {}) {
  const r = (px, py, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x + px), Math.round(y + py), w, h); };
  const step = walking ? (Math.floor(frame / 8) % 2 ? 1 : -1) : 0;
  const pants = '#2d3436';
  const shoe = '#1e1e1e';

  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), 6, 2, 0, 0, Math.PI * 2); ctx.fill();

  if (!sitting) {
    r(-4, -5 + (step > 0 ? -1 : 0), 3, 5, pants); r(1, -5 + (step < 0 ? -1 : 0), 3, 5, pants);
    r(-4, -1 + (step > 0 ? -1 : 0), 3, 1, shoe); r(1, -1 + (step < 0 ? -1 : 0), 3, 1, shoe);
  }
  const by = sitting ? -9 : -12;
  r(-5, by, 10, 7, look.camisa);
  r(-5, by + 6, 10, 1, 'rgba(0,0,0,.2)');
  const arm = typing ? (Math.floor(frame / 5) % 2) : 0;
  const swing = walking ? step : 0;
  r(-7, by + 1 + swing - arm, 2, 5, look.camisa); r(5, by + 1 - swing - (typing ? 1 - arm : 0), 2, 5, look.camisa);
  r(-7, by + 6 + swing - arm, 2, 1, look.piel); r(5, by + 6 - swing - (typing ? 1 - arm : 0), 2, 1, look.piel);

  const hy = by - 8;
  r(-4, hy, 8, 8, look.piel);
  const hair = look.pelo;
  switch (look.peinado) {
    case 'largo': r(-5, hy - 1, 10, 3, hair); r(-5, hy + 1, 2, 9, hair); r(3, hy + 1, 2, 9, hair); break;
    case 'rizado': r(-5, hy - 2, 10, 3, hair); r(-5, hy, 2, 3, hair); r(3, hy, 2, 3, hair); r(-3, hy - 3, 2, 1, hair); r(1, hy - 3, 2, 1, hair); break;
    case 'moño': r(-4, hy - 1, 8, 3, hair); r(-2, hy - 4, 4, 3, hair); r(-5, hy + 1, 1, 3, hair); r(4, hy + 1, 1, 3, hair); break;
    case 'gorra': r(-5, hy - 1, 10, 3, '#e17055'); r(facing === 'left' ? -7 : -1, hy + 1, 7, 1, '#d35400'); r(-5, hy + 2, 1, 2, hair); r(4, hy + 2, 1, 2, hair); break;
    default: r(-4, hy - 1, 8, 3, hair); r(-5, hy, 1, 3, hair); r(4, hy, 1, 3, hair);
  }
  if (facing === 'up') {
    r(-4, hy + 1, 8, 5, hair);
  } else {
    const ex = facing === 'left' ? -1 : facing === 'right' ? 1 : 0;
    const blink = frame % 180 < 6;
    r(-3 + ex, hy + 4, 2, blink ? 1 : 2, '#1e1e1e'); r(1 + ex, hy + 4, 2, blink ? 1 : 2, '#1e1e1e');
    r(-1 + ex, hy + 7, 2, 1, 'rgba(0,0,0,.25)');
  }
}

export function avatar(look, size = 40) {
  const c = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  c.width = c.height = size * dpr;
  c.style.width = c.style.height = `${size}px`;
  c.className = 'avatar';
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const s = (size * dpr) / 22;
  ctx.scale(s, s);
  if (look) drawCharacter(ctx, 11, 22, look, { frame: 30 });
  return c;
}

export const JEFE = { camisa: '#2d3436', piel: '#e0ac69', pelo: '#1b1b1b', peinado: 'corto' };

export const usd = (n) => (n ? `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}` : '$0');

// Cabecera común: logo de la agencia + indicador de gasto de IA.
export function paintHeader() {
  const brand = document.getElementById('brand');
  if (brand) {
    const a = store.agencia || {};
    const key = `${a.tieneLogo}-${a.actualizado}-${a.nombre}`;
    if (brand.dataset.key !== key) {
      brand.dataset.key = key;
      brand.innerHTML = a.tieneLogo
        ? `<img src="/api/agency/logo?v=${a.actualizado}" alt="${esc(a.nombre || 'Agencia')}">`
        : `<span>${esc(a.nombre || 'Agencia IA')}</span>`;
    }
  }
  const chip = document.getElementById('usageChip');
  if (chip) {
    const u = store.uso || {};
    const pct = u.presupuesto ? Math.min(100, (u.mes / u.presupuesto) * 100) : null;
    chip.className = `chip${pct >= 100 ? ' over' : pct >= 80 ? ' warn' : ''}`;
    chip.title = 'Gasto de IA este mes (aprox.) — ver detalle';
    chip.innerHTML = store.demo
      ? '⚡ IA: demo'
      : `⚡ ${usd(u.mes || 0)}<span class="cb">${u.presupuesto ? ` / ${usd(u.presupuesto)}` : ' este mes'}</span>${pct !== null ? `<span class="bar"><i style="width:${pct}%"></i></span>` : ''}`;
  }
}
