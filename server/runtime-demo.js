// Modo demo: el equipo trabaja con guiones de ejemplo (sin gastar API).
// Sirve para ver la oficina, las aprobaciones, Telegram y el feed funcionando.
import { setAgent, log, startMeeting, addAporte, endMeeting } from './hub.js';
import { ROSTER } from './roster.js';
import { makeActions, withAgent } from './actions.js';
import { db, expirePending } from './store.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const PALETAS = [
  { fondo1: '#ff6b6b', fondo2: '#feca57', texto: '#1e1e1e', acento: '#ffffff' },
  { fondo1: '#0f2027', fondo2: '#2c5364', texto: '#ffffff', acento: '#00d2d3' },
  { fondo1: '#1a1a1a', fondo2: '#3d3d3d', texto: '#f5e6c8', acento: '#d4af37' },
  { fondo1: '#6c5ce7', fondo2: '#a29bfe', texto: '#ffffff', acento: '#ffeaa7' },
];

// Texto oscuro o claro según el fondo, para que siempre se lea.
const contraste = (hex) => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#1e1e1e' : '#ffffff';
};
function paletasDe(client) {
  const c = client?.colores || [];
  if (!c.length) return PALETAS;
  const propia = { fondo1: c[0], fondo2: c[1] || c[0], texto: contraste(c[0]), acento: c[2] || contraste(c[0]) };
  const invertida = { fondo1: c[1] || c[0], fondo2: c[0], texto: contraste(c[1] || c[0]), acento: c[2] || c[0] };
  return [propia, invertida, ...PALETAS];
}

function arteSVG({ cliente, titular, sub, cta, pal, logo }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" width="1080" height="1350">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pal.fondo1}"/><stop offset="1" stop-color="${pal.fondo2}"/></linearGradient></defs>
<rect width="1080" height="1350" fill="url(#g)"/>
<circle cx="900" cy="230" r="260" fill="${pal.acento}" opacity=".18"/>
<circle cx="140" cy="1180" r="200" fill="${pal.acento}" opacity=".14"/>
${logo ? '<image href="{{LOGO}}" x="90" y="80" width="220" height="110" preserveAspectRatio="xMinYMid meet"/>' : `<text x="90" y="150" font-family="Arial" font-weight="700" font-size="42" letter-spacing="6" fill="${pal.texto}" opacity=".8">${esc(cliente.toUpperCase())}</text>`}
<text font-family="Impact, Arial Black, Arial" font-size="138" fill="${pal.texto}">
${titular.split('\n').map((l, i) => `<tspan x="90" y="${520 + i * 150}">${esc(l)}</tspan>`).join('')}
</text>
<text x="90" y="${560 + titular.split('\n').length * 150}" font-family="Arial" font-size="48" fill="${pal.texto}" opacity=".9">${esc(sub)}</text>
<rect x="90" y="1110" rx="48" width="560" height="110" fill="${pal.acento}"/>
<text x="370" y="1182" text-anchor="middle" font-family="Arial" font-weight="700" font-size="46" fill="${pal.fondo1}">${esc(cta)}</text>
</svg>`;
}

function videoHTML({ cliente, escenas, cta, pal, logo }) {
  const n = escenas.length + 1;
  const dur = n * 3;
  const step = 100 / n;
  const scenes = [...escenas, cta].map((t, i) => `<div class="s" style="animation-delay:${i * 3}s"><span>${esc(t)}</span></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1080px;height:1920px;overflow:hidden;font-family:Arial,Helvetica,sans-serif}
