// Agentes reales: cada uno es Claude con su propio rol y herramientas.
//
// Cada tarea de un agente es un "trabajo" (job) que se guarda en la base de
// datos después de CADA paso. Si el servidor se reinicia (por ejemplo, al subir
// una mejora a Railway), los trabajos pendientes se retoman donde se quedaron:
// las preguntas que ya te hicieron siguen esperando tu respuesta y no se repiten.
import Anthropic from '@anthropic-ai/sdk';
import { ROSTER, byId, personaText } from './roster.js';
import { setAgent, log, addUsage, brandText, memoryText, setPhase, agentState, startMeeting, addAporte, endMeeting, meetingTranscript } from './hub.js';
import { db, save, newId } from './store.js';
import { makeActions, withAgent } from './actions.js';

const client = new Anthropic({ maxRetries: 4, timeout: 6 * 60 * 1000 });
const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const EFFORT = process.env.CLAUDE_EFFORT || 'medium';
const MAX_TURNS = 60;

const REGLAS = `Trabajas en una agencia de marketing operada por agentes de IA. El "jefe" es el dueño de la agencia (humano).
- Usa la herramienta estado cada vez que empieces algo nuevo, con una frase corta en primera persona ("Buscando referencias de color…"). El jefe te ve como un astronauta en una estación espacial y lee esa frase.
- Si te falta información importante para hacer bien tu trabajo, pregunta antes de producir (preguntar_al_jefe); es mejor una pregunta que una pieza que no se va a usar. Ofrece opciones concretas cuando sea posible.
- Pide autorización (pedir_autorizacion) antes de cualquier acción que gaste dinero, publique, o contacte al cliente.
- Lee la MEMORIA y las campañas anteriores (abajo): son preferencias reales del jefe y del cliente; respétalas. Cuando aprendas algo que servirá en futuras campañas (algo que al jefe o al cliente le gusta o no), guárdalo con guardar_memoria en una frase clara.
- Escribe siempre en español.`;

function systemFor(agent, campaign) {
  const cl = db.clients.find((c) => c.id === campaign.clientId);
  const mem = memoryText(campaign.clientId, campaign.id);
  return `${REGLAS}\n\n${agent.prompt}\n\n${personaText(agent)}\n\nCampaña actual — Cliente: ${campaign.cliente}\n${brandText(cl)}\n\nBrief del jefe:\n${campaign.brief}${mem ? `\n\n${mem}` : ''}`;
}

