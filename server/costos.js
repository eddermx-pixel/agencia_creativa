// Costo por cliente: IA (tokens reales × precio) + cargos fijos repartidos, contra lo que cobras.
import { db, save, newId } from './store.js';

const num = (v) => (Number.isFinite(+v) && +v >= 0 ? +v : 0);
const mesOk = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m || '');
const mesDe = (t) => new Date(t).toISOString().slice(0, 7);

export function reporte(mes) {
  db.agency.fijos ||= [];
  const factor = num(db.agency.factorIA) || 1;
  const filas = {};
  const fila = (id, nombre) => (filas[id] ||= { clientId: id, cliente: nombre, ia: 0, llamadas: 0, busquedas: 0, campanas: new Set(), piezas: 0, aprobadas: 0, rechazadas: 0, cobro: 0 });
  for (const c of db.clients) { const f = fila(c.id, c.nombre); f.cobro = num(String(c.cobroMensual || '').replace(/[^0-9.]/g, '')); }
  for (const u of db.usage) {
    if (mesDe(u.t) !== mes) continue;
    const camp = db.campaigns.find((c) => c.id === u.c);
    const cl = camp?.clientId ? db.clients.find((c) => c.id === camp.clientId) : null;
    const f = cl ? fila(cl.id, cl.nombre) : fila('_sin', 'Sin cliente (chat con agentes, cursos, plan)');
    f.ia += u.usd * factor; f.llamadas++; f.busquedas += u.ws || 0; if (camp) f.campanas.add(camp.id);
  }
  for (const p of db.pieces) {
    if (mesDe(p.creada) !== mes) continue;
    const camp = db.campaigns.find((c) => c.id === p.campaignId);
    const f = camp?.clientId && filas[camp.clientId]; if (!f) continue;
    f.piezas++; if (p.estado === 'aprobada') f.aprobadas++; if (p.estado === 'rechazada') f.rechazadas++;
  }
  const lista = Object.values(filas).filter((f) => f.ia || f.piezas || f.cobro);
  const reales = lista.filter((f) => f.clientId !== '_sin');
  const fijoTotal = db.agency.fijos.reduce((n, x) => n + x.usd, 0);
  const iaReales = reales.reduce((n, f) => n + f.ia, 0);
  for (const f of lista) {
    if (f.clientId === '_sin') { f.fijos = 0; }
    else {
      let fj = 0;
      for (const x of db.agency.fijos) fj += x.reparto === 'uso' && iaReales ? x.usd * (f.ia / iaReales) : x.usd / Math.max(1, reales.length);
      f.fijos = fj;
    }
    f.total = f.ia + f.fijos; f.campanas = f.campanas.size;
    f.costoPorPieza = f.aprobadas ? f.total / f.aprobadas : null;
    f.margen = f.cobro ? f.cobro - f.total : null;
    f.margenPct = f.cobro ? Math.round(((f.cobro - f.total) / f.cobro) * 100) : null;
  }
  lista.sort((a, b) => b.total - a.total);
  const sum = (k) => lista.reduce((n, f) => n + (f[k] || 0), 0);
  return { mes, factor, fijos: db.agency.fijos, filas: lista, totales: { ia: sum('ia'), fijos: fijoTotal, total: sum('ia') + fijoTotal, cobro: sum('cobro') }, estimado: true };
}

export function registrar(app) {
  app.get('/api/costos', (req, res) => res.json(reporte(mesOk(req.query.mes) ? req.query.mes : mesDe(Date.now()))));
  app.put('/api/costos/config', (req, res) => {
    const b = req.body || {};
    if (Array.isArray(b.fijos)) db.agency.fijos = b.fijos.slice(0, 20).map((x) => ({ id: x.id || newId('fx'), nombre: String(x.nombre || '').slice(0, 60), usd: num(x.usd), reparto: x.reparto === 'uso' ? 'uso' : 'igual' })).filter((x) => x.nombre);
    if (b.factor !== undefined) db.agency.factorIA = Math.min(5, Math.max(0.2, num(b.factor) || 1));
    save(); res.json({ ok: true });
  });
}
