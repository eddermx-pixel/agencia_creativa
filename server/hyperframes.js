// Videos "premium" con HyperFrames (HTML → video, determinista). Micho escribe la composición,
// el servidor la valida (check), la renderiza, mezcla voz y música con ffmpeg y la entrega para aprobación.
// HyperFrames: Apache-2.0 · GSAP (gratis para este uso) · estilos de película: Lemo Opuscar (MIT, ver server/lemo/LICENSE).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { DATA_DIR } from './store.js';
import { conTurno } from './pesado.js';
import { agregarVoz } from './voz.js';
import { agregarMusica } from './musica.js';
import { prepararEfectos, TIPOS as TIPOS_SFX } from './efectos.js';
import { exigir3d } from './presupuesto.js';
import { buscarTomas } from './video.js';
import { personajesGuardados } from './personajes-api.js';
import { rutaArchivo } from './workspace.js';

const aquí = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(aquí, '..');
const HF_BIN = path.join(RAIZ, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');
const GSAP = path.join(RAIZ, 'node_modules', 'gsap', 'dist', 'gsap.min.js');
const THREE_DIR = path.join(RAIZ, 'node_modules', 'three', 'build'); // Three.js local (sin internet al renderizar)
const LIB3D = path.join(RAIZ, 'server', 'lib3d', 'personajes.js'); // librería de personajes y escenas 3D (assets/three/personajes.js)
export const HF_DIR = path.join(DATA_DIR, 'hf');
// El trabajo pesado (frames, temporales) va al disco del contenedor, NO al volumen /data (que suele ser chico).
export const TRABAJO = process.env.TRABAJO_DIR || path.join(os.tmpdir(), 'agencia-trabajo');
const limiteMb = (() => { for (const f of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) { try { const v = Number(fs.readFileSync(f, 'utf8').trim()); if (v > 0 && v < 1e13) return v / 1048576; } catch {} } return null; })();
export const POCA_MEMORIA = limiteMb !== null && limiteMb < 2048;
export const HF_WORKERS = String(process.env.HF_WORKERS || (POCA_MEMORIA ? 1 : 2));
export function guardarFinal(k, origen) { const d = path.join(HF_DIR, k); fs.mkdirSync(d, { recursive: true }); fs.copyFileSync(origen, path.join(d, 'final.mp4')); }
export const hfDisponible = () => fs.existsSync(HF_BIN) && fs.existsSync(GSAP);

// ---------- Estilos de película (Lemo Opuscar, MIT) ----------
const LEMO = path.join(aquí, 'lemo');
let catalogo = [];
try { catalogo = JSON.parse(fs.readFileSync(path.join(LEMO, 'catalogo.json'), 'utf8')); } catch {}
export const catalogoEstilos = () => catalogo.map((e) => `${e.slug} — ${e.en} (${e.category_en}): ${e.line} Sirve para: ${(e.uses || []).join(', ')}`).join('\n');
export function estiloPelicula(slug) {
  const e = catalogo.find((x) => x.slug === String(slug || '').trim());
  if (!e) throw new Error(`No existe el estilo "${slug}". Usa uno de la lista.`);
  const t = fs.readFileSync(path.join(LEMO, `${e.slug}.md`), 'utf8');
  return `GUÍA DE ESTILO "${e.en}" (adáptala a HyperFrames: HTML + GSAP; NO copies personajes, obras ni tipografías con derechos).\n\n${t.slice(0, 9000)}${t.length > 9000 ? '\n\n[…recortado]' : ''}`;
}

// ---------- Utilidades ----------
export function correr(cmd, args, { cwd, timeout = 600000, env = {} } = {}) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { cwd, env: { ...process.env, HYPERFRAMES_NO_TELEMETRY: '1', ...env } });
    let out = '', err = '';
    const t = setTimeout(() => { p.kill('SIGKILL'); fail(new Error('Se agotó el tiempo del proceso.')); }, timeout);
    p.stdout.on('data', (d) => (out = (out + d).slice(-2_000_000)));
    p.stderr.on('data', (d) => (err = (err + d).slice(-8000)));
    p.on('error', (e) => { clearTimeout(t); fail(e); });
    p.on('exit', (c) => { clearTimeout(t); ok({ code: c, out, err }); });
  });
}
export const dur = async (f) => { const r = await correr('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]); return Number(r.out.trim()) || 0; };
export const seguro = (k) => String(k).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);

const PROHIBIDO = [/\bfetch\s*\(/i, /XMLHttpRequest/i, /WebSocket/i, /\bimport\s*\(/i, /<iframe/i, /<object/i, /<embed/i, /<script[^>]+src=["']https?:/i, /<link[^>]+href=["']https?:(?!\/\/fonts\.(googleapis|gstatic)\.com)/i, /@import\s+url\(\s*["']?https?:/i, /document\.cookie/i, /localStorage/i];

// Plantilla 3D que ya funciona (escena vertical con un personaje de la librería). Micho la copia y la adapta.
export const PLANTILLA_3D = `<!doctype html><html lang="es"><head><meta charset="utf-8"><script src="assets/gsap.min.js"></script>
<style>html,body{margin:0;background:#0B1B3F}
#root{position:relative;width:1080px;height:1920px;overflow:hidden;background:linear-gradient(160deg,#0B1B3F,#13306b);font-family:"Inter",sans-serif;color:#fff}
#c3{position:absolute;left:0;top:420px;width:1080px;height:1200px}
#t1{position:absolute;left:90px;right:90px;top:130px;text-align:center;font-weight:900;font-size:84px;line-height:1.05}
#logo{position:absolute;left:300px;top:1700px;width:480px;opacity:0}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="8" data-width="1080" data-height="1920">
<canvas id="c3" class="clip" data-start="0" data-duration="8" width="1080" height="1200"></canvas>
<div id="t1" class="clip" data-start="0.2" data-duration="7.6">Texto del gancho</div>
<img id="logo" class="clip" src="assets/logo.png" data-start="6" data-duration="2">
</div>
<script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});
tl.fromTo("#t1",{opacity:0,y:-40},{opacity:1,y:0,duration:.5,ease:"power4.out"},.2).fromTo("#logo",{opacity:0},{opacity:1,duration:.5},6);
window.__timelines["main"]=tl;</script>
<script type="module">
import { crearEscena, crearPersonaje, animarPersonaje, sombra, mostrador } from "./assets/three/personajes.js";
const E = crearEscena(document.getElementById("c3"), 1080, 1200, { fov: 32, camara: [0, 3.4, 10], mira: [0, 2.2, 0] });
const p = crearPersonaje({ id: "dueno", piel: 0xf2c9a0, pelo: { estilo: "largo", color: 0x4a2a1a }, ropa: { tipo: "delantal", color: 0x1f8f5a, acento: 0xf4f1e6 }, accesorios: ["lentes"] });
p.grupo.scale.setScalar(1.25); p.grupo.position.set(0, 0.2, 0); E.scene.add(p.grupo);
const m = mostrador({ ancho: 7 }); m.position.set(0, -1.2, 1.4); E.scene.add(m);
const DUR = 8, state = { p: 0 };
function render() { const t = state.p * DUR;
  animarPersonaje(p, t, { emociones: [[0, "panico"], [4, "alegria"]], gestos: { izq: [[0, "panico"], [4, "reposo"]], der: [[0, "telefono"], [4, "saludo"]] }, habla: [[1, 3]] });
  E.render(); }
render();
window.__timelines["main"].to(state, { p: 1, duration: DUR, ease: "none", onUpdate: render }, 0);
</script></body></html>`;

// Si el ajuste está activo, el HTML debe usar la librería de personajes 3D (assets/three/personajes.js).
function exigirLibreria(h) {
  if (!exigir3d() || /assets\/three\/personajes\.js/.test(h)) return;
  throw new Error('RECHAZADO POR EL SERVIDOR: este video debe usar la librería de personajes 3D (Three.js), pero tu HTML no importa ./assets/three/personajes.js. No uses CSS 3D ni dibujes personajes a mano. Copia esta PLANTILLA que ya funciona y adáptala (personajes, colores del cliente, emociones, gestos, textos, duración y el cierre con el logo sobre fondo OSCURO):\n' + PLANTILLA_3D + '\nAdemás: los textos y burbujas de chat son HTML encima del canvas; para personajes extra usa crearPersonaje con otra piel/pelo/ropa; para objetos usa telefono(), mostrador(), plancha(), sillon(), burbuja(). Vuelve a llamar a la herramienta con el HTML corregido.');
}

function prepararHtml(html) {
  let h = String(html || '').trim();
  if (h.length < 200) throw new Error('La composición está vacía o es demasiado corta.');
  if (h.length > 90000) throw new Error('La composición es demasiado larga (máx. 90 KB): simplifícala.');
  if (!/data-composition-id=["']main["']/.test(h)) throw new Error('El elemento raíz debe tener data-composition-id="main", data-start="0", data-duration, data-width y data-height.');
  if (!/data-duration=/.test(h)) throw new Error('Falta data-duration (segundos) en la raíz.');
  h = h.replace(/<script[^>]+src=["'][^"']*gsap[^"']*["'][^>]*><\/script>/gi, '<script src="assets/gsap.min.js"></script>');
  if (!/assets\/gsap\.min\.js/.test(h)) h = h.replace(/<\/head>/i, '<script src="assets/gsap.min.js"></script></head>');
  for (const r of PROHIBIDO) if (r.test(h)) throw new Error(`La composición usa algo no permitido (${r.source.slice(0, 30)}). No se permiten fetch, scripts externos, iframes ni almacenamiento.`);
  return h;
}

function leerCheck(salida) {
  let d; try { d = JSON.parse(salida); } catch { return []; }
  const todos = [];
  for (const sec of ['lint', 'runtime', 'layout']) for (const f of d[sec]?.findings || []) if (f.severity === 'error') todos.push(`[${sec}] ${f.code}${f.selector ? ` (${f.selector})` : ''}${f.time != null ? ` @${f.time}s` : ''}: ${f.message}${f.fixHint ? ` → Arreglo: ${f.fixHint}` : ''}`);
  return todos;
}

export async function descargarTomas(dir, tomas, formato, sub = path.join('assets', 'tomas')) {
  const orient = formato === 'horizontal' ? 'landscape' : 'portrait';
  const listas = [];
  fs.mkdirSync(path.join(dir, sub), { recursive: true });
  for (const t of (tomas || []).slice(0, 6)) {
    const id = seguro(t.id);
    if (!id || !t.busqueda) continue;
    const vids = await buscarTomas(String(t.busqueda).slice(0, 120), orient);
    const v = vids.find((x) => !x.dur || x.dur >= (+t.duracion || 3)) || vids[0];
    if (!v) { listas.push(`${id}: sin resultados para "${t.busqueda}" (cambia la búsqueda)`); continue; }
    const u = new URL(v.url);
    if (u.protocol !== 'https:') continue;
    const r = await fetch(u); if (!r.ok) { listas.push(`${id}: no se pudo descargar`); continue; }
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 80 * 1024 * 1024) { listas.push(`${id}: archivo demasiado grande`); continue; }
    fs.writeFileSync(path.join(dir, sub, `${id}.mp4`), buf);
    listas.push(`${id}: listo → ${sub.split(path.sep).join('/')}/${id}.mp4 (${Math.round(buf.length / 1e6)} MB, crédito: ${v.autor})`);
  }
  return listas;
}

export async function mezclar(silencioso, salida, { voces, musica, duracion, efectos = [] }) {
  const entradas = ['-i', silencioso]; const filtros = []; const etiquetas = []; const vocesEt = [];
  voces.forEach((v, i) => { entradas.push('-i', v.archivo); const ms = Math.max(0, Math.round(v.inicio * 1000)); filtros.push(`[${i + 1}:a]adelay=${ms}|${ms},volume=1.5[v${i}]`); vocesEt.push(`[v${i}]`); });
  // Todas las voces en una sola pista; una copia va a la mezcla y otra "ordena" a la música que baje mientras se habla (ducking).
  if (vocesEt.length) { filtros.push(`${vocesEt.join('')}amix=inputs=${vocesEt.length}:normalize=0:duration=longest,asplit=2[vz1][vz2]`); etiquetas.push('[vz2]'); }
  if (musica) {
    entradas.push('-i', musica); const k = voces.length + 1;
    const vol = Number(process.env.MUSICA_VOL || (voces.length ? 1.1 : 0.6)); // antes 0.2: quedaba ~16 dB bajo la voz; con ducking queda ~9 dB bajo la voz al hablar
    filtros.push(`[${k}:a]volume=${vol},atrim=0:${duracion.toFixed(2)},afade=t=out:st=${Math.max(0, duracion - 1.2).toFixed(2)}:d=1.2[mus0]`);
    filtros.push(voces.length ? '[mus0][vz1]sidechaincompress=threshold=0.09:ratio=2.5:attack=20:release=450:makeup=1[mus]' : '[mus0]anull[mus]');
    etiquetas.push('[mus]');
  } else if (vocesEt.length) filtros.push('[vz1]anullsink');
  efectos.forEach((x, i) => { const k = entradas.filter((e) => e === '-i').length; entradas.push('-i', x.archivo); const ms = Math.round(x.inicio * 1000); filtros.push(`[${k}:a]adelay=${ms}|${ms},volume=${x.vol}[e${i}]`); etiquetas.push(`[e${i}]`); });
  if (!etiquetas.length) { fs.copyFileSync(silencioso, salida); return; }
  filtros.push(`${etiquetas.join('')}amix=inputs=${etiquetas.length}:normalize=0:duration=longest,loudnorm=I=-14:TP=-1.5,atrim=0:${duracion.toFixed(2)}[a]`);
  const r = await correr('ffmpeg', ['-y', ...entradas, '-filter_complex', filtros.join(';'), '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', salida], { timeout: 300000 });
  if (r.code !== 0) throw new Error(`No se pudo mezclar el audio: ${r.err.slice(-200)}`);
}

// Voz (ElevenLabs) y música (ElevenLabs Music): si fallan, el video sale sin esa pista.
// Archivos que el jefe subió a la computadora del agente → carpeta del proyecto
export function copiarArchivos(dir, agente, archivos, sub) {
  const out = [];
  for (const a of (archivos || []).slice(0, 10)) {
    const nombre = String(a.nombre || '').replace(/[^\w.\-]/g, '_').slice(0, 60);
    if (!nombre) continue;
    const origen = rutaArchivo(agente, a.ruta);
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
    fs.copyFileSync(origen, path.join(dir, sub, nombre));
    out.push(`${sub}/${nombre}`);
  }
  return out;
}

export async function generarAudio({ narraciones = [], musicaPrompt = '', duracion, campaignId = null, agente = 'editor2' }) {
  const voces = [];
  if (narraciones.length) {
    const pseudo = { escenas: narraciones.slice(0, 12).map((n) => ({ narracion: String(n.texto || '').slice(0, 260), duracion: 2, _ini: Math.max(0, +n.inicio || 0) })) };
    await agregarVoz(pseudo, { campaignId, agente });
    for (const e of pseudo.escenas) if (e.voz) { const f = path.join(DATA_DIR, 'voz', path.basename(e.voz)); if (fs.existsSync(f)) voces.push({ archivo: f, inicio: e._ini }); }
  }
  let musica = null;
  if (musicaPrompt) { const ms = { musicaPrompt, escenas: [{ duracion }] }; const m = await agregarMusica(ms, { campaignId, agente }); if (m.ok) { const f = path.join(DATA_DIR, 'musica', path.basename(ms.musicaUrl)); if (fs.existsSync(f)) musica = f; } }
  return { voces, musica };
}

// ---------- Registro de bloques listos (≈450: transiciones, partículas, zoom, cámara, glitch, títulos…) ----------
export async function buscarBloques(consulta) {
  const q = String(consulta || '').trim().slice(0, 80);
  if (!q) throw new Error('Escribe qué buscas (en inglés), p. ej. "particles", "zoom", "camera shake", "glitch transition".');
  const r = await correr(process.execPath, [HF_BIN, 'catalog', q, '--json'], { cwd: RAIZ, timeout: 60000 });
  let d; try { d = JSON.parse(r.out); } catch { throw new Error('No se pudo consultar el catálogo.'); }
  const l = (d.results || []).slice(0, 14).map((x) => `- ${x.name} (${x.type}): ${String(x.description || x.title || '').slice(0, 150)}`);
  return l.length ? `${l.length} resultado(s) de ${d.total} bloques para "${q}":\n${l.join('\n')}\n\nUsa ver_bloque(nombre) para ver cómo se integra y pasa los nombres elegidos en "bloques" al entregar.` : `Sin resultados para "${q}". Prueba otra palabra en inglés.`;
}
export async function verBloque(nombre) {
  const n = seguro(nombre); if (!n) throw new Error('Falta el nombre del bloque.');
  const tmp = path.join(DATA_DIR, 'tmp-hf', `ver-${Date.now()}-${n}`);
  fs.mkdirSync(tmp, { recursive: true });
  try {
    const r = await correr(process.execPath, [HF_BIN, 'add', n, '--json', '--no-clipboard'], { cwd: tmp, timeout: 90000 });
    let d; try { d = JSON.parse(r.out); } catch { throw new Error(`No existe el bloque "${n}" o no se pudo leer. Búscalo con buscar_bloques.`); }
    if (!d.ok) throw new Error(`No se pudo leer el bloque "${n}".`);
    const archivos = (d.written || []).filter((f) => f.startsWith(tmp) && /\.(html|css|js|json|md)$/i.test(f)).slice(0, 3).map((f) => `// ${path.relative(tmp, f)}\n${fs.readFileSync(f, 'utf8').slice(0, 7000)}`);
    return `BLOQUE ${n} (${d.type}). Se instala en: ${(d.written || []).map((f) => path.relative(tmp, f)).join(', ')}\nSnippet: ${d.snippet}\n\nUso: si es un BLOQUE (block) se monta como sub-composición: un host <div id="ID" data-composition-id="ID" data-composition-src="<ruta>" data-start data-duration data-width="1080" data-height="1920"></div> (el id del host, el de la escena y el de la línea de tiempo deben coincidir; pasa su nombre en "bloques" al entregar). Si es un COMPONENTE (component) copia su HTML, CSS y animación dentro de tu index.html (adáptalo a 1080×1920; no hace falta pasarlo en "bloques"). Contenido:\n\n${archivos.join('\n\n')}`;
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
}
async function instalarBloques(dir, bloques) {
  for (const b of (bloques || []).slice(0, 8)) {
    const n = seguro(b); if (!n) continue;
    const r = await correr(process.execPath, [HF_BIN, 'add', n, '--json', '--no-clipboard'], { cwd: dir, timeout: 90000 });
    let d; try { d = JSON.parse(r.out); } catch { d = null; }
    if (!d?.ok) throw new Error(`No se pudo instalar el bloque "${n}": ${(r.err || r.out).slice(-150)}`);
    // GSAP local (más rápido y sin depender de internet al renderizar)
    for (const f of d.written || []) if (f.endsWith('.html') && fs.existsSync(f)) {
      const t = fs.readFileSync(f, 'utf8'); const t2 = t.replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@[^"']*\/gsap\.min\.js/g, 'assets/gsap.min.js');
      if (t2 !== t) fs.writeFileSync(f, t2);
    }
  }
}

// ---------- Entrega ----------
// Prepara la carpeta del proyecto: GSAP, Three.js (si el HTML lo usa), tomas, bloques, archivos del jefe y logo del cliente.
async function montar(dir, limpio, { archivos = [], bloques = [], logo = '', tomas = [], formato = 'vertical', agente = 'editor2' }) {
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.copyFileSync(GSAP, path.join(dir, 'assets', 'gsap.min.js'));
  if (/assets\/three\//.test(limpio)) {
    fs.mkdirSync(path.join(dir, 'assets', 'three'), { recursive: true });
    for (const f of ['three.module.js', 'three.core.js']) fs.copyFileSync(path.join(THREE_DIR, f), path.join(dir, 'assets', 'three', f));
    if (/personajes\.js/.test(limpio)) fs.copyFileSync(LIB3D, path.join(dir, 'assets', 'three', 'personajes.js'));
  }
  const notasTomas = await descargarTomas(dir, tomas, formato);
  await instalarBloques(dir, bloques);
  copiarArchivos(dir, agente, archivos, 'assets');
  // Logo oficial del cliente (kit de marca) disponible siempre como assets/logo.png (o .svg)
  const ml = /^data:image\/(png|jpeg|webp|svg\+xml);base64,(.*)$/.exec(logo || '');
  if (ml) fs.writeFileSync(path.join(dir, 'assets', `logo.${{ png: 'png', jpeg: 'jpg', webp: 'webp', 'svg+xml': 'svg' }[ml[1]]}`), Buffer.from(ml[2], 'base64'));
  return notasTomas;
}

// Devuelve { clave, archivo, duracion, resumen } o lanza Error con instrucciones para que el agente corrija.
export async function producir({ clave, html, archivos = [], bloques = [], narraciones = [], musicaPrompt = '', efectos = [], logo = '', tomas = [], campaignId = null, agente = 'editor2', formato = 'vertical' }) {
  if (!hfDisponible()) throw new Error('HyperFrames no está instalado en este servidor.');
  const k = seguro(clave); const dir = path.join(TRABAJO, k); const final = path.join(dir, 'final.mp4'); const persistente = path.join(HF_DIR, k, 'final.mp4');
  if (fs.existsSync(persistente)) return { clave: k, archivo: 'final.mp4', duracion: await dur(persistente), resumen: 'ya estaba renderizado' };
  const limpio = prepararHtml(html); exigirLibreria(limpio);
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  try {
    const notasTomas = await montar(dir, limpio, { archivos, bloques, logo, tomas, formato, agente });
    fs.writeFileSync(path.join(dir, 'index.html'), limpio);
    return await conTurno(async () => {
      const c = await correr(process.execPath, [HF_BIN, 'check', '--json'], { cwd: dir, timeout: 240000 });
      const errores = leerCheck(c.out);
      if (errores.length) throw new Error(`La validación encontró ${errores.length} error(es). Corrígelos y vuelve a entregar:\n- ${errores.slice(0, 8).join('\n- ')}${notasTomas.length ? `\nTomas: ${notasTomas.join('; ')}` : ''}`);
      const r = await correr(process.execPath, [HF_BIN, 'render', '--quality', 'standard', '--fps', '30', '--workers', HF_WORKERS, ...(POCA_MEMORIA ? ['--low-memory-mode'] : []), '-o', 'silencio.mp4'], { cwd: dir, timeout: 900000 });
      const silencio = path.join(dir, 'silencio.mp4');
      if (r.code !== 0 || !fs.existsSync(silencio)) throw new Error(`El render falló: ${(r.err + r.out).slice(-400)}`);
      const d = await dur(silencio);
      const { voces, musica } = await generarAudio({ narraciones, musicaPrompt, duracion: d, campaignId, agente });
      const sfx = await prepararEfectos(efectos);
      await mezclar(silencio, final, { voces, musica, duracion: d, efectos: sfx });
      fs.unlinkSync(silencio);
      guardarFinal(k, final);
      return { clave: k, archivo: 'final.mp4', duracion: d, resumen: `${d.toFixed(1)} s · ${voces.length} voz(es) · música ${musica ? 'IA' : 'no'} · ${sfx.length} efecto(s)` };
    });
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

export const rutaFinal = (clave) => path.join(HF_DIR, seguro(clave), 'final.mp4');

// ---------- Guía que recibe Micho ----------
export function hfGuide() {
  const propios = personajesGuardados();
  return `VIDEOS PREMIUM CON HYPERFRAMES (herramientas proponer_visual y entregar_hyperframes)
FLUJO OBLIGATORIO EN 3 PASOS (el jefe aprueba lo visual ANTES de que gastes en producir):
 1) PROPUESTA VISUAL: escribe tu composición con los personajes, la escena y el estilo ya a su aspecto final y llama a proponer_visual con 3-6 "momentos" (segundos) que muestren: el/los personajes, la escena del problema, la de la solución y el cierre con el logo. Es una versión corta y ligera (≤10 s): sin voz, sin música, sin animación completa; lo que importa es que se VEA bien. Se envía al jefe como imágenes.
 2) Si la RECHAZA, ajusta según su comentario y vuelve a proponer. NO produzcas el video hasta que la apruebe.
 3) Si la APRUEBA, construye el video final SOBRE ESE MISMO HTML (mismos personajes, formas, colores y estilo; solo agrega la animación completa, narraciones, música y efectos) y entrega con entregar_hyperframes. No rediseñes lo aprobado.
CALIDAD DE PERSONAJES: usa proporciones expresivas (cabeza grande, ojos que parpadean, boca que cambia, brazos que se mueven), ropa y accesorios que cuenten quién es (delantal, gorra), movimiento de reposo (respiración, balanceo) y colores del cliente; que cada personaje sea reconocible aunque sea simple.
GANCHO Y NARRATIVA: en el PRIMER segundo debe pasar algo que detenga el scroll (un problema visual fuerte + una frase en pantalla); estructura problema → lo que se pierde → solución → resultado concreto → llamada a la acción; ideal 25-35 s.
RITMO: pide la música con un tempo exacto en el musicaPrompt (p. ej. "110 BPM") y haz los cortes y los golpes visuales en múltiplos de ese pulso (a 110 BPM cada 2.18 s son 4 tiempos); nada se queda quieto más de 2 s; los textos entran y salen rápido.
Úsalo para piezas cinematográficas o de más nivel (lanzamientos, institucionales, explicativos con motion graphics a medida). Para videos rápidos y baratos sigue usando entregar_pieza con el guion JSON. Tú escribes UN archivo HTML (la composición); el servidor lo valida, lo renderiza a MP4 1080×1920 a 30 fps, le mezcla la voz y la música, y te lo devuelve para aprobación. Si la validación falla, recibirás los errores con su arreglo: corrígelos y vuelve a entregar.

REGLAS (el validador las exige):
1. La raíz: <div id="root" data-composition-id="main" data-start="0" data-duration="SEGUNDOS" data-width="1080" data-height="1920">. La duración total del video es ese data-duration.
2. Todo elemento con tiempo lleva class="clip", id único, data-start y data-duration (segundos); se ve en [inicio, inicio+duración). Termina cada animación un poco antes del fin.
3. UNA sola línea de tiempo pausada de GSAP, registrada DESPUÉS de crear las animaciones: window.__timelines["main"] = tl. Usa fromTo (nunca from). gsap ya está disponible (<script src="assets/gsap.min.js"></script>).
4. Prohibido: Date.now(), Math.random() sin semilla, setTimeout/setInterval, repeat:-1, fetch/XMLHttpRequest, scripts o imágenes de internet, iframes. Todo lo visible es función del tiempo de la línea.
5. No animes display/visibility/autoAlpha de un .clip (anima un hijo). No pongas CSS transform en un elemento que GSAP anima: anima x/y/scale/rotation con GSAP, nunca left/top/width/height... (width de una barra sí está permitido).
6. Fuentes por nombre (ya incluidas): Inter, Montserrat, Outfit, Poppins, Oswald, Archivo Black, League Gothic, Playfair Display, EB Garamond, Space Mono, Roboto, Open Sans, Lato, Nunito. Otra fuente no sirve.
7. Contenido dentro del 90% del cuadro (márgenes de ~100 px); dos textos NO pueden encimarse: cada bloque su zona (el validador lo detecta).
8. El sonido NO va en el HTML: pásalo en "narraciones" (el servidor genera la voz con ElevenLabs y la coloca en el segundo "inicio") y "musicaPrompt" (música instrumental generada con IA, en inglés, sin nombres de artistas ni canciones).
8a. EFECTOS DE SONIDO (gratis, hechos en el servidor): pasa "efectos" [{tipo, inicio, volumen?}] con tipos: ${TIPOS_SFX.join(', ')}. Pon uno en cada entrada o salida importante (whoosh al entrar un bloque, pop al aparecer un icono, teclas mientras se escribe, notificacion/ding en un mensaje del chat, impacto en el título, exito al cierre). El segundo de inicio debe coincidir con la animación en tu línea de tiempo. No satures: 1 efecto cada 1.5–3 s.
8c. LOGO OFICIAL DEL CLIENTE: si el cliente tiene logo en su kit, el servidor lo pone SIEMPRE en el proyecto como assets/logo.png (o logo.jpg/.webp/.svg según el archivo). Úsalo con <img src="assets/logo.png"> en el cierre y donde convenga; NO uses el marcador {{LOGO}} (solo sirve en el motor antiguo) ni pongas el nombre en texto en su lugar. Si el logo es blanco sobre transparente, ponlo sobre fondo oscuro.
8b. ARCHIVOS DEL JEFE (logo, fotos, audio): están en tu carpeta subidos/ (míralos con ver_archivos y ver_imagen). Para usarlos pasa "archivos" [{ruta:"subidos/logo.png", nombre:"logo.png"}] y refiérelos como src="assets/logo.png". Si necesitas el logo y no lo tienes, pídeselo al jefe con preguntar_al_jefe.
9. Tomas reales: pasa "tomas" [{id:"t1", busqueda:"concrete english query", duracion:3}] y úsalas así (silenciosas, a cuadro completo): <video id="clip-t1" class="clip" src="assets/tomas/t1.mp4" muted playsinline data-start="0" data-duration="3" style="position:absolute;left:0;top:0;width:1080px;height:1920px;object-fit:cover"></video>. Si alguna no se encuentra, el error te lo dirá.
9b. 3D CON GSAP (sin WebGL, rápido y fiable): da profundidad real con perspectiva CSS. Pon en un contenedor style="perspective:1400px" y anima con GSAP sus hijos con rotationY, rotationX, z (px) y transformPerspective, p. ej. un teléfono o tarjeta que gira 25°→-15°, capas separadas en z (parallax 3D), cubos o tarjetas que se apilan y giran, sombras suaves bajo los objetos y luz con gradientes. Usa varias capas a distinto z con movimiento lento de cámara (anima rotationY/rotationX del contenedor ±8°). Sé consistente con la paleta del cliente.
9c. 3D REAL CON THREE.js (objetos 3D de verdad: teléfono, cubos, tarjetas con volumen, luces y sombras). Úsalo cuando el concepto pida 3D de calidad; para giros simples basta 9b. El servidor pone Three.js en el proyecto; impórtalo en un <script type="module"> al final del body, DESPUÉS del script de GSAP y de window.__timelines["main"]=tl:
import * as THREE from "./assets/three/three.module.js";
Reglas: (a) un <canvas id="c3" class="clip" data-start data-duration width="1080" height="1200"> con fondo transparente (alpha:true y setClearColor(0x000000,0)) sobre tu fondo; (b) renderer.setPixelRatio(1); renderer.setSize(1080,1200,false); (c) la escena es función del tiempo: const state={p:0}; function render(){ coloca y rota los objetos según state.p (0 a 1) y llama renderer.render(scene,camera) } render(); y al final: window.__timelines["main"].to(state,{p:1,duration:DURACION_DEL_CLIP,ease:"none",onUpdate:render},INICIO_DEL_CLIP). NUNCA uses requestAnimationFrame, THREE.Clock, Date.now ni Math.random; (d) MeshStandardMaterial con los colores del cliente + AmbientLight (1.1) y DirectionalLight (2.4) para que haya volumen; (e) máximo ~30 mallas con geometrías simples (BoxGeometry, PlaneGeometry, CylinderGeometry, SphereGeometry, TorusGeometry); el texto NO va en 3D: ponlo como HTML encima del canvas; (f) anima rotation.y, position.z/y, escala y la cámara con state.p; para varias tomas usa rangos de state.p o un canvas por toma. Ejemplo: teléfono = Box(2.4,4.8,0.3) + Plane de pantalla en z=0.16; burbujas de chat = Box(1.6,0.5,0.12) a distintas z que flotan; giro de -35° a 40° durante 3 s. Para PERSONAS usa la librería 9d. Si el render con 3D falla, devuelve el error: simplifica la escena o usa 9b.
9d. LIBRERÍA DE PERSONAJES 3D (úsala SIEMPRE que el video necesite personas; NO inventes personajes desde cero: salen más simples, sin cara y cuestan mucho más). Va sobre 9c, en el mismo <script type="module">:
import { crearEscena, crearPersonaje, animarPersonaje, sombra, telefono, mostrador, plancha, sillon, burbuja, pared, suelo, mancuerna, barraPesas, agarrar } from "./assets/three/personajes.js";
- const E = crearEscena(canvas, ANCHO, ALTO, { fov: 30, camara: [0, 2.6, 15], mira: [0, 1.6, 0] }) devuelve E.scene, E.camera y E.render() (ya trae las luces).
- const p = crearPersonaje({ id: "ana", piel: 0xf2c9a0, pelo: { estilo: "corto|mono|largo|calvo", color: 0x2a1a14 }, ropa: { tipo: "bata|delantal|playera|saco", color: 0xffffff, acento: 0x5ec8ea }, accesorios: ["cubrebocas","guantes","gorro-chef","gorra","bigote","lentes","corbata"], cuerpo: "busto|completo", fisico: "normal|fuerte", cabeza: 1, escala: 1, fase: 0 }); luego E.scene.add(p.grupo); p.grupo.position.set(x, y, z). Mide unos 3.7 de alto con la cabeza; el torso termina en y=0 (busto): ponlo detrás de un mostrador/sillón o usa cuerpo:"completo". Dale a cada personaje distinta piel, pelo, ropa y fase. GIMNASIO/DEPORTE: usa fisico:"fuerte" (hombros anchos, pecho, brazos gruesos, cabeza más chica; NUNCA personajes redondos tipo bola) y cuerpo:"completo". Las pesas NUNCA flotan: ponlas EN la mano con agarrar(p,"izq",mancuerna()) o apoyadas en el piso (m.position.y = mancuerna.radio). barraPesas() para press/sentadilla. La gorra ya no tapa cejas ni ojos; no pongas objetos delante de la cara.
- En tu función render() (t = state.p * DURACION): animarPersonaje(p, t, { emociones: [[0,"panico"],[6,"alegria"]], gestos: { izq: [[0,"telefono"],[6,"reposo"]], der: [[0,"reposo"]] }, habla: [[1.2,3.4]], mirada: [x,y], giro: rad, energia: 1 }). Emociones: neutral, alegria, tranquilo, panico, preocupado, sorpresa, enojo, cansado, hablando. Gestos: reposo, telefono, saludo, panico, trabajando, senalar, celebrar, cadera, pensar. izq/der son los lados DE LA PANTALLA. Cambia emoción y gesto en los momentos de la historia (p. ej. pánico cuando suena el teléfono → alegría cuando entra el chatbot): la cara es lo que cuenta la emoción. Con cubrebocas la boca no se ve: usa cejas y ojos (preocupado, sorpresa, alegria).
- Objetos listos: telefono({color,pantalla,insignia}), mostrador({ancho,color}), plancha({tacos}), sillon({color}), burbuja({ancho,color,cola}), pared(), suelo(), sombra(radio). Ponles los colores del cliente.
- El texto y las burbujas de chat van como HTML encima del canvas. Para cambiar de escena entre tomas usa varios canvas (uno por toma) o muestra/oculta grupos según state.p.
${propios ? `9d-bis. PERSONAJES YA ARMADOS POR EL JEFE (estudio de personajes): úsalos TAL CUAL (misma config, no los rediseñes) cuando encajen con el rol:\n${propios}\n` : ''}9e. PLANTILLA 3D OBLIGATORIA: el servidor RECHAZA los videos y propuestas que no importen assets/three/personajes.js (se puede apagar en Ajustes de IA). Empieza SIEMPRE copiando esta plantilla y adaptándola:\n${PLANTILLA_3D}\n10. Mueve cosas con intención: entradas con ease power4.out / back.out, salidas rápidas, escalonar (stagger), contadores, barras que crecen, textos que se dibujan, cámara (escala lenta del fondo). Nada de objetos quietos 4 segundos. Máx. 45 s.

PLANTILLA MÍNIMA (cópiala y amplíala):
<!doctype html><html lang="es"><head><meta charset="utf-8"><script src="assets/gsap.min.js"></script>
<style>html,body{margin:0;background:#0f1b3d}#root{position:relative;width:1080px;height:1920px;overflow:hidden;background:linear-gradient(160deg,#0f1b3d,#162a63);font-family:"Inter",sans-serif;color:#fff}
.t{position:absolute;left:100px;right:100px;text-align:center;font-weight:900}#t1{top:640px;font-size:96px}#t2{top:1100px;font-size:72px;color:#2de2c5}#bar{position:absolute;left:140px;top:1350px;height:36px;width:0;border-radius:18px;background:#2de2c5}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="6" data-width="1080" data-height="1920">
<div id="t1" class="clip t" data-start="0.2" data-duration="5.6">TU NEGOCIO NUNCA DUERME</div>
<div id="t2" class="clip t" data-start="1.2" data-duration="4.6">con un chatbot</div>
<div id="bar" class="clip" data-start="2" data-duration="3.8"></div></div>
<script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});
tl.fromTo("#t1",{opacity:0,y:60},{opacity:1,y:0,duration:.6,ease:"power4.out"},.2).fromTo("#t2",{opacity:0,scale:.8},{opacity:1,scale:1,duration:.5,ease:"back.out(1.7)"},1.2).fromTo("#bar",{width:0},{width:800,duration:2,ease:"power2.inOut"},2);
window.__timelines["main"]=tl;</script></body></html>

BLOQUES LISTOS (≈450): partículas (confetti, starfield, snow…), zoom y cámara (camera-shake, cinematic-zoom, parallax-zoom, camera-dolly-zoom…), 75 transiciones (distorsión, radial, mecánicas, disolvencia…), glitch, títulos y textos cinéticos. Antes de dibujar algo a mano, búscalo: buscar_bloques("particles") → ver_bloque("nombre") → monta su archivo como sub-composición en tu index.html y pasa los nombres en "bloques" al entregar (el servidor los instala). Para movimiento de cámara en tu propio HTML: anima la escala/posición de un contenedor que envuelve toda la escena (zoom lento, push-in, shake con seno determinista).

ESTILOS DE PELÍCULA (Lemo Opuscar, MIT): 66 direcciones de arte. Si el concepto pide un look distinto del genérico, elige UNO de la lista, lee su guía con ver_estilo_pelicula y aplica su paleta, materiales, tipografía y gramática de movimiento en tu HTML+GSAP (sin copiar obras ni personajes). Catálogo:
${catalogoEstilos()}`;
}

// ---------- Propuesta visual ----------
// Imágenes fijas de la composición REAL en los segundos elegidos (personajes, escena, estilo). No renderiza video ni gasta voz/música:
// el jefe aprueba esto y luego el video se construye sobre el mismo HTML. Devuelve { jpg: Buffer, ancho, alto, etiquetas }.
export async function proponer({ clave, html, archivos = [], bloques = [], logo = '', momentos = [], agente = 'editor2' }) {
  if (!hfDisponible()) throw new Error('HyperFrames no está instalado en este servidor.');
  const ms = (momentos || []).map((m) => ({ segundo: Math.max(0, +m.segundo || 0), etiqueta: String(m.etiqueta || '').slice(0, 60) })).slice(0, 6);
  if (ms.length < 2) throw new Error('Indica entre 2 y 6 momentos clave: [{segundo, etiqueta}] (p. ej. el personaje, la escena principal, el cierre).');
  const k = `${seguro(clave)}-prop`; const dir = path.join(TRABAJO, k);
  const limpio = prepararHtml(html); exigirLibreria(limpio);
  try {
    await montar(dir, limpio, { archivos, bloques, logo, agente });
    fs.writeFileSync(path.join(dir, 'index.html'), limpio);
    return await conTurno(async () => {
      const c = await correr(process.execPath, [HF_BIN, 'check', '--json'], { cwd: dir, timeout: 240000 });
      const errores = leerCheck(c.out);
      if (errores.length) throw new Error(`La validación encontró ${errores.length} error(es). Corrígelos y vuelve a proponer:\n- ${errores.slice(0, 8).join('\n- ')}`);
      const out = path.join(dir, 'snap');
      const r = await correr(process.execPath, [HF_BIN, 'snapshot', '--at', ms.map((m) => m.segundo).join(','), '--no-end', '--json', '-o', out], { cwd: dir, timeout: 300000 });
      let d; try { d = JSON.parse(r.out.slice(r.out.indexOf('{'))); } catch { d = null; }
      const frames = (d?.frames || []).map((f) => f.path).filter((f) => fs.existsSync(f));
      if (!frames.length) throw new Error(`No se pudieron sacar las imágenes: ${(r.err + r.out).slice(-300)}`);
      // Tablero: hasta 3 columnas, cada cuadro a 540×960 (9:16)
      frames.forEach((f, i) => fs.copyFileSync(f, path.join(out, `t${i + 1}.png`)));
      const cols = Math.min(frames.length, 3); const filas = Math.ceil(frames.length / 3);
      const tab = path.join(out, 'tablero.jpg');
      const t = await correr('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(out, 't%d.png'), '-vf', `scale=540:960:force_original_aspect_ratio=decrease,pad=540:960:(ow-iw)/2:(oh-ih)/2:color=0x0B1B3F,tile=${cols}x${filas}:padding=10:margin=10:color=0x0b1220`, '-frames:v', '1', '-q:v', '3', tab], { timeout: 120000 });
      if (t.code !== 0 || !fs.existsSync(tab)) throw new Error(`No se pudo armar el tablero: ${t.err.slice(-200)}`);
      return { jpg: fs.readFileSync(tab), ancho: cols * 540 + (cols + 1) * 10 + (cols - 1) * 0, alto: filas * 960 + (filas + 1) * 10, etiquetas: ms.map((m, i) => `${i + 1}. ${m.etiqueta || `segundo ${m.segundo}`}`) };
    });
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}