// ---------- Herramientas (definición para la API) ----------
const obj = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });
const TOOLS = {
  estado: { description: 'Actualiza la frase que el jefe ve sobre tu personaje (qué estás haciendo ahora).', input_schema: obj({ texto: { type: 'string' } }, ['texto']) },
  preguntar_al_jefe: {
    description: 'Vas hasta el escritorio del jefe y le haces una pregunta. Espera su respuesta (puede tardar horas). Usa opciones cuando haya alternativas claras.',
    input_schema: obj({ pregunta: { type: 'string' }, opciones: { type: 'array', items: { type: 'string' }, description: 'De 2 a 4 respuestas posibles (opcional)' } }, ['pregunta']),
  },
  pedir_autorizacion: {
    description: 'Pide autorización al jefe antes de una acción sensible (gastar, publicar, contactar al cliente). Devuelve AUTORIZADO o NO AUTORIZADO.',
    input_schema: obj({ accion: { type: 'string' }, detalle: { type: 'string' } }, ['accion']),
  },
  guardar_memoria: {
    description: 'Guarda un aprendizaje para futuras campañas (preferencias del cliente o del jefe). alcance "cliente" (por defecto) o "agencia" si aplica a todos los clientes.',
    input_schema: obj({ texto: { type: 'string' }, alcance: { type: 'string', enum: ['cliente', 'agencia'] } }, ['texto']),
  },
  entregar_pieza: {
    description: 'Sube una pieza al feed del jefe, que la aprueba o rechaza deslizando. Espera su decisión y devuelve APROBADA o RECHAZADA con su comentario.',
    input_schema: obj({
      tipo: { type: 'string', enum: ['arte', 'video', 'texto'] },
      titulo: { type: 'string' },
      descripcion: { type: 'string', description: 'Qué es y por qué funciona, en 1-2 frases' },
      contenido: { type: 'string', description: 'arte: SVG completo · video: documento HTML completo · texto: el texto' },
      version: { type: 'integer' },
    }, ['tipo', 'titulo', 'contenido']),
  },
  junta_creativa: {
    description: 'Reúne a TODO el equipo en la mesa de juntas: cada uno propone ideas desde su especialidad y personalidad. Devuelve lo que dijo cada quien. Úsala para crear el concepto y SIEMPRE que el jefe rechace un concepto.',
    input_schema: obj({
      tema: { type: 'string', description: 'Qué se va a idear (una frase)' },
      contexto: { type: 'string', description: 'Brief resumido, respuestas del jefe, comentarios/rechazos previos y restricciones' },
    }, ['tema', 'contexto']),
  },
  hacer_preguntas: {
    description: 'FASE 1: hace al jefe varias preguntas de una vez (un formulario) antes de planear la campaña. Espera sus respuestas.',
    input_schema: obj({
      intro: { type: 'string', description: 'Una frase de por qué preguntas' },
      preguntas: { type: 'array', items: obj({ pregunta: { type: 'string' }, opciones: { type: 'array', items: { type: 'string' } } }, ['pregunta']) },
    }, ['preguntas']),
  },
  presentar_concepto: {
    description: 'FASE 2: presenta el concepto creativo al jefe para aprobarlo antes de producir. Devuelve CONCEPTO APROBADO o los cambios que pide.',
    input_schema: obj({
      titulo: { type: 'string', description: 'Nombre corto del concepto' },
      detalle: { type: 'string', description: 'Idea central, mensaje clave, tono y lista de piezas (tipo, formato y objetivo de cada una). Usa saltos de línea.' },
    }, ['titulo', 'detalle']),
  },
};

function toolDefs(agentId) {
  const names = ['estado', 'preguntar_al_jefe', 'pedir_autorizacion', 'guardar_memoria'];
  if (byId[agentId].puedeEntregar) names.push('entregar_pieza');
  const defs = names.map((name) => ({ name, ...TOOLS[name] }));
  if (agentId === 'director') {
    defs.push({ name: 'hacer_preguntas', ...TOOLS.hacer_preguntas }, { name: 'junta_creativa', ...TOOLS.junta_creativa }, { name: 'presentar_concepto', ...TOOLS.presentar_concepto });
    const equipo = ROSTER.filter((x) => x.id !== 'director');
    defs.push({
      name: 'asignar_tarea',
      description: `Asigna una tarea a un miembro del equipo y espera su resultado. Equipo: ${equipo.map((x) => `${x.id} (${x.nombre}, ${x.rol})`).join('; ')}. Puedes asignar varias tareas a la vez a agentes distintos.`,
      input_schema: obj({ agente: { type: 'string', enum: equipo.map((x) => x.id) }, instrucciones: { type: 'string', description: 'Tarea completa con todo el contexto necesario' } }, ['agente', 'instrucciones']),
    });
  }
  return defs;
}

async function runTool(job, block, campaign) {
  const a = makeActions(job.agentId, campaign, block.id);
  const i = block.input || {};
  switch (block.name) {
    case 'estado': return a.estado(i.texto || '');
    case 'preguntar_al_jefe': return a.preguntar(i.pregunta || '', i.opciones || []);
    case 'pedir_autorizacion': return a.autorizar(i.accion || '', i.detalle || '');
    case 'guardar_memoria': return a.memoria(i.texto || '', i.alcance);
    case 'entregar_pieza':
      if (!i.contenido || !i.tipo) throw new Error('Faltan tipo o contenido de la pieza');
      return a.entregar(i);
    case 'hacer_preguntas': return a.cuestionario(i.intro, i.preguntas);
    case 'presentar_concepto': return a.concepto(i.titulo || 'Concepto', i.detalle || '');
    case 'asignar_tarea': return delegate(job, block.id, i.agente, i.instrucciones || '', campaign);
    case 'junta_creativa': return junta(block.id, i.tema || 'Ideas para la campaña', i.contexto || '', campaign);
    default: throw new Error(`Herramienta desconocida: ${block.name}`);
  }
}

