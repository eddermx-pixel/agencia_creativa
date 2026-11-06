// Cursos de actualización: cada cierto tiempo un agente pide permiso para tomar
// un curso. Si el jefe lo aprueba, investiga en internet lo más reciente de su
// especialidad y regresa con apuntes y nuevas skills (que usa en su trabajo).
import { db, save, newId } from './store.js';
import { ROSTER, byId } from './roster.js';
import { bus, askBoss, setAgent, agentState, log } from './hub.js';
import * as ws from './workspace.js';

export const TEMAS = {
  director: ['Dirección creativa de campañas en redes 2026', 'Cómo presentar conceptos que el cliente aprueba', 'Métricas que importan en campañas de redes sociales'],
  investigador: ['Tendencias de consumo y redes sociales este mes', 'Investigación de audiencias con herramientas gratuitas', 'Análisis de competencia en Instagram y TikTok'],
  copy: ['Ganchos y copys virales para Reels y TikTok 2026', 'Storytelling para marcas pequeñas', 'Copys que venden por WhatsApp e Instagram'],
  disenador: ['Tendencias de diseño gráfico para redes 2026', 'Tipografía y composición para móvil', 'Carruseles que se guardan y se comparten'],
  video: ['Edición de reels: transiciones, ritmo y subtítulos que retienen', 'B-roll y storytelling visual para marcas', 'Formatos de video corto que se están volviendo virales este mes', 'Subtítulos animados y diseño de texto en video'],
  calidad: ['Errores comunes en publicaciones de marcas y cómo evitarlos', 'Claims, derechos de autor y reglas de publicidad en redes', 'Accesibilidad en contenido de redes sociales'],
};

const DIAS = () => Number(process.env.CURSO_CADA_DIAS || 7);
let runtime = null; // se inyecta desde index.js (real o demo)
export function initCursos(rt) {
  runtime = rt;
  bus.on('request', (r) => { if (r.tipo === 'curso' && r.estado === 'respondida') decidir(r); });
  setTimeout(revisar, 2 * 60 * 1000);
  setInterval(revisar, 20 * 60 * 1000);
}

// ¿Toca proponer un curso a alguien? (uno a la vez, para no saturarte)
function revisar() {
  if (db.courses.some((c) => ['propuesto', 'en_curso'].includes(c.estado))) return;
  const ahora = Date.now();
  const candidatos = ROSTER.filter((a) => {
    const ultimo = db.courses.filter((c) => c.agente === a.id).sort((x, y) => y.creado - x.creado)[0];
    return !ultimo || ahora - ultimo.creado > DIAS() * 86400000;
  });
  if (!candidatos.length) return;
  const a = candidatos.sort((x, y) => cursosDe(x.id).length - cursosDe(y.id).length)[0];
  proponer(a.id);
}

export const cursosDe = (id) => db.courses.filter((c) => c.agente === id);

export function proponer(agentId, tema = null) {
  const a = byId[agentId];
  if (!a) throw new Error('Agente inexistente');
  const pendiente = db.courses.find((c) => c.agente === agentId && ['propuesto', 'en_curso'].includes(c.estado));
  if (pendiente) return pendiente;
  const tomados = new Set(cursosDe(agentId).map((c) => c.tema));
  const lista = TEMAS[agentId] || ['Lo más nuevo de mi especialidad'];
  tema = tema || lista.find((t) => !tomados.has(t)) || lista[cursosDe(agentId).length % lista.length];
  const c = { id: newId('cu'), agente: agentId, tema, estado: 'propuesto', creado: Date.now() };
  db.courses.push(c); save();
  askBoss({
    tipo: 'curso', agente: agentId, campaignId: null, key: `curso:${c.id}`,
    texto: `Quiero tomar un curso: "${tema}"`,
    detalle: `${a.nombre} investigará en internet lo más reciente y volverá con apuntes y nuevas habilidades para su trabajo. Toma unos minutos${runtime?.estudiarCuesta ? ` y cuesta aprox. ${runtime.estudiarCuesta}` : ''}.`,
  });
  bus.emit('course', c);
  return c;
}

async function decidir(r) {
  const c = db.courses.find((x) => `curso:${x.id}` === r.key);
  if (!c || c.estado !== 'propuesto') return;
  if (!r.aprobado) { c.estado = 'rechazado'; save(); bus.emit('course', c); log(c.agente, `Ok, dejo el curso "${c.tema}" para otro momento.`); return; }
  c.estado = 'en_curso'; c.inicio = Date.now(); save(); bus.emit('course', c);
  const a = byId[c.agente];
  const antes = { ...agentState[a.id] };
  const libre = !antes.estado || antes.estado === 'libre';
  if (libre) setAgent(a.id, { estado: 'trabajando', burbuja: `🎓 Tomando el curso: ${c.tema}`.slice(0, 140) });
  log(a.id, `🎓 Empiezo el curso "${c.tema}"`);
  try {
    const r2 = await runtime.estudiar(a, c.tema);
    Object.assign(c, { estado: 'terminado', fin: Date.now(), apuntes: r2.apuntes || [], skills: r2.skills || [], fuentes: r2.fuentes || [] });
    try { ws.curso(a.id, c); } catch {}
    log(a.id, `🎓 Terminé el curso "${c.tema}". Aprendí: ${(c.skills || []).map((s) => s.nombre).join(', ') || 'técnicas nuevas'}.`);
  } catch (e) {
    Object.assign(c, { estado: 'error', error: e.message });
    log(a.id, `No pude terminar el curso: ${e.message}`);
  } finally {
    save(); bus.emit('course', c);
    if (libre) setAgent(a.id, { estado: 'libre', burbuja: '' });
  }
}

// Lo aprendido se agrega a las instrucciones del agente en sus siguientes tareas.
export function aprendizajes(agentId) {
  const hechos = cursosDe(agentId).filter((c) => c.estado === 'terminado').slice(-3);
  if (!hechos.length) return '';
  return `LO QUE APRENDISTE EN TUS CURSOS (aplícalo):\n${hechos.map((c) => `• ${c.tema}:\n${(c.apuntes || []).slice(0, 10).map((x) => `  - ${x}`).join('\n')}`).join('\n')}`;
}

export const parseCurso = (texto) => {
  const m = String(texto).match(/\{[\s\S]*\}/g);
  for (const cand of (m || []).reverse()) {
    try {
      const j = JSON.parse(cand);
      return {
        apuntes: (j.apuntes || []).map(String).slice(0, 12),
        skills: (j.skills || []).map((s) => ({ nombre: String(s.nombre || s).slice(0, 60), nivel: Math.min(99, Math.max(40, Number(s.nivel) || 70)) })).slice(0, 5),
        fuentes: (j.fuentes || []).map(String).filter((u) => /^https?:\/\//.test(u)).slice(0, 8),
      };
    } catch {}
  }
  throw new Error('El curso no devolvió apuntes legibles');
};
