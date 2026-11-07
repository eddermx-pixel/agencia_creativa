// Agentes reales: cada uno es Claude con su propio rol y herramientas.
//
// Cada tarea de un agente es un "trabajo" (job) que se guarda en la base de
// datos después de CADA paso. Si el servidor se reinicia (por ejemplo, al subir
// una mejora a Railway), los trabajos pendientes se retoman donde se quedaron:
// las preguntas que ya te hicieron siguen esperando tu respuesta y no se repiten.
import Anthropic from '@anthropic-ai/sdk';
import { ROSTER, byId, personaText } from './roster.js';
import { bus, setAgent, log, addUsage, brandText, memoryText, setPhase, agentState, startMeeting, addAporte, endMeeting, meetingTranscript } from './hub.js';
import { db, save, newId } from './store.js';
import { videoGuide } from './video.js';
import { resumenParaAgentes, imagenesReferencia } from './files.js';
import { aprendizajes, parseCurso } from './cursos.js';
import * as ws from './workspace.js';
import { makeActions, withAgent } from './actions.js';
import { hfGuide, estiloPelicula, hfDisponible, buscarBloques, verBloque } from './hyperframes.js';
import { remotionGuide, remotionDisponible } from './remotion.js';

const client = new Anthropic({ maxRetries: 4, timeout: 6 * 60 * 1000 });
const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const EFFORT = process.env.CLAUDE_EFFORT || 'medium';
const MAX_TURNS = 60;

const REGLAS = `Trabajas en una agencia de marketing operada por agentes de IA. El "jefe" es el dueño de la agencia (humano).
- Usa la herramienta estado cada vez que empieces algo nuevo, con una frase corta en primera persona ("Buscando referencias de color…"). El jefe te ve como un astronauta en una estación espacial y lee esa frase.
- Si te falta información importante para hacer bien tu trabajo, pregunta antes de producir (preguntar_al_jefe); es mejor una pregunta que una pieza que no se va a usar. Ofrece opciones concretas cuando sea posible.
- Pide autorización (pedir_autorizacion) antes de cualquier acción que gaste dinero, publique, o contacte al cliente.
- Lee la MEMORIA y las campañas anteriores (abajo): son preferencias reales del jefe y del cliente; respétalas. Cuando aprendas algo que servirá en futuras campañas (algo que al jefe o al cliente le gusta o no), guárdalo con guardar_memoria en una frase clara.
- Tienes una computadora con carpetas (ver_archivos, leer_archivo, ver_imagen, guardar_nota). El jefe puede subirte archivos (logo, fotos, audio, PDF) a tu carpeta "subidos": si necesitas un logo u otro material, pídeselo con preguntar_al_jefe y después revisa ver_archivos y mira las imágenes con ver_imagen. Tus compañeros y el jefe pueden leer lo que guardes, y tú puedes leer lo suyo y la carpeta "compartido" de la campaña. Apóyate en el trabajo ya hecho antes de rehacerlo.
- Escribe siempre en español.`;