// ---------- Trabajos persistentes ----------
const running = new Map();
export const isRunning = (campaignId) => [...running.keys()].some((id) => db.jobs.find((j) => j.id === id)?.campaignId === campaignId);

function createJob({ agentId, task, campaignId, parentJobId = null, parentToolUseId = null }) {
  const job = {
    id: newId('j'), agentId, task, campaignId, parentJobId, parentToolUseId,
    estado: 'activo', creado: Date.now(), messages: [{ role: 'user', content: task }],
  };
  db.jobs.push(job);
  save();
  return job;
}

async function delegate(parent, toolUseId, agentId, task, campaign) {
  if (!byId[agentId] || agentId === 'director') throw new Error(`No existe el agente ${agentId}`);
  setPhase(campaign.id, 'produccion');
  const child = db.jobs.find((j) => j.parentToolUseId === toolUseId)
    || createJob({ agentId, task, campaignId: campaign.id, parentJobId: parent.id, parentToolUseId: toolUseId });
  return runJob(child);
}

export function runJob(job) {
  if (job.estado === 'terminado') return Promise.resolve(job.resultado);
  if (running.has(job.id)) return running.get(job.id);
  const p = withAgent(job.agentId, () => loop(job)).finally(() => running.delete(job.id));
  running.set(job.id, p);
  return p;
}

const textOf = (content) => (Array.isArray(content) ? content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim() : String(content || ''));

