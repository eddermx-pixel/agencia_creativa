// Frenos de gasto y elección de modelo. Se editan en /ajustes-ia.html (se guardan en la base de datos).
// Variables opcionales: LIMITE_DIA_USD, LIMITE_MES_USD, LIMITE_CAMPANA_USD, MODELO_VIDEO, CLAUDE_MODEL.
import { db, save } from './store.js';

const num = (v, d) => (Number.isFinite(+v) && +v >= 0 && v !== '' && v !== null && v !== undefined ? +v : d);

// USD por millón de tokens: entrada, salida, caché leída. Es la misma tabla que usa hub.js para estimar el costo.
export const MODELOS = {
  'claude-haiku-5-5': { nombre: 'Haiku 5.5 (el más barato)', precio: [0.1, 0.5, 0.01] },
  'claude-sonnet-5-5': { nombre: 'Sonnet 5.5 (equilibrado)', precio: [2, 10, 0.2] },
  'claude-opus-5-5': { nombre: 'Opus 5.5 (el mejor, el más caro)', precio: [4, 20, 0.2] },
};

// Tareas que pueden usar un modelo distinto al general. Los editores de video escriben las piezas más largas.
const GRUPOS = { video: ['video', 'editor2'] };

function cfg() {
  db.agency.ia ||= {};
  return db.agency.ia;
}

export function modeloPara(agentId) {
  const c = cfg();
  const general = c.modelo || process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
  if (GRUPOS.video.includes(agentId)) return c.modeloVideo || process.env.MODELO_VIDEO || general;
  return general;
}

// ¿Los videos de Micho con HyperFrames DEBEN usar la librería de personajes 3D? (por defecto sí; EXIGIR_3D=0 o el ajuste lo apagan)
export function exigir3d() {
  const c = cfg();
  return c.exigir3d !== undefined ? !!c.exigir3d : process.env.EXIGIR_3D !== '0';
}

export function limites() {
  const c = cfg();
  return {
    dia: num(c.limiteDia, num(process.env.LIMITE_DIA_USD, 10)),
    mes: num(c.limiteMes, num(process.env.LIMITE_MES_USD, 100)),
    campana: num(c.limiteCampana, num(process.env.LIMITE_CAMPANA_USD, 8)),
  };
}

const gastoDesde = (t, campaignId) => db.usage.reduce((n, u) => (u.t >= t && (!campaignId || u.c === campaignId) ? n + u.usd : n), 0);
const inicioDia = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const inicioMes = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function gasto(campaignId = null) {
  return { dia: gastoDesde(inicioDia()), mes: gastoDesde(inicioMes()), campana: campaignId ? gastoDesde(0, campaignId) : 0 };
}

// Se llama ANTES de cada llamada a la API. Si se pasó de un límite, lanza un error (la campaña queda en "Reintentar").
export function verificar(campaignId = null) {
  const l = limites(); const g = gasto(campaignId);
  const usd = (n) => `US$${n.toFixed(2)}`;
  if (l.dia && g.dia >= l.dia) throw new Error(`Límite diario de IA alcanzado (${usd(g.dia)} de ${usd(l.dia)}). Súbelo en Ajustes de IA y pulsa Reintentar.`);
  if (l.mes && g.mes >= l.mes) throw new Error(`Límite mensual de IA alcanzado (${usd(g.mes)} de ${usd(l.mes)}). Súbelo en Ajustes de IA y pulsa Reintentar.`);
  if (campaignId && l.campana && g.campana >= l.campana) throw new Error(`Esta campaña ya gastó ${usd(g.campana)} (límite ${usd(l.campana)}). Súbelo en Ajustes de IA y pulsa Reintentar.`);
}

export function registrar(app) {
  app.get('/api/ia/ajustes', (req, res) => {
    const c = cfg();
    res.json({
      modelos: MODELOS,
      modelo: modeloPara('director'), modeloVideo: modeloPara('video'),
      limites: limites(), gasto: gasto(), exigir3d: exigir3d(),
      autoReanudar: process.env.AUTO_RESUME === '1',
      maxCampanas: Number(process.env.MAX_CAMPANAS || 1),
      personalizado: { modelo: !!c.modelo, modeloVideo: !!c.modeloVideo },
    });
  });
  app.put('/api/ia/ajustes', (req, res) => {
    const b = req.body || {}; const c = cfg();
    if (b.modelo !== undefined) { if (b.modelo && !MODELOS[b.modelo]) return res.status(400).json({ error: 'Modelo desconocido' }); c.modelo = b.modelo || undefined; }
    if (b.modeloVideo !== undefined) { if (b.modeloVideo && !MODELOS[b.modeloVideo]) return res.status(400).json({ error: 'Modelo desconocido' }); c.modeloVideo = b.modeloVideo || undefined; }
    for (const [k, campo] of [['dia', 'limiteDia'], ['mes', 'limiteMes'], ['campana', 'limiteCampana']]) {
      if (b.limites?.[k] !== undefined) c[campo] = Math.min(10000, num(b.limites[k], 0));
    }
    if (typeof b.exigir3d === 'boolean') c.exigir3d = b.exigir3d;
    save(); res.json({ ok: true, modelo: modeloPara('director'), modeloVideo: modeloPara('video'), limites: limites() });
  });
}
