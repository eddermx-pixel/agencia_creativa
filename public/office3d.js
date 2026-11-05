// Oficina en 3D: personajes low-poly que trabajan, toman café, caminan a tu
// escritorio cuando te necesitan y al muro del feed cuando entregan.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { store, byId, esc } from './common.js';

const CORRIDOR = -2.4;
const DESKS = {
  investigador: { x: -8, z: -4 }, copy: { x: -3, z: -4 }, disenador: { x: 2, z: -4 },
  video: { x: -8, z: 1 }, calidad: { x: -3, z: 1 }, director: { x: 2, z: 1 },
};
const EXTRA_DESKS = [{ x: -8, z: 5 }, { x: -3, z: 5 }];
const BOSS = { x: 6.5, z: 4.4 };
const BOSS_SLOTS = [{ x: 5, z: 2.4 }, { x: 6.5, z: 2.2 }, { x: 8, z: 2.4 }, { x: 9.4, z: 2.6 }, { x: 3.8, z: 2.6 }];
const COFFEE_SPOTS = [{ x: -10.5, z: -2.9 }, { x: -10.5, z: -1.7 }, { x: -10.5, z: -0.5 }];
const FEED_SPOTS = [{ x: 8.2, z: -6.4 }, { x: 9.4, z: -6.5 }, { x: 10.6, z: -6.4 }, { x: 7.2, z: -6.2 }];

const pendingReqs = (id) => store.requests.filter((r) => r.agente === id && r.estado === 'pendiente');
const pendingPieces = (id) => store.pieces.filter((p) => p.agente === id && p.estado === 'pendiente');

