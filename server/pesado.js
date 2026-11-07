// Los trabajos pesados (Chromium + ffmpeg) se hacen de uno en uno para no agotar la memoria.
let cola = Promise.resolve();
export function conTurno(fn) {
  const r = cola.then(fn, fn);
  cola = r.then(() => {}, () => {});
  return r;
}
