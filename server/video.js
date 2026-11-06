// Motor de video v2: guion de video (JSON) + estilos virales + B-roll real de Pexels.
//
// Max entrega un "guion" con escenas; el servidor busca las tomas reales en
// Pexels y el reproductor (public/video-player.js) lo anima con transiciones,
// textos y subtítulos. El video se puede exportar desde el navegador.
import { Readable } from 'node:stream';

// ---------- Estilos virales (formatos probados para reels y TikTok) ----------
export const ESTILOS = [
  { id: 'gancho-pregunta', emoji: '❓', nombre: 'Gancho con pregunta', descripcion: 'Abre con una pregunta que toca un dolor del público y responde rápido con el producto.', porque: 'La pregunta crea curiosidad en los primeros 2 segundos.', ritmo: 'Cortes cada 1.5–2.5 s', transiciones: ['flash', 'corte', 'zoom'], subtitulos: 'palabra', tags: ['general', 'servicios', 'producto'],
    plantilla: [['Pregunta que duele', 'pop', 'flash'], ['Problema en una toma', 'slide', 'corte'], ['La solución: el producto', 'zoom', 'zoom'], ['Beneficio clave', 'pop', 'deslizar']] },
  { id: 'antes-despues', emoji: '🔁', nombre: 'Antes y después', descripcion: 'Muestra la transformación: cómo era sin la marca y cómo es con ella.', porque: 'Las transformaciones son de lo más compartido en Reels.', ritmo: '2 bloques claros con transición marcada', transiciones: ['barrido', 'glitch'], subtitulos: 'bloque', tags: ['belleza', 'hogar', 'fitness', 'servicios'],
    plantilla: [['ANTES', 'slide', 'corte'], ['El problema', 'pop', 'corte'], ['DESPUÉS', 'zoom', 'barrido'], ['El resultado', 'pop', 'fundido']] },
  { id: 'pov', emoji: '👀', nombre: 'POV', descripcion: '"POV: eres…": pone al espectador dentro de una situación con la marca.', porque: 'Formato nativo de TikTok; el espectador se identifica.', ritmo: 'Tomas en primera persona, 2–3 s', transiciones: ['deslizar', 'corte'], subtitulos: 'palabra', tags: ['comida', 'moda', 'lifestyle', 'general'],
    plantilla: [['POV: …', 'typewriter', 'corte'], ['La situación', 'slide', 'deslizar'], ['El momento con la marca', 'pop', 'deslizar']] },
  { id: 'top-3', emoji: '🥇', nombre: 'Top 3 / Lista', descripcion: 'Lista rápida: "3 razones para…", "3 errores que…".', porque: 'La gente se queda hasta el final para ver el número 1.', ritmo: 'Una escena por punto', transiciones: ['zoom', 'flash'], subtitulos: 'palabra', tags: ['educación', 'servicios', 'tecnología', 'general'],
    plantilla: [['3 razones para…', 'pop', 'flash'], ['#3', 'zoom', 'zoom'], ['#2', 'zoom', 'zoom'], ['#1', 'zoom', 'flash']] },
  { id: 'tutorial', emoji: '🧑‍🏫', nombre: 'Tutorial rápido', descripcion: 'Paso a paso de cómo usar el producto o resolver algo en 15 segundos.', porque: 'El microaprendizaje se guarda y se comparte.', ritmo: 'Paso por escena, numerado', transiciones: ['deslizar', 'corte'], subtitulos: 'palabra', tags: ['belleza', 'comida', 'tecnología', 'educación'],
    plantilla: [['Cómo… en 3 pasos', 'pop', 'corte'], ['Paso 1', 'slide', 'deslizar'], ['Paso 2', 'slide', 'deslizar'], ['Paso 3', 'slide', 'deslizar']] },
  { id: 'testimonio', emoji: '🗣️', nombre: 'Testimonio UGC', descripcion: 'Estilo "cliente real": frases de opinión con tomas naturales.', porque: 'Se siente auténtico y genera confianza.', ritmo: 'Tomas naturales de 2.5–3 s', transiciones: ['fundido', 'corte'], subtitulos: 'palabra', tags: ['servicios', 'salud', 'comida', 'general'],
    plantilla: [['"No lo podía creer…"', 'typewriter', 'corte'], ['Lo que vivió', 'slide', 'fundido'], ['Por qué lo recomienda', 'pop', 'fundido']] },
  { id: 'detras-camaras', emoji: '🎬', nombre: 'Detrás de cámaras', descripcion: 'Muestra el proceso, el equipo o cómo se hace el producto.', porque: 'La honestidad y el proceso generan cercanía.', ritmo: 'Tomas de proceso de 2 s', transiciones: ['fundido', 'zoom'], subtitulos: 'bloque', tags: ['comida', 'artesanal', 'moda', 'agencia'],
    plantilla: [['Así lo hacemos', 'pop', 'corte'], ['El proceso', 'slide', 'fundido'], ['Las manos detrás', 'slide', 'fundido'], ['El resultado', 'zoom', 'zoom']] },
  { id: 'cuenta-regresiva', emoji: '⏳', nombre: 'Cuenta regresiva / urgencia', descripcion: '3, 2, 1… para promociones con fecha límite.', porque: 'La urgencia empuja a la acción inmediata.', ritmo: 'Muy rápido: 1 s por número', transiciones: ['flash', 'zoom'], subtitulos: 'bloque', tags: ['promociones', 'retail', 'eventos'],
    plantilla: [['3', 'zoom', 'flash'], ['2', 'zoom', 'flash'], ['1', 'zoom', 'flash'], ['¡Hoy!', 'pop', 'flash']] },
  { id: 'storytelling', emoji: '📖', nombre: 'Storytelling emocional', descripcion: 'Mini historia con emoción: personaje, conflicto, momento feliz con la marca.', porque: 'La emoción se recuerda y se comparte.', ritmo: 'Tomas de 3 s, ritmo pausado', transiciones: ['fundido', 'barrido'], subtitulos: 'palabra', tags: ['familia', 'comida', 'servicios', 'causa'],
    plantilla: [['Había una vez…', 'typewriter', 'fundido'], ['El reto', 'slide', 'fundido'], ['El giro', 'pop', 'barrido'], ['El final feliz', 'zoom', 'fundido']] },
  { id: 'texto-rebota', emoji: '🔤', nombre: 'Texto que rebota', descripcion: 'Frases grandes que rebotan al ritmo sobre tomas dinámicas.', porque: 'Funciona sin audio: se entiende con el teléfono en silencio.', ritmo: 'Frase cada 1.5 s', transiciones: ['zoom', 'deslizar', 'glitch'], subtitulos: 'bloque', tags: ['general', 'moda', 'tecnología', 'promociones'],
    plantilla: [['Frase 1', 'bounce', 'corte'], ['Frase 2', 'bounce', 'zoom'], ['Frase 3', 'bounce', 'deslizar'], ['Frase 4', 'bounce', 'glitch']] },
];
export const estiloById = Object.fromEntries(ESTILOS.map((e) => [e.id, e]));