async function loop(job) {
  const campaign = db.campaigns.find((c) => c.id === job.campaignId);
  const agent = byId[job.agentId];
  if (!campaign || !agent) throw new Error('Campaña o agente inexistente');
  job.estado = 'activo'; job.error = null;
  setAgent(job.agentId, { estado: 'trabajando', burbuja: job.messages.length > 1 ? 'Retomando donde me quedé…' : 'Empezando…', campaignId: campaign.id });
  if (job.messages.length === 1) log(job.agentId, `Nueva tarea: ${job.task.slice(0, 200)}`, campaign.id);
  else log(job.agentId, 'Retomo mi tarea donde me quedé.', campaign.id);

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const last = job.messages.at(-1);
      if (last.role === 'assistant') {
        const uses = last.content.filter((b) => b.type === 'tool_use');
        if (!uses.length) {
          const falta = pendingWork(job, campaign);
          if (job.cortado && (job.cortes || 0) < 2) {
            // Se le acabó el espacio a media respuesta: que continúe.
            job.cortes = (job.cortes || 0) + 1;
            job.cortado = false;
            job.messages.push({ role: 'user', content: '[Sistema] Tu respuesta se cortó por larga. Continúa, sé más breve y usa la herramienta que corresponda.' });
            save();
          } else if (falta && (job.empujones || 0) < 4) {
            job.empujones = (job.empujones || 0) + 1;
            job.messages.push({ role: 'user', content: `[Sistema] Todavía no terminas: ${falta} No escribas el resultado como texto: usa la herramienta. No te detengas.` });
            save();
            log(job.agentId, '↪️ Sigo trabajando: aún falta completar la campaña.', campaign.id);
          } else if (falta) {
            throw new Error(`${agent.nombre} no logró avanzar (${falta.split('.')[0]}). Pulsa Reintentar.`);
          } else return finish(job, textOf(last.content));
        }
        if (uses.length) {
        // Ejecuta las herramientas pedidas (en paralelo) y devuelve TODOS los resultados juntos.
        const results = await Promise.all(uses.map(async (b) => {
          if (job.cortado) return { type: 'tool_result', tool_use_id: b.id, content: 'Tu respuesta se cortó por ser demasiado larga; vuelve a intentarlo con un contenido más compacto.', is_error: true };
          try {
            return { type: 'tool_result', tool_use_id: b.id, content: String(await runTool(job, b, campaign)) || 'ok' };
          } catch (e) {
            return { type: 'tool_result', tool_use_id: b.id, content: `Error: ${e.message}`, is_error: true };
          }
        }));
        job.messages.push({ role: 'user', content: results });
        job.cortado = false;
        save();
        setAgent(job.agentId, { estado: 'trabajando', campaignId: campaign.id });
        }
      }

      setAgent(job.agentId, { estado: 'trabajando', campaignId: campaign.id, pensando: Date.now() });
      const resp = await client.beta.messages.stream({
        model: MODEL,
        max_tokens: 48000,
        output_config: { effort: EFFORT },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: systemFor(agent, campaign),
        tools: toolDefs(job.agentId),
        messages: job.messages,
      }).finalMessage();
      setAgent(job.agentId, { pensando: null });
      addUsage(campaign.id, MODEL, resp.usage, job.agentId);
      if (resp.stop_reason === 'refusal') {
        throw new Error(`${agent.nombre} no pudo continuar: el modelo rechazó la solicitud (${resp.stop_details?.category || 'política'}).`);
      }
      // Lo que el agente "dice" entre pasos se ve en la bitácora.
      const dicho = textOf(resp.content);
      if (dicho) log(job.agentId, `🗨️ ${dicho.slice(0, 400)}`, campaign.id);
      job.messages.push({ role: 'assistant', content: resp.content });
      job.cortado = resp.stop_reason === 'max_tokens';
      save();
    }
    return finish(job, 'Se alcanzó el límite de pasos para esta tarea.');
  } catch (err) {
    job.estado = 'error';
    job.error = err.message;
    save();
    log(job.agentId, `Error: ${err.message}`, campaign.id);
    throw err;
  } finally {
    setAgent(job.agentId, { estado: 'libre', burbuja: '', campaignId: null });
  }
}

// ¿Qué le falta a la directora antes de poder cerrar la campaña?
function pendingWork(job, campaign) {
  if (job.agentId !== 'director' || job.parentJobId) return null;
  if (!campaign.concepto) return 'el concepto no está aprobado. Convoca una nueva junta_creativa con los comentarios del jefe y presenta un concepto NUEVO y diferente con presentar_concepto.';
  const piezas = db.pieces.filter((p) => p.campaignId === campaign.id);
  if (!piezas.some((p) => p.estado === 'aprobada')) return 'el concepto ya está aprobado pero no hay ninguna pieza aprobada. Asigna la producción con asignar_tarea.';
  return null;
}

