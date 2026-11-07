// Videos "premium" con HyperFrames (HTML → video, determinista). Micho escribe la composición,
// el servidor la valida (check), la renderiza, mezcla voz y música con ffmpeg y la entrega para aprobación.
// HyperFrames: Apache-2.0 · GSAP (gratis para este uso) · estilos de película: Lemo Opuscar (MIT, ver server/lemo/LICENSE).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DATA_DIR } from './store.js';
import { conTurno } from './pesado.js';
import { agregarVoz } from './voz.js';
import { agregarMusica } from './musica.js';
import { buscarTomas } from './video.js';

const aquí = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(aquí, '..');
const HF_BIN = path.join(RAIZ, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');
const GSAP = path.join(RAIZ, 'node_modules', 'gsap', 'dist', 'gsap.min.js');
export const HF_DIR = path.join(DATA_DIR, 'hf');
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
function correr(cmd, args, { cwd, timeout = 600000, env = {} } = {}) {
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
const dur = async (f) => { const r = await correr('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]); return Number(r.out.trim()) || 0; };
export const seguro = (k) => String(k).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);

const PROHIBIDO = [/\bfetch\s*\(/i, /XMLHttpRequest/i, /WebSocket/i, /\bimport\s*\(/i, /<iframe/i, /<object/i, /<embed/i, /<script[^>]+src=["']https?:/i, /<link[^>]+href=["']https?:(?!\/\/fonts\.(googleapis|gstatic)\.com)/i, /@import\s+url\(\s*["']?https?:/i, /document\.cookie/i, /localStorage/i];

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

async function descargarTomas(dir, tomas, formato) {
  const orient = formato === 'horizontal' ? 'landscape' : 'portrait';
  const listas = [];
  fs.mkdirSync(path.join(dir, 'assets', 'tomas'), { recursive: true });
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
    fs.writeFileSync(path.join(dir, 'assets', 'tomas', `${id}.mp4`), buf);
    listas.push(`${id}: listo → assets/tomas/${id}.mp4 (${Math.round(buf.length / 1e6)} MB, crédito: ${v.autor})`);
  }
  return listas;
}

async function mezclar(silencioso, salida, { voces, musica, duracion }) {
  const entradas = ['-i', silencioso]; const filtros = []; const etiquetas = [];
  voces.forEach((v, i) => { entradas.push('-i', v.archivo); const ms = Math.max(0, Math.round(v.inicio * 1000)); filtros.push(`[${i + 1}:a]adelay=${ms}|${ms},volume=1.5[v${i}]`); etiquetas.push(`[v${i}]`); });
  if (musica) { entradas.push('-i', musica); const k = voces.length + 1; filtros.push(`[${k}:a]volume=${voces.length ? 0.2 : 0.5},atrim=0:${duracion.toFixed(2)},afade=t=out:st=${Math.max(0, duracion - 1.2).toFixed(2)}:d=1.2[mus]`); etiquetas.push('[mus]'); }
  if (!etiquetas.length) { fs.copyFileSync(silencioso, salida); return; }
  filtros.push(`${etiquetas.join('')}amix=inputs=${etiquetas.length}:normalize=0:duration=longest,loudnorm=I=-14:TP=-1.5,atrim=0:${duracion.toFixed(2)}[a]`);
  const r = await correr('ffmpeg', ['-y', ...entradas, '-filter_complex', filtros.join(';'), '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', salida], { timeout: 300000 });
  if (r.code !== 0) throw new Error(`No se pudo mezclar el audio: ${r.err.slice(-200)}`);
}

// ---------- Entrega ----------
// Devuelve { clave, archivo, duracion, resumen } o lanza Error con instrucciones para que el agente corrija.
export async function producir({ clave, html, narraciones = [], musicaPrompt = '', tomas = [], campaignId = null, agente = 'editor2', formato = 'vertical' }) {
  if (!hfDisponible()) throw new Error('HyperFrames no está instalado en este servidor.');
  const k = seguro(clave); const dir = path.join(HF_DIR, k); const final = path.join(dir, 'final.mp4');
  if (fs.existsSync(final)) return { clave: k, archivo: 'final.mp4', duracion: await dur(final), resumen: 'ya estaba renderizado' };
  const limpio = prepararHtml(html);
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  try {
    fs.copyFileSync(GSAP, path.join(dir, 'assets', 'gsap.min.js'));
    const notasTomas = await descargarTomas(dir, tomas, formato);
    fs.writeFileSync(path.join(dir, 'index.html'), limpio);
    return await conTurno(async () => {
      const c = await correr(process.execPath, [HF_BIN, 'check', '--json'], { cwd: dir, timeout: 240000 });
      const errores = leerCheck(c.out);
      if (errores.length) throw new Error(`La validación encontró ${errores.length} error(es). Corrígelos y vuelve a entregar:\n- ${errores.slice(0, 8).join('\n- ')}${notasTomas.length ? `\nTomas: ${notasTomas.join('; ')}` : ''}`);
      const r = await correr(process.execPath, [HF_BIN, 'render', '--quality', 'standard', '--fps', '30', '-o', 'silencio.mp4'], { cwd: dir, timeout: 900000 });
      const silencio = path.join(dir, 'silencio.mp4');
      if (r.code !== 0 || !fs.existsSync(silencio)) throw new Error(`El render falló: ${(r.err + r.out).slice(-400)}`);
      const d = await dur(silencio);
      // voz y música (si hay llaves); si fallan, el video sale sin esa pista
      const voces = [];
      if (narraciones.length) {
        const pseudo = { escenas: narraciones.slice(0, 12).map((n) => ({ narracion: String(n.texto || '').slice(0, 260), duracion: 2, _ini: Math.max(0, +n.inicio || 0) })) };
        await agregarVoz(pseudo, { campaignId, agente });
        for (const e of pseudo.escenas) if (e.voz) { const f = path.join(DATA_DIR, 'voz', path.basename(e.voz)); if (fs.existsSync(f)) voces.push({ archivo: f, inicio: e._ini }); }
      }
      let musica = null;
      if (musicaPrompt) { const ms = { musicaPrompt, escenas: [{ duracion: d }] }; const m = await agregarMusica(ms, { campaignId, agente }); if (m.ok) { const f = path.join(DATA_DIR, 'musica', path.basename(ms.musicaUrl)); if (fs.existsSync(f)) musica = f; } }
      await mezclar(silencio, final, { voces, musica, duracion: d });
      fs.unlinkSync(silencio);
      return { clave: k, archivo: 'final.mp4', duracion: d, resumen: `${d.toFixed(1)} s · ${voces.length} voz(es) · música ${musica ? 'IA' : 'no'}` };
    });
  } catch (e) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    throw e;
  }
}

export const rutaFinal = (clave) => path.join(HF_DIR, seguro(clave), 'final.mp4');

// ---------- Guía que recibe Micho ----------
export function hfGuide() {
  return `VIDEOS PREMIUM CON HYPERFRAMES (herramienta entregar_hyperframes)
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
9. Tomas reales: pasa "tomas" [{id:"t1", busqueda:"concrete english query", duracion:3}] y úsalas así (silenciosas, a cuadro completo): <video id="clip-t1" class="clip" src="assets/tomas/t1.mp4" muted playsinline data-start="0" data-duration="3" style="position:absolute;left:0;top:0;width:1080px;height:1920px;object-fit:cover"></video>. Si alguna no se encuentra, el error te lo dirá.
10. Mueve cosas con intención: entradas con ease power4.out / back.out, salidas rápidas, escalonar (stagger), contadores, barras que crecen, textos que se dibujan, cámara (escala lenta del fondo). Nada de objetos quietos 4 segundos. Máx. 45 s.

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

ESTILOS DE PELÍCULA (Lemo Opuscar, MIT): 66 direcciones de arte. Si el concepto pide un look distinto del genérico, elige UNO de la lista, lee su guía con ver_estilo_pelicula y aplica su paleta, materiales, tipografía y gramática de movimiento en tu HTML+GSAP (sin copiar obras ni personajes). Catálogo:
${catalogoEstilos()}`;
}