export const TRANSICIONES = ['corte', 'fundido', 'deslizar', 'zoom', 'barrido', 'glitch', 'flash'];
export const ANIMACIONES = ['pop', 'slide', 'typewriter', 'zoom', 'bounce'];
export const FORMATOS = { '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080], '16:9': [1920, 1080] };

// Sugerencia simple por rubro (cuando no hay IA disponible)
export function sugerirEstilos(cliente = {}) {
  const t = `${cliente.rubro || ''} ${cliente.publico || ''} ${cliente.tono || ''}`.toLowerCase();
  const score = (e) => e.tags.reduce((n, tag) => n + (t.includes(tag) ? 3 : 0), 0) + (e.tags.includes('general') ? 1 : 0)
    + (/premium|elegante/.test(t) && ['storytelling', 'detras-camaras'].includes(e.id) ? 2 : 0)
    + (/divertid|juvenil/.test(t) && ['pov', 'texto-rebota'].includes(e.id) ? 2 : 0)
    + (/pan|comida|restaurant|caf/.test(t) && ['detras-camaras', 'pov', 'tutorial'].includes(e.id) ? 2 : 0);
  return [...ESTILOS].sort((a, b) => score(b) - score(a)).slice(0, 3).map((e) => e.id);
}

// Instrucciones para Max (y para quien arme videos)
export function videoGuide(estilosCliente = []) {
  const elegidos = estilosCliente.map((id) => estiloById[id]).filter(Boolean);
  return `GUION DE VIDEO (motor v2). Entrega cada video con entregar_pieza tipo "video" y en "contenido" un JSON válido (sin comentarios ni texto extra) con esta forma:
{
  "formato": "9:16" | "4:5" | "1:1" | "16:9",
  "estilo": id del estilo,
  "paleta": { "fondo": "#hex", "texto": "#hex", "acento": "#hex" },
  "fuente": "Impact" | "Arial Black" | "Georgia" | "Helvetica",
  "subtitulos": "palabra" (resalta palabra por palabra, estilo TikTok) | "bloque" | "ninguno",
  "escenas": [
    { "duracion": 1-6 (segundos),
      "fondo": { "tipo": "broll", "busqueda": "toma real en INGLÉS, concreta y visual (ej. 'woman smiling eating fresh bread', 'barista pouring latte art close up')" }
             | { "tipo": "color" } | { "tipo": "archivo", "ruta": "carpeta/archivo del cliente" },
      "texto": "texto grande en pantalla (máx. 7 palabras)",
      "subtitulo": "lo que diría una voz en off (opcional)",
      "animacion": ${ANIMACIONES.map((a) => `"${a}"`).join(' | ')},
      "transicion": ${TRANSICIONES.map((a) => `"${a}"`).join(' | ')} (cómo ENTRA esta escena),
      "logo": true|false }
  ],
  "cierre": { "cta": "llamado a la acción corto", "logo": true }
}
Reglas: 10 a 25 segundos en total; 4 a 8 escenas; gancho fuerte en la escena 1 (máx. 2 s); usa B-roll real en la mayoría de las escenas, con búsquedas variadas y concretas; texto corto y legible; colores de la marca. El sistema busca las tomas reales y pone el logo.
ESTILOS VIRALES DISPONIBLES: ${ESTILOS.map((e) => `${e.id} (${e.nombre}: ${e.descripcion} Ritmo: ${e.ritmo}. Transiciones: ${e.transiciones.join(', ')})`).join(' · ')}
${elegidos.length ? `ESTILOS QUE ELIGIÓ ESTE CLIENTE (úsalos primero): ${elegidos.map((e) => e.nombre).join(', ')}.` : ''}`;
}

// ---------- Validación del guion ----------
const clampN = (v, a, b, d) => (Number.isFinite(+v) ? Math.min(b, Math.max(a, +v)) : d);
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : d);
export function normalizeSpec(input) {
  let s = input;
  if (typeof s === 'string') {
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('El contenido del video debe ser el guion en JSON.');
    s = JSON.parse(m[0]);
  }
  const escenas = (Array.isArray(s.escenas) ? s.escenas : []).slice(0, 12).map((e) => ({
    duracion: clampN(e.duracion, 0.8, 8, 2.5),
    fondo: e.fondo?.tipo === 'broll' ? { tipo: 'broll', busqueda: String(e.fondo.busqueda || '').slice(0, 120), clip: e.fondo.clip || null }
      : e.fondo?.tipo === 'archivo' ? { tipo: 'archivo', ruta: String(e.fondo.ruta || '').slice(0, 300) } : { tipo: 'color' },
    texto: String(e.texto || '').slice(0, 90),
    subtitulo: String(e.subtitulo || '').slice(0, 200),
    animacion: ANIMACIONES.includes(e.animacion) ? e.animacion : 'pop',
    transicion: TRANSICIONES.includes(e.transicion) ? e.transicion : 'corte',
    logo: !!e.logo,
  }));
  if (!escenas.length) throw new Error('El guion no tiene escenas.');
  return {
    v: 2,
    formato: FORMATOS[s.formato] ? s.formato : '9:16',
    estilo: estiloById[s.estilo] ? s.estilo : null,
    paleta: { fondo: hex(s.paleta?.fondo, '#1d1a4f'), texto: hex(s.paleta?.texto, '#ffffff'), acento: hex(s.paleta?.acento, '#ffb547') },
    fuente: ['Impact', 'Arial Black', 'Georgia', 'Helvetica', 'Arial'].includes(s.fuente) ? s.fuente : 'Arial Black',
    subtitulos: ['palabra', 'bloque', 'ninguno'].includes(s.subtitulos) ? s.subtitulos : 'palabra',
    escenas,
    cierre: { cta: String(s.cierre?.cta || '').slice(0, 40), logo: s.cierre?.logo !== false },
  };
}
export const isSpec = (contenido) => typeof contenido === 'string' && contenido.trim().startsWith('{') && contenido.includes('"escenas"');