body{background:linear-gradient(160deg,${pal.fondo1},${pal.fondo2});background-size:200% 200%;animation:bg ${dur}s ease-in-out infinite}
@keyframes bg{0%,100%{background-position:0 0}50%{background-position:100% 100%}}
.brand{position:absolute;top:120px;left:0;right:0;text-align:center;color:${pal.texto};font-size:44px;letter-spacing:10px;font-weight:700;opacity:.85}
.s{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 90px;opacity:0;animation:sc ${dur}s infinite}
.s span{color:${pal.texto};font-size:120px;font-weight:900;line-height:1.05;text-align:center;text-transform:uppercase}
.s:last-child span{background:${pal.acento};color:${pal.fondo1};padding:40px 60px;border-radius:60px;font-size:96px}
@keyframes sc{0%{opacity:0;transform:scale(.7) translateY(80px)}${(step * 0.15).toFixed(2)}%{opacity:1;transform:none}${(step * 0.85).toFixed(2)}%{opacity:1;transform:none}${step.toFixed(2)}%{opacity:0;transform:scale(1.15)}100%{opacity:0}}
.bar{position:absolute;bottom:0;left:0;height:14px;background:${pal.acento};animation:bar ${dur}s linear infinite}
@keyframes bar{from{width:0}to{width:100%}}
.blob{position:absolute;width:700px;height:700px;border-radius:50%;background:${pal.acento};opacity:.15;animation:blob 6s ease-in-out infinite alternate}
@keyframes blob{to{transform:translate(300px,900px) scale(1.4)}}
</style></head><body><div class="blob"></div><div class="brand">${logo ? '<img src="{{LOGO}}" style="height:140px;max-width:600px;object-fit:contain">' : esc(cliente.toUpperCase())}</div>${scenes}<div class="bar"></div></body></html>`;
}

async function trabajar(agentId, campaign, pasos) {
  const a = makeActions(agentId, campaign);
  for (const p of pasos) {
    await a.estado(p);
    await sleep(2200 + Math.random() * 1800);
  }
  return a;
}

async function demoAgent(agentId, campaign, fn) {
  return withAgent(agentId, async () => {
    setAgent(agentId, { estado: 'trabajando', burbuja: 'Empezando…', campaignId: campaign.id });
    try {
      return await fn();
    } finally {
      setAgent(agentId, { estado: 'libre', burbuja: '', campaignId: null });
    }
  });
}

// Entrega en bucle: si el jefe rechaza, el agente rehace con otra versión.
async function entregarHastaAprobar(a, make) {
  for (let v = 1; v <= 4; v++) {
    const pieza = make(v);
    const res = await a.entregar({ ...pieza, version: v });
    if (res.startsWith('APROBADA')) return v;
    await a.estado(`Ok, hago la versión ${v + 1}…`);
    await sleep(3000);
  }
  return null;
}

// Conceptos de ejemplo: si rechazas uno, el equipo propone otro distinto.
const CONCEPTOS = [
  { titulo: 'Lo que buscabas ya llegó', idea: '{cliente} como la respuesta a lo que tu público ya estaba buscando.', mensaje: 'Calidad y buen precio, por tiempo limitado.',
    credito: 'titular de Teo, paleta cálida de Luna, gancho de pregunta de Max.', titular: 'LO QUE\nBUSCABAS\nYA LLEGÓ', sub: 'Calidad y buen precio, solo esta semana', cta: 'ESCRÍBENOS HOY',
    escenas: ['¿Todavía no lo tienes?', 'Llegó lo nuevo', 'Calidad + buen precio'], ctaVideo: 'Pídelo hoy' },
  { titulo: 'El ritual de la semana', idea: 'Convertir la promoción en un ritual que la gente espera cada semana, con cuenta regresiva.', mensaje: 'Tu cita favorita de la semana ya tiene día.',
    credito: 'insight de Iris (la gente repite lo que se vuelve costumbre), cuenta regresiva de Max, copy de Teo.', titular: 'TU CITA\nFAVORITA\nDE LA SEMANA', sub: 'Aparta el día: la promo vuelve cada semana', cta: 'APÁRTALO YA',
    escenas: ['3…', '2…', '1…', '¡Hoy es el día!'], ctaVideo: 'Te esperamos' },
  { titulo: 'Detrás del mostrador', idea: 'Mostrar el proceso y a las personas detrás del producto: honestidad y cercanía.', mensaje: 'Hecho a mano, hecho hoy, hecho para ti.',
    credito: 'idea de Luna (fotos de proceso en ilustración), testimonio de Iris, revisión de claims de Rita.', titular: 'HECHO HOY,\nHECHO PARA\nTI', sub: 'Así se prepara lo que te llevas a casa', cta: 'VEN A PROBARLO',
    escenas: ['5:00 a.m.', 'Manos a la obra', 'Recién hecho', 'Para ti'], ctaVideo: 'Ven hoy' },
];

const IDEAS = {
  investigador: [
    'El público responde a reels cortos con humor y ofertas claras. Idea: usar comentarios reales de clientes. Riesgo: prometer de más.',
    'Lo que se vuelve costumbre se repite: un día fijo de promo genera hábito. Idea: "el día de…". Riesgo: que canse si no cambia el contenido.',
    'Se confía más en lo que se ve hacer. Idea: mostrar el proceso real. Riesgo: que parezca improvisado.',
  ],
  copy: [
    'Titular: "Lo que buscabas ya llegó". Alterno: "No es antojo, es destino". Riesgo: sonar genérico si no decimos qué es.',
    'Titular: "Tu cita favorita de la semana". Alterno: "Martes de los buenos". Me encanta el juego de palabras con la cita.',
    'Titular: "Hecho hoy, hecho para ti". Alterno: "Del horno a tu mesa". Corto y honesto.',
  ],
  disenador: [
    'Paleta cálida con el color de la marca, titular gigante y mucho aire. Nada de saturar con estrellas y sellos.',
    'Calendario visual con el día marcado en grande; tipografía bold y un solo color de acento.',
    'Ilustraciones del proceso en línea fina, fondo crema y el logo pequeño pero claro.',
  ],
  video: [
    '¡Gancho con pregunta en el segundo 1! "¿Todavía no lo tienes?" y cortes rápidos al ritmo. Tendencia: texto que rebota.',
    'Cuenta regresiva 3-2-1 con zoom en cada número. ¡Engancha seguro! Riesgo: que el mensaje llegue tarde.',
    'Timelapse estilizado del proceso de 5 s y cierre con la persona sonriendo. Ritmo lento-rápido.',
  ],
  calidad: [
    'Revisar que "buen precio" no suene a "barato". CTA claro y un solo mensaje por pieza.',
    'Si decimos "cada semana" hay que cumplirlo. Verificar fechas y condiciones de la promo.',
    'Claim "hecho hoy" debe ser verdadero. Ortografía: "recién" lleva acento.',
  ],
};

async function juntaDemo(campaign, ronda, comentario, cliente) {
  const tema = ronda ? `Nueva propuesta tras tus comentarios${comentario ? `: "${comentario}"` : ''}` : `Concepto para ${cliente}`;
  const m = startMeeting({ campaignId: campaign.id, tema, contexto: campaign.brief });
  const equipo = ROSTER.filter((a) => a.id !== 'director');
  for (const a of ROSTER) setAgent(a.id, { estado: 'junta', burbuja: a.id === 'director' ? `Junta: ${tema}`.slice(0, 140) : '🤔 Pensando…', campaignId: campaign.id });
  await sleep(4500); // tiempo para que lleguen a la mesa
  for (const a of equipo) {
    const idea = IDEAS[a.id]?.[ronda % 3] || 'Me sumo a la idea del equipo.';
    const texto = comentario && a.id === 'copy' ? `${idea} (Considerando lo que pidió el jefe: ${comentario}.)` : idea;
    addAporte(m, a.id, texto);
    setAgent(a.id, { burbuja: texto.slice(0, 140) });
    await sleep(2200);
  }
  endMeeting(m);
  await sleep(4000);
  for (const a of equipo) setAgent(a.id, { estado: 'libre', burbuja: '', campaignId: null });
  setAgent('director', { estado: 'trabajando', burbuja: 'Armando el concepto con las ideas del equipo', campaignId: campaign.id });
}

const vivas = new Set();
export const isRunning = (id) => vivas.has(id);

export async function runCampaign(campaign) {
  vivas.add(campaign.id);
  try { return await runCampaignInner(campaign); } finally { vivas.delete(campaign.id); }
}

async function runCampaignInner(campaign) {
  const { cliente } = campaign;
  const director = makeActions('director', campaign);
  const client = db.clients.find((c) => c.id === campaign.clientId);
  const pals = paletasDe(client);
  const logo = !!client?.logo;
  const ctx = { tono: client?.tono || 'Cercano y divertido', pal: 0, titular: '' };

  await demoAgent('director', campaign, async () => {
    await trabajar('director', campaign, ['Leyendo el brief…', 'Anotando lo que falta saber']);

    // FASE 1 · Descubrimiento
    const preguntas = [
      { pregunta: '¿Cuál es el objetivo principal de esta campaña?', opciones: ['Vender más esta semana', 'Dar a conocer un producto nuevo', 'Conseguir mensajes por WhatsApp', 'Ganar seguidores'] },
      { pregunta: '¿Qué piezas necesitas exactamente?', opciones: ['1 post + 1 reel', '3 posts', 'Solo un reel', 'Carrusel de 5 láminas'] },
      { pregunta: '¿Cuál es la oferta o el mensaje que no puede faltar?', opciones: [] },
    ];
    if (!client?.tono) preguntas.push({ pregunta: `¿Qué tono usamos para ${cliente}?`, opciones: ['Cercano y divertido', 'Profesional', 'Premium y elegante'] });
    const resp = await director.cuestionario('Antes de poner a trabajar al equipo quiero confirmar estos puntos', preguntas);
    const tonoResp = /4\. .*\n\s*→ (.*)/.exec(resp)?.[1];
    if (tonoResp && !client?.tono) {
      ctx.tono = tonoResp;
      if (!client?.colores?.length) ctx.pal = /premium|elegante/i.test(ctx.tono) ? 2 : /profesional/i.test(ctx.tono) ? 1 : 0;
    }

    await director.estado('Le paso la investigación a Iris');
    await demoAgent('investigador', campaign, async () => {
      await trabajar('investigador', campaign, [
        `Revisando las redes de ${cliente}`, 'Analizando a la competencia', 'Buscando tendencias de reels', 'Resumiendo hallazgos',
      ]);
      log('investigador', 'Hallazgos: el público responde a reels cortos con humor, ofertas claras y prueba social.', campaign.id);
    });

    // FASE 2 · Junta creativa + concepto. Si lo rechazas, nueva junta y una idea distinta.
    let comentario = '';
    for (let ronda = 0; ronda < CONCEPTOS.length; ronda++) {
      const c = CONCEPTOS[ronda];
      await juntaDemo(campaign, ronda, comentario, cliente);
      await trabajar('director', campaign, ['Armando el concepto con las ideas del equipo']);
      const r = await director.concepto(c.titulo, [
        ronda && comentario ? `Tomé en cuenta tu comentario: "${comentario}".\n` : '',
        `Idea central: ${c.idea.replace('{cliente}', cliente)}`,
        `Mensaje clave: ${c.mensaje}`,
        `Tono: ${ctx.tono}.`,
        `Ideas del equipo: ${c.credito}`,
        '',
        'Piezas a producir:',
        '• Copy del post (titular, texto, CTA y hashtags) — Teo',
        '• Post de feed 4:5 (1080×1350) para Instagram/Facebook — Luna',
        '• Reel 9:16 de 12 s con gancho en los primeros 2 s — Max',
      ].filter((x, i) => i || x).join('\n'));
      if (r.startsWith('CONCEPTO APROBADO')) { Object.assign(ctx, c); break; }
      comentario = (/Cambios pedidos: (.*?)\. Ajusta/.exec(r)?.[1] || '').replace(/^\(sin comentario.*\)$/, '');
      await director.estado('Entendido. Convoco otra junta con tus comentarios…');
      await sleep(2000);
    }
    if (!ctx.titular) Object.assign(ctx, CONCEPTOS[0]);

    await director.estado('Teo, te toca el copy');
    await demoAgent('copy', campaign, async () => {
      const a = await trabajar('copy', campaign, ['Leyendo el concepto aprobado', 'Probando titulares']);
      await trabajar('copy', campaign, [`Escribiendo en tono "${ctx.tono}"`]);
      await entregarHastaAprobar(a, (v) => ({
        tipo: 'texto',
        titulo: `Copy de la campaña v${v}`,
        descripcion: `Tono: ${ctx.tono}`,
        contenido: v === 1
          ? `TITULAR: Lo que estabas buscando ya llegó ✨\n\nCOPY: En ${cliente} preparamos algo especial para ti. Calidad, buen precio y la atención que mereces.\n\nCTA: Escríbenos hoy 👉\n\n#${cliente.replace(/\s/g, '')} #Novedades #OfertaEspecial`
          : `TITULAR: Esto no te lo puedes perder 🔥 (v${v})\n\nCOPY: ${cliente} tiene la promo de la temporada. Pocas unidades, mucha calidad.\n\nCTA: Pide el tuyo hoy\n\n#${cliente.replace(/\s/g, '')} #Promo`,
      }));
    });

    await director.estado('Luna y Max: arte y video en paralelo');
    await Promise.all([
      demoAgent('disenador', campaign, async () => {
        const a = await trabajar('disenador', campaign, ['Eligiendo paleta de colores', 'Bocetando la composición', 'Ajustando tipografía']);
        await entregarHastaAprobar(a, (v) => ({
          tipo: 'arte',
          titulo: `Post feed 4:5 v${v}`,
          descripcion: `Arte principal de la campaña. Tono ${ctx.tono}.`,
          contenido: arteSVG({
            cliente, titular: ctx.titular, sub: ctx.sub, cta: ctx.cta,
            pal: pals[(ctx.pal + v - 1) % pals.length], logo,
          }),
        }));
      }),
      demoAgent('video', campaign, async () => {
        const a = await trabajar('video', campaign, ['Escribiendo el guion del reel', 'Animando escenas', 'Sincronizando el ritmo', 'Exportando']);
        await entregarHastaAprobar(a, (v) => ({
          tipo: 'video',
          titulo: `Reel 9:16 v${v}`,
          descripcion: 'Reel de 12 segundos con gancho, mensaje y CTA.',
          contenido: videoHTML({
            cliente, escenas: ctx.escenas, cta: ctx.ctaVideo,
            pal: pals[(ctx.pal + v - 1) % pals.length], logo,
          }),
        }));
      }),
    ]);

    await demoAgent('calidad', campaign, async () => {
      await trabajar('calidad', campaign, ['Revisando ortografía', 'Verificando formatos y marca']);
      log('calidad', 'Todo OK: textos, formatos 4:5 y 9:16, CTA claro.', campaign.id);
    });

    const ok = await director.autorizar(`¿Programo la publicación de ${cliente} para el lunes a las 9:00?`, 'Post de feed + reel aprobados.');
    await director.estado(ok.startsWith('AUTORIZADO') ? '¡Listo! Campaña programada' : 'Entendido, la dejo en pausa');
    await sleep(2500);
  });
  return 'Campaña demo terminada.';
}

export async function chatWithAgent(agentId) {
  const frases = [
    'Voy a buen ritmo, jefe. Cuando entregue te llega al feed 📱',
    'Todo bajo control. Si necesito algo, voy a tu escritorio.',
    '(Modo demo) Conecta tu API key de Claude y podré responderte de verdad.',
  ];
  return frases[Math.floor(Math.random() * frases.length)];
}

// En modo demo los guiones no se pueden retomar: lo pendiente queda interrumpido.
export function boot() { expirePending(); return []; }
export function retryCampaign(campaign) { return runCampaign(campaign); }
