// Librería 3D de personajes y escenas para HyperFrames (Three.js). Personajes estilizados, expresivos y reutilizables.
// Todo es función del tiempo `t` (segundos): sin random, sin reloj, sin requestAnimationFrame → renderiza igual en cada fotograma.
// Se copia al proyecto como assets/three/personajes.js (junto a three.module.js) y se usa así:
//   import { crearEscena, crearPersonaje, animarPersonaje, telefono, mostrador, sillon, plancha, burbuja } from "./assets/three/personajes.js";
import * as THREE from './three.module.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.04, ...o });
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const suave = (k) => k * k * (3 - 2 * k);
const TINTA = 0x0b1220;

// Contorno tipo caricatura: copia ligeramente más grande, vista por dentro.
function contorno(mesh, grosor = 0.045, color = TINTA) {
  const o = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }));
  o.scale.setScalar(1 + grosor); mesh.add(o); return mesh;
}
const malla = (geo, color, o) => { const m = new THREE.Mesh(geo, std(color, o)); return m; };

// ---------------- Emociones ----------------
// angulo: ceja (rad, + = extremo interno arriba: preocupación; − = enojo) · cejaY: altura · ojo: apertura · curv: sonrisa(+)/ceño(−) · abierta: boca abierta · ancho: ancho de boca
export const EMOCIONES = {
  neutral:     { angulo: 0,     cejaY: 0,     ojo: 1,    curv: 0.25, abierta: 0,    ancho: 1 },
  alegria:     { angulo: -0.06, cejaY: 0.05,  ojo: 0.78, curv: 1,    abierta: 0.3,  ancho: 1.2 },
  tranquilo:   { angulo: 0.04,  cejaY: 0.02,  ojo: 0.82, curv: 0.65, abierta: 0,    ancho: 1.05 },
  panico:      { angulo: 0.5,   cejaY: 0.16,  ojo: 1.3,  curv: -0.55, abierta: 0.75, ancho: 0.9 },
  preocupado:  { angulo: 0.42,  cejaY: 0.07,  ojo: 1.05, curv: -0.4, abierta: 0,    ancho: 0.9 },
  sorpresa:    { angulo: 0.05,  cejaY: 0.22,  ojo: 1.38, curv: 0,    abierta: 0.6,  ancho: 0.7 },
  enojo:       { angulo: -0.55, cejaY: -0.02, ojo: 0.85, curv: -0.5, abierta: 0.1,  ancho: 1 },
  cansado:     { angulo: 0.25,  cejaY: -0.05, ojo: 0.55, curv: -0.1, abierta: 0,    ancho: 0.95 },
  hablando:    { angulo: 0.02,  cejaY: 0.03,  ojo: 1,    curv: 0.5,  abierta: 0.25, ancho: 1 },
};
function mezclaEmocion(lista, t) {
  // lista: [[segundo, 'emocion'], ...] → interpola suavemente (0.45 s) hacia la ÚLTIMA marca que ya pasó
  const k = (lista && lista.length ? lista : [[0, 'neutral']]).slice().sort((a, b) => a[0] - b[0]);
  const emo = (i) => EMOCIONES[k[Math.max(0, i)][1]] || EMOCIONES.neutral;
  let i = -1; for (let j = 0; j < k.length; j++) if (t >= k[j][0]) i = j;
  if (i < 0) return { ...emo(0) };
  const act = emo(i), prev = i > 0 ? emo(i - 1) : act, f = suave(clamp((t - k[i][0]) / 0.45));
  const r = {}; for (const c of Object.keys(act)) r[c] = lerp(prev[c], act[c], f);
  return r;
}

