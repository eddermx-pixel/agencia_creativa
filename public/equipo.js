// Currículum de cada agente: vista de 4 ángulos, personalidad, skills e historial.
import { api, store, connect, esc, usd, drawCrew } from './common.js';

const TIPOS = { astronauta: 'Astronauta', alien: 'Alienígena', robot: 'Robot', perro: 'Perro espacial' };
let team = [];

function turnaround(a) {
  const dpr = window.devicePixelRatio || 1;
  const c = document.createElement('canvas');
  c.width = 600 * dpr; c.height = 380 * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  [0, 1, 'back', -1].forEach((f, i) => drawCrew(ctx, 80 + i * 147, 330, a, { facing: f, t: 1 + i, scale: 1.75 }));
  return c;
}

function render() {
  const list = document.getElementById('list');
  list.replaceChildren(...team.map((a) => {
    const s = a.stats;
    const el = document.createElement('section');
    el.className = 'cv';
    el.id = a.id;
    el.innerHTML = `
      <div class="top2">
        <div class="turn"><span class="icon">${a.icono}</span></div>
        <div class="body">
          <div><span class="name">${esc(a.nombre)}</span><span class="tipo">${TIPOS[a.tipo] || a.tipo}</span><div class="role">${esc(a.rol)} · ${esc(a.cv.especialidad)}</div></div>
          <div class="quote">${esc(a.cv.frase)}</div>
          <div class="sec"><b>Personalidad</b>${esc(a.personalidad)}</div>
          <div class="sec"><b>Experiencia</b>${esc(a.cv.experiencia)}</div>
        </div>
      </div>
      <div class="body">
        <div class="sec"><b>Habilidades</b>${a.cv.skills.map(([n, v]) => `<div class="skill"><div>${esc(n)}</div><div class="track"><i style="width:${v}%;background:${esc(a.color)}"></i></div><span>${v}</span></div>`).join('')}</div>
        <div class="sec"><b>Lo que hace en la agencia</b><div class="chips">${a.cv.herramientas.map((h) => `<span>${esc(h)}</span>`).join('')}</div></div>
        <div class="sec"><b>Historial real</b><div class="stats">
          <div class="stat"><div class="v">${s.campanas}</div><div class="l">campañas</div></div>
          <div class="stat"><div class="v">${s.aportes}</div><div class="l">ideas en juntas</div></div>
          ${a.puedeEntregar ? `<div class="stat"><div class="v">${s.entregadas}</div><div class="l">piezas entregadas</div></div>
          <div class="stat"><div class="v">${s.aprobacion === null ? '—' : `${s.aprobacion}%`}</div><div class="l">aprobación</div></div>` : ''}
          <div class="stat"><div class="v">${s.memorias}</div><div class="l">cosas aprendidas</div></div>
          ${store.demo ? '' : `<div class="stat"><div class="v">${usd(s.costoMes)}</div><div class="l">costo de IA este mes</div></div>`}
        </div></div>
        <div class="sec"><b>Dato curioso</b>${esc(a.cv.dato)}</div>
      </div>`;
    el.querySelector('.turn').append(turnaround(a));
    return el;
  }));
  const h = location.hash.slice(1);
  if (h) { const t = document.getElementById(h); if (t) { t.classList.add('focus'); t.scrollIntoView({ block: 'start' }); } }
}

async function load() { team = await api('/api/team'); render(); }
connect((type) => { if (type === 'snapshot') load(); });
