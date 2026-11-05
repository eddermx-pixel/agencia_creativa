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

// ---------- Astronautas ----------
// (x, y) = punto entre los pies. Mide ~125 unidades de alto.
// facing: 1 derecha · -1 izquierda · 0 de frente · 'back' de espaldas
export function drawAstronaut(ctx, x, y, look, o = {}) {
  const { t = 0, walking = false, facing = 0, typing = false, sitting = false, wave = false, glow = false, scale = 1, shadow = true } = o;
  const suit = '#eef1f8', shade = '#c3c9db', line = '#a9b0c6', dark = '#2a2e45';
  const accent = look.camisa;
  const back = facing === 'back';
  const fx = back ? 0 : facing;
  const rr = (px, py, w, h, r, fill) => { ctx.beginPath(); ctx.roundRect(px, py, w, h, r); ctx.fillStyle = fill; ctx.fill(); };

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  // Flotación: en gravedad cero se mecen suavemente
  const float = sitting ? Math.sin(t * 1.6) * 1.2 : walking ? -Math.abs(Math.sin(t * 8)) * 5 : -4 + Math.sin(t * 2.2) * 3;
  if (shadow && !sitting) {
    ctx.fillStyle = `rgba(0,0,0,${0.32 + float * 0.02})`;
    ctx.beginPath(); ctx.ellipse(0, 0, 24 + float * 0.6, 6, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.translate(0, float);
  if (walking) ctx.rotate(fx * 0.06);

  // Mochila (se ve de lado o de espaldas)
  if (!back) rr(-21 - fx * 5, -72, 42, 42, 10, shade);

  // Piernas
  if (!sitting) {
    const sw = walking ? Math.sin(t * 8) * 7 : 0;
    for (const [lx, d] of [[-13, 1], [3, -1]]) {
      rr(lx + sw * d * 0.4, -34 - Math.max(0, sw * d) * 0.5, 11, 30, 5, suit);
      rr(lx - 1 + sw * d * 0.4, -10 - Math.max(0, sw * d) * 0.5, 13, 10, 4, dark);
    }
  }

  // Cuerpo
  rr(-21, -68, 42, 40, 14, suit);
  ctx.strokeStyle = line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(-21, -68, 42, 40, 14); ctx.stroke();
  rr(-21, -38, 42, 6, 3, shade);
  if (back) {
    rr(-17, -70, 34, 36, 9, shade);
    rr(-11, -62, 22, 6, 3, accent);
  } else {
    rr(-11 + fx * 3, -60, 22, 14, 4, accent);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) { ctx.globalAlpha = (glow && Math.sin(t * 6 + i) > 0) ? 1 : 0.55; ctx.beginPath(); ctx.arc(-6 + i * 6 + fx * 3, -53, 1.8, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  // Brazos
  const arm = (side, ang) => {
    ctx.save();
    ctx.translate(side * 20, -62);
    ctx.rotate(ang);
    rr(-5.5, -3, 11, 27, 5.5, suit);
    ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(-5.5, -3, 11, 27, 5.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 25, 6, 0, Math.PI * 2); ctx.fillStyle = accent; ctx.fill();
    ctx.restore();
  };
  const swing = walking ? Math.sin(t * 8) * 0.5 : 0;
  const tap = typing ? Math.sin(t * 16) * 0.15 : 0;
  arm(-1, typing ? 0.95 + tap : 0.12 + swing + Math.sin(t * 1.3) * 0.04);
  arm(1, wave ? -2.7 + Math.sin(t * 8) * 0.35 : typing ? -0.95 - tap : -0.12 - swing - Math.sin(t * 1.3) * 0.04);

  // Casco
  const hy = -92;
  ctx.beginPath(); ctx.arc(0, hy, 26, 0, Math.PI * 2); ctx.fillStyle = suit; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = line; ctx.stroke();
  // Antena con luz
  ctx.strokeStyle = shade; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(9, hy - 24); ctx.lineTo(13, hy - 38); ctx.stroke();
  const on = glow ? 0.6 + 0.4 * Math.sin(t * 7) : 0.5;
  ctx.beginPath(); ctx.arc(13, hy - 40, 4.5, 0, Math.PI * 2); ctx.fillStyle = accent; ctx.globalAlpha = on; ctx.fill();
  if (glow) { ctx.globalAlpha = 0.25 * on; ctx.beginPath(); ctx.arc(13, hy - 40, 10, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;

  if (!back) {
    // Visor: se ve la cara detrás del vidrio
    const vx = fx * 6;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(vx, hy + 2, 19, 16, 0, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = look.piel; ctx.fillRect(vx - 20, hy - 15, 40, 34);
    ctx.fillStyle = look.pelo;
    ctx.beginPath(); ctx.ellipse(vx, hy - 13, 20, 9, 0, 0, Math.PI * 2); ctx.fill();
    if (look.peinado === 'largo') { ctx.fillRect(vx - 20, hy - 12, 6, 30); ctx.fillRect(vx + 14, hy - 12, 6, 30); }
    if (look.peinado === 'rizado') for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(vx + i * 7, hy - 9, 4, 0, Math.PI * 2); ctx.fill(); }
    if (look.peinado === 'gorra') { ctx.fillStyle = '#e17055'; ctx.fillRect(vx - 20, hy - 22, 40, 12); }
    const blink = (t % 4) < 0.12;
    ctx.fillStyle = '#1a1a24';
    for (const ex of [-6, 6]) { ctx.beginPath(); ctx.ellipse(vx + ex + fx * 3, hy + 2, 2.6, blink ? 0.6 : 3, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.arc(vx + fx * 3, hy + 8, 3.5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.strokeStyle = '#1a1a24'; ctx.lineWidth = 1.6; ctx.stroke();
    // Vidrio con reflejo
    const g = ctx.createLinearGradient(vx - 19, hy - 16, vx + 19, hy + 18);
    g.addColorStop(0, 'rgba(140,170,255,.45)'); g.addColorStop(0.5, 'rgba(40,50,110,.18)'); g.addColorStop(1, 'rgba(20,20,60,.45)');
    ctx.fillStyle = g; ctx.fillRect(vx - 20, hy - 17, 40, 36);
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(vx, hy + 2, 19, 16, 0, 0, Math.PI * 2); ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(vx - 7, hy - 6, 6, 3, -0.6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(0, hy, 20, 0.15 * Math.PI, 0.85 * Math.PI); ctx.strokeStyle = shade; ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.restore();
}

export function avatar(look, size = 40) {
  const c = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  c.width = c.height = size * dpr;
  c.style.width = c.style.height = `${size}px`;
  c.className = 'avatar';
  const ctx = c.getContext('2d');
  const s = (size * dpr) / 88;
  if (look) drawAstronaut(ctx, (size * dpr) / 2, s * 130, look, { scale: s, shadow: false, t: 1 });
  return c;
}

export const JEFE = { camisa: '#8b7bff', piel: '#e0ac69', pelo: '#1b1b1b', peinado: 'corto' };

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