// ---------------- Gestos de brazo ----------------
// [salida lateral del hombro, adelante del hombro, doblez del codo] (rad). El signo lateral se ajusta por lado.
export const GESTOS = {
  reposo:     [0.16, 0.05, -0.18],
  telefono:   [0.30, -0.55, -1.35],
  saludo:     [2.55, 0, -0.35],
  panico:     [2.1, -0.25, -0.7],
  trabajando: [0.42, -0.75, -1.05],
  senalar:    [0.5, -1.35, -0.12],
  celebrar:   [2.9, 0, -0.2],
  cadera:     [0.75, 0, -1.45],
  pensar:     [0.4, -0.9, -2.2],
};
function mezclaGesto(lista, t) {
  const k = (lista && lista.length ? lista : [[0, 'reposo']]).slice().sort((a, b) => a[0] - b[0]);
  const ges = (i) => GESTOS[k[Math.max(0, i)][1]] || GESTOS.reposo;
  let i = -1; for (let j = 0; j < k.length; j++) if (t >= k[j][0]) i = j;
  if (i < 0) return ges(0).slice();
  const act = ges(i), prev = i > 0 ? ges(i - 1) : act, f = suave(clamp((t - k[i][0]) / 0.5));
  return act.map((v, j) => lerp(prev[j], v, f));
}

