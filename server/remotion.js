// Videos con Remotion (React → video). Micho escribe un componente; el servidor lo compila, lo renderiza,
// mezcla voz y música y lo manda a aprobación. Licencia de Remotion: gratis para individuos y organizaciones
// de hasta 3 empleados (ver node_modules/remotion/LICENSE.md); una empresa mayor necesita Company License.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copiarArchivos, HF_DIR, TRABAJO, POCA_MEMORIA, seguro, descargarTomas, generarAudio, mezclar, dur, guardarFinal, correr } from './hyperframes.js';
import { conTurno } from './pesado.js';

const aquí = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(aquí, '..');
export const remotionInstalado = () => fs.existsSync(path.resolve('node_modules', '@remotion', 'renderer')) && fs.existsSync(path.resolve('node_modules', '@remotion', 'bundler'));
// Con menos de 2 GB de memoria Remotion se queda sin recursos (se comprobó en Railway con ~954 MB): se apaga solo. REMOTION_FORZAR=1 lo activa de todos modos.
export const remotionActivo = () => remotionInstalado() && (!POCA_MEMORIA || process.env.REMOTION_FORZAR === '1');
export const remotionDisponible = remotionActivo;
const PERMITIDOS = new Set(['react', 'remotion', '@remotion/shapes', '@remotion/paths', '@remotion/transitions', '@remotion/motion-blur', '@remotion/noise', '@remotion/layout-utils', '@remotion/google-fonts', '@remotion/animated-emoji']);
const PROHIBIDO = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /\bimport\s*\(/, /\brequire\s*\(/, /\bprocess\b/, /child_process/, /\beval\s*\(/, /new Function/, /document\.cookie/, /localStorage/, /<iframe/i, /dangerouslySetInnerHTML/];

function validar(codigo) {
  const c = String(codigo || '');
  if (c.length < 120) throw new Error('El componente está vacío o es demasiado corto.');
  if (c.length > 60000) throw new Error('El componente es demasiado largo (máx. 60 KB).');
  if (!/export\s+default/.test(c)) throw new Error('Debe exportar por defecto el componente: export default function Comp() { ... }');
  for (const m of c.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g)) {
    const mod = m[1] || m[2];
    if (!PERMITIDOS.has(mod)) throw new Error(`No se permite importar "${mod}". Solo: ${[...PERMITIDOS].join(', ')}.`);
  }
  for (const r of PROHIBIDO) if (r.test(c)) throw new Error(`El componente usa algo no permitido (${r.source.slice(0, 24)}).`);
}

const ROOT = (seg, w, h) => `import React from 'react';
import { Composition } from 'remotion';
import Comp from './Comp';
export const RemotionRoot: React.FC = () => <Composition id="Main" component={Comp} durationInFrames={${Math.round(seg * 30)}} fps={30} width={${w}} height={${h}} />;
`;
const INDEX = `import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';
registerRoot(RemotionRoot);
`;

export async function producirRemotion({ clave, codigo, archivos = [], duracion = 10, narraciones = [], musicaPrompt = '', tomas = [], campaignId = null, agente = 'editor2' }) {
  if (!remotionDisponible()) throw new Error(remotionInstalado() ? 'Remotion está apagado en este servidor porque tiene poca memoria (se reiniciaría). Usa HyperFrames, o sube el plan de Railway.' : 'Remotion no está instalado en este servidor.');
  const k = seguro(clave); const dir = path.join(TRABAJO, k); const final = path.join(dir, 'final.mp4'); const persistente = path.join(HF_DIR, k, 'final.mp4');
  if (fs.existsSync(persistente)) return { clave: k, archivo: 'final.mp4', duracion: await dur(persistente), resumen: 'ya estaba renderizado' };
  validar(codigo);
  const seg = Math.min(60, Math.max(3, +duracion || 10));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  try {
    const notas = await descargarTomas(dir, tomas, 'vertical', 'public/tomas');
    copiarArchivos(dir, agente, archivos, 'public');
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), INDEX);
    fs.writeFileSync(path.join(dir, 'src', 'Root.tsx'), ROOT(seg, 1080, 1920));
    fs.writeFileSync(path.join(dir, 'src', 'Comp.tsx'), codigo);
    return await conTurno(async () => {
      const r = await correr(process.execPath, ['--max-old-space-size=600', path.join(aquí, 'remotion-worker.mjs'), JSON.stringify({ dir, seg, browser: process.env.REMOTION_BROWSER || '', concurrency: Number(process.env.RM_CONCURRENCY || 1) })], { cwd: RAIZ, timeout: 900000 });
      const m = /@@(OK|COMPILA|RENDER)@@(\{.*\})/.exec(r.out);
      const info = m ? JSON.parse(m[2]) : {};
      if (!m || m[1] !== 'OK') {
        if (!m) throw new Error(`El render de Remotion se cortó (código ${r.code}). Casi seguro se acabó la memoria del servidor: sube el plan de Railway o usa HyperFrames. ${r.err.slice(-200)}`);
        if (m[1] === 'COMPILA') throw new Error(`El código no compila. Corrígelo y vuelve a entregar:\n${info.mensaje}${notas.length ? `\nTomas: ${notas.join('; ')}` : ''}`);
        throw new Error(`El render falló: ${info.mensaje}${info.consola ? `\nConsola: ${info.consola}` : ''}`);
      }
      const silencio = path.join(dir, 'silencio.mp4');
      const d = await dur(silencio);
      const { voces, musica } = await generarAudio({ narraciones, musicaPrompt, duracion: d, campaignId, agente });
      await mezclar(silencio, final, { voces, musica, duracion: d });
      fs.unlinkSync(silencio);
      guardarFinal(k, final);
      return { clave: k, archivo: 'final.mp4', duracion: d, resumen: `Remotion · ${d.toFixed(1)} s · ${voces.length} voz(es) · música ${musica ? 'IA' : 'no'}` };
    });
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

export function remotionGuide() {
  return `VIDEOS CON REMOTION (herramienta entregar_remotion)
Remotion hace videos con componentes de React: lo tuyo es un archivo TSX con UN componente por defecto. Úsalo cuando necesites lógica o animación programada (física con spring, datos, gráficas, secuencias complejas). HyperFrames (HTML+GSAP) y Remotion llegan al mismo tipo de calidad: elige el que te resulte más claro para la pieza.
REGLAS:
1. Archivo único: "export default function Comp() { ... }" (React + TypeScript). Lienzo 1080×1920 a 30 fps. La duración en segundos va en el parámetro "duracion" de la herramienta (máx. 60).
2. Imports permitidos SOLO de: react, remotion, @remotion/shapes, @remotion/paths, @remotion/transitions, @remotion/motion-blur, @remotion/noise, @remotion/layout-utils, @remotion/google-fonts. Nada de fetch, process, require, eval ni iframes.
3. Todo se anima con el fotograma: const frame = useCurrentFrame(); const { fps, durationInFrames } = useVideoConfig(); y interpolate() / spring(). PROHIBIDO usar transiciones o animaciones CSS, setTimeout/setInterval o Math.random() sin semilla (usa random("semilla") de remotion).
4. Estructura con <AbsoluteFill> y <Sequence from={fotograma} durationInFrames={n}> (las escenas). Texto grande y legible, márgenes de ~100 px, nunca dos textos encimados.
5. Tomas reales: pasa "tomas" [{id:"t1", busqueda:"concrete english query", duracion:3}] y úsalas con <OffthreadVideo src={staticFile("tomas/t1.mp4")} muted style={{width:1080,height:1920,objectFit:"cover"}} />.
5b. ARCHIVOS DEL JEFE (logo, fotos): míralos en tu carpeta subidos/ con ver_archivos y ver_imagen; pasa "archivos" [{ruta:"subidos/logo.png", nombre:"logo.png"}] y úsalos con <Img src={staticFile("logo.png")} /> (Img de remotion).
6. Un elemento con position:'absolute' necesita left:0, right:0 y textAlign:'center' (o un ancho) si lo quieres centrado.
7. El sonido NO va en el componente: usa "narraciones" [{inicio, texto}] y "musicaPrompt" (el servidor genera y mezcla voz y música).
EJEMPLO:
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Sequence } from 'remotion';
export default function Comp() {
  const frame = useCurrentFrame(); const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 12 } });
  const o = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  return (<AbsoluteFill style={{ background: 'linear-gradient(160deg,#0f1b3d,#162a63)', fontFamily: 'Inter, Arial, sans-serif', color: '#fff', justifyContent: 'center', alignItems: 'center' }}>
    <div style={{ fontSize: 96, fontWeight: 900, textAlign: 'center', padding: '0 100px', opacity: o, transform: \`scale(\${0.8 + 0.2 * s})\` }}>TU NEGOCIO NUNCA DUERME</div>
    <Sequence from={30}><div style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', top: 1150, fontSize: 70, color: '#2de2c5', fontWeight: 800 }}>con un chatbot</div></Sequence>
  </AbsoluteFill>);
}`;
}
