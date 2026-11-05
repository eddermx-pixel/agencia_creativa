// Modo demo: el equipo trabaja con guiones de ejemplo (sin gastar API).
// Sirve para ver la oficina, las aprobaciones, Telegram y el feed funcionando.
import { setAgent, log } from './hub.js';
import { makeActions, withAgent } from './actions.js';
import { db } from './store.js';

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

export async function runCampaign(campaign) {
  const { cliente } = campaign;
  const director = makeActions('director', campaign);
  const client = db.clients.find((c) => c.id === campaign.clientId);
  const pals = paletasDe(client);
  const logo = !!client?.logo;
  const ctx = { tono: client?.tono || 'Cercano y divertido', pal: 0 };

  await demoAgent('director', campaign, async () => {
    await trabajar('director', campaign, ['Leyendo el brief…', 'Armando el plan de la campaña']);

    await director.estado('Le paso la investigación a Iris');
    await demoAgent('investigador', campaign, async () => {
      await trabajar('investigador', campaign, [
        `Revisando las redes de ${cliente}`, 'Analizando a la competencia', 'Buscando tendencias de reels', 'Resumiendo hallazgos',
      ]);
      log('investigador', 'Hallazgos: el público responde a reels cortos con humor, ofertas claras y prueba social.', campaign.id);
    });

    await director.estado('Teo, te toca el copy');
    await demoAgent('copy', campaign, async () => {
      const a = await trabajar('copy', campaign, ['Leyendo la investigación', 'Probando titulares']);
      if (!client?.tono) {
        const resp = await a.preguntar(`¿Qué tono usamos para ${cliente}?`, ['Cercano y divertido', 'Profesional', 'Premium y elegante']);
        ctx.tono = resp.replace('El jefe respondió: ', '');
        if (!client?.colores?.length) ctx.pal = /premium|elegante/i.test(ctx.tono) ? 2 : /profesional/i.test(ctx.tono) ? 1 : 0;
      } else {
        await a.estado(`Usando el tono del kit de marca: ${client.tono}`);
      }
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
            cliente, titular: 'LO QUE\nBUSCABAS\nYA LLEGÓ', sub: 'Calidad y buen precio, solo esta semana', cta: 'ESCRÍBENOS HOY',
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
            cliente, escenas: ['¿Todavía no lo tienes?', 'Llegó lo nuevo', 'Calidad + buen precio'], cta: 'Pídelo hoy',
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