// ---------------- Personaje ----------------
// opts: { piel, pelo:{estilo:'mono'|'corto'|'largo'|'calvo', color}, ropa:{tipo:'bata'|'delantal'|'playera'|'saco', color, acento}, acento,
//         accesorios:['cubrebocas','guantes','gorro-chef','gorra','bigote','lentes','corbata'], cuerpo:'busto'|'completo', escala }
export function crearPersonaje(opts = {}) {
  const piel = opts.piel ?? 0xf0c4a0, acento = opts.acento ?? 0xff7a1a;
  const pelo = { estilo: 'corto', color: 0x2a1a14, ...(opts.pelo || {}) };
  const ropa = { tipo: 'playera', color: 0x1b4fd6, acento, ...(opts.ropa || {}) };
  const acc = new Set(opts.accesorios || []);
  const raiz = new THREE.Group(); const g = new THREE.Group(); raiz.add(g);
  const tronco = new THREE.Group(); g.add(tronco);

  // Torso
  const torso = contorno(malla(new THREE.CapsuleGeometry(0.66, 0.95, 8, 24), ropa.color)); torso.position.y = 0.95; tronco.add(torso);
  if (ropa.tipo === 'bata') {
    for (const s of [-1, 1]) { const sol = malla(new THREE.BoxGeometry(0.22, 0.75, 0.06), 0xe6eef9); sol.position.set(s * 0.2, 1.62, 0.62); sol.rotation.z = s * -0.38; tronco.add(sol); }
    const bols = malla(new THREE.BoxGeometry(0.3, 0.3, 0.05), 0xdde6f2); bols.position.set(0.32, 1.05, 0.66); tronco.add(bols);
    const cuello = malla(new THREE.BoxGeometry(0.42, 0.55, 0.05), ropa.acento ?? acento); cuello.position.set(0, 1.58, 0.63); tronco.add(cuello);
  }
  if (ropa.tipo === 'delantal') {
    const geo = new THREE.CylinderGeometry(0.7, 0.74, 1.25, 36, 1, true, -Math.PI * 0.4, Math.PI * 0.8);
    const del = new THREE.Mesh(geo, std(ropa.acento ?? 0xffffff, { roughness: 0.8, side: THREE.DoubleSide })); del.position.y = 0.82; tronco.add(del);
    const borde = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: TINTA, side: THREE.BackSide })); borde.scale.set(1.03, 1.02, 1.03); del.add(borde);
    const bols = contorno(malla(new THREE.BoxGeometry(0.5, 0.3, 0.05), 0xffffff, { roughness: 0.8 }), 0.06); bols.position.set(0, 0.62, 0.76); tronco.add(bols);
    const tira = malla(new THREE.TorusGeometry(0.36, 0.035, 8, 24, Math.PI), ropa.acento ?? 0xffffff); tira.position.set(0, 1.5, 0.38); tira.rotation.set(0.35, 0, Math.PI); tronco.add(tira);
  }
  if (ropa.tipo === 'saco') {
    for (const s of [-1, 1]) { const sol = malla(new THREE.BoxGeometry(0.22, 0.9, 0.07), 0x10192e); sol.position.set(s * 0.26, 1.4, 0.62); sol.rotation.z = s * -0.3; tronco.add(sol); }
    const cam = malla(new THREE.BoxGeometry(0.4, 0.8, 0.05), 0xffffff); cam.position.set(0, 1.35, 0.62); tronco.add(cam);
  }
  if (acc.has('corbata')) { const co = malla(new THREE.BoxGeometry(0.14, 0.55, 0.06), acento); co.position.set(0, 1.25, 0.7); tronco.add(co); }

  // Piernas (solo cuerpo completo)
  if (opts.cuerpo === 'completo') {
    for (const s of [-1, 1]) {
      const pierna = contorno(malla(new THREE.CapsuleGeometry(0.26, 1.0, 6, 16), 0x24304f)); pierna.position.set(s * 0.32, -0.7, 0); g.add(pierna);
      const pie = contorno(malla(new THREE.SphereGeometry(0.34, 16, 12), 0x10192e)); pie.scale.set(1, 0.55, 1.4); pie.position.set(s * 0.32, -1.5, 0.16); g.add(pie);
    }
  }

  // Cabeza
  const cabeza = new THREE.Group(); cabeza.position.y = 2.62; g.add(cabeza);
  const craneo = contorno(malla(new THREE.SphereGeometry(0.92, 40, 30), piel, { roughness: 0.7 })); craneo.scale.set(1, 0.96, 0.96); cabeza.add(craneo);
  for (const s of [-1, 1]) { const oreja = contorno(malla(new THREE.SphereGeometry(0.2, 12, 10), piel), 0.06); oreja.scale.set(0.6, 1, 0.8); oreja.position.set(s * 0.92, -0.02, 0); cabeza.add(oreja); }
  const nariz = malla(new THREE.SphereGeometry(0.1, 12, 10), piel, { roughness: 0.6 }); nariz.position.set(0, -0.12, 0.9); nariz.scale.set(1, 0.9, 0.9); cabeza.add(nariz);
  // mejillas
  const rubores = [];
  for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), new THREE.MeshBasicMaterial({ color: 0xff7a7a, transparent: true, opacity: 0.0 })); r.position.set(s * 0.52, -0.3, 0.86); r.rotation.y = s * 0.4; cabeza.add(r); rubores.push(r); }

  // Ojos y cejas
  const ojos = [], pupilas = [], cejas = [];
  for (const s of [-1, 1]) {
    const o = new THREE.Group(); o.position.set(s * 0.33, 0.08, 0.8); cabeza.add(o);
    const blanco = contorno(malla(new THREE.SphereGeometry(0.235, 24, 18), 0xffffff, { roughness: 0.3 }), 0.07); blanco.scale.set(1, 1, 0.55); o.add(blanco);
    const pu = malla(new THREE.SphereGeometry(0.125, 20, 14), 0x1a1208, { roughness: 0.2 }); pu.position.z = 0.1; pu.scale.set(1, 1, 0.5); o.add(pu);
    const br = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); br.position.set(0.04, 0.045, 0.07); pu.add(br);
    ojos.push(o); pupilas.push(pu);
    const ce = new THREE.Group(); ce.position.set(s * 0.33, 0.45, 0.84); cabeza.add(ce);
    const cb = contorno(malla(new THREE.CapsuleGeometry(0.045, 0.26, 4, 8), pelo.estilo === 'calvo' ? 0x3a2a20 : pelo.color), 0.1); cb.rotation.z = Math.PI / 2; ce.add(cb);
    cejas.push(ce);
  }

  // Boca: arco (sonrisa/ceño) + boca abierta
  const boca = new THREE.Group(); boca.position.set(0, -0.42, 0.84); cabeza.add(boca);
  const arco = malla(new THREE.TorusGeometry(0.22, 0.05, 10, 28, Math.PI), 0x4a1c1c, { roughness: 0.5 }); boca.add(arco);
  const adentro = malla(new THREE.SphereGeometry(0.2, 20, 14), 0x3b0f14, { roughness: 0.6 }); adentro.scale.set(1, 0.01, 0.4); adentro.position.z = -0.02; boca.add(adentro);
  const lengua = malla(new THREE.SphereGeometry(0.11, 14, 10), 0xe0607a); lengua.position.set(0, -0.06, 0.0); lengua.scale.set(1, 0.01, 0.5); boca.add(lengua);

  // Accesorios de cara
  let cubrebocas = null;
  if (acc.has('cubrebocas')) {
    cubrebocas = new THREE.Group(); cubrebocas.position.set(0, -0.3, 0.64); cabeza.add(cubrebocas);
    const placa = contorno(malla(new THREE.SphereGeometry(0.66, 28, 18), 0xaee3f5, { roughness: 0.8 }), 0.05); placa.scale.set(1.04, 0.58, 0.55); cubrebocas.add(placa);
    for (let i = -1; i <= 1; i++) { const pl = malla(new THREE.BoxGeometry(1.0, 0.025, 0.02), 0x7fc3dc); pl.position.set(0, i * 0.13, 0.36 - Math.abs(i) * 0.06); cubrebocas.add(pl); }
    for (const s of [-1, 1]) { const li = malla(new THREE.TorusGeometry(0.3, 0.015, 6, 16, Math.PI), 0xd5eef7); li.position.set(s * 0.62, 0.1, -0.1); li.rotation.set(0, s * Math.PI / 2, 0); cubrebocas.add(li); }
    boca.visible = false;
  }
  if (acc.has('bigote')) {
    for (const s of [-1, 1]) { const b = contorno(malla(new THREE.CapsuleGeometry(0.06, 0.34, 4, 10), pelo.color), 0.1); b.position.set(s * 0.17, -0.25, 0.9); b.rotation.z = Math.PI / 2 - s * 0.3; cabeza.add(b); }
  }
  if (acc.has('lentes')) {
    for (const s of [-1, 1]) { const a = malla(new THREE.TorusGeometry(0.27, 0.03, 8, 24), 0x10192e); a.position.set(s * 0.33, 0.08, 0.95); cabeza.add(a); }
    const pu = malla(new THREE.BoxGeometry(0.16, 0.03, 0.03), 0x10192e); pu.position.set(0, 0.1, 0.95); cabeza.add(pu);
  }

  // Pelo y sombreros
  const cap = (r, y, z = 0, desde = 0, hasta = Math.PI * 0.37) => { const m = contorno(malla(new THREE.SphereGeometry(r, 32, 22, 0, Math.PI * 2, desde, hasta), pelo.color, { roughness: 0.85 }), 0.04); m.position.set(0, y, z); return m; };
  if (pelo.estilo === 'corto') { const m = cap(0.97, 0.02, -0.04); m.rotation.x = -0.28; cabeza.add(m); }
  if (pelo.estilo === 'mono') {
    const m = cap(0.97, 0.02, -0.05); m.rotation.x = -0.35; cabeza.add(m);
    const mo = contorno(malla(new THREE.SphereGeometry(0.34, 20, 16), pelo.color, { roughness: 0.85 }), 0.07); mo.position.set(0, 1.0, -0.38); cabeza.add(mo);
  }
  if (pelo.estilo === 'largo') {
    const m = cap(0.98, 0.02, -0.06, 0, Math.PI * 0.46); m.rotation.x = -0.3; cabeza.add(m);
    for (const s of [-1, 1]) { const l = contorno(malla(new THREE.CapsuleGeometry(0.22, 1.1, 6, 12), pelo.color, { roughness: 0.85 }), 0.05); l.position.set(s * 0.82, -0.6, -0.22); cabeza.add(l); }
  }
  if (acc.has('gorro-chef')) {
    const base = contorno(malla(new THREE.CylinderGeometry(0.72, 0.78, 0.45, 28), 0xffffff, { roughness: 0.9 }), 0.04); base.position.set(0, 0.95, -0.02); cabeza.add(base);
    for (const [x, z] of [[-0.35, 0], [0.35, 0], [0, 0.25], [0, -0.25], [0, 0]]) { const p = contorno(malla(new THREE.SphereGeometry(0.42, 20, 16), 0xffffff, { roughness: 0.9 }), 0.05); p.position.set(x, 1.45, z); cabeza.add(p); }
  }
  if (acc.has('gorra')) {
    const c = cap(1.0, 0.06, -0.02, 0, Math.PI * 0.42); c.material.color.setHex(acento); c.rotation.x = -0.1; cabeza.add(c);
    const v = contorno(malla(new THREE.SphereGeometry(0.6, 24, 12), acento), 0.05); v.scale.set(1.05, 0.13, 0.85); v.position.set(0, 0.52, 0.78); v.rotation.x = 0.18; cabeza.add(v);
  }

  // Brazos (hombro + codo)
  const brazos = [];
  for (const s of [-1, 1]) {
    const hombro = new THREE.Group(); hombro.position.set(s * 0.84, 1.62, 0); tronco.add(hombro);
    const manga = ropa.tipo === 'bata' ? 0xffffff : ropa.color;
    const sup = contorno(malla(new THREE.CapsuleGeometry(0.19, 0.5, 6, 14), manga)); sup.position.y = -0.38; hombro.add(sup);
    const codo = new THREE.Group(); codo.position.y = -0.78; hombro.add(codo);
    const antebrazo = contorno(malla(new THREE.CapsuleGeometry(0.16, 0.45, 6, 14), ropa.tipo === 'delantal' ? piel : manga)); antebrazo.position.y = -0.36; codo.add(antebrazo);
    const mano = contorno(malla(new THREE.SphereGeometry(0.21, 16, 12), acc.has('guantes') ? 0x5ec8ea : piel, { roughness: acc.has('guantes') ? 0.35 : 0.7 })); mano.position.y = -0.78; codo.add(mano);
    brazos.push({ hombro, codo, mano, lado: s });
  }

  raiz.scale.setScalar(opts.escala ?? 1);
  return { grupo: raiz, g, tronco, cabeza, ojos, pupilas, cejas, boca, arco, adentro, lengua, rubores, brazos, cubrebocas, id: opts.id || 'p', fase: opts.fase ?? 0 };
}

