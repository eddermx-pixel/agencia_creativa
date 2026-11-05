// Agentes reales: cada uno es Claude con su propio rol y herramientas.
// El director usa "asignar_tarea", que despierta a otro agente y le espera.
import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { ROSTER, byId } from './roster.js';
import { setAgent, log, addUsage, brandText } from './hub.js';
import { db } from './store.js';
import { makeActions, withAgent } from './actions.js';

const client = new Anthropic();
const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const EFFORT = process.env.CLAUDE_EFFORT || 'medium';

const REGLAS = `Trabajas en una agencia de marketing operada por agentes de IA. El "jefe" es el dueño de la agencia (humano).
- Usa la herramienta estado cada vez que empieces algo nuevo, con una frase corta en primera persona ("Buscando referencias de color…"). El jefe te ve como un personaje en una oficina y lee esa frase.
- Pregunta al jefe (preguntar_al_jefe) solo cuando una decisión importante dependa de él. Ofrece opciones concretas cuando sea posible.
- Pide autorización (pedir_autorizacion) antes de cualquier acción que gaste dinero, publique, o contacte al cliente.
- Escribe siempre en español.`;

function systemFor(agent, campaign) {
  const client = db.clients.find((c) => c.id === campaign.clientId);
  return `${REGLAS}\n\n${agent.prompt}\n\nCampaña actual — Cliente: ${campaign.cliente}\n${brandText(client)}\n\nBrief del jefe:\n${campaign.brief}`;
}

function toolsFor(agentId, campaign) {
  const a = makeActions(agentId, campaign);
  const agent = byId[agentId];
  const tools = [
    betaTool({
      name: 'estado',
      description: 'Actualiza la frase que el jefe ve sobre tu personaje (qué estás haciendo ahora).',
      inputSchema: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'], additionalProperties: false },
      run: ({ texto }) => a.estado(texto),
    }),
    betaTool({
      name: 'preguntar_al_jefe',
      description: 'Camina hasta el escritorio del jefe y le hace una pregunta. Espera su respuesta (puede tardar). Usa opciones cuando haya alternativas claras.',
      inputSchema: {
        type: 'object',
        properties: {
          pregunta: { type: 'string' },
          opciones: { type: 'array', items: { type: 'string' }, description: 'De 2 a 4 respuestas posibles (opcional)' },
        },
        required: ['pregunta'],
        additionalProperties: false,
      },
      run: ({ pregunta, opciones }) => a.preguntar(pregunta, opciones || []),
    }),
    betaTool({
      name: 'pedir_autorizacion',
      description: 'Pide autorización al jefe antes de una acción sensible (gastar, publicar, contactar al cliente). Devuelve AUTORIZADO o NO AUTORIZADO.',
      inputSchema: {
        type: 'object',
        properties: { accion: { type: 'string' }, detalle: { type: 'string' } },
        required: ['accion'],
        additionalProperties: false,
      },
      run: ({ accion, detalle }) => a.autorizar(accion, detalle || ''),
    }),
  ];

  if (agent.puedeEntregar) {
    tools.push(betaTool({
      name: 'entregar_pieza',
      description: 'Sube una pieza al feed del jefe, que la aprueba o rechaza deslizando. Espera su decisión y devuelve APROBADA o RECHAZADA con su comentario.',
      inputSchema: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['arte', 'video', 'texto'] },
          titulo: { type: 'string' },
          descripcion: { type: 'string', description: 'Qué es y por qué funciona, en 1-2 frases' },
          contenido: { type: 'string', description: 'arte: SVG completo · video: documento HTML completo · texto: el texto' },
          version: { type: 'integer' },
        },
        required: ['tipo', 'titulo', 'contenido'],
        additionalProperties: false,
      },
      run: (input) => a.entregar(input),
    }));
  }

  if (agentId === 'director') {
    const equipo = ROSTER.filter((x) => x.id !== 'director');
    tools.push(betaTool({
      name: 'asignar_tarea',
      description: `Asigna una tarea a un miembro del equipo y espera su resultado. Equipo: ${equipo.map((x) => `${x.id} (${x.nombre}, ${x.rol})`).join('; ')}. Puedes asignar varias tareas a la vez a agentes distintos.`,
      inputSchema: {
        type: 'object',
        properties: {
          agente: { type: 'string', enum: equipo.map((x) => x.id) },
          instrucciones: { type: 'string', description: 'Tarea completa con todo el contexto necesario' },
        },
        required: ['agente', 'instrucciones'],
        additionalProperties: false,
      },
      run: ({ agente, instrucciones }) => runAgent(agente, instrucciones, campaign),
    }));
  }
  return tools;
}

export async function runAgent(agentId, task, campaign) {
  return withAgent(agentId, async () => {
    const agent = byId[agentId];
    setAgent(agentId, { estado: 'trabajando', burbuja: 'Empezando…', campaignId: campaign.id });
    log(agentId, `Nueva tarea: ${task.slice(0, 200)}`, campaign.id);
    try {
      const runner = client.beta.messages.toolRunner({
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: EFFORT },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: systemFor(agent, campaign),
        tools: toolsFor(agentId, campaign),
        messages: [{ role: 'user', content: task }],
      });
      // Cada vuelta del ciclo es una llamada a la API: sumamos su costo.
      let final;
      for await (const msg of runner) {
        addUsage(campaign.id, MODEL, msg.usage);
        final = msg;
      }
      if (final.stop_reason === 'refusal') {
        log(agentId, 'No pude completar esta tarea (rechazada por las políticas del modelo).', campaign.id);
        return 'El agente no pudo completar la tarea.';
      }
      const text = final.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      log(agentId, `Terminé: ${text.slice(0, 300)}`, campaign.id);
      return text || 'Tarea terminada.';
    } catch (err) {
      log(agentId, `Error: ${err.message}`, campaign.id);
      return `Error del agente: ${err.message}`;
    } finally {
      setAgent(agentId, { estado: 'libre', burbuja: '', campaignId: null });
    }
  });
}

export async function runCampaign(campaign) {
  return runAgent('director', `Nueva campaña para ${campaign.cliente}. Organiza al equipo y entrega las piezas.`, campaign);
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
  return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}