export function createOffice(container, { onAgent, onBoss, onFeed }) {
  // ---------- Motor ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.append(renderer.domElement);

  const overlay = document.createElement('div');
  overlay.className = 'ov';
  container.append(overlay);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d0d16');
  scene.fog = new THREE.Fog('#0d0d16', 38, 70);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(-0.5, 0, -0.5);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 14;
  controls.maxDistance = 80;
  controls.minPolarAngle = 0.45;
  controls.maxPolarAngle = 1.15;
  controls.minAzimuthAngle = -0.15;
  controls.maxAzimuthAngle = 1.35;

  // ---------- Luces ----------
  scene.add(new THREE.HemisphereLight('#c9c6ff', '#2a2230', 1.0));
  const sun = new THREE.DirectionalLight('#fff1dd', 2.1);
  sun.position.set(-10, 22, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 14, bottom: -14, near: 1, far: 60 });
  sun.shadow.bias = -0.0005;
  sun.shadow.radius = 4;
  scene.add(sun);
  const neonA = new THREE.PointLight('#8b7bff', 18, 18, 1.6); neonA.position.set(-3, 4, -7); scene.add(neonA);
  const neonB = new THREE.PointLight('#36e2c8', 14, 16, 1.6); neonB.position.set(9, 4, -6); scene.add(neonB);
  const warm = new THREE.PointLight('#ffb36b', 12, 14, 1.8); warm.position.set(-7, 3, 6); scene.add(warm);

  // ---------- Materiales ----------
  const M = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...opts });
  const mats = {
    floor: M('#2a2838', { roughness: 0.8 }), wall: M('#2c2b3c', { roughness: 0.95 }), trim: M('#2d2b3d'),
    deskTop: M('#e9e6f2', { roughness: 0.45 }), deskLeg: M('#2a2838', { metalness: 0.4, roughness: 0.4 }),
    chair: M('#34324a'), screenOff: M('#0e0e16', { roughness: 0.3 }), monitor: M('#15141f', { metalness: 0.3, roughness: 0.4 }),
    plant: M('#3ccf8e', { roughness: 0.8, flatShading: true }), pot: M('#e9e6f2'), sofa: M('#5b4bd6', { roughness: 0.9 }),
    rug: M('#2a2346', { roughness: 1 }), wood: M('#8a6a4f', { roughness: 0.6 }), black: M('#111', { roughness: 0.3 }),
    pants: M('#262636'), shoe: M('#111118'), eye: M('#111'),
  };
  const box = (w, h, d, mat, x = 0, y = 0, z = 0, parent = scene, shadow = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
  };

  // ---------- Sala ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), mats.floor);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const grid = new THREE.GridHelper(26, 26, '#2c2a3e', '#22212f'); grid.position.y = 0.002; grid.scale.z = 18 / 26; scene.add(grid);
  box(26, 4.2, 0.3, mats.wall, 0, 2.1, -9.15);
  box(0.3, 4.2, 18, mats.wall, -13.15, 2.1, 0);
  box(26, 0.12, 0.34, mats.trim, 0, 4.2, -9.15, scene, false);
  // Ventanas con ciudad de noche
  const cityTex = cityTexture();
  for (const x of [-9.5, -5.5]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2), new THREE.MeshBasicMaterial({ map: cityTex }));
    w.position.set(x, 2.3, -8.99); scene.add(w);
    box(3.4, 0.08, 0.1, mats.trim, x, 1.27, -8.95, scene, false); box(3.4, 0.08, 0.1, mats.trim, x, 3.33, -8.95, scene, false);
  }
  const winL = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ map: cityTex }));
  winL.rotation.y = Math.PI / 2; winL.position.set(-12.99, 2.3, 3.5); scene.add(winL);
  // Tiras de neón
  const neonMat = (c) => new THREE.MeshBasicMaterial({ color: c });
  box(26, 0.05, 0.05, neonMat('#8b7bff'), 0, 0.05, -8.98, scene, false);
  box(0.05, 0.05, 18, neonMat('#36e2c8'), -12.98, 0.05, 0, scene, false);

  // Logo de la agencia en la pared (blanco sobre muro oscuro)
  const logoMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.5), logoMat);
  logo.position.set(1.5, 2.6, -8.98); scene.add(logo);
  let logoKey = '';
  function refreshLogo() {
    const a = store.agencia || {};
    const key = `${a.tieneLogo}-${a.actualizado}-${a.nombre}`;
    if (key === logoKey) return; logoKey = key;
    if (a.tieneLogo) {
      loadLogoCanvas(`/api/agency/logo?v=${a.actualizado}`).then((c) => {
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
        const ar = c.width / c.height;
        const w = Math.min(5, 1.7 * ar), h = w / ar;
        logo.scale.set(w / 4, h / 1.5, 1);
        logoMat.map = t; logoMat.needsUpdate = true;
      }).catch((e) => console.warn('logo', e));
    } else {
      logoMat.map = textTexture(a.nombre || 'AGENCIA IA'); logo.scale.set(1, 1, 1); logoMat.needsUpdate = true;
    }
  }

  // Muro del feed (pantalla grande)
  const feedCanvas = document.createElement('canvas'); feedCanvas.width = 512; feedCanvas.height = 300;
  const feedTex = new THREE.CanvasTexture(feedCanvas); feedTex.colorSpace = THREE.SRGBColorSpace;
  const feedScreen = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.35), new THREE.MeshBasicMaterial({ map: feedTex }));
  feedScreen.position.set(9.2, 2.2, -8.98); scene.add(feedScreen);
  box(4.25, 2.6, 0.08, mats.monitor, 9.2, 2.2, -9.02, scene, false);
  feedScreen.userData.click = 'feed';
  let feedKey = null;
  function refreshFeed() {
    const pend = store.pieces.filter((p) => p.estado === 'pendiente');
    const key = pend.map((p) => p.id).join();
    if (key === feedKey) return; feedKey = key;
    const c = feedCanvas.getContext('2d');
    const g = c.createLinearGradient(0, 0, 512, 300); g.addColorStop(0, '#17123a'); g.addColorStop(1, '#0c2a33');
    c.fillStyle = g; c.fillRect(0, 0, 512, 300);
    c.fillStyle = '#ffffff'; c.font = '700 34px system-ui, sans-serif'; c.fillText('📱 FEED', 28, 58);
    c.fillStyle = pend.length ? '#ffb547' : '#9a98ad'; c.font = '800 96px system-ui, sans-serif';
    c.fillText(String(pend.length), 28, 170);
    c.fillStyle = '#c9c7da'; c.font = '500 26px system-ui, sans-serif';
    c.fillText(pend.length === 1 ? 'pieza por revisar' : 'piezas por revisar', 28, 214);
    const cols = { arte: '#e84393', video: '#0984e3', texto: '#fdcb6e' };
    pend.slice(0, 6).forEach((p, i) => {
      c.fillStyle = cols[p.tipo] || '#8b7bff';
      c.beginPath(); c.roundRect(300 + (i % 3) * 66, 40 + Math.floor(i / 3) * 96, 54, 80, 10); c.fill();
    });
    feedTex.needsUpdate = true;
  }

  // Cafetería
  box(1.1, 1, 3.6, mats.wood, -12.35, 0.5, -1.7);
  box(0.5, 0.7, 0.5, mats.black, -12.35, 1.35, -2.6);
  box(0.12, 0.08, 0.12, new THREE.MeshBasicMaterial({ color: '#ff6b6b' }), -12.1, 1.55, -2.6, scene, false);
  for (const z of [-1.4, -0.9]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.16, 12), mats.deskTop); cup.position.set(-12.3, 1.08, z); scene.add(cup); }

  // Sala de descanso
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40), mats.rug); rug.rotation.x = -Math.PI / 2; rug.position.set(-6, 0.01, 6); rug.receiveShadow = true; scene.add(rug);
  box(3.4, 0.5, 1, mats.sofa, -6, 0.35, 7.4); box(3.4, 0.8, 0.3, mats.sofa, -6, 0.75, 7.85); box(0.3, 0.7, 1, mats.sofa, -7.75, 0.5, 7.4); box(0.3, 0.7, 1, mats.sofa, -4.25, 0.5, 7.4);
  box(1.4, 0.35, 0.8, mats.wood, -6, 0.2, 5.6);

  // Plantas
  for (const [x, z, s] of [[-12.2, -8.2, 1.3], [12, -8.2, 1.2], [-12.2, 7.8, 1.1], [3.8, -8.2, 0.9], [11.8, 7.6, 1.2]]) plant(x, z, s);
  function plant(x, z, s) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.6, 16), mats.pot); pot.position.y = 0.3; pot.castShadow = true; g.add(pot);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 - i * 0.04, 0), mats.plant);
      leaf.position.set(Math.sin(i * 2.1) * 0.18, 0.85 + i * 0.22, Math.cos(i * 2.1) * 0.18); leaf.castShadow = true; g.add(leaf);
    }
  }

  // ---------- Escritorios ----------
  const screens = {};
  function desk(x, z, id, big = false) {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    const w = big ? 2.8 : 2.0;
    box(w, 0.08, 1.0, mats.deskTop, 0, 0.76, 0, g);
    for (const sx of [-1, 1]) box(0.06, 0.74, 0.9, mats.deskLeg, sx * (w / 2 - 0.08), 0.37, 0, g);
    // Monitor a un lado, para que se vea la cara del personaje
    const mx = big ? -0.85 : -0.55;
    box(0.06, 0.32, 0.06, mats.deskLeg, mx, 0.95, 0.15, g);
    const mon = box(0.78, 0.48, 0.05, mats.monitor, mx, 1.28, 0.15, g);
    mon.rotation.y = Math.PI + 0.35;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4), mats.screenOff.clone());
    scr.position.set(mx + 0.01, 1.28, 0.12); scr.rotation.y = Math.PI + 0.35; g.add(scr);
    box(0.5, 0.02, 0.18, mats.monitor, 0.05, 0.81, 0.2, g);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 10), M('#8b7bff')); mug.position.set(0.7 * (big ? 1.4 : 1), 0.86, 0.1); g.add(mug);
    // Silla detrás
    const chair = new THREE.Group(); chair.position.set(0, 0, -0.75); g.add(chair);
    box(0.62, 0.08, 0.6, mats.chair, 0, 0.48, 0, chair); box(0.62, 0.62, 0.08, mats.chair, 0, 0.82, -0.28, chair);
    box(0.06, 0.44, 0.06, mats.deskLeg, 0, 0.24, 0, chair);
    // Luz de pantalla
    const glow = new THREE.PointLight('#7fd2ff', 0, 2.4, 2); glow.position.set(mx, 1.3, -0.2); g.add(glow);
    if (id) screens[id] = { scr, glow };
    return g;
  }
  const deskOf = {};
  store.roster.forEach((a, i) => {
    const d = DESKS[a.id] || EXTRA_DESKS[i % EXTRA_DESKS.length];
    deskOf[a.id] = d; desk(d.x, d.z, a.id);
  });
  desk(BOSS.x, BOSS.z - 0.75, 'boss', true).rotation.y = Math.PI;

  // ---------- Personajes ----------
  function makeCharacter(look) {
    const g = new THREE.Group();
    const skin = M(look.piel, { roughness: 0.6 });
    const shirt = M(look.camisa, { roughness: 0.65 });
    const hair = M(look.pelo, { roughness: 0.8 });
    const part = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    const legs = [-0.12, 0.12].map((x) => {
      const pivot = new THREE.Group(); pivot.position.set(x, 0.78, 0); g.add(pivot);
      part(new THREE.CapsuleGeometry(0.1, 0.5, 4, 10), mats.pants, 0, -0.38, 0, pivot);
      part(new THREE.BoxGeometry(0.17, 0.08, 0.28), mats.shoe, 0, -0.74, 0.05, pivot);
      return pivot;
    });
    const torso = part(new THREE.CapsuleGeometry(0.27, 0.36, 6, 16), shirt, 0, 1.12, 0);
    torso.scale.set(1, 1, 0.78);
    const arms = [-0.36, 0.36].map((x) => {
      const pivot = new THREE.Group(); pivot.position.set(x, 1.34, 0); g.add(pivot);
      part(new THREE.CapsuleGeometry(0.075, 0.4, 4, 10), shirt, 0, -0.25, 0, pivot);
      part(new THREE.SphereGeometry(0.075, 10, 8), skin, 0, -0.5, 0, pivot);
      return pivot;
    });
    const head = new THREE.Group(); head.position.set(0, 1.68, 0); g.add(head);
    part(new THREE.SphereGeometry(0.25, 24, 18), skin, 0, 0, 0, head);
    for (const x of [-0.085, 0.085]) part(new THREE.SphereGeometry(0.032, 10, 8), mats.eye, x, 0.02, 0.225, head);
    const cap = (r, color = hair) => part(new THREE.SphereGeometry(r, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), color, 0, 0.03, -0.01, head);
    switch (look.peinado) {
      case 'largo': cap(0.27); part(new THREE.BoxGeometry(0.5, 0.5, 0.16), hair, 0, -0.2, -0.16, head); break;
      case 'rizado': cap(0.27); for (let i = 0; i < 9; i++) part(new THREE.SphereGeometry(0.1, 8, 6), hair, Math.cos(i * 0.7) * 0.22, 0.16 + Math.sin(i * 1.3) * 0.04, Math.sin(i * 0.7) * 0.16 - 0.05, head); break;
      case 'moño': cap(0.265); part(new THREE.SphereGeometry(0.12, 12, 10), hair, 0, 0.27, -0.1, head); break;
      case 'gorra': { const c = M('#e17055'); cap(0.275, c); const brim = part(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 20, 1, false, -Math.PI / 2, Math.PI), c, 0, 0.06, 0.12, head); brim.rotation.y = Math.PI; break; }
      default: cap(0.265);
    }
    // Indicador sobre la cabeza
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), new THREE.MeshBasicMaterial({ color: '#ffb547', transparent: true, opacity: 0.0, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
    return { g, legs, arms, head, torso, ring };
  }

  const chars = {};
  store.roster.forEach((a) => {
    const c = makeCharacter(a.look);
    const d = deskOf[a.id];
    c.g.position.set(d.x, 0, d.z - 0.75);
    c.g.traverse((o) => { o.userData.agent = a.id; });
    scene.add(c.g);
    chars[a.id] = { ...c, id: a.id, desk: d, path: [], target: null, seated: true, walk: 0, t: Math.random() * 10, coffeeUntil: 0, nextCoffee: performance.now() + 8000 + Math.random() * 25000 };
  });
  // Tú (el jefe), de espaldas, mirando a tu equipo
  const boss = makeCharacter({ camisa: '#14141c', piel: '#e0ac69', pelo: '#1b1b1b', peinado: 'corto' });
  boss.g.position.set(BOSS.x, 0, BOSS.z); boss.g.rotation.y = Math.PI; scene.add(boss.g);
  boss.g.traverse((o) => { o.userData.boss = true; });
  sitPose(boss, true);

  function sitPose(c, on) {
    c.legs.forEach((l) => { l.rotation.x = on ? -Math.PI / 2 : 0; });
    c.g.children.forEach(() => {});
    c.g.position.y = on ? -0.3 : 0;
  }

  // ---------- Comportamiento ----------
  function spotFor(ch) {
    const st = store.agents[ch.id] || {};
    const reqs = store.requests.filter((r) => r.estado === 'pendiente');
    const ri = reqs.findIndex((r) => r.agente === ch.id);
    if (ri >= 0) { const s = BOSS_SLOTS[ri % BOSS_SLOTS.length]; return { kind: 'boss', x: s.x, z: s.z, entry: s, face: Math.atan2(BOSS.x - s.x, BOSS.z - s.z) }; }
    if (pendingPieces(ch.id).length) {
      const i = Object.keys(chars).filter((id) => pendingPieces(id).length).indexOf(ch.id);
      const s = FEED_SPOTS[i % FEED_SPOTS.length]; return { kind: 'feed', x: s.x, z: s.z, entry: s, face: Math.PI };
    }
    const now = performance.now();
    if (!st.estado || st.estado === 'libre') {
      if (now > ch.nextCoffee && !ch.coffeeUntil) { ch.coffeeUntil = now + 9000; ch.nextCoffee = now + 35000 + Math.random() * 40000; }
      if (ch.coffeeUntil > now) { const i = Object.keys(chars).indexOf(ch.id) % COFFEE_SPOTS.length; const s = COFFEE_SPOTS[i]; return { kind: 'coffee', x: s.x, z: s.z, entry: s, face: -Math.PI / 2 }; }
      ch.coffeeUntil = 0;
    } else ch.coffeeUntil = 0;
    const d = ch.desk;
    return { kind: 'desk', x: d.x, z: d.z - 0.75, entry: { x: d.x + 1.5, z: d.z - 0.75 }, face: 0 };
  }

  function route(ch, t) {
    const p = ch.g.position;
    const pts = [];
    if (ch.seated) pts.push({ x: ch.desk.x + 1.5, z: p.z });
    const sx = pts.length ? pts[0].x : p.x;
    pts.push({ x: sx, z: CORRIDOR }, { x: t.entry.x, z: CORRIDOR }, { x: t.entry.x, z: t.entry.z }, { x: t.x, z: t.z });
    return pts;
  }

  function step(dt, now) {
    for (const ch of Object.values(chars)) {
      ch.t += dt;
      const t = spotFor(ch);
      if (!ch.target || ch.target.kind !== t.kind || ch.target.x !== t.x || ch.target.z !== t.z) {
        ch.target = t; ch.path = route(ch, t);
        if (ch.seated) { ch.seated = false; sitPose(ch, false); }
      }
      const p = ch.g.position;
      const wp = ch.path[0];
      if (wp) {
        const dx = wp.x - p.x, dz = wp.z - p.z, d = Math.hypot(dx, dz), v = 2.4 * dt;
        if (d <= v) { p.x = wp.x; p.z = wp.z; ch.path.shift(); }
        else {
          p.x += (dx / d) * v; p.z += (dz / d) * v;
          const want = Math.atan2(dx, dz);
          ch.g.rotation.y += angleDiff(want, ch.g.rotation.y) * Math.min(1, dt * 12);
        }
        ch.walk += dt * 9;
        const sw = Math.sin(ch.walk) * 0.6;
        ch.legs[0].rotation.x = sw; ch.legs[1].rotation.x = -sw;
        ch.arms[0].rotation.x = -sw * 0.8; ch.arms[1].rotation.x = sw * 0.8;
        p.y = Math.abs(Math.sin(ch.walk)) * 0.05;
      } else {
        ch.g.rotation.y += angleDiff(t.face, ch.g.rotation.y) * Math.min(1, dt * 8);
        const st = store.agents[ch.id] || {};
        if (t.kind === 'desk') {
          if (!ch.seated) { ch.seated = true; sitPose(ch, true); }
          const typing = st.estado === 'trabajando';
          ch.arms[0].rotation.x = typing ? -1.1 + Math.sin(ch.t * 18) * 0.12 : -0.2;
          ch.arms[1].rotation.x = typing ? -1.1 + Math.cos(ch.t * 18) * 0.12 : -0.2;
          ch.head.rotation.y = typing ? -0.35 + Math.sin(ch.t * 0.7) * 0.08 : Math.sin(ch.t * 0.4) * 0.3;
        } else {
          ch.legs.forEach((l) => (l.rotation.x = 0)); p.y = 0;
          const waving = t.kind === 'boss';
          ch.arms[1].rotation.x = waving ? -2.6 + Math.sin(ch.t * 7) * 0.25 : t.kind === 'coffee' ? -1.3 : 0;
          ch.arms[1].rotation.z = waving ? 0.25 : 0;
          ch.arms[0].rotation.x = 0;
          ch.head.rotation.y = Math.sin(ch.t * 0.8) * 0.2;
          ch.torso.scale.y = 1 + Math.sin(ch.t * 2) * 0.012;
        }
      }
      // Anillo de alerta en el piso
      const alert = pendingReqs(ch.id).length > 0;
      ch.ring.material.opacity = alert ? 0.55 + Math.sin(now / 180) * 0.35 : 0;
      // Pantalla encendida si trabaja
      const sc = screens[ch.id];
      if (sc) {
        const on = (store.agents[ch.id] || {}).estado === 'trabajando';
        sc.scr.material.emissive = new THREE.Color(on ? '#5ec8ff' : '#000000');
        sc.scr.material.emissiveIntensity = on ? 0.9 + Math.sin(now / 160 + ch.t) * 0.15 : 0;
        sc.glow.intensity = on ? 2.2 : 0;
      }
    }
    const bs = screens.boss;
    if (bs) { const n = store.requests.some((r) => r.estado === 'pendiente'); bs.scr.material.emissive = new THREE.Color(n ? '#ffb547' : '#3a3560'); bs.scr.material.emissiveIntensity = n ? 0.8 + Math.sin(now / 200) * 0.2 : 0.5; }
    boss.arms[0].rotation.x = -1.1 + Math.sin(now / 90) * 0.1; boss.arms[1].rotation.x = -1.1 + Math.cos(now / 90) * 0.1;
  }

  // ---------- Etiquetas HTML (nítidas en cualquier pantalla) ----------
  const tags = {};
  const v3 = new THREE.Vector3();
  function tagFor(id) {
    if (tags[id]) return tags[id];
    const el = document.createElement('div');
    el.className = 'atag';
    el.innerHTML = '<div class="bub"></div><div class="nm"></div>';
    el.onclick = (e) => { e.stopPropagation(); id === 'boss' ? onBoss() : onAgent(id); };
    overlay.append(el);
    return (tags[id] = el);
  }
  function placeTags() {
    const w = container.clientWidth, h = container.clientHeight;
    const small = w < 640;
    const list = [...Object.values(chars).map((c) => ({ id: c.id, obj: c.g, y: c.seated ? 2.0 : 2.3 })), { id: 'boss', obj: boss.g, y: 2.0 }];
    for (const it of list) {
      const el = tagFor(it.id);
      v3.set(it.obj.position.x, it.y, it.obj.position.z).project(camera);
      const x = (v3.x * 0.5 + 0.5) * w, y = (-v3.y * 0.5 + 0.5) * h;
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      el.style.zIndex = String(Math.round((1 - v3.z) * 10000));
      let name, bub = '', cls = '';
      if (it.id === 'boss') {
        const n = store.requests.filter((r) => r.estado === 'pendiente').length;
        name = `Tú${n ? ` · ${n}` : ''}`; cls = n ? 'boss alert' : 'boss';
      } else {
        const a = byId(it.id); const st = store.agents[it.id] || {};
        name = a?.nombre || it.id;
        const req = pendingReqs(it.id)[0];
        if (req) {
          const icon = { autorizacion: '🔐', cuestionario: '📝', concepto: '💡' }[req.tipo] || '❓';
          bub = `<b>${icon}</b> ${esc(small ? '' : req.texto)}`; cls = 'alert';
        } else if (pendingPieces(it.id).length) { bub = '📱 Esperando tu swipe'; cls = 'feed'; }
        else if (st.estado === 'trabajando' && st.burbuja) { bub = small ? '💬' : esc(st.burbuja); cls = 'work'; }
        else if (!st.estado || st.estado === 'libre') cls = 'idle';
      }
      const key = `${name}|${bub}|${cls}`;
      if (el.dataset.key !== key) {
        el.dataset.key = key;
        el.className = `atag ${cls}`;
        el.querySelector('.nm').textContent = name;
        const b = el.querySelector('.bub');
        b.innerHTML = bub; b.hidden = !bub;
      }
    }
  }

  // ---------- Clics ----------
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(scene.children, true)[0];
    const o = hit?.object;
    if (o?.userData.agent) onAgent(o.userData.agent);
    else if (o?.userData.boss) onBoss();
    else if (o === feedScreen) onFeed();
  });

  // ---------- Tamaño y bucle ----------
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  // Encuadre automático según el tamaño de la pantalla.
  function resetCamera() {
    const aspect = container.clientWidth / Math.max(1, container.clientHeight);
    const fovV = THREE.MathUtils.degToRad(camera.fov);
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect);
    const portrait = aspect < 1;
    controls.target.set(portrait ? -2.5 : -0.5, 0, portrait ? -1 : -0.5);
    const r = portrait ? 7.6 : 8;
    const d = r / Math.sin(Math.min(fovV, fovH) / 2);
    // En vertical se mira la oficina "a lo largo" para que quepa mejor.
    const dir = (portrait ? new THREE.Vector3(0.85, 0.95, 0.42) : new THREE.Vector3(0.5, 0.68, 0.78)).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, d);
    controls.update();
  }
  new ResizeObserver(resize).observe(container);
  resize(); resetCamera();

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    step(dt, now);
    controls.update();
    renderer.render(scene, camera);
    placeTags();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return { refresh() { refreshLogo(); refreshFeed(); }, resetCamera };
}

