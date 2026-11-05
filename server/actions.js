// Acciones que cualquier agente puede hacer en la oficina. Las usan tanto
// los agentes reales (Claude) como el modo demo.
import { setAgent, log, askBoss, submitPiece } from './hub.js';

export function makeActions(agentId, campaign) {
  const cid = campaign.id;
  return {
    async estado(texto) {
      setAgent(agentId, { burbuja: String(texto).slice(0, 140) });
      log(agentId, texto, cid);
      return 'ok';
    },

    async preguntar(pregunta, opciones = []) {
      setAgent(agentId, { estado: 'esperando', burbuja: pregunta.slice(0, 140) });
      const r = await askBoss({ tipo: 'pregunta', agente: agentId, campaignId: cid, texto: pregunta, opciones });
      setAgent(agentId, { estado: 'trabajando', burbuja: `Respuesta: ${r.respuesta}`.slice(0, 140) });
      return `El jefe respondió: ${r.respuesta}`;
    },

    async autorizar(accion, detalle = '') {
      setAgent(agentId, { estado: 'esperando', burbuja: `¿Me autorizas? ${accion}`.slice(0, 140) });
      const r = await askBoss({ tipo: 'autorizacion', agente: agentId, campaignId: cid, texto: accion, detalle });
      setAgent(agentId, { estado: 'trabajando', burbuja: r.aprobado ? '¡Autorizado!' : 'No autorizado' });
      return r.aprobado
        ? `AUTORIZADO${r.respuesta ? `. Comentario del jefe: ${r.respuesta}` : ''}`
        : `NO AUTORIZADO${r.respuesta ? `. Motivo: ${r.respuesta}` : ''}. No realices esa acción.`;
    },

    async entregar({ tipo, titulo, descripcion = '', contenido, version = 1 }) {
      setAgent(agentId, { estado: 'entregando', burbuja: `Esperando tu swipe: ${titulo}`.slice(0, 140) });
      const p = await submitPiece({ agente: agentId, campaignId: cid, tipo, titulo, descripcion, contenido, version });
      setAgent(agentId, {
        estado: 'trabajando',
        burbuja: p.estado === 'aprobada' ? `¡Aprobaron "${titulo}"!` : `Rehaciendo "${titulo}"…`,
      });
      return p.estado === 'aprobada'
        ? `APROBADA por el jefe${p.comentario ? `. Comentario: ${p.comentario}` : ''}.`
        : `RECHAZADA por el jefe${p.comentario ? `. Comentario: ${p.comentario}` : ' (sin comentario: propón una dirección claramente distinta)'}. Haz una nueva versión y vuelve a entregarla.`;
    },
  };
}

// Evita que un mismo agente haga dos tareas a la vez: hace fila.
const queues = new Map();
export async function withAgent(agentId, fn) {
  const prev = queues.get(agentId) || Promise.resolve();
  let release;
  const mine = new Promise((r) => (release = r));
  queues.set(agentId, prev.then(() => mine));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}
