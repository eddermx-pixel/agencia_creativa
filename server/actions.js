// Acciones que cualquier agente puede hacer en la oficina. Las usan tanto
// los agentes reales (Claude) como el modo demo.
import { setAgent, log, askBoss, submitPiece, setPhase, addMemory } from './hub.js';
import { isSpec, normalizeSpec, resolveBroll, brollDisponible } from './video.js';
import * as ws from './workspace.js';
import * as entregables from './entregables.js';
import { db } from './store.js';
import { agregarVoz } from './voz.js';
import { agregarMusica } from './musica.js';
import { producir } from './hyperframes.js';
import { producirRemotion } from './remotion.js';

// `key` = id de la llamada del agente; permite retomar sin duplicar tras un reinicio.
export function makeActions(agentId, campaign, key = null) {
  const cid = campaign.id;
  return {
    async estado(texto) {
      setAgent(agentId, { burbuja: String(texto).slice(0, 140) });
      log(agentId, texto, cid);
      return 'ok';
    },

    async preguntar(pregunta, opciones = []) {
      setAgent(agentId, { estado: 'esperando', burbuja: pregunta.slice(0, 140) });
      const r = await askBoss({ tipo: 'pregunta', agente: agentId, campaignId: cid, texto: pregunta, opciones, key });
      setAgent(agentId, { estado: 'trabajando', burbuja: `Respuesta: ${r.respuesta}`.slice(0, 140) });
      return `El jefe respondió: ${r.respuesta}`;
    },

    async autorizar(accion, detalle = '') {
      setAgent(agentId, { estado: 'esperando', burbuja: `¿Me autorizas? ${accion}`.slice(0, 140) });
      const r = await askBoss({ tipo: 'autorizacion', agente: agentId, campaignId: cid, texto: accion, detalle, key });
      setAgent(agentId, { estado: 'trabajando', burbuja: r.aprobado ? '¡Autorizado!' : 'No autorizado' });
      return r.aprobado
        ? `AUTORIZADO${r.respuesta ? `. Comentario del jefe: ${r.respuesta}` : ''}`
        : `NO AUTORIZADO${r.respuesta ? `. Motivo: ${r.respuesta}` : ''}. No realices esa acción.`;
    },

    // Varias preguntas de una vez, antes de empezar a producir.
    async cuestionario(intro, preguntas) {
      const lista = (preguntas || []).slice(0, 8).map((p) => (typeof p === 'string' ? { pregunta: p, opciones: [] } : { pregunta: p.pregunta, opciones: p.opciones || [] }));
      setPhase(cid, 'descubrimiento');
      setAgent(agentId, { estado: 'esperando', burbuja: `Tengo ${lista.length} preguntas antes de empezar` });
      const r = await askBoss({ tipo: 'cuestionario', agente: agentId, campaignId: cid, texto: intro || 'Antes de empezar necesito aclarar algunas cosas', preguntas: lista, key });
      setAgent(agentId, { estado: 'trabajando', burbuja: '¡Gracias! Ya tengo claro el enfoque' });
      return `Respuestas del jefe:\n${r.respuesta}`;
    },

    // Presenta la idea creativa; nada se produce hasta que el jefe la apruebe.
    async concepto(titulo, detalle) {
      setPhase(cid, 'concepto');
      setAgent(agentId, { estado: 'esperando', burbuja: `Concepto: ${titulo}`.slice(0, 140) });
      const r = await askBoss({ tipo: 'concepto', agente: agentId, campaignId: cid, texto: titulo, detalle, key });
      setAgent(agentId, { estado: 'trabajando', burbuja: r.aprobado ? '¡Concepto aprobado! A producir' : 'Ajustando el concepto…' });
      return r.aprobado
        ? `CONCEPTO APROBADO${r.respuesta ? `. Comentario del jefe: ${r.respuesta}` : ''}. Ya puedes pasar a producción.`
        : `CONCEPTO NO APROBADO. Cambios pedidos: ${r.respuesta || '(sin comentario: propón otra dirección)'}. Ajusta el concepto y vuelve a presentarlo antes de producir.`;
    },

    async entregarHF({ titulo, descripcion = '', html, bloques = [], codigo, duracion, narraciones = [], musicaPrompt = '', tomas = [], version = 1 }, via = 'hf') {
      setAgent(agentId, { estado: 'trabajando', burbuja: '🎞️ Validando y renderizando el video…' });
      const clave = key || `${cid}-${Date.now()}`;
      const r = via === 'remotion' ? await producirRemotion({ clave, codigo, duracion, narraciones, musicaPrompt, tomas, campaignId: cid, agente: agentId }) : await producir({ clave, html, bloques, narraciones, musicaPrompt, tomas, campaignId: cid, agente: agentId });
      const contenido = JSON.stringify({ hf: 1, clave: r.clave, archivo: r.archivo, duracion: r.duracion });
      setAgent(agentId, { estado: 'entregando', burbuja: `Esperando tu swipe: ${titulo}`.slice(0, 140) });
      const p = await submitPiece({ agente: agentId, campaignId: cid, tipo: 'video', titulo, descripcion: `${descripcion} (${r.resumen})`.trim(), contenido, version, key, motor: 'hf' });
      setAgent(agentId, { estado: 'trabajando', burbuja: p.estado === 'aprobada' ? `¡Aprobaron "${titulo}"!` : `Rehaciendo "${titulo}"…` });
      return p.estado === 'aprobada'
        ? `APROBADA por el jefe${p.comentario ? `. Comentario: ${p.comentario}` : ''}.`
        : `RECHAZADA por el jefe${p.comentario ? `. Comentario: ${p.comentario}` : ' (sin comentario: propón una dirección claramente distinta)'}. Haz una nueva versión y vuelve a entregarla.`;
    },

    entregarRemotion(args) { return this.entregarHF(args, 'remotion'); },

    async entregar({ tipo, titulo, descripcion = '', contenido, version = 1 }) {
      let motor = null;
      if (tipo === 'video' && (isSpec(contenido) || typeof contenido === 'object')) {
        const spec = normalizeSpec(contenido); // lanza error si el JSON no sirve: el agente lo corrige
        setAgent(agentId, { burbuja: brollDisponible() ? '🎥 Buscando tomas reales…' : 'Armando el video…' });
        await resolveBroll(spec);
        await agregarVoz(spec, { campaignId: cid, agente: agentId });
        await agregarMusica(spec, { campaignId: cid, agente: agentId });
        contenido = JSON.stringify(spec);
        motor = 'v2';
      }
      setAgent(agentId, { estado: 'entregando', burbuja: `Esperando tu swipe: ${titulo}`.slice(0, 140) });
      try { const pz = { tipo, titulo, version, motor }; ws.entrega(agentId, campaign, pz, entregables.cuerpo({ ...pz, campaignId: cid, contenido }), entregables.extDe(pz)); } catch {}
      const p = await submitPiece({ agente: agentId, campaignId: cid, tipo, titulo, descripcion, contenido, version, key, motor });
      setAgent(agentId, {
        estado: 'trabajando',
        burbuja: p.estado === 'aprobada' ? `¡Aprobaron "${titulo}"!` : `Rehaciendo "${titulo}"…`,
      });
      return p.estado === 'aprobada'
        ? `APROBADA por el jefe${p.comentario ? `. Comentario: ${p.comentario}` : ''}.`
        : `RECHAZADA por el jefe${p.comentario ? `. Comentario: ${p.comentario}` : ' (sin comentario: propón una dirección claramente distinta)'}. Haz una nueva versión y vuelve a entregarla.`;
    },

    async memoria(texto, alcance = 'cliente') {
      const m = addMemory({ campaignId: cid, clientId: alcance === 'agencia' ? null : undefined, texto, origen: 'agente', agente: agentId, key });
      if (m) log(agentId, `🧠 Recordaré: ${m.texto}`, cid);
      return 'Guardado en la memoria.';
    },
  };
}

// Un agente hace una tarea a la vez POR CAMPAÑA (en campañas distintas trabajan en paralelo).
const queues = new Map();
export async function withAgent(agentId, fn, campaignId = '') {
  const k = `${agentId}:${campaignId}`;
  const prev = queues.get(k) || Promise.resolve();
  let release;
  const mine = new Promise((r) => (release = r));
  queues.set(k, prev.then(() => mine));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}