// ---------- Junta creativa ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function junta(key, tema, contexto, campaign) {
  const m = startMeeting({ campaignId: campaign.id, tema, contexto, key });
  if (m.estado === 'terminada' && m.aportes.length) return transcriptFor(m);
  const equipo = ROSTER.filter((a) => a.id !== 'director');
  const antes = Object.fromEntries(ROSTER.map((a) => [a.id, { ...agentState[a.id] }]));
  for (const a of ROSTER) setAgent(a.id, { estado: 'junta', burbuja: a.id === 'director' ? `Tema: ${tema}`.slice(0, 140) : '🤔 Pensando…', campaignId: campaign.id });
  const cl = db.clients.find((c) => c.id === campaign.clientId);
  const mem = memoryText(campaign.clientId, campaign.id);
  try {
    await Promise.all(equipo.filter((a) => !m.aportes.some((x) => x.agente === a.id)).map(async (a) => {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        output_config: { effort: 'low' },
        system: `${REGLAS}

Eres ${a.nombre}, ${a.rol} de la agencia.
${personaText(a)}

Campaña: ${campaign.cliente}
${brandText(cl)}
Brief: ${campaign.brief}${mem ? `

${mem}` : ''}`,
        messages: [{ role: 'user', content: `JUNTA CREATIVA convocada por Dani.
Tema: ${tema}
Contexto: ${contexto}

Desde tu especialidad y con tu personalidad, propone 2 ideas concretas y distintas (una frase cada una) y di un riesgo o crítica honesta. Si hay comentarios del jefe, respétalos. Máximo 90 palabras, sin saludos ni presentación.` }],
      });
      addUsage(campaign.id, MODEL, res.usage, a.id);
      const texto = textOf(res.content) || '(sin ideas)';
      addAporte(m, a.id, texto);
      setAgent(a.id, { burbuja: texto.replace(/\s+/g, ' ').slice(0, 140) });
    }));
    endMeeting(m);
    await sleep(6000); // que se alcancen a leer las burbujas en la mesa
    return transcriptFor(m);
  } finally {
    for (const a of ROSTER) {
      const prev = antes[a.id];
      setAgent(a.id, prev.estado === 'junta' ? { estado: 'libre', burbuja: '', campaignId: null } : prev);
    }
    setAgent('director', { estado: 'trabajando', burbuja: 'Armando el concepto con las ideas del equipo', campaignId: campaign.id });
  }
}
const transcriptFor = (m) => `Ideas de la junta creativa #${m.numero}:

${meetingTranscript(m, (id) => `${byId[id]?.nombre} (${byId[id]?.rol})`)}

TU SIGUIENTE PASO OBLIGATORIO: sintetiza el mejor concepto (combina ideas y menciona de quién viene cada una) y llama a la herramienta presentar_concepto. No lo escribas como texto: el jefe solo lo ve si usas la herramienta.`;

function finish(job, text) {
  job.estado = 'terminado';
  job.resultado = text || 'Tarea terminada.';
  job.terminado = Date.now();
  delete job.messages; // ya no hace falta: libera espacio
  save();
  log(job.agentId, `Terminé: ${job.resultado.slice(0, 300)}`, job.campaignId);
  return job.resultado;
}

// ---------- API usada por el servidor ----------
export async function runCampaign(campaign) {
  const job = createJob({ agentId: 'director', task: `Nueva campaña para ${campaign.cliente}. Empieza por la FASE 1 (descubrimiento).`, campaignId: campaign.id });
  campaign.jobId = job.id;
  save();
  return runJob(job);
}

// Al arrancar: retoma las campañas que estaban en curso.
export function boot() {
  return db.campaigns
    .filter((c) => c.estado === 'en_curso' && c.jobId)
    .map((c) => {
      const job = db.jobs.find((j) => j.id === c.jobId);
      if (!job || job.estado === 'terminado') return null;
      log('director', `🔄 Retomando la campaña de ${c.cliente} tras un reinicio.`, c.id);
      return { campaign: c, promise: runJob(job) };
    })
    .filter(Boolean);
}

// Reintentar una campaña que falló: retoma sus trabajos desde el último paso guardado.
export function retryCampaign(campaign) {
  const job = db.jobs.find((j) => j.id === campaign.jobId)
    || db.jobs.find((j) => j.campaignId === campaign.id && !j.parentJobId && j.estado !== 'terminado');
  if (!job || job.estado === 'terminado') return runCampaign(campaign);
  campaign.jobId = job.id;
  for (const j of db.jobs) if (j.campaignId === campaign.id && j.estado === 'error') j.estado = 'activo';
  return runJob(job);
}

// Chat directo con un agente (clic en el personaje → "Hablar").
export async function chatWithAgent(agentId, mensaje, contexto) {
  const agent = byId[agentId];
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: 'low' },
    system: `${REGLAS}\n\n${agent.prompt}\n\nEl jefe te habla directamente por el chat de la oficina. Responde breve, en personaje.\nLo último que hiciste:\n${contexto}`,
    messages: [{ role: 'user', content: mensaje }],
  });
  addUsage(null, MODEL, res.usage, agentId);
  return textOf(res.content);
}
