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
      else if (type === 'meeting') { store.meetings ||= []; upsert(store.meetings, data); }
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

// ---------- Tripulación (estilo de la mascota Pixel) ----------
// Traje blanco con contorno azul marino, casco redondo con visor oscuro,
// parche en el pecho con el icono de cada agente. Sin antena.
// p = { tipo: 'astronauta'|'alien'|'robot'|'perro', icono, color }
// facing: 0 de frente · 1 / -1 tres cuartos (derecha / izquierda) · 'back' de espaldas
const NAVY = '#24246a', WHITE = '#f6f6fd', SHADE = '#dcdcef', SHADE2 = '#c9c9e6';

export function drawCrew(ctx, x, y, p, o = {}) {
  const { t = 0, walking = false, facing = 0, typing = false, sitting = false, wave = false, glow = false, scale = 1, shadow = true } = o;
  const tipo = p?.tipo || 'astronauta';
  if (tipo === 'perro') {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    const fl = sitting ? Math.sin(t * 1.6) : walking ? -Math.abs(Math.sin(t * 9)) * 3 : -2 + Math.sin(t * 2.2) * 2;
    if (shadow && !sitting) { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(0, 0, facing === 1 || facing === -1 ? 42 : 28, 6, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.translate(0, fl);
    drawDog(ctx, p, o);
    ctx.restore();
    return;
  }
  const back = facing === 'back';
  const dir = back ? 0 : (facing || 0);
  const q = dir !== 0; // vista de tres cuartos
  const LW = 3.2;
  const shape = (fn, fill, stroke = true) => { ctx.beginPath(); fn(); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.lineWidth = LW; ctx.strokeStyle = NAVY; ctx.lineJoin = 'round'; ctx.stroke(); } };
  const rr = (px, py, w, h, r, fill, stroke = true) => shape(() => ctx.roundRect(px, py, w, h, r), fill, stroke);
  const circ = (cx, cy, r, fill, stroke = true) => shape(() => ctx.arc(cx, cy, r, 0, Math.PI * 2), fill, stroke);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const float = sitting ? Math.sin(t * 1.6) * 1 : walking ? -Math.abs(Math.sin(t * 8)) * 4 : -3 + Math.sin(t * 2.2) * 2.5;
  if (shadow && !sitting) {
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(0, 0, 26 + float * 0.5, 6, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.translate(0, float);
  if (q) ctx.scale(dir, 1); // dibujamos mirando a la derecha y reflejamos si va a la izquierda

  const hy = -96; // centro de la cabeza

  // Mochila (detrás del cuerpo)
  if (!back) rr(q ? -34 : -30, -70, q ? 26 : 60, 40, 9, SHADE);

  // Piernas cortas con bota
  if (!sitting) {
    const sw = walking ? Math.sin(t * 8) * 5 : 0;
    for (const [lx, d] of [[-19, 1], [2, -1]]) {
      const lift = Math.max(0, sw * d);
      const ox = q ? 3 : 0;
      rr(lx + ox, -26 - lift, 17, 22, 7, WHITE);
      rr(lx + ox - 1, -9 - lift, 19, 9, 4, WHITE);
      ctx.fillStyle = NAVY; ctx.fillRect(lx + ox, -12 - lift, 17, 3.5);
    }
  }

  // Cuerpo
  rr(-25, -68, 50, 46, 18, WHITE);
  ctx.save(); ctx.beginPath(); ctx.roundRect(-25, -68, 50, 46, 18); ctx.clip();
  ctx.fillStyle = SHADE; ctx.fillRect(q ? -25 : 14, -68, 11, 46); ctx.restore();
  ctx.lineWidth = LW; ctx.strokeStyle = NAVY; ctx.beginPath(); ctx.roundRect(-25, -68, 50, 46, 18); ctx.stroke();

  if (back) {
    rr(-21, -66, 42, 36, 8, '#ececf8');
    ctx.strokeStyle = SHADE2; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-16, -61, 32, 26, 6); ctx.stroke();
  } else {
    // Parche del pecho con el icono del agente
    const bx = q ? -6 : -16, bw = q ? 27 : 32;
    const pulse = glow ? 0.5 + 0.5 * Math.sin(t * 5) : 0;
    rr(bx, -58, bw, 21, 6, WHITE);
    if (p?.color) { ctx.save(); ctx.globalAlpha = 0.18 + pulse * 0.35; ctx.fillStyle = p.color; ctx.beginPath(); ctx.roundRect(bx + 1.5, -56.5, bw - 3, 18, 5); ctx.fill(); ctx.restore(); }
    if (glow && p?.color) { ctx.save(); ctx.strokeStyle = p.color; ctx.globalAlpha = pulse; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.roundRect(bx - 3, -61, bw + 6, 27, 8); ctx.stroke(); ctx.restore(); }
    ctx.save();
    if (q) ctx.scale(dir, 1); // el emoji no se refleja
    ctx.font = '13px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p?.icono || '★', (bx + bw / 2) * (q ? dir : 1), -47);
    ctx.restore();
  }

  // Brazos (manga + puño azul + guante)
  const arm = (side, ang, front = true) => {
    ctx.save();
    ctx.translate(side * (q ? 19 : 23), -60);
    ctx.rotate(ang);
    rr(-7, -4, 14, 28, 7, WHITE);
    ctx.fillStyle = NAVY; ctx.fillRect(-7, 17, 14, 4);
    circ(0, 27, 8.5, WHITE);
    if (front) circ(side * -5, 24, 3.5, WHITE);
    ctx.restore();
  };
  const swing = walking ? Math.sin(t * 8) * 0.5 : 0;
  const tap = typing ? Math.sin(t * 16) * 0.15 : 0;
  arm(-1, typing ? 0.9 + tap : 0.18 + swing + Math.sin(t * 1.3) * 0.04, !back);
  arm(1, wave ? -2.6 + Math.sin(t * 8) * 0.35 : typing ? -0.9 - tap : -0.18 - swing - Math.sin(t * 1.3) * 0.04, !back);

  // Cuello azul
  rr(-20, -72, 40, 9, 4.5, NAVY, false);

  // Cabeza según el personaje
  if (tipo === 'alien') drawAlienHead(ctx, hy, back, q, t, circ, shape);
  else if (tipo === 'robot') drawRobotHead(ctx, hy, back, q, t, rr, circ, p?.color || '#36e2c8');
  else drawHelmet(ctx, hy, back, q, tipo === 'perro', circ, shape);

  ctx.restore();
}


// ---------- Perro astronauta: cuerpo de perro en 4 patas con traje espacial para perro ----------
function drawDog(ctx, p, o) {
  const { t = 0, walking = false, facing = 0, typing = false, sitting = false, glow = false } = o;
  const back = facing === 'back';
  const side = facing === 1 || facing === -1;
  const LW = 3.2;
  const fur = '#c98b4f', furDark = '#7a4a24', cream = '#f3dfc6';
  const shape = (fn, fill, stroke = true) => { ctx.beginPath(); fn(); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.lineWidth = LW; ctx.strokeStyle = NAVY; ctx.lineJoin = 'round'; ctx.stroke(); } };
  const rr = (x, y, w, h, r, fill, stroke = true) => shape(() => ctx.roundRect(x, y, w, h, r), fill, stroke);
  const circ = (x, y, r, fill, stroke = true) => shape(() => ctx.arc(x, y, r, 0, Math.PI * 2), fill, stroke);
  const wag = Math.sin(t * (walking ? 14 : 9)) * 0.5;
  const tail = (x, y, dirx) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(dirx * (-0.9 + wag));
    rr(-5, -26, 10, 28, 5, fur); ctx.restore();
  };
  const badge = (x, y, w) => {
    const pulse = glow ? 0.5 + 0.5 * Math.sin(t * 5) : 0;
    rr(x, y, w, 18, 5, WHITE);
    if (p?.color) { ctx.save(); ctx.globalAlpha = 0.18 + pulse * 0.35; ctx.fillStyle = p.color; ctx.beginPath(); ctx.roundRect(x + 1.5, y + 1.5, w - 3, 15, 4); ctx.fill(); ctx.restore(); }
    ctx.font = '12px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p?.icono || '★', x + w / 2, y + 9.5);
  };
  // Casco de burbuja con la cabeza del perro (dir: 1 derecha, -1 izquierda, 0 frente)
  const head = (hx, hy, dir) => {
    circ(hx, hy, 30, 'rgba(200,222,255,.35)');
    ctx.save(); ctx.beginPath(); ctx.arc(hx, hy, 28, 0, Math.PI * 2); ctx.clip();
    if (back) {
      ctx.fillStyle = fur; ctx.beginPath(); ctx.ellipse(hx, hy + 6, 19, 19, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = furDark; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(hx + s * 15, hy + 6, 6, 13, s * 0.3, 0, Math.PI * 2); ctx.fill(); }
    } else if (dir) {
      ctx.fillStyle = fur; ctx.beginPath(); ctx.ellipse(hx - dir * 2, hy + 4, 17, 17, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(hx + dir * 14, hy + 10, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = cream; ctx.beginPath(); ctx.ellipse(hx + dir * 15, hy + 13, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = furDark; ctx.beginPath(); ctx.ellipse(hx - dir * 9, hy + 6, 6, 13, -dir * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b1b2a'; ctx.beginPath(); ctx.ellipse(hx + dir * 24, hy + 8, 3.6, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + dir * 6, hy - 1, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff7a9a'; ctx.beginPath(); ctx.ellipse(hx + dir * 14, hy + 19, 3, 4, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = fur; ctx.beginPath(); ctx.ellipse(hx, hy + 4, 18, 18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = furDark; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(hx + s * 17, hy + 6, 6, 13, s * 0.3, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = cream; ctx.beginPath(); ctx.ellipse(hx, hy + 12, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b1b2a'; ctx.beginPath(); ctx.ellipse(hx, hy + 8, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
      const blink = (t % 4.5) < 0.12;
      for (const ex of [-7, 7]) { ctx.beginPath(); ctx.ellipse(hx + ex, hy, 2.6, blink ? 0.5 : 2.8, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#ff7a9a'; ctx.beginPath(); ctx.ellipse(hx, hy + 18, 3, 4 + (typing ? Math.abs(Math.sin(t * 6)) * 1.5 : 0), 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.lineWidth = LW; ctx.strokeStyle = NAVY; ctx.beginPath(); ctx.arc(hx, hy, 30, 0, Math.PI * 2); ctx.stroke();
    visorShine(ctx, hx, hy, 26, 26);
    rr(hx - 18, hy + 25, 36, 8, 4, NAVY, false); // cuello del traje
  };

  if (side) {
    const d = facing;
    ctx.save(); ctx.scale(d, 1); // dibujamos mirando a la derecha
    const sw = walking ? Math.sin(t * 9) * 6 : 0;
    // Patas traseras y delanteras (las de atrás un poco más oscuras)
    for (const [lx, ph, fill] of [[-24, 1, SHADE], [16, -1, SHADE], [-16, -1, WHITE], [24, 1, WHITE]]) {
      const lift = Math.max(0, sw * ph);
      rr(lx - 6, -26 - lift, 12, 24, 5, fill);
      ctx.fillStyle = NAVY; ctx.fillRect(lx - 6, -9 - lift, 12, 3.5);
      rr(lx - 7, -6 - lift, 15, 7, 3.5, WHITE);
    }
    tail(-38, -48, 1);
    // Cuerpo horizontal con tanque de oxígeno en el lomo
    rr(-30, -76, 32, 14, 6, SHADE);
    rr(-40, -66, 76, 42, 20, WHITE);
    ctx.save(); ctx.beginPath(); ctx.roundRect(-40, -66, 76, 42, 20); ctx.clip(); ctx.fillStyle = SHADE; ctx.fillRect(-40, -36, 76, 12); ctx.restore();
    ctx.lineWidth = LW; ctx.strokeStyle = NAVY; ctx.beginPath(); ctx.roundRect(-40, -66, 76, 42, 20); ctx.stroke();
    ctx.save(); ctx.scale(d, 1); badge(d > 0 ? -16 : -10, -56, 26); ctx.restore();
    head(36, -86, 1);
    ctx.restore();
    return;
  }

  // De frente o de espaldas: cuerpo de perro en 4 patas (las traseras asoman detrás)
  const sw = walking ? Math.sin(t * 9) * 4 : 0;
  if (!sitting) {
    for (const [lx, ph] of [[-25, -1], [25, 1]]) {
      const lift = Math.max(0, sw * ph);
      rr(lx - 6, -24 - lift, 12, 22, 5, SHADE);
      rr(lx - 7, -6 - lift, 14, 6, 3, WHITE);
    }
  }
  if (!back) tail(22, -46, 1);
  rr(-31, -60, 62, 38, 18, WHITE);
  ctx.save(); ctx.beginPath(); ctx.roundRect(-31, -60, 62, 38, 18); ctx.clip(); ctx.fillStyle = SHADE; ctx.fillRect(-31, -32, 62, 10); ctx.restore();
  ctx.lineWidth = LW; ctx.strokeStyle = NAVY; ctx.beginPath(); ctx.roundRect(-31, -60, 62, 38, 18); ctx.stroke();
  if (!sitting) {
    for (const [lx, ph] of [[-11, 1], [11, -1]]) {
      const lift = Math.max(0, sw * ph);
      rr(lx - 7, -30 - lift, 14, 28, 6, WHITE);
      ctx.fillStyle = NAVY; ctx.fillRect(lx - 7, -10 - lift, 14, 3.5);
      rr(lx - 8, -6 - lift, 16, 7, 3.5, WHITE);
    }
  }
  if (back) {
    rr(-17, -58, 34, 20, 7, '#ececf8');
    tail(0, -54, Math.sin(t * 9) > 0 ? 1 : -1);
  } else {
    badge(-13, -56, 26);
    if (sitting && typing) {
      const tap = Math.sin(t * 16) * 2;
      circ(-12, -22 + tap, 7, WHITE); circ(12, -22 - tap, 7, WHITE);
    }
  }
  head(0, -84, 0);
}

function visorShine(ctx, cx, cy, rx, ry) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath(); ctx.ellipse(cx - rx * 0.42, cy - ry * 0.42, rx * 0.28, ry * 0.16, -0.7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.beginPath(); ctx.arc(cx + rx * 0.45, cy + ry * 0.45, rx * 0.08, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawHelmet(ctx, hy, back, q, perro, circ, shape) {
  // Orejeras laterales
  if (!q || back) { circ(-33, hy + 2, 7, WHITE); circ(33, hy + 2, 7, WHITE); }
  else circ(-31, hy + 2, 9, WHITE);
  circ(0, hy, 33, WHITE);
  ctx.save(); ctx.beginPath(); ctx.arc(0, hy, 33, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = SHADE; ctx.beginPath(); ctx.arc(q ? -26 : 22, hy + 6, 18, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.lineWidth = 3.2; ctx.strokeStyle = NAVY; ctx.beginPath(); ctx.arc(0, hy, 33, 0, Math.PI * 2); ctx.stroke();
  if (back) return;
  const vx = q ? 9 : 0, rx = q ? 21 : 25, ry = 23;
  if (perro) {
    // Visor transparente: se ve la cara del perrito
    ctx.save(); ctx.beginPath(); ctx.ellipse(vx, hy + 2, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#bfd3ff'; ctx.fillRect(vx - rx, hy - ry, rx * 2, ry * 2 + 4);
    ctx.fillStyle = '#c98b4f'; ctx.beginPath(); ctx.ellipse(vx + (q ? 3 : 0), hy + 5, 17, 17, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7a4a24';
    ctx.beginPath(); ctx.ellipse(vx - 15, hy + 6, 6, 12, 0.3, 0, Math.PI * 2); ctx.fill();
    if (!q) { ctx.beginPath(); ctx.ellipse(vx + 15, hy + 6, 6, 12, -0.3, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#f3dfc6'; ctx.beginPath(); ctx.ellipse(vx + (q ? 7 : 0), hy + 12, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1b1b2a';
    ctx.beginPath(); ctx.ellipse(vx + (q ? 9 : 0), hy + 9, 3.6, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    for (const ex of q ? [1, 11] : [-6, 6]) { ctx.beginPath(); ctx.arc(vx + ex, hy + 1, 2.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#ff7a9a'; ctx.beginPath(); ctx.ellipse(vx + (q ? 8 : 0), hy + 17, 2.6, 3.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(60,90,200,.22)'; ctx.fillRect(vx - rx, hy - ry, rx * 2, ry * 2 + 4);
    ctx.restore();
  } else {
    shape(() => ctx.ellipse(vx, hy + 2, rx, ry, 0, 0, Math.PI * 2), (() => {
      const g = ctx.createLinearGradient(vx - rx, hy - ry, vx + rx, hy + ry);
      g.addColorStop(0, '#2a46b3'); g.addColorStop(0.55, '#13246e'); g.addColorStop(1, '#0b1550');
      return g;
    })(), false);
  }
  ctx.lineWidth = 3.2; ctx.strokeStyle = NAVY; ctx.beginPath(); ctx.ellipse(vx, hy + 2, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  visorShine(ctx, vx, hy + 2, rx, ry);
}

function drawAlienHead(ctx, hy, back, q, t, circ, shape) {
  const skin = '#bdf0df';
  shape(() => ctx.ellipse(0, hy - 2, 31, 34, 0, 0, Math.PI * 2), skin);
  ctx.save(); ctx.beginPath(); ctx.ellipse(0, hy - 2, 31, 34, 0, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = 'rgba(40,120,110,.18)'; ctx.beginPath(); ctx.arc(q ? -24 : 22, hy + 6, 20, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.lineWidth = 3.2; ctx.strokeStyle = NAVY; ctx.beginPath(); ctx.ellipse(0, hy - 2, 31, 34, 0, 0, Math.PI * 2); ctx.stroke();
  if (back) return;
  const blink = (t % 5) < 0.12;
  const ox = q ? 8 : 0;
  const eyes = q ? [[ox - 6, hy - 4, 7], [ox + 12, hy - 4, 7], [ox + 3, hy - 18, 5]] : [[-12, hy - 2, 8], [12, hy - 2, 8], [0, hy - 18, 6]];
  for (const [ex, ey, r] of eyes) {
    shape(() => ctx.ellipse(ex, ey, r, blink ? 1 : r * 1.15, 0, 0, Math.PI * 2), NAVY, false);
    if (!blink) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex - r * 0.3, ey - r * 0.4, r * 0.32, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.strokeStyle = NAVY; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(ox, hy + 12, 7, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
}

function drawRobotHead(ctx, hy, back, q, t, rr, circ, color) {
  circ(q ? -31 : -32, hy + 2, 6, SHADE);
  if (!q) circ(32, hy + 2, 6, SHADE);
  rr(-30, hy - 28, 60, 56, 18, WHITE);
  if (back) { ctx.strokeStyle = SHADE2; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-18, hy - 16, 36, 30, 8); ctx.stroke(); return; }
  const sx = q ? -14 : -22, sw = q ? 40 : 44;
  rr(sx, hy - 16, sw, 32, 10, '#0e1a52', false);
  ctx.lineWidth = 3.2; ctx.strokeStyle = NAVY; ctx.beginPath(); ctx.roundRect(sx, hy - 16, sw, 32, 10); ctx.stroke();
  const blink = (t % 4) < 0.15;
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 8;
  const cx = sx + sw / 2;
  for (const ex of [-9, 9]) { ctx.beginPath(); ctx.roundRect(cx + ex - 4, hy - (blink ? 1 : 6), 8, blink ? 2 : 11, 4); ctx.fill(); }
  ctx.shadowBlur = 0;
  visorShine(ctx, cx, hy, sw / 2, 16);
}

export function avatar(p, size = 40) {
  const c = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  c.width = c.height = size * dpr;
  c.style.width = c.style.height = `${size}px`;
  c.className = 'avatar';
  const ctx = c.getContext('2d');
  const s = (size * dpr) / 86;
  if (p) drawCrew(ctx, (size * dpr) / 2, s * 136, p, { scale: s, shadow: false, t: 1 });
  return c;
}

export const JEFE = { tipo: 'astronauta', icono: '⭐', color: '#8b7bff', nombre: 'Tú' };

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