// Convierte el logo (PNG, JPG o SVG) en un lienzo con su proporción real.
async function loadLogoCanvas(url) {
  const blob = await (await fetch(url)).blob();
  let ar = null;
  if (blob.type.includes('svg')) {
    const txt = await blob.text();
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(txt);
    if (vb) ar = Number(vb[1]) / Number(vb[2]);
  }
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  ar = ar || (img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 2.5);
  const W = 1024, H = Math.max(64, Math.round(W / ar));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d').drawImage(img, 0, 0, W, H);
  URL.revokeObjectURL(img.src);
  return c;
}

function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

function cityTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 160); g.addColorStop(0, '#1a1446'); g.addColorStop(1, '#3a2266'); x.fillStyle = g; x.fillRect(0, 0, 256, 160);
  for (let i = 0; i < 14; i++) {
    const w = 14 + Math.random() * 24, h = 40 + Math.random() * 100, bx = i * 19 - 6;
    x.fillStyle = '#120f26'; x.fillRect(bx, 160 - h, w, h);
    for (let wy = 160 - h + 6; wy < 156; wy += 9) for (let wx = bx + 3; wx < bx + w - 3; wx += 6) if (Math.random() > 0.55) { x.fillStyle = Math.random() > 0.5 ? '#ffd58a' : '#8be9ff'; x.fillRect(wx, wy, 2, 3); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function textTexture(text) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 384;
  const x = c.getContext('2d');
  x.font = '800 150px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = '#8b7bff'; x.shadowBlur = 40; x.fillStyle = '#ffffff';
  let size = 150; while (x.measureText(text).width > 960 && size > 50) { size -= 10; x.font = `800 ${size}px system-ui, sans-serif`; }
  x.fillText(text, 512, 192);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
