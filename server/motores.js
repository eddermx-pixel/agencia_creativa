// Diagnóstico de los motores de video: ¿están instalados y funcionan en ESTE servidor?
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { HF_DIR, hfDisponible, catalogoEstilos, producir, correr } from './hyperframes.js';
import { remotionDisponible, producirRemotion } from './remotion.js';
import { renderDisponible } from './render.js';
import { vozDisponible } from './voz.js';
import { musicaDisponible } from './musica.js';
import { brollDisponible } from './video.js';

const version = (pkg) => { try { return JSON.parse(fs.readFileSync(path.resolve('node_modules', pkg, 'package.json'), 'utf8')).version; } catch { return null; } };
const prueba = async (nombre, fn) => { const t = Date.now(); try { await fn(); return { ok: true, segundos: Math.round((Date.now() - t) / 100) / 10 }; } catch (e) { return { ok: false, error: String(e.message).slice(0, 400), segundos: Math.round((Date.now() - t) / 100) / 10 }; } };
const limpia = (k) => { try { fs.rmSync(path.join(HF_DIR, k), { recursive: true, force: true }); } catch {} };

const HF_MINI = `<!doctype html><html><head><meta charset="utf-8"><script src="assets/gsap.min.js"></script><style>html,body{margin:0;background:#0f1b3d}#root{position:relative;width:1080px;height:1920px;overflow:hidden;background:#0f1b3d;font-family:"Inter",sans-serif;color:#fff}#t{position:absolute;left:100px;right:100px;top:880px;text-align:center;font-size:110px;font-weight:900}</style></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="2" data-width="1080" data-height="1920"><div id="t" class="clip" data-start="0" data-duration="2">PRUEBA OK</div></div><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});tl.fromTo("#t",{opacity:0,y:40},{opacity:1,y:0,duration:.5},0);window.__timelines["main"]=tl;</script></body></html>`;
const RM_MINI = `import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
export default function Comp() { const f = useCurrentFrame(); return (<AbsoluteFill style={{ background: '#0f1b3d', color: '#fff', justifyContent: 'center', alignItems: 'center', fontSize: 110, fontWeight: 900, fontFamily: 'Arial', opacity: interpolate(f, [0, 15], [0, 1], { extrapolateRight: 'clamp' }) }}>PRUEBA OK</AbsoluteFill>); }`;

export function registrar(app) {
  app.get('/api/motores/estado', async (req, res) => {
    const ff = await correr('ffmpeg', ['-version']).then((r) => (r.code === 0 ? r.out.split('\n')[0].slice(0, 40) : null)).catch(() => null);
    const r = await renderDisponible();
    const out = {
      ffmpeg: ff,
      render_servidor: r.ok ? 'listo' : r.motivo,
      hyperframes: { instalado: hfDisponible(), version: version('hyperframes') },
      remotion: { instalado: remotionDisponible(), version: version('remotion') },
      estilos_de_pelicula: catalogoEstilos().split('\n').filter(Boolean).length,
      voz_elevenlabs: vozDisponible(), musica_ia: musicaDisponible(), tomas_stock: brollDisponible(),
    };
    if (req.query.probar) {
      out.pruebas = {};
      if (['hf', 'todo'].includes(req.query.probar)) { const k = `diag-hf-${Date.now()}`; out.pruebas.hyperframes = await prueba('hf', () => producir({ clave: k, html: HF_MINI })); limpia(k); }
      if (['remotion', 'todo'].includes(req.query.probar)) { const k = `diag-rm-${Date.now()}`; out.pruebas.remotion = await prueba('rm', () => producirRemotion({ clave: k, codigo: RM_MINI, duracion: 3 })); limpia(k); }
    }
    res.json(out);
  });
}