function systemFor(agent, campaign) {
  const cl = db.clients.find((c) => c.id === campaign.clientId);
  const mem = memoryText(campaign.clientId, campaign.id);
  const guia = ['video', 'editor2', 'director'].includes(agent.id) ? `\n\n${videoGuide(cl?.estilosVideo || [], cl?.videoPrefs || {})}${agent.id === 'editor2' && hfDisponible() ? `\n\n${hfGuide()}` : ''}${agent.id === 'editor2' && remotionDisponible() ? `\n\n${remotionGuide()}` : ''}` : '';
  const archivos = resumenParaAgentes(cl?.id);
  const cursos = aprendizajes(agent.id);
  return `${REGLAS}\n\n${agent.prompt}${guia}\n\n${personaText(agent)}\n\nCampaña actual — Cliente: ${campaign.cliente}\n${brandText(cl)}\n\nBrief del jefe:\n${campaign.brief}${campaign.objetivo ? `\n\nObjetivo de esta campaña: ${campaign.objetivo}. Toda pieza debe servir a ese objetivo y a la estrategia de ads de la marca.` : ''}${archivos ? `\n\n${archivos}` : ''}${cursos ? `\n\n${cursos}` : ''}${mem ? `\n\n${mem}` : ''}`;
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
  ver_archivos: {
    description: 'Lista los archivos de una computadora: la tuya (por defecto), la de otro agente (escribe su nombre: Dani, Iris, Teo, Luna, Max, Micho o Rita) o la carpeta "compartido" (brief, respuestas, concepto aprobado y piezas aprobadas de cada campaña). Todos pueden leer todo.',
    input_schema: obj({ espacio: { type: 'string', description: 'id del agente o "compartido"' } }, []),
  },
  ver_imagen: {
    description: 'Mira una imagen (PNG, JPG, WEBP o GIF) de una computadora, por ejemplo el logo o las fotos que el jefe te subió a tu carpeta "subidos".',
    input_schema: obj({ espacio: { type: 'string', description: 'Tu nombre o el de otro agente; por defecto la tuya' }, ruta: { type: 'string', description: 'p. ej. subidos/logo.png' } }, ['ruta']),
  },
  leer_archivo: {
    description: 'Lee un archivo de texto de una computadora (la tuya, la de otro agente o "compartido"). Úsalo para apoyarte en el trabajo de tus compañeros (por ejemplo, el copy aprobado o la investigación).',
    input_schema: obj({ espacio: { type: 'string' }, ruta: { type: 'string', description: 'ruta tal como la devuelve ver_archivos' } }, ['espacio', 'ruta']),
  },
  guardar_nota: {
    description: 'Guarda una nota o borrador en TU computadora (carpeta notas/), para que tus compañeros y el jefe puedan leerla.',
    input_schema: obj({ nombre: { type: 'string', description: 'nombre del archivo, ej. ideas-reel.md' }, contenido: { type: 'string' } }, ['nombre', 'contenido']),
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
  entregar_hyperframes: {
    description: 'Entrega un video PREMIUM hecho con HyperFrames: tú escribes el HTML de la composición (1080×1920) y el servidor lo valida, renderiza, le mezcla voz y música y lo manda al jefe para aprobación. Si hay errores te los devuelve para que los corrijas. Puede tardar unos minutos.',
    input_schema: obj({
      titulo: { type: 'string' }, descripcion: { type: 'string', description: 'Qué muestra el video y qué estilo usaste' },
      html: { type: 'string', description: 'El archivo index.html completo de la composición' },
      archivos: { type: 'array', description: 'Archivos de tu computadora (p. ej. el logo en subidos/) que tu video usa; se copian al proyecto como assets/<nombre>', items: obj({ ruta: { type: 'string' }, nombre: { type: 'string' } }, ['ruta', 'nombre']) },
      bloques: { type: 'array', description: 'Nombres de bloques del registro que tu HTML usa (el servidor los instala)', items: { type: 'string' } },
      narraciones: { type: 'array', description: 'Voz en off: texto hablado y segundo de inicio', items: obj({ inicio: { type: 'number' }, texto: { type: 'string' } }, ['inicio', 'texto']) },
      musicaPrompt: { type: 'string', description: 'Estilo de la música instrumental (inglés, sin artistas)' },
      tomas: { type: 'array', description: 'Tomas de stock a descargar', items: obj({ id: { type: 'string' }, busqueda: { type: 'string' }, duracion: { type: 'number' } }, ['id', 'busqueda']) },
      version: { type: 'number' },
    }, ['titulo', 'html']),
  },
  entregar_remotion: {
    description: 'Entrega un video hecho con REMOTION (React): tú escribes el componente TSX (1080×1920, 30 fps) y el servidor lo compila, renderiza, le mezcla voz y música y lo manda al jefe para aprobación. Si hay errores te los devuelve para que los corrijas. Puede tardar unos minutos.',
    input_schema: obj({
      titulo: { type: 'string' }, descripcion: { type: 'string' },
      codigo: { type: 'string', description: 'El archivo Comp.tsx completo (export default function Comp)' },
      archivos: { type: 'array', description: 'Archivos de tu computadora que usa el video; se copian a public/<nombre> (usa staticFile)', items: obj({ ruta: { type: 'string' }, nombre: { type: 'string' } }, ['ruta', 'nombre']) },
      duracion: { type: 'number', description: 'Duración total en segundos (3 a 60)' },
      narraciones: { type: 'array', items: obj({ inicio: { type: 'number' }, texto: { type: 'string' } }, ['inicio', 'texto']) },
      musicaPrompt: { type: 'string' },
      tomas: { type: 'array', items: obj({ id: { type: 'string' }, busqueda: { type: 'string' }, duracion: { type: 'number' } }, ['id', 'busqueda']) },
      version: { type: 'number' },
    }, ['titulo', 'codigo', 'duracion']),
  },
  buscar_bloques: {
    description: 'Busca en el registro de ~450 bloques listos de HyperFrames (partículas, zoom, cámara, transiciones, glitch, títulos). Escribe palabras en inglés.',
    input_schema: obj({ consulta: { type: 'string' } }, ['consulta']),
  },
  ver_bloque: {
    description: 'Lee un bloque del registro: sus archivos y cómo montarlo en tu composición.',
    input_schema: obj({ nombre: { type: 'string' } }, ['nombre']),
  },
  ver_estilo_pelicula: {
    description: 'Lee la guía de dirección de arte de uno de los 66 estilos de película (Lemo Opuscar) para aplicarla en tu composición HyperFrames.',
    input_schema: obj({ slug: { type: 'string', description: 'El identificador del estilo, p. ej. art-deco' } }, ['slug']),
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
  const names = ['estado', 'preguntar_al_jefe', 'pedir_autorizacion', 'guardar_memoria', 'ver_archivos', 'leer_archivo', 'ver_imagen', 'guardar_nota'];
  if (byId[agentId].puedeEntregar) names.push('entregar_pieza');
  if (agentId === 'editor2' && hfDisponible()) names.push('entregar_hyperframes', 'ver_estilo_pelicula', 'buscar_bloques', 'ver_bloque');
  if (agentId === 'editor2' && remotionDisponible()) names.push('entregar_remotion');
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
    case 'ver_archivos': return ws.resumenListado(i.espacio ? i.espacio : job.agentId);
    case 'ver_imagen': { const im = ws.imagenParaVer(i.espacio || job.agentId, i.ruta || ''); return [{ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } }, { type: 'text', text: `Imagen ${i.ruta}` }]; }
    case 'leer_archivo': return ws.leer(i.espacio || job.agentId, i.ruta || '');
    case 'guardar_nota': { const n = String(i.nombre || 'nota.md'); return `Guardado en ${ws.escribir(job.agentId, `notas/${/\.[a-z]+$/i.test(n) ? n : `${n}.md`}`, i.contenido || '')}`; }
    case 'entregar_pieza':
      if (!i.contenido || !i.tipo) throw new Error('Faltan tipo o contenido de la pieza');
      return a.entregar(i);
    case 'entregar_hyperframes':
      if (!i.html) throw new Error('Falta el html de la composición');
      return a.entregarHF(i);
    case 'entregar_remotion':
      if (!i.codigo) throw new Error('Falta el código del componente');
      return a.entregarRemotion(i);
    case 'buscar_bloques': return buscarBloques(i.consulta);
    case 'ver_bloque': return verBloque(i.nombre);
    case 'ver_estilo_pelicula': return estiloPelicula(i.slug);
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

// Cuántas campañas pueden trabajar a la vez (cada una gasta API en paralelo). MAX_CAMPANAS, por defecto 3.
const MAX_CAMPANAS = Math.max(1, Number(process.env.MAX_CAMPANAS || 3));
let campanasActivas = 0; const esperandoTurno = [];
async function tomarTurno(job) {
  const camp = db.campaigns.find((c) => c.id === job.campaignId);
  if (campanasActivas >= MAX_CAMPANAS) {
    if (camp) { camp.enCola = true; save(); bus.emit('campaign', camp); }
    await new Promise((ok) => esperandoTurno.push(ok));
    if (camp) { camp.enCola = false; save(); bus.emit('campaign', camp); }
  }
  campanasActivas++;
}
function soltarTurno() { campanasActivas = Math.max(0, campanasActivas - 1); esperandoTurno.shift()?.(); }

export function runJob(job) {
  if (job.estado === 'terminado') return Promise.resolve(job.resultado);
  if (running.has(job.id)) return running.get(job.id);
  const raiz = job.agentId === 'director' && !job.parentJobId; // la tarea principal de una campaña
  const p = (async () => {
    if (raiz) await tomarTurno(job);
    try { return await withAgent(job.agentId, () => loop(job), job.campaignId); } finally { if (raiz) soltarTurno(); }
  })().finally(() => running.delete(job.id));
  running.set(job.id, p);
  return p;
}

const textOf = (content) => (Array.isArray(content) ? content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim() : String(content || ''));

async function loop(job) {
  const campaign = db.campaigns.find((c) => c.id === job.campaignId);
  const agent = byId[job.agentId];
  if (!campaign || !agent) throw new Error('Campaña o agente inexistente');
  job.estado = 'activo'; job.error = null;
  // Las instrucciones NO pueden cambiar a mitad de una tarea (la API lo rechaza):
  // se fijan una sola vez, con la memoria y el historial de ese momento.
  if (!job.system) { job.system = systemFor(agent, campaign); save(); }
  setAgent(job.agentId, { estado: 'trabajando', burbuja: job.messages.length > 1 ? 'Retomando donde me quedé…' : 'Empezando…', campaignId: campaign.id });
  try { ws.tareaActual(job.agentId, job, campaign.cliente, job.messages.length > 1 ? 'Retomada tras un reinicio' : 'Empezando'); } catch {}
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
            return { type: 'tool_result', tool_use_id: b.id, content: await (async () => { const o = await runTool(job, b, campaign); return Array.isArray(o) ? o : (String(o) || 'ok'); })() };
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
        // Si una conversación vieja quedó con "pensamientos" que ya no coinciden
        // (por ejemplo, tras una actualización), la API los descarta y sigue.
        thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
        betas: ['server-side-fallback-2026-07-01', 'thinking-binding-controls-2026-08-01'],
        fallbacks: 'default',
        system: job.system,
        tools: toolDefs(job.agentId),
        messages: withRefs(job, campaign),
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
    // Si el agente sigue trabajando en OTRA campaña, no lo marques como libre
    const otro = [...running.keys()].map((id) => db.jobs.find((j) => j.id === id)).find((j) => j && j.id !== job.id && j.agentId === job.agentId);
    if (otro) setAgent(job.agentId, { estado: 'trabajando', campaignId: otro.campaignId });
    else setAgent(job.agentId, { estado: 'libre', burbuja: '', campaignId: null });
  }
}

// Diseñadora y video "ven" las imágenes de referencia del cliente. Se agregan al
// enviar (no se guardan en la base de datos) y siempre las mismas en toda la tarea.
function withRefs(job, campaign) {
  if (!['disenador', 'video', 'editor2'].includes(job.agentId)) return job.messages;
  if (!job.refs) {
    job.refs = imagenesReferencia(campaign.clientId).map((i) => i.ruta);
    save();
  }
  if (!job.refs.length) return job.messages;
  const imgs = imagenesReferencia(campaign.clientId, 8).filter((i) => job.refs.includes(i.ruta));
  if (!imgs.length) return job.messages;
  const [first, ...rest] = job.messages;
  const content = [
    ...imgs.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.media_type, data: i.data } })),
    { type: 'text', text: `Imágenes de referencia del cliente (${imgs.map((i) => i.ruta).join(', ')}): úsalas para captar su estilo visual.\n\n${typeof first.content === 'string' ? first.content : textOf(first.content)}` },
  ];
  return [{ role: 'user', content }, ...rest];
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
  try { const c = db.campaigns.find((x) => x.id === job.campaignId); ws.resultado(job.agentId, c?.cliente || 'campaña', job.resultado); ws.tareaActual(job.agentId, job, c?.cliente || '', `✅ Terminada. ${job.resultado.slice(0, 300)}`); } catch {}
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
export async function chatWithAgent(agentId, mensaje, contexto, extra = {}) {
  const agent = byId[agentId];
  const system = `${REGLAS}\n\n${agent.prompt}\n\nEl jefe te habla directamente por el chat de la oficina. Responde breve, en personaje.\nLo que el sistema puede hacer HOY (sé preciso: no digas que no puedes algo que sí está disponible):\n${extra.capacidades || ''}\n\nSi el jefe te pide producir algo (un video, un arte, un copy) usa la herramienta crear_campana: el equipo hará sus preguntas, la junta creativa y el concepto antes de producir. No prometas entregar la pieza en este chat. Clientes existentes: ${(extra.clientes || []).join(', ') || '(ninguno)'}.\nLo último que hiciste:\n${contexto}`;
  const tools = extra.crearCampana ? [{ name: 'crear_campana', description: 'Crea una campaña nueva para que el equipo la produzca (cuestionario, junta, concepto y piezas).', input_schema: obj({ cliente: { type: 'string', description: 'Nombre del cliente (existente o nuevo)' }, brief: { type: 'string', description: 'Qué pidió el jefe, con todos los detalles útiles' }, objetivo: { type: 'string', enum: ['reconocimiento', 'trafico', 'leads', 'ventas', 'fidelizacion', 'lanzamiento', 'comunidad'] } }, ['cliente', 'brief']) }] : undefined;
  const messages = [{ role: 'user', content: mensaje }];
  let texto = '';
  for (let k = 0; k < 3; k++) {
    const res = await client.messages.create({ model: MODEL, max_tokens: 2000, output_config: { effort: 'low' }, system, tools, messages });
    addUsage(null, MODEL, res.usage, agentId);
    texto = textOf(res.content) || texto;
    const usos = res.content.filter((b) => b.type === 'tool_use');
    if (!usos.length) break;
    messages.push({ role: 'assistant', content: res.content });
    const salida = [];
    for (const u of usos) {
      let r;
      try { const c = extra.crearCampana(u.input); r = `Campaña creada (${c.cliente}). El equipo ya empezó: pronto te harán preguntas.`; } catch (e) { r = `No se pudo crear la campaña: ${e.message}`; }
      salida.push({ type: 'tool_result', tool_use_id: u.id, content: r });
    }
    messages.push({ role: 'user', content: salida });
  }
  return texto;
}

// ---------- Cursos: el agente investiga en internet y regresa con apuntes ----------
export const estudiarCuesta = 'US$0.10–0.50';
export async function estudiar(agent, tema) {
  const messages = [{ role: 'user', content: `Toma este curso de actualización: "${tema}".
Investiga en internet (prioriza fuentes de 2025-2026) las técnicas, herramientas, formatos y tendencias más actuales que sirvan para TU trabajo en la agencia (${agent.rol}).
Al terminar responde ÚNICAMENTE con un JSON así:
{"apuntes": ["8 a 10 aprendizajes concretos y accionables, en español"], "skills": [{"nombre": "habilidad nueva o mejorada", "nivel": 60-95}], "fuentes": ["https://..."]}` }];
  for (let k = 0; k < 6; k++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      system: `${REGLAS}\n\nEres ${agent.nombre}, ${agent.rol} de la agencia.\n${personaText(agent)}`,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
      messages,
    });
    addUsage(null, MODEL, res.usage, agent.id);
    if (res.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: res.content }); continue; }
    if (res.stop_reason === 'refusal') throw new Error('El modelo no pudo completar el curso.');
    return parseCurso(textOf(res.content));
  }
  throw new Error('El curso tardó demasiado');
}
