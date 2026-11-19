// Mueve la tarjeta de cada cliente en el pipeline "Operación Mensual Pixel" de GoHighLevel según lo que pasa en la agencia.
//   inicio     → arranca una campaña del cliente        → "DISEÑO O EDICION"
//   revision   → la campaña terminó y todo está aprobado → "REVISION DEL CLIENTE"
//   programada → la pieza se programó en GHL             → "PROGRAMACION EN FEED O MUROS"
// Candados: solo se mueve si la tarjeta está en una etapa de `desde` (nunca se sacan clientes que están en sitio web, chatbot, etc.)
// y solo si el cliente tiene activado "Mover tarjeta automáticamente" (`ghlMover`). Sin eso se SIMULA: queda en la bitácora, no se toca GHL.
import { db, save } from './store.js';
import { bus, log } from './hub.js';
import { avisar } from './telegram.js';

const fold = (t) => String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const REGLAS = {
  pipeline: 'Operación Mensual Pixel',
  inicio: { a: 'DISEÑO O EDICION', desde: ['CREACION DE CAMPAÑAS', 'CAMPAÑAS CREADAS', 'REVISION DE CAMPAÑAS SEMANAL', 'PROGRAMACION EN FEED O MUROS', 'REVISION DEL CLIENTE'] },
  revision: { a: 'REVISION DEL CLIENTE', desde: ['DISEÑO O EDICION'] },
  programada: { a: 'PROGRAMACION EN FEED O MUROS', desde: ['REVISION DEL CLIENTE', 'DISEÑO O EDICION'] },
};
const reglas = () => ({ ...REGLAS, ...(db.agency.pipelineReglas || {}) });

let G = null; // { ghl, ghlToken, locDe } de planeacion.js (se inyecta para no importar en círculo)
let cache = { t: 0, datos: null };

async function cargar(forzar = false) {
  if (!forzar && cache.datos && Date.now() - cache.t < 60000) return cache.datos;
  const r = reglas();
  const loc = G.locDe(null);
  if (!G.ghlToken() || !loc) throw new Error('GoHighLevel no está configurado.');
  const ps = (await G.ghl('GET', `/opportunities/pipelines?locationId=${loc}`)).pipelines || [];
  const p = ps.find((x) => fold(x.name) === fold(r.pipeline));
  if (!p) throw new Error(`No encontré el pipeline «${r.pipeline}».`);
  const etapas = Object.fromEntries(p.stages.map((s) => [s.id, s.name]));
  const ops = ((await G.ghl('GET', `/opportunities/search?location_id=${loc}&pipeline_id=${p.id}&status=won&limit=100`)).opportunities || [])
    .map((o) => ({ id: o.id, nombre: o.name, empresa: o.contact?.companyName || '', etapaId: o.pipelineStageId, etapa: etapas[o.pipelineStageId] || '?' }));
  cache = { t: Date.now(), datos: { pipeline: p, etapas, ops } };
  return cache.datos;
}

// Tarjeta del cliente: la elegida a mano (ghlOportunidadId) o, si solo una coincide por nombre, esa.
function tarjetaDe(cl, ops) {
  if (cl.ghlOportunidadId) return { op: ops.find((o) => o.id === cl.ghlOportunidadId) || null, manual: true };
  const palabras = fold(cl.nombre).split(' ').filter((w) => w.length > 3);
  const hay = ops.filter((o) => { const t = fold(`${o.nombre} ${o.empresa}`); return palabras.some((w) => t.includes(w)); });
  return { op: hay.length === 1 ? hay[0] : null, manual: false, candidatas: hay };
}

export async function evento(camp, que) {
  try {
    if (!G || !camp?.clientId) return;
    camp.pipe ||= {};
    if (camp.pipe[que]) return;
    const cl = db.clients.find((c) => c.id === camp.clientId);
    if (!cl) return;
    const regla = reglas()[que];
    const d = await cargar(true);
    const { op } = tarjetaDe(cl, d.ops);
    camp.pipe[que] = Date.now(); save();
    if (!op) return; // el cliente no tiene tarjeta (por ejemplo, clientes de prueba o propios)
    if (fold(op.etapa) === fold(regla.a)) return;
    if (!regla.desde.some((x) => fold(x) === fold(op.etapa))) return log('director', `Tarjeta de ${cl.nombre} sin mover: está en «${op.etapa}», que no es una etapa de arranque para «${regla.a}».`, camp.id);
    const destino = Object.entries(d.etapas).find(([, n]) => fold(n) === fold(regla.a));
    if (!destino) return log('director', `⚠️ No encontré la etapa «${regla.a}» en el pipeline.`, camp.id);
    if (cl.ghlMover !== true) return log('director', `🧪 (simulacro) Movería la tarjeta de ${cl.nombre}: «${op.etapa}» → «${regla.a}». Actívalo en la ficha del cliente.`, camp.id);
    await G.ghl('PUT', `/opportunities/${op.id}`, { pipelineStageId: destino[0] });
    cache.t = 0;
    log('director', `📌 Tarjeta de ${cl.nombre} movida en GoHighLevel: «${op.etapa}» → «${regla.a}».`, camp.id);
    avisar(`📌 ${cl.nombre}: «${op.etapa}» → «${regla.a}»`);
  } catch (e) {
    const permiso = /\b40[13]\b/.test(e.message) ? ' Probablemente al token le falta el permiso de editar oportunidades (opportunities.write).' : '';
    log('director', `⚠️ No se pudo mover la tarjeta de GoHighLevel: ${e.message}${permiso}`, camp?.id);
  }
}

function revisar(camp) {
  if (!camp || camp.estado !== 'terminada') return;
  const ps = db.pieces.filter((p) => p.campaignId === camp.id && !p.propuesta);
  if (ps.some((p) => p.estado === 'aprobada') && !ps.some((p) => p.estado === 'pendiente')) evento(camp, 'revision');
}

export function init(deps, app) {
  G = deps;
  bus.on('campaign', (c) => {
    if (c.estado === 'en_curso' && Date.now() - (c.creada || 0) < 3 * 86400000) evento(c, 'inicio');
    revisar(c);
  });
  bus.on('piece', (p) => { if (p.estado === 'aprobada') revisar(db.campaigns.find((c) => c.id === p.campaignId)); });
  // Etapas y tarjetas ganadas, para elegir la de cada cliente y ver qué coincide solo.
  app.get('/api/ghl/pipeline', async (req, res) => {
    try {
      const d = await cargar(req.query.forzar === '1');
      const cl = db.clients.find((c) => c.id === req.query.clientId);
      res.json({ pipeline: d.pipeline.name, etapas: d.pipeline.stages.map((s) => s.name), reglas: reglas(), tarjetas: d.ops, coincide: cl ? tarjetaDe(cl, d.ops).op?.id || null : null });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
}