// Anima al personaje en el segundo `t`. Todo opcional:
//  emociones: [[0,'panico'],[6,'alegria']]   gestos: { izq:[[0,'reposo'],[3,'telefono']], der:[...] } (izq/der = lado de la pantalla)
//  habla: [[1.2,3.4],[5,8]] (intervalos con la boca moviéndose)   mirada: [x,y] −1..1   giro: rotación Y (rad)   energia: 0..2 (amplitud de movimiento)
export function animarPersonaje(p, t, o = {}) {
  const f = (p.fase || 0), en = o.energia ?? 1;
  const em = mezclaEmocion(o.emociones, t);
  // reposo: respiración, balanceo y parpadeo (determinista: cada ~3.4 s, dura 0.16 s)
  const resp = Math.sin((t + f) * 2.1) * 0.018 * en;
  p.tronco.scale.set(1 + resp * 0.5, 1 + resp, 1 + resp * 0.5);
  p.g.rotation.y = (o.giro ?? 0) + Math.sin((t + f) * 0.9) * 0.03 * en;
  p.g.position.y = Math.sin((t + f) * 2.1 + 0.6) * 0.012 * en;
  p.cabeza.rotation.z = Math.sin((t + f) * 1.1) * 0.035 * en + (em.angulo > 0.3 ? Math.sin((t + f) * 9) * 0.02 : 0);
  p.cabeza.rotation.x = Math.sin((t + f) * 0.8) * 0.02 * en;
  const ciclo = ((t + f * 1.7) % 3.4), parp = ciclo < 0.16 ? Math.sin((ciclo / 0.16) * Math.PI) : 0;
  const abierta = em.ojo * (1 - 0.93 * parp);
  const mx = (o.mirada?.[0] ?? 0), my = (o.mirada?.[1] ?? 0);
  p.ojos.forEach((ojo) => ojo.scale.set(1, Math.max(0.06, abierta), 1));
  p.pupilas.forEach((pu) => { pu.position.x = mx * 0.07; pu.position.y = my * 0.06; });
  // cejas
  p.cejas.forEach((ce, i) => { const s = i === 0 ? -1 : 1; ce.position.y = 0.45 + em.cejaY; ce.rotation.z = -s * em.angulo; });
  // boca (curvatura, apertura, habla)
  let hab = 0; for (const [a, b] of (o.habla || [])) if (t >= a && t <= b) hab = 0.28 + 0.22 * Math.abs(Math.sin((t - a) * 11 + f));
  const ab = clamp(em.abierta + hab, 0, 1);
  const curv = em.curv;
  p.boca.scale.set(em.ancho, 1, 1);
  p.arco.visible = true;
  p.arco.rotation.z = curv >= 0 ? Math.PI : 0;            // sonrisa ∪ / ceño ∩
  p.arco.scale.set(1, Math.max(0.12, Math.abs(curv)), 1);
  p.arco.position.y = curv >= 0 ? 0.05 + (1 - Math.abs(curv)) * 0 : -0.05;
  p.adentro.scale.set(1, Math.max(0.01, ab * 0.9), 0.4); p.adentro.position.y = curv >= 0 ? 0.0 : -0.04;
  p.lengua.scale.set(1, ab > 0.3 ? ab * 0.5 : 0.01, 0.5); p.lengua.position.y = -0.06 - ab * 0.08;
  p.rubores.forEach((r) => (r.material.opacity = clamp(em.curv > 0.6 ? (em.curv - 0.6) * 0.9 : 0, 0, 0.35)));
  if (p.cubrebocas) p.cubrebocas.scale.y = 1 + (hab ? Math.sin(t * 22) * 0.05 : 0);
  // brazos
  const lados = { [-1]: o.gestos?.izq, [1]: o.gestos?.der };
  p.brazos.forEach((b, i) => {
    const [out, adel, cod] = mezclaGesto(lados[b.lado], t);
    const sway = Math.sin((t + f) * 2.4 + i * 1.7) * 0.05 * en;
    const actual = (() => { const l = (lados[b.lado] || []).filter(([a]) => t >= a).sort((x, y) => x[0] - y[0]); return l.length ? l[l.length - 1][1] : 'reposo'; })();
    const trabajo = actual === 'trabajando' ? Math.sin(t * 7 + i * Math.PI) * 0.22 * en : 0;
    const agita = actual === 'saludo' ? Math.sin(t * 8) * 0.28 : 0;
    const pan = actual === 'panico' ? Math.sin(t * 14 + i) * 0.12 : 0;
    b.hombro.rotation.set(adel + trabajo * 0.4, 0, b.lado * out + sway + pan);
    b.codo.rotation.set(cod + trabajo + agita, 0, 0);
  });
}

