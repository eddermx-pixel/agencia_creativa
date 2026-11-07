// Proceso aparte para compilar y renderizar con Remotion: si se acaba la memoria, cae este proceso y no la app.
import path from 'node:path';
const { dir, seg, browser, concurrency } = JSON.parse(process.argv[2]);
const quitaColor = (t) => String(t).replace(/\x1b\[[0-9;]*m/g, '');
const salir = (tag, obj) => { process.stdout.write(`\n@@${tag}@@${JSON.stringify(obj)}\n`); process.exit(tag === 'OK' ? 0 : 1); };
try {
  const { bundle } = await import('@remotion/bundler');
  const { renderMedia, selectComposition } = await import('@remotion/renderer');
  let serveUrl;
  try { serveUrl = await bundle({ entryPoint: path.join(dir, 'src', 'index.ts'), publicDir: path.join(dir, 'public'), onProgress: () => {} }); }
  catch (e) { salir('COMPILA', { mensaje: quitaColor(e.message).slice(0, 900) }); }
  const consola = [];
  try {
    const comp = await selectComposition({ serveUrl, id: 'Main', browserExecutable: browser || undefined, onBrowserLog: (l) => consola.push(l.text) });
    await renderMedia({ composition: comp, serveUrl, codec: 'h264', outputLocation: path.join(dir, 'silencio.mp4'), browserExecutable: browser || undefined, muted: true, concurrency, onBrowserLog: (l) => l.type === 'error' && consola.push(l.text), timeoutInMilliseconds: 120000 });
    salir('OK', {});
  } catch (e) { salir('RENDER', { mensaje: quitaColor(e.message).slice(0, 700), consola: consola.slice(0, 4).join(' | ').slice(0, 400) }); }
} catch (e) { salir('RENDER', { mensaje: quitaColor(e.message).slice(0, 700) }); }