// ---------- B-roll real (Pexels) ----------
const cache = new Map();
async function pexelsSearch(query, orientation) {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !query) return [];
  const ck = `${query}|${orientation}`;
  if (cache.has(ck)) return cache.get(ck);
  const url = `https://api.pexels.com/v1/videos/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=10&size=medium`;
  const r = await fetch(url, { headers: { Authorization: key } });
  if (!r.ok) { console.warn('[pexels]', r.status, await r.text().catch(() => '')); return []; }
  const j = await r.json();
  const vids = (j.videos || []).map((v) => {
    const files = (v.video_files || []).filter((f) => f.file_type === 'video/mp4' && f.link);
    const want = orientation === 'landscape' ? (f) => f.width >= 1280 && f.width <= 1920 : (f) => f.height >= 960 && f.height <= 1920;
    const f = files.filter(want).sort((a, b) => (b.height || 0) - (a.height || 0))[0] || files.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
    return f && { url: f.link, w: f.width, h: f.height, poster: v.image, autor: v.user?.name || 'Pexels', pagina: v.url, dur: v.duration };
  }).filter(Boolean);
  cache.set(ck, vids);
  return vids;
}

// Busca las tomas reales de cada escena (una distinta por escena cuando se puede).
export async function resolveBroll(spec) {
  const orientation = spec.formato === '16:9' ? 'landscape' : spec.formato === '1:1' ? 'square' : 'portrait';
  const usadas = new Set();
  for (const e of spec.escenas) {
    if (e.fondo.tipo !== 'broll' || e.fondo.clip) continue;
    try {
      const vids = await pexelsSearch(e.fondo.busqueda, orientation);
      const libre = vids.filter((v) => !usadas.has(v.url));
      const pick = libre[Math.floor(Math.random() * Math.min(3, libre.length))] || vids[0];
      if (pick) { e.fondo.clip = pick; usadas.add(pick.url); }
    } catch (err) { console.warn('[pexels]', err.message); }
  }
  return spec;
}