// ---------------- Escena ----------------
// canvas: <canvas> del HTML (ancho×alto en pixeles). Devuelve { renderer, scene, camera, render() }.
export function crearEscena(canvas, ancho, alto, o = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(1); renderer.setSize(ancho, alto, false); renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(o.fov ?? 32, ancho / alto, 0.1, 200);
  const pos = o.camara || [0, 2.2, 13]; camera.position.set(...pos); camera.lookAt(...(o.mira || [0, 1.6, 0]));
  scene.add(new THREE.HemisphereLight(0xffffff, o.suelo ?? 0x233a6b, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3.5, 6, 7); scene.add(key);
  const rim = new THREE.DirectionalLight(o.rim ?? 0x9fb8ff, 1.1); rim.position.set(-5, 3, -4); scene.add(rim);
  return { renderer, scene, camera, render() { renderer.render(scene, camera); } };
}
// sombra suave bajo un objeto
export function sombra(radio = 1.2, opacidad = 0.28) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(radio, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: opacidad }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.01; return m;
}

// ---------------- Objetos ----------------
export function telefono(o = {}) {
  const g = new THREE.Group();
  const cuerpo = contorno(malla(new THREE.BoxGeometry(1.0, 2.0, 0.14), o.color ?? 0x1b2f66, { metalness: 0.35, roughness: 0.35 }), 0.03); g.add(cuerpo);
  const pant = malla(new THREE.PlaneGeometry(0.88, 1.84), o.pantalla ?? 0xff7a1a, { emissive: o.brillo ?? 0x2a1200, roughness: 0.5 }); pant.position.z = 0.075; g.add(pant);
  const nt = malla(new THREE.BoxGeometry(0.3, 0.07, 0.02), 0x0b1220); nt.position.set(0, 0.86, 0.085); g.add(nt);
  if (o.insignia) { const ins = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshBasicMaterial({ color: o.insigniaColor ?? 0xe23b3b })); ins.position.set(0.42, 0.9, 0.1); g.add(ins); g.userData.insignia = ins; }
  return g;
}
export function mostrador(o = {}) {
  const g = new THREE.Group(); const w = o.ancho ?? 5.2;
  const frente = contorno(malla(new THREE.BoxGeometry(w, 1.5, 0.9), o.color ?? 0x1b4fd6), 0.02); frente.position.y = 0.75; g.add(frente);
  const tapa = contorno(malla(new THREE.BoxGeometry(w + 0.3, 0.14, 1.2), o.tapa ?? 0xe8dcc6), 0.02); tapa.position.y = 1.55; g.add(tapa);
  return g;
}
export function plancha(o = {}) {
  const g = new THREE.Group();
  const base = contorno(malla(new THREE.BoxGeometry(2.4, 0.18, 1.0), 0x2c2f38, { metalness: 0.5, roughness: 0.3 }), 0.03); g.add(base);
  const n = o.tacos ?? 4;
  for (let i = 0; i < n; i++) { const t = contorno(malla(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 14, 1, false, 0, Math.PI), i % 2 ? 0xf2c14e : 0xe9a23b), 0.05); t.rotation.set(0, 0, Math.PI / 2); t.rotation.y = 0.4; t.position.set(-0.8 + i * 0.5, 0.26, 0); g.add(t); }
  return g;
}
export function sillon(o = {}) {
  const g = new THREE.Group(); const c = o.color ?? 0x3a64c8;
  const base = contorno(malla(new THREE.CylinderGeometry(0.4, 0.55, 0.5, 18), 0x2c3550), 0.03); base.position.y = 0.25; g.add(base);
  const asiento = contorno(malla(new THREE.BoxGeometry(1.3, 0.3, 1.5), c), 0.03); asiento.position.y = 0.7; g.add(asiento);
  const resp = contorno(malla(new THREE.BoxGeometry(1.3, 1.5, 0.3), c), 0.03); resp.position.set(0, 1.4, -0.75); resp.rotation.x = -0.35; g.add(resp);
  const cab = contorno(malla(new THREE.BoxGeometry(0.7, 0.4, 0.28), c), 0.04); cab.position.set(0, 2.3, -1.1); cab.rotation.x = -0.35; g.add(cab);
  return g;
}
export function burbuja(o = {}) {
  const g = new THREE.Group(); const w = o.ancho ?? 2.4, alto = o.alto ?? 0.8;
  const cuerpo = contorno(malla(new THREE.CapsuleGeometry(alto / 2, w - alto, 8, 16), o.color ?? 0xffffff, { roughness: 0.4 }), 0.04); cuerpo.rotation.z = Math.PI / 2; cuerpo.scale.set(1, 1, 0.5); g.add(cuerpo);
  const cola = malla(new THREE.ConeGeometry(0.16, 0.3, 4), o.color ?? 0xffffff); cola.position.set(o.cola === 'der' ? w / 2 - 0.5 : -w / 2 + 0.5, -alto / 2 - 0.08, 0); cola.rotation.z = Math.PI; g.add(cola);
  return g;
}
export function pared(o = {}) {
  const m = malla(new THREE.PlaneGeometry(o.ancho ?? 24, o.alto ?? 14), o.color ?? 0x13306b, { roughness: 0.95 }); m.position.set(0, (o.alto ?? 14) / 2 - 1, o.z ?? -4); return m;
}
export function suelo(o = {}) {
  const m = malla(new THREE.PlaneGeometry(o.ancho ?? 30, o.fondo ?? 16), o.color ?? 0x0c1730, { roughness: 0.9 }); m.rotation.x = -Math.PI / 2; m.position.set(0, 0, o.z ?? 2); return m;
}