export const brollDisponible = () => !!process.env.PEXELS_API_KEY;

// Proxy de video (permite reproducir y exportar sin bloqueos del navegador)
const ALLOWED = ['videos.pexels.com', 'images.pexels.com', 'player.vimeo.com'];
export async function proxyBroll(req, res) {
  let u;
  try { u = new URL(String(req.query.u || '')); } catch { return res.status(400).end(); }
  if (u.protocol !== 'https:' || !ALLOWED.includes(u.hostname)) return res.status(403).end();
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;
  const r = await fetch(u, { headers, redirect: 'follow' }).catch(() => null);
  if (!r || !r.body) return res.status(502).end();
  res.status(r.status);
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
    const v = r.headers.get(h); if (v) res.setHeader(h, v);
  }
  res.setHeader('Cache-Control', 'public, max-age=86400');
  Readable.fromWeb(r.body).on('error', () => res.end()).pipe(res);
}

// Guion de muestra para las vistas previas de estilos y el modo demo.
export function demoSpec(estiloId, marca = {}, textos = null) {
  const e = estiloById[estiloId] || ESTILOS[0];
  const c = marca.colores || [];
  const QUERIES = ['people smiling city lifestyle', 'hands working close up', 'happy customer shopping', 'friends laughing cafe', 'product close up slow motion', 'sunrise city timelapse'];
  return normalizeSpec({
    formato: '9:16', estilo: e.id, fuente: 'Arial Black', subtitulos: e.subtitulos,
    paleta: { fondo: c[0] || '#1d1a4f', texto: '#ffffff', acento: c[2] || c[1] || '#ffb547' },
    escenas: e.plantilla.map(([texto, animacion, transicion], i) => ({
      duracion: e.id === 'cuenta-regresiva' ? 1.1 : 2.2, texto: textos?.[i] || texto, animacion, transicion,
      subtitulo: i === 0 ? `${e.nombre} para ${marca.nombre || 'tu marca'}` : '',
      fondo: { tipo: 'broll', busqueda: textos?.busquedas?.[i] || QUERIES[i % QUERIES.length] },
    })),
    cierre: { cta: textos?.cta || 'Escríbenos hoy', logo: true },
  });
}
